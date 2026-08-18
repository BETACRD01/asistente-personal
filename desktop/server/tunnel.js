const WebSocket = require("ws");
const net = require("net");

function startTunnel({ hubUrl, deviceToken, sshPort = 22, sshHost = "127.0.0.1", log }) {
  const url = `${hubUrl.replace(/\/+$/, "")}/ws/mac/tcp`;
  const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${deviceToken}` } });
  const conns = new Map();

  ws.on("open", () => log("tunel: conectado al hub"));
  ws.on("error", (e) => log("tunel: error " + e.message));
  ws.on("close", () => {
    log("tunel: cerrado");
    for (const s of conns.values()) s.destroy();
    conns.clear();
  });

  ws.on("message", (raw) => {
    let frame;
    try {
      frame = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const id = frame.id;
    if (frame.type === "connect") {
      const sock = net.connect(sshPort, sshHost, () => {
        conns.set(id, sock);
        sock.on("data", (d) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "data", id, data: d.toString("base64") }));
          }
        });
        sock.on("end", () => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "eof", id }));
          }
        });
      });
      sock.on("error", (e) => log("tunel: conexion " + id + " -> " + e.message));
      sock.on("close", () => conns.delete(id));
    } else if (frame.type === "data") {
      const sock = conns.get(id);
      if (sock && !sock.destroyed) sock.write(Buffer.from(frame.data || "", "base64"));
    } else if (frame.type === "disconnect") {
      const sock = conns.get(id);
      conns.delete(id);
      if (sock) sock.destroy();
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

module.exports = { startTunnel };