const path = require('path');
const fs = require('fs');
const multer = require('multer');
const validator = require('validator');

const { q } = require('../db');
const { cleanStr, isValidWhatsapp, normalizeWhatsapp } = require('../middleware/validate');
const { startWA, getWAStatus, sendWA, renderTemplate } = require('../services/wa.service');

function safeUnlink(p) {
  try { fs.unlinkSync(p); } catch (_) {}
}

// Multer config
const uploadDir = path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads', 'products');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const name = `prd_${Date.now()}_${Math.random().toString(16).slice(2)}${ext}`;
    cb(null, name);
  }
});

function fileFilter(req, file, cb) {
  const ok = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.mimetype);
  if (!ok) return cb(new Error('Only png/jpg/jpeg/webp allowed'));
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }
});

function money(n) {
  return Number(n || 0);
}

async function metrics(req, res) {
  const today = await q(
    `SELECT COUNT(*) cnt, COALESCE(SUM(gross_amount),0) sum
     FROM orders WHERE DATE(created_at)=CURDATE()`
  );
  const total = await q(`SELECT COUNT(*) cnt, COALESCE(SUM(gross_amount),0) sum FROM orders`);
  const days = await q(
    `SELECT DATE(created_at) d, COUNT(*) cnt, COALESCE(SUM(gross_amount),0) sum
     FROM orders
     WHERE created_at >= (CURDATE() - INTERVAL 13 DAY)
     GROUP BY DATE(created_at)
     ORDER BY d ASC`
  );

  return res.json({
    ok: true,
    today: today[0],
    total: total[0],
    chart14: days
  });
}

async function listOrders(req, res) {
  const pay_status = cleanStr(req.query.pay_status || '');
  const fulfill_status = cleanStr(req.query.fulfill_status || '');
  const qtext = cleanStr(req.query.q || '');

  const where = [];
  const params = [];

  if (pay_status) {
    where.push(`o.pay_status=?`);
    params.push(pay_status);
  }
  if (fulfill_status) {
    where.push(`o.fulfill_status=?`);
    params.push(fulfill_status);
  }
  if (qtext) {
    where.push(`(o.order_id LIKE ? OR o.game_id LIKE ? OR o.whatsapp LIKE ? OR p.name LIKE ?)`);
    params.push(`%${qtext}%`, `%${qtext}%`, `%${qtext}%`, `%${qtext}%`);
  }

  const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await q(
    `SELECT o.order_id, o.game_id, o.nickname, o.whatsapp, o.qty, o.unit_price, o.gross_amount,
            o.pay_status, o.fulfill_status, o.admin_note, o.created_at, o.updated_at,
            p.name AS product_name
     FROM orders o
     JOIN products p ON p.id=o.product_id
     ${sqlWhere}
     ORDER BY o.created_at DESC
     LIMIT 300`,
    params
  );

  return res.json({ ok: true, data: rows });
}

async function fulfillOrder(req, res) {
  const orderId = cleanStr(req.params.orderId);
  const fulfill_status = cleanStr(req.body.fulfill_status || '');
  const admin_note = cleanStr(req.body.admin_note || '');

  if (!orderId) return res.status(400).json({ ok: false, message: 'orderId invalid' });
  if (!['waiting', 'processing', 'done', 'rejected'].includes(fulfill_status)) {
    return res.status(400).json({ ok: false, message: 'fulfill_status invalid' });
  }

  await q(
    `UPDATE orders
     SET fulfill_status=?, admin_note=?, confirmed_by=?, confirmed_at=NOW()
     WHERE order_id=?`,
    [fulfill_status, admin_note, req.session.admin.id, orderId]
  );

  const settings = await req.getSettings();
  const waEnabled = String(settings.whatsapp_enabled || 'false') === 'true';

  if (waEnabled && (fulfill_status === 'done' || fulfill_status === 'rejected')) {
    const rows = await q(
      `SELECT o.order_id, o.whatsapp, o.gross_amount, o.pay_status, o.game_id, o.nickname,
              o.admin_note, o.whatsapp_done_sent_at,
              p.name AS product_name
       FROM orders o
       JOIN products p ON p.id=o.product_id
       WHERE o.order_id=? LIMIT 1`,
      [orderId]
    );
    const od = rows[0];

    const st = getWAStatus();
    if (od && st.status === 'connected') {
      const tpl = fulfill_status === 'done'
        ? (settings.whatsapp_template_done || '')
        : (settings.whatsapp_template_rejected || '');

      const msg = renderTemplate(tpl, {
        order_id: od.order_id,
        product: od.product_name,
        total: od.gross_amount,
        pay_status: od.pay_status,
        game_id: od.game_id,
        nickname: od.nickname,
        admin_note: od.admin_note
      });

      // send once for done/rejected
      if (!od.whatsapp_done_sent_at) {
        try {
          await sendWA(od.whatsapp, msg);
          await q(`UPDATE orders SET whatsapp_done_sent_at=NOW() WHERE order_id=?`, [orderId]);
        } catch (_) {
          // ignore
        }
      }
    }
  }

  return res.json({ ok: true });
}

/** PRODUCTS CRUD */
async function getProducts(req, res) {
  const rows = await q(
    `SELECT id, sku, name, game_name, image, price_type, price, price_per_item, active, sort_order, created_at
     FROM products ORDER BY sort_order ASC, id DESC`
  );
  res.json({ ok: true, data: rows });
}

