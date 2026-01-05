require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const morgan = require('morgan');

const { pool } = require('./db'); // mysql2/promise pool
const { buildHelmet, publicLimiter, loginLimiter, bodyLimit, originAllowlist } = require('./middleware/security');
const { attachSettings } = require('./db/settings');

const publicRoutes = require('./routes/public.routes');
const apiRoutes = require('./routes/api.routes');
const adminRoutes = require('./routes/admin.routes');
const adminApiRoutes = require('./routes/admin.api.routes');
const webhookRoutes = require('./routes/webhook.routes');

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

/**
 * ✅ Custom MySQL Session Store (mysql2/promise)
 * Table: sessions(session_id PK, expires INT, data MEDIUMTEXT)
 * - expires = unix timestamp (seconds)
 * - data = JSON string of session object
 */
class MySQLSessionStore extends session.Store {
  /**
   * @param {{ pool: any, table?: string, cleanupIntervalMs?: number }} opts
   */
  constructor(opts) {
    super();
    this.pool = opts.pool;
    this.table = opts.table || 'sessions';
    this.cleanupIntervalMs = opts.cleanupIntervalMs || 60 * 60 * 1000; // 1 hour
    this._startCleanup();
  }

  _startCleanup() {
    // Best-effort cleanup expired sessions
    setInterval(async () => {
      try {
        const now = Math.floor(Date.now() / 1000);
        await this.pool.execute(`DELETE FROM ${this.table} WHERE expires < ?`, [now]);
      } catch (_) {
        // ignore
      }
    }, this.cleanupIntervalMs).unref();
  }

  async get(sid, cb) {
    try {
      const [rows] = await this.pool.execute(
        `SELECT data, expires FROM ${this.table} WHERE session_id = ? LIMIT 1`,
        [sid]
      );
      if (!rows || rows.length === 0) return cb(null, null);

      const row = rows[0];
      const now = Math.floor(Date.now() / 1000);
      if (Number(row.expires) < now) {
        // expired -> delete
        await this.pool.execute(`DELETE FROM ${this.table} WHERE session_id = ?`, [sid]);
        return cb(null, null);
      }

      const sess = JSON.parse(row.data || '{}');
      return cb(null, sess);
    } catch (err) {
      return cb(err);
    }
  }

  async set(sid, sess, cb) {
    try {
      const json = JSON.stringify(sess || {});
      const maxAgeMs =
        sess?.cookie?.maxAge && Number.isFinite(sess.cookie.maxAge)
          ? Number(sess.cookie.maxAge)
          : 1000 * 60 * 60 * 24 * 7;

      const expires = Math.floor((Date.now() + maxAgeMs) / 1000);

      await this.pool.execute(
        `INSERT INTO ${this.table} (session_id, expires, data)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE expires=VALUES(expires), data=VALUES(data)`,
        [sid, expires, json]
      );
      return cb && cb(null);
    } catch (err) {
      return cb && cb(err);
    }
  }

  async destroy(sid, cb) {
    try {
      await this.pool.execute(`DELETE FROM ${this.table} WHERE session_id = ?`, [sid]);
      return cb && cb(null);
    } catch (err) {
      return cb && cb(err);
    }
  }

  async touch(sid, sess, cb) {
    try {
      const maxAgeMs =
        sess?.cookie?.maxAge && Number.isFinite(sess.cookie.maxAge)
          ? Number(sess.cookie.maxAge)
          : 1000 * 60 * 60 * 24 * 7;

      const expires = Math.floor((Date.now() + maxAgeMs) / 1000);

      await this.pool.execute(
        `UPDATE ${this.table} SET expires = ? WHERE session_id = ?`,
        [expires, sid]
      );
      return cb && cb(null);
    } catch (err) {
      return cb && cb(err);
    }
  }
}

// ✅ Use custom store
const store = new MySQLSessionStore({ pool, table: 'sessions' });

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

// Attach settings cache helper
app.use(attachSettings);

// Origin allowlist for state-changing requests (except webhook)
app.use(originAllowlist);

// Rate limiters
app.use('/api', publicLimiter);
app.use(`${ADMIN_BASE_PATH}/login`, loginLimiter);

// Routes
app.use('/', publicRoutes);
app.use('/api', apiRoutes);
app.use('/', webhookRoutes);

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
