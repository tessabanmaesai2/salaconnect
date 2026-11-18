// ============================================================
// MAESAI SALA CONNECT — Modular Server Entrypoint (Port 3405)
// ============================================================

const http = require('http');
const { PORT, ensureDirectories } = require('./src/config.cjs');
const { loadSecurityLogs } = require('./src/security/radar.cjs');
const { loadUsers, getUsers } = require('./src/users/userService.cjs');
const { loadProposalData } = require('./src/proposals/proposalService.cjs');
const { handleRequest } = require('./src/routes/router.cjs');

function initEngine() {
  ensureDirectories();
  const users = loadUsers();
  loadSecurityLogs();
  loadProposalData(users);
}

function createServer() {
  initEngine();
  return http.createServer((req, res) => {
    handleRequest(req, res).catch(err => {
      console.error('[SERVER ERROR]', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: 'Internal Server Error' }));
      }
    });
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, '0.0.0.0', () => {
    console.log('============================================================');
    console.log('MAESAI SALA CONNECT — Modular Engine Started');
    console.log(`Port: ${PORT}`);
    console.log(`Main Web:     http://localhost:${PORT}/sala`);
    console.log(`Management:   http://localhost:${PORT}/sala/manage`);
    console.log(`ID/Back:      http://localhost:${PORT}/sala/back`);
    console.log(`Print:        http://localhost:${PORT}/sala/print`);
    console.log(`API Health:   http://localhost:${PORT}/sala/api/health`);
    console.log('============================================================');
  });
}

module.exports = { createServer, getUsers };
