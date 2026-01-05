const express = require('express');
const csrf = require('csurf');
const publicController = require('../controllers/public.controller');

const router = express.Router();

// CSRF for all public pages
const csrfProtection = csrf();

router.use((req, res, next) => {
  req.adminBasePath = (process.env.ADMIN_BASE_PATH || '/admin').startsWith('/')
    ? process.env.ADMIN_BASE_PATH
    : `/${process.env.ADMIN_BASE_PATH}`;
  next();
});

router.get('/', csrfProtection, publicController.shell);

// PUBLIC PARTIALS (AJAX)
router.get('/home', publicController.home);
router.get('/products', publicController.products);
router.get('/checkout', publicController.checkout);

router.get('/order/:orderId', publicController.order);
router.get('/order/:orderId/success', publicController.success);
router.get('/order/:orderId/failed', publicController.failed);

// finish -> redirect to hash route
router.get('/finish', publicController.finish);

module.exports = router;
