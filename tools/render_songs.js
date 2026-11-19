/* Renders every venue's full song (intro to finale) with the app's own engine and prints level stats.
   Usage: node tools/render_songs.js http://127.0.0.1:8710 outdir   -> outdir/songs.wav (convert with ffmpeg) */
const { chromium } = require(process.env.PW || 'playwright');
const fs = require('fs'), path = require('path');
const BASE = (process.argv[2] || 'http://127.0.0.1:8710').replace(/\/$/, ''), OUT = process.argv[3] || 'previews';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ acceptDownloads: true }); const p = await ctx.newPage();
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  await p.addInitScript(() => { try { localStorage.setItem('orbitV2Intro', 'true'); localStorage.setItem('orbitV22Tutorial', 'true'); } catch (e) {} });
  await p.goto(BASE + '/index.html'); await p.waitForTimeout(300);
  await p.evaluate(async () => { ORBIT.engine.unlock(); await ORBIT.engine.ensureRunning(); });
  const [dl, stats] = await Promise.all([p.waitForEvent('download', { timeout: 300000 }), p.evaluate(async () => {
    const M = ORBIT.music, G = ORBIT.game, bufs = [], stats = {};
    const lvl = (b, a, z) => { let s = 0, n = 0, pk = 0; for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = Math.floor(a * b.sampleRate); i < Math.min(d.length, Math.floor(z * b.sampleRate)); i++) { s += d[i] * d[i]; n++; pk = Math.max(pk, Math.abs(d[i])); } } return [+(10 * Math.log10(s / n + 1e-12)).toFixed(1), +(20 * Math.log10(pk + 1e-9)).toFixed(1)]; };
    for (const v of G.VENUES) {
      const bars = G.barsFor(v.bpm), secs = bars * 240 / v.bpm, bar = 240 / v.bpm;
      await ORBIT.assets.ensure(M.assetsFor(v.style).concat(['impact', 'riser', 'crowd'].map(ORBIT.assets.fxPath)));
      const extra = (c, nodes) => { ORBIT.synth.oneShot(c, nodes.pads, ORBIT.assets.fxPath('impact'), 0.05 + secs, 0.8); ORBIT.synth.oneShot(c, nodes.pads, ORBIT.assets.fxPath('crowd'), 0.13 + secs, 0.6); };
      const pre = await M.renderOffline(v.style, v.bpm, secs + 0.45, { guide: 1, form: bars, preLimiter: true });
      const out = await M.renderOffline(v.style, v.bpm, secs + 3, { guide: 1, form: bars, extra });
      const st = { bars, secs: +secs.toFixed(1), all: lvl(pre, 0, secs), sections: {} };
      for (const s of M.sections(bars)) st.sections[s.sec] = lvl(pre, 0.05 + s.bar * bar, 0.05 + (s.bar + s.bars) * bar);
      st.out = lvl(out, 0, secs + 3);
      stats[v.style] = st; bufs.push(out);
    }
    const rate = bufs[0].sampleRate, gapN = Math.round(0.6 * rate), len = bufs.reduce((n, x) => n + x.length + gapN, 0);
    const out = new AudioBuffer({ length: len, numberOfChannels: 2, sampleRate: rate }); let o = 0;
    for (const x of bufs) { for (let c = 0; c < 2; c++) out.getChannelData(c).set(x.getChannelData(Math.min(c, x.numberOfChannels - 1)), o); o += x.length + gapN; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(ORBIT.beatpad.encodeWav(out)); a.download = 'songs.wav'; document.body.appendChild(a); a.click();
    return stats;
  })]);
  await dl.saveAs(path.join(OUT, 'songs.wav'));
  for (const [k, v] of Object.entries(stats)) console.log(k, JSON.stringify(v));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
