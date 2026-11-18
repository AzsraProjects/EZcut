// Processus principal : fenêtre, accès aux fichiers, FFmpeg. Seul endroit du projet qui parle au système.
// L'interface est considérée comme non fiable : elle affiche des projets qui peuvent venir d'un inconnu.
const { app, BrowserWindow, dialog, ipcMain, net, protocol, session, shell } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pathToFileURL } = require('node:url');

// Les modes développement et test ne sont jamais actifs dans une version installée.
const DEV_URL = app.isPackaged ? '' : process.env.EZCUT_DEV_URL || '';
const AUTOTEST = app.isPackaged ? '' : process.env.EZCUT_AUTOTEST || ''; // JSON { media: [...], out: "..." } : test d'intégration sans interface
const log = require('./logger.cjs');
const control = require('./control.cjs');
// Tests : dossier de données à part (ne touche pas à l'installation de l'utilisateur) et fenêtre masquée.
if (!app.isPackaged && process.env.EZCUT_USERDATA) app.setPath('userData', path.resolve(process.env.EZCUT_USERDATA));
const HEADLESS = !app.isPackaged && process.env.EZCUT_HEADLESS === '1';
const DIST = path.join(__dirname, '..', 'dist');
const APP_ORIGIN = 'app://ezcut';
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ezmedia:; media-src 'self' blob: ezmedia:; connect-src 'self' ezmedia:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'";
const MAX_PROJECT_BYTES = 50e6, MAX_MEDIA = 2000, MAX_SEGMENTS = 5000;
// Pistes de son mixées à l'export : la piste principale, les pistes de son et d'incrustation de base, les pistes ajoutées (12 au plus), avec de la marge.
const MAX_AUDIO_TRACKS = 24;

const EXT = {
  video: ['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v'],
  audio: ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.opus'],
  image: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'],
};
const MIME = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.webm': 'video/webm', '.avi': 'video/x-msvideo',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.opus': 'audio/ogg',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp' };
const kindOf = p => { const e = path.extname(p).toLowerCase(); return Object.keys(EXT).find(k => EXT[k].includes(e)) || null; };
const num = (v, lo, hi, def) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };

/** Programme résolu une fois, en chemin absolu, sans jamais regarder le dossier courant (un projet reçu pourrait y cacher un faux ffmpeg.exe). */
function resolveTool(name, override) {
  if (!app.isPackaged && override && path.isAbsolute(override) && fs.existsSync(override)) return override;
  // FFmpeg livré avec l'application : dans resources/bin une fois installée, dans node_modules en développement.
  const exe = name + (process.platform === 'win32' ? '.exe' : '');
  const bundled = app.isPackaged ? path.join(process.resourcesPath, 'bin', exe)
    : name === 'ffmpeg' ? path.join(__dirname, '..', 'node_modules', 'ffmpeg-static', exe)
    : path.join(__dirname, '..', 'node_modules', 'ffprobe-static', 'bin', process.platform, process.arch, exe);
  try { if (fs.statSync(bundled).isFile()) return bundled; } catch { /* sinon : celui du système */ }
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat'] : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir || !path.isAbsolute(dir)) continue;
    for (const ext of exts) { const f = path.join(dir, name + ext); try { if (fs.statSync(f).isFile()) return f; } catch { /* suivant */ } }
  }
  return null;
}
let FFMPEG = null, FFPROBE = null;

/** Fichiers que l'interface a le droit de lire : uniquement ceux que l'utilisateur a importés, ou acceptés à l'ouverture d'un projet. */
const allowed = new Set();
const mediaUrl = p => 'ezmedia://local/' + encodeURIComponent(p);

/** Fichier local ordinaire à extension média. Refuse les chemins réseau (UNC), relatifs, les dossiers et les liens vers autre chose. */
function localFile(p) {
  if (typeof p !== 'string' || p.length > 1024 || p.includes('\0') || !path.isAbsolute(p)) return null;
  const n = path.normalize(p);
  if (n.startsWith('\\\\') || n.startsWith('//')) return null;
  try {
    const real = fs.realpathSync(n);
    if (real.startsWith('\\\\') || !fs.statSync(real).isFile() || !kindOf(real) || !kindOf(n)) return null;
    return n;
  } catch { return null; }
}

