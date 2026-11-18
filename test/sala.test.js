const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sala_test_'));
const tmpData = path.join(tmpRoot, 'data');
const tmpUploads = path.join(tmpRoot, 'uploads');
fs.mkdirSync(tmpData, { recursive: true });
fs.mkdirSync(tmpUploads, { recursive: true });

fs.writeFileSync(path.join(tmpData, 'settings.json'), JSON.stringify({
  statuses: ['เสนอเรื่องเข้ามา', 'อยู่ระหว่างพิจารณา', 'บรรจุในแผน', 'ดำเนินการแล้วเสร็จ'],
  communities: ['แม่สาย หมู่ 1']
}), 'utf8');
fs.writeFileSync(path.join(tmpData, 'proposals.json'), JSON.stringify([
  {
    id: 1,
    code: 'PRJ-2569-001',
    timestamp: '2026-11-11 10:00:00',
    community: 'แม่สาย หมู่ 1',
    category: 'ด้านโครงสร้างพื้นฐาน',
    problem: 'ท่อระบายน้ำอุดตัน',
    solution: 'ลอกท่อ',
    location: 'ซอย 1',
    name: 'นายสมชาย ทดสอบ',
    phone: '0812345678',
    age: 50,
    clientIp: '203.0.113.55',
    status: 'เสนอเรื่องเข้ามา'
  }
]), 'utf8');
fs.writeFileSync(path.join(tmpData, 'users.json'), '[]', 'utf8');
fs.writeFileSync(path.join(tmpData, 'news.json'), '[]', 'utf8');

process.env.SALA_DATA_DIR = tmpData;
process.env.SALA_UPLOADS_DIR = tmpUploads;
process.env.SALA_SEC_LOGS_FILE = path.join(tmpData, 'security_logs.json');
process.env.MASTER_KEY = 'thedatazero';
process.env.MASTER_PASSWORD = 'test-sala-master-pass';
process.env.CORS_ORIGINS = 'https://maesaios.com,http://localhost:3405';

const { createServer } = require('../control_center.cjs');
const { resetRadarStateForTests } = require('../src/security/radar.cjs');
const { resetAuthStateForTests } = require('../src/auth/auth.cjs');

let srv;
let base;

