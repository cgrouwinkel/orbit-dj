/* ORBIT DJ v2 — shared helpers. Plain script (no modules) so the standalone build works from file:// */
(function () {
  'use strict';
  const O = (window.ORBIT = window.ORBIT || {});
  O.VERSION = '3.1.0';

  O.$ = (s, root) => (root || document).querySelector(s);
  O.$$ = (s, root) => Array.from((root || document).querySelectorAll(s));
  O.clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // localStorage wrapper. Never throws (private mode / Scriptable WebView can block storage).
  O.store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        const v = JSON.parse(raw);
        return v === null || v === undefined ? fallback : v;
      } catch (e) { return fallback; }
    },
    getRaw(key, fallback) {
      try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} },
    setRaw(key, value) { try { localStorage.setItem(key, value); } catch (e) {} },
    remove(key) { try { localStorage.removeItem(key); } catch (e) {} }
  };

  // Tiny event bus so modules stay decoupled.
  const handlers = {};
  O.on = (name, fn) => { (handlers[name] = handlers[name] || []).push(fn); return () => { handlers[name] = handlers[name].filter(f => f !== fn); }; };
  O.emit = (name, data) => { (handlers[name] || []).slice().forEach(fn => { try { fn(data); } catch (e) { console.error('[ORBIT] handler for', name, e); } }); };

  const ua = navigator.userAgent || '';
  O.isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  O.reducedMotion = () => document.documentElement.classList.contains('reduce-motion');

  // Returns a high-resolution performance.now()-based time for an input event,
  // guarding against old engines that report epoch timestamps.
  O.eventTime = (e) => {
    const now = performance.now();
    const ts = e && typeof e.timeStamp === 'number' ? e.timeStamp : 0;
    if (!ts || ts > now + 5 || now - ts > 400) return now;
    return ts;
  };

  O.toast = (msg, ms) => {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(O._toastT);
    O._toastT = setTimeout(() => el.classList.remove('show'), ms || 2200);
  };
})();
