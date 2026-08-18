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

ipcMain.handle("terminal:open", (_e, { hub, token, device, isLocal }) => {
  let cmd = "";
  const cliPath = require("path").join(__dirname, "server", "cli.js");
  
  if (process.platform === "darwin") {
    if (isLocal) {
      cmd =
        'tmux new-session -d -s agent 2>/dev/null; ' +
        'osascript -e \'tell application "Terminal" to do script "tmux attach -t agent"\'; ' +
        'osascript -e \'tell application "Terminal" to activate\'';
    } else {
      cmd =
        `osascript -e 'tell application "Terminal" to do script "env ELECTRON_RUN_AS_NODE=1 \\"${process.execPath}\\" \\"${cliPath}\\" \\"${hub}\\" \\"${token}\\" \\"${device}\\""'; ` +
        `osascript -e 'tell application "Terminal" to activate'`;
    }
  } else if (process.platform === "win32") {
    if (isLocal) {
      cmd = `start cmd.exe`;
    } else {
      cmd = `start cmd.exe /c "set ELECTRON_RUN_AS_NODE=1 && \\"${process.execPath}\\" \\"${cliPath}\\" \\"${hub}\\" \\"${token}\\" \\"${device}\\""`;
    }
  } else if (process.platform === "linux") {
    if (isLocal) {
      cmd = `x-terminal-emulator -e "bash -c 'tmux attach -t agent || tmux new -s agent'" || gnome-terminal -- bash -c "tmux attach -t agent || tmux new -s agent"`;
    } else {
      const runCmd = `env ELECTRON_RUN_AS_NODE=1 \\"${process.execPath}\\" \\"${cliPath}\\" \\"${hub}\\" \\"${token}\\" \\"${device}\\"`;
      cmd = `x-terminal-emulator -e "bash -c '${runCmd}'" || gnome-terminal -- bash -c "${runCmd}"`;
    }
  }
  
  if (cmd) {
    exec(cmd, { shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash" }, (err) => {
      if (err) console.error("[terminal:open]", err.message);
    });
  }
  return true;
});

ipcMain.handle("terminal:kill", () => {
  if (process.platform !== "darwin") return false;
  exec("tmux kill-session -t agent 2>/dev/null; echo $?", { shell: "/bin/bash" }, (err, stdout) => {
    if (err) console.error("[terminal:kill]", err.message);
    if (win) win.webContents.send("terminal:kill-done", (stdout || "").trim() === "0");
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