// Pont entre l'interface et le processus principal. Seules ces commandes sont exposées.
// L'interface ne fournit jamais de chemin d'écriture : les emplacements viennent toujours d'un dialogue.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('ez', {
  pickMedia: () => ipcRenderer.invoke('media:pick'),
  importPaths: paths => ipcRenderer.invoke('media:import', paths),
  relinkMedia: paths => ipcRenderer.invoke('media:relink', paths),
  pathForFile: file => webUtils.getPathForFile(file),
  newProject: () => ipcRenderer.invoke('project:new'),
  saveProject: (json, saveAs) => ipcRenderer.invoke('project:save', json, saveAs === true),
  openProject: () => ipcRenderer.invoke('project:open'),
  exportStart: req => ipcRenderer.invoke('export:start', req),
  exportFrame: pixels => ipcRenderer.invoke('export:frame', pixels),
  exportFinish: () => ipcRenderer.invoke('export:finish'),
  exportCancel: () => ipcRenderer.invoke('export:cancel'),
  showLastExport: () => ipcRenderer.invoke('shell:show'),
  autoTest: () => ipcRenderer.invoke('autotest:get'),
  autoTestDone: result => ipcRenderer.invoke('autotest:done', result),
});