/** Médias déjà importés sur cette machine : un projet qui les réutilise s'ouvre sans question. */
const knownFile = () => path.join(app.getPath('userData'), 'known-media.json');
let known = new Set();
function loadKnown() { try { known = new Set(JSON.parse(fs.readFileSync(knownFile(), 'utf8')).slice(-5000)); } catch { known = new Set(); } }
function remember(paths) {
  if (AUTOTEST) return;
  let changed = false;
  for (const p of paths) if (!known.has(p)) { known.add(p); changed = true; }
  if (changed) try { fs.writeFileSync(knownFile(), JSON.stringify([...known].slice(-5000))); } catch { /* mémoire facultative */ }
}

// Une seule instance : deux fenêtres écraseraient mutuellement leur sauvegarde automatique.
if (!AUTOTEST && !app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });

// La lecture démarre sur un raccourci clavier ou une action de l'interface, pas toujours sur un clic.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: 'ezmedia', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

/** L'interface construite est servie par app://ezcut et confinée au dossier dist : pas d'accès à file://. */
async function serveApp(request) {
  let rel = decodeURIComponent(new URL(request.url).pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.join(DIST, rel), back = path.relative(DIST, file);
  if (back.startsWith('..') || path.isAbsolute(back)) return new Response('forbidden', { status: 403 });
  try {
    const res = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(res.headers);
    headers.set('Content-Security-Policy', CSP);
    return new Response(res.body, { status: res.status, headers });
  } catch { return new Response('not found', { status: 404 }); }
}

function serveMedia(request) {
  const file = decodeURIComponent(new URL(request.url).pathname.slice(1));
  if (!allowed.has(file)) return new Response('forbidden', { status: 403 });
  let stat;
  try { stat = fs.statSync(file); } catch { return new Response('not found', { status: 404 }); }
  const headers = { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
  const m = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '');
  if (m && (m[1] || m[2])) {
    const start = m[1] ? parseInt(m[1], 10) : Math.max(0, stat.size - parseInt(m[2], 10));
    const end = m[1] && m[2] ? Math.min(parseInt(m[2], 10), stat.size - 1) : stat.size - 1;
    if (start >= stat.size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
    return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': String(end - start + 1) } });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)), { status: 200, headers: { ...headers, 'Content-Length': String(stat.size) } });
}

function run(cmd, args, timeoutMs = 15000) {
  return new Promise(resolve => {
    if (!cmd) return resolve({ code: -1, out: '', err: 'programme introuvable' });
    let out = '', err = '', child;
    try { child = spawn(cmd, args, { windowsHide: true }); } catch (e) { return resolve({ code: -1, out, err: String(e) }); }
    const timer = setTimeout(() => { try { child.kill(); } catch { /* déjà terminé */ } }, timeoutMs);
    child.stdout.on('data', d => { if (out.length < 1e6) out += d; });
    child.stderr.on('data', d => { if (err.length < 1e5) err += d; });
    child.on('error', e => { clearTimeout(timer); resolve({ code: -1, out, err: String(e) }); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, out, err }); });
  });
}

async function probe(file) {
  const kind = kindOf(file);
  allowed.add(file);
  const info = { path: file, url: mediaUrl(file), name: path.basename(file), kind, duration: 0, width: 0, height: 0, hasAudio: kind === 'audio' };
  // -protocol_whitelist file : un fichier piégé ne peut pas faire ouvrir d'autres sources à FFmpeg.
  const r = await run(FFPROBE, ['-v', 'error', '-protocol_whitelist', 'file', '-print_format', 'json', '-show_format', '-show_streams', file]);
  if (r.code !== 0) log.warn('import', 'ffprobe a échoué pour ' + path.basename(file), r.err.trim().slice(0, 400));
  if (r.code === 0) {
    try {
      const j = JSON.parse(r.out), v = (j.streams || []).find(s => s.codec_type === 'video'), a = (j.streams || []).find(s => s.codec_type === 'audio');
      info.duration = kind === 'image' ? 0 : num(j.format?.duration, 0, 86400 * 4, 0);
      info.hasAudio = !!a && kind !== 'image';
      if (v) {
        const rot = Math.abs(parseInt(v.tags?.rotate ?? v.side_data_list?.find(s => s.rotation !== undefined)?.rotation ?? 0, 10)) % 180 === 90;
        info.width = rot ? v.height : v.width; info.height = rot ? v.width : v.height;
      }
    } catch { /* l'interface complétera à partir du fichier lui-même */ }
  }
  return info;
}
/** Valide, dédoublonne, plafonne, puis analyse quatre fichiers à la fois. */
async function probeAll(files) {
  const list = [...new Set((Array.isArray(files) ? files : []).map(localFile).filter(Boolean))].slice(0, MAX_MEDIA);
  const out = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, list.length) }, async () => { while (next < list.length) { const i = next++; out[i] = await probe(list[i]); } }));
  return out;
}

