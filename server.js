require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const MySQLStore = require('connect-mysql2')(session);
const morgan = require('morgan');

const { pool } = require('./db');
const { buildHelmet, publicLimiter, loginLimiter, bodyLimit, originAllowlist } = require('./middleware/security');
const { attachSettings } = require('./db/settings');

const publicRoutes = require('./routes/public.routes');
const apiRoutes = require('./routes/api.routes');
const adminRoutes = require('./routes/admin.routes');
const adminApiRoutes = require('./routes/admin.api.routes');

const app = express();
app.disable('x-powered-by');

const PORT = process.env.PORT || 3000;
const ADMIN_BASE_PATH = (process.env.ADMIN_BASE_PATH || '/admin').startsWith('/')
  ? process.env.ADMIN_BASE_PATH
  : `/${process.env.ADMIN_BASE_PATH}`;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

if (process.env.LOG_REQUESTS === 'true') {
  app.use(morgan('combined'));
}

app.use(buildHelmet());
app.use(bodyLimit);

app.use(cookieParser());

// Static
app.use('/public', express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
app.use('/uploads', express.static(path.join(__dirname, process.env.UPLOAD_DIR || 'uploads'), { maxAge: '1h' }));

// Sessions (MySQL)
const store = new MySQLStore(
  {
    expiration: 1000 * 60 * 60 * 24 * 7,
    endConnectionOnClose: false
  },
  pool
);

app.use(
  session({
    name: 'rd.sid',
    secret: process.env.SESSION_SECRET || 'change_this',
    resave: false,
    saveUninitialized: false,
    store,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: (process.env.COOKIE_SECURE || 'false') === 'true',
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);

// JSON / URLENCODED
app.use(express.json({ limit: '300kb' }));
app.use(express.urlencoded({ extended: true, limit: '300kb' }));

// Attach settings cache helper to req
app.use(attachSettings);

// Origin allowlist for state-changing requests (except webhook)
app.use(originAllowlist);

// Rate limiters
app.use('/api', publicLimiter);
app.use(`${ADMIN_BASE_PATH}/login`, loginLimiter);

// Routes
app.use('/', publicRoutes);
app.use('/api', apiRoutes);

// Admin
app.use(ADMIN_BASE_PATH, adminRoutes);
app.use(`${ADMIN_BASE_PATH}/api`, adminApiRoutes);

// Health
app.get('/healthz', (req, res) => res.json({ ok: true }));

// Error handler
app.use((err, req, res, next) => {
  if (err && err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ ok: false, message: 'CSRF token invalid/expired. Refresh page.' });
  }
  console.error(err);
  const status = err.status || 500;
  if (req.path.startsWith('/api') || req.path.includes('/api/')) {
    return res.status(status).json({ ok: false, message: err.message || 'Server error' });
  }
  return res.status(status).send('Server error');
});

app.listen(PORT, () => {
  console.log(`Royal Dreams running on port ${PORT}`);
  console.log(`Admin path: ${ADMIN_BASE_PATH}`);
});