async function createProduct(req, res) {
  const sku = cleanStr(req.body.sku);
  const name = cleanStr(req.body.name);
  const game_name = cleanStr(req.body.game_name || 'Royal Dreams');
  const price_type = cleanStr(req.body.price_type || 'fixed');
  const price = money(req.body.price);
  const price_per_item = money(req.body.price_per_item);
  const active = String(req.body.active || '1') === '1' ? 1 : 0;
  const sort_order = Number(req.body.sort_order || 0);

  if (!sku || !name) return res.status(400).json({ ok: false, message: 'sku & name wajib' });
  if (!['fixed', 'per_item'].includes(price_type)) return res.status(400).json({ ok: false, message: 'price_type invalid' });

  let image = null;
  if (req.file) image = `/uploads/products/${req.file.filename}`;

  await q(
    `INSERT INTO products (sku, name, game_name, image, price_type, price, price_per_item, active, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [sku, name, game_name, image, price_type, price, price_per_item, active, sort_order]
  );

  res.json({ ok: true });
}

async function updateProduct(req, res) {
  const id = Number(req.params.id || 0);
  if (!id) return res.status(400).json({ ok: false, message: 'id invalid' });

  const sku = cleanStr(req.body.sku);
  const name = cleanStr(req.body.name);
  const game_name = cleanStr(req.body.game_name || 'Royal Dreams');
  const price_type = cleanStr(req.body.price_type || 'fixed');
  const price = money(req.body.price);
  const price_per_item = money(req.body.price_per_item);
  const active = String(req.body.active || '1') === '1' ? 1 : 0;
  const sort_order = Number(req.body.sort_order || 0);

  if (!sku || !name) return res.status(400).json({ ok: false, message: 'sku & name wajib' });
  if (!['fixed', 'per_item'].includes(price_type)) return res.status(400).json({ ok: false, message: 'price_type invalid' });

  const old = await q(`SELECT image FROM products WHERE id=? LIMIT 1`, [id]);
  if (!old[0]) return res.status(404).json({ ok: false, message: 'product not found' });

  let image = old[0].image;
  if (req.file) {
    image = `/uploads/products/${req.file.filename}`;
    if (old[0].image && old[0].image.startsWith('/uploads/')) {
      const p = path.join(process.cwd(), old[0].image.replace(/^\//, ''));
      safeUnlink(p);
    }
  }

  await q(
    `UPDATE products
     SET sku=?, name=?, game_name=?, image=?, price_type=?, price=?, price_per_item=?, active=?, sort_order=?
     WHERE id=?`,
    [sku, name, game_name, image, price_type, price, price_per_item, active, sort_order, id]
  );

  res.json({ ok: true });
}

async function deleteProduct(req, res) {
  const id = Number(req.params.id || 0);
  if (!id) return res.status(400).json({ ok: false, message: 'id invalid' });

  const old = await q(`SELECT image FROM products WHERE id=? LIMIT 1`, [id]);
  if (!old[0]) return res.status(404).json({ ok: false, message: 'product not found' });

  await q(`DELETE FROM products WHERE id=?`, [id]);

  if (old[0].image && old[0].image.startsWith('/uploads/')) {
    const p = path.join(process.cwd(), old[0].image.replace(/^\//, ''));
    safeUnlink(p);
  }

  res.json({ ok: true });
}

/** SETTINGS GET/POST */
async function getSettings(req, res) {
  const s = await req.getSettings(true);
  const out = { ...s };
  if (out.midtrans_server_key) out.midtrans_server_key = out.midtrans_server_key.slice(0, 6) + '***';
  res.json({ ok: true, data: out });
}

async function saveSettings(req, res) {
  const allowed = [
    'site_name', 'brand_tagline',
    'midtrans_is_production', 'midtrans_server_key', 'midtrans_client_key',
    'whatsapp_enabled',
    'whatsapp_template_pay', 'whatsapp_template_done', 'whatsapp_template_rejected'
  ];

  for (const k of allowed) {
    if (req.body[k] !== undefined) {
      await req.setSetting(k, String(req.body[k]));
    }
  }
  res.json({ ok: true });
}

/** WHATSAPP */
async function waStart(req, res) {
  const settings = await req.getSettings();
  const waEnabled = String(settings.whatsapp_enabled || 'false') === 'true';
  if (!waEnabled) return res.status(400).json({ ok: false, message: 'WhatsApp disabled in settings' });

  // ✅ accept phone for pairing-code flow
  const rawPhone = cleanStr(req.body.phoneNumber || req.body.phone || req.body.wa_number || '');

  // If provided, validate & normalize to 62xxxx
  let phoneNumber = '';
  if (rawPhone) {
    if (!isValidWhatsapp(rawPhone)) {
      return res.status(400).json({ ok: false, message: 'Nomor WA tidak valid (gunakan format 62xxxx)' });
    }
    phoneNumber = normalizeWhatsapp(rawPhone); // -> 62xxxx
  }

  const st = await startWA({ phoneNumber: phoneNumber || undefined });
  return res.json({ ok: true, ...st });
}

async function waStatus(req, res) {
  const st = getWAStatus();
  res.json({ ok: true, ...st });
}

async function waTest(req, res) {
  const to = cleanStr(req.body.to || '');
  const msg = cleanStr(req.body.msg || '');
  if (!to || !msg) return res.status(400).json({ ok: false, message: 'to & msg wajib' });

  if (!isValidWhatsapp(to)) return res.status(400).json({ ok: false, message: 'Nomor WA tidak valid' });
  const phone = normalizeWhatsapp(to);

  const st = getWAStatus();
  if (st.status !== 'connected') {
    return res.status(400).json({ ok: false, message: 'WA belum connected (pairing dulu)' });
  }

  await sendWA(phone, msg);
  res.json({ ok: true });
}

module.exports = {
  upload,
  metrics,
  listOrders,
  fulfillOrder,
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getSettings,
  saveSettings,
  waStart,
  waStatus,
  waTest
};
