window.RD = window.RD || {};

RD.ui = {
  overlay(on){
    $('#overlay').toggleClass('hidden', !on);
  },
  skeleton(targetSel){
    const html = `
      <div class="grid gap-3">
        <div class="skel h-10"></div>
        <div class="skel h-28"></div>
        <div class="skel h-28"></div>
        <div class="skel h-28"></div>
      </div>`;
    $(targetSel).html(html);
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

RD.anim = {
  apply(){
    const els = document.querySelectorAll('.fade-up');
    els.forEach(el => {
      // trigger in next frame
      requestAnimationFrame(()=> el.classList.add('in'));
    });
  }
};

RD.router = (() => {
  let leaveHandlers = [];
  function onLeave(fn){ leaveHandlers.push(fn); }

  async function loadPartial(url){
    RD.ui.skeleton('#app-content');
    const html = await $.ajax({ method:'GET', url });
    $('#app-content').html(html);
    RD.anim.apply();
  }

  async function route(){
    // call leave handlers (stop intervals, etc)
    try { leaveHandlers.forEach(fn => fn()); } catch(e) {}
    leaveHandlers = [];

    let hash = (window.location.hash || '#/home').replace('#', '');
    if (hash === '/' || hash === '') hash = '/home';

    // patterns:
    // /home, /products, /checkout, /order/:id, /success/:id, /failed/:id
    const parts = hash.split('/').filter(Boolean);
    const base = parts[0] || 'home';

    if (base === 'home') return loadPartial('/home');
    if (base === 'products') return loadPartial('/products');
    if (base === 'checkout') return loadPartial('/checkout');

    if (base === 'order' && parts[1]) return loadPartial(`/order/${encodeURIComponent(parts[1])}`);
    if (base === 'success' && parts[1]) return loadPartial(`/order/${encodeURIComponent(parts[1])}/success`);
    if (base === 'failed' && parts[1]) return loadPartial(`/order/${encodeURIComponent(parts[1])}/failed`);

    // fallback
    return loadPartial('/home');
  }

  function init(){
    // global ajax csrf
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