test.before(async () => {
  srv = createServer();
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${srv.address().port}`;
});

test.after(async () => {
  if (srv) await new Promise(r => srv.close(r));
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test('no hardcoded Master password remains in control_center.cjs, src/, or docker-compose.yml', () => {
  const secret = ['Kn123990002466', '119842528'].join('');
  const files = [
    path.join(__dirname, '..', 'control_center.cjs'),
    path.join(__dirname, '..', 'docker-compose.yml'),
    ...fs.readdirSync(path.join(__dirname, '..', 'src'), { recursive: true })
      .filter(f => f.endsWith('.cjs'))
      .map(f => path.join(__dirname, '..', 'src', f))
  ];
  for (const f of files) {
    assert.equal(fs.readFileSync(f, 'utf8').includes(secret), false, `${f} must not contain hardcoded password`);
  }
});

test('public pages, CSS/JS assets, and health API serve 200 OK', async () => {
  resetRadarStateForTests();
  for (const p of ['/sala/', '/sala/manage', '/sala/back', '/sala/print', '/sala/js/public.js', '/sala/js/manage.js', '/sala/js/back.js', '/sala/js/print.js', '/sala/css/style.css', '/sala/api/health', '/sala/api/stats', '/sala/api/news']) {
    const res = await fetch(`${base}${p}`);
    assert.equal(res.status, 200, `Expected 200 for ${p}`);
  }
});

test('PDPA: unauthenticated GET /proposals and /proposals/:id mask phone, name, age, clientIp', async () => {
  const listRes = await fetch(`${base}/sala/api/proposals?public=false`).then(r => r.json());
  assert.equal(listRes.success, true);
  assert.equal(listRes.data[0].phone, undefined);
  assert.equal(listRes.data[0].name, undefined);
  assert.equal(listRes.data[0].clientIp, undefined);

  const singleRes = await fetch(`${base}/sala/api/proposals/1`).then(r => r.json());
  assert.equal(singleRes.success, true);
  assert.equal(singleRes.data.phone, undefined);
  assert.equal(singleRes.data.name, undefined);
});

test('MASTER_KEY cannot be used as password and password-only master-login is blocked', async () => {
  resetRadarStateForTests();
  const r1 = await fetch(`${base}/sala/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'thedatazero', password: 'thedatazero' })
  });
  assert.equal(r1.status, 401);

  const r2 = await fetch(`${base}/sala/api/auth/master-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'test-sala-master-pass' })
  });
  assert.equal(r2.status, 400);
});

test('anonymous callers blocked 401 on /users, /logs, /security/banned-ips, and proposal mutations', async () => {
  resetRadarStateForTests();
  resetAuthStateForTests();
  for (const [method, url] of [
    ['GET', '/sala/api/users'],
    ['POST', '/sala/api/users'],
    ['GET', '/sala/api/logs'],
    ['DELETE', '/sala/api/logs'],
    ['GET', '/sala/api/security/banned-ips'],
    ['POST', '/sala/api/security/unban'],
    ['PUT', '/sala/api/proposals/1'],
    ['DELETE', '/sala/api/proposals/1'],
    ['POST', '/sala/api/settings']
  ]) {
    const r = await fetch(`${base}${url}`, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'POST' || method === 'PUT' ? '{}' : undefined });
    assert.equal(r.status, 401, `Expected 401 for anonymous ${method} ${url}`);
  }
});

test('DEC-027 & Magic Bytes: Admin sees PII when logged in, gets 403 on /back & /users, and fake image is rejected', async () => {
  resetRadarStateForTests();

  const saLogin = await fetch(`${base}/sala/api/auth/master-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'thedatazero', password: 'test-sala-master-pass' })
  }).then(r => r.json());
  assert.equal(saLogin.success, true);

  const mkAdmin = await fetch(`${base}/sala/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${saLogin.token}` },
    body: JSON.stringify({ username: 'salaadmin', password: 'salapass123', name: 'ปลัดทดสอบ', role: 'Admin' })
  }).then(r => r.json());
  assert.equal(mkAdmin.success, true);

  const backGate = await fetch(`${base}/sala/api/auth/master-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'salaadmin', password: 'salapass123' })
  });
  assert.equal(backGate.status, 403);

  const admLogin = await fetch(`${base}/sala/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'salaadmin', password: 'salapass123' })
  }).then(r => r.json());
  assert.equal(admLogin.success, true);

  // Admin receives unmasked proposal details
  const admProps = await fetch(`${base}/sala/api/proposals`, {
    headers: { Authorization: `Bearer ${admLogin.token}` }
  }).then(r => r.json());
  assert.equal(admProps.data[0].phone, '0812345678');

  // Admin blocked 403 from /users, /logs, /security/banned-ips
  assert.equal((await fetch(`${base}/sala/api/users`, { headers: { Authorization: `Bearer ${admLogin.token}` } })).status, 403);
  assert.equal((await fetch(`${base}/sala/api/logs`, { headers: { Authorization: `Bearer ${admLogin.token}` } })).status, 403);
  assert.equal((await fetch(`${base}/sala/api/security/banned-ips`, { headers: { Authorization: `Bearer ${admLogin.token}` } })).status, 403);

  // Magic Bytes: reject PHP script disguised as data:image/png
  const fakePhoto = await fetch(`${base}/sala/api/proposals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      community: 'แม่สาย หมู่ 1',
      problem: 'ทดสอบรูปปลอม',
      form_token_time: Date.now() - 5000,
      photo: 'data:image/png;base64,' + Buffer.from('<?php echo 1; ?>').toString('base64')
    })
  });
  assert.equal(fakePhoto.status, 400);
});

test('strict CORS blocks evil origin and 404 HTML escapes reflected XSS', async () => {
  const evilCors = await fetch(`${base}/sala/api/health`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' }
  });
  assert.equal(evilCors.status, 403);
  assert.equal(evilCors.headers.get('access-control-allow-origin'), null);

  const notFound = await fetch(`${base}/sala/%3Cscript%3Ealert(1)%3C/script%3E`);
  assert.equal(notFound.status, 404);
  const html = await notFound.text();
  assert.equal(html.includes('<script>alert(1)</script>'), false);
});
