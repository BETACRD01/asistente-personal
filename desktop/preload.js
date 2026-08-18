const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  start: (config) => ipcRenderer.invoke("server:start", config),
  stop: () => ipcRenderer.invoke("server:stop"),
  onStatus: (cb) => ipcRenderer.on("server:status", (_e, msg) => cb(msg)),
});