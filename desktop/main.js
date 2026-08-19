const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const path = require("path");
const { exec } = require("child_process");
const { startServer } = require("./server");
const fs = require("fs");
const os = require("os");

const logFile = path.join(os.tmpdir(), "agentrelay.log");
try {
  fs.writeFileSync(logFile, "App started\n");
} catch (e) {
  console.error("[log] no se pudo abrir " + logFile, e.message);
}
const origErr = console.error;
const origLog = console.log;
console.error = (...args) => { try { fs.appendFileSync(logFile, args.join(" ") + "\n"); } catch {} origErr(...args); };
console.log = (...args) => { try { fs.appendFileSync(logFile, args.join(" ") + "\n"); } catch {} origLog(...args); };

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
  console.log(`[terminal:open] called with isLocal=${isLocal}, device=${device}`);
  const os = require("os");
  const fs = require("fs");
  const path = require("path");
  const cliPath = path.join(__dirname, "server", "cli.js");
  const id = Date.now();
  
  if (process.platform === "darwin") {
    const tmpScript = path.join(os.tmpdir(), `agentrelay_${id}.sh`);
    let scriptContent = "#!/bin/bash\n";
    if (isLocal) {
      const sname = `agent_${id}`;
      scriptContent += `trap 'tmux kill-session -t ${sname} 2>/dev/null' HUP TERM EXIT\ntmux new-session -d -s ${sname} 2>/dev/null\ntmux attach -t ${sname}\n`;
    } else {
      scriptContent += `env ELECTRON_RUN_AS_NODE=1 "${process.execPath}" "${cliPath}" "${hub}" "${token}" "${device}"\n`;
    }
    fs.writeFileSync(tmpScript, scriptContent, { mode: 0o755 });
    console.log(`[terminal:open] Executing: open -a Terminal "${tmpScript}"`);
    exec(`open -a Terminal "${tmpScript}"`, (err) => {
      if (err) console.error("[terminal:open]", err.message);
    });
  } else if (process.platform === "win32") {
    const tmpScript = path.join(os.tmpdir(), `agentrelay_${id}.bat`);
    let scriptContent = "@echo off\n";
    if (isLocal) {
      scriptContent += `cmd.exe\n`;
    } else {
      scriptContent += `set ELECTRON_RUN_AS_NODE=1\n"${process.execPath}" "${cliPath}" "${hub}" "${token}" "${device}"\n`;
    }
    fs.writeFileSync(tmpScript, scriptContent);
    exec(`start cmd.exe /c "${tmpScript}"`, (err) => {
      if (err) console.error("[terminal:open]", err.message);
    });
  } else if (process.platform === "linux") {
    const tmpScript = path.join(os.tmpdir(), `agentrelay_${id}.sh`);
    let scriptContent = "#!/bin/bash\n";
    if (isLocal) {
      const sname = `agent_${id}`;
      scriptContent += `trap 'tmux kill-session -t ${sname} 2>/dev/null' HUP TERM EXIT\ntmux new-session -d -s ${sname} 2>/dev/null\ntmux attach -t ${sname}\n`;
    } else {
      scriptContent += `env ELECTRON_RUN_AS_NODE=1 "${process.execPath}" "${cliPath}" "${hub}" "${token}" "${device}"\n`;
    }
    fs.writeFileSync(tmpScript, scriptContent, { mode: 0o755 });
    exec(`x-terminal-emulator -e "${tmpScript}" || gnome-terminal -- "${tmpScript}"`, (err) => {
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