/* ---------- projet ---------- */
let projectPath = null; // fixé uniquement par un dialogue : l'interface ne choisit jamais où écrire
let pendingOpen = null; // fichier choisi dans « Ouvrir », en attente de validation par l'interface

/** Réouverture d'un projet : les médias de son dossier ou déjà connus sont acceptés ; pour les autres, l'utilisateur décide. */
async function relink(win, paths) {
  const files = [...new Set((Array.isArray(paths) ? paths : []).slice(0, MAX_MEDIA).map(localFile).filter(Boolean))];
  const base = projectPath ? path.dirname(projectPath) + path.sep : null;
  const trusted = [], other = [];
  for (const f of files) (allowed.has(f) || known.has(f) || (base && f.startsWith(base)) ? trusted : other).push(f);
  if (other.length) {
    const dirs = [...new Set(other.map(f => path.dirname(f)))];
    const r = await dialog.showMessageBox(win, {
      type: 'question', buttons: ['Autoriser', 'Refuser'], defaultId: 1, cancelId: 1, title: 'Médias du projet',
      message: `Ce projet utilise ${other.length} fichier(s) situé(s) hors de son dossier.`,
      detail: 'Autoriser EZcut à les lire ? N\'acceptez que si vous faites confiance à l\'origine de ce projet.\n\n' + dirs.slice(0, 8).join('\n') + (dirs.length > 8 ? `\n… et ${dirs.length - 8} autre(s) dossier(s)` : ''),
    });
    if (r.response === 0) { trusted.push(...other); remember(other); }
  }
  return probeAll(trusted);
}

/* ---------- encodeurs ---------- */
// Encodeurs matériels essayés dans cet ordre (NVIDIA, Intel, AMD). Un encodeur n'est retenu que s'il encode vraiment une image d'essai.
const HW = ['nvenc', 'qsv', 'amf'];
const hw = { h264: null, hevc: null };
async function detectEncoders() {
  if (!FFMPEG) return;
  for (const codec of ['h264', 'hevc']) for (const kind of HW) {
    const r = await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=640x360:r=30:d=0.2', '-c:v', `${codec}_${kind}`, '-f', 'null', '-'], 8000);
    if (r.code === 0) { hw[codec] = kind; break; }
  }
}
function videoArgs(codec, software) {
  const kind = software ? null : hw[codec], tag = codec === 'hevc' ? ['-tag:v', 'hvc1'] : [];
  if (kind === 'nvenc') return ['-c:v', codec + '_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', codec === 'hevc' ? '24' : '21', '-b:v', '0', ...tag];
  if (kind === 'qsv') return ['-c:v', codec + '_qsv', '-global_quality', codec === 'hevc' ? '24' : '21', ...tag];
  if (kind === 'amf') return ['-c:v', codec + '_amf', '-quality', 'quality', '-rc', 'cqp', '-qp_i', '20', '-qp_p', '22', ...tag];
  return codec === 'hevc' ? ['-c:v', 'libx265', '-preset', 'fast', '-crf', '23', ...tag] : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20'];
}

/* ---------- sauvegarde automatique ---------- */
const autosaveFile = () => path.join(app.getPath('userData'), 'autosave.json');
let dirty = false, closing = false;

/* ---------- export ---------- */
let job = null, starting = false, lastExport = null, exportArgs = null, controlOut = null;

