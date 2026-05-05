// shared/api.js — fetch helper that injects Telegram initData when available
(function () {
  function tgInitData() {
    try {
      if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) {
        return window.Telegram.WebApp.initData;
      }
    } catch {}
    return null;
  }

  function asImpersonation() {
    const u = new URL(window.location.href);
    return u.searchParams.get('as');
  }

  async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    const init = tgInitData();
    if (init) headers['X-Telegram-Init-Data'] = init;
    let url = '/api' + path;
    const imp = asImpersonation();
    if (imp) {
      url += (url.includes('?') ? '&' : '?') + 'as=' + encodeURIComponent(imp);
    }
    const res = await fetch(url, { ...opts, headers });
    if (!res.ok) {
      let body; try { body = await res.json(); } catch { body = { error: res.statusText }; }
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  function fmtKZT(n) {
    return Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ').replace(/ /g, ' ') + ' ₸';
  }
  function fmtNum(n) {
    return Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ').replace(/ /g, ' ');
  }

  window.api = api;
  window.fmtKZT = fmtKZT;
  window.fmtNum = fmtNum;
})();
