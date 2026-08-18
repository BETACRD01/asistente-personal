const WebSocket = require("ws");

function startRequests({ hubUrl, deviceToken, onRequest, log }) {
  const url = `${hubUrl.replace(/\/+$/, "")}/ws/mac/req`;
  const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${deviceToken}` } });

  ws.on("open", () => log("peticiones: canal listo"));
  ws.on("error", (e) => log("peticiones: error " + e.message));
  ws.on("close", () => log("peticiones: cerrado"));

  ws.on("message", (raw) => {
    let frame;
    try {
      frame = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (frame.type !== "conn_req") return;
    const decide = (ok) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "conn_ok", id: frame.id, ok }));
      }
    };
    if (onRequest) onRequest(frame, decide);
    else decide(true);
  });

  return {
    stop() {
      try {
        ws.close();
      } catch {}
    },
  };
}

module.exports = { startRequests };