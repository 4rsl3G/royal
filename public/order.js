(function () {
  // ====== Guard / init only on Orders page ======
  function isOrdersRoute() {
    return (location.hash || '').startsWith('#/orders');
  }
  function el(id) { return document.getElementById(id); }

  // ====== Helpers ======
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

      // CSS
      if (!document.getElementById('gridjs-css')) {
        const link = document.createElement('link');
        link.id = 'gridjs-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/gridjs/dist/theme/mermaid.min.css';
        document.head.appendChild(link);
      }

      // JS
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/gridjs/dist/gridjs.umd.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('gridjs load failed'));
      document.head.appendChild(s);
    });
  }

  // ====== State ======
  let GRID = null;
  let DATA = [];
  let CURRENT = null;

  // ====== Modal controls ======
  function showModal() {
    const m = el('modal');
    if (!m) return;
    m.classList.remove('hidden');
    document.body.classList.add('modal-open');

    // anim show
    requestAnimationFrame(() => {
      m.classList.add('rd-modal-show');
      m.classList.remove('rd-modal-hide');
    });
  }

  function hideModal() {
    const m = el('modal');
    if (!m) return;
    m.classList.add('rd-modal-hide');
    m.classList.remove('rd-modal-show');

    // wait transition then hide
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

  // ====== Grid render ======
  function mountGrid(rows) {
    const mount = el('ordersGridMount');
    if (!mount) return;

    const { html } = window.gridjs;

    const mapped = (rows || []).map(o => ({
      order_id: o.order_id,
      created_at: o.created_at,
      product_name: o.product_name,
      game_id: o.game_id,
      nickname: o.nickname,
      whatsapp: o.whatsapp,
      qty: o.qty,
      unit_price: o.unit_price,
      gross_amount: o.gross_amount,
      pay_status: o.pay_status,
      fulfill_status: o.fulfill_status,
      admin_note: o.admin_note || ''
    }));

    // destroy old
    if (GRID) {
      try { GRID.destroy(); } catch (_) {}
      GRID = null;
      mount.innerHTML = '';
    }

    GRID = new gridjs.Grid({
      columns: [
        {
          name: 'Order',
          width: '220px',
          formatter: (_, row) => {
            const o = row._cells[0].data;
            // NOTE: gridjs formatter pakai row object, tapi kita butuh data lengkap -> gunakan rowDataIndex
            return html(`<div class="rd-grid-order">
              <div class="rd-grid-strong">${escapeHtml(o.order_id)}</div>
              <div class="rd-grid-sub">${fmtTime(o.created_at)}</div>
            </div>`);
          }
        },
        {
          name: 'Produk',
          width: '240px',
          formatter: (_, row) => {
            const o = row._cells[0].data;
            return html(`<div class="rd-grid-order">
              <div class="rd-grid-strong">${escapeHtml(o.product_name || '-')}</div>
              <div class="rd-grid-sub">qty ${Number(o.qty || 0)} • unit ${rupiah(o.unit_price || 0)}</div>
            </div>`);
          }
        },
        {
          name: 'Customer',
          width: '240px',
          formatter: (_, row) => {
            const o = row._cells[0].data;
            return html(`<div class="rd-grid-order">
              <div class="rd-grid-strong">${escapeHtml(o.game_id || '-')}</div>
              <div class="rd-grid-sub">${escapeHtml(o.nickname || '-') } • ${escapeHtml(o.whatsapp || '-')}</div>
            </div>`);
          }
        },
        {
          name: 'Amount',
          width: '150px',
          formatter: (_, row) => {
            const o = row._cells[0].data;
            return html(`<div class="rd-grid-strong">${rupiah(o.gross_amount || 0)}</div>`);
          }
        },
        {
          name: 'Pay',
          width: '140px',
          formatter: (_, row) => {
            const o = row._cells[0].data;
            return html(payBadgeHTML(o.pay_status));
          }
        },
        {
          name: 'Fulfill',
          width: '150px',
          formatter: (_, row) => {
            const o = row._cells[0].data;
            return html(fulfillBadgeHTML(o.fulfill_status));
          }
        },
        {
          name: 'Action',
          width: '130px',
          formatter: (_, row) => {
            const o = row._cells[0].data;
            const payload = escapeHtml(JSON.stringify({
              order_id: o.order_id,
              pay_status: o.pay_status,
              fulfill_status: o.fulfill_status,
              admin_note: o.admin_note,
              gross_amount: o.gross_amount,
              game_id: o.game_id,
              nickname: o.nickname,
              whatsapp: o.whatsapp,
              created_at: o.created_at,
              product_name: o.product_name,
              qty: o.qty,
              unit_price: o.unit_price
            }));
            return html(`
              <button class="btn btn-sm rd-btn-edit" data-row='${payload}'>
                <i class="ri-pencil-line"></i> Edit
              </button>
            `);
          }
        }
      ],

      // IMPORTANT: gridjs rows data => kita pakai trick: seluruh object di cell pertama agar formatter bisa akses semua
      data: mapped.map(o => [o]),

      pagination: { enabled: true, limit: 5 },
      sort: true,

      // search internal OFF: kita pakai API filter (lebih ringan)
      search: false,

      className: {
        table: 'rd-grid-table',
        th: 'rd-grid-th',
        td: 'rd-grid-td',
        container: 'rd-grid-container',
        pagination: 'rd-grid-pagination'
      },

      style: {
        table: { width: '100%' }
      },

      language: {
        'pagination': {
          'previous': 'Prev',
          'next': 'Next',
          'showing': 'Menampilkan',
          'results': () => 'data'
        },
        'noRecordsFound': 'Tidak ada data',
        'error': 'Gagal memuat'
      }
    });

    GRID.render(mount);

    // count
    $('#countBox').text(rows.length);

    // bind edit buttons after render
    $(document).off('click', '.rd-btn-edit').on('click', '.rd-btn-edit', function () {
      try {
        const raw = $(this).attr('data-row') || '{}';
        const o = JSON.parse(raw);
        openModalFromRow(o);
      } catch (e) {
        if (window.toastr) toastr.error('Data row invalid');
      }
    });
  }

  // ====== Load data from API ======
  async function loadOrders() {
    if (!isOrdersRoute()) return;
    if (!el('btnRefresh')) return;

    const qs = $.param({
      q: $('#q').val(),
      pay_status: $('#pay_status').val(),
      fulfill_status: $('#fulfill_status').val()
    });

    // skeleton
    const mount = el('ordersGridMount');
    if (mount) mount.innerHTML = `
      <div class="skeleton" style="height:58px;border-radius:18px;margin-bottom:10px;"></div>
      <div class="skeleton" style="height:58px;border-radius:18px;margin-bottom:10px;"></div>
      <div class="skeleton" style="height:58px;border-radius:18px;margin-bottom:10px;"></div>
      <div class="skeleton" style="height:58px;border-radius:18px;margin-bottom:10px;"></div>
      <div class="skeleton" style="height:58px;border-radius:18px;"></div>
    `;

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
      if (window.toastr) toastr.error(e?.responseJSON?.message || e.message || 'Order gagal dimuat');
      if (mount) mount.innerHTML = `<div class="text-rose-600 text-sm">Gagal memuat data</div>`;
    }
  }

  // ====== Save fulfill ======
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

      if (window.toastr) toastr.success('Saved');
      hideModal();
      loadOrders();
    } catch (e) {
      if (window.toastr) toastr.error(e?.responseJSON?.message || e.message || 'Failed');
    } finally {
      if (window.RD?.ui?.overlay) RD.ui.overlay(false);
    }
  }

  // ====== Bind events (safe bind once per mount) ======
  function bindEventsOnce() {
    if (window.__RD_ORDERS_BOUND) return;
    window.__RD_ORDERS_BOUND = true;

    $(document).on('click', '#btnRefresh', loadOrders);

    $(document).on('click', '#btnQuickPending', function () {
      $('#pay_status').val('pending');
      $('#fulfill_status').val('');
      loadOrders();
    });

    $(document).on('click', '#btnQuickWaiting', function () {
      $('#fulfill_status').val('waiting');
      $('#pay_status').val('');
      loadOrders();
    });

    $(document).on('keyup', '#q', (window.RD?.util?.debounce ? RD.util.debounce(loadOrders, 350) : loadOrders));
    $(document).on('change', '#pay_status, #fulfill_status', loadOrders);

    $(document).on('click', '#saveBtn', saveFulfill);

    // modal close
    $(document).on('click', '#closeModal, #closeModal2, #modalBackdrop', hideModal);

    // esc close
    $(document).on('keydown', function (e) {
      if (e.key === 'Escape' && !$('#modal').hasClass('hidden')) hideModal();
    });

    // rerender on resize (optional)
    const onResize = (window.RD?.util?.debounce ? RD.util.debounce(function () {
      // no need rerender, gridjs responsive by CSS
    }, 120) : function(){});
    window.addEventListener('resize', onResize);
    if (window.RD?.router?.onLeave) RD.router.onLeave(() => window.removeEventListener('resize', onResize));
  }

  // ====== Init orders page when injected (SPA) ======
  async function initOrders() {
    if (!isOrdersRoute()) return;
    if (!el('ordersGridMount')) return;

    bindEventsOnce();

    try {
      await ensureGridJsLoaded();
    } catch (e) {
      if (window.toastr) toastr.error('Gagal memuat Grid.js');
      return;
    }

    await loadOrders();
  }

  // run now
  initOrders();

  // observe SPA content changes
  const content = document.getElementById('admin-content');
  if (content) {
    const mo = new MutationObserver(() => initOrders());
    mo.observe(content, { childList: true, subtree: true });
  }

  // re-init on hash change
  window.addEventListener('hashchange', () => initOrders());

})();
