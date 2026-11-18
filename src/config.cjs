const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PROJECT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = process.env.SALA_DATA_DIR || path.join(PROJECT_DIR, 'data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const PUBLIC_DIR = path.join(PROJECT_DIR, 'public');

const PROPOSALS_FILE = path.join(DATA_DIR, 'proposals.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const NEWS_FILE = path.join(DATA_DIR, 'news.json');
const SECURITY_LOGS_FILE = process.env.SALA_SEC_LOGS_FILE || path.join(DATA_DIR, 'security_logs.json');
const UPLOADS_DIR = process.env.SALA_UPLOADS_DIR || path.join(PUBLIC_DIR, 'uploads');

function loadEnvFile(envPath = path.join(PROJECT_DIR, '.env')) {
  try {
    if (!fs.existsSync(envPath)) return;
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      const val = line.slice(eq + 1).trim();
      if (key && process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  } catch (_) {}
}

loadEnvFile();

const PORT = parseInt(process.env.PORT, 10) || 3405;
const DEFAULT_CORS_ORIGINS = [
  'https://maesaios.com',
  'http://maesaios.com',
  'http://localhost:3405',
  'http://127.0.0.1:3405'
];

function getAllowedOrigins() {
  const raw = String(process.env.CORS_ORIGINS || '').trim();
  if (!raw) return DEFAULT_CORS_ORIGINS;
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

const ephemeralSecrets = new Map();
const warnedMissing = new Set();

function warnOnce(key, message) {
  if (warnedMissing.has(key)) return;
  warnedMissing.add(key);
  console.error(message);
}

function getMasterCredentials() {
  const masterKey = String(process.env.MASTER_KEY || '').trim();
  const masterPassword = String(process.env.MASTER_PASSWORD || '').trim();
  const configured = Boolean(masterKey && masterPassword);
  if (!configured) {
    warnOnce('master', '[SECURITY] MASTER_KEY or MASTER_PASSWORD is not configured; Master Key login is fail-closed.');
  }
  return { masterKey, masterPassword, configured };
}

function getHmacSecret(purpose = 'sala_session_v1') {
  for (const name of ['SESSION_SECRET', 'MASTER_PASSWORD']) {
    const val = String(process.env[name] || '').trim();
    if (val) {
      return crypto.createHash('sha256').update(`${val}:${purpose}`).digest();
    }
  }
  if (!ephemeralSecrets.has(purpose)) {
    warnOnce(`hmac:${purpose}`, `[SECURITY] No env secret found for ${purpose}; using ephemeral per-process key.`);
    ephemeralSecrets.set(purpose, crypto.randomBytes(32));
  }
  return ephemeralSecrets.get(purpose);
}

function ensureDirectories() {
  [DATA_DIR, BACKUPS_DIR, PUBLIC_DIR, UPLOADS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

module.exports = {
  PROJECT_DIR,
  DATA_DIR,
  BACKUPS_DIR,
  PUBLIC_DIR,
  PROPOSALS_FILE,
  USERS_FILE,
  SETTINGS_FILE,
  NEWS_FILE,
  SECURITY_LOGS_FILE,
  UPLOADS_DIR,
  PORT,
  getAllowedOrigins,
  getMasterCredentials,
  getHmacSecret,
  ensureDirectories
};
