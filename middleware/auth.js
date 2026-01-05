function requireAdmin(req, res, next) {
  if (req.session && req.session.admin && req.session.admin.id) return next();
  return res.status(401).json({ ok: false, message: 'Unauthorized' });
}

function requireAdminPage(req, res, next) {
  if (req.session && req.session.admin && req.session.admin.id) return next();
  const base = req.adminBasePath || '/admin';
  return res.redirect(`${base}/login`);
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session?.admin?.id) return res.status(401).json({ ok: false, message: 'Unauthorized' });
    if (req.session.admin.role !== role) return res.status(403).json({ ok: false, message: 'Forbidden' });
    return next();
  };
}

module.exports = { requireAdmin, requireAdminPage, requireRole };
