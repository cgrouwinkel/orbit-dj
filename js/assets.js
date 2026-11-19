/* ORBIT DJ — audio asset loader.
 * Fetches WAV bytes early (no audio permission needed), decodes once the AudioContext exists,
 * re-decodes automatically if iOS forces the audio engine to be rebuilt, and supports the
 * standalone build where every file is embedded as base64.
 */
(function () {
  'use strict';
  const O = window.ORBIT, E = O.engine;
  const raw = new Map();      // path -> Promise<ArrayBuffer>
  const bufs = new Map();     // generation + path -> AudioBuffer
  const decoding = new Map(); // generation + path -> Promise<AudioBuffer|null>
  const failed = new Set();

  function b64ToBuf(b64) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }

  const A = (O.assets = {});
  A.fetch = function (path) {
    if (raw.has(path)) return raw.get(path);
    const emb = window.ORBIT_EMBEDDED_SAMPLES;
    const p = emb && emb[path] ? Promise.resolve(b64ToBuf(emb[path]))
      : fetch(path).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + path); return r.arrayBuffer(); });
    const guarded = p.catch(e => { failed.add(path); raw.delete(path); throw e; });
    raw.set(path, guarded);
    return guarded;
  };
  function decodeBytes(c, ab) {
    return new Promise((resolve, reject) => {
      let done = false; const ok = b => { if (!done) { done = true; resolve(b); } }, bad = e => { if (!done) { done = true; reject(e || new Error('decode')); } };
      try { const p = c.decodeAudioData(ab.slice(0), ok, bad); if (p && p.then) p.then(ok, bad); } catch (e) { bad(e); }
    });
  }
  A.decode = function (path) {
    const c = E.ctx; if (!c) return Promise.resolve(null);
    const key = E.generation + '|' + path;
    if (bufs.has(key)) return Promise.resolve(bufs.get(key));
    if (decoding.has(key)) return decoding.get(key);
    const p = A.fetch(path).then(ab => decodeBytes(c, ab)).then(b => { bufs.set(key, b); decoding.delete(key); return b; })
      .catch(() => { failed.add(path); decoding.delete(key); return null; });
    decoding.set(key, p);
    return p;
  };
  A.get = path => bufs.get(E.generation + '|' + path) || null;
  A.prefetch = paths => { paths.forEach(p => A.fetch(p).catch(() => {})); };
  // Resolve when every path is decoded (or failed), or after timeoutMs, whichever is first.
  A.ensure = function (paths, timeoutMs) {
    const all = Promise.all(paths.map(p => A.decode(p)));
    return timeoutMs ? Promise.race([all, new Promise(r => setTimeout(r, timeoutMs))]) : all;
  };
  A.ready = paths => paths.every(p => A.get(p));
  A.failed = path => failed.has(path);

  // ---------- catalogue helpers ----------
  const M = window.ORBIT_SOUNDS || { kits: {}, inst: {}, fx: {} };
  A.manifest = M;
  A.kitPaths = kit => (M.kits[kit] || []).map(d => d.path);
  A.instPaths = name => (M.inst[name] || []).map(root => 'sounds/inst/' + name + '-' + root + '.wav');
  A.allInstPaths = () => Object.keys(M.inst).reduce((a, n) => a.concat(A.instPaths(n)), []);
  A.fxPath = name => M.fx[name];

  // Throw away decoded buffers from an old context; decode again for the new one.
  O.on('audio-reset', () => { for (const k of Array.from(bufs.keys())) if (!k.startsWith(E.generation + '|')) bufs.delete(k); });
})();