function audioGraph(tracks, total) {
  // Chaque piste devient une suite de segments (son du fichier ou silence), puis les pistes sont mixées.
  const inputs = [], filters = [], mixed = [];
  let n = 1, count = 0; // l'entrée 0 est la vidéo brute
  (Array.isArray(tracks) ? tracks.slice(0, MAX_AUDIO_TRACKS) : []).forEach((segs, ti) => {
    const labels = [];
    (Array.isArray(segs) ? segs : []).forEach((s, si) => {
      if (++count > MAX_SEGMENTS || !s) return;
      const lab = `t${ti}s${si}`, dur = num(s.dur, 0.01, 86400, 0.01);
      if (typeof s.path === 'string' && allowed.has(s.path)) {
        inputs.push('-protocol_whitelist', 'file', '-ss', String(num(s.in, 0, 86400 * 4, 0)), '-t', String(dur), '-i', s.path);
        const fi = num(s.fadeIn, 0, dur, 0), fo = num(s.fadeOut, 0, dur - fi, 0);
        const fades = (fi > 0 ? `,afade=t=in:st=0:d=${fi}` : '') + (fo > 0 ? `,afade=t=out:st=${Math.max(0, dur - fo)}:d=${fo}` : '');
        filters.push(`[${n}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${dur},volume=${num(s.volume, 0, 4, 1)}${fades}[${lab}]`);
        n++;
      } else filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${dur}[${lab}]`);
      labels.push(`[${lab}]`);
    });
    if (labels.length) { filters.push(`${labels.join('')}concat=n=${labels.length}:v=0:a=1[trk${ti}]`); mixed.push(`[trk${ti}]`); }
  });
  if (!mixed.length) filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${total}[aout]`);
  else if (mixed.length === 1) filters.push(`${mixed[0]}apad,atrim=duration=${total}[aout]`);
  else filters.push(`${mixed.join('')}amix=inputs=${mixed.length}:duration=longest:normalize=0,apad,atrim=duration=${total}[aout]`);
  return { inputs, filters };
}

async function exportStart(win, req) {
  if (job || starting) return { ok: false, error: 'Un export est déjà en cours.' };
  if (!FFMPEG) return { ok: false, error: 'FFmpeg est introuvable. Installez-le et vérifiez qu\'il est dans le PATH.' };
  const width = req.width | 0, height = req.height | 0, fps = Number(req.fps), frames = req.frames | 0;
  if (width < 16 || height < 16 || width > 8192 || height > 8192 || width % 2 || height % 2 || !(fps >= 1 && fps <= 240) || frames < 1 || frames > 240 * 3600 * 12) return { ok: false, error: 'Paramètres d\'export invalides.' };
  starting = true;
  try {
    let out = AUTOTEST && typeof req.outPath === 'string' ? req.outPath : null;
    if (!out && controlOut) { out = controlOut; controlOut = null; } // export demandé par le lien de pilotage : chemin déjà validé
    if (!out) {
      const safe = String(req.name || 'EZcut').slice(0, 120).replace(/[\\/:*?"<>|]/g, '_');
      const r = await dialog.showSaveDialog(win, { title: 'Exporter la vidéo', defaultPath: path.join(app.getPath('videos'), safe + '.mp4'), filters: [{ name: 'Vidéo MP4', extensions: ['mp4'] }] });
      if (r.canceled || !r.filePath) return { ok: false };
      out = r.filePath;
    }
    const total = frames / fps, { inputs, filters } = audioGraph(req.audio, total);
    const args = ['-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-r', String(fps), '-i', 'pipe:0', ...inputs,
      '-filter_complex', ['[0:v]vflip,format=yuv420p[vout]', ...filters].join(';'), '-map', '[vout]', '-map', '[aout]',
      ...videoArgs(req.codec === 'hevc' ? 'hevc' : 'h264', req.software === true), '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', String(total), out];
    let child;
    log.info('export', `début ${width}x${height} ${fps} i/s, ${frames} images`, { encodeur: args[args.indexOf('-c:v') + 1], sortie: out });
    try { child = spawn(FFMPEG, args, { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] }); } catch (e) { log.error('export', 'FFmpeg n\'a pas pu démarrer', e); return { ok: false, error: 'FFmpeg n\'a pas pu démarrer : ' + e.message }; }
    exportArgs = args;
    const j = job = { child, out, err: '', failed: null, closed: null, size: width * height * 4 };
    child.stderr.on('data', d => { j.err = (j.err + d).slice(-4000); });
    child.stdin.on('error', e => { j.failed = j.failed || e.message; });
    j.closed = new Promise(resolve => {
      child.on('error', e => { j.failed = 'FFmpeg n\'a pas pu démarrer : ' + e.message; resolve(-1); });
      child.on('close', code => resolve(code));
    });
    return { ok: true, path: out };
  } finally { starting = false; }
}

async function exportFrame(pixels) {
  const j = job;
  if (!j) throw new Error('Aucun export en cours.');
  if (j.failed) throw new Error(j.failed + ' ' + j.err);
  const buf = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  if (buf.length !== j.size) throw new Error('Taille d\'image inattendue.');
  if (!j.child.stdin.write(buf)) await new Promise(resolve => { j.child.stdin.once('drain', resolve); j.closed.then(resolve); });
}

async function exportFinish() {
  const j = job;
  if (!j) return { ok: false, error: 'Aucun export en cours.' };
  j.child.stdin.end();
  const code = await j.closed;
  job = null;
  if (code !== 0 || j.failed) { log.error('export', `FFmpeg a échoué (code ${code})`, { erreur: j.failed, stderr: j.err.trim(), arguments: exportArgs }); return { ok: false, error: (j.failed || 'FFmpeg a échoué.') + ' ' + j.err.trim() }; }
  log.info('export', 'terminé', { sortie: j.out });
  lastExport = j.out;
  return { ok: true, path: j.out };
}

async function exportCancel() {
  const j = job;
  if (!j) return;
  job = null;
  try { j.child.stdin.destroy(); j.child.kill(); } catch { /* déjà terminé */ }
  await j.closed;
  try { fs.unlinkSync(j.out); } catch { /* rien à supprimer */ }
}

/* ---------- mises à jour ---------- */
// Les versions publiées sur GitHub Releases. Rien n'est téléchargé ni installé sans action de l'utilisateur.
let updater = null;
function setupUpdates(win) {
  if (!app.isPackaged || AUTOTEST) return;
  try { updater = require('electron-updater').autoUpdater; } catch { return; }
  updater.autoDownload = false; updater.autoInstallOnAppQuit = false;
  const send = state => { if (!win.isDestroyed()) win.webContents.send('update:state', state); };
  const notes = n => String(Array.isArray(n) ? n.map(x => x.note || '').join('\n') : n || '').replace(/<[^>]+>/g, '').slice(0, 4000);
  updater.on('update-available', info => send({ status: 'available', version: String(info.version), notes: notes(info.releaseNotes) }));
  updater.on('download-progress', p => send({ status: 'downloading', percent: Math.round(p.percent) }));
  updater.on('update-downloaded', info => send({ status: 'ready', version: String(info.version) }));
  updater.on('error', () => send({ status: 'error' }));
  const check = () => updater.checkForUpdates().catch(() => {}); // hors ligne : on réessaiera
  check(); setInterval(check, 24 * 3600e3);
}

/* ---------- lien de pilotage (Claude) ---------- */
// Voir electron/control.cjs et tools/mcp. Les commandes qui touchent aux fichiers sont traitées ici ; les autres sont transmises à l'interface.
let mainWin = null, callId = 0;
const waiting = new Map();
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const readSettings = () => { try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; } };
const writeSettings = patch => { try { fs.writeFileSync(settingsFile(), JSON.stringify({ ...readSettings(), ...patch })); } catch (e) { log.warn('réglages', 'écriture impossible', e); } };

/** Transmet une commande à l'interface et attend sa réponse. */
function forward(method, params, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    if (!mainWin || mainWin.isDestroyed()) return reject(new Error('La fenêtre d\'EZcut est fermée.'));
    const id = ++callId;
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error('L\'application n\'a pas répondu à temps.')); }, timeoutMs);
    waiting.set(id, { resolve, reject, timer });
    mainWin.webContents.send('control:request', { id, method, params });
  });
}
/** Chemin d'écriture demandé par l'assistant : absolu, local, de l'extension attendue, dans un dossier qui existe. */
function writablePath(p, ext, overwrite) {
  if (typeof p !== 'string' || p.length > 1024 || p.includes('\0') || !path.isAbsolute(p)) throw new Error('Le chemin doit être absolu.');
  const n = path.normalize(p);
  if (n.startsWith('\\\\') || n.startsWith('//')) throw new Error('Les chemins réseau ne sont pas acceptés.');
  if (path.extname(n).toLowerCase() !== ext) throw new Error('Le fichier doit se terminer par ' + ext + '.');
  if (!fs.existsSync(path.dirname(n))) throw new Error('Le dossier de destination n\'existe pas.');
  if (fs.existsSync(n) && overwrite !== true) throw new Error('Ce fichier existe déjà : choisissez un autre nom, ou demandez explicitement à le remplacer (overwrite).');
  return n;
}
async function controlCall(method, params) {
  switch (method) {
    case 'ping': return { app: 'EZcut', version: app.getVersion() };
    case 'logs': return { file: log.file, text: log.tail(Number(params.lines) || 200) };
    case 'import': {
      const files = await probeAll(params.paths);
      remember(files.map(f => f.path));
      const asked = Array.isArray(params.paths) ? params.paths.length : 0;
      return { ...(await forward('registerMedia', { files })), refused: asked - files.length };
    }
    case 'export': {
      if (job || starting) throw new Error('Un export est déjà en cours.');
      const out = writablePath(params.outPath, '.mp4', params.overwrite);
      controlOut = out;
      try { return await forward('export', { height: params.height, fps: params.fps, codec: params.codec }, 4 * 3600e3); } finally { controlOut = null; }
    }
    case 'save': {
      if (params.path !== undefined) projectPath = writablePath(params.path, '.ezcut', params.overwrite !== false);
      if (!projectPath) throw new Error('Ce projet n\'a pas encore d\'emplacement : indiquez path (fichier .ezcut).');
      const { json } = await forward('serialise', {});
      if (typeof json !== 'string' || json.length > MAX_PROJECT_BYTES) throw new Error('Projet trop volumineux.');
      fs.writeFileSync(projectPath + '.tmp', json, 'utf8'); fs.renameSync(projectPath + '.tmp', projectPath);
      await forward('markSaved', { path: projectPath });
      return { path: projectPath };
    }
    case 'open': {
      const file = localProject(params.path);
      pendingOpen = file;
      return forward('loadProject', { json: fs.readFileSync(file, 'utf8'), path: file });
    }
    default: return forward(method, params, method === 'screenshot' || method === 'mediaPreview' ? 120000 : 60000);
  }
}
function localProject(p) {
  if (typeof p !== 'string' || !path.isAbsolute(p) || path.extname(p).toLowerCase() !== '.ezcut') throw new Error('Indiquez le chemin absolu d\'un fichier .ezcut.');
  const n = path.normalize(p);
  if (n.startsWith('\\\\') || !fs.existsSync(n) || !fs.statSync(n).isFile() || fs.statSync(n).size > MAX_PROJECT_BYTES) throw new Error('Projet introuvable ou trop volumineux.');
  return n;
}
async function setControl(on) {
  if (on) await control.start(app.getPath('userData'), controlCall); else control.stop();
  writeSettings({ control: !!on });
  return control.status();
}

