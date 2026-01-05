(function () {
  // jalanin hanya kalau halaman orders sedang aktif + elemen ada
  function isOrdersPage() {
    return (location.hash || '').startsWith('#/orders') && document.getElementById('ordersGrid');
  }

  // util
  function rupiah(n){ return 'Rp ' + (Number(n||0)).toLocaleString('id-ID'); }
  function escapeHtml(s){
    return String(s || '')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#039;');
  }
  function payBadge(st){
    st = String(st||'').toLowerCase();
    if(st === 'settlement' || st === 'capture') return `<span class="badge good"><i class="ri-check-line"></i> ${st}</span>`;
    if(st === 'pending') return `<span class="badge warn"><i class="ri-time-line"></i> ${st}</span>`;
    if(['expire','cancel','deny','failure'].includes(st)) return `<span class="badge bad"><i class="ri-close-line"></i> ${st}</span>`;
    return `<span class="badge"><i class="ri-question-line"></i> ${escapeHtml(st || '-')}</span>`;
  }
  function fulfillBadge(st){
    st = String(st||'').toLowerCase();
    if(st === 'done') return `<span class="badge good"><i class="ri-check-double-line"></i> done</span>`;
    if(st === 'processing') return `<span class="badge info"><i class="ri-loader-4-line"></i> processing</span>`;
    if(st === 'waiting') return `<span class="badge warn"><i class="ri-hourglass-2-line"></i> waiting</span>`;
    if(st === 'rejected') return `<span class="badge bad"><i class="ri-close-line"></i> rejected</span>`;
    return `<span class="badge">${escapeHtml(st||'-')}</span>`;
  }

  let grid = null;
  let LAST_DATA = [];

  async function fetchOrders() {
    const qs = $.param({
      q: $('#q').val(),
      pay_status: $('#pay_status').val(),
      fulfill_status: $('#fulfill_status').val()
    });

    const url = 'https://pansa.my.id/panel-pansa/api/orders?' + qs;

    const resp = await $.ajax({
      method: 'GET',
      url,
      headers: { 'X-CSRF-Token': window.__CSRF_TOKEN }
    });

    if (!resp || !resp.ok) throw new Error(resp?.message || 'Failed load orders');
    return resp.data || [];
  }

  function renderTable(data) {
    $('#countBox').text(data.length);

    // kalau Grid.js belum ada, kasih fallback error jelas
    if (!window.gridjs) {
      toastr.error('Grid.js belum terload. Pastikan script gridjs ada.');
      return;
    }

    const rows = data.map(o => ([
      `<div class="font-extrabold">${escapeHtml(o.order_id)}</div>
       <div class="text-xs text-slate-500">${escapeHtml(String(o.created_at).replace('T',' ').slice(0,19))}</div>`,
      `<div class="font-extrabold">${escapeHtml(o.product_name)}</div>
       <div class="text-xs text-slate-500">qty: ${Number(o.qty||0)} • unit: ${rupiah(o.unit_price||0)}</div>`,
      `<div class="font-extrabold">${escapeHtml(o.game_id)}</div>
       <div class="text-xs text-slate-500">${escapeHtml(o.nickname || '-')} • ${escapeHtml(o.whatsapp || '-')}</div>`,
      `<div class="font-extrabold">${rupiah(o.gross_amount)}</div>`,
      payBadge(o.pay_status),
      fulfillBadge(o.fulfill_status),
      `<button class="btn btn-sm js-edit"
        data-oid="${escapeHtml(o.order_id)}"
        data-pay="${escapeHtml(o.pay_status)}"
        data-ful="${escapeHtml(o.fulfill_status)}"
        data-note="${escapeHtml(o.admin_note || '')}"
        data-gross="${escapeHtml(String(o.gross_amount||0))}">
        <i class="ri-pencil-line"></i> Edit
      </button>`
    ]));

    if (grid) grid.destroy();

    grid = new gridjs.Grid({
      columns: [
        { name: 'Order' },
        { name: 'Produk' },
        { name: 'Customer' },
        { name: 'Amount' },
        { name: 'Pay' },
        { name: 'Fulfill' },
        { name: 'Action' }
      ],
      data: rows,
      pagination: { enabled: true, limit: 5 },
      sort: true,
      search: false,
      className: {
        table: 'gridjs-table',
      }
    }).render(document.getElementById('ordersGrid'));
  }

  function openModalFromData(data){
    $('#mOrderId').text(data.oid);
    $('#mFulfill').val(data.ful || 'waiting');
    $('#mNote').val(data.note || '');
    $('#mPayBadge').html(payBadge(data.pay || '-'));
    $('#mGross').text(rupiah(data.gross || 0));

    $('body').addClass('modal-open');
    $('#modal').removeClass('hidden').removeClass('rd-modal-hide').addClass('rd-modal-show');
  }

  function closeModal(){
    $('#modal').removeClass('rd-modal-show').addClass('rd-modal-hide');
    setTimeout(() => {
      $('#modal').addClass('hidden');
      $('body').removeClass('modal-open');
    }, 180);
  }

  async function loadAndRender() {
    if (!isOrdersPage()) return;

    try {
      // skeleton kecil
      $('#ordersGrid').html('<div class="skeleton" style="height:120px;border-radius:18px;"></div>');

      const data = await fetchOrders();
      LAST_DATA = data;
      renderTable(data);
    } catch (e) {
      toastr.error(e.message || 'Failed load orders');
      $('#ordersGrid').html(`<div class="text-rose-600 text-sm">Gagal load orders</div>`);
      $('#countBox').text('0');
    }
  }

  function bindEventsOnce() {
    // refresh + filter
    $(document).off('click', '#btnRefresh').on('click', '#btnRefresh', loadAndRender);

    $(document).off('click', '#btnQuickPending').on('click', '#btnQuickPending', function(){
      $('#pay_status').val('pending');
      $('#fulfill_status').val('');
      loadAndRender();
    });

    $(document).off('click', '#btnQuickWaiting').on('click', '#btnQuickWaiting', function(){
      $('#fulfill_status').val('waiting');
      $('#pay_status').val('');
      loadAndRender();
    });

    $(document).off('keyup', '#q').on('keyup', '#q', (window.RD?.util?.debounce || ((f)=>f))(loadAndRender, 400));
    $(document).off('change', '#pay_status, #fulfill_status').on('change', '#pay_status, #fulfill_status', loadAndRender);

    // edit modal (delegated)
    $(document).off('click', '.js-edit').on('click', '.js-edit', function(){
      const data = {
        oid: String($(this).data('oid') || ''),
        pay: String($(this).data('pay') || ''),
        ful: String($(this).data('ful') || ''),
        note: String($(this).data('note') || ''),
        gross: String($(this).data('gross') || '0')
      };
      openModalFromData(data);
    });

    $(document).off('click', '#closeModal').on('click', '#closeModal', closeModal);
    $(document).off('click', '#modal').on('click', '#modal', (e) => { if (e.target.id === 'modal') closeModal(); });

    $(document).off('keydown.rdorders').on('keydown.rdorders', function(e){
      if (e.key === 'Escape' && !$('#modal').hasClass('hidden')) closeModal();
    });

    // save
    $(document).off('click', '#saveBtn').on('click', '#saveBtn', async function(){
      const oid = $('#mOrderId').text().trim();
      if (!oid) return;

      window.RD?.ui?.overlay?.(true);
      try {
        const resp = await $.ajax({
          method:'POST',
          url: window.__ADMIN_BASE + '/api/orders/' + encodeURIComponent(oid) + '/fulfill',
          data: {
            fulfill_status: $('#mFulfill').val(),
            admin_note: $('#mNote').val()
          },
          headers: { 'X-CSRF-Token': window.__CSRF_TOKEN }
        });

        if (!resp?.ok) throw new Error(resp?.message || 'Failed');
        toastr.success('Saved');
        closeModal();
        loadAndRender();
      } catch (e) {
        toastr.error(e.responseJSON?.message || e.message || 'Failed');
      } finally {
        window.RD?.ui?.overlay?.(false);
      }
    });
  }

  // SPA hook: setiap hash berubah atau content berubah, coba init orders
  function tryInitOrders() {
    if (!isOrdersPage()) return;
    bindEventsOnce();
    loadAndRender();
  }

  window.addEventListener('hashchange', tryInitOrders);

  // ketika partial selesai di-inject, tunggu sedikit lalu cek
  const mo = new MutationObserver(() => { tryInitOrders(); });
  mo.observe(document.getElementById('admin-content'), { childList: true, subtree: true });

})();
