/* Renders every backing style offline through the real mix chain and reports levels. */
const { chromium } = require(process.env.PW || 'playwright');
const BASE = (process.argv[2] || 'http://127.0.0.1:8710').replace(/\/$/, '');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await (await b.newContext()).newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.addInitScript(() => { try { localStorage.setItem('orbitV2Intro', 'true'); } catch (e) {} });
  await p.goto(BASE + '/index.html'); await p.waitForTimeout(300);
  const r = await p.evaluate(async () => {
    const O = ORBIT, E = O.engine, M = O.music; E.unlock(); await E.ensureRunning();
    const st = buf => { let pk = 0, s = 0, n = 0; for (let ch = 0; ch < buf.numberOfChannels; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; s += d[i] * d[i]; n++; } } return [+(20 * Math.log10(pk + 1e-9)).toFixed(1), +(10 * Math.log10(s / n + 1e-12)).toFixed(1)]; };
    const out = {}, missing = [];
    for (const [id, bpm] of [['boombap', 88], ['jazzhop', 104], ['house', 128], ['garage', 130], ['melodic', 122], ['dark', 140]]) {
      const paths = M.assetsFor(id); await O.assets.ensure(paths); paths.forEach(x => { if (!O.assets.get(x)) missing.push(x); });
      const secs = 240 / bpm * 8 + 0.5;
      out[id] = { mix: st(await M.renderOffline(id, bpm, secs, { guide: 1, preLimiter: true })) };
      for (const l of ['melody', 'bass', 'drums']) out[id][l] = st(await M.renderOffline(id, bpm, secs, { guide: 1, only: l, preLimiter: true }));
    }
    return { out, missing };
  });
  console.log('style      mix[pk,rms]   melody      bass        drums');
  for (const [k, v] of Object.entries(r.out)) console.log(k.padEnd(10), JSON.stringify(v.mix).padEnd(13), JSON.stringify(v.melody).padEnd(12), JSON.stringify(v.bass).padEnd(12), JSON.stringify(v.drums));
  console.log('missing assets:', r.missing, 'errors:', errs);
  await b.close();
})();
