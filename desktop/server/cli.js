const WebSocket = require('ws');

const [,, hub, token, device] = process.argv;
if (!hub || !token || !device) {
  console.error("Uso: node cli.js <hub> <token> <device>");
  process.exit(1);
}

const isTTY = process.stdout.isTTY;
const C = (code) => (isTTY ? `\x1b[${code}m` : "");
const GREEN = C("32"), YELLOW = C("33"), RED = C("31"), DIM = C("2"), BOLD = C("1"), RESET = C("0");

function step(text, color, mark) {
  console.log(`${color}${mark} ${text}${RESET}`);
}

console.log(`${DIM}user@server:~$${RESET} conectar ${device}`);
step(`Conectando a ${device}...`, YELLOW, "●");

const url = `${hub}/ws/term?token=${encodeURIComponent(token)}&device=${encodeURIComponent(device)}`;
const ws = new WebSocket(url);

let established = false;

ws.on('open', () => {
  step("Autenticando...", GREEN, "●");
  if (isTTY) {
    ws.send(JSON.stringify({ type: 'resize', cols: process.stdout.columns, rows: process.stdout.rows }));
  }
});

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}
process.stdin.on('data', d => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(d);
  }
});

ws.on('message', (data, isBinary) => {
  if (isBinary) {
    if (!established) {
      step("Conexión establecida", GREEN, "✓");
      established = true;
    }
    process.stdout.write(data);
  } else {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'status') {
        if (msg.state === 'offline') {
          step("La máquina destino está offline", RED, "✕");
          process.exit(1);
        } else if (msg.state === 'connected') {
          if (!established) {
            step("Conexión establecida", GREEN, "✓");
            established = true;
          }
        }
      }
    } catch {
      process.stdout.write(data.toString());
    }
  }
});

ws.on('close', () => {
  console.log(`${DIM}[Conexión cerrada]${RESET}`);
  process.exit(0);
});

ws.on('error', (err) => {
  step(`Error de conexión: ${err.message}`, RED, "✕");
  process.exit(1);
});

if (isTTY) {
  process.stdout.on('resize', () => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols: process.stdout.columns, rows: process.stdout.rows }));
    }
  });
}