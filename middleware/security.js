// middleware/security.js (FINAL)
// Helmet + CSP (CDN + AOS + Midtrans Snap) + rate limit + origin allowlist + body size guard
// Dipakai di server.js:
// const { buildHelmet, publicLimiter, loginLimiter, bodyLimit, originAllowlist } = require('./middleware/security');

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

/**
 * Extra small guard (express.json/urlencoded sudah limit 300kb)
 * Sekalian set header anti-sniff.
 */
const bodyLimit = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
};

function buildHelmet() {
  const isProd = process.env.NODE_ENV === 'production';

  // CSP: allow Tailwind CDN, jQuery, Toastr, RemixIcon, Google Fonts Inter, AOS (unpkg), Midtrans Snap
  // IMPORTANT NOTES:
  // - Tailwind CDN membutuhkan unsafe-eval (dan kadang unsafe-inline). Ini tradeoff.
  //   Kalau mau paling ketat, build tailwind sendiri (bukan CDN).
  // - Snap memakai iframe: frameSrc harus allow app.midtrans.com + sandbox.
  // - AOS diambil dari unpkg.com: harus allow di scriptSrc & styleSrc.
  const directives = {
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
      // Needed for Tailwind CDN + some CDNs; tradeoff for security.
      "'unsafe-inline'",
      "'unsafe-eval'",

      // CDNs
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

      // Midtrans API endpoints (server to midtrans; browser biasanya tidak langsung call,
      // tapi Snap/JS bisa butuh connect)
      "https://api.sandbox.midtrans.com",
      "https://api.midtrans.com",

      // Snap endpoints
      "https://app.sandbox.midtrans.com",
      "https://app.midtrans.com"
    ]
  };

  // If production, enforce https
  if (isProd) {
    directives.upgradeInsecureRequests = [];
  }

  return helmet({
    // CSP
    contentSecurityPolicy: {
      useDefaults: false,
      directives
    },

    // Snap iframe can break if COEP enabled
    crossOriginEmbedderPolicy: false,

    // Sensible defaults
    referrerPolicy: { policy: 'no-referrer' },

    // Use frameguard too (redundant with frameAncestors, but ok)
    frameguard: { action: 'deny' }
  });
}

// Rate limit public API traffic
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limit login attempts
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Origin allowlist untuk request mutating (POST/PUT/PATCH/DELETE).
 * - Webhook Midtrans bypass
 * - Kalau origin kosong -> allow (server-to-server/curl)
 * - ALLOWED_ORIGINS = "https://domain1,https://domain2"
 */
function originAllowlist(req, res, next) {
  const method = req.method.toUpperCase();
  const isMutating = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';

  // Webhook MUST bypass (tanpa CSRF & tanpa origin check)
  if (req.path === '/midtrans/notification') return next();

  if (!isMutating) return next();

  const origin = req.get('origin');
  if (!origin) return next(); // allow server-to-server/curl

  const allow = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  // If allowlist not set -> allow
  if (allow.length === 0) return next();

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
