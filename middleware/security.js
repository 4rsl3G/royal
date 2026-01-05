// middleware/security.js (UPDATED)
// Helmet + CSP (Tailwind + jQuery + Toastr + DataTables + RemixIcon + Google Fonts + AOS + Midtrans Snap)
// + rate limit + origin allowlist + body size guard

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

  /**
   * CSP notes:
   * - Tailwind CDN butuh 'unsafe-eval' (dan kadang inline) => tradeoff.
   * - DataTables (cdnjs) butuh script + style dari cdnjs.cloudflare.com.
   * - Toastr (cdnjs) sudah masuk.
   * - Midtrans Snap butuh frame + script dari app.midtrans.com / sandbox.
   * - Admin SPA load partial via AJAX dari origin sendiri => connectSrc 'self' cukup.
   */
  const directives = {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    objectSrc: ["'none'"],

    // allow embed only from midtrans (snap iframe)
    frameAncestors: ["'none'"],
    frameSrc: [
      "'self'",
      "https://app.sandbox.midtrans.com",
      "https://app.midtrans.com"
    ],

    scriptSrc: [
      "'self'",

      // Tailwind CDN requires these (tradeoff)
      "'unsafe-inline'",
      "'unsafe-eval'",

      // CDNs (include DataTables from Cloudflare/cdnjs)
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

      // Google fonts + DataTables CSS from cdnjs
      "https://fonts.googleapis.com",
      "https://cdnjs.cloudflare.com",
      "https://cdn.jsdelivr.net",
      "https://unpkg.com"
    ],

    fontSrc: [
      "'self'",
      "https://fonts.gstatic.com",
      "https://cdn.jsdelivr.net",
      "https://cdnjs.cloudflare.com"
    ],

    imgSrc: [
      "'self'",
      "data:",
      "blob:",
      "https:"
    ],

    connectSrc: [
      "'self'",

      // Midtrans (snap can use it)
      "https://api.sandbox.midtrans.com",
      "https://api.midtrans.com",
      "https://app.sandbox.midtrans.com",
      "https://app.midtrans.com",

      // (Optional) allow CDN fetches if browser treats some loads as fetch in strict envs
      "https://cdnjs.cloudflare.com",
      "https://code.jquery.com",
      "https://cdn.jsdelivr.net",
      "https://unpkg.com"
    ],

    // allow forms post back to self + midtrans (optional)
    formAction: ["'self'", "https://app.sandbox.midtrans.com", "https://app.midtrans.com"],

    // allow workers if ever used by libs (safe)
    workerSrc: ["'self'", "blob:"],

    // allow manifest if any
    manifestSrc: ["'self'"]
  };

  if (isProd) {
    directives.upgradeInsecureRequests = [];
  }

  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives
    },

    // Snap iframe can break if COEP enabled
    crossOriginEmbedderPolicy: false,

    referrerPolicy: { policy: 'no-referrer' },

    // keep deny iframe
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
