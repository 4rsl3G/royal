const { q } = require('../db');

function safeCsrf(req) {
  // fallback supaya gak crash kalau csurf belum terpasang
  try {
    return typeof req.csrfToken === 'function' ? req.csrfToken() : '';
  } catch (_) {
    return '';
  }
}

async function shell(req, res) {
  const settings = await req.getSettings();

  const clientKey = settings.midtrans_client_key || '';
  const isProd = String(settings.midtrans_is_production || 'false') === 'true';
  const snapUrl = isProd
    ? 'https://app.midtrans.com/snap/snap.js'
    : 'https://app.sandbox.midtrans.com/snap/snap.js';

  res.render('app', {
    csrfToken: safeCsrf(req),
    settings,
    snapUrl,
    midtransClientKey: clientKey
  });
}

async function home(req, res) {
  const settings = await req.getSettings();
  const popular = await q(
    `SELECT id, sku, name, game_name, image, price_type, price, price_per_item
     FROM products
     WHERE active=1
     ORDER BY sort_order ASC, id DESC
     LIMIT 3`
  );
  res.render('public/home', { settings, popular });
}

async function products(req, res) {
  const settings = await req.getSettings();
  const rows = await q(
    `SELECT id, sku, name, game_name, image, price_type, price, price_per_item, active, sort_order
     FROM products
     WHERE active=1
     ORDER BY sort_order ASC, id DESC`
  );
  res.render('public/products', { settings, products: rows });
}

async function checkout(req, res) {
  const settings = await req.getSettings();
  const rows = await q(
    `SELECT id, sku, name, game_name, image, price_type, price, price_per_item
     FROM products
     WHERE active=1
     ORDER BY sort_order ASC, id DESC`
  );
  res.render('public/checkout', { settings, products: rows });
}

async function order(req, res) {
  const settings = await req.getSettings();
  const orderId = String(req.params.orderId || '').trim();

  if (!orderId) return res.render('public/order', { settings, order: null });

  const rows = await q(
    `SELECT o.order_id, o.game_id, o.nickname, o.whatsapp, o.qty, o.unit_price, o.gross_amount,
            o.pay_status, o.fulfill_status, o.admin_note, o.created_at, o.updated_at,
            p.name AS product_name, p.sku, p.image
     FROM orders o
     JOIN products p ON p.id=o.product_id
     WHERE o.order_id=? LIMIT 1`,
    [orderId]
  );

  res.render('public/order', { settings, order: rows[0] || null });
}

async function success(req, res) {
  const settings = await req.getSettings();
  const orderId = String(req.params.orderId || '').trim();
  res.render('public/success', { settings, orderId });
}

async function failed(req, res) {
  const settings = await req.getSettings();
  const orderId = String(req.params.orderId || '').trim();
  res.render('public/failed', { settings, orderId });
}

async function finish(req, res) {
  const orderId = String(req.query.order_id || '').trim();
  if (!orderId) return res.redirect('/#/home');
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
