const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys');

let sock = null;
let status = 'disconnected'; // disconnected/connecting/need_pair/connected
let lastQrDataUrl = null;
let lastError = null;

async function startWA() {
  if (sock && (status === 'connecting' || status === 'need_pair' || status === 'connected')) {
    return { status, qr: lastQrDataUrl };
  }

  status = 'connecting';
  lastQrDataUrl = null;
  lastError = null;

  const authDir = path.join(process.cwd(), 'wa_auth');
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      status = 'need_pair';
      try {
        lastQrDataUrl = await QRCode.toDataURL(qr, { margin: 1, scale: 8 });
      } catch (e) {
        lastError = e;
      }
    }

    if (connection === 'open') {
      status = 'connected';
      lastQrDataUrl = null;
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const reason = code;

      if (reason === DisconnectReason.loggedOut) {
        status = 'disconnected';
        sock = null;
        lastQrDataUrl = null;
        return;
      }

      // auto reconnect
      status = 'disconnected';
      sock = null;
      try {
        await startWA();
      } catch (e) {
        lastError = e;
      }
    }
  });

  return { status, qr: lastQrDataUrl };
}

function getWAStatus() {
  return { status, qr: lastQrDataUrl, error: lastError ? String(lastError.message || lastError) : null };
}

function normalizeToJid(phone62) {
  // expects 62xxxxxxxx
  return `${phone62}@s.whatsapp.net`;
}

async function sendWA(toPhone62, message) {
  if (!sock || status !== 'connected') throw new Error('WhatsApp not connected');
  const jid = normalizeToJid(toPhone62);
  return sock.sendMessage(jid, { text: message });
}

function renderTemplate(tpl, data) {
  let out = String(tpl || '');
  for (const [k, v] of Object.entries(data)) {
    out = out.split(`{${k}}`).join(String(v ?? ''));
  }
  return out;
}

module.exports = {
  startWA,
  getWAStatus,
  sendWA,
  renderTemplate
};
