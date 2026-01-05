(function () {
  const RD = window.RD = window.RD || {};

  RD.csrf = function () {
    return $('meta[name="csrf-token"]').attr('content');
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
          <div class="flex gap-3">
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

  function setActiveNavByHash() {
    const hash = location.hash || '#/home';
    $('.nav-link').removeClass('active');

    if (hash.startsWith('#/home')) $('[href="/#\\/home"]').addClass('active');
    else if (hash.startsWith('#/products')) $('[href="/#\\/products"]').addClass('active');
    else if (hash.startsWith('#/checkout')) $('[href="/#\\/checkout"]').addClass('active');
    else if (hash.startsWith('#/order')) $('[href="/#\\/checkout"]').addClass('active');
    else if (hash.startsWith('#/success')) $('[href="/#\\/checkout"]').addClass('active');
    else if (hash.startsWith('#/failed')) $('[href="/#\\/checkout"]').addClass('active');
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
    AOS.refreshHard();
  }

  async function loadPartial(url) {
    RD.ui.skeleton('#app-content');
    try {
      const html = await $.ajax({ method: 'GET', url });
      $('#app-content').html(html);

      initAOS();
      setActiveNavByHash();

      $('#app-content').css({ opacity: 0, transform: 'translateY(6px)' });
      setTimeout(() => {
        $('#app-content').css({
          opacity: 1,
          transform: 'translateY(0)',
          transition: 'all .18s ease-out'
        });
      }, 10);
    } catch (e) {
      RD.toast.err('Gagal memuat halaman.');
    }
  }

  function route() {
    const hash = location.hash || '#/home';

    if (hash === '#/' || hash === '#') return (location.hash = '#/home');

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

  $.ajaxSetup({
    headers: { 'x-csrf-token': RD.csrf() }
  });

  toastr.options = {
    closeButton: true,
    progressBar: true,
    newestOnTop: true,
    timeOut: 2500
  };

  $(document).on('click', '#btn-menu', openDrawer);
  $(document).on('click', '#btn-close-drawer, #drawer .drawer-backdrop', closeDrawer);

  $(document).on('click', 'a[href^="/#/"]', function () {
    closeDrawer();
  });

  window.addEventListener('hashchange', route);

  $(function () {
    setActiveNavByHash();
    route();
  });

})();
