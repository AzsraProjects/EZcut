// Test de bout en bout du lien avec Claude : lance la vraie application (fenêtre masquée, dossier de données à part),
// puis lui parle uniquement à travers le serveur MCP, comme le ferait un assistant. Prérequis : `npm run build`.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const FFMPEG = require('ffmpeg-static'), FFPROBE = require('ffprobe-static').path, electron = require('electron');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ezcut-link-')), data = path.join(dir, 'data');
const env = { ...process.env, EZCUT_USERDATA: data, EZCUT_CONTROL: '1', EZCUT_HEADLESS: '1' };
delete env.ELECTRON_RUN_AS_NODE;

let app, mcp, failed = 0;
const done = code => { try { mcp?.kill(); app?.kill(); } catch { /* déjà arrêtés */ } setTimeout(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* fichiers encore tenus */ } process.exit(code); }, 800); };
const check = (name, pass, detail = '') => { console.log(pass ? '  ok   ' : '  ÉCHEC', name, pass ? '' : detail); if (!pass) failed++; };

// médias d'essai
const a = path.join(dir, 'a.mp4'), b = path.join(dir, 'b.mp4'), logo = path.join(dir, 'logo.png'), out = path.join(dir, 'montage.mp4');
for (const args of [
  ['-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30:d=3', '-f', 'lavfi', '-i', 'sine=f=440:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', a],
  ['-f', 'lavfi', '-i', 'smptebars=s=640x360:r=30:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', b],
  ['-f', 'lavfi', '-i', 'color=c=red:s=200x200:d=1', '-frames:v', '1', logo],
]) if (spawnSync(FFMPEG, ['-v', 'error', '-y', ...args]).status !== 0) { console.error('ÉCHEC : génération des médias'); done(1); }

app = spawn(electron, ['.'], { env, stdio: 'ignore' });
for (let i = 0; i < 100 && !fs.existsSync(path.join(data, 'control.json')); i++) await new Promise(r => setTimeout(r, 200));
if (!fs.existsSync(path.join(data, 'control.json'))) { console.error('ÉCHEC : le lien ne s\'est pas ouvert'); done(1); }

