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
  encoders: () => ipcRenderer.invoke('export:encoders'),
  setDirty: dirty => ipcRenderer.invoke('project:dirty', dirty === true),
  closeWindow: () => ipcRenderer.invoke('app:close'),
  onSaveAndClose: fn => { ipcRenderer.removeAllListeners('app:save-and-close'); ipcRenderer.on('app:save-and-close', () => fn()); },
  autosaveWrite: json => ipcRenderer.invoke('autosave:write', json),
  autosaveRead: () => ipcRenderer.invoke('autosave:read'),
  autosaveClear: () => ipcRenderer.invoke('autosave:clear'),
  exportStart: req => ipcRenderer.invoke('export:start', req),
  exportFrame: pixels => ipcRenderer.invoke('export:frame', pixels),
  exportFinish: () => ipcRenderer.invoke('export:finish'),
  exportCancel: () => ipcRenderer.invoke('export:cancel'),
  showLastExport: () => ipcRenderer.invoke('shell:show'),
  version: () => ipcRenderer.invoke('app:version'),
  onUpdate: fn => { ipcRenderer.removeAllListeners('update:state'); ipcRenderer.on('update:state', (_e, state) => fn(state)); },
  updateDownload: () => ipcRenderer.invoke('update:download'),
  updateInstall: () => ipcRenderer.invoke('update:install'),
  autoTest: () => ipcRenderer.invoke('autotest:get'),
  autoTestDone: result => ipcRenderer.invoke('autotest:done', result),
});
