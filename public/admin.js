// public/admin.js (UPDATED - auto-load /public/order.js only on Orders page)
window.RD = window.RD || {};

(function () {
  RD.ui = {
    overlay(on) { $('#overlay').toggleClass('hidden', !on); },

    skeletonTableRows(targetSel, cols = 7, rows = 8) {
      let html = '';
      for (let i = 0; i < rows; i++) {
        html += `
          <tr>
            <td colspan="${cols}" style="padding:10px 12px;">
              <div class="skeleton" style="height:22px;border-radius:14px;"></div>
            </td>
          </tr>`;
      }
      $(targetSel).html(html);
    },

    skeletonBlocks(n = 4) {
      let html = '';
      for (let i = 0; i < n; i++) {
        html += `<div class="skeleton" style="height:88px;border-radius:22px;margin-bottom:12px;"></div>`;
      }
      return html;
    },

    skeletonPage() {
      return `
        <div class="skeleton" style="height:34px;border-radius:18px;"></div>
        <div class="skeleton" style="height:120px;border-radius:22px;margin-top:14px;"></div>
        <div class="skeleton" style="height:120px;border-radius:22px;margin-top:14px;"></div>
      `;
    },

    animateIn($el) {
      $el.css({ opacity: 0, transform: 'translateY(10px)' });
      setTimeout(() => {
        $el.css({
          opacity: 1,
          transform: 'translateY(0)',
          transition: 'opacity .18s ease, transform .18s ease'
        });
      }, 10);
    },

    toast: {
      ok(m) { toastr.success(m || 'OK'); },
      err(m) { toastr.error(m || 'Terjadi kesalahan'); },
      info(m) { toastr.info(m || ''); },
      warn(m) { toastr.warning(m || ''); }
    }
  };

  RD.util = {
    debounce(fn, wait) {
      let t;
      return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
      };
    },

    loadScriptOnce(src) {
      RD.__loadedScripts = RD.__loadedScripts || {};
      if (RD.__loadedScripts[src]) return RD.__loadedScripts[src];

      RD.__loadedScripts[src] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => resolve(true);
        s.onerror = () => reject(new Error('Failed load script: ' + src));
        document.head.appendChild(s);
      });

      return RD.__loadedScripts[src];
    }
  };

  RD.pages = RD.pages || {};

  RD.router = (() => {
    let leaveHandlers = [];

    function onLeave(fn) { leaveHandlers.push(fn); }

    function runLeave() {
      try { leaveHandlers.forEach(fn => fn()); } catch (_) {}
      leaveHandlers = [];
    }

    async function mountPage($content) {
      const pageEl = $content.find('[data-admin-page]').first();
      const page = pageEl.data('admin-page');

      if (!page) return;

      // Only load order.js on orders page
      if (page === 'orders') {
        const url = '/public/order.js?v=' + encodeURIComponent(window.__ASSET_V || '1');
        try {
          await RD.util.loadScriptOnce(url);
        } catch (e) {
          RD.ui.toast.err('Gagal memuat order.js');
          return;
        }
      }

      // call mount if exists
      if (RD.pages[page] && typeof RD.pages[page].mount === 'function') {
        RD.pages[page].mount();
        // auto unmount on route leave
        if (typeof RD.pages[page].unmount === 'function') {
          RD.router.onLeave(() => RD.pages[page].unmount());
        }
      }
    }

    async function loadPartial(url) {
      const $content = $('#admin-content');
      $content.html(RD.ui.skeletonPage());

      try {
        const html = await $.ajax({ method: 'GET', url });
        $content.html(html);
        $content.addClass('fade-up');
        RD.ui.animateIn($content);

        await mountPage($content);

      } catch (e) {
        RD.ui.toast.err('Gagal memuat halaman admin.');
        $content.html(`
          <div class="card card-pad fade-up">
            <div class="card-title">Error</div>
            <div class="card-sub">Gagal memuat konten. Coba refresh.</div>
            <div style="margin-top:12px;">
              <button class="btn btn-primary shimmer" id="btn-admin-retry">
                <i class="ri-refresh-line"></i> Retry
              </button>
            </div>
          </div>
        `);

        $(document).off('click', '#btn-admin-retry').on('click', '#btn-admin-retry', () => loadPartial(url));
      }
    }

    async function route() {
      runLeave();

      let hash = (window.location.hash || '#/dashboard').replace('#', '');
      if (hash === '/' || hash === '') hash = '/dashboard';

      const parts = hash.split('/').filter(Boolean);
      const base = parts[0] || 'dashboard';

      if (base === 'dashboard') return loadPartial(window.__ADMIN_BASE + '/dashboard');
      if (base === 'orders') return loadPartial(window.__ADMIN_BASE + '/orders');
      if (base === 'products') return loadPartial(window.__ADMIN_BASE + '/products');
      if (base === 'settings') return loadPartial(window.__ADMIN_BASE + '/settings');
      if (base === 'whatsapp') return loadPartial(window.__ADMIN_BASE + '/whatsapp');

      return loadPartial(window.__ADMIN_BASE + '/dashboard');
    }

    function init() {
      $.ajaxSetup({
        beforeSend: function (xhr, settings) {
          const m = (settings.type || settings.method || 'GET').toUpperCase();
          if (m !== 'GET') xhr.setRequestHeader('X-CSRF-Token', window.__CSRF_TOKEN);
        }
      });

      window.addEventListener('hashchange', route);
      route();
    }

    return { init, onLeave };
  })();

  $(function () {
    toastr.options = { closeButton: true, newestOnTop: true, progressBar: true, timeOut: 2500 };
    RD.router.init();
  });

})();
