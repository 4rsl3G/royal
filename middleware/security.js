// middleware/security.js  (final)
// NOTE: Ini sebenarnya security middleware (helmet + rate limit + origin allowlist).
// Dipakai dari server.js: const { buildHelmet, publicLimiter, loginLimiter, bodyLimit, originAllowlist } = require('./middleware/validate');

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

/**
 * Extra small guard (body size limit sudah di express.json/urlencoded).
 * Sekalian set header anti-sniffing.
 */
const bodyLimit = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
};

function buildHelmet() {
  const isProd = process.env.NODE_ENV === 'production';

  // CSP: allow Tailwind CDN, jQuery, Toastr, RemixIcon, Google Fonts, AOS (unpkg), Midtrans Snap
  // IMPORTANT:
  // - AOS diambil dari unpkg.com
  // - Midtrans Snap bisa sandbox / production
  // - Snap pakai iframe -> frameSrc wajib allow
  // - connectSrc allow api midtrans + sandbox
  const cspDirectives = {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],

    // Midtrans Snap uses iframe
    frameSrc: [
      "'self'",
      "https://app.sandbox.midtrans.com",
      "https://app.midtrans.com"
    ],

    scriptSrc: [
      "'self'",
      // NOTE: Tailwind CDN butuh inline/eval untuk dev; kamu bisa harden nanti kalau pakai tailwind build.
      "'unsafe-inline'",
      "'unsafe-eval'",

      // CDN umum
      "https://cdn.tailwindcss.com",
      "https://code.jquery.com",
      "https://cdnjs.cloudflare.com",
      "https://cdn.jsdelivr.net",
      "https://unpkg.com",

      // Midtrans Snap
      "https://app.sandbox.midtrans.com",
      "https://app.midtrans.com"
    ],

    styleSrc: [
      "'self'",
      "'unsafe-inline'",
      "https://fonts.googleapis.com",
      "https://cdnjs.cloudflare.com",
      "https://cdn.jsdelivr.net",
      "https://unpkg.com"
    ],

    fontSrc: [
      "'self'",
      "https://fonts.gstatic.com",
      "https://cdn.jsdelivr.net"
    ],

    imgSrc: [
      "'self'",
      "data:",
      "blob:",
      "https:"
    ],

    connectSrc: [
      "'self'",
      // Midtrans API endpoints (CoreApi / Snap callbacks, dll)
      "https://api.sandbox.midtrans.com",
      "https://api.midtrans.com",

      // Snap script sometimes calls these
      "https://app.sandbox.midtrans.com",
      "https://app.midtrans.com"
    ],

    // kalau prod: paksa https
    ...(isProd ? { upgradeInsecureRequests: [] } : {})
  };

  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: cspDirectives
    },

    // Snap iframe bisa bermasalah kalau COEP aktif
    crossOriginEmbedderPolicy: false,

    // lain-lain hardening
    referrerPolicy: { policy: 'no-referrer' },
    frameguard: { action: 'deny' }, // same as frameAncestors none
    noSniff: true,
    hidePoweredBy: true
  });
}

// Rate limit public
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limit login
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Origin allowlist untuk request mutating (POST/PUT/PATCH/DELETE).
 * - Webhook Midtrans harus bypass
 * - Kalau origin kosong -> allow (server-to-server/curl)
 * - ALLOWED_ORIGINS bisa multiple dipisah koma
 */
function originAllowlist(req, res, next) {
  const method = req.method.toUpperCase();
  const isMutating = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';

  // Webhook MUST bypass (tanpa CSRF & tanpa origin check)
  // Pastikan route webhook kamu benar-benar "/midtrans/notification"
  if (req.path === '/midtrans/notification') return next();

  if (!isMutating) return next();

  const origin = req.get('origin');
  if (!origin) return next(); // allow server-to-server / curl

  const allow = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (allow.length === 0) return next(); // no allowlist configured -> allow

  if (!allow.includes(origin)) {
    return res.status(403).json({ ok: false, message: 'Origin not allowed' });
  }
  return next();
}

module.exports = {
  buildHelmet,
  publicLimiter,
  loginLimiter,
  bodyLimit,
  originAllowlist
};
