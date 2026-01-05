const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const bodyLimit = (req, res, next) => {
  // express.json/urlencoded already set to 300kb, this is an extra guard
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
};

function buildHelmet() {
  const isProd = process.env.NODE_ENV === 'production';

  // CSP: allow Tailwind CDN, jQuery, Toastr, RemixIcon, Google Fonts, Midtrans Snap
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
      "'unsafe-inline'",
      "'unsafe-eval'",
      "https://cdn.tailwindcss.com",
      "https://code.jquery.com",
      "https://cdnjs.cloudflare.com",
      "https://cdn.jsdelivr.net",
      "https://app.sandbox.midtrans.com",
      "https://app.midtrans.com"
    ],
    styleSrc: [
      "'self'",
      "'unsafe-inline'",
      "https://fonts.googleapis.com",
      "https://cdnjs.cloudflare.com",
      "https://cdn.jsdelivr.net"
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
      "https://app.sandbox.midtrans.com",
      "https://app.midtrans.com"
    ],
    upgradeInsecureRequests: isProd ? [] : null
  };

  // remove nulls
  for (const k of Object.keys(cspDirectives)) {
    if (cspDirectives[k] === null) delete cspDirectives[k];
  }

  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: cspDirectives
    },
    crossOriginEmbedderPolicy: false, // avoid issues with snap iframe
    referrerPolicy: { policy: 'no-referrer' }
  });
}

const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
});

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false
});

function originAllowlist(req, res, next) {
  const method = req.method.toUpperCase();
  const isMutating = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';

  // Webhook MUST bypass
  if (req.path === '/midtrans/notification') return next();

  if (!isMutating) return next();

  const origin = req.get('origin');
  if (!origin) return next(); // server-to-server / curl
  const allow = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

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
