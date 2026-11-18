// Journal de l'application : un fichier texte local, relu pour comprendre un problème après coup.
// Il reste sur la machine de l'utilisateur (dossier de données de l'application) et n'est jamais envoyé nulle part.
const fs = require('node:fs');
const path = require('node:path');

const MAX_BYTES = 2 * 1024 * 1024; // au-delà, le fichier courant devient ezcut.1.log et un nouveau commence
let file = null, echo = false;

function init(dir, opts = {}) {
  echo = !!opts.echo;
  try {
    fs.mkdirSync(dir, { recursive: true });
    file = path.join(dir, 'ezcut.log');
    if (fs.existsSync(file) && fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, path.join(dir, 'ezcut.1.log'));
  } catch { file = null; }
  return file;
}

/** Réduit une valeur à une ligne lisible et bornée : pas de pixels, pas de projet entier dans le journal. */
function brief(v) {
  if (v === undefined) return '';
  if (v instanceof Error) return v.stack || v.message;
  if (typeof v === 'string') return v.length > 2000 ? v.slice(0, 2000) + '…' : v;
  try { const s = JSON.stringify(v); return s.length > 2000 ? s.slice(0, 2000) + '…' : s; } catch { return String(v); }
}

function write(level, scope, msg, data) {
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${brief(msg)}${data === undefined ? '' : ' ' + brief(data)}`.replace(/\r?\n/g, '\n    ');
  if (echo) (level === 'error' ? console.error : console.log)(line);
  if (!file) return;
  try {
    fs.appendFileSync(file, line + '\n');
    if (fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, path.join(path.dirname(file), 'ezcut.1.log'));
  } catch { /* un journal qui ne s'écrit pas ne doit jamais faire tomber l'application */ }
}

const log = {
  init,
  get file() { return file; },
  info: (scope, msg, data) => write('info', scope, msg, data),
  warn: (scope, msg, data) => write('warn', scope, msg, data),
  error: (scope, msg, data) => write('error', scope, msg, data),
  /** Dernières lignes du journal, pour l'afficher ou le transmettre à un assistant. */
  tail(lines = 200) {
    if (!file) return '';
    try { return fs.readFileSync(file, 'utf8').split('\n').slice(-Math.max(1, Math.min(2000, lines)) - 1).join('\n'); } catch { return ''; }
  },
};

module.exports = log;