// client MCP minimal
mcp = spawn(process.execPath, ['tools/mcp/ezcut-mcp.mjs'], { env, stdio: ['pipe', 'pipe', 'inherit'] });
const pending = new Map(); let buf = '', nextId = 1;
mcp.stdout.setEncoding('utf8');
mcp.stdout.on('data', d => { buf += d; let nl; while ((nl = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, nl)); buf = buf.slice(nl + 1); pending.get(m.id)?.(m); pending.delete(m.id); } });
const rpc = (method, params) => new Promise((res, rej) => { const id = nextId++; const t = setTimeout(() => rej(new Error('pas de réponse à ' + method)), 180000); pending.set(id, m => { clearTimeout(t); res(m); }); mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
const tool = async (name, args = {}) => { const m = await rpc('tools/call', { name, arguments: args }); const c = m.result.content; return { error: m.result.isError ? c[0].text : null, image: c.find(x => x.type === 'image'), json: (() => { try { return JSON.parse(c.find(x => x.type === 'text')?.text ?? 'null'); } catch { return null; } })(), text: c.find(x => x.type === 'text')?.text ?? '' }; };

try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
  check('le serveur MCP se présente', init.result?.serverInfo?.name === 'ezcut');
  const list = await rpc('tools/list', {});
  check('il expose ses outils', list.result.tools.length >= 20 && list.result.tools.every(t => t.inputSchema?.type === 'object'));

  // l'application finit de démarrer (catalogue chargé)
  let st; for (let i = 0; i < 50; i++) { st = await tool('ezcut_status'); if (!st.error) break; await new Promise(r => setTimeout(r, 200)); }
  check('état d\'un projet vide', st.json?.project?.duration === 0, st.error ?? '');

  const imp = await tool('ezcut_import', { paths: [a, b, logo, path.join(dir, 'absent.mp4'), path.join(dir, 'notes.txt')] });
  check('import : 3 médias acceptés, 2 refusés', imp.json?.media?.length === 3 && imp.json?.refused === 2, imp.error ?? imp.text);
  const [ma, mb, ml] = imp.json.media;
  const prev = await tool('ezcut_media_preview', { mediaId: ma.id, count: 4 });
  check('planche d\'images d\'un média', !!prev.image && prev.image.data.length > 2000, prev.error ?? '');

  const ca = await tool('ezcut_add_clip', { mediaId: ma.id }), cb = await tool('ezcut_add_clip', { mediaId: mb.id });
  check('deux clips à la suite', cb.json?.start === 3 && cb.json?.track === 'video', cb.error ?? cb.text);
  const ov = await tool('ezcut_add_clip', { mediaId: ml.id, track: 'overlay', at: 0 });
  const ed = await tool('ezcut_edit_clip', { clipId: ov.json.id, wholeVideo: true, transform: { scale: 0.2, x: 0.38, y: 0.36 }, opacity: 0.9 });
  check('logo par-dessus, étendu à toute la vidéo', ed.json?.duration === 6 && ed.json?.transform?.scale === 0.2, ed.error ?? ed.text);
  const ti = await tool('ezcut_add_title', { text: 'Test du lien', preset: 'impact', at: 0.5, duration: 2 });
  check('titre posé', ti.json?.track === 'text' && ti.json?.duration === 2, ti.error ?? ti.text);

  const cat = await tool('ezcut_catalog', { kind: 'filter', query: 'sépia', details: true });
  check('recherche dans la banque', cat.json?.filters?.length >= 1 && Array.isArray(cat.json.filters[0].params), cat.error ?? cat.text);
  const fx = await tool('ezcut_apply_effect', { clipId: ca.json.id, effectId: cat.json.filters[0].id });
  check('filtre appliqué', fx.json?.effects?.length === 1, fx.error ?? fx.text);
  const tr = await tool('ezcut_set_transition', { clipId: ca.json.id, effectId: 'glt:CrossZoom', duration: 0.8 });
  check('transition posée', tr.json?.transition?.duration === 0.8, tr.error ?? tr.text);
  const sp = await tool('ezcut_split', { time: 4.5 });
  check('coupe à 4,5 s', sp.json?.length === 3, sp.error ?? sp.text);
  const un = await tool('ezcut_undo');
  check('annulation', un.json?.tracks?.video?.length === 2, un.error ?? '');

  const bad = await tool('ezcut_edit_clip', { clipId: ca.json.id, volume: 99, transform: { scale: 1e9 }, blend: 'n\'importe quoi' });
  check('valeurs absurdes bornées', bad.json?.transform?.scale === 20 && bad.json?.blend === undefined && bad.json?.volume === undefined, bad.error ?? bad.text);
  await tool('ezcut_undo');
  const mk = await tool('ezcut_marker', { time: 2, name: 'Refrain', color: '#22e3b6' });
  check('repère posé', mk.json?.length === 1 && mk.json[0].time === 2 && mk.json[0].name === 'Refrain', mk.error ?? mk.text);
  await tool('ezcut_track', { track: 'video', locked: true });
  const lockedEdit = await tool('ezcut_split', { time: 2 });
  check('piste verrouillée : modification refusée', !!lockedEdit.error && /verrouill/i.test(lockedEdit.error), lockedEdit.text);
  const unl = await tool('ezcut_track', { track: 'video', locked: false, muted: true });
  check('piste déverrouillée et muette', unl.json?.video?.muted === true && !unl.json?.video?.locked, unl.error ?? unl.text);
  await tool('ezcut_track', { track: 'video', muted: false });
  const nope = await tool('ezcut_remove_clip', { clipId: 'inconnu' });
  check('erreur claire sur un identifiant inconnu', !!nope.error && /introuvable/i.test(nope.error));

  const shot = await tool('ezcut_screenshot', { time: 1.2, size: 360 });
  check('capture du montage', !!shot.image && shot.json?.width === 640 && shot.json?.height === 360, shot.error ?? '');
  if (shot.image) fs.writeFileSync(path.join(dir, 'capture.jpg'), Buffer.from(shot.image.data, 'base64'));

  const proj = path.join(dir, 'essai.ezcut');
  const sv = await tool('ezcut_save', { path: proj });
  check('projet enregistré', !sv.error && fs.existsSync(proj) && JSON.parse(fs.readFileSync(proj, 'utf8')).video.length === 2, sv.error ?? '');
  check('aucune adresse de lecture dans le fichier', JSON.parse(fs.readFileSync(proj, 'utf8')).media.every(m => m.url === ''));

  const ex = await tool('ezcut_export', { outPath: out, height: 360, fps: 30 });
  const p = JSON.parse(spawnSync(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', out], { encoding: 'utf8' }).stdout || '{}');
  const v = p.streams?.find(s => s.codec_type === 'video');
  check('export par le lien', !ex.error && v?.width === 640 && Number(v?.nb_frames) === 180 && !!p.streams.find(s => s.codec_type === 'audio'), ex.error ?? JSON.stringify(v));
  const again = await tool('ezcut_export', { outPath: out, height: 360 });
  check('refuse d\'écraser une vidéo existante', !!again.error && /existe déjà/.test(again.error), again.error ?? 'aucune erreur');
  const evil = await tool('ezcut_export', { outPath: path.join(dir, 'x.bat') });
  check('refuse une autre extension que .mp4', !!evil.error);

  const logs = await tool('ezcut_logs', { lines: 400 });
  check('journal lisible, avec le démarrage et l\'export', /démarrage/.test(logs.text) && /\[export\]/.test(logs.text) && /\[lien\]/.test(logs.text), logs.text.slice(0, 200));

  // un intrus sans jeton est refusé
  const info = JSON.parse(fs.readFileSync(path.join(data, 'control.json'), 'utf8'));
  const call = headers => fetch(`http://127.0.0.1:${info.port}/rpc`, { method: 'POST', headers, body: '{"method":"status"}' }).then(r => r.status);
  check('sans jeton : refusé', await call({}) === 401);
  check('depuis une page web (Origin) : refusé', await call({ 'X-EZcut-Token': info.token, Origin: 'https://exemple.test' }) === 404);
} catch (e) { console.error('ÉCHEC :', e.message); failed++; }
console.log(failed ? `${failed} vérification(s) en échec` : 'lien avec Claude : tout passe');
done(failed ? 1 : 0);
