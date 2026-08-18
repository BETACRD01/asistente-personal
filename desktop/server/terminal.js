const WebSocket = require("ws");
const os = require("os");
const { spawn } = require("node-pty");

function startTerminal({ hubUrl, deviceToken, shell, log }) {
  const url = `${hubUrl.replace(/\/+$/, "")}/ws/mac/term`;
  const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${deviceToken}` } });
  let pty = null;

  function openPty() {
    const sh =
      shell ||
      process.env.SHELL ||
      (process.platform === "win32" ? "powershell.exe" : "/bin/bash");
    pty = spawn(sh, [], {
      cols: 80,
      rows: 24,
      cwd: os.homedir(),
      env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" },
      name: "xterm-256color",
    });
    pty.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(Buffer.from(data, "utf8"));
    });
    pty.onExit(({ exitCode }) => log("terminal: la shell salio con codigo " + exitCode));
  }

  ws.on("open", () => {
    log("terminal: conectado al hub");
    openPty();
  });
  ws.on("error", (e) => log("terminal: error " + e.message));
  ws.on("close", () => {
    if (pty) {
      try {
        pty.kill();
      } catch {}
      pty = null;
    }
  });

  ws.on("message", (raw) => {
    if (typeof raw === "string") {
      try {
        const m = JSON.parse(raw);
        if (m.type === "resize" && pty) {
          pty.resize(Number(m.cols) || 80, Number(m.rows) || 24);
        }
      } catch {}
    } else {
      if (pty) pty.write(raw.toString("utf8"));
    }
  });

  return {
    stop() {
      try {
        ws.close();
      } catch {}
    },
  };
}

module.exports = { startTerminal };