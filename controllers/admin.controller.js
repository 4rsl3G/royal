const bcrypt = require('bcrypt');
const { q } = require('../db');

async function loginPage(req, res) {
  const settings = await req.getSettings();
  res.render('admin/login', {
    csrfToken: req.csrfToken(),
    settings,
    adminBasePath: req.adminBasePath
  });
}

async function login(req, res) {
  const usernameOrEmail = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  if (!usernameOrEmail || !password) return res.status(400).json({ ok: false, message: 'Lengkapi login' });

  const rows = await q(
    `SELECT id, username, email, password_hash, role, is_active
     FROM admins
     WHERE (username=? OR email=?) LIMIT 1`,
    [usernameOrEmail, usernameOrEmail]
  );

  const admin = rows[0];
  if (!admin || !admin.is_active) return res.status(401).json({ ok: false, message: 'Login gagal' });

  const ok = await bcrypt.compare(password, admin.password_hash);
  if (!ok) return res.status(401).json({ ok: false, message: 'Login gagal' });

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
  const settings = await req.getSettings();
  res.render('admin_shell', {
    csrfToken: req.csrfToken(),
    settings,
    adminBasePath: req.adminBasePath,
    admin: req.session.admin
  });
}

async function dashboard(req, res) {
  res.render('admin/dashboard', { admin: req.session.admin });
}

async function orders(req, res) {
  res.render('admin/orders', { admin: req.session.admin });
}

async function products(req, res) {
  res.render('admin/products', { admin: req.session.admin });
}

async function settingsPage(req, res) {
  res.render('admin/settings', { admin: req.session.admin });
}

async function whatsappPage(req, res) {
  res.render('admin/whatsapp', { admin: req.session.admin });
}

async function logout(req, res) {
  req.session.destroy(() => {
    res.redirect(`${req.adminBasePath}/login`);
  });
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
