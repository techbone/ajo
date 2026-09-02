/**
 * Runs before React hydrates, in the document head.
 *
 * Two jobs:
 *  1. Polyfill crypto.randomUUID. Local dev is served over plain http, so the
 *     Nimiq Pay WebView is not a secure context and the real one is missing.
 *     Next's own dev runtime uses it, and the resulting throw kills hydration
 *     before any of our code runs.
 *  2. Surface uncaught errors on screen. There is no console on a phone, so
 *     without this a hydration failure looks like "the button does nothing".
 */
export const BOOT_SCRIPT = `
(function () {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
      crypto.randomUUID = function () {
        var b = new Uint8Array(16);
        if (crypto.getRandomValues) { crypto.getRandomValues(b); }
        else { for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
        b[6] = (b[6] & 15) | 64;
        b[8] = (b[8] & 63) | 128;
        var h = '';
        for (var j = 0; j < 16; j++) h += (b[j] + 256).toString(16).slice(1);
        return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
      };
      window.__ajoPolyfilledUUID = true;
    }
  } catch (e) {}

  var queue = [];
  function paint(msg) {
    try {
      if (!document.body) { queue.push(msg); return; }
      var el = document.getElementById('__ajo_err');
      if (!el) {
        el = document.createElement('pre');
        el.id = '__ajo_err';
        el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;margin:0;padding:12px;background:#3a1e1d;color:#f08a85;font:11px/1.45 ui-monospace,monospace;white-space:pre-wrap;max-height:50vh;overflow:auto;border-top:2px solid #f08a85';
        document.body.appendChild(el);
      }
      el.textContent += msg + '\\n';
    } catch (e) {}
  }
  function flush() { while (queue.length) paint(queue.shift()); }
  document.addEventListener('DOMContentLoaded', flush);

  window.addEventListener('error', function (e) {
    paint('ERROR: ' + (e.message || String(e.error)) + (e.filename ? '\\n  at ' + e.filename + ':' + e.lineno : ''));
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    paint('REJECTED: ' + ((r && r.message) ? r.message : String(r)));
  });
})();
`
