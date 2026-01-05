const express = require('express');
const csrf = require('csurf');
const { requireAdmin } = require('../middleware/auth');
const adminApi = require('../controllers/admin.api.controller');

const router = express.Router();
const csrfProtection = csrf();

router.use((req, res, next) => {
  req.adminBasePath = (process.env.ADMIN_BASE_PATH || '/admin').startsWith('/')
    ? process.env.ADMIN_BASE_PATH
    : `/${process.env.ADMIN_BASE_PATH}`;
  next();
});

// Require admin + CSRF for admin API
router.use(requireAdmin);
router.use(csrfProtection);

// metrics
router.get('/metrics', adminApi.metrics);

// orders
router.get('/orders', adminApi.listOrders);
router.post('/orders/:orderId/fulfill', adminApi.fulfillOrder);

// products CRUD + upload image
router.get('/products', adminApi.getProducts);
router.post('/products', adminApi.upload.single('image'), adminApi.createProduct);
router.put('/products/:id', adminApi.upload.single('image'), adminApi.updateProduct);
router.delete('/products/:id', adminApi.deleteProduct);

// settings
router.get('/settings', adminApi.getSettings);
router.post('/settings', adminApi.saveSettings);

// whatsapp
router.post('/whatsapp/start', adminApi.waStart);
router.get('/whatsapp/status', adminApi.waStatus);
router.post('/whatsapp/test', adminApi.waTest);

module.exports = router;
