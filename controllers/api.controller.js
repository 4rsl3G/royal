const crypto = require('crypto');
const { q } = require('../db');
const { cleanStr, isValidWhatsapp, normalizeWhatsapp } = require('../middleware/validate');
const { buildMidtrans } = require('../services/midtrans.service');
const { getWAStatus, sendWA, renderTemplate } = require('../services/wa.service');

function makeOrderId() {
  const rnd = crypto.randomBytes(4).toString('hex');
  return `RD-${Date.now()}-${rnd}`; // Midtrans order_id
}

function isFinalPayStatus(s) {
  const final = ['settlement', 'capture', 'expire', 'cancel', 'deny', 'failure'];
  return final.includes(String(s || '').toLowerCase());
}

async function createOrder(req, res) {
  const productId = Number(req.body.productId || 0);
  const gameId = cleanStr(req.body.gameId);
  const nickname = cleanStr(req.body.nickname || '');
  const whatsappRaw = cleanStr(req.body.whatsapp);
  const qtyRaw = Number(req.body.qty || 1);

  if (!productId) return res.status(400).json({ ok: false, message: 'productId wajib' });
  if (!gameId) return res.status(400).json({ ok: false, message: 'gameId wajib' });
  if (!isValidWhatsapp(whatsappRaw)) return res.status(400).json({ ok: false, message: 'Nomor WhatsApp tidak valid' });

  const whatsapp = normalizeWhatsapp(whatsappRaw);

  const prodRows = await q(
    `SELECT id, sku, name, game_name, image, price_type, price, price_per_item, active
     FROM products WHERE id=? AND active=1 LIMIT 1`,
    [productId]
  );
  const product = prodRows[0];
  if (!product) return res.status(404).json({ ok: false, message: 'Produk tidak ditemukan' });

  let qty = Math.max(1, Number.isFinite(qtyRaw) ? qtyRaw : 1);
  let unit_price = 0;
  let gross_amount = 0;
  let item_price = 0;
  let item_qty = 1;

  if (product.price_type === 'fixed') {
    qty = 1;
    unit_price = Number(product.price || 0);
    gross_amount = unit_price;
    item_price = unit_price;
    item_qty = 1;
  } else {
    qty = Math.max(1, qty);
    unit_price = Number(product.price_per_item || 0);
    gross_amount = unit_price * qty;
    item_price = unit_price;
    item_qty = qty;
  }

  if (gross_amount <= 0) return res.status(400).json({ ok: false, message: 'Harga produk tidak valid' });

  const order_id = makeOrderId();

  await q(
    `INSERT INTO orders
     (order_id, product_id, game_id, nickname, whatsapp, qty, unit_price, gross_amount, pay_status, fulfill_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'waiting')`,
    [order_id, product.id, gameId, nickname, whatsapp, qty, unit_price, gross_amount]
  );

  const { snap } = await buildMidtrans(req);

  const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';

  const payload = {
    transaction_details: {
      order_id,
      gross_amount
    },
    item_details: [
      {
        id: product.sku,
        name: product.name,
        price: item_price,
        quantity: item_qty
      }
    ],
    customer_details: {
      first_name: nickname || 'Customer',
      phone: whatsapp
    },
    callbacks: {
      finish: `${PUBLIC_BASE_URL}/finish?order_id=${encodeURIComponent(order_id)}`
    }
  };

  let snapToken;
  try {
    const resp = await snap.createTransaction(payload);
    snapToken = resp.token;
  } catch (e) {
    await q(`UPDATE orders SET pay_status='failure', admin_note=? WHERE order_id=?`, [
      `Midtrans error: ${String(e.message || e)}`,
      order_id
    ]);
    return res.status(500).json({ ok: false, message: 'Gagal membuat pembayaran' });
  }

  await q(`UPDATE orders SET snap_token=? WHERE order_id=?`, [snapToken, order_id]);

  return res.json({ ok: true, orderId: order_id, token: snapToken });
}

async function status(req, res) {
  const orderId = cleanStr(req.params.orderId);
  if (!orderId) return res.status(400).json({ ok: false, message: 'orderId invalid' });

  const rows = await q(`SELECT order_id, pay_status, fulfill_status FROM orders WHERE order_id=? LIMIT 1`, [orderId]);
  if (!rows[0]) return res.status(404).json({ ok: false, message: 'Order not found' });

  const { core } = await buildMidtrans(req);

  let mt;
  try {
    mt = await core.transaction.status(orderId);
  } catch (e) {
    // if Midtrans error, return existing db status
    const pay_status = rows[0].pay_status;
    const fulfill_status = rows[0].fulfill_status;
    return res.json({ ok: true, pay_status, fulfill_status, isFinal: isFinalPayStatus(pay_status), midtrans: null });
  }

  const pay_status = String(mt.transaction_status || rows[0].pay_status);
  await q(`UPDATE orders SET pay_status=?, midtrans_raw=? WHERE order_id=?`, [
    pay_status,
    JSON.stringify(mt),
    orderId
  ]);

  const updated = await q(`SELECT pay_status, fulfill_status FROM orders WHERE order_id=? LIMIT 1`, [orderId]);
  return res.json({
    ok: true,
    pay_status: updated[0].pay_status,
    fulfill_status: updated[0].fulfill_status,
    isFinal: isFinalPayStatus(updated[0].pay_status)
  });
}

// Webhook: MUST no CSRF
async function midtransNotification(req, res) {
  const body = req.body || {};
  const order_id = String(body.order_id || '');
  const status_code = String(body.status_code || '');
  const gross_amount = String(body.gross_amount || '');
  const signature_key = String(body.signature_key || '');

  if (!order_id) return res.status(400).send('missing order_id');

  const settings = await req.getSettings();
  const serverKey = settings.midtrans_server_key || '';

  const expected = crypto
    .createHash('sha512')
    .update(order_id + status_code + gross_amount + serverKey)
    .digest('hex');

  if (expected !== signature_key) {
    return res.status(401).send('invalid signature');
  }

  const pay_status = String(body.transaction_status || 'pending');

  await q(`UPDATE orders SET pay_status=?, midtrans_raw=? WHERE order_id=?`, [
    pay_status,
    JSON.stringify(body),
    order_id
  ]);

  // WA on settlement/capture (once)
  const waEnabled = String(settings.whatsapp_enabled || 'false') === 'true';
  if (waEnabled && (pay_status === 'settlement' || pay_status === 'capture')) {
    const rows = await q(
      `SELECT o.order_id, o.whatsapp, o.gross_amount, o.pay_status, o.game_id, o.nickname,
              o.admin_note, o.whatsapp_pay_sent_at,
              p.name AS product_name
       FROM orders o
       JOIN products p ON p.id=o.product_id
       WHERE o.order_id=? LIMIT 1`,
      [order_id]
    );
    const od = rows[0];
    if (od && !od.whatsapp_pay_sent_at) {
      const st = getWAStatus();
      if (st.status === 'connected') {
        const tpl = settings.whatsapp_template_pay || '';
        const msg = renderTemplate(tpl, {
          order_id: od.order_id,
          product: od.product_name,
          total: od.gross_amount,
          pay_status: od.pay_status,
          game_id: od.game_id,
          nickname: od.nickname,
          admin_note: od.admin_note
        });
        try {
          await sendWA(od.whatsapp, msg);
          await q(`UPDATE orders SET whatsapp_pay_sent_at=NOW() WHERE order_id=?`, [order_id]);
        } catch (e) {
          // ignore WA send error
        }
      }
    }
  }

  return res.status(200).send('ok');
}

module.exports = {
  createOrder,
  status,
  midtransNotification
};
