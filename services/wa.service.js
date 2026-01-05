const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');

let baileys;
try {
  // ✅ official name (recommended)
  baileys = require('baileys');
} catch (e) {
  // fallback old deprecated name
  baileys = require('@whiskeysockets/baileys');
}

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = baileys;

const AUTH_DIR = path.join(process.cwd(), 'wa_auth');

let sock = null;

// disconnected | connecting | need_pair | connected
let status = 'disconnected';

let lastQrDataUrl = null;     // data:image/png;base64,...
let lastPairingCode = null;   // e.g. "ABCD-EFGH"
let lastError = null;
let lastMe = null;

// prevent parallel reconnect loops
let starting = false;
let reconnectTimer = null;

function ensureAuthDir() {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
}

function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect(opts) {
  clearReconnect();
  reconnectTimer = setTimeout(() => {
    startWA(opts).catch(() => {});
  }, 2000);
}

function getWAStatus() {
  return {
    status,
    qr: lastQrDataUrl,
    pairingCode: lastPairingCode,
    me: lastMe,
    error: lastError ? String(lastError.message || lastError) : null
  };
}

/**
 * Start WA socket.
 * opts:
 *  - phoneNumber: "62812xxxxxx" (optional) -> to request pairing code
 * Notes:
 *  - QR may not be emitted in newer pairing flows; pairingCode is more reliable now.
 */
async function startWA(opts = {}) {
  if (starting) return getWAStatus();

  // if already alive
  if (sock && (status === 'connecting' || status === 'need_pair' || status === 'connected')) {
    return getWAStatus();
  }

  starting = true;
  clearReconnect();

  status = 'connecting';
  lastQrDataUrl = null;
  lastPairingCode = null;
  lastError = null;
  lastMe = null;

  ensureAuthDir();

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    // optional version (helps on some installs)
    let version;
    try {
      const v = await fetchLatestBaileysVersion();
      version = v?.version;
    } catch (_) {
      version = undefined;
    }

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      syncFullHistory: false,
      browser: ['Ubuntu', 'Chrome', '22.04.4'],
      version
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // ✅ QR flow (old style / some builds)
      if (qr) {
        status = 'need_pair';
        lastPairingCode = null;
        try {
          lastQrDataUrl = await QRCode.toDataURL(qr, { margin: 1, scale: 8 });
        } catch (e) {
          lastError = e;
        }
      }

      if (connection === 'open') {
        status = 'connected';
        lastQrDataUrl = null;
        lastPairingCode = null;
        lastError = null;
        lastMe = sock?.user || null;
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = code === DisconnectReason.loggedOut;

        // reset socket
        sock = null;
        lastMe = null;

        if (isLoggedOut) {
          status = 'disconnected';
          lastQrDataUrl = null;
          lastPairingCode = null;
          lastError = lastDisconnect?.error || null;
          return;
        }

        status = 'disconnected';
        lastError = lastDisconnect?.error || null;

        // ✅ auto reconnect if not loggedOut
        scheduleReconnect(opts);
      }
    });

    /**
     * ✅ Pairing code flow (recommended modern)
     * If not registered and phoneNumber provided, request pairing code.
     * This is why you didn't see QR in your logs: devicePairingData indicates pairing-code flow.
     */
    try {
      const registered = !!sock?.authState?.creds?.registered;
      const phone = String(opts.phoneNumber || '').replace(/[^\d]/g, '');

      if (!registered && phone) {
        status = 'need_pair';
        lastQrDataUrl = null;

        if (typeof sock.requestPairingCode === 'function') {
          const code = await sock.requestPairingCode(phone);
          lastPairingCode = code; // ex "ABCD-EFGH"
        } else {
          lastError = new Error('Baileys tidak mendukung requestPairingCode. Update paket "baileys".');
        }
      }
    } catch (e) {
      lastError = e;
    }

    return getWAStatus();
  } catch (e) {
    status = 'disconnected';
    lastError = e;
    sock = null;
    return getWAStatus();
  } finally {
    starting = false;
  }
}

/**
 * Logout / stop socket
 */
async function stopWA() {
  clearReconnect();
  try {
    if (sock) {
      await sock.logout();
    }
  } catch (_) {
    // ignore
  }
  sock = null;
  status = 'disconnected';
  lastQrDataUrl = null;
  lastPairingCode = null;
  lastMe = null;
  return getWAStatus();
}

function normalizeToJid(phone62) {
  // expects 62xxxxxxxx or +62xxxxxxxx
  const num = String(phone62 || '').replace(/[^\d]/g, '');
  if (!num) return null;
  return `${num}@s.whatsapp.net`;
}

async function sendWA(toPhone62, message) {
  if (!sock || status !== 'connected') throw new Error('WhatsApp not connected');
  const jid = normalizeToJid(toPhone62);
  if (!jid) throw new Error('Invalid phone number');
  const text = String(message || '');
  return sock.sendMessage(jid, { text });
}

function renderTemplate(tpl, data) {
  let out = String(tpl || '');
  for (const [k, v] of Object.entries(data || {})) {
    out = out.split(`{${k}}`).join(String(v ?? ''));
  }
  return out;
}

module.exports = {
  startWA,
  stopWA,
  getWAStatus,
  sendWA,
  renderTemplate
};
