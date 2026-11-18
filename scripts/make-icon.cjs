// Fabrique build/icon.png (512 × 512) à partir du dessin ci-dessous. À lancer avec Electron : `npm run icon`.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3df0c6"/><stop offset="1" stop-color="#12b892"/></linearGradient></defs>
  <rect x="28" y="28" width="456" height="456" rx="108" fill="url(#g)"/>
  <path d="M200 150 L370 256 L200 362 Z" fill="#03241c" stroke="#03241c" stroke-width="26" stroke-linejoin="round"/>
</svg>`;

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 512, height: 512, show: false, frame: false, transparent: true, useContentSize: true, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<body style="margin:0;background:transparent">${svg}</body>`));
  await new Promise(r => setTimeout(r, 300));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  const out = path.join(__dirname, '..', 'build');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'icon.png'), img.resize({ width: 512, height: 512 }).toPNG());
  console.log('icon written', img.getSize());
  app.exit(0);
});
