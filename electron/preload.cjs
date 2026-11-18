// Pont entre l'interface et le processus principal. Seules ces commandes sont exposées.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('ez', {
  pickMedia: () => ipcRenderer.invoke('media:pick'),
  importPaths: paths => ipcRenderer.invoke('media:import', paths),
  pathForFile: file => webUtils.getPathForFile(file),
  saveProject: (json, path) => ipcRenderer.invoke('project:save', json, path),
  openProject: () => ipcRenderer.invoke('project:open'),
  exportStart: req => ipcRenderer.invoke('export:start', req),
  exportFrame: pixels => ipcRenderer.invoke('export:frame', pixels),
  exportFinish: () => ipcRenderer.invoke('export:finish'),
  exportCancel: () => ipcRenderer.invoke('export:cancel'),
  showInFolder: path => ipcRenderer.invoke('shell:show', path),
  autoTest: () => ipcRenderer.invoke('autotest:get'),
  autoTestDone: result => ipcRenderer.invoke('autotest:done', result),
  version: process.env.npm_package_version || '',
});
