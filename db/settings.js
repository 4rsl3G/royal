const { q } = require('./index');

let cache = null;
let cacheAt = 0;
const TTL_MS = 10_000; // 10s

async function loadSettings() {
  const rows = await q(`SELECT \`key\`, \`value\` FROM settings`);
  const obj = {};
  for (const r of rows) obj[r.key] = r.value;
  cache = obj;
  cacheAt = Date.now();
  return obj;
}

async function getSettings(force = false) {
  if (force || !cache || Date.now() - cacheAt > TTL_MS) {
    return loadSettings();
  }
  return cache;
}

async function getSetting(key, fallback = null) {
  const s = await getSettings();
  return s[key] ?? fallback;
}

async function setSetting(key, value) {
  await q(`INSERT INTO settings (\`key\`, \`value\`) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE \`value\`=VALUES(\`value\`)`, [key, String(value)]);
  await getSettings(true);
}

function attachSettings(req, res, next) {
  req.getSettings = (force = false) => getSettings(force);
  req.getSetting = (key, fallback = null) => getSetting(key, fallback);
  req.setSetting = (key, value) => setSetting(key, value);
  next();
}

module.exports = { getSettings, getSetting, setSetting, attachSettings };
