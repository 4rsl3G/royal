const express = require('express');
const csrf = require('csurf');
const adminController = require('../controllers/admin.controller');
const { requireAdminPage } = require('../middleware/auth');

const router = express.Router();
const csrfProtection = csrf();

router.use((req, res, next) => {
  req.adminBasePath = (process.env.ADMIN_BASE_PATH || '/admin').startsWith('/')
    ? process.env.ADMIN_BASE_PATH
    : `/${process.env.ADMIN_BASE_PATH}`;
  next();
});

// Login page
router.get('/login', csrfProtection, adminController.loginPage);
router.post('/login', csrfProtection, adminController.login);

// Shell
router.get('/', csrfProtection, requireAdminPage, adminController.shell);

// Admin SPA partials
router.get('/dashboard', requireAdminPage, adminController.dashboard);
router.get('/orders', requireAdminPage, adminController.orders);
router.get('/products', requireAdminPage, adminController.products);
router.get('/settings', requireAdminPage, adminController.settingsPage);
router.get('/whatsapp', requireAdminPage, adminController.whatsappPage);

router.get('/logout', requireAdminPage, adminController.logout);

module.exports = router;
