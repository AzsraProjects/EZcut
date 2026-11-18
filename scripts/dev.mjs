// Lance l'application. Avec --dev : serveur de développement et rechargement à chaud ; sinon la version construite (dist/).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const dev = process.argv.includes('--dev');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE; // posée par certains éditeurs : Electron démarrerait comme un simple Node

let server = null;
if (dev) {
  const { createServer } = await import('vite');
  server = await createServer();
  await server.listen();
  env.EZCUT_DEV_URL = server.resolvedUrls?.local[0] ?? 'http://localhost:5173/';
}
const electron = createRequire(import.meta.url)('electron');
const script = process.argv.includes('--script') ? process.argv[process.argv.indexOf('--script') + 1] : '.';
const child = spawn(electron, [script], { stdio: 'inherit', env });
child.on('close', async code => { await server?.close(); process.exit(code ?? 0); });
