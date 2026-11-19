/* ORBIT DJ — backing music.
 * Six original songs played from the sampled instrument and drum library. Each is written as
 * 8 bars of material (A: bars 1-4, sparser; B: bars 5-8, full with the hook) and arranged into a
 * full song form for sets: intro, verse, build, drop, breakdown, second drop (see buildForm).
 * Free play (beat pad backing, demos) loops the 8 bars.
 * Rhythm-game notes are charted from the same drum grooves (see chartAt), so players hit the
 * real kick / snare / hat parts of the song. Everything is scheduled ahead on the audio clock.
 */
(function () {
  'use strict';
  const O = window.ORBIT, E = O.engine, Synth = O.synth;

  // ---------- small helpers for writing grooves ----------
  const eighths = (on, off, lvlOn, lvlOff) => [0, 2, 4, 6, 8, 10, 12, 14].map(s => [s, s % 4 === 0 ? on : off, s % 4 === 0 ? lvlOn : lvlOff]);
  const odd16 = (vel, pad) => [1, 3, 5, 7, 9, 11, 13, 15].map(s => [s, vel, 9, pad]);
  // Hit format: [step, velocity, chartLevel (0 rookie, 1 club, 2 headliner, 9 never), padOverride, 'first' = only on a section's first bar]

  const STYLES = {
    boombap: {
      label: 'Dusty boom bap', mix: { melody: 0, bass: -3, drums: 1 }, kit: 'dusty', swing: 0.14, level: 1.0, duck: 0, bed: 'vinyl',
      inst: ['ep', 'sub', 'flute', 'vox', 'guitar', 'strings'],
      lick: [[[8, 69, 0.5], [10, 72, 0.5], [12, 74, 0.5], [14, 76, 1]], [[8, 68, 0.5], [10, 71, 0.5], [12, 74, 0.5], [14, 77, 1]]],
      line: [76, 77, 77, 76],
      pads: { kick: 0, snare: 1, hat: 2, ohat: 3, fx: 11, count: 5 },
      chords: [[55, 59, 60, 64], [53, 57, 60, 64], [52, 55, 57, 60], [56, 59, 62, 65], [55, 59, 60, 64], [53, 57, 60, 64], [50, 53, 57, 60], [56, 59, 62, 65]],
      roots: [33, 38, 29, 28, 33, 38, 34, 28],
      hook: [[[0, 76, 1.5], [6, 72, 0.5], [8, 71, 0.5], [10, 69, 1.5]], [[0, 74, 1.5], [6, 72, 0.5], [8, 69, 1.5]], [[0, 74, 1], [4, 72, 0.5], [6, 70, 0.5], [8, 69, 1], [12, 65, 1]], [[0, 68, 1], [4, 71, 0.5], [6, 74, 0.5], [8, 76, 1.5]]],
      drums: {
        A: { kick: [[0, 1, 0], [8, 0.85, 0], [10, 0.62, 1]], snare: [[4, 1, 0], [12, 1, 0]], hat: eighths(0.6, 0.45, 2, 1), perc: [[7, 0.3, 9, 7], [15, 0.3, 9, 7]], fx: [[0, 0.55, 1, 11, 'first']] },
        B: { kick: [[0, 1, 0], [8, 0.85, 0], [10, 0.62, 1], [15, 0.45, 2]], snare: [[4, 1, 0], [12, 1, 0], [9, 0.28, 9]], hat: eighths(0.6, 0.45, 2, 1), ohat: [[14, 0.45, 9]], perc: [[7, 0.3, 9, 7], [15, 0.3, 9, 7]], fx: [[0, 0.55, 1, 11, 'first']] },
        F: { kick: [[0, 1, 0], [8, 0.85, 0]], snare: [[4, 1, 0], [12, 0.9, 0], [13, 0.55, 2], [14, 0.75, 2], [15, 0.95, 2]], hat: eighths(0.6, 0.45, 2, 1).slice(0, 6), perc: [[10, 0.7, 9, 9], [11, 0.75, 9, 8]] }
      },
      play(c, L, bar, step, t, beat, H, X) {
        const ch = this.chords[bar], root = this.roots[bar], next = this.roots[(bar + 1) % 8], B = X.full, intro = X.sec === 'intro';
        if (intro) { // nylon guitar arpeggio over the vinyl crackle
          const arp = { 0: 0, 3: 1, 6: 2, 10: 3, 13: 2 };
          if (step in arp) H.n('melody', 'guitar', ch[arp[step]], t, 0.9, 0.62, { send: 0.3, pan: -0.15 });
          if (step === 0) H.c('melody', 'ep', ch, t, 1.6, 0.4);
        } else {
          if (step === 0) H.c('melody', 'ep', ch, t, 1.6, 0.62);
          if (step === 6) H.c('melody', 'ep', ch, t, 0.45, 0.48);
          if (B && step === 10) H.c('melody', 'ep', ch, t, 0.45, 0.42);
        }
        if (step === 0) H.n('bass', 'sub', root, t, 1.6, 0.9);
        if (step === 7) H.n('bass', 'sub', root, t, 0.4, 0.7);
        if (step === 10) H.n('bass', 'sub', root + 7, t, 0.6, 0.75);
        if (step === 14) H.n('bass', 'sub', next - 1, t, 0.4, 0.6);
        if (B) for (const [s, m, d] of this.hook[bar - 4]) if (s === step) H.n('melody', 'flute', m, t, d, 0.62, { send: 0.3 });
        if (!B && !intro && X.pos < 4 && (bar === 1 || bar === 3) && step === 12) H.n('melody', 'vox', bar === 1 ? 64 : 68, t, 0.7, 0.5, { send: 0.4 });
        if (X.sec === 'verse' && X.pos >= 4 && (bar === 1 || bar === 3)) for (const [s, m, d] of this.lick[bar === 1 ? 0 : 1]) if (s === step) H.n('melody', 'guitar', m, t, d, 0.6, { send: 0.25, pan: 0.2 });
        if (X.sec === 'build' && step === 0) H.n('melody', 'strings', ch[3] + 12, t, 3.7, 0.4 + 0.06 * X.pos, { attack: 0.3, send: 0.4, release: 0.4 });
        if (X.lead && step === 0) H.n('melody', 'strings', this.line[bar - 4], t, 3.7, 0.5, { attack: 0.15, send: 0.4, release: 0.4 });
      }
    },

    jazzhop: {
      label: 'Lo-fi jazz hop', mix: { melody: 0, bass: 0, drums: 1 }, kit: 'dusty', swing: 0.2, level: 1.0, duck: 0, bed: 'vinyl',
      inst: ['ep', 'upright', 'flute', 'guitar', 'piano'],
      pads: { kick: 0, snare: 1, hat: 2, ohat: 3, fx: 11, count: 5 },
      chords: [[53, 57, 58, 62], [52, 57, 58, 62], [52, 55, 57, 60], [53, 57, 60, 64], [50, 53, 57, 60], [55, 57, 60, 64], [53, 57, 58, 62], [53, 55, 58, 60]],
      roots: [43, 36, 41, 38, 34, 33, 43, 36],
      quality: ['m', 'd', 'M', 'm', 'M', 'm', 'm', 'd'],
      hook: [[[0, 69, 1], [4, 72, 0.5], [6, 74, 0.5], [8, 76, 1], [12, 72, 1]], [[2, 72, 0.5], [4, 69, 0.5], [6, 67, 1], [10, 64, 1.5]], [[0, 70, 1], [4, 69, 0.5], [6, 67, 0.5], [8, 65, 1], [12, 62, 1]], [[0, 65, 1], [4, 67, 0.5], [6, 70, 0.5], [8, 72, 2]]],
      drums: {
        A: { kick: [[0, 1, 0], [7, 0.5, 2], [10, 0.85, 0]], snare: [[4, 0.95, 0], [12, 0.95, 0]], hat: eighths(0.55, 0.42, 2, 1), perc: odd16(0.24, 7), fx: [[0, 0.5, 0, 11, 'first']] },
        B: { kick: [[0, 1, 0], [7, 0.5, 2], [10, 0.85, 0], [13, 0.45, 2]], snare: [[4, 0.95, 0], [12, 0.95, 0]], hat: eighths(0.55, 0.42, 2, 1), ohat: [[14, 0.4, 9]], perc: odd16(0.24, 7), fx: [[0, 0.5, 0, 11, 'first'], [14, 0.55, 1, 6]] },
        F: { kick: [[0, 1, 0], [10, 0.85, 0]], snare: [[4, 0.95, 0], [12, 0.9, 0], [14, 0.6, 2], [15, 0.8, 2]], hat: eighths(0.55, 0.42, 2, 1).slice(0, 6), perc: [[13, 0.6, 9, 9], [14, 0.65, 9, 8]] }
      },
      play(c, L, bar, step, t, beat, H, X) {
        const ch = this.chords[bar], root = this.roots[bar], next = this.roots[(bar + 1) % 8], q = this.quality[bar], B = X.full, intro = X.sec === 'intro';
        const walk = { 0: root, 4: root + (q === 'm' ? 3 : 4), 8: root + 7, 12: next > root ? next - 1 : next + 1 };
        if (step in walk) H.n('bass', 'upright', walk[step], t, 0.95, step === 0 ? 0.95 : 0.8);
        const keys = intro ? 'piano' : 'ep'; // the intro is solo piano over brushes
        if (step === 0) H.c('melody', keys, ch, t, intro ? 1.6 : 0.8, 0.58, intro ? { send: 0.35 } : undefined);
        if (step === 7) H.c('melody', keys, ch, t, 0.4, 0.45);
        if (step === 10) H.c('melody', keys, ch, t, 0.9, 0.5);
        if (B && step === 15) H.c('melody', 'ep', ch, t, 0.3, 0.36);
        if (B) for (const [s, m, d] of this.hook[bar - 4]) if (s === step) H.n('melody', 'flute', m, t, d, 0.6, { send: 0.32 });
        // rhythm guitar chops on 2 and 4 from the second half of the verse; it doubles the hook an octave down at the end
        if ((B || (X.sec === 'verse' && X.pos >= 4)) && (step === 4 || step === 12)) H.c('melody', 'guitar', ch.slice(1), t, 0.22, 0.42, { pan: -0.25 });
        if (X.lead) for (const [s, m, d] of this.hook[bar - 4]) if (s === step) H.n('melody', 'guitar', m - 12, t, d, 0.58, { send: 0.2, pan: 0.25 });
        if (X.sec === 'build' && X.pos >= 2 && step % 4 === 0) H.n('melody', 'piano', ch[(step / 4) % ch.length] + 12 + (X.pos === 3 ? 12 : 0), t, 0.9, 0.45, { send: 0.35 });
      }
    },

    house: {
      label: 'Deep house', mix: { melody: 4, bass: -1, drums: -2 }, kit: 'club', swing: 0.04, level: 1.0, duck: 0.45,
      inst: ['organ', 'sawbass', 'pad', 'pluck', 'vox', 'piano', 'lead', 'strings'],
      hook: [[[0, 79, 1], [6, 75, 0.5], [8, 77, 0.5], [10, 79, 1.5]], [[0, 82, 1], [6, 79, 0.5], [8, 77, 1], [12, 75, 1]], [[0, 84, 1.5], [6, 82, 0.5], [8, 80, 1], [12, 79, 1]], [[0, 79, 1], [4, 83, 1], [8, 86, 2]]],
      pads: { kick: 0, snare: 1, hat: 3, ohat: 3, fx: 11, count: 6 },
      chords: [[58, 60, 63, 67], [56, 60, 63, 67], [55, 60, 63, 68], [53, 55, 60, 62], [58, 60, 63, 67], [55, 58, 62, 63], [56, 60, 63, 67], [53, 55, 59, 62]],
      roots: [36, 41, 32, 31, 36, 39, 41, 31],
      drums: {
        A: { kick: [[0, 1, 0], [4, 0.95, 2], [8, 1, 0], [12, 0.95, 2]], snare: [[4, 0.85, 0], [12, 0.85, 0]], hat: [[2, 0.6, 1], [6, 0.6, 1], [10, 0.6, 1], [14, 0.6, 1]], perc: odd16(0.3, 2), fx: [[0, 0.5, 2, 11, 'first']] },
        B: { kick: [[0, 1, 0], [4, 0.95, 2], [8, 1, 0], [12, 0.95, 2]], snare: [[4, 0.85, 0], [12, 0.85, 0]], hat: [[2, 0.6, 1], [6, 0.6, 1], [10, 0.6, 1], [14, 0.6, 1]], perc: odd16(0.3, 2).concat([[3, 0.5, 9, 8], [11, 0.45, 9, 9], [14, 0.4, 9, 9]]), fx: [[0, 0.55, 1, 11, 'first'], [11, 0.45, 2, 10]] },
        F: { kick: [[0, 1, 0], [4, 0.95, 2], [8, 1, 0]], snare: [[4, 0.85, 0], [8, 0.4, 2, 5], [10, 0.5, 2, 5], [12, 0.7, 0, 5], [13, 0.6, 2, 5], [14, 0.8, 1, 5], [15, 0.9, 2, 5]], hat: [[2, 0.6, 1], [6, 0.6, 1]], perc: odd16(0.3, 2).slice(0, 4) }
      },
      play(c, L, bar, step, t, beat, H, X) {
        const ch = this.chords[bar], root = this.roots[bar], brk = X.sec === 'break', B = X.full && !brk;
        if (!B && step === 0) H.c('melody', 'pad', ch, t, 3.8, 0.5, { send: 0.3, attack: 0.08, release: 0.4 });
        if (!B && !brk && (step === 6 || step === 14)) H.c('melody', 'organ', ch, t, 0.3, 0.5, { send: 0.2 });
        if (brk) { // breakdown: piano broken chords and strings over the pad
          const arp = { 0: 0, 3: 1, 6: 2, 10: 3, 13: 1 };
          if (step in arp) H.n('melody', 'piano', ch[arp[step]] + 12, t, 1.2, 0.55, { send: 0.4 });
          if (step === 0) H.n('melody', 'strings', ch[3] + 12, t, 3.7, 0.42, { attack: 0.25, send: 0.45, release: 0.4 });
        }
        if (X.lead) { // second drop: lead hook and piano stabs on top
          for (const [s, m, d] of this.hook[bar - 4]) if (s === step) H.n('melody', 'lead', m, t, d, 0.5, { send: 0.3 });
          if ([0, 3, 6, 10, 13].includes(step)) H.c('melody', 'piano', ch.map(m => m + 12), t, 0.3, 0.42, { send: 0.2 });
        }
        if (B && [0, 3, 6, 10, 13].includes(step)) H.c('melody', 'organ', ch, t, 0.28, 0.55, { send: 0.2 });
        if (B && [0, 2, 3, 5, 6, 8, 10, 11, 13, 14].includes(step)) { const k = [0, 2, 3, 5, 6, 8, 10, 11, 13, 14].indexOf(step); H.n('melody', 'pluck', ch[k % ch.length] + 12, t, 0.25, 0.4, { pan: k % 2 ? 0.3 : -0.3, send: 0.25 }); }
        if (X.full && (bar === 4 || bar === 6) && step === 0) H.n('melody', 'vox', ch[3], t, 1, 0.5, { send: 0.4 });
        if (step % 4 === 2) H.n('bass', 'sawbass', root + (step === 10 ? 12 : 0), t, 0.42, 0.85);
        if ((bar === 3 || bar === 7) && step === 15) H.n('bass', 'sawbass', root + 7, t, 0.2, 0.6);
        if (B && X.last && step === 0) H.fx('riser', t, 0.55);
      }
    },

    garage: {
      label: 'UK garage', mix: { melody: 6, bass: -7, drums: -1 }, kit: 'club', swing: 0.22, level: 1.0, duck: 0.3,
      inst: ['organ', 'sub', 'pad', 'vox', 'piano', 'strings'],
      hook: [[[2, 72, 0.5], [5, 75, 0.5], [8, 77, 1], [13, 75, 0.5]], [[2, 70, 0.5], [5, 74, 0.5], [8, 75, 1], [13, 74, 0.5]], [[2, 68, 0.5], [5, 72, 0.5], [8, 73, 1], [13, 72, 0.5]], [[2, 67, 0.5], [5, 70, 0.5], [8, 72, 1.5], [14, 76, 0.5]]],
      pads: { kick: 0, snare: 1, hat: 2, ohat: 3, fx: 11, count: 6 },
      chords: [[56, 60, 63, 67], [55, 58, 62, 65], [53, 56, 60, 63], [52, 58, 63], [56, 60, 63, 67], [55, 58, 62, 65], [53, 56, 60, 63], [52, 58, 63]],
      roots: [41, 39, 37, 36, 41, 39, 37, 36],
      drums: {
        A: { kick: [[0, 1, 0], [7, 0.75, 1], [10, 0.9, 0]], snare: [[4, 0.9, 0], [12, 0.9, 0]], hat: [[2, 0.55, 1], [6, 0.5, 1], [10, 0.55, 2], [14, 0.5, 1]], perc: [[15, 0.4, 9, 6], [3, 0.28, 9, 7], [11, 0.28, 9, 7]], fx: [[0, 0.5, 2, 11, 'first']] },
        B: { kick: [[0, 1, 0], [7, 0.75, 1], [10, 0.9, 0]], snare: [[4, 0.9, 0], [12, 0.9, 0]], hat: [[2, 0.55, 1], [6, 0.5, 1], [10, 0.55, 2], [14, 0.5, 1]], ohat: [[14, 0.38, 9]], perc: [[15, 0.4, 9, 6], [3, 0.28, 9, 7], [11, 0.28, 9, 7]], fx: [[0, 0.55, 1, 11, 'first']] },
        F: { kick: [[0, 1, 0], [10, 0.9, 0]], snare: [[4, 0.9, 0], [12, 0.8, 0, 5], [13, 0.6, 2, 5], [14, 0.75, 1, 5], [15, 0.9, 2, 5]], hat: [[2, 0.55, 1], [6, 0.5, 1]] }
      },
      play(c, L, bar, step, t, beat, H, X) {
        const ch = this.chords[bar], root = this.roots[bar], brk = X.sec === 'break', B = X.full && !brk;
        const bass = { 0: [root, 0.7], 3: [root, 0.4], 7: [root + 12, 0.45], 10: [root, 0.6], 14: [root - 2, 0.3] };
        if (step in bass) H.n('bass', 'sub', bass[step][0], t, bass[step][1], 0.9);
        if (!B && step === 0) H.c('melody', 'pad', ch, t, 3.8, 0.45, { send: 0.3, attack: 0.06, release: 0.4 });
        if (!brk && [2, 5, 9, 13].includes(step)) H.c('melody', 'organ', ch, t, 0.25, B ? 0.52 : 0.4, { send: 0.18 });
        if (B && (step === 3 || step === 11)) H.n('melody', 'vox', ch[ch.length - 1] + (step === 11 ? -3 : 0), t, 0.35, 0.5, { send: 0.35 });
        // piano riff: alone in the breakdown, on top of everything in the second drop
        if (brk || X.lead) for (const [s, m, d] of this.hook[bar - 4]) if (s === step) H.n('melody', 'piano', m, t, d + 0.3, brk ? 0.6 : 0.56, { send: brk ? 0.4 : 0.25 });
        if ((brk || X.lead) && step === 0) H.n('melody', 'strings', ch[ch.length - 1] + 12, t, 3.7, brk ? 0.42 : 0.36, { attack: 0.2, send: 0.4, release: 0.4 });
      }
    },

    melodic: {
      label: 'Melodic electronic', mix: { melody: 3.5, bass: -1.5, drums: -1.5 }, kit: 'club', swing: 0, level: 1.0, duck: 0.4,
      inst: ['pad', 'pluck', 'bell', 'sawbass', 'piano', 'lead', 'strings'],
      pads: { kick: 0, snare: 1, hat: 3, ohat: 3, fx: 11, count: 6 },
      chords: [[57, 59, 60, 64], [53, 57, 60, 64], [55, 60, 62, 64], [55, 59, 62, 64], [57, 59, 60, 64], [53, 57, 60, 64], [55, 60, 62, 64], [56, 59, 64, 68]],
      roots: [33, 29, 36, 31, 33, 29, 36, 28],
      hook: [[[0, 76, 1.5], [6, 72, 0.5], [8, 74, 1], [12, 72, 1]], [[0, 69, 1.5], [6, 72, 0.5], [8, 77, 1], [12, 76, 1]], [[0, 76, 1], [4, 74, 0.5], [6, 72, 0.5], [8, 67, 2]], [[0, 68, 1], [4, 71, 1], [8, 76, 2]]],
      drums: {
        A: { kick: [[0, 1, 0], [4, 0.95, 2], [8, 1, 0], [12, 0.95, 2]], snare: [[4, 0.8, 0], [12, 0.8, 0]], hat: [[2, 0.55, 1], [6, 0.55, 1], [10, 0.55, 1], [14, 0.55, 1]], perc: [0, 2, 4, 6, 8, 10, 12, 14].map(s => [s, 0.22, 9, 7]), fx: [[0, 0.5, 1, 11, 'first']] },
        B: { kick: [[0, 1, 0], [4, 0.95, 2], [8, 1, 0], [12, 0.95, 2]], snare: [[4, 0.85, 0], [12, 0.85, 0]], hat: [[2, 0.6, 1], [6, 0.6, 1], [10, 0.6, 1], [14, 0.6, 1]], perc: [0, 2, 4, 6, 8, 10, 12, 14].map(s => [s, 0.25, 9, 7]).concat(odd16(0.25, 2)), fx: [[0, 0.55, 1, 11, 'first']] },
        F: { kick: [[0, 1, 0], [4, 0.95, 2], [8, 1, 0], [12, 0.95, 2]], snare: [[4, 0.85, 0], [12, 0.85, 0], [13, 0.5, 2, 5], [14, 0.7, 1, 5], [15, 0.85, 2, 5]], hat: [[2, 0.6, 1], [6, 0.6, 1], [10, 0.6, 1]] }
      },
      play(c, L, bar, step, t, beat, H, X) {
        const ch = this.chords[bar], root = this.roots[bar], brk = X.sec === 'break', intro = X.sec === 'intro', B = X.full && !brk;
        if (step === 0) H.c('melody', 'pad', ch, t, 3.8, B ? 0.42 : 0.5, { send: 0.35, attack: 0.1, release: 0.5 });
        const arp = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 1, 3, 2][step];
        if (!brk && (!intro || step % 2 === 0)) H.n('melody', 'pluck', ch[arp % ch.length] + 12, t, 0.3, (step % 4 === 0 ? 0.42 : 0.33) * (intro ? 0.8 : 1), { pan: step % 2 ? 0.25 : -0.25, send: 0.3 });
        if (intro && (step === 0 || step === 6 || step === 12)) H.n('melody', 'piano', ch[[3, 2, 1][step / 6]] + 12, t, 1.4, 0.5, { send: 0.4 });
        if (B) for (const [s, m, d] of this.hook[bar - 4]) if (s === step) H.n('melody', 'bell', m, t, d, 0.55, { send: 0.45 });
        if (brk) { // breakdown: the hook on piano with strings
          for (const [s, m, d] of this.hook[bar - 4]) if (s === step) H.n('melody', 'piano', m, t, d + 0.5, 0.62, { send: 0.45 });
          if (step === 0) H.n('melody', 'strings', ch[3] + 12, t, 3.7, 0.42, { attack: 0.25, send: 0.45, release: 0.4 });
        }
        if (X.lead) for (const [s, m, d] of this.hook[bar - 4]) if (s === step) H.n('melody', 'lead', m, t, d, 0.5, { send: 0.35 });
        if (step % 2 === 0) H.n('bass', 'sawbass', root + (step === 6 || step === 14 ? 12 : 0), t, 0.45, step % 4 === 0 ? 0.8 : 0.62);
        if (B && X.last && step === 0) H.fx('riser', t, 0.5);
      }
    },

    dark: {
      label: 'Dark bass (half-time)', mix: { melody: 6, bass: -5.5, drums: -1.5 }, kit: 'midnight', swing: 0, level: 1.0, duck: 0.5,
      inst: ['pad', 'b808', 'sawbass', 'bell', 'vox', 'piano', 'strings'],
      motif: [[[0, 71, 0.75], [3, 76, 0.75], [6, 79, 1], [10, 78, 1.5]], [[0, 71, 0.75], [3, 76, 0.75], [6, 79, 1], [10, 76, 1.5]], [[0, 69, 0.75], [3, 76, 0.75], [6, 79, 1], [10, 76, 1.5]], [[0, 71, 0.75], [3, 75, 0.75], [6, 78, 1], [10, 81, 1.5]]],
      line: [83, 84, 81, 83],
      pads: { kick: 0, snare: 1, hat: 2, ohat: 3, fx: 11, count: 6 },
      chords: [[55, 59, 62, 66], [52, 55, 59, 60], [52, 55, 57, 60], [51, 54, 57, 59], [55, 59, 62, 66], [52, 55, 59, 60], [52, 55, 57, 60], [51, 54, 57, 59]],
      roots: [28, 36, 33, 35, 28, 36, 33, 35],
      bell: [[[6, 83, 1], [14, 79, 1]], [[6, 84, 1], [14, 79, 1]], [[6, 81, 1], [14, 76, 1]], [[6, 83, 1], [10, 81, 0.5], [14, 78, 1]]],
      drums: {
        A: { kick: [[0, 1, 0], [10, 0.8, 1], [3, 0.45, 2]], snare: [[8, 1, 0]], hat: [[4, 0.55, 0], [12, 0.55, 0], [2, 0.42, 1], [6, 0.42, 1], [10, 0.42, 1], [14, 0.42, 1], [0, 0.35, 2], [8, 0.35, 2]], perc: [[8, 0.6, 9, 5]], fx: [[0, 0.7, 0, 11, 'first']] },
        B: { kick: [[0, 1, 0], [10, 0.8, 1], [3, 0.45, 2], [13, 0.4, 2]], snare: [[8, 1, 0]], hat: [[4, 0.55, 0], [12, 0.55, 0], [2, 0.42, 1], [6, 0.42, 1], [10, 0.42, 1], [14, 0.42, 1], [0, 0.35, 2], [8, 0.35, 2]], ohat: [[14, 0.4, 9]], perc: [[8, 0.6, 9, 5], [6, 0.4, 9, 7]], fx: [[0, 0.7, 0, 11, 'first'], [14, 0.5, 1, 15]] },
        F: { kick: [[0, 1, 0]], snare: [[8, 1, 0], [12, 0.7, 1], [14, 0.85, 1], [15, 0.9, 2]], hat: [[0, 0.35, 2], [2, 0.42, 1], [4, 0.55, 0], [6, 0.42, 1], [8, 0.35, 2], [9, 0.32, 2], [10, 0.42, 1], [11, 0.35, 2], [12, 0.45, 2], [13, 0.4, 2], [14, 0.5, 2], [15, 0.55, 2]], perc: [[10, 0.7, 9, 8], [11, 0.75, 9, 9]] }
      },
      play(c, L, bar, step, t, beat, H, X) {
        const ch = this.chords[bar], root = this.roots[bar], brk = X.sec === 'break', B = X.full;
        if (step === 0) H.c('melody', 'pad', ch, t, 3.9, 0.45, { send: 0.35, attack: 0.12, release: 0.5 });
        if (step === 0) H.n('bass', 'b808', root, t, 2.2, 0.95);
        if (step === 10) H.n('bass', 'b808', root, t, 1.2, 0.8);
        if ((bar === 3 || bar === 7) && step === 14) H.n('bass', 'b808', root + 12, t, 0.4, 0.6);
        if (B && [3, 6, 11, 14].includes(step)) H.n('bass', 'sawbass', root + 12, t, 0.25, 0.42);
        if (B) for (const [s, m, d] of this.bell[bar - 4]) if (s === step) H.n('melody', 'bell', m, t, d, 0.5, { send: 0.45 });
        if (!B && (bar === 0 || bar === 2) && step === 0) H.n('melody', 'vox', ch[0] + 12, t, 3, 0.4, { send: 0.5, attack: 0.15, release: 0.5 });
        // lonely piano motif in the intro, build and breakdown (and the back half of a long verse)
        if (X.sec === 'intro' || brk || X.sec === 'build' || (X.sec === 'verse' && X.pos >= 4)) for (const [s, m, d] of this.motif[bar % 4]) if (s === step) H.n('melody', 'piano', m, t, d + 0.4, 0.6, { send: 0.45 });
        if (X.lead && step === 0) H.n('melody', 'strings', this.line[bar - 4], t, 3.7, 0.45, { attack: 0.2, send: 0.4, release: 0.4 });
      }
    }
  };
  const ALIASES = { hiphop: 'boombap' };
  const resolve = id => (STYLES[id] ? id : ALIASES[id] && STYLES[ALIASES[id]] ? ALIASES[id] : 'boombap');
  const LANE_OF = { kick: 0, snare: 1, hat: 2, fx: 3 }, PRIORITY = ['snare', 'kick', 'fx', 'hat'];
  const ELEMENTS = ['kick', 'snare', 'hat', 'ohat', 'perc', 'fx'];
  const sectionOf = bar => (bar === 7 ? 'F' : bar >= 4 ? 'B' : 'A');
  const firstOfSection = bar => bar === 0 || sectionOf(bar) !== sectionOf((bar + 7) % 8);

  // Extra drum grooves every style gets for the song form:
  // I intro (kick, hats, no snare) · K breakdown (quiet hats only) · R1 / R2 the snare roll of a build.
  for (const S of Object.values(STYLES)) {
    const A = S.drums.A, sn = S.pads.snare;
    S.drums.I = { kick: A.kick, hat: A.hat, perc: A.perc, fx: A.fx };
    S.drums.K = { hat: (A.hat || []).map(h => [h[0], h[1] * 0.6, 9, h[3]]), perc: (A.perc || []).map(h => [h[0], h[1], 9, h[3]]) };
    S.drums.R1 = { kick: [0, 4, 8, 12].map(s => [s, 0.8, 9]), snare: [0, 2, 4, 6, 8, 10, 12, 14].map((s, i) => [s, 0.34 + 0.04 * i, s % 4 === 0 ? 0 : 1, sn]) };
    S.drums.R2 = { kick: [0, 4, 8].map(s => [s, 0.85, 9]), snare: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((s, i) => [s, 0.5 + 0.045 * i, s % 4 === 0 ? 0 : s % 2 === 0 ? 1 : 2, sn]) };
  }

  // Song form. Every bar of a set knows its section, which of the 8 written bars supplies the harmony
  // (hb), which drum groove plays (dk) and which layers are in.
  const FORMS = {
    24: [['intro', 4], ['verse', 8], ['build', 4], ['drop', 8]],
    32: [['intro', 4], ['verse', 4], ['build', 4], ['drop', 8], ['break', 4], ['drop2', 8]],
    // Deck tracks (Mix tab): drums-only mix-in and mix-out so two tracks can be blended, 8-bar phrases throughout.
    deck48: [['mixin', 8], ['intro', 4], ['verse', 8], ['build', 4], ['drop', 8], ['drop2', 8], ['mixout', 8]],
    deck64: [['mixin', 8], ['intro', 8], ['verse', 8], ['build', 8], ['drop', 8], ['break', 8], ['drop2', 8], ['mixout', 8]]
  };
  function buildForm(bars) {
    const secs = FORMS[bars] || FORMS[bars > 28 ? 32 : 24], out = [], twoDrops = secs.some(x => x[0] === 'drop2');
    let n = 0;
    for (const [sec, len] of secs) for (let pos = 0; pos < len; pos++, n++) {
      const last = pos === len - 1, full = sec === 'drop' || sec === 'drop2' || sec === 'break';
      let dk = last ? 'F' : full ? 'B' : 'A', bass = true, mel = true;
      if (sec === 'mixin') { dk = last ? 'F' : pos < 4 ? 'I' : 'A'; bass = false; mel = false; }
      else if (sec === 'mixout') { dk = 'A'; mel = false; }
      else if (sec === 'intro') { if (!last) dk = 'I'; bass = pos >= 2; }
      else if (sec === 'build') { dk = pos < len - 2 ? 'K' : pos === len - 2 ? 'R1' : 'R2'; bass = false; }
      else if (sec === 'break') { dk = last ? 'R2' : 'K'; bass = false; }
      out.push({ n, sec, pos, len, first: pos === 0, last, full, dk, bass, mel, hb: (full ? 4 : 0) + pos % 4, start: n - pos,
        lead: sec === 'drop2' || (!twoDrops && sec === 'drop' && pos >= 4) });
    }
    return out;
  }
  // Free play: the plain 8-bar loop.
  const LOOP = [0, 1, 2, 3, 4, 5, 6, 7].map(bar => ({ n: bar, sec: bar >= 4 ? 'drop' : 'verse', pos: bar % 4, len: 4, first: firstOfSection(bar), last: bar === 3 || bar === 7, full: bar >= 4, dk: sectionOf(bar), bass: true, hb: bar, start: bar >= 4 ? 4 : 0, lead: false }));
  const barInfo = (form, nbar) => (form ? form[Math.min(Math.max(nbar, 0), form.length - 1)] : LOOP[((nbar % 8) + 8) % 8]);

  // Which drum hits at this step are notes for the player. X: bar info; rule: { lvl, single, stage }
  function chartAt(S, X, step, rule) {
    const spec = S.drums[X.dk] || {}, first = X.first, out = [];
    for (const el of ['kick', 'snare', 'hat', 'fx']) {
      if (el === 'fx' && rule.stage === 0) continue;
      for (const h of spec[el] || []) {
        if (h[0] !== step || h[2] > rule.lvl || (h[4] === 'first' && !first)) continue;
        out.push({ el, lane: LANE_OF[el], hit: h });
      }
    }
    if (rule.single && out.length > 1) { out.sort((a, b) => PRIORITY.indexOf(a.el) - PRIORITY.indexOf(b.el)); return [out[0]]; }
    return out;
  }

  const M = (O.music = {
    STYLES, resolve, chartAt, sectionOf,
    playing: false, mode: null, style: 'boombap', bpm: 88, origin: 0, k: 0, endAt: Infinity,
    guideLevel: 0, chartRule: null, timer: 0, session: null, onStep: null, form: null, roll: null
  });
  M.list = () => Object.keys(STYLES).map(id => ({ id, label: STYLES[id].label }));
  M.unit = () => 60 / M.bpm / 4;
  M.barLen = () => 60 / M.bpm * 4;
  M.nextBarTime = function (after) { const bar = M.barLen(); return M.origin + Math.max(0, Math.ceil((after - M.origin) / bar - 1e-6)) * bar; };
  M.assetsFor = function (id) {
    const S = STYLES[resolve(id)], A = O.assets;
    let p = A.kitPaths(S.kit);
    S.inst.forEach(n => { p = p.concat(A.instPaths(n)); });
    if (S.bed) p.push(A.fxPath(S.bed));
    p.push(A.fxPath('riser'), A.fxPath('impact'));
    return p.filter(Boolean);
  };
  // Sound for a rhythm-game lane in the current style (so player hits match the song's kit).
  M.laneSound = function (id, lane) { const S = STYLES[resolve(id)], el = ['kick', 'snare', 'hat', 'fx'][lane]; return { kit: S.kit, pad: S.pads[el] }; };

  // Notes for a rhythm set, charted from the style's own drum parts.
  M.chart = function (id, bpm, leadIn, duration, diff, stage) {
    const S = STYLES[resolve(id)], unit = 60 / bpm / 4, rule = { lvl: { easy: 0, normal: 1, expert: 2 }[diff] || 0, single: diff !== 'expert', stage };
    const notes = [];
    for (let k = 0; ; k++) {
      const t = leadIn + k * unit + (k % 2 ? S.swing * unit : 0);
      if (t >= duration - 1) break;
      for (const c of chartAt(S, LOOP[Math.floor(k / 16) % 8], k % 16, rule)) notes.push({ t, lane: c.lane, pad: c.hit[3] !== undefined ? c.hit[3] : S.pads[c.el], done: false });
    }
    return notes;
  };

  // Set chart: the song's drum parts through its whole form, plus hold notes, HYPE phrases and a
  // finale hit. Every note carries { t, lane, pad, bar } and optionally { dur, hype, finale }.
  M.chartSet = function (id, bpm, leadIn, bars, diff, stage) {
    const S = STYLES[resolve(id)], unit = 60 / bpm / 4, beat = 60 / bpm, lvl = { easy: 0, normal: 1, expert: 2 }[diff] || 0;
    const rule = { lvl, single: diff !== 'expert', stage }, form = buildForm(bars);
    let notes = [];
    for (let k = 0; k < bars * 16; k++) {
      const t = leadIn + k * unit + (k % 2 ? S.swing * unit : 0), bar = Math.floor(k / 16);
      for (const c of chartAt(S, form[bar], k % 16, rule)) notes.push({ t, lane: c.lane, pad: c.hit[3] !== undefined ? c.hit[3] : S.pads[c.el], done: false, bar });
    }
    // Hold notes on the FX lane sit where the arrangement thins out, leaving a hand free for the mixer.
    for (const X of form) {
      let h = null; const t0 = leadIn + X.n * 16 * unit;
      if (X.dk === 'K' && (X.sec === 'build' ? X.pos === 0 : X.pos % 2 === 0)) h = { t: t0, dur: 4 * beat };
      else if ((X.sec === 'intro' && X.pos === 1) || (X.sec === 'verse' && X.pos === 3 && !X.last) || (X.sec === 'drop' && X.pos === 3 && lvl > 0)) h = { t: t0 + 8 * unit, dur: 2 * beat };
      if (!h) continue;
      const end = h.t + h.dur;
      notes = notes.filter(n => n.lane === 3 ? !(n.t > h.t - unit * 0.6 && n.t < end + unit * 1.5) : !(lvl === 0 && n.t > h.t - unit * 0.6 && n.t < end - 0.01));
      notes.push({ t: h.t, lane: 3, pad: S.pads.fx, dur: h.dur, done: false, bar: X.n });
    }
    // HYPE phrases: every note in these bars glows; hit them all to charge the meter.
    const glow = X => (X.sec === 'intro' && X.pos === 2) || ((X.sec === 'verse' || X.sec === 'drop' || X.sec === 'drop2') && X.pos % 4 === 1);
    notes.forEach(n => { if (!n.dur && glow(form[n.bar])) n.hype = n.bar; });
    notes.push({ t: leadIn + bars * 16 * unit, lane: 0, pad: S.pads.kick, done: false, bar: bars, finale: true });
    return notes.sort((a, b) => a.t - b.t || a.lane - b.lane);
  };
  M.buildForm = buildForm;
  // Sections of a set as { sec, bar, bars } (used for the mix-move prompts and the progress bar).
  M.sections = function (bars) { const out = []; for (const X of buildForm(bars)) { if (X.first) out.push({ sec: X.sec, bar: X.n, bars: X.len }); } return out; };
  // Loop roll: repeat the last `steps` sixteenths until released (0 = off).
  M.setRoll = function (steps) { M.roll = steps && M.playing ? { len: steps, k0: Math.floor((M.k - 1) / steps) * steps } : null; };
  // Briefly pull the melody and bass down (used when the player misses a note).
  M.dip = function (depth, dur) {
    const s = M.session; if (!s || !E.ctx) return;
    const t = E.ctx.currentTime;
    for (const g of [s.dipM.gain, s.dipB.gain]) { try { g.cancelScheduledValues(t); g.setTargetAtTime(depth, t, 0.012); g.setTargetAtTime(1, t + dur, 0.07); } catch (e) {} }
  };

  // ---------- session (per-play gain stage so stop/pause silences everything already scheduled) ----------
  function openSession(c, nodes) {
    const s = { melody: c.createGain(), bass: c.createGain(), drums: c.createGain(), gen: E.generation, rev: nodes.revIn, bed: null };
    s.base = layerGains(M.style);
    s.melody.gain.value = s.base.melody; s.bass.gain.value = s.base.bass; s.drums.gain.value = s.base.drums;
    s.dipM = c.createGain(); s.dipB = c.createGain();
    s.melody.connect(s.dipM); s.dipM.connect(nodes.melody); s.bass.connect(s.dipB); s.dipB.connect(nodes.bass); s.drums.connect(nodes.drums);
    return s;
  }
  const db = x => Math.pow(10, x / 20);
  function layerGains(id) { const S = STYLES[id], m = S.mix || {}, l = S.level || 1; return { melody: l * db(m.melody || 0), bass: l * db(m.bass || 0), drums: db(m.drums || 0) }; }
  function closeSession(s) {
    if (!s || !E.ctx) return;
    const t = E.ctx.currentTime;
    if (s.bed) { try { s.bed.src.stop(t + 0.05); } catch (e) {} }
    for (const k of ['melody', 'bass', 'drums']) { try { s[k].gain.cancelScheduledValues(t); s[k].gain.setTargetAtTime(0, t, 0.008); } catch (e) {} }
    setTimeout(() => { for (const k of ['melody', 'bass', 'drums', 'dipM', 'dipB']) { try { s[k].disconnect(); } catch (e) {} } }, 150);
  }
  function startBed(c, s, t) {
    const S = STYLES[M.style];
    if (s.bed) { try { s.bed.src.stop(t); } catch (e) {} s.bed = null; }
    if (S.bed) s.bed = Synth.oneShot(c, s.melody, O.assets.fxPath(S.bed), t, 0.55, true);
  }

  function helpers(c, L, beat, X) {
    return {
      n(layer, inst, midi, t, beats, vel, o) { if ((layer === 'bass' && !X.bass) || (layer === 'melody' && X.mel === false)) return; o = o || {}; Synth.inst(c, L[layer], inst, midi, t, { dur: beats * beat, vel, attack: o.attack, release: o.release, pan: o.pan, send: o.send === undefined ? (layer === 'melody' ? 0.18 : 0) : o.send, sendDest: L.rev }); },
      c(layer, inst, notes, t, beats, vel, o) { const v = vel / Math.sqrt(notes.length / 2); for (const m of notes) this.n(layer, inst, m, t, beats, v, o); },
      // stretch (seconds): play the sample slower or faster so it lasts that long
      fx(name, t, vel, stretch) { const v = Synth.oneShot(c, L.melody, O.assets.fxPath(name), t, vel); if (v && stretch) v.src.playbackRate.value = O.clamp(v.src.buffer.duration / stretch, 0.35, 2); }
    };
  }

  function scheduleStep(c, L, k, t) {
    if (M.roll && k >= M.roll.k0 + M.roll.len) k = M.roll.k0 + (k - M.roll.k0) % M.roll.len; // loop roll replays earlier steps
    const S = STYLES[M.style], beat = 60 / M.bpm, step = ((k % 16) + 16) % 16, X = barInfo(M.form, Math.floor(k / 16));
    const spec = S.drums[X.dk] || {}, H = helpers(c, L, beat, X);
    const charted = M.chartRule ? chartAt(S, X, step, M.chartRule).map(x => x.hit) : [];
    for (const el of (M.mode === 'bare' ? [] : ELEMENTS)) {
      for (const h of spec[el] || []) {
        if (h[0] !== step || (h[4] === 'first' && !X.first)) continue;
        let v = h[1];
        if (charted.includes(h)) v *= M.guideLevel;
        if (el === 'kick' && S.duck && L.duckable) duck(L, t, S.duck * (h[1] > 0.7 ? 1 : 0.6));
        if (v > 0.02) Synth.kit(c, L.drums, S.kit, h[3] !== undefined ? h[3] : S.pads[el], t, { vel: v, pan: el === 'perc' ? ((step % 4) - 1.5) * 0.15 : el === 'hat' ? 0.12 : 0 });
      }
    }
    if (M.click && step % 4 === 0) Synth.kit(c, L.drums, S.kit, S.pads.hat, t, { vel: step === 0 ? 0.7 : 0.45 }); // tutorial metronome
    if (M.form && step === 0 && M.mode !== 'bare') { // transitions between sections
      if (X.first && (X.sec === 'drop' || X.sec === 'drop2')) H.fx('impact', t, 0.5);
      if (X.dk === 'R1') H.fx('riser', t, 0.5, 8 * beat);
      if (X.dk === 'R2' && X.sec === 'break') H.fx('riser', t, 0.5, 4 * beat);
    }
    S.play(c, L, X.hb, step, t, beat, H, X);
    if (M.onStep) M.onStep(k, t);
  }
  // Sidechain-style pump: dip the music layers on each kick (house / garage / dark).
  function duck(L, t, depth) {
    for (const k of ['melody', 'bass']) { const g = L[k].gain, v = L.base[k]; g.setValueAtTime(v * (1 - depth), t); g.linearRampToValueAtTime(v, t + 0.17); }
  }

  function pump() {
    if (!M.playing || !E.ctx || !M.session) return;
    const c = E.ctx;
    if (M.session.gen !== E.generation) { M.stop(); return; }
    if (c.state !== 'running') return;
    const now = c.currentTime, ahead = now + 0.16, unit = M.unit(), swing = STYLES[M.style].swing;
    while (true) {
      const base = M.origin + M.k * unit;
      if (base >= ahead || base >= M.endAt) break;
      const t = base + (M.k % 2 ? swing * unit : 0);
      if (M.k >= 0 && t >= now - 0.005) scheduleStep(c, M.session, M.k, t); // never schedule into the past
      M.k++;
    }
  }

  /* opts: { style, bpm, origin, mode: 'set'|'jam'|'demo'|'bare', guide (0-1), chartRule, countIn, endAt, click } */
  M.start = function (opts) {
    M.stop();
    const c = E.ctx; if (!c || !E.nodes) return false;
    M.style = resolve(opts.style);
    M.bpm = opts.bpm || 88;
    M.mode = opts.mode || 'jam';
    M.guideLevel = opts.guide === undefined ? 1 : opts.guide;
    M.chartRule = opts.chartRule || null;
    M.endAt = opts.endAt || Infinity;
    M.click = !!opts.click;
    M.form = opts.form ? buildForm(opts.form) : null;
    M.roll = null;
    M.origin = opts.origin !== undefined ? opts.origin : c.currentTime + 0.12;
    M.session = openSession(c, E.nodes);
    M.session.duckable = true;
    const unit = M.unit();
    M.k = Math.max(0, Math.ceil((c.currentTime + 0.02 - M.origin) / unit));
    const S = STYLES[M.style];
    if (opts.countIn) {
      const beat = 60 / M.bpm;
      for (let i = 0; i < 4; i++) { const t = M.origin - (4 - i) * beat; if (t >= c.currentTime) Synth.kit(c, M.session.drums, S.kit, S.pads.count, t, { vel: i === 0 ? 0.95 : 0.7 }); }
    }
    startBed(c, M.session, Math.max(c.currentTime + 0.01, M.origin));
    M.playing = true;
    M.timer = setInterval(pump, 25);
    pump();
    O.emit('music', { playing: true, mode: M.mode });
    return true;
  };

  M.stop = function () {
    if (M.timer) clearInterval(M.timer);
    M.timer = 0;
    if (M.session) closeSession(M.session);
    M.session = null;
    const was = M.playing;
    M.playing = false; M.mode = null; M.chartRule = null; M.click = false; M.roll = null;
    if (was) O.emit('music', { playing: false });
  };

  // Change style while jamming without restarting the grid (no burst of late notes).
  M.restyle = function (id) {
    id = resolve(id);
    if (id === M.style) return;
    M.style = id;
    O.assets.ensure(M.assetsFor(id));
    if (M.session && E.ctx) {
      const t = E.ctx.currentTime, g = layerGains(id); M.session.base = g;
      for (const k of ['melody', 'bass', 'drums']) M.session[k].gain.setTargetAtTime(g[k], t, 0.05);
      startBed(E.ctx, M.session, t + 0.05);
    }
    O.emit('music', { playing: M.playing, mode: M.mode });
  };
  M.pump = pump;

  // Render a style offline through the same mix chain (used by tests and the audio previews).
  M.renderOffline = async function (id, bpm, seconds, opts) {
    opts = opts || {};
    const c = new OfflineAudioContext(2, Math.ceil(44100 * seconds), 44100);
    const nodes = E.buildGraph(c);
    nodes.music.gain.value = (opts.musicLevel === undefined ? E.levels.music : opts.musicLevel) * E.SCALE.music;
    const saved = { style: M.style, bpm: M.bpm, guideLevel: M.guideLevel, mode: M.mode, chartRule: M.chartRule, form: M.form, roll: M.roll };
    M.style = resolve(id); M.bpm = bpm; M.guideLevel = opts.guide === undefined ? 1 : opts.guide; M.mode = 'render'; M.chartRule = opts.chartRule || null; M.form = opts.form ? buildForm(opts.form) : null; M.roll = null;
    const L = openSession(c, nodes); L.duckable = !opts.only;
    if (opts.only) for (const k of ['melody', 'bass', 'drums']) if (k !== opts.only) L[k].gain.value = 0;
    if (opts.preLimiter) { nodes.master.disconnect(); nodes.master.connect(c.destination); }
    if (!opts.noBed) startBed(c, L, 0.05);
    const unit = 60 / bpm / 4, sw = STYLES[M.style].swing;
    for (let k = 0; k * unit < seconds - (opts.tail === undefined ? 0.4 : opts.tail); k++) scheduleStep(c, L, k, 0.05 + k * unit + (k % 2 ? sw * unit : 0));
    if (opts.extra) opts.extra(c, nodes);
    Object.assign(M, saved);
    return c.startRendering();
  };
})();
