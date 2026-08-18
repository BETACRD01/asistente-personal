const { startTunnel } = require("./tunnel");
const { startTerminal } = require("./terminal");
const { startRequests } = require("./requests");

function startServer(opts) {
  const log = opts.log || console.log;
  const tunnel = startTunnel({ ...opts, log });
  const terminal = startTerminal({ ...opts, log });
  const requests = startRequests({
    hubUrl: opts.hubUrl,
    deviceToken: opts.deviceToken,
    onRequest: opts.onRequest,
    log,
  });
  return {
    stop() {
      tunnel.stop();
      terminal.stop();
      requests.stop();
    },
  };
}

module.exports = { startServer };