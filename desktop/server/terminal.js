const WebSocket = require("ws");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");
const { spawn } = require("node-pty");

function startTerminal({ hubUrl, deviceToken, shell, log }) {
  const url = `${hubUrl.replace(/\/+$/, "")}/ws/mac/term`;
  const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${deviceToken}` } });
  let pty = null;

  function hasTmux() {
    try {
      execSync("which tmux", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  function openPty() {
    const sh =
      shell ||
      process.env.SHELL ||
      (process.platform === "win32" ? "powershell.exe" : "/bin/bash");
    let cmd = sh;
    let args;
    if (process.platform !== "win32" && hasTmux()) {
      cmd = "tmux";
      args = ["new-session", "-A", "-s", "agent"];
    } else {
      args = ["zsh", "bash"].includes(path.basename(sh)) ? ["-l"] : [];
    }
    pty = spawn(cmd, args, {
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
    let decoded = null;
    if (typeof raw === "string") {
      decoded = raw;
    } else {
      decoded = raw.toString("utf8");
    }
    let handled = false;
    if (decoded) {
      try {
        const m = JSON.parse(decoded);
        if (m.type === "resize" && pty) {
          pty.resize(Number(m.cols) || 80, Number(m.rows) || 24);
          handled = true;
        }
      } catch {}
    }
    if (!handled && typeof raw !== "string") {
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