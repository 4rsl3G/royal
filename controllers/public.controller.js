const { q } = require('../db');

async function shell(req, res) {
  const settings = await req.getSettings();
  const clientKey = settings.midtrans_client_key || '';
  const isProd = String(settings.midtrans_is_production || 'false') === 'true';
  const snapUrl = isProd
    ? 'https://app.midtrans.com/snap/snap.js'
    : 'https://app.sandbox.midtrans.com/snap/snap.js';

  res.render('app', {
    csrfToken: req.csrfToken(),
    settings,
    snapUrl,
    midtransClientKey: clientKey
  });
}

async function home(req, res) {
  const settings = await req.getSettings();
  const popular = await q(
    `SELECT id, sku, name, game_name, image, price_type, price, price_per_item
     FROM products WHERE active=1 ORDER BY sort_order ASC, id DESC LIMIT 3`
  );
  res.render('public/home', { settings, popular });
}

async function products(req, res) {
  const settings = await req.getSettings();
  const rows = await q(
    `SELECT id, sku, name, game_name, image, price_type, price, price_per_item, active, sort_order
     FROM products WHERE active=1 ORDER BY sort_order ASC, id DESC`
  );
  res.render('public/products', { settings, products: rows });
}

async function checkout(req, res) {
  const settings = await req.getSettings();
  const rows = await q(
    `SELECT id, sku, name, game_name, image, price_type, price, price_per_item
     FROM products WHERE active=1 ORDER BY sort_order ASC, id DESC`
  );
  res.render('public/checkout', { settings, products: rows });
}

async function order(req, res) {
  const settings = await req.getSettings();
  const orderId = req.params.orderId;
  const rows = await q(
    `SELECT o.order_id, o.game_id, o.nickname, o.whatsapp, o.qty, o.unit_price, o.gross_amount,
            o.pay_status, o.fulfill_status, o.admin_note, o.created_at, o.updated_at,
            p.name AS product_name, p.sku, p.image
     FROM orders o
     JOIN products p ON p.id=o.product_id
     WHERE o.order_id=? LIMIT 1`,
    [orderId]
  );
  const order = rows[0] || null;
  res.render('public/order', { settings, order });
}

async function success(req, res) {
  const settings = await req.getSettings();
  const orderId = req.params.orderId;
  res.render('public/success', { settings, orderId });
}

async function failed(req, res) {
  const settings = await req.getSettings();
  const orderId = req.params.orderId;
  res.render('public/failed', { settings, orderId });
}

async function finish(req, res) {
  const orderId = String(req.query.order_id || '').trim();
  if (!orderId) return res.redirect('/#/');
  return res.redirect(`/#/order/${encodeURIComponent(orderId)}`);
}

module.exports = {
  shell,
  home,
  products,
  checkout,
  order,
  success,
  failed,
  finish
};
