const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  start: (config) => ipcRenderer.invoke("server:start", config),
  stop: () => ipcRenderer.invoke("server:stop"),
  onStatus: (cb) => ipcRenderer.on("server:status", (_e, msg) => cb(msg)),
  onRequest: (cb) => ipcRenderer.on("server:request", (_e, req) => cb(req)),
  decide: (ok) => ipcRenderer.invoke("server:decide", { ok }),
  openNative: (args) => ipcRenderer.invoke("terminal:open", args),
  killNative: () => ipcRenderer.invoke("terminal:kill"),
  onKillDone: (cb) => ipcRenderer.on("terminal:kill-done", (_e, ok) => cb(ok)),
  getDeviceToken: () => ipcRenderer.invoke("config:token"),
});