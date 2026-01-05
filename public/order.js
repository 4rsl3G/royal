// public/order.js (NEW - Grid.js premium table + 5 per page + modal smooth + filters)
window.RD = window.RD || {};
RD.pages = RD.pages || {};

(function () {
  let grid = null;
  let DATA = [];
  let CURRENT = null;

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
    if(st === 'settlement' || st === 'capture') return `<span class="badge good"><i class="ri-check-line"></i> ${escapeHtml(st)}</span>`;
    if(st === 'pending') return `<span class="badge warn"><i class="ri-time-line"></i> pending</span>`;
    if(st === 'expire' || st === 'cancel' || st === 'deny' || st === 'failure') return `<span class="badge bad"><i class="ri-close-line"></i> ${escapeHtml(st)}</span>`;
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

  function openModal(data){
    CURRENT = String(data.order_id || '');
    $('#mOrderId').text(CURRENT);
    $('#mFulfill').val(String(data.fulfill_status || 'waiting'));
    $('#mNote').val(String(data.admin_note || ''));
    $('#mPayBadge').html(payBadge(data.pay_status || '-'));
    $('#mGross').text(rupiah(data.gross_amount || 0));

    $('body').addClass('modal-open');
    const $m = $('#modal');
    $m.removeClass('hidden');
    requestAnimationFrame(() => $m.addClass('is-open'));
  }

  function closeModal(){
    const $m = $('#modal');
    $m.removeClass('is-open');
    setTimeout(() => {
      $m.addClass('hidden');
      $('body').removeClass('modal-open');
      CURRENT = null;
    }, 180);
  }

  function buildGrid(rows){
    const el = document.getElementById('ordersGrid');
    if (!el) return;

    // destroy previous
    if (grid && typeof grid.destroy === 'function') {
      try { grid.destroy(); } catch (_) {}
      grid = null;
    }
    el.innerHTML = '';

    const data = rows.map(o => ([
      o.order_id,
      o.product_name,
      `${o.game_id}${o.nickname ? ' • ' + o.nickname : ''}${o.whatsapp ? ' • ' + o.whatsapp : ''}`,
      rupiah(o.gross_amount),
      gridjs.html(payBadge(o.pay_status)),
      gridjs.html(fulfillBadge(o.fulfill_status)),
      gridjs.html(`
        <button class="btn btn-sm js-edit"
          data-oid="${escapeHtml(o.order_id)}"
          data-pay="${escapeHtml(o.pay_status)}"
          data-ful="${escapeHtml(o.fulfill_status)}"
          data-note="${escapeHtml(o.admin_note || '')}"
          data-gross="${escapeHtml(String(o.gross_amount||0))}">
          <i class="ri-pencil-line"></i> Edit
        </button>
      `)
    ]));

    grid = new gridjs.Grid({
      columns: [
        { name: 'Order', width: '260px' },
        { name: 'Produk', width: '260px' },
        { name: 'Customer', width: '300px' },
        { name: 'Amount', width: '140px' },
        { name: 'Pay', width: '140px' },
        { name: 'Fulfill', width: '160px' },
        { name: 'Action', width: '140px' }
      ],
      data,
      sort: true,
      pagination: { limit: 5 },
      fixedHeader: true,
      height: '62vh',
      className: {
        table: 'rd-grid',
        th: 'rd-grid-th',
        td: 'rd-grid-td'
      },
      language: {
        'search': { 'placeholder': 'Search table...' },
        'pagination': {
          'previous': 'Prev',
          'next': 'Next',
          'showing': 'Showing',
          'results': () => 'rows'
        },
        'noRecordsFound': 'No data'
      }
    }).render(el);
  }

  async function load(){
    const qs = $.param({
      q: $('#q').val(),
      pay_status: $('#pay_status').val(),
      fulfill_status: $('#fulfill_status').val()
    });

    // skeleton
    const $grid = $('#ordersGrid');
    $grid.html(`<div class="skeleton" style="height:340px;border-radius:22px;"></div>`);

    try {
      const resp = await $.ajax({
        method:'GET',
        url: window.__ADMIN_BASE + '/api/orders?' + qs,
        headers: { 'X-CSRF-Token': window.__CSRF_TOKEN }
      });

      if (!resp || !resp.ok) throw new Error(resp?.message || 'Failed');

      DATA = Array.isArray(resp.data) ? resp.data : [];
      $('#countBox').text(DATA.length);

      buildGrid(DATA);

    } catch(e) {
      toastr.error(e.message || 'order gagal dimuat');
      $('#ordersGrid').html(`<div class="text-rose-600 text-sm">Error load orders</div>`);
      $('#countBox').text('0');
    }
  }

  function mount(){
    // events (bind once per mount)
    $(document).off('click.rdorders');

    $(document).on('click.rdorders', '#btnRefresh', load);

    $(document).on('click.rdorders', '#btnQuickPending', function(){
      $('#pay_status').val('pending');
      $('#fulfill_status').val('');
      load();
    });

    $(document).on('click.rdorders', '#btnQuickWaiting', function(){
      $('#fulfill_status').val('waiting');
      $('#pay_status').val('');
      load();
    });

    $(document).on('keyup.rdorders', '#q', RD.util.debounce(load, 400));
    $(document).on('change.rdorders', '#pay_status, #fulfill_status', load);

    // delegated edit
    $(document).on('click.rdorders', '.js-edit', function(){
      const oid = String($(this).data('oid') || '');
      const o = (DATA || []).find(x => String(x.order_id) === oid);

      // prefer full object from DATA, fallback to dataset
      if (o) return openModal(o);

      openModal({
        order_id: oid,
        pay_status: String($(this).data('pay') || ''),
        fulfill_status: String($(this).data('ful') || ''),
        admin_note: String($(this).data('note') || ''),
        gross_amount: Number($(this).data('gross') || 0)
      });
    });

    $(document).on('click.rdorders', '#closeModal, #modalBackdrop', closeModal);

    $(document).on('keydown.rdorders', function(e){
      if (e.key === 'Escape' && !$('#modal').hasClass('hidden')) closeModal();
    });

    $(document).on('click.rdorders', '#saveBtn', async function(){
      if (!CURRENT) return;
      RD.ui.overlay(true);
      try {
        const resp = await $.ajax({
          method:'POST',
          url: window.__ADMIN_BASE + '/api/orders/' + encodeURIComponent(CURRENT) + '/fulfill',
          data: {
            fulfill_status: $('#mFulfill').val(),
            admin_note: $('#mNote').val()
          },
          headers: { 'X-CSRF-Token': window.__CSRF_TOKEN }
        });
        if (!resp || !resp.ok) throw new Error(resp?.message || 'Failed');
        toastr.success('Saved');
        closeModal();
        load();
      } catch(e) {
        toastr.error(e.responseJSON?.message || e.message || 'Failed');
      } finally {
        RD.ui.overlay(false);
      }
    });

    load();
  }

  function unmount(){
    $(document).off('.rdorders');
    try { if (grid && typeof grid.destroy === 'function') grid.destroy(); } catch(_) {}
    grid = null;
    DATA = [];
    CURRENT = null;
  }

  RD.pages.orders = { mount, unmount };

})();
