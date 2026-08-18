const { startTunnel } = require("./tunnel");
const { startTerminal } = require("./terminal");

function startServer(opts) {
  const log = opts.log || console.log;
  const tunnel = startTunnel({ ...opts, log });
  const terminal = startTerminal({ ...opts, log });
  return {
    stop() {
      tunnel.stop();
      terminal.stop();
    },
  };
}

module.exports = { startServer };