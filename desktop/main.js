const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const path = require("path");
const { startServer } = require("./server");

let win = null;
let server = null;

function stopServer() {
  if (server) {
    try {
      server.stop();
    } catch {}
    server = null;
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 980,
    height: 640,
    title: "AgentRelay — Terminal de la Mac",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  win.on("closed", () => {
    win = null;
    stopServer();
  });
}

ipcMain.handle("server:start", (_e, config) => {
  stopServer();
  server = startServer({
    hubUrl: config.hubUrl,
    deviceToken: config.deviceToken,
    sshPort: config.sshPort || 22,
    shell: config.shell || "",
    log: (msg) => {
      if (win) win.webContents.send("server:status", msg);
    },
  });
  return true;
});

ipcMain.handle("server:stop", () => {
  stopServer();
  return true;
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => stopServer());
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});