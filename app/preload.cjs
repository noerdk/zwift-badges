const { contextBridge, ipcRenderer } = require('electron');

// The renderer gets a narrow, explicit surface — no node, no ipcRenderer.
contextBridge.exposeInMainWorld('zwift', {
  status: () => ipcRenderer.invoke('zwift:status'),
  signIn: (username, password) => ipcRenderer.invoke('zwift:signIn', { username, password }),
  signOut: () => ipcRenderer.invoke('zwift:signOut'),
  load: (hours) => ipcRenderer.invoke('zwift:load', { hours }),
  quit: () => ipcRenderer.invoke('zwift:quit'),
});
