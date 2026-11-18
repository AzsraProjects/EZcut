// Processus principal : fenêtre, accès aux fichiers, FFmpeg. Seul endroit du projet qui parle au système.
const { app, BrowserWindow, dialog, ipcMain, protocol, shell } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');

const DEV_URL = process.env.EZCUT_DEV_URL || '';
const FFMPEG = process.env.EZCUT_FFMPEG || 'ffmpeg';
const FFPROBE = process.env.EZCUT_FFPROBE || 'ffprobe';
const AUTOTEST = process.env.EZCUT_AUTOTEST || ''; // chemin d'un JSON { media: [...], out: "..." } : test d'intégration sans interface

const EXT = {
  video: ['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v'],
  audio: ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.opus'],
  image: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'],
};
const MIME = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.webm': 'video/webm', '.avi': 'video/x-msvideo',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.opus': 'audio/ogg',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp' };
const kindOf = p => { const e = path.extname(p).toLowerCase(); return Object.keys(EXT).find(k => EXT[k].includes(e)) || null; };

/** Fichiers que l'interface a le droit de lire : uniquement ceux que l'utilisateur a importés ou ouverts. */
const allowed = new Set();
const mediaUrl = p => 'ezmedia://local/' + encodeURIComponent(p);

// La lecture démarre sur un raccourci clavier ou une action de l'interface, pas toujours sur un clic.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

