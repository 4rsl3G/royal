window.RD = window.RD || {};

RD.ui = {
  overlay(on){
    $('#overlay').toggleClass('hidden', !on);
  },
  skeleton(targetSel, rows=8){
    let html = '';
    for (let i=0;i<rows;i++){
      html += `<tr><td colspan="7" class="py-2"><div class="skel h-6"></div></td></tr>`;
    }
    $(targetSel).html(html);
  },
  skeletonCards(n=5){
    let html = '';
    for (let i=0;i<n;i++){
      html += `<div class="skel h-20 mb-2"></div>`;
    }
    return html;
  }
};

RD.util = {
  debounce(fn, wait){
    let t;
    return function(...args){
      clearTimeout(t);
      t = setTimeout(()=>fn.apply(this,args), wait);
    }
  }
};

RD.router = (() => {
  let leaveHandlers = [];
  function onLeave(fn){ leaveHandlers.push(fn); }

  async function loadPartial(url){
    $('#admin-content').html(`<div class="skel h-10"></div><div class="skel h-28 mt-3"></div><div class="skel h-28 mt-3"></div>`);
    const html = await $.ajax({ method:'GET', url });
    $('#admin-content').html(html);
  }

  async function route(){
    try { leaveHandlers.forEach(fn => fn()); } catch(e) {}
    leaveHandlers = [];

    let hash = (window.location.hash || '#/dashboard').replace('#','');
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

  function init(){
    $.ajaxSetup({
      beforeSend: function(xhr, settings){
        const m = (settings.type || settings.method || 'GET').toUpperCase();
        if (m !== 'GET') xhr.setRequestHeader('X-CSRF-Token', window.__CSRF_TOKEN);
      }
    });

    window.addEventListener('hashchange', route);
    route();
  }

  return { init, onLeave };
})();

$(function(){
  toastr.options = {
    closeButton:true,
    newestOnTop:true,
    progressBar:true,
    timeOut:2500
  };
  RD.router.init();
});
