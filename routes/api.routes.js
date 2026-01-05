const express = require('express');
const csrf = require('csurf');

const apiController = require('../controllers/api.controller');

const router = express.Router();

// CSRF for API except webhook
const csrfProtection = csrf();
router.use(csrfProtection);

router.post('/order/create', apiController.createOrder);
router.get('/order/status/:orderId', apiController.status);

// Webhook must be no CSRF, so define here but mount separately without csrf:
// We'll expose it at app root using this same router? No -> define in separate router:
// Simpler: export a router for webhook below.
module.exports = router;
