const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const path = require("path");
const { exec } = require("child_process");
const { startServer } = require("./server");

let win = null;
let server = null;
let decideReq = null;

function stopServer() {
  decideReq = null;
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
  try {
    server = startServer({
      hubUrl: config.hubUrl,
      deviceToken: config.deviceToken,
      sshPort: config.sshPort || 22,
      shell: config.shell || "",
      log: (msg) => {
        if (win) win.webContents.send("server:status", msg);
      },
      onRequest: (frame, decide) => {
        decideReq = decide;
        if (win) {
          win.webContents.send("server:request", {
            id: frame.id,
            from: frame.from,
            kind: frame.kind,
          });
        }
      },
    });
  } catch (e) {
    console.error("[main] server:start fallo:", e);
  }
  return true;
});

ipcMain.handle("server:stop", () => {
  stopServer();
  return true;
});

ipcMain.handle("server:decide", (_e, payload) => {
  if (decideReq) {
    decideReq(!!payload?.ok);
    decideReq = null;
  }
  return true;
});

ipcMain.handle("terminal:native", () => {
  if (process.platform !== "darwin") return false;
  const cmd =
    'tmux new-session -d -s agent 2>/dev/null; ' +
    'osascript -e \'tell application "Terminal" to do script "tmux attach -t agent"\'; ' +
    'osascript -e \'tell application "Terminal" to activate\'';
  exec(cmd, { shell: "/bin/bash" }, (err) => {
    if (err) console.error("[terminal:native]", err.message);
  });
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