/* ---------- fenêtre ---------- */
function createWindow() {
  const win = new BrowserWindow({
    width: 1500, height: 920, minWidth: 1100, minHeight: 700, backgroundColor: '#101216', show: !AUTOTEST && !HEADLESS, title: 'EZcut', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  win.setMenuBarVisibility(false);
  // Aucune navigation ni fenêtre externe depuis l'interface.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  // Ce qui se passe mal dans l'interface arrive dans le journal, pas seulement dans une console que personne ne regarde.
  win.webContents.on('console-message', (_e, level, message, line, source) => { if (level >= 2) log[level >= 3 ? 'error' : 'warn']('interface', message, `${String(source).split('/').pop()}:${line}`); });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => log.error('interface', `chargement impossible (${code} ${desc})`, url));
  win.webContents.on('render-process-gone', (_e, d) => log.error('interface', 'le processus d\'affichage s\'est arrêté', d));
  mainWin = win;
  // Fermeture avec des modifications non enregistrées : l'utilisateur choisit.
  win.on('close', e => {
    if (closing || AUTOTEST) return;
    if (job && dialog.showMessageBoxSync(win, { type: 'warning', buttons: ['Continuer l\'export', 'Annuler l\'export et quitter'], defaultId: 0, cancelId: 0, title: 'EZcut', message: 'Un export est en cours.', detail: 'Quitter maintenant l\'interrompt : la vidéo ne sera pas créée.' }) === 0) { e.preventDefault(); return; }
    if (!dirty) return;
    e.preventDefault();
    const r = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Enregistrer', 'Ne pas enregistrer', 'Annuler'], defaultId: 0, cancelId: 2, title: 'EZcut', message: 'Enregistrer les modifications du projet ?', detail: 'Les modifications non enregistrées seront perdues.' });
    if (r === 0) win.webContents.send('app:save-and-close');
    else if (r === 1) { closing = true; try { fs.unlinkSync(autosaveFile()); } catch { /* rien à supprimer */ } win.close(); }
  });
  win.loadURL(DEV_URL || APP_ORIGIN + '/index.html');
  return win;
}

app.whenReady().then(() => {
  log.init(path.join(app.getPath('userData'), 'logs'), { echo: !app.isPackaged && !AUTOTEST });
  FFMPEG = resolveTool('ffmpeg', process.env.EZCUT_FFMPEG);
  FFPROBE = resolveTool('ffprobe', process.env.EZCUT_FFPROBE);
  log.info('démarrage', `EZcut ${app.getVersion()}`, { electron: process.versions.electron, système: `${process.platform} ${require('node:os').release()} ${process.arch}`, installé: app.isPackaged, ffmpeg: !!FFMPEG, ffprobe: !!FFPROBE });
  process.on('uncaughtException', e => log.error('principal', 'exception non interceptée', e));
  process.on('unhandledRejection', e => log.error('principal', 'promesse rejetée sans traitement', e));
  app.on('child-process-gone', (_e, d) => { if (d.reason !== 'clean-exit') log.error('principal', 'un processus auxiliaire s\'est arrêté', d); });
  loadKnown();
  const encodersReady = detectEncoders().then(() => log.info('démarrage', 'encodeurs matériels', hw));
  protocol.handle('app', serveApp);
  protocol.handle('ezmedia', serveMedia);
  // L'application n'a besoin d'aucune permission web (caméra, micro, position…).
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  const winOf = e => BrowserWindow.fromWebContents(e.sender);
  /** Enregistre une commande en n'acceptant que le cadre principal de notre propre page. */
  const handle = (channel, fn) => ipcMain.handle(channel, (e, ...args) => {
    const url = e.senderFrame?.url || '';
    if (e.senderFrame !== e.sender.mainFrame || !(url.startsWith(APP_ORIGIN + '/') || (DEV_URL && url.startsWith(DEV_URL)))) throw new Error('émetteur refusé');
    return fn(e, ...args);
  });

  handle('media:pick', async e => {
    const r = await dialog.showOpenDialog(winOf(e), { title: 'Importer des médias', properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Médias', extensions: [...EXT.video, ...EXT.audio, ...EXT.image].map(x => x.slice(1)) }] });
    if (r.canceled) return [];
    const out = await probeAll(r.filePaths); remember(out.map(f => f.path));
    return out;
  });
  // Fichiers déposés par l'utilisateur dans la fenêtre.
  handle('media:import', async (_e, paths) => { const out = await probeAll(paths); remember(out.map(f => f.path)); return out; });
  handle('media:reveal', (_e, p) => { if (typeof p === 'string' && allowed.has(p) && fs.existsSync(p)) shell.showItemInFolder(p); });
  handle('media:relink', (e, paths) => relink(winOf(e), paths));
  // Capture de l'aperçu : l'interface fournit l'image, l'emplacement vient toujours du dialogue.
  handle('snapshot:save', async (e, bytes, name) => {
    const buf = bytes instanceof Uint8Array ? Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) : null;
    if (!buf || buf.length < 8 || buf.length > 96 * 1024 * 1024 || buf.readUInt32BE(0) !== 0x89504e47) return null; // PNG uniquement
    const safe = String(name || 'EZcut').slice(0, 120).replace(/[\\/:*?"<>|]/g, '_');
    const r = await dialog.showSaveDialog(winOf(e), { title: 'Enregistrer l\'image', defaultPath: path.join(app.getPath('pictures'), safe + '.png'), filters: [{ name: 'Image PNG', extensions: ['png'] }] });
    if (r.canceled || !r.filePath) return null;
    const file = /\.png$/i.test(r.filePath) ? r.filePath : r.filePath + '.png';
    fs.writeFileSync(file, buf);
    log.info('capture', 'image enregistrée', { octets: buf.length });
    return file;
  });
  handle('project:new', () => { projectPath = null; allowed.clear(); });
  // Avant de remplacer un projet modifié (nouveau, ouvrir, restaurer) : enregistrer, abandonner ou renoncer.
  handle('project:confirm-discard', e => ['save', 'discard', 'cancel'][dialog.showMessageBoxSync(winOf(e), { type: 'question', buttons: ['Enregistrer', 'Ne pas enregistrer', 'Annuler'], defaultId: 0, cancelId: 2, title: 'EZcut', message: 'Enregistrer les modifications du projet en cours ?', detail: 'Sans enregistrement, elles seront perdues.' })]);
  handle('project:save', async (e, json, saveAs) => {
    if (typeof json !== 'string' || json.length > MAX_PROJECT_BYTES) return null;
    if (saveAs === true || !projectPath) {
      const r = await dialog.showSaveDialog(winOf(e), { title: 'Enregistrer le projet', defaultPath: projectPath || path.join(app.getPath('documents'), 'Projet.ezcut'), filters: [{ name: 'Projet EZcut', extensions: ['ezcut'] }] });
      if (r.canceled || !r.filePath) return null;
      projectPath = r.filePath;
    }
    // Écriture atomique : un plantage en cours d'écriture ne détruit pas le projet existant.
    fs.writeFileSync(projectPath + '.tmp', json, 'utf8'); fs.renameSync(projectPath + '.tmp', projectPath);
    return projectPath;
  });
  handle('project:open', async e => {
    const r = await dialog.showOpenDialog(winOf(e), { title: 'Ouvrir un projet', properties: ['openFile'], filters: [{ name: 'Projet EZcut', extensions: ['ezcut'] }] });
    const file = r.canceled ? null : r.filePaths[0];
    if (!file) return null;
    if (fs.statSync(file).size > MAX_PROJECT_BYTES) return { path: file, json: '' };
    pendingOpen = file;
    return { path: file, json: fs.readFileSync(file, 'utf8') };
  });
  // Le fichier était bien un projet : il devient le projet courant. Sinon, le projet en cours et ses médias restent intacts.
  handle('project:opened', () => { if (!pendingOpen) return; projectPath = pendingOpen; pendingOpen = null; allowed.clear(); });
  handle('export:encoders', async () => { await encodersReady; return { h264: hw.h264, hevc: hw.hevc }; });
  handle('project:dirty', (_e, v) => { dirty = v === true; });
  handle('app:close', e => { closing = true; try { fs.unlinkSync(autosaveFile()); } catch { /* rien à supprimer */ } winOf(e)?.close(); });
  handle('autosave:write', (_e, json) => {
    if (typeof json !== 'string' || json.length > MAX_PROJECT_BYTES) return;
    fs.writeFileSync(autosaveFile() + '.tmp', JSON.stringify({ savedAt: Date.now(), json }), 'utf8'); fs.renameSync(autosaveFile() + '.tmp', autosaveFile());
  });
  handle('autosave:read', () => {
    if (AUTOTEST) return null;
    try { const a = JSON.parse(fs.readFileSync(autosaveFile(), 'utf8')); return typeof a.json === 'string' ? { savedAt: Number(a.savedAt) || 0, json: a.json } : null; } catch { return null; }
  });
  handle('autosave:clear', () => { try { fs.unlinkSync(autosaveFile()); } catch { /* rien à supprimer */ } });
  handle('export:start', async (e, req) => { await encodersReady; return exportStart(winOf(e), req || {}); });
  handle('export:frame', (_e, pixels) => exportFrame(pixels));
  handle('export:finish', () => exportFinish());
  handle('export:cancel', () => exportCancel());
  // Journal : l'interface y écrit ses erreurs ; l'utilisateur peut ouvrir le dossier pour le transmettre.
  handle('log:write', (_e, level, scope, msg, data) => { const fn = level === 'error' ? log.error : level === 'warn' ? log.warn : log.info; fn(String(scope || 'interface').slice(0, 40), String(msg).slice(0, 2000), data); });
  handle('log:open', () => { if (log.file) shell.showItemInFolder(log.file); });
  // Lien de pilotage : réglage de l'utilisateur, réponses de l'interface aux commandes transmises.
  handle('control:get', () => control.status());
  handle('control:set', (_e, on) => setControl(on === true));
  handle('control:response', (_e, id, ok, value) => { const w = waiting.get(id); if (!w) return; waiting.delete(id); clearTimeout(w.timer); if (ok) w.resolve(value); else w.reject(new Error(String(value))); });
  handle('shell:show', () => { if (lastExport && fs.existsSync(lastExport)) shell.showItemInFolder(lastExport); });
  handle('autotest:get', () => { if (!AUTOTEST) return null; try { return JSON.parse(fs.readFileSync(AUTOTEST, 'utf8')); } catch { return null; } });
  handle('autotest:done', (_e, result) => { if (!AUTOTEST) return; fs.writeFileSync(AUTOTEST + '.result.json', JSON.stringify(result, null, 1)); app.exit(result && result.ok ? 0 : 1); });

  handle('app:version', () => app.getVersion());
  handle('update:download', () => { updater?.downloadUpdate().catch(() => {}); });
  handle('update:install', () => { if (!updater || job) return false; closing = true; updater.quitAndInstall(); return true; });

  setupUpdates(createWindow());
  // Le lien n'est ouvert que si l'utilisateur l'a activé (ou, en test, par variable d'environnement).
  if (readSettings().control === true || (!app.isPackaged && process.env.EZCUT_CONTROL === '1')) void control.start(app.getPath('userData'), controlCall);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

// L'export interrompu est nettoyé (fichier partiel supprimé) avant de quitter.
app.on('will-quit', () => { control.stop(); log.info('arrêt', 'EZcut se ferme'); });
app.on('window-all-closed', () => { Promise.resolve(job && exportCancel()).catch(() => {}).finally(() => { if (process.platform !== 'darwin') app.quit(); }); });
