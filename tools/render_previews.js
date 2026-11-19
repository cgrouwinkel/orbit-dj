/* Renders listening previews with the app's own audio engine (headless Chrome, offline rendering).
   Usage: node tools/render_previews.js http://127.0.0.1:8710 outdir
   Produces WAVs; convert with ffmpeg afterwards. */
const { chromium } = require(process.env.PW || 'playwright');
const fs = require('fs'), path = require('path');
const BASE = (process.argv[2] || 'http://127.0.0.1:8710').replace(/\/$/, ''), OUT = process.argv[3] || 'previews';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ acceptDownloads: true }); const p = await ctx.newPage();
  await p.addInitScript(() => { try { localStorage.setItem('orbitV2Intro', 'true'); } catch (e) {} });
  await p.goto(BASE + '/index.html'); await p.waitForTimeout(300);
  async function grab(name, fnSrc) {
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 120000 }), p.evaluate(fnSrc)]);
    await dl.saveAs(path.join(OUT, name)); console.log('wrote', name);
  }
  await p.evaluate(async () => { ORBIT.engine.unlock(); await ORBIT.engine.ensureRunning(); });
  // helpers inside the page
  await p.evaluate(() => {
    window.__join = (bufs, gap) => {
      const rate = bufs[0].sampleRate, gapN = Math.round(gap * rate), len = bufs.reduce((n, x) => n + x.length + gapN, 0);
      const out = new AudioBuffer({ length: len, numberOfChannels: 2, sampleRate: rate }); let o = 0;
      for (const x of bufs) { for (let c = 0; c < 2; c++) out.getChannelData(c).set(x.getChannelData(Math.min(c, x.numberOfChannels - 1)), o); o += x.length + gapN; }
      return out;
    };
    window.__save = (buf, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(ORBIT.beatpad.encodeWav(buf)); a.download = name; document.body.appendChild(a); a.click(); };
  });
  await grab('music.wav', async () => {
    const M = ORBIT.music, bufs = [];
    for (const [id, bpm] of [['boombap', 88], ['soul', 96], ['trap', 140], ['house', 126], ['basshouse', 126], ['garage', 132], ['dubstep', 140]]) {
      await ORBIT.assets.ensure(M.assetsFor(id));
      bufs.push(await M.renderOffline(id, bpm, 240 / bpm * 8 + 1.2, { guide: 1 }));
    }
    __save(__join(bufs, 0.5), 'music.wav');
  });
  await grab('beatpad.wav', async () => {
    const BP = ORBIT.beatpad, bufs = [], ev = (pad, steps, vel, tune) => steps.map(s => ({ pad, step: s, velocity: vel, tune: tune || 0 }));
    const beats = [
      { kit: 'dusty', bpm: 90, swing: 58, style: 'boombap', events: [].concat(ev(0, [0, 8, 10], 1), ev(1, [4, 12], 1), ev(2, [0, 2, 4, 6, 8, 10, 12, 14], 0.7), ev(3, [14], 0.5), ev(5, [7], 0.5), ev(13, [0], 0.6), ev(15, [12], 0.7)) },
      { kit: 'club', bpm: 124, swing: 52, style: 'house', events: [].concat(ev(0, [0, 4, 8, 12], 1), ev(1, [4, 12], 0.9), ev(2, [1, 3, 5, 7, 9, 11, 13, 15], 0.45), ev(3, [2, 6, 10, 14], 0.7), ev(8, [3, 11], 0.6), ev(9, [6, 14], 0.55), ev(13, [0], 0.6)) },
      { kit: 'midnight', bpm: 140, swing: 50, style: 'dubstep', events: [].concat(ev(0, [0, 10], 1), ev(1, [8], 1), ev(5, [8], 0.6), ev(2, [0, 2, 4, 6, 8, 10, 12, 13, 14, 15], 0.6), ev(12, [0], 0.9, 0), ev(12, [10], 0.8, -2), ev(15, [14], 0.6)) }
    ];
    for (const x of beats) {
      BP.setKit(x.kit); await BP.loadKit(); BP.bpm = x.bpm; BP.swing = x.swing; BP.backingStyle = x.style;
      BP.patterns.D = { bars: 1, events: x.events }; BP.cur = 'D';
      bufs.push(await BP.renderBuffer(4, true));
    }
    BP.cur = 'A'; __save(__join(bufs, 0.4), 'beatpad.wav');
  });
  await b.close();
})();
