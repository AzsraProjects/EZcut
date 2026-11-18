// Test d'intégration : import → montage (effet + transition) → export, dans la vraie application, sans interface.
// Fabrique ses propres médias avec FFmpeg, puis vérifie le fichier exporté avec ffprobe.
// Prérequis : `npm run build`, ffmpeg et ffprobe dans le PATH.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ezcut-test-'));
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });
const fail = msg => { console.error('ÉCHEC :', msg); process.exit(1); };

// Deux clips de 3 s : mire + son, puis dégradé muet (vérifie le silence inséré pour une vidéo sans piste audio).
const a = path.join(dir, 'a.mp4'), b = path.join(dir, 'b.mp4'), out = path.join(dir, 'out.mp4'), cfg = path.join(dir, 'test.json');
let r = run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30:d=3', '-f', 'lavfi', '-i', 'sine=f=440:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', a]);
if (r.status !== 0) fail('ffmpeg indisponible ou en erreur : ' + (r.stderr || r.error));
r = run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'gradients=s=640x360:r=30:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', b]);
if (r.status !== 0) fail('génération du second clip : ' + r.stderr);
fs.writeFileSync(cfg, JSON.stringify({ media: [a, b], out }));

const env = { ...process.env, EZCUT_AUTOTEST: cfg };
delete env.ELECTRON_RUN_AS_NODE;
const electron = createRequire(import.meta.url)('electron');
r = run(electron, ['.'], { env, timeout: 180000 });
const resFile = cfg + '.result.json';
if (!fs.existsSync(resFile)) fail('l\'application n\'a rendu aucun résultat (code ' + r.status + ') ' + (r.stderr || '').slice(-500));
const res = JSON.parse(fs.readFileSync(resFile, 'utf8'));
if (!res.ok) fail('export : ' + res.error);

const p = run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', out]);
const info = JSON.parse(p.stdout), v = info.streams.find(s => s.codec_type === 'video'), au = info.streams.find(s => s.codec_type === 'audio');
const checks = [
  ['deux clips montés', res.clips === 2],
  ['vidéo H.264', v?.codec_name === 'h264'],
  ['1280 × 720', v?.width === 1280 && v?.height === 720],
  ['30 images/s', v?.r_frame_rate === '30/1'],
  ['180 images', Number(v?.nb_frames) === 180],
  ['piste audio AAC', au?.codec_name === 'aac'],
  ['durée 6 s', Math.abs(parseFloat(info.format.duration) - 6) < 0.1],
];
let ok = true;
for (const [name, pass] of checks) { console.log(pass ? '  ok   ' : '  ÉCHEC', name); ok &&= pass; }
console.log(`${res.frames} images en ${res.seconds.toFixed(1)} s (${(res.frames / res.seconds).toFixed(0)} images/s) — catalogue : ${res.effects} effets, ${res.filters} filtres, ${res.transitions} transitions`);
fs.rmSync(dir, { recursive: true, force: true });
process.exit(ok ? 0 : 1);
