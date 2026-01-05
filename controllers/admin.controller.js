const bcrypt = require('bcrypt');
const { q } = require('../db');

/**
 * Helper: render admin views with consistent locals
 * - settings: site settings
 * - csrfToken: CSRF token
 * - adminBasePath: base path from middleware
 * - admin: session admin
 */
async function renderAdmin(req, res, view, locals = {}) {
  const settings = await req.getSettings();
  return res.render(view, {
    settings,
    csrfToken: req.csrfToken(),
    adminBasePath: req.adminBasePath,
    admin: req.session.admin || null,
    ...locals
  });
}

async function loginPage(req, res) {
  return renderAdmin(req, res, 'admin/login');
}

async function login(req, res) {
  const usernameOrEmail = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  if (!usernameOrEmail || !password) {
    return res.status(400).json({ ok: false, message: 'Lengkapi login' });
  }

  const rows = await q(
    `SELECT id, username, email, password_hash, role, is_active
     FROM admins
     WHERE (username=? OR email=?) LIMIT 1`,
    [usernameOrEmail, usernameOrEmail]
  );

  const admin = rows[0];
  if (!admin || !admin.is_active) {
    return res.status(401).json({ ok: false, message: 'Login gagal' });
  }

  const ok = await bcrypt.compare(password, admin.password_hash);
  if (!ok) {
    return res.status(401).json({ ok: false, message: 'Login gagal' });
  }

  req.session.admin = {
    id: admin.id,
    username: admin.username,
    email: admin.email,
    role: admin.role
  };

  await q(`UPDATE admins SET last_login_at=NOW() WHERE id=?`, [admin.id]);

  return res.json({ ok: true });
}

async function shell(req, res) {
  // This is the SPA shell (admin_shell.ejs)
  return renderAdmin(req, res, 'admin_shell');
}

/**
 * Admin SPA partial pages:
 * IMPORTANT: must include adminBasePath + csrfToken + settings for EJS partials if they reference them.
 */
async function dashboard(req, res) {
  return renderAdmin(req, res, 'admin/dashboard');
}

async function orders(req, res) {
  return renderAdmin(req, res, 'admin/orders');
}

async function products(req, res) {
  return renderAdmin(req, res, 'admin/products');
}

async function settingsPage(req, res) {
  return renderAdmin(req, res, 'admin/settings');
}

async function whatsappPage(req, res) {
  return renderAdmin(req, res, 'admin/whatsapp');
}

async function logout(req, res) {
  // destroy session safely
  try {
    req.session.destroy(() => {
      res.clearCookie('rd.sid');
      return res.redirect(`${req.adminBasePath}/login`);
    });
  } catch (e) {
    // fallback
    res.clearCookie('rd.sid');
    return res.redirect(`${req.adminBasePath}/login`);
  }
}

module.exports = {
  loginPage,
  login,
  shell,
  dashboard,
  orders,
  products,
  settingsPage,
  whatsappPage,
  logout
};
