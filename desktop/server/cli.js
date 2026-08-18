const WebSocket = require('ws');

const [,, hub, token, device] = process.argv;
if (!hub || !token || !device) {
  console.error("Uso: node cli.js <hub> <token> <device>");
  process.exit(1);
}

const url = `${hub}/ws/term?token=${encodeURIComponent(token)}&device=${encodeURIComponent(device)}`;
const ws = new WebSocket(url);

ws.on('open', () => {
  console.log(`Conectado al hub: ${hub}`);
  console.log(`Conectando a la máquina: ${device}...`);
  if (process.stdout.isTTY) {
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
  if (isBinary || data instanceof Buffer) {
    process.stdout.write(data);
  } else {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'status') {
        if (msg.state === 'offline') {
          console.log('\r\n[La máquina destino está offline]\r\n');
          process.exit(1);
        } else if (msg.state === 'connected') {
          // Ya estamos conectados
        }
      }
    } catch {
      process.stdout.write(data.toString());
    }
  }
});

ws.on('close', () => {
  console.log('\r\n[Conexión cerrada]\r\n');
  process.exit(0);
});

ws.on('error', (err) => {
  console.log(`\r\n[Error de conexión: ${err.message}]\r\n`);
  process.exit(1);
});

if (process.stdout.isTTY) {
  process.stdout.on('resize', () => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols: process.stdout.columns, rows: process.stdout.rows }));
    }
  });
}
