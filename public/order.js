window.RDOrders = window.RDOrders || {};

window.RDOrders.init = (function () {
  let inited = false;
  let GRID = null;
  let DATA = [];
  let CURRENT = null;

  function rupiah(n) { return 'Rp ' + (Number(n || 0)).toLocaleString('id-ID'); }
  function escapeHtml(s) {
    return String(s || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
  function fmtTime(iso) {
    const s = String(iso || '');
    if (!s) return '-';
    return escapeHtml(s.replace('T', ' ').slice(0, 19));
  }

  function payBadgeHTML(st) {
    st = String(st || '').toLowerCase();
    if (st === 'settlement' || st === 'capture') return `<span class="badge good"><i class="ri-check-line"></i> ${escapeHtml(st)}</span>`;
    if (st === 'pending') return `<span class="badge warn"><i class="ri-time-line"></i> pending</span>`;
    if (st === 'expire' || st === 'cancel' || st === 'deny' || st === 'failure') return `<span class="badge bad"><i class="ri-close-line"></i> ${escapeHtml(st)}</span>`;
    return `<span class="badge"><i class="ri-question-line"></i> ${escapeHtml(st || '-')}</span>`;
  }

  function fulfillBadgeHTML(st) {
    st = String(st || '').toLowerCase();
    if (st === 'done') return `<span class="badge good"><i class="ri-check-double-line"></i> done</span>`;
    if (st === 'processing') return `<span class="badge info"><i class="ri-loader-4-line"></i> processing</span>`;
    if (st === 'waiting') return `<span class="badge warn"><i class="ri-hourglass-2-line"></i> waiting</span>`;
    if (st === 'rejected') return `<span class="badge bad"><i class="ri-close-line"></i> rejected</span>`;
    return `<span class="badge">${escapeHtml(st || '-')}</span>`;
  }

  function ensureGridJsLoaded() {
    return new Promise((resolve, reject) => {
      if (window.gridjs && window.gridjs.Grid) return resolve();

      if (!document.getElementById('gridjs-css')) {
        const link = document.createElement('link');
        link.id = 'gridjs-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/gridjs/dist/theme/mermaid.min.css';
        document.head.appendChild(link);
      }

      const s = document.createElement('script');
      s.src = 'https://unpkg.com/gridjs/dist/gridjs.umd.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Grid.js CDN blocked'));
      document.head.appendChild(s);
    });
  }

  function showModal() {
    const m = document.getElementById('modal');
    if (!m) return;
    m.classList.remove('hidden');
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => {
      m.classList.add('rd-modal-show');
      m.classList.remove('rd-modal-hide');
    });
  }

  function hideModal() {
    const m = document.getElementById('modal');
    if (!m) return;
    m.classList.add('rd-modal-hide');
    m.classList.remove('rd-modal-show');
    setTimeout(() => {
      m.classList.add('hidden');
      document.body.classList.remove('modal-open');
    }, 180);
    CURRENT = null;
  }

  function openModalFromRow(o) {
    CURRENT = o.order_id;

    $('#mOrderId').text(o.order_id || '-');
    $('#mFulfill').val(o.fulfill_status || 'waiting');
    $('#mNote').val(o.admin_note || '');
    $('#mPayBadge').html(payBadgeHTML(o.pay_status || '-'));
    $('#mGross').text(rupiah(o.gross_amount || 0));
    $('#mGameId').text(o.game_id || '-');
    $('#mWA').text((o.nickname ? o.nickname + ' • ' : '') + (o.whatsapp || '-'));

    showModal();
  }

  function mountGrid(rows) {
    const mount = document.getElementById('ordersGridMount');
    if (!mount) return;

    const { html } = window.gridjs;

    if (GRID) {
      try { GRID.destroy(); } catch (_) {}
      GRID = null;
      mount.innerHTML = '';
    }

    // Grid.js data = array of object, lebih stabil daripada trik cell object
    const mapped = (rows || []).map(o => ({
      order_id: o.order_id,
      created_at: o.created_at,
      product_name: o.product_name,
      qty: o.qty,
      unit_price: o.unit_price,
      game_id: o.game_id,
      nickname: o.nickname,
      whatsapp: o.whatsapp,
      gross_amount: o.gross_amount,
      pay_status: o.pay_status,
      fulfill_status: o.fulfill_status,
      admin_note: o.admin_note || ''
    }));

    GRID = new gridjs.Grid({
      columns: [
        {
          name: 'Order',
          formatter: (cell, row) => {
            const o = row._cells ? row.cells?.[0]?.data : row; // fallback
            const data = row?._data || row?.cells?.[0]?.data || row?.data || null;
            const obj = row?.cells ? row.cells[0].data : row;

            const x = row?.cells ? row.cells[0].data : null;
            const it = row?.data ? row.data : null;

            const d = row?.cells ? row.cells[0].data : null;

            // row object berbeda versi, ambil dari row._data kalau ada
            const item = row?._data || row?.data || row?.cells?.[0]?.data || null;
            const real = item || row?.cells?.[0]?.data || null;

            // Paling aman: gunakan row._data kalau ada, kalau tidak gunakan mapped[rowIndex] tidak tersedia.
            const r = row?._data || row?.data || row?.cells?.[0]?.data || {};
            const orderId = r.order_id || mapped[row._index]?.order_id || '';
            const createdAt = r.created_at || mapped[row._index]?.created_at || '';

            return html(`<div class="rd-grid-order">
              <div class="rd-grid-strong">${escapeHtml(orderId)}</div>
              <div class="rd-grid-sub">${fmtTime(createdAt)}</div>
            </div>`);
          }
        },
        {
          name: 'Produk',
          formatter: (_, row) => {
            const r = row?._data || row?.data || {};
            return html(`<div class="rd-grid-order">
              <div class="rd-grid-strong">${escapeHtml(r.product_name || '-')}</div>
              <div class="rd-grid-sub">qty ${Number(r.qty || 0)} • unit ${rupiah(r.unit_price || 0)}</div>
            </div>`);
          }
        },
        {
          name: 'Customer',
          formatter: (_, row) => {
            const r = row?._data || row?.data || {};
            return html(`<div class="rd-grid-order">
              <div class="rd-grid-strong">${escapeHtml(r.game_id || '-')}</div>
              <div class="rd-grid-sub">${escapeHtml(r.nickname || '-') } • ${escapeHtml(r.whatsapp || '-')}</div>
            </div>`);
          }
        },
        {
          name: 'Amount',
          formatter: (_, row) => {
            const r = row?._data || row?.data || {};
            return html(`<div class="rd-grid-strong">${rupiah(r.gross_amount || 0)}</div>`);
          }
        },
        {
          name: 'Pay',
          formatter: (_, row) => {
            const r = row?._data || row?.data || {};
            return html(payBadgeHTML(r.pay_status));
          }
        },
        {
          name: 'Fulfill',
          formatter: (_, row) => {
            const r = row?._data || row?.data || {};
            return html(fulfillBadgeHTML(r.fulfill_status));
          }
        },
        {
          name: 'Action',
          formatter: (_, row) => {
            const r = row?._data || row?.data || {};
            const payload = escapeHtml(JSON.stringify(r));
            return html(`<button class="btn btn-sm rd-btn-edit" data-row='${payload}'><i class="ri-pencil-line"></i> Edit</button>`);
          }
        }
      ],

      // gridjs bisa pakai array of objects via "data" kalau columns formatter pakai row._data (works)
      data: mapped,

      pagination: { enabled: true, limit: 5 },
      sort: true,
      search: false,

      className: {
        table: 'rd-grid-table',
        th: 'rd-grid-th',
        td: 'rd-grid-td',
        container: 'rd-grid-container',
        pagination: 'rd-grid-pagination'
      },

      language: {
        noRecordsFound: 'Tidak ada data',
        error: 'Gagal memuat'
      }
    });

    GRID.render(mount);

    $('#countBox').text(rows.length);

    $(document).off('click', '.rd-btn-edit').on('click', '.rd-btn-edit', function () {
      try {
        const raw = $(this).attr('data-row') || '{}';
        const o = JSON.parse(raw);
        openModalFromRow(o);
      } catch (e) {
        toastr.error('Data row invalid');
      }
    });
  }

  async function loadOrders() {
    const mount = document.getElementById('ordersGridMount');
    if (mount) {
      mount.innerHTML = `
        <div class="skeleton" style="height:58px;border-radius:18px;margin-bottom:10px;"></div>
        <div class="skeleton" style="height:58px;border-radius:18px;margin-bottom:10px;"></div>
        <div class="skeleton" style="height:58px;border-radius:18px;margin-bottom:10px;"></div>
        <div class="skeleton" style="height:58px;border-radius:18px;margin-bottom:10px;"></div>
        <div class="skeleton" style="height:58px;border-radius:18px;"></div>
      `;
    }

    const qs = $.param({
      q: $('#q').val(),
      pay_status: $('#pay_status').val(),
      fulfill_status: $('#fulfill_status').val()
    });

    try {
      const resp = await $.ajax({
        method: 'GET',
        url: window.__ADMIN_BASE + '/api/orders?' + qs,
        headers: { 'X-CSRF-Token': window.__CSRF_TOKEN }
      });

      if (!resp || !resp.ok) throw new Error(resp?.message || 'Failed');

      DATA = resp.data || [];
      mountGrid(DATA);
    } catch (e) {
      toastr.error(e?.responseJSON?.message || e.message || 'Order gagal dimuat');
      if (mount) mount.innerHTML = `<div class="text-rose-600 text-sm">Gagal memuat data</div>`;
      $('#countBox').text('0');
    }
  }

  async function saveFulfill() {
    if (!CURRENT) return;
    if (window.RD?.ui?.overlay) RD.ui.overlay(true);

    try {
      const resp = await $.ajax({
        method: 'POST',
        url: window.__ADMIN_BASE + '/api/orders/' + encodeURIComponent(CURRENT) + '/fulfill',
        data: {
          fulfill_status: $('#mFulfill').val(),
          admin_note: $('#mNote').val()
        },
        headers: { 'X-CSRF-Token': window.__CSRF_TOKEN }
      });

      if (!resp || !resp.ok) throw new Error(resp?.message || 'Failed');

      toastr.success('Saved');
      hideModal();
      loadOrders();
    } catch (e) {
      toastr.error(e?.responseJSON?.message || e.message || 'Failed');
    } finally {
      if (window.RD?.ui?.overlay) RD.ui.overlay(false);
    }
  }

  function bindEvents() {
    $(document).off('click', '#btnRefresh').on('click', '#btnRefresh', loadOrders);

    $(document).off('click', '#btnQuickPending').on('click', '#btnQuickPending', function () {
      $('#pay_status').val('pending');
      $('#fulfill_status').val('');
      loadOrders();
    });

    $(document).off('click', '#btnQuickWaiting').on('click', '#btnQuickWaiting', function () {
      $('#fulfill_status').val('waiting');
      $('#pay_status').val('');
      loadOrders();
    });

    const deb = window.RD?.util?.debounce ? RD.util.debounce(loadOrders, 350) : loadOrders;
    $(document).off('keyup', '#q').on('keyup', '#q', deb);
    $(document).off('change', '#pay_status, #fulfill_status').on('change', '#pay_status, #fulfill_status', loadOrders);

    $(document).off('click', '#saveBtn').on('click', '#saveBtn', saveFulfill);

    $(document).off('click', '#closeModal, #closeModal2, #modalBackdrop')
      .on('click', '#closeModal, #closeModal2, #modalBackdrop', hideModal);

    $(document).off('keydown.rdorders').on('keydown.rdorders', function (e) {
      if (e.key === 'Escape' && !$('#modal').hasClass('hidden')) hideModal();
    });
  }

  return async function () {
    // hanya kalau halaman orders ada
    if (!document.querySelector('[data-page="orders"]')) return;

    // bind ulang aman (off/on)
    bindEvents();

    // init sekali per load script
    if (!inited) {
      inited = true;
      try {
        await ensureGridJsLoaded();
      } catch (e) {
        toastr.error('Gagal memuat Grid.js (CDN terblok)');
        return;
      }
    }

    await loadOrders();
  };
})();
