const $ = (id) => document.getElementById(id);

const hubInput = $("hub");
const deviceInput = $("device");
const sshportInput = $("sshport");
const connectBtn = $("connect");
const reconnectBtn = $("reconnect");
const statusEl = $("status");
const srvEl = $("srvstatus");
const scanBtn = $("scan");
const devicesSel = $("devices");
const serveChk = $("serve");

let ws = null;
let term = null;
let fitAddon = null;
let serverOn = false;
let selectedDevice = "";

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

function shortTok(t) {
  return t.length > 12 ? "…" + t.slice(-12) : t;
}

function sendResize() {
  if (ws && ws.readyState === WebSocket.OPEN && term) {
    ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
  }
}

async function scanDevices() {
  const token = deviceInput.value.trim();
  if (!token) {
    setStatus("falta el DEVICE_TOKEN", "#f87171");
    return;
  }
  const httpUrl = baseUrl().replace(/^wss?/, "https");
  try {
    const res = await fetch(`${httpUrl}/devices?token=${encodeURIComponent(token)}`);
    if (!res.ok) {
      setSrv("no se pudo listar maquinas (HTTP " + res.status + ")", "#f87171");
      return;
    }
    const data = await res.json();
    const sel = devicesSel;
    sel.innerHTML = '<option value="">(elegir máquina)</option>';
    const token2 = deviceInput.value.trim();
    for (const d of data.devices || []) {
      const flags = (d.terminal ? "terminal" : "") + (d.tunnel ? "+tunel" : "") + (!d.terminal && !d.tunnel ? "offline" : "");
      const opt = document.createElement("option");
      opt.value = d.device;
      opt.textContent = `${shortTok(d.device)}  [${flags}]`;
      sel.appendChild(opt);
    }
    if ((data.devices || []).some((d) => d.device === token2)) {
      sel.value = token2;
    }
    setSrv(`maquinas: ${(data.devices || []).length}`, "#4ade80");
  } catch (e) {
    setSrv("error al buscar: " + e.message, "#f87171");
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
      setSrv("servidor: " + msg, "#4ade80");
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

  if (serveChk.checked) {
    startServer();
  } else {
    stopServer();
  }

  const dev = selectedDevice || token;

  const url = `${hub}/ws/term?token=${encodeURIComponent(token)}&device=${encodeURIComponent(dev)}`;

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

  setStatus(dev === token ? "conectando (esta máquina)..." : "conectando a otra máquina...", "#fbbf24");

  ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";

  ws.onopen = () => {
    setStatus(dev === token ? "conectado" : "conectado a otra máquina", "#4ade80");
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
            setStatus("esa máquina está offline", "#f87171");
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
scanBtn.addEventListener("click", scanDevices);
devicesSel.addEventListener("change", () => {
  selectedDevice = devicesSel.value || "";
  setStatus("máquina elegida: " + (selectedDevice ? shortTok(selectedDevice) : "esta máquina"), "#fbbf24");
});

hubInput.value = localStorage.getItem("agentrelay.hub") || "https://agentrelay.duckdns.org";
deviceInput.value = localStorage.getItem("agentrelay.device") || "";
sshportInput.value = localStorage.getItem("agentrelay.sshport") || "22";

connect();