protocol.registerSchemesAsPrivileged([{ scheme: 'ezmedia', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

function serveMedia(request) {
  const file = decodeURIComponent(new URL(request.url).pathname.slice(1));
  if (!allowed.has(file)) return new Response('forbidden', { status: 403 });
  let stat;
  try { stat = fs.statSync(file); } catch { return new Response('not found', { status: 404 }); }
  const headers = { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
  const m = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '');
  if (m && (m[1] || m[2])) {
    let start = m[1] ? parseInt(m[1], 10) : Math.max(0, stat.size - parseInt(m[2], 10));
    let end = m[1] && m[2] ? Math.min(parseInt(m[2], 10), stat.size - 1) : stat.size - 1;
    if (start >= stat.size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
    return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': String(end - start + 1) } });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)), { status: 200, headers: { ...headers, 'Content-Length': String(stat.size) } });
}

function run(cmd, args) {
  return new Promise(resolve => {
    let out = '', err = '';
    let child;
    try { child = spawn(cmd, args, { windowsHide: true }); } catch (e) { return resolve({ code: -1, out, err: String(e) }); }
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', e => resolve({ code: -1, out, err: String(e) }));
    child.on('close', code => resolve({ code, out, err }));
  });
}

async function probe(file) {
  const kind = kindOf(file);
  if (!kind || !fs.existsSync(file)) return null;
  allowed.add(file);
  const info = { path: file, url: mediaUrl(file), name: path.basename(file), kind, duration: 0, width: 0, height: 0, hasAudio: kind === 'audio' };
  const r = await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
  if (r.code === 0) {
    try {
      const j = JSON.parse(r.out), v = (j.streams || []).find(s => s.codec_type === 'video'), a = (j.streams || []).find(s => s.codec_type === 'audio');
      info.duration = kind === 'image' ? 0 : parseFloat(j.format?.duration) || 0;
      info.hasAudio = !!a && kind !== 'image';
      if (v) {
        const rot = Math.abs(parseInt(v.tags?.rotate ?? v.side_data_list?.find(s => s.rotation !== undefined)?.rotation ?? 0, 10)) % 180 === 90;
        info.width = rot ? v.height : v.width; info.height = rot ? v.width : v.height;
      }
    } catch { /* l'interface complétera à partir du fichier lui-même */ }
  }
  return info;
}
const probeAll = async files => (await Promise.all(files.filter(f => typeof f === 'string').map(probe))).filter(Boolean);

/* ---------- export ---------- */
let job = null;

function audioGraph(tracks, total) {
  // Chaque piste devient une suite de segments (son du fichier ou silence), puis les pistes sont mixées.
  const inputs = [], filters = [], mixed = [];
  let n = 1; // l'entrée 0 est la vidéo brute
  tracks.forEach((segs, ti) => {
    const labels = [];
    segs.forEach((s, si) => {
      const lab = `t${ti}s${si}`, dur = Math.max(0.01, Number(s.dur) || 0);
      if (s.path && allowed.has(s.path)) {
        inputs.push('-ss', String(Math.max(0, Number(s.in) || 0)), '-t', String(dur), '-i', s.path);
        filters.push(`[${n}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${dur},volume=${Math.max(0, Number(s.volume) || 0)}[${lab}]`);
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
  if (job) return { ok: false, error: 'Un export est déjà en cours.' };
  const width = req.width | 0, height = req.height | 0, fps = Number(req.fps) || 30, frames = req.frames | 0;
  if (width < 16 || height < 16 || width > 8192 || height > 8192 || frames < 1) return { ok: false, error: 'Paramètres d\'export invalides.' };
  let out = AUTOTEST && typeof req.outPath === 'string' ? req.outPath : null;
  if (!out) {
    const safe = String(req.name || 'EZcut').replace(/[\\/:*?"<>|]/g, '_');
    const r = await dialog.showSaveDialog(win, { title: 'Exporter la vidéo', defaultPath: path.join(app.getPath('videos'), safe + '.mp4'), filters: [{ name: 'Vidéo MP4', extensions: ['mp4'] }] });
    if (r.canceled || !r.filePath) return { ok: false };
    out = r.filePath;
  }
  const total = frames / fps, { inputs, filters } = audioGraph(Array.isArray(req.audio) ? req.audio : [], total);
  const args = ['-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-r', String(fps), '-i', 'pipe:0', ...inputs,
    '-filter_complex', [`[0:v]vflip,format=yuv420p[vout]`, ...filters].join(';'), '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', String(total), out];
  let child;
  try { child = spawn(FFMPEG, args, { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] }); } catch (e) { return { ok: false, error: 'FFmpeg introuvable : ' + e.message }; }
  const j = job = { child, out, err: '', failed: null, closed: null, size: width * height * 4 };
  child.stderr.on('data', d => { j.err = (j.err + d).slice(-4000); });
  child.stdin.on('error', e => { j.failed = j.failed || e.message; });
  j.closed = new Promise(resolve => {
    child.on('error', e => { j.failed = 'FFmpeg introuvable ou impossible à lancer : ' + e.message; resolve(-1); });
    child.on('close', code => resolve(code));
  });
  return { ok: true, path: out };
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
  if (code !== 0 || j.failed) return { ok: false, error: (j.failed || 'FFmpeg a échoué.') + ' ' + j.err.trim() };
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

/* ---------- fenêtre ---------- */
function createWindow() {
  const win = new BrowserWindow({
    width: 1500, height: 920, minWidth: 1100, minHeight: 700, backgroundColor: '#101216', show: !AUTOTEST, title: 'EZcut', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  win.setMenuBarVisibility(false);
  // Aucune navigation ni fenêtre externe depuis l'interface.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  if (DEV_URL) win.loadURL(DEV_URL); else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  return win;
}

app.whenReady().then(() => {
  protocol.handle('ezmedia', serveMedia);
  const winOf = e => BrowserWindow.fromWebContents(e.sender);

  ipcMain.handle('media:pick', async e => {
    const r = await dialog.showOpenDialog(winOf(e), { title: 'Importer des médias', properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Médias', extensions: [...EXT.video, ...EXT.audio, ...EXT.image].map(x => x.slice(1)) }] });
    return r.canceled ? [] : probeAll(r.filePaths);
  });
  ipcMain.handle('media:import', (_e, paths) => probeAll(Array.isArray(paths) ? paths : []));
  ipcMain.handle('project:save', async (e, json, file) => {
    if (typeof json !== 'string') return null;
    if (typeof file !== 'string' || !file.toLowerCase().endsWith('.ezcut')) {
      const r = await dialog.showSaveDialog(winOf(e), { title: 'Enregistrer le projet', defaultPath: path.join(app.getPath('documents'), 'Projet.ezcut'), filters: [{ name: 'Projet EZcut', extensions: ['ezcut'] }] });
      if (r.canceled || !r.filePath) return null;
      file = r.filePath;
    }
    // Écriture atomique : un plantage en cours d'écriture ne détruit pas le projet existant.
    fs.writeFileSync(file + '.tmp', json, 'utf8'); fs.renameSync(file + '.tmp', file);
    return file;
  });
  ipcMain.handle('project:open', async e => {
    const r = await dialog.showOpenDialog(winOf(e), { title: 'Ouvrir un projet', properties: ['openFile'], filters: [{ name: 'Projet EZcut', extensions: ['ezcut'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    return { path: r.filePaths[0], json: fs.readFileSync(r.filePaths[0], 'utf8') };
  });
  ipcMain.handle('export:start', (e, req) => exportStart(winOf(e), req || {}));
  ipcMain.handle('export:frame', (_e, pixels) => exportFrame(pixels));
  ipcMain.handle('export:finish', () => exportFinish());
  ipcMain.handle('export:cancel', () => exportCancel());
  ipcMain.handle('shell:show', (_e, p) => { if (typeof p === 'string' && fs.existsSync(p)) shell.showItemInFolder(p); });
  ipcMain.handle('autotest:get', () => { if (!AUTOTEST) return null; try { return JSON.parse(fs.readFileSync(AUTOTEST, 'utf8')); } catch { return null; } });
  ipcMain.handle('autotest:done', (_e, result) => { if (!AUTOTEST) return; fs.writeFileSync(AUTOTEST + '.result.json', JSON.stringify(result, null, 1)); app.exit(result && result.ok ? 0 : 1); });

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (job) exportCancel(); if (process.platform !== 'darwin') app.quit(); });
