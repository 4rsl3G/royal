const express = require('express');
const apiController = require('../controllers/api.controller');

const router = express.Router();

router.post('/midtrans/notification', apiController.midtransNotification);

module.exports = router;
