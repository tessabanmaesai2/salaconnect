// ============================================================
// MAESAI SALA CONNECT — Production Server Entrypoint
// Standard: Municipal DEC-020 & DEC-022 (Port 3405, /sala/)
// ============================================================
const { PORT } = require('./src/config.cjs');
const { createServer } = require('./control_center.cjs');

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
