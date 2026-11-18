import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

// Dev only: lets tools/catalog/harness.html save its curation result to disk.
function saveEndpoint(): Plugin {
  return {
    name: 'ezcut-save-endpoint',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__save/curation.json', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
        const chunks: Buffer[] = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
          fs.writeFileSync(path.resolve(import.meta.dirname, 'tools/catalog/curation.json'), Buffer.concat(chunks));
          res.end('ok');
        });
      });
    },
  };
}

// Production uniquement : politique de sécurité du contenu (le serveur de développement a besoin de scripts en ligne).
function csp(): Plugin {
  return {
    name: 'ezcut-csp',
    apply: 'build',
    transformIndexHtml: html => html.replace('<!--csp-->', `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ezmedia:; media-src 'self' blob: ezmedia:; connect-src 'self' ezmedia:">`),
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), saveEndpoint(), csp()],
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', target: 'chrome130' },
  test: { include: ['src/**/*.test.ts'] },
});
