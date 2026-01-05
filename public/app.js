(function () {
  const RD = window.RD = window.RD || {};

  RD.csrf = function () {
    return $('meta[name="csrf-token"]').attr('content') || '';
  };

  RD.toast = {
    ok: (m) => toastr.success(m || 'OK'),
    err: (m) => toastr.error(m || 'Terjadi kesalahan'),
    info: (m) => toastr.info(m || ''),
    warn: (m) => toastr.warning(m || '')
  };

  RD.ui = {
    overlay(on) {
      $('#overlay-loading').toggleClass('hidden', !on);
    },
    skeleton(targetSel) {
      const html = `
        <div class="hero-wrap p-5 md:p-8">
          <div class="skeleton h-6 w-40 mb-4"></div>
          <div class="skeleton h-10 w-72 mb-3"></div>
          <div class="skeleton h-10 w-64 mb-6"></div>
          <div class="skeleton h-5 w-full max-w-xl mb-2"></div>
          <div class="skeleton h-5 w-5/6 max-w-lg mb-8"></div>
          <div class="flex gap-3 flex-wrap">
            <div class="skeleton h-12 w-40"></div>
            <div class="skeleton h-12 w-36"></div>
          </div>
        </div>

        <div class="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div class="skeleton h-28"></div>
          <div class="skeleton h-28"></div>
          <div class="skeleton h-28"></div>
          <div class="skeleton h-28"></div>
        </div>
      `;
      $(targetSel).html(html);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // "/#/checkout" or "/#\/checkout" -> "#/checkout"
  function normalizeHashFromHref(href) {
    if (!href) return '';
    const h = String(href).trim();

    if (h.startsWith('/#/')) return '#' + h.slice(2);          // "/#/a" -> "#/a"
    if (h.startsWith('/#\\/')) return '#/' + h.split('/#\\/')[1]; // "/#\/a" -> "#/a"
    if (h.startsWith('#/')) return h;                          // "#/a" -> "#/a"
    return '';
  }

  function setActiveNavByHash() {
    const hash = location.hash || '#/home';
    $('.nav-link').removeClass('active');

    const selHome = '[href="/#/home"],[href="/#\\\\/home"],[href="#/home"]';
    const selProducts = '[href="/#/products"],[href="/#\\\\/products"],[href="#/products"]';
    const selCheckout = '[href="/#/checkout"],[href="/#\\\\/checkout"],[href="#/checkout"]';

    if (hash.startsWith('#/home')) $(selHome).addClass('active');
    else if (hash.startsWith('#/products')) $(selProducts).addClass('active');
    else if (hash.startsWith('#/checkout')) $(selCheckout).addClass('active');
    else if (hash.startsWith('#/order')) $(selCheckout).addClass('active');
    else if (hash.startsWith('#/success')) $(selCheckout).addClass('active');
    else if (hash.startsWith('#/failed')) $(selCheckout).addClass('active');
  }

  function initAOS() {
    if (!window.AOS) return;
    if (!window.__AOS_INITED) {
      AOS.init({
        duration: 700,
        easing: 'ease-out-cubic',
        once: false,
        mirror: true,
        offset: 40
      });
      window.__AOS_INITED = true;
    }
    // important when injecting new HTML
    try { AOS.refreshHard(); } catch (_) {}
  }

  // Prevent double-load race
  let __loading = false;

  async function loadPartial(url) {
    if (__loading) return;
    __loading = true;

    RD.ui.skeleton('#app-content');
    try {
      const html = await $.ajax({
        method: 'GET',
        url,
        cache: false
      });

      $('#app-content').html(html);

      // small enter animation
      $('#app-content').css({ opacity: 0, transform: 'translateY(6px)' });
      requestAnimationFrame(() => {
        $('#app-content').css({
          opacity: 1,
          transform: 'translateY(0)',
          transition: 'all .18s ease-out'
        });
      });

      initAOS();
      setActiveNavByHash();
    } catch (e) {
      RD.toast.err('Gagal memuat halaman.');
    } finally {
      __loading = false;
    }
  }

  function route() {
    const hash = location.hash || '#/home';

    if (hash === '#/' || hash === '#') {
      location.hash = '#/home';
      return;
    }

    // normalize weird forms (just in case)
    if (hash.startsWith('#\\')) {
      location.hash = hash.replace('#\\/', '#/');
      return;
    }

    if (hash.startsWith('#/home')) return loadPartial('/home');
    if (hash.startsWith('#/products')) return loadPartial('/products');
    if (hash.startsWith('#/checkout')) return loadPartial('/checkout');

    if (hash.startsWith('#/order/')) {
      const id = hash.replace('#/order/', '');
      return loadPartial(`/order/${encodeURIComponent(id)}`);
    }
    if (hash.startsWith('#/success/')) {
      const id = hash.replace('#/success/', '');
      return loadPartial(`/order/${encodeURIComponent(id)}/success`);
    }
    if (hash.startsWith('#/failed/')) {
      const id = hash.replace('#/failed/', '');
      return loadPartial(`/order/${encodeURIComponent(id)}/failed`);
    }

    return loadPartial('/home');
  }

  // Drawer
  function openDrawer() { $('#drawer').removeClass('hidden'); }
  function closeDrawer() { $('#drawer').addClass('hidden'); }

  // CSRF header for AJAX (works for GET too, harmless)
  $.ajaxSetup({
    headers: { 'x-csrf-token': RD.csrf() }
  });

  toastr.options = {
    closeButton: true,
    progressBar: true,
    newestOnTop: true,
    timeOut: 2500
  };

  // Drawer buttons
  $(document).on('click', '#btn-menu', function (e) {
    e.preventDefault();
    openDrawer();
  });
  $(document).on('click', '#btn-close-drawer, #drawer .drawer-backdrop', function (e) {
    e.preventDefault();
    closeDrawer();
  });

  // ✅ IMPORTANT: make hash links behave SPA (no full reload)
  $(document).on('click', 'a[href^="/#/"], a[href^="/#\\/"], a[href^="#/"]', function (e) {
    const href = $(this).attr('href');
    const hash = normalizeHashFromHref(href);

    if (!hash) return; // allow normal link

    e.preventDefault();
    closeDrawer();

    // Update hash (will trigger route via hashchange)
    if (location.hash !== hash) {
      location.hash = hash;
    } else {
      // same hash: refresh partial
      route();
    }
  });

  window.addEventListener('hashchange', function () {
    setActiveNavByHash();
    route();
  });

  $(function () {
    setActiveNavByHash();
    route();
  });

})();
