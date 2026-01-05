(function(){
  // prevent double boot if script reloaded somehow
  if (window.__RD_ORDERS_BOOTED) return;
  window.__RD_ORDERS_BOOTED = true;

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
    if(st === 'expire' || st === 'cancel' || st === 'deny' || st === 'failure') return `<span class="badge bad"><i class="ri-close-line"></i> ${st}</span>`;
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

  let CURRENT = null;
  let DT = null;
  let DATA = [];

  function openModal(data){
    CURRENT = data.oid;
    $('#mOrderId').text(CURRENT);
    $('#mFulfill').val(data.ful || 'waiting');
    $('#mNote').val(data.note || '');
    $('#mPayBadge').html(payBadge(data.pay || '-'));
    $('#mGross').text(rupiah(data.gross || 0));
    $('body').addClass('modal-open');
    $('#modal').removeClass('hidden');
  }

  function closeModal(){
    $('#modal').addClass('hidden');
    $('body').removeClass('modal-open');
    CURRENT = null;
  }

  function ensureDataTable(){
    if (!window.jQuery || !$.fn || !$.fn.DataTable) {
      console.error('DataTables belum ke-load. Pastikan CDN DataTables ada di admin_shell.ejs setelah jQuery.');
      toastr.error('DataTables belum termuat (cek CDN/urutan script).');
      return null;
    }

    const tableSel = '#ordersTable';

    if ($.fn.DataTable.isDataTable(tableSel)) {
      $(tableSel).DataTable().destroy();
    }

    DT = $(tableSel).DataTable({
      pageLength: 5,
      lengthChange: false,
      searching: false,   // search kita pakai input sendiri
      ordering: false,
      info: true,
      paging: true,
      responsive: true,
      language: {
        paginate: { previous: '‹', next: '›' },
        info: 'Menampilkan _START_ - _END_ dari _TOTAL_ data',
        infoEmpty: 'Tidak ada data',
        emptyTable: 'Tidak ada data',
        zeroRecords: 'Tidak ada data',
      }
    });

    return DT;
  }

  function buildRow(o){
    const note = escapeHtml(o.admin_note || '');
    return [
      `
        <div class="font-extrabold">${escapeHtml(o.order_id)}</div>
        <div class="text-xs text-slate-500">${escapeHtml(String(o.created_at).replace('T',' ').slice(0,19))}</div>
      `,
      `
        <div class="font-extrabold">${escapeHtml(o.product_name)}</div>
        <div class="text-xs text-slate-500">qty: ${Number(o.qty||0)} • unit: ${rupiah(o.unit_price||0)}</div>
      `,
      `
        <div class="font-extrabold">${escapeHtml(o.game_id)}</div>
        <div class="text-xs text-slate-500">${escapeHtml(o.nickname || '-')} • ${escapeHtml(o.whatsapp || '-')}</div>
      `,
      `<div class="font-extrabold">${rupiah(o.gross_amount)}</div>`,
      payBadge(o.pay_status),
      fulfillBadge(o.fulfill_status),
      `
        <button class="btn btn-sm js-edit"
          data-oid="${escapeHtml(o.order_id)}"
          data-pay="${escapeHtml(o.pay_status)}"
          data-ful="${escapeHtml(o.fulfill_status)}"
          data-note="${note}"
          data-gross="${escapeHtml(String(o.gross_amount||0))}">
          <i class="ri-pencil-line"></i> Edit
        </button>
      `
    ];
  }

  async function load(){
    // pastikan halaman orders sedang aktif dan elemen ada
    if (!document.getElementById('ordersTable')) return;

    const qs = $.param({
      q: $('#q').val(),
      pay_status: $('#pay_status').val(),
      fulfill_status: $('#fulfill_status').val()
    });

    // skeleton
    if (RD?.ui?.skeletonTableRows) {
      RD.ui.skeletonTableRows('#ordersTable tbody', 7, 6);
    }

    try{
      const resp = await $.ajax({
        method:'GET',
        url: window.__ADMIN_BASE + '/api/orders?' + qs,
        headers: { 'X-CSRF-Token': window.__CSRF_TOKEN }
      });

      if (!resp.ok) throw new Error(resp.message || 'Failed');

      DATA = resp.data || [];
      $('#countBox').text(DATA.length);

      // init DT if needed
      if (!DT) ensureDataTable();
      if (!DT) return;

      // refill
      DT.clear();
      DT.rows.add(DATA.map(buildRow));
      DT.draw();

    }catch(e){
      console.error(e);
      toastr.error(e?.responseJSON?.message || e.message || 'Order gagal dimuat');
      $('#countBox').text('0');
    }
  }

  function bind(){
    // avoid double-binding
    $(document).off('click.rdOrders', '#btnRefresh');
    $(document).off('click.rdOrders', '#btnQuickPending');
    $(document).off('click.rdOrders', '#btnQuickWaiting');
    $(document).off('keyup.rdOrders', '#q');
    $(document).off('change.rdOrders', '#pay_status, #fulfill_status');
    $(document).off('click.rdOrders', '.js-edit');
    $(document).off('click.rdOrders', '#closeModal');
    $(document).off('click.rdOrders', '#modal');
    $(document).off('keydown.rdOrders');
    $(document).off('click.rdOrders', '#saveBtn');

    $(document).on('click.rdOrders', '#btnRefresh', load);

    $(document).on('click.rdOrders', '#btnQuickPending', function(){
      $('#pay_status').val('pending');
      $('#fulfill_status').val('');
      load();
    });

    $(document).on('click.rdOrders', '#btnQuickWaiting', function(){
      $('#fulfill_status').val('waiting');
      $('#pay_status').val('');
      load();
    });

    $(document).on('keyup.rdOrders', '#q', RD.util.debounce(load, 400));
    $(document).on('change.rdOrders', '#pay_status, #fulfill_status', load);

    $(document).on('click.rdOrders', '.js-edit', function(){
      const data = {
        oid: String($(this).data('oid') || ''),
        pay: String($(this).data('pay') || ''),
        ful: String($(this).data('ful') || ''),
        note: String($(this).data('note') || ''),
        gross: String($(this).data('gross') || '0')
      };
      openModal(data);
    });

    $(document).on('click.rdOrders', '#closeModal', closeModal);
    $(document).on('click.rdOrders', '#modal', (e) => { if (e.target.id === 'modal') closeModal(); });

    $(document).on('keydown.rdOrders', function(e){
      if (e.key === 'Escape' && !$('#modal').hasClass('hidden')) closeModal();
    });

    $(document).on('click.rdOrders', '#saveBtn', async function(){
      if (!CURRENT) return;
      RD.ui.overlay(true);
      try{
        const resp = await $.ajax({
          method:'POST',
          url: window.__ADMIN_BASE + '/api/orders/' + encodeURIComponent(CURRENT) + '/fulfill',
          data: {
            fulfill_status: $('#mFulfill').val(),
            admin_note: $('#mNote').val()
          },
          headers: { 'X-CSRF-Token': window.__CSRF_TOKEN }
        });
        if (!resp.ok) throw new Error(resp.message || 'Failed');
        toastr.success('Saved');
        closeModal();
        load();
      }catch(e){
        toastr.error(e?.responseJSON?.message || e.message || 'Failed');
      }finally{
        RD.ui.overlay(false);
      }
    });
  }

  // Hook ke router: setiap masuk orders, init ulang DT + load
  function onRoute(){
    // reset state per masuk halaman orders
    DT = null;
    CURRENT = null;

    // init after partial rendered
    setTimeout(() => {
      if (!document.getElementById('ordersTable')) return;
      bind();
      ensureDataTable();
      load();
    }, 0);
  }

  // jalankan saat hash orders aktif
  function isOrders(){ return (location.hash || '').startsWith('#/orders'); }

  window.addEventListener('hashchange', function(){
    if (isOrders()) onRoute();
  });

  // first time
  if (isOrders()) onRoute();

  // cleanup ketika leave page via RD.router
  if (window.RD && RD.router && RD.router.onLeave) {
    RD.router.onLeave(() => {
      try{
        if (DT) { DT.destroy(); DT = null; }
      }catch(_){}
      $('body').removeClass('modal-open');
      $('#modal').addClass('hidden');
      CURRENT = null;
    });
  }
})();
