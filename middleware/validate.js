const validator = require('validator');
const xss = require('xss');

function cleanStr(v) {
  if (v === undefined || v === null) return '';
  return xss(String(v).trim());
}

function isValidWhatsapp(v) {
  const s = cleanStr(v).replace(/\s+/g, '');
  // allow 62xxxx or +62xxxx or 0xxxx -> normalize to 62xxxx
  let n = s;
  if (n.startsWith('+')) n = n.slice(1);
  if (n.startsWith('0')) n = '62' + n.slice(1);
  if (!n.startsWith('62')) return false;
  return validator.isNumeric(n) && n.length >= 10 && n.length <= 16;
}

function normalizeWhatsapp(v) {
  let n = cleanStr(v).replace(/\s+/g, '');
  if (n.startsWith('+')) n = n.slice(1);
  if (n.startsWith('0')) n = '62' + n.slice(1);
  return n;
}

function requireFields(fields) {
  return (req, res, next) => {
    for (const f of fields) {
      if (req.body[f] === undefined || req.body[f] === null || String(req.body[f]).trim() === '') {
        return res.status(400).json({ ok: false, message: `Field ${f} wajib diisi` });
      }
    }
    next();
  };
}

module.exports = { cleanStr, isValidWhatsapp, normalizeWhatsapp, requireFields };
