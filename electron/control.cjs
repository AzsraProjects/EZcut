// Lien de pilotage : permet à un assistant (Claude, via le serveur MCP de tools/mcp) de commander EZcut sur cette machine.
// Désactivé par défaut. Une fois activé : serveur HTTP sur 127.0.0.1 uniquement, port aléatoire, jeton aléatoire à chaque
// lancement. Port et jeton sont écrits dans le dossier de données de l'application, lisible par le seul compte de l'utilisateur.
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const log = require('./logger.cjs');

const MAX_BODY = 2 * 1024 * 1024;
let server = null, token = '', infoFile = '', handler = null;

const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function start(dir, handle) {
  if (server) return Promise.resolve(status());
  handler = handle;
  token = crypto.randomBytes(24).toString('hex');
  infoFile = path.join(dir, 'control.json');
  return new Promise(resolve => {
    const s = http.createServer((req, res) => {
      const reply = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
      // Une page web ouverte dans un navigateur ne doit pas pouvoir piloter l'application : pas d'en-tête Origin accepté, jeton obligatoire.
      if (req.method !== 'POST' || req.url !== '/rpc' || req.headers.origin) return reply(404, { ok: false, error: 'introuvable' });
      if (!safeEqual(req.headers['x-ezcut-token'] || '', token)) return reply(401, { ok: false, error: 'jeton refusé' });
      const chunks = []; let size = 0;
      req.on('data', c => { size += c.length; if (size > MAX_BODY) req.destroy(); else chunks.push(c); });
      req.on('end', async () => {
        let msg;
        try { msg = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return reply(400, { ok: false, error: 'requête illisible' }); }
        const method = String(msg && msg.method || '');
        try {
          const result = await handler(method, (msg && typeof msg.params === 'object' && msg.params) || {});
          log.info('lien', method);
          reply(200, { ok: true, result });
        } catch (e) {
          log.warn('lien', method + ' a échoué', e && e.message);
          reply(200, { ok: false, error: String((e && e.message) || e) });
        }
      });
    });
    s.on('error', e => { log.error('lien', 'serveur', e); server = null; resolve(status()); });
    s.listen(0, '127.0.0.1', () => {
      server = s;
      try { fs.writeFileSync(infoFile, JSON.stringify({ port: s.address().port, token, pid: process.pid }), { mode: 0o600 }); } catch (e) { log.error('lien', 'écriture de control.json', e); }
      log.info('lien', 'activé', { port: s.address().port });
      resolve(status());
    });
  });
}

function stop() {
  if (server) { server.close(); server = null; log.info('lien', 'désactivé'); }
  try { if (infoFile) fs.unlinkSync(infoFile); } catch { /* déjà absent */ }
}

const status = () => ({ enabled: !!server, port: server ? server.address().port : null });

module.exports = { start, stop, status };
