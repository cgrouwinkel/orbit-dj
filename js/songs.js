/* ORBIT DJ — Studio song builder and Quick Play.
 * A song = one of the seven built-in songs re-shaped by the player: tempo, key, drum kit, sound swaps,
 * muted parts, their own arrangement, and optionally their own beat-pad patterns as the drums.
 * Songs are saved on this device, play in the rhythm game (Quick Play), load onto the decks (rendered
 * in the browser) and export as WAV.
 */
(function () {
  'use strict';
  const O = window.ORBIT, E = O.engine, M = O.music, G = O.game, D = O.decks, BP = O.beatpad, S = O.store, $ = O.$, $$ = O.$$;
  const KEY = 'orbitV4Songs';
  const TEMPO = { house: 126, basshouse: 126, garage: 132, dubstep: 140, trap: 140, boombap: 88, soul: 96 };
  const TITLES = { house: 'Neon Pressure', basshouse: 'Glass Horizon', garage: 'Two-Step Tonic', dubstep: 'Final Frequency', trap: 'Night Shift', boombap: 'The First Groove', soul: 'Basement Bounce' };
  const SECTIONS = { intro: 'INTRO', verse: 'VERSE', build: 'BUILD', drop: 'DROP', break: 'BREAKDOWN', drop2: 'BIG DROP', outro: 'OUTRO' };
  const SOUND_NAMES = { sub: 'Sub', b808: '808', upright: 'Upright', techbass: 'Tech bass', donk: 'Donk', reese: 'Reese', piano: 'Piano', ep: 'Electric piano', supersaw: 'Supersaw', strings: 'Strings', brass: 'Brass', pad: 'Pad',
    pluck: 'Pluck', bell: 'Bell', flute: 'Flute', vibes: 'Vibes', vah: 'Voice “ah”', voh: 'Voice “oh”', chipoo: 'Chipmunk “oo”', chipah: 'Chipmunk “ah”', choir: 'Choir' };
  const KITS = { '': 'Song’s own kit', dusty: 'Dusty Kit', club: 'Club Kit', midnight: 'Midnight 808' };
  const ROLES = ['bass', 'keys', 'lead', 'vocal'], PARTS = ['drums', 'bass', 'keys', 'lead', 'vocal'];
  const DEFAULT_ROWS = () => [['intro', 4], ['verse', 8], ['build', 4], ['drop', 8], ['break', 4], ['drop2', 8], ['outro', 4]].map(([sec, bars]) => ({ sec, bars, drums: 'style' }));
  const uid = () => 's' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);

  const SG = (O.songs = { list: (S.get(KEY, []) || []).filter(valid), TEMPO, TITLES, SECTIONS, cur: null });
  function valid(s) { return s && typeof s.id === 'string' && M.STYLES[s.style] && Array.isArray(s.rows) && s.rows.length && s.rows.every(r => SECTIONS[r.sec] && r.bars >= 1 && r.bars <= 16); }
  const persist = () => S.set(KEY, SG.list);
  SG.get = id => SG.list.find(s => s.id === id) || null;
  SG.blank = function (style) {
    style = M.resolve(style || 'house');
    return { id: uid(), name: 'My ' + M.STYLES[style].label.toLowerCase() + ' ' + (SG.list.length + 1), style, bpm: TEMPO[style], key: 0, kit: '', swaps: { bass: '', keys: '', lead: '', vocal: '' },
      mutes: { drums: false, bass: false, keys: false, lead: false, vocal: false }, rows: DEFAULT_ROWS(), beat: null };
  };
  SG.save = function (song) { const i = SG.list.findIndex(s => s.id === song.id); if (i >= 0) SG.list[i] = song; else SG.list.push(song); song.rev = (song.rev || 0) + 1; persist(); O.emit('songs'); };
  SG.remove = function (id) { SG.list = SG.list.filter(s => s.id !== id); persist(); O.emit('songs'); };
  SG.bars = song => song.rows.reduce((n, r) => n + r.bars, 0);
  SG.seconds = song => SG.bars(song) * 240 / song.bpm;
  // Settings object the music engine reads (M.song).
  SG.cfg = song => ({ key: song.key || 0, kit: song.kit || '', swaps: song.swaps || {}, mutes: song.mutes || {}, beat: song.beat || null });
  // Quick Play entry for the rhythm game.
  SG.custom = song => ({ id: song.id, name: song.name, style: song.style, bpm: song.bpm, rows: song.rows, song: SG.cfg(song) });
  // The seven built-in songs as Quick Play entries (the venue arrangement at the song's own tempo).
  SG.builtin = () => Object.keys(M.STYLES).map(id => ({ id: 'style:' + id, name: TITLES[id], style: id, bpm: TEMPO[id], rows: null, song: null }));
  // Copy the player's current beat-pad patterns into the song.
  SG.snapshotBeat = function (song) {
    const pats = {}; let any = false;
    for (const slot of BP.SLOTS) { const P = BP.patterns[slot]; if (P.events.length) { any = true; pats[slot] = { bars: P.bars, events: P.events.map(e => ({ pad: e.pad, step: e.step, velocity: e.velocity, tune: e.tune || 0 })) }; } }
    if (!any) return false;
    song.beat = { kit: BP.kit, patterns: pats };
    return true;
  };

  // ---------- rendering (decks, export) ----------
  async function ready() { if (E.isRunning()) return true; E.unlock(); const ok = await E.ensureRunning(); if (!ok) O.emit('needs-audio', 'studio'); return ok; }
  // Master to about -13 dBFS RMS with a soft clipper on the loudest peaks (same as the built-in deck tracks).
  function master(buf) {
    let s = 0, n = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { s += d[i] * d[i]; n++; } }
    const g = Math.pow(10, -13 / 20) / (Math.sqrt(s / n) || 1), knee = 0.72, top = 0.25;
    for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { let x = d[i] * g; const a = Math.abs(x); if (a > knee) x = Math.sign(x) * (knee + top * Math.tanh((a - knee) / top)); d[i] = x; } }
    return buf;
  }
  SG.deckRows = song => [{ sec: 'mixin', bars: 8, drums: 'style' }].concat(song.rows.filter(r => r.sec !== 'outro'), [{ sec: 'outro', bars: 8, drums: 'style' }]);
  SG.render = async function (song, rows) {
    rows = rows || song.rows; const cfg = SG.cfg(song), bars = rows.reduce((n, r) => n + r.bars, 0);
    await O.assets.ensure(M.assetsFor(song.style, cfg), 20000);
    return master(await M.renderOffline(song.style, song.bpm, bars * 240 / song.bpm + 1.2, { guide: 1, form: rows, song: cfg, preLimiter: true, musicLevel: 0.78, tail: 1.2 }));
  };
  SG.exportWav = async function (song) {
    if (!(await ready())) return false;
    O.toast('Rendering “' + song.name + '”…');
    const buf = await SG.render(song), a = document.createElement('a');
    a.href = URL.createObjectURL(BP.encodeWav(buf)); a.download = (song.name.replace(/[^\w\- ]+/g, '').trim() || 'orbit-song') + '.wav';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    O.toast('WAV saved: ' + Math.round(buf.duration) + ' seconds.');
    return true;
  };
  // Deck library entry: rendered in the browser the first time it is loaded (with a drums-only mix-in and mix-out added).
  SG.deckTrack = function (song) {
    const rows = SG.deckRows(song);
    return { id: 'song:' + song.id + ':' + (song.rev || 0), title: song.name, style: song.style, bpm: song.bpm, key: 'your song', bars: rows.reduce((n, r) => n + r.bars, 0), sections: M.sections(rows), mine: true, render: () => SG.render(song, rows) };
  };
  D.library = () => D.TRACKS.concat(SG.list.map(SG.deckTrack), D.imports ? D.imports() : []);

  // ---------- builder UI ----------
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html !== undefined) n.innerHTML = html; return n; };
  const opt = (v, label, sel) => '<option value="' + v + '"' + (sel ? ' selected' : '') + '>' + label + '</option>';
  const fmt = s => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
  let selRow = 0, previewing = false;
  function current() { if (!SG.cur || !SG.get(SG.cur.id)) SG.cur = SG.list[0] || null; return SG.cur; }
  function change(fn) { const s = current(); if (!s) return; fn(s); SG.save(s); if (previewing) stopPreview(); render(); }

  function renderList() {
    const box = $('#sg-list'); box.replaceChildren();
    SG.list.forEach(s => { const b = el('button', 'sg-item' + (SG.cur && s.id === SG.cur.id ? ' is-on' : ''), '<b></b><span>' + M.STYLES[s.style].label + ' · ' + s.bpm + ' BPM · ' + fmt(SG.seconds(s)) + '</span>'); b.firstChild.textContent = s.name; b.addEventListener('click', () => { stopPreview(); SG.cur = s; selRow = 0; render(); }); box.append(b); });
    if (!SG.list.length) box.append(el('p', 'note', 'No songs yet. Pick a genre below to start one.'));
  }
  function render() {
    const s = current(); renderList();
    $('#sg-editor').hidden = !s; $('#sg-empty').hidden = !!s;
    if (!s) return;
    const name = $('#sg-name'); if (document.activeElement !== name) name.value = s.name;
    $('#sg-style').innerHTML = Object.keys(M.STYLES).map(id => opt(id, M.STYLES[id].label, id === s.style)).join('');
    const base = TEMPO[s.style], t = $('#sg-tempo'); t.min = Math.round(base * 0.85); t.max = Math.round(base * 1.15); t.value = s.bpm; $('#sg-tempo-val').textContent = s.bpm + ' BPM';
    $('#sg-key').innerHTML = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6].map(k => opt(k, k === 0 ? 'Original key' : (k > 0 ? '+' : '−') + Math.abs(k) + ' semitone' + (Math.abs(k) > 1 ? 's' : ''), k === (s.key || 0))).join('');
    $('#sg-kit').innerHTML = Object.keys(KITS).map(k => opt(k, KITS[k], k === (s.kit || ''))).join('');
    ROLES.forEach(r => { $('#sg-' + r).innerHTML = opt('', r === 'vocal' ? 'Song’s own (instrument)' : 'Song’s own', !s.swaps[r]) + M.SOUNDS[r].map(n => opt(n, SOUND_NAMES[n], s.swaps[r] === n)).join(''); });
    $$('#sg-mutes button').forEach(b => { const on = !s.mutes[b.dataset.part]; b.setAttribute('aria-pressed', String(on)); b.classList.toggle('is-on', on); });
    // arrangement
    const rows = $('#sg-rows'); rows.replaceChildren();
    const pats = s.beat ? Object.keys(s.beat.patterns) : [];
    s.rows.forEach((r, i) => {
      const row = el('div', 'sg-row' + (i === selRow ? ' is-sel' : ''));
      row.innerHTML = '<button class="sg-n" aria-label="Preview from here">' + (i + 1) + '</button>' +
        '<select class="select" data-f="sec" aria-label="Section">' + Object.keys(SECTIONS).map(k => opt(k, SECTIONS[k], k === r.sec)).join('') + '</select>' +
        '<select class="select" data-f="bars" aria-label="Bars">' + [2, 4, 8, 12, 16].map(n => opt(n, n + ' bars', n === r.bars)).join('') + '</select>' +
        '<select class="select" data-f="drums" aria-label="Drums">' + opt('style', 'Song drums', r.drums === 'style') + pats.map(p => opt(p, 'My pattern ' + p, r.drums === p)).join('') + opt('none', 'No drums', r.drums === 'none') + '</select>' +
        '<button class="sg-x" aria-label="Move up">↑</button><button class="sg-x" aria-label="Remove section">✕</button>';
      row.querySelector('.sg-n').addEventListener('click', () => { selRow = i; render(); preview(i); });
      row.querySelectorAll('select').forEach(sel => sel.addEventListener('change', () => change(x => { x.rows[i][sel.dataset.f] = sel.dataset.f === 'bars' ? Number(sel.value) : sel.value; })));
      const [up, del] = row.querySelectorAll('.sg-x');
      up.disabled = i === 0; up.addEventListener('click', () => change(x => { const a = x.rows; [a[i - 1], a[i]] = [a[i], a[i - 1]]; selRow = i - 1; }));
      del.disabled = s.rows.length <= 1; del.addEventListener('click', () => change(x => { x.rows.splice(i, 1); selRow = Math.min(selRow, x.rows.length - 1); }));
      rows.append(row);
    });
    $('#sg-total').textContent = SG.bars(s) + ' bars · ' + fmt(SG.seconds(s));
    $('#sg-beat-note').textContent = s.beat ? 'Using your beat-pad patterns ' + pats.join(', ') + ' (' + BP.KITS[s.beat.kit] + '). Choose them per section under Drums.' : 'Want your own drums? Make a pattern on the beat pad, then tap USE MY BEAT.';
    $('#sg-preview').querySelector('span').textContent = previewing ? 'STOP' : 'PREVIEW';
    $('#sg-preview').classList.toggle('is-on', previewing);
  }
  async function preview(from) {
    const s = current(); if (!s || !(await ready())) return;
    const cfg = SG.cfg(s); stopPreview();
    if (G.state === 'running' || G.state === 'paused') G.stop(); G.stopDemo(); if (BP.playing) BP.stop(); D.stopAll();
    await O.assets.ensure(M.assetsFor(s.style, cfg), 8000);
    if (current() !== s) return;
    const startBar = s.rows.slice(0, from || 0).reduce((n, r) => n + r.bars, 0), bar = 240 / s.bpm, t0 = E.ctx.currentTime + 0.12;
    M.start({ style: s.style, bpm: s.bpm, origin: t0 - startBar * bar, mode: 'jam', form: s.rows, song: cfg, endAt: t0 + (SG.bars(s) - startBar) * bar - 0.01 });
    previewing = true; render(); O.ui.wake();
  }
  function stopPreview() { if (previewing) { previewing = false; M.stop(); } }
  O.on('music', m => { if (previewing && !m.playing) { previewing = false; render(); } });
  SG.stopPreview = stopPreview;

  function start(style) { stopPreview(); const s = SG.blank(style); SG.save(s); SG.cur = s; selRow = 0; render(); }
  $('#sg-new').addEventListener('click', () => start(current() ? current().style : 'house'));
  $('#sg-starters').innerHTML = Object.keys(M.STYLES).map(id => '<button class="btn btn-small" data-style="' + id + '">' + M.STYLES[id].label + '</button>').join('');
  $$('#sg-starters button').forEach(b => b.addEventListener('click', () => start(b.dataset.style)));
  $('#sg-name').addEventListener('input', e => { const s = current(); if (s) { s.name = e.target.value.slice(0, 40) || 'Untitled'; SG.save(s); renderList(); } });
  $('#sg-style').addEventListener('change', e => change(s => { s.style = e.target.value; s.bpm = TEMPO[s.style]; }));
  $('#sg-tempo').addEventListener('input', e => { $('#sg-tempo-val').textContent = e.target.value + ' BPM'; });
  $('#sg-tempo').addEventListener('change', e => change(s => { s.bpm = Number(e.target.value); }));
  $('#sg-key').addEventListener('change', e => change(s => { s.key = Number(e.target.value); }));
  $('#sg-kit').addEventListener('change', e => change(s => { s.kit = e.target.value; }));
  ROLES.forEach(r => $('#sg-' + r).addEventListener('change', e => change(s => { s.swaps[r] = e.target.value; })));
  $$('#sg-mutes button').forEach(b => b.addEventListener('click', () => change(s => { s.mutes[b.dataset.part] = !s.mutes[b.dataset.part]; })));
  $('#sg-add').addEventListener('click', () => change(s => { if (s.rows.length >= 16) { O.toast('16 sections is the limit.'); return; } s.rows.push({ sec: 'drop', bars: 8, drums: 'style' }); selRow = s.rows.length - 1; }));
  $('#sg-preview').addEventListener('click', () => { if (previewing) { stopPreview(); render(); } else preview(selRow); });
  $('#sg-usebeat').addEventListener('click', () => change(s => {
    if (!SG.snapshotBeat(s)) { O.toast('Your beat pad is empty. Make a pattern on the BEAT PAD first.'); return; }
    const first = Object.keys(s.beat.patterns)[0]; s.rows.forEach(r => { if (r.drums !== 'none' && (r.sec === 'verse' || r.sec === 'drop' || r.sec === 'drop2')) r.drums = s.beat.patterns[r.drums] ? r.drums : first; });
    O.toast('Your beat is in. Verses and drops now use your pattern ' + first + '.');
  }));
  $('#sg-play').addEventListener('click', () => { const s = current(); if (!s) return; stopPreview(); SG.quickPlay(SG.custom(s)); });
  $('#sg-wav').addEventListener('click', () => { const s = current(); if (s) { stopPreview(); SG.exportWav(s); } });
  [0, 1].forEach(i => $('#sg-deck' + i).addEventListener('click', async () => {
    const s = current(); if (!s || !(await ready())) return; stopPreview();
    O.toast('Rendering “' + s.name + '” for Deck ' + 'AB'[i] + '…'); O.ui.showView('mix');
    if (await D.load(i, SG.deckTrack(s).id)) O.toast('“' + s.name + '” is on Deck ' + 'AB'[i] + '.');
  }));
  $('#sg-del').addEventListener('click', () => { const s = current(); if (!s) return; if (!confirm('Delete “' + s.name + '”? This cannot be undone.')) return; stopPreview(); SG.remove(s.id); SG.cur = null; selRow = 0; render(); });

  // ---------- studio switch (beat pad / song builder) ----------
  $$('#studio-switch button').forEach(b => b.addEventListener('click', () => O.ui.showView(b.dataset.studio)));
  SG.enter = function () { render(); };
  SG.leave = function () { stopPreview(); };

  // ---------- Quick Play (any song, any level) ----------
  SG.quickPlay = function (custom) {
    O.ui.closeOverlay('ov-quick');
    G.setCustom(custom);
    O.ui.showView('play');
    O.toast('Quick Play: ' + custom.name + '. Tap START SET.');
  };
  function renderQuick() {
    const row = c => { const best = G.quickBests[c.id + ':' + G.difficulty]; const b = el('button', 'track-row', '<b></b><span>' + M.STYLES[c.style].label + ' · ' + c.bpm + ' BPM</span><em>' + (best ? '★'.repeat(best.stars) + ' ' + best.score : 'NEW') + '</em>'); b.firstChild.textContent = c.name; b.addEventListener('click', () => { E.unlock(); SG.quickPlay(c); }); return b; };
    const a = $('#quick-built'), m = $('#quick-mine'); a.replaceChildren(...SG.builtin().map(row)); m.replaceChildren(...SG.list.map(s => row(SG.custom(s))));
    if (SG.imports) SG.imports().forEach(c => m.append(row(c)));
    a.append(el('div', 'eyebrow quick-sub', 'ECHO BATTLES · REPEAT THE RIVAL’S PHRASE'));
    G.RIVALS.forEach((r, i) => a.append(row(G.battle(i))));
    if (!m.children.length) m.append(el('p', 'note', 'Songs you build in the Studio and audio you import show up here.'));
    $$('#quick-diff button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.diff === G.difficulty)));
  }
  SG.openQuick = function () { renderQuick(); O.ui.openOverlay('ov-quick'); };
  $$('#quick-diff button').forEach(b => b.addEventListener('click', () => { G.setDifficulty(b.dataset.diff); renderQuick(); }));
  $('#quick-studio').addEventListener('click', () => { O.ui.closeOverlay('ov-quick'); O.ui.showView('songs'); });
  $$('[data-open-quick]').forEach(b => b.addEventListener('click', SG.openQuick));
  $('#quick-exit').addEventListener('click', () => { G.select(G.stage); });
  O.on('imports', () => { if (!$('#ov-quick').hidden) renderQuick(); if (G.custom && G.custom.audio && !O.imports.list.some(m => m.id === G.custom.audio.id)) G.setCustom(null); });
  O.on('songs', () => { if (G.custom && !G.custom.id.startsWith('style:') && !G.custom.audio && !SG.get(G.custom.id)) G.setCustom(null); });
})();
