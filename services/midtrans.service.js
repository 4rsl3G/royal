const midtransClient = require('midtrans-client');

async function buildMidtrans(req) {
  const s = await req.getSettings();
  const isProd = String(s.midtrans_is_production || 'false') === 'true';

  const serverKey = s.midtrans_server_key || '';
  const clientKey = s.midtrans_client_key || '';

  const snap = new midtransClient.Snap({
    isProduction: isProd,
    serverKey,
    clientKey
  });

  const core = new midtransClient.CoreApi({
    isProduction: isProd,
    serverKey,
    clientKey
  });

  return { snap, core, isProd, serverKey, clientKey };
}

module.exports = { buildMidtrans };
