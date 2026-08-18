const $ = (id) => document.getElementById(id);

const hubInput = $("hub");
const deviceInput = $("device");
const sshportInput = $("sshport");
const connectBtn = $("connect");
const reconnectBtn = $("reconnect");
const statusEl = $("status");
const srvEl = $("srvstatus");

let ws = null;
let term = null;
let fitAddon = null;
let serverOn = false;

function setStatus(text, color) {
  statusEl.textContent = text;
  statusEl.style.color = color || "#9a9a9a";
}

function setSrv(text, color) {
  srvEl.textContent = text;
  srvEl.style.color = color || "#9a9a9a";
}

function baseUrl() {
  let hub = hubInput.value.trim().replace(/\/+$/, "");
  if (!/^wss?:\/\//.test(hub)) hub = "wss://" + hub;
  return hub;
}

function saveSettings() {
  localStorage.setItem("agentrelay.hub", hubInput.value.trim());
  localStorage.setItem("agentrelay.device", deviceInput.value.trim());
  localStorage.setItem("agentrelay.sshport", sshportInput.value.trim());
}

function sendResize() {
  if (ws && ws.readyState === WebSocket.OPEN && term) {
    ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
  }
}

function startServer() {
  const hub = baseUrl();
  const token = deviceInput.value.trim();
  if (!token || !window.api) return;
  window.api
    .start({ hubUrl: hub, deviceToken: token, sshPort: Number(sshportInput.value) || 22 })
    .then(() => {
      serverOn = true;
      setSrv("servidor: conectando...", "#fbbf24");
    });
}

function stopServer() {
  if (window.api) {
    window.api.stop().then(() => {
      serverOn = false;
      setSrv("servidor: parado");
    });
  }
}

if (window.api) {
  window.api.onStatus((msg) => {
    if (msg.includes("conectado al hub")) {
      setSrv(msg.startsWith("tunel") ? "servidor: tunel + terminal activos" : "servidor: " + msg, "#4ade80");
    } else if (msg.includes("error") || msg.includes("salio")) {
      setSrv("servidor: " + msg, "#f87171");
    } else {
      setSrv("servidor: " + msg);
    }
  });
}

function connect() {
  disconnect();

  const hub = baseUrl();
  const token = deviceInput.value.trim();
  if (!token) {
    setStatus("falta el DEVICE_TOKEN", "#f87171");
    return;
  }
  saveSettings();
  startServer();

  const url = `${hub}/ws/term?token=${encodeURIComponent(token)}&device=${encodeURIComponent(token)}`;

  if (!term) {
    term = new Terminal({
      fontSize: 13,
      cursorBlink: true,
      theme: { background: "#101014" },
    });
    fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open($("terminal"));
    fitAddon.fit();

    term.onData((data) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(new TextEncoder().encode(data));
      }
    });
  }

  setStatus("conectando...", "#fbbf24");

  ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";

  ws.onopen = () => {
    setStatus("conectado", "#4ade80");
    setTimeout(() => {
      fitAddon.fit();
      sendResize();
    }, 50);
  };

  ws.onmessage = (ev) => {
    if (ev.data instanceof ArrayBuffer) {
      term.write(new Uint8Array(ev.data));
    } else if (typeof ev.data === "string") {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "status") {
          if (msg.state === "offline") {
            setStatus("la Mac esta offline", "#f87171");
          } else if (msg.state === "connected") {
            setStatus("conectado", "#4ade80");
          }
        }
      } catch (_) {
        term.write(ev.data);
      }
    }
  };

  ws.onclose = () => setStatus("desconectado", "#9a9a9a");
  ws.onerror = () => setStatus("error de conexion", "#f87171");
}

function disconnect() {
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
}

let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (term && fitAddon) {
      fitAddon.fit();
      sendResize();
    }
  }, 150);
});

connectBtn.addEventListener("click", connect);
reconnectBtn.addEventListener("click", connect);

hubInput.value = localStorage.getItem("agentrelay.hub") || "https://agentrelay.duckdns.org";
deviceInput.value = localStorage.getItem("agentrelay.device") || "";
sshportInput.value = localStorage.getItem("agentrelay.sshport") || "22";

connect();