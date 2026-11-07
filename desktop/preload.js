// Minimal, explicit bridge between the trainer page and the desktop app (no Node access in the page).
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('bjtDesktop', {
  raise: () => ipcRenderer.send('raise'),
  lower: () => ipcRenderer.send('lower'),
  resize: (height, width) => ipcRenderer.send('resize', height, width),
  openMain: hash => ipcRenderer.send('open-main', hash),
  getPause: () => ipcRenderer.invoke('get-pause'),
  setPause: until => ipcRenderer.send('set-pause', until),
  onPause: cb => ipcRenderer.on('pause', (_e, until) => cb(until)),
})
