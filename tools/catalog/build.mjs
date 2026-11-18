// Construit le catalogue d'effets à partir des dépôts amont, sans modifier les shaders.
// usage: node tools/catalog/build.mjs <ISF-Files/ISF> <gl-transitions/transitions> [--all]
// Les effets écrits pour EZcut (effects/ezcut, même format ISF) sont ajoutés en tête du catalogue.
//   --all : ignore curation.json (première étape, avant de lancer harness.html)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [isfDir, gltDir, flag] = process.argv.slice(2);
const out = path.resolve(here, '../../public/catalog/effets.json');
const curFile = path.join(here, 'curation.json');
const cur = flag !== '--all' && fs.existsSync(curFile) ? JSON.parse(fs.readFileSync(curFile, 'utf8')) : { exclude: [], preview: {}, temporal: [] };
const excl = new Set(cur.exclude);
const TOOLS = new Set(['isf:Color Controls']); // réglages intégrés à l'inspecteur, hors banque
const FILTER_CATS = /^(Color Effect|Color Adjustment|Film|v002)$/;
const EFFECT_CATS = /^(Glitch|Distortion Effect|Distortion|Blur|Feedback|Tile Effect|Kaleidoscope|Geometry Adjustment|Halftone Effect|Noise|Stylize|Sharpen)$/;
const skipped = {};
const skip = (why, name) => { (skipped[why] ||= []).push(name); };

const effects = [];
const ownDir = path.resolve(here, '../../effects/ezcut');
const SOURCES = [
  { dir: ownDir, prefix: 'ez:', license: 'GPL-3.0', source: 'EZcut' },
  { dir: isfDir, prefix: 'isf:', license: 'MIT', source: 'Vidvox/ISF-Files' },
];
for (const SRC of SOURCES) for (const f of fs.readdirSync(SRC.dir).filter(f => f.endsWith('.fs')).sort()) {
  const isfDir = SRC.dir;
  const name = f.slice(0, -3), id = SRC.prefix + name, tool = TOOLS.has(id);
  if (excl.has(id) && !tool) { skip('excluded-by-test', name); continue; }
  const src = fs.readFileSync(path.join(isfDir, f), 'utf8');
  const m = src.match(/\/\*([\s\S]*?)\*\//);
  if (!m) { skip('no-header', name); continue; }
  let meta;
  try { meta = JSON.parse(m[1]); } catch { skip('bad-json', name); continue; }
  const inputs = meta.INPUTS || [];
  if (!inputs.some(i => i.NAME === 'inputImage' && i.TYPE === 'image')) { skip('generator', name); continue; }
  if (inputs.some(i => i.TYPE === 'image' && i.NAME !== 'inputImage')) { skip('extra-image-input', name); continue; }
  if (inputs.some(i => i.TYPE === 'audio' || i.TYPE === 'audioFFT')) { skip('audio-input', name); continue; }
  if (meta.IMPORTED && Object.keys(meta.IMPORTED).length) { skip('imported-image', name); continue; }
  const cats = meta.CATEGORIES || [];
  if (!tool && cats.some(c => /utility|masking|generator|overlay/i.test(c))) { skip('utility-category', name); continue; }
  // Filtre = traitement de couleur seul ; effet = tout ce qui déforme, anime ou stylise l'image.
  const kind = tool ? 'tool' : cats.some(c => FILTER_CATS.test(c)) && !cats.some(c => EFFECT_CATS.test(c)) ? 'filter' : 'effect';
  const vsPath = path.join(isfDir, name + '.vs');
  effects.push({
    id, name, kind, cats, credit: meta.CREDIT || '', desc: meta.DESCRIPTION || '',
    inputs: inputs.filter(i => i.TYPE !== 'image'),
    passes: meta.PASSES || [],
    fs: src.slice(m.index + m[0].length),
    vs: fs.existsSync(vsPath) ? fs.readFileSync(vsPath, 'utf8') : null,
    preview: cur.preview[id] || null, temporal: cur.temporal.includes(id),
    license: SRC.license, source: SRC.source,
  });
}

const transitions = [];
for (const f of fs.readdirSync(gltDir).filter(f => f.endsWith('.glsl')).sort()) {
  const name = f.slice(0, -5), id = 'glt:' + name;
  if (excl.has(id)) { skip('excluded-by-test', name); continue; }
  const src = fs.readFileSync(path.join(gltDir, f), 'utf8');
  const lic = (src.match(/^\/\/\s*License\s*:\s*(.+)$/mi) || [])[1]?.trim();
  if (!lic) { skip('no-license', name); continue; }
  if (/uniform\s+sampler2D/.test(src)) { skip('needs-texture', name); continue; }
  const params = [];
  const re = /^\s*uniform\s+(float|int|bool|vec2|vec3|vec4|ivec2)\s+(\w+)\s*;\s*(?:\/\/\s*=\s*(.*))?$/gm;
  let u;
  while ((u = re.exec(src))) {
    const nums = (u[3] || '').match(/-?\d*\.?\d+(?:e-?\d+)?|true|false/gi) || [];
    params.push({ type: u[1], name: u[2], def: nums.map(n => n === 'true' ? 1 : n === 'false' ? 0 : parseFloat(n)) });
  }
  const tags = ((src.match(/^\/\/\s*Tags?\s*:\s*(.+)$/mi) || [])[1] || '').toLowerCase().split(/[,\s]+/).filter(Boolean);
  transitions.push({
    id, name, tags, credit: (src.match(/^\/\/\s*Author\s*:\s*(.+)$/mi) || [])[1]?.trim() || '',
    params, src, license: lic, source: 'gl-transitions/gl-transitions',
  });
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ effects, transitions }));
const k = effects.reduce((a, e) => (a[e.kind] = (a[e.kind] || 0) + 1, a), {});
console.log('effects', k, 'transitions', transitions.length, 'bytes', fs.statSync(out).size);
for (const [w, v] of Object.entries(skipped)) console.log(' skipped', w, v.length);
