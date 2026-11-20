/* ORBIT DJ — backing music.
 * Seven original songs played from the sampled instrument and drum library, each written in the
 * production language of a genre: tech house, bass house, UK garage, dubstep, boom bap, chipmunk soul
 * and trap. Each is 8 bars of material (A: bars 1-4, B: bars 5-8 with the hook or drop) arranged
 * into a full song form for sets and deck tracks (see buildForm). Free play loops the 8 bars.
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

  // Seven original songs, each written in the production language of a genre (not copies of any record):
  // tech house, bass house, UK garage, dubstep, dusty sample-style boom bap, chipmunk soul and trap.
  // Notes: [step, midi, beats, velocity]; vocal lines: [step, syllable instrument, midi, beats].
  const sixteenths = (vels, pad) => vels.map((v, s) => [s, v, 9, pad]).filter(h => h[1] > 0);
  const TOPS = [0.34, 0.2, 0, 0.26, 0.34, 0.2, 0, 0.26, 0.34, 0.2, 0, 0.26, 0.34, 0.2, 0, 0.26]; // closed hats around an offbeat open hat
  const FOUR = [[0, 1, 0], [4, 1, 2], [8, 1, 0], [12, 1, 2]];
  const OFFBEAT = [[2, 0.7, 1], [6, 0.7, 1], [10, 0.7, 1], [14, 0.7, 1]];
  // Vocal chop that speeds up through a build: every half bar, then every beat, then every eighth, climbing in pitch.
  function buildChops(H, X, step, t, inst, base) {
    const every = X.dk === 'R2' ? 2 : X.dk === 'R1' ? 4 : 8;
    if (step % every === 0 && !(X.dk === 'R2' && step >= 12)) H.n('melody', inst, base + (X.dk === 'R2' ? Math.floor(step / 2) : X.dk === 'R1' ? Math.floor(step / 4) : 0), t, every / 8, 0.55 + 0.02 * step, { echo: 0.25, send: 0.2 });
  }

  const STYLES = {
    // ---------------------------------------------------------------- tech house: rolling bass riff, tops, pitched vocal hook
    house: {
      label: 'Tech house', mix: { melody: 8.5, bass: -1, drums: 0 }, kit: 'club', swing: 0.06, level: 1, duck: 0.5, duckBass: 0.65,
      inst: ['techbass', 'pluck', 'voh', 'vhey', 'supersaw'],
      pads: { kick: 0, snare: 1, hat: 3, ohat: 3, fx: 15, count: 6, roll: 5 },
      chords: [[53, 56, 60, 63], [53, 56, 60, 63], [49, 53, 56, 60], [51, 55, 58, 63], [53, 56, 60, 63], [49, 53, 56, 60], [56, 60, 63, 67], [51, 55, 58, 63]],
      riff: [
        [[2, 29, 0.2, 0.9], [3, 29, 0.2, 0.75], [6, 29, 0.2, 0.9], [7, 32, 0.2, 0.8], [10, 29, 0.2, 0.9], [11, 29, 0.2, 0.75], [14, 27, 0.2, 0.85], [15, 41, 0.2, 0.9]],
        [[2, 29, 0.2, 0.9], [3, 41, 0.2, 0.8], [6, 29, 0.2, 0.9], [7, 29, 0.2, 0.75], [10, 32, 0.2, 0.85], [11, 34, 0.2, 0.85], [14, 29, 0.2, 0.9], [15, 36, 0.2, 0.85]],
        [[2, 29, 0.2, 0.9], [3, 29, 0.2, 0.75], [6, 29, 0.2, 0.9], [7, 32, 0.2, 0.8], [10, 29, 0.2, 0.9], [11, 29, 0.2, 0.75], [14, 27, 0.2, 0.85], [15, 41, 0.2, 0.9]],
        [[2, 25, 0.2, 0.9], [3, 25, 0.2, 0.75], [6, 25, 0.2, 0.9], [7, 37, 0.2, 0.8], [10, 27, 0.2, 0.9], [11, 27, 0.2, 0.75], [14, 27, 0.2, 0.9], [15, 39, 0.25, 0.95]]],
      vocal: [[[0, 65, 0.5], [3, 65, 0.25], [6, 68, 0.5], [11, 65, 0.25], [14, 63, 0.5]], [[0, 65, 0.5], [3, 65, 0.25], [6, 72, 0.75], [12, 70, 0.5]],
        [[0, 65, 0.5], [3, 65, 0.25], [6, 68, 0.5], [11, 65, 0.25], [14, 63, 0.5]], [[0, 61, 0.5], [3, 61, 0.25], [6, 63, 0.75], [10, 65, 1]]],
      arp: [77, 80, 84, 77, 82, 84, 77, 80, 77, 80, 84, 87, 84, 82, 80, 77],
      drums: {
        A: { kick: FOUR, snare: [[4, 0.9, 0], [12, 0.9, 0]], hat: OFFBEAT, perc: sixteenths(TOPS, 2).concat([1, 5, 9, 13].map(s => [s, 0.22, 9, 7]), [[7, 0.4, 9, 6]]), fx: [[0, 0.6, 1, 15, 'first']] },
        B: { kick: FOUR, snare: [[4, 0.95, 0], [12, 0.95, 0]], hat: OFFBEAT, perc: sixteenths(TOPS, 2).concat([1, 3, 5, 7, 9, 11, 13, 15].map(s => [s, 0.24, 9, 7]), [[3, 0.5, 9, 9], [10, 0.5, 9, 8], [15, 0.45, 9, 9], [0, 0.3, 9, 11], [8, 0.3, 9, 11]]), fx: [[0, 0.65, 1, 15, 'first']] },
        F: { kick: [[0, 1, 0], [4, 1, 2], [8, 1, 0]], snare: [[4, 0.95, 0], [12, 0.7, 0, 5], [13, 0.75, 2, 5], [14, 0.85, 1, 5], [15, 0.95, 2, 5]], hat: OFFBEAT.slice(0, 3), perc: sixteenths(TOPS, 2).slice(0, 9) }
      },
      play(c, L, bar, step, t, beat, H, X) {
        const drop = X.full && X.sec !== 'break', brk = X.sec === 'break', build = X.sec === 'build', ch = this.chords[bar];
        if (!brk && !build) for (const [s, m, len, v] of this.riff[bar % 4]) if (s === step) {
          H.n('bass', 'techbass', m, t, len, v * (drop ? 1 : 0.85));
          if (drop) { H.n('bass', 'techbass', m + 12, t, len, 0.5); H.n('bass', 'pluck', m + 24, t, 0.15, 0.3); } // octave layers keep the riff audible on small speakers
        }
        if (drop || brk || (X.sec === 'verse' && X.pos >= 4)) for (const [s, m, len] of this.vocal[bar % 4]) if (s === step) H.n('melody', 'voh', m, t, len, 0.78, { echo: 0.3, send: brk ? 0.35 : 0.15 });
        if ((X.sec === 'intro' || X.sec === 'verse') && step === 0 && X.pos % 2 === 0) H.n('melody', 'vhey', 65, t, 0.5, 0.72, { echo: 0.45, send: 0.2 });
        if (drop && bar % 2 === 1 && (step === 6 || step === 14)) H.c('melody', 'supersaw', ch.map(m => m + 12), t, 0.2, 0.5, { wide: 1, send: 0.2, echo: 0.2 });
        if (brk && step === 0) H.c('melody', 'supersaw', ch, t, 3.8, 0.42 + 0.04 * X.pos, { wide: 1, attack: 0.08, release: 0.4, send: 0.35 });
        if (build) buildChops(H, X, step, t, 'vhey', 65);
        if (X.dk === 'R2' && step === 12) H.n('melody', 'vhey', 72, t, 0.9, 0.9, { echo: 0.5, send: 0.3 });
        if (X.lead) H.n('melody', 'pluck', this.arp[step], t, 0.2, step % 4 === 0 ? 0.42 : 0.32, { pan: step % 2 ? 0.35 : -0.35, echo: 0.25 });
      }
    },

    // ---------------------------------------------------------------- bass house: bouncy donk bass, chipmunk vocal chops, piano stabs
    basshouse: {
      label: 'Bass house', mix: { melody: 8, bass: -1, drums: 0 }, kit: 'club', swing: 0.1, level: 1, duck: 0.55, duckBass: 0.7,
      inst: ['donk', 'sub', 'piano', 'vah', 'vee', 'vyeah', 'supersaw'],
      pads: { kick: 0, snare: 1, hat: 3, ohat: 3, fx: 15, count: 6, roll: 5 },
      chords: [[53, 56, 60, 65], [53, 56, 60, 65], [53, 56, 61, 65], [51, 55, 58, 63], [53, 56, 60, 65], [53, 56, 61, 65], [51, 56, 60, 63], [51, 55, 58, 63]],
      riff: [
        [[2, 41, 0.3, 1], [3, 41, 0.2, 0.7], [6, 44, 0.3, 0.9], [7, 41, 0.2, 0.7], [10, 46, 0.3, 0.95], [11, 44, 0.2, 0.75], [14, 41, 0.3, 0.9], [15, 39, 0.2, 0.8]],
        [[2, 41, 0.3, 1], [3, 41, 0.2, 0.7], [6, 48, 0.3, 0.9], [7, 46, 0.2, 0.75], [10, 44, 0.3, 0.95], [11, 41, 0.2, 0.75], [14, 39, 0.3, 0.9], [15, 36, 0.2, 0.85]],
        [[2, 41, 0.3, 1], [3, 41, 0.2, 0.7], [6, 44, 0.3, 0.9], [7, 41, 0.2, 0.7], [10, 46, 0.3, 0.95], [11, 44, 0.2, 0.75], [14, 41, 0.3, 0.9], [15, 39, 0.2, 0.8]],
        [[2, 37, 0.3, 1], [3, 37, 0.2, 0.7], [6, 37, 0.3, 0.9], [7, 49, 0.2, 0.8], [10, 39, 0.3, 0.95], [11, 39, 0.2, 0.75], [14, 39, 0.3, 0.9], [15, 51, 0.25, 0.95]]],
      vocal: [
        [[0, 'vah', 77, 0.5], [2, 'vah', 77, 0.25], [4, 'vee', 80, 0.5], [7, 'vah', 77, 0.5], [10, 'vee', 75, 0.5], [12, 'vah', 72, 0.75]],
        [[0, 'vah', 77, 0.5], [2, 'vah', 77, 0.25], [4, 'vee', 80, 0.5], [7, 'vyeah', 84, 0.75], [12, 'vee', 80, 0.5], [14, 'vah', 77, 0.5]],
        [[0, 'vah', 77, 0.5], [2, 'vah', 77, 0.25], [4, 'vee', 80, 0.5], [7, 'vah', 77, 0.5], [10, 'vee', 75, 0.5], [12, 'vah', 72, 0.75]],
        [[0, 'vah', 75, 0.5], [2, 'vah', 75, 0.25], [4, 'vee', 77, 0.5], [7, 'vah', 75, 0.5], [10, 'vyeah', 72, 1]]],
      drums: {
        A: { kick: FOUR, snare: [[4, 0.95, 0], [12, 0.95, 0]], hat: OFFBEAT, perc: sixteenths(TOPS, 2).concat([1, 5, 9, 13].map(s => [s, 0.22, 9, 7])), fx: [[0, 0.6, 1, 15, 'first']] },
        B: { kick: FOUR, snare: [[4, 1, 0], [12, 1, 0]], hat: OFFBEAT, perc: sixteenths(TOPS, 2).concat([1, 3, 5, 7, 9, 11, 13, 15].map(s => [s, 0.24, 9, 7]), [[7, 0.35, 9, 5], [15, 0.4, 9, 5], [11, 0.35, 9, 10]]), fx: [[0, 0.65, 1, 15, 'first']] },
        F: { kick: [[0, 1, 0], [4, 1, 2], [8, 1, 0]], snare: [[4, 1, 0], [10, 0.6, 2], [12, 0.75, 0], [13, 0.7, 2], [14, 0.85, 1], [15, 0.95, 2]], hat: OFFBEAT.slice(0, 2), perc: sixteenths(TOPS, 2).slice(0, 7) }
      },
      play(c, L, bar, step, t, beat, H, X) {
        const drop = X.full && X.sec !== 'break', brk = X.sec === 'break', build = X.sec === 'build', ch = this.chords[bar];
        if (!brk && !build) {
          for (const [s, m, len, v] of this.riff[bar % 4]) if (s === step) H.n('bass', 'donk', m, t, len, v * (drop ? 1 : 0.85));
          if (drop && step % 4 === 2) H.n('bass', 'sub', 29, t, 0.35, 0.85);
        }
        const voc = this.vocal[bar % 4];
        if (drop || brk) for (const [s, inst, m, len] of voc) if (s === step) H.n('melody', inst, m, t, len, 0.75, { echo: 0.28, send: brk ? 0.35 : 0.15, pan: s % 4 ? 0.2 : -0.2 });
        if (X.sec === 'verse' && (X.pos >= 4 || bar % 2 === 0)) for (const [s, inst, m, len] of voc.slice(0, 3)) if (s === step) H.n('melody', inst, m, t, len, 0.65, { echo: 0.35, send: 0.2 });
        if (X.sec === 'intro' && step === 0 && X.pos % 2 === 0) H.n('melody', 'vyeah', 72, t, 0.75, 0.7, { echo: 0.45, send: 0.25 });
        if ((brk || X.lead) && [0, 3, 6, 10, 13].includes(step)) H.c('melody', 'piano', ch.map(m => m + (X.lead ? 12 : 0)), t, 0.35, brk ? 0.62 : 0.55, { send: 0.18 });
        if (brk && step === 0) H.c('melody', 'supersaw', ch, t, 3.8, 0.36 + 0.04 * X.pos, { wide: 1, attack: 0.1, release: 0.4, send: 0.35 });
        if (build) { buildChops(H, X, step, t, 'vyeah', 72); if (step % 2 === 0) H.c('melody', 'piano', ch.map(m => m + 12), t, 0.3, 0.35 + 0.05 * X.pos, { send: 0.2 }); }
        if (X.dk === 'R2' && step === 12) H.n('melody', 'vyeah', 77, t, 0.9, 0.9, { echo: 0.5, send: 0.3 });
      }
    },

    // ---------------------------------------------------------------- UK garage: 2-step drums, pumping piano, chopped vocal phrase, sub + reese
    garage: {
      label: 'UK garage', mix: { melody: 4, bass: -2.5, drums: 1 }, kit: 'club', swing: 0.2, level: 1, duck: 0.45, duckBass: 0.3, bed: 'vinyl',
      inst: ['piano', 'sub', 'reese', 'vah', 'voh', 'vee', 'vyeah', 'supersaw'],
      pads: { kick: 4, snare: 5, hat: 2, ohat: 3, fx: 15, count: 6, roll: 5 },
      chords: [[50, 54, 57, 61, 64], [49, 52, 57, 61, 64], [52, 56, 59, 64], [54, 57, 61, 64], [50, 54, 57, 61, 64], [49, 52, 57, 61, 64], [52, 56, 59, 64], [54, 57, 61, 64]],
      roots: [38, 37, 40, 42, 38, 37, 40, 42],
      vocal: [
        [[0, 'vah', 76, 0.75], [3, 'voh', 73, 0.5], [6, 'vah', 73, 0.25], [7, 'vee', 71, 0.5], [10, 'vah', 69, 1], [14, 'voh', 71, 0.5]],
        [[0, 'vah', 73, 0.75], [3, 'voh', 71, 0.5], [6, 'vee', 69, 0.75], [10, 'vyeah', 76, 1.25]],
        [[0, 'vah', 71, 0.75], [3, 'voh', 71, 0.25], [4, 'vee', 73, 0.5], [7, 'vah', 76, 0.75], [11, 'voh', 73, 0.5], [14, 'vah', 71, 0.5]],
        [[0, 'voh', 69, 1], [4, 'vah', 66, 0.5], [6, 'vee', 69, 0.5], [8, 'vyeah', 73, 1.5]]],
      drums: {
        A: { kick: [[0, 1, 0], [10, 0.9, 0], [7, 0.6, 2]], snare: [[4, 0.95, 0], [12, 0.95, 0]], hat: [[2, 0.6, 1], [6, 0.55, 1], [10, 0.6, 2], [14, 0.55, 1]], ohat: [[14, 0.4, 9]],
          perc: [[3, 0.3, 9, 2], [7, 0.26, 9, 2], [11, 0.3, 9, 2], [15, 0.34, 9, 2], [3, 0.4, 9, 6], [9, 0.3, 9, 7], [4, 0.4, 9, 1], [12, 0.4, 9, 1]], fx: [[0, 0.55, 1, 15, 'first']] },
        B: { kick: [[0, 1, 0], [6, 0.8, 1], [10, 0.9, 0]], snare: [[4, 1, 0], [12, 1, 0]], hat: [[2, 0.6, 1], [6, 0.55, 2], [10, 0.6, 2], [14, 0.55, 1]], ohat: [[14, 0.45, 9], [6, 0.3, 9]],
          perc: [[1, 0.24, 9, 2], [3, 0.32, 9, 2], [7, 0.28, 9, 2], [11, 0.32, 9, 2], [15, 0.36, 9, 2], [3, 0.42, 9, 6], [9, 0.32, 9, 7], [13, 0.32, 9, 7], [4, 0.5, 9, 1], [12, 0.5, 9, 1]], fx: [[0, 0.6, 1, 15, 'first']] },
        F: { kick: [[0, 1, 0], [10, 0.9, 0]], snare: [[4, 1, 0], [12, 0.85, 0], [13, 0.6, 2], [14, 0.8, 1], [15, 0.95, 2]], hat: [[2, 0.6, 1], [6, 0.55, 1]], perc: [[3, 0.3, 9, 2], [7, 0.26, 9, 2]] }
      },
      play(c, L, bar, step, t, beat, H, X) {
        const ch = this.chords[bar], root = this.roots[bar], drop = X.full && X.sec !== 'break', brk = X.sec === 'break', build = X.sec === 'build';
        if (drop) {
          if (step % 2 === 0) H.c('melody', 'piano', ch, t, 0.42, step % 4 === 2 ? 0.64 : 0.52, { send: 0.15 });
          if (step % 4 === 0) H.pump(t, 0.5, 0);
          if (step === 0) H.c('melody', 'supersaw', ch.slice(1).map(m => m + 12), t, 3.9, 0.3, { wide: 1, attack: 0.05, release: 0.3, send: 0.25 });
        } else if (!build) {
          if (step === 0) H.c('melody', 'piano', ch, t, 3.6, 0.62, { send: 0.35 });
          if (step === 10 && X.sec !== 'intro') H.c('melody', 'piano', ch.slice(1), t, 1.4, 0.45, { send: 0.35 });
        }
        if (!build && (X.sec !== 'intro' || X.pos >= 2)) for (const [s, inst, m, len] of this.vocal[bar % 4]) if (s === step) H.n('melody', inst, m, t, len, drop ? 0.72 : 0.66, { echo: 0.3, send: 0.3, pan: s % 3 ? 0.15 : -0.15 });
        if (drop && bar === 7 && step >= 12) H.n('melody', 'vah', 73, t, 0.2, 0.7 - 0.08 * (step - 12), { echo: 0.2 }); // stutter into the next phrase
        const bass = { 0: [root, 1], 3: [root, 0.4], 7: [root + 12, 0.25], 10: [root, 0.9], 14: [root + 7, 0.4] };
        if (!build && step in bass) H.n('bass', 'sub', bass[step][0], t, bass[step][1], 0.95);
        if (X.lead && (step === 0 || step === 10)) H.n('bass', 'reese', root, t, step ? 1.4 : 2.4, 0.5);
        if (build) { buildChops(H, X, step, t, 'vah', 73); if (step % 2 === 0) H.c('melody', 'piano', ch, t, 0.4, 0.4 + 0.06 * X.pos, { send: 0.25 }); }
        if (X.dk === 'R2' && step === 12) H.n('melody', 'vyeah', 76, t, 0.9, 0.85, { echo: 0.5, send: 0.35 });
      }
    },

    // ---------------------------------------------------------------- dubstep: melodic intro and build, then growl-bass call and response at half time
    dubstep: {
      label: 'Dubstep', mix: { melody: 7.5, bass: 0, drums: 2 }, kit: 'midnight', swing: 0, level: 1, duck: 0.35, duckBass: 0,
      inst: ['supersaw', 'sub', 'gr1', 'gr2', 'gr3', 'gr4', 'vah', 'vee', 'vyeah', 'pluck'],
      pads: { kick: 4, snare: 8, hat: 2, ohat: 3, fx: 11, count: 6, roll: 1 },
      chords: [[55, 58, 62, 67], [55, 58, 63, 67], [53, 58, 62, 65], [53, 57, 60, 65], [55, 58, 62, 67], [55, 58, 63, 67], [53, 58, 62, 65], [53, 57, 60, 65]],
      roots: [31, 27, 34, 29, 31, 27, 34, 29],
      vocal: [[[0, 'vah', 74, 1], [4, 'vee', 70, 0.5], [6, 'vah', 72, 0.5], [8, 'vah', 74, 1.5]], [[0, 'vah', 75, 1], [4, 'vee', 74, 0.5], [6, 'vah', 70, 1.5]],
        [[0, 'vah', 74, 1], [4, 'vee', 70, 0.5], [6, 'vah', 72, 0.5], [8, 'vah', 77, 1.5]], [[0, 'vah', 72, 1.5], [6, 'vee', 69, 0.5], [8, 'vah', 70, 2]]],
      riff: [ // [step, growl, midi, beats, velocity]; the snare owns step 8
        [[0, 'gr1', 31, 0.75, 1], [3, 'gr2', 31, 0.25, 0.9], [4, 'gr2', 31, 0.5, 0.9], [6, 'gr3', 31, 0.5, 0.85], [10, 'gr4', 34, 0.25, 0.9], [11, 'gr4', 34, 0.25, 0.9], [12, 'gr1', 29, 1, 1]],
        [[0, 'gr2', 31, 0.5, 1], [2, 'gr2', 31, 0.25, 0.9], [3, 'gr4', 31, 0.25, 0.9], [4, 'gr1', 36, 0.75, 1], [10, 'gr3', 31, 0.25, 0.9], [11, 'gr3', 33, 0.25, 0.9], [12, 'gr3', 34, 0.25, 0.9], [13, 'gr3', 36, 0.25, 0.9], [14, 'gr4', 31, 0.5, 1]],
        [[0, 'gr1', 31, 0.75, 1], [3, 'gr2', 31, 0.25, 0.9], [4, 'gr4', 31, 0.5, 0.9], [6, 'gr1', 34, 0.5, 0.9], [10, 'gr2', 31, 0.25, 0.9], [11, 'gr2', 31, 0.25, 0.9], [12, 'gr4', 27, 1, 1]],
        [[0, 'gr1', 31, 1, 1], [4, 'gr3', 31, 0.25, 0.9], [5, 'gr3', 31, 0.25, 0.9], [6, 'gr2', 31, 0.5, 0.9], [10, 'gr4', 31, 0.5, 0.9]]],
      riff2: [
        [[0, 'gr4', 31, 0.5, 1], [2, 'gr1', 31, 0.5, 0.95], [4, 'gr3', 31, 0.25, 0.9], [5, 'gr3', 34, 0.25, 0.9], [6, 'gr2', 31, 0.5, 0.9], [10, 'gr1', 36, 0.5, 0.95], [12, 'gr4', 29, 0.5, 1], [14, 'gr2', 29, 0.5, 0.9]],
        [[0, 'gr1', 31, 0.75, 1], [10, 'gr2', 31, 0.25, 0.9], [11, 'gr2', 31, 0.25, 0.9], [12, 'gr4', 34, 0.5, 1], [14, 'gr1', 36, 0.5, 0.95]],
        [[0, 'gr4', 31, 0.5, 1], [2, 'gr1', 31, 0.5, 0.95], [4, 'gr3', 31, 0.25, 0.9], [5, 'gr3', 34, 0.25, 0.9], [6, 'gr2', 31, 0.5, 0.9], [10, 'gr1', 38, 0.5, 0.95], [12, 'gr4', 27, 0.5, 1], [14, 'gr2', 27, 0.5, 0.9]],
        [[0, 'gr1', 31, 1, 1], [4, 'gr2', 31, 0.25, 0.9], [5, 'gr2', 31, 0.25, 0.9], [6, 'gr3', 31, 0.5, 0.9], [10, 'gr4', 31, 0.5, 0.9]]],
      drums: {
        A: { kick: [[0, 1, 0], [10, 0.8, 1]], snare: [[8, 1, 0]], hat: [[4, 0.5, 0], [12, 0.5, 0], [2, 0.4, 1], [6, 0.4, 1], [10, 0.4, 2], [14, 0.4, 1]], perc: [[8, 0.5, 9, 5]], fx: [[0, 0.6, 0, 11, 'first']] },
        B: { kick: [[0, 1, 0], [6, 0.7, 2], [10, 0.85, 1]], snare: [[8, 1, 0]], hat: [[4, 0.55, 0], [12, 0.55, 0], [2, 0.4, 1], [6, 0.4, 2], [14, 0.45, 1]], ohat: [[14, 0.4, 9]], perc: [[8, 0.6, 9, 5]], fx: [[0, 0.75, 0, 11, 'first']] },
        F: { kick: [[0, 1, 0]], snare: [[8, 1, 0], [12, 0.6, 1, 1], [13, 0.7, 2, 1], [14, 0.8, 1, 1], [15, 0.9, 2, 1]], hat: [[4, 0.55, 0], [2, 0.4, 1], [6, 0.4, 1]], perc: [[8, 0.6, 9, 5]] }
      },
      play(c, L, bar, step, t, beat, H, X) {
        const ch = this.chords[bar], drop = X.full && X.sec !== 'break', brk = X.sec === 'break', build = X.sec === 'build';
        if (drop) {
          for (const [s, inst, m, len, v] of (X.lead ? this.riff2 : this.riff)[bar - 4]) if (s === step) { H.n('bass', inst, m, t, len, v, { release: 0.03 }); H.n('bass', 'sub', m > 36 ? m - 12 : m, t, len, 0.85); }
          if (X.lead && bar === 5 && step === 4) for (let i = 0; i < 6; i++) { H.n('bass', 'gr3', 31 + i, t + i * beat / 3, 0.28, 0.9, { release: 0.03 }); H.n('bass', 'sub', 31, t + i * beat / 3, 0.28, 0.7); } // triplet run
          if (bar === 7 && step === 12) H.n('melody', 'vyeah', 67, t, 1, 0.9, { echo: 0.5, send: 0.3 });
          if (X.lead && (step === 2 || step === 10)) H.c('melody', 'supersaw', ch.map(m => m + 12), t, 0.25, 0.42, { wide: 1, send: 0.2 });
          return;
        }
        if (step === 0) H.n('bass', 'sub', this.roots[bar], t, 3.6, 0.9);
        if (X.sec === 'intro') { const a = [0, 1, 2, 3, 2, 1, 2, 3][step / 2]; if (step % 2 === 0) H.n('melody', 'pluck', ch[a] + 12, t, 0.4, 0.5, { echo: 0.35, send: 0.3, pan: step % 4 ? 0.3 : -0.3 }); }
        else if (build) { if (step % (X.dk === 'R2' ? 1 : 2) === 0 && !(X.dk === 'R2' && step >= 12)) H.c('melody', 'supersaw', ch.map(m => m + 12), t, 0.22, 0.34 + 0.05 * X.pos + 0.008 * step, { wide: 1, send: 0.2 }); }
        else if ([0, 3, 6, 8, 11, 14].includes(step)) H.c('melody', 'supersaw', ch.map(m => m + 12), t, step === 0 || step === 8 ? 0.7 : 0.3, brk ? 0.46 : 0.4, { wide: 1, send: 0.3, echo: 0.2 });
        if (!build && (brk || X.sec === 'verse')) for (const [s, inst, m, len] of this.vocal[bar % 4]) if (s === step) H.n('melody', inst, m, t, len, 0.72, { echo: 0.35, send: 0.35 });
        if (X.dk === 'R2' && step === 12) H.n('melody', 'vyeah', 67, t, 0.9, 0.95, { echo: 0.5, send: 0.3 });
      }
    },

    // ---------------------------------------------------------------- trap: gliding 808s, hi-hat rolls, dark bell motif
    trap: {
      label: 'Trap', mix: { melody: 1, bass: -1, drums: 1.5 }, kit: 'midnight', swing: 0, level: 1, duck: 0.25, duckBass: 0,
      inst: ['b808', 'bell', 'piano', 'choir', 'flute', 'brass', 'pluck'],
      pads: { kick: 4, snare: 1, hat: 2, ohat: 3, fx: 11, count: 6, roll: 1 },
      chords: [[55, 58, 62], [55, 58, 62], [51, 55, 58, 62], [50, 54, 57, 60], [55, 58, 62], [55, 58, 62], [51, 55, 58, 62], [50, 54, 57, 60]],
      b808: [ // [step, midi, beats, glide semitones]
        [[0, 31, 1.6], [7, 31, 0.6], [10, 34, 1.4, -3]], [[0, 31, 1.6], [7, 38, 0.6], [10, 29, 1.4]], [[0, 27, 1.6], [7, 27, 0.6], [10, 27, 1.4, 4]], [[0, 26, 1.6], [7, 26, 0.6], [10, 30, 1.4]],
        [[0, 31, 0.7], [3, 31, 0.5], [7, 31, 0.6], [10, 34, 0.9, -3], [14, 43, 0.5]], [[0, 31, 0.7], [3, 31, 0.5], [7, 38, 0.6], [10, 29, 0.9], [14, 29, 0.5]],
        [[0, 27, 0.7], [3, 27, 0.5], [7, 27, 0.6], [10, 27, 0.9, 4], [14, 39, 0.5]], [[0, 26, 0.7], [3, 26, 0.5], [7, 26, 0.6], [10, 30, 0.9], [14, 30, 0.5]]],
      motif: [[[0, 74, 0.75], [3, 70, 0.75], [6, 67, 0.5], [8, 69, 1], [12, 66, 1]], [[0, 67, 0.75], [3, 70, 0.75], [6, 74, 0.5], [8, 75, 1.5], [14, 74, 0.5]],
        [[0, 75, 0.75], [3, 70, 0.75], [6, 67, 0.5], [8, 70, 1], [12, 67, 1]], [[0, 66, 0.75], [3, 69, 0.75], [6, 72, 0.5], [8, 74, 2]]],
      line: [79, 82, 81, 78],
      drums: {
        A: { kick: [[0, 1, 0], [7, 0.8, 1], [10, 0.9, 0]], snare: [[8, 1, 0]], hat: [[0, 0.5, 2], [2, 0.45, 1], [4, 0.55, 0], [6, 0.45, 1], [8, 0.5, 2], [10, 0.45, 1], [12, 0.55, 0], [14, 0.45, 1]], perc: [[8, 0.7, 9, 5], [3, 0.4, 9, 7], [13, 0.35, 9, 7]], fx: [[0, 0.6, 0, 11, 'first']] },
        B: { kick: [[0, 1, 0], [3, 0.7, 2], [7, 0.8, 1], [10, 0.9, 0], [14, 0.7, 2]], snare: [[8, 1, 0]], hat: [[0, 0.5, 2], [2, 0.45, 1], [4, 0.55, 0], [6, 0.45, 1], [8, 0.5, 2], [10, 0.45, 1], [12, 0.55, 0], [14, 0.45, 1]], ohat: [[14, 0.45, 9]],
          perc: [[8, 0.75, 9, 5], [3, 0.4, 9, 7], [13, 0.35, 9, 7], [4, 0.3, 9, 6], [12, 0.3, 9, 6]], fx: [[0, 0.7, 0, 11, 'first']] },
        F: { kick: [[0, 1, 0], [7, 0.8, 1]], snare: [[8, 1, 0], [12, 0.6, 1], [14, 0.8, 1], [15, 0.9, 2]], hat: [[0, 0.5, 2], [2, 0.45, 1], [4, 0.55, 0], [6, 0.45, 1]], perc: [[8, 0.75, 9, 5]] }
      },
      play(c, L, bar, step, t, beat, H, X) {
        const ch = this.chords[bar], u = beat / 4, hook = X.full && X.sec !== 'break', brk = X.sec === 'break', build = X.sec === 'build', drums = !brk && !build && X.sec !== 'intro';
        for (const [s, m, len, glide] of this.b808[bar]) if (s === step) H.n('bass', 'b808', m, t, len, 0.95, glide ? { glide: { to: glide, at: len * beat * 0.35, time: len * beat * 0.3 }, release: 0.05 } : { release: 0.05 });
        // hi-hat rolls between the charted eighths: 32nds in bars 2 and 6, a rising triplet run into the phrase end
        if (drums && bar % 4 === 1 && step === 6) for (let i = 1; i < 4; i++) H.d(2, t + i * u / 2, 0.3 + 0.07 * i);
        if (drums && bar % 4 === 3 && step === 14) for (let i = 1; i < 6; i++) H.d(2, t + i * u / 3, 0.28 + 0.06 * i, { tune: i });
        if (drums && bar % 2 === 0 && step === 11) H.d(2, t, 0.3);
        for (const [s, m, len] of this.motif[bar % 4]) if (s === step) { H.n('melody', 'bell', m, t, len, 0.62, { send: 0.4, echo: 0.2 }); if (hook) H.n('melody', 'piano', m - 12, t, len, 0.45, { send: 0.25 }); }
        if (step === 0) { H.c('melody', 'choir', ch, t, 3.8, brk ? 0.5 : 0.36, { attack: 0.12, release: 0.5, send: 0.4 }); H.n('melody', 'piano', ch[0] - 12, t, 2, 0.6); }
        if (hook && step === 0) H.n('melody', 'flute', this.line[bar % 4], t, 3.5, 0.42, { attack: 0.08, send: 0.4, release: 0.3 });
        if (hook && (step === 0 || step === 10)) H.c('melody', 'brass', [ch[0] - 12, ch[0]], t, 0.4, 0.5, { send: 0.2 });
        if (X.lead && step % 2 === 0) H.n('melody', 'pluck', ch[(step / 2) % ch.length] + 12 + (step % 8 === 6 ? 12 : 0), t, 0.25, 0.34, { pan: step % 4 ? 0.3 : -0.3, echo: 0.3 });
        if (build && step % 4 === 0) H.n('melody', 'piano', ch[(step / 4) % ch.length] + 12, t, 0.9, 0.4 + 0.05 * X.pos, { send: 0.35 });
      }
    },

    // ---------------------------------------------------------------- boom bap: a jazzy "sample" (keys, vibes, flute) chopped over swung, crunchy drums
    boombap: {
      label: 'Dusty boom bap', mix: { melody: 1, bass: 3, drums: 2 }, kit: 'dusty', swing: 0.16, level: 1, duck: 0, bed: 'vinyl',
      inst: ['ep', 'vibes', 'flute', 'upright', 'brass', 'strings'],
      pads: { kick: 0, snare: 1, hat: 2, ohat: 3, fx: 11, count: 5 },
      chords: [[57, 60, 64, 67, 71], [54, 57, 60, 64], [53, 57, 60, 64], [56, 62, 67], [53, 57, 60, 64], [53, 59, 64], [52, 55, 59, 64], [56, 62, 67]],
      roots: [33, 38, 29, 28, 38, 31, 36, 28],
      lick: [[[8, 76, 0.5], [10, 79, 0.5], [12, 81, 0.5], [14, 84, 1]], [[8, 83, 0.5], [10, 80, 0.5], [12, 77, 0.5], [14, 76, 1]]],
      hook: [[[0, 81, 1.5], [6, 77, 0.5], [8, 76, 0.5], [10, 74, 1.5]], [[0, 79, 1.5], [6, 77, 0.5], [8, 76, 1.5]], [[0, 79, 1], [4, 76, 0.5], [6, 74, 0.5], [8, 72, 1], [12, 71, 1]], [[0, 68, 1], [4, 71, 0.5], [6, 74, 0.5], [8, 79, 1.5]]],
      run: [64, 66, 68, 69, 71, 72, 74, 76],
      drums: {
        A: { kick: [[0, 1, 0], [3, 0.55, 2], [10, 0.9, 0], [11, 0.6, 2]], snare: [[4, 1, 0], [12, 1, 0]], hat: eighths(0.62, 0.48, 2, 1), perc: [[7, 0.22, 9, 1], [15, 0.2, 9, 1]], fx: [[0, 0.5, 1, 11, 'first']] },
        B: { kick: [[0, 1, 0], [3, 0.55, 2], [7, 0.7, 1], [10, 0.9, 0]], snare: [[4, 1, 0], [12, 1, 0]], hat: eighths(0.62, 0.48, 2, 1), ohat: [[14, 0.45, 9]], perc: [[7, 0.22, 9, 1], [15, 0.2, 9, 1], [4, 0.35, 9, 10], [12, 0.35, 9, 10]], fx: [[0, 0.55, 1, 11, 'first']] },
        F: { kick: [[0, 1, 0], [10, 0.9, 0]], snare: [[4, 1, 0], [12, 0.9, 0], [13, 0.55, 2], [14, 0.75, 2], [15, 0.95, 2]], hat: eighths(0.62, 0.48, 2, 1).slice(0, 6), perc: [[10, 0.7, 9, 9], [11, 0.75, 9, 8]] }
      },
      play(c, L, bar, step, t, beat, H, X) {
        const ch = this.chords[bar], root = this.roots[bar], next = this.roots[(bar + 1) % 8], hook = X.full, intro = X.sec === 'intro', build = X.sec === 'build';
        // the "sample": electric piano chopped like a loop (hard cuts, re-triggers), a stutter before the turnaround
        const chop = { 0: [1.4, 0.7], 6: [0.45, 0.5], 10: [0.7, 0.58] };
        if (step in chop && !(bar % 4 === 3 && step === 10)) H.c('melody', 'ep', ch, t, chop[step][0], chop[step][1], { release: 0.03, send: 0.12 });
        if (bar % 4 === 3 && step >= 10 && step <= 12) H.c('melody', 'ep', ch, t, 0.22, 0.6 - 0.07 * (step - 10), { release: 0.02 });
        if ((bar % 4 === 1 || bar % 4 === 3) && (intro || hook || X.pos >= 4)) for (const [s, m, d] of this.lick[bar % 4 === 1 ? 0 : 1]) if (s === step) H.n('melody', 'vibes', m, t, d, 0.6, { send: 0.3, pan: 0.2 });
        if (hook) for (const [s, m, d] of this.hook[bar - 4]) if (s === step) H.n('melody', 'flute', m, t, d, 0.6, { send: 0.3, pan: -0.15 });
        if (X.lead && (step === 0 || step === 3) && bar % 2 === 0) H.c('melody', 'brass', ch.slice(-3).map(m => m + 12), t, 0.3, 0.6, { send: 0.2 });
        if (X.last && step >= 8 && (hook || build)) H.n('melody', 'strings', this.run[step - 8] + 12, t, 0.3, 0.42 + 0.03 * (step - 8), { attack: 0.02, send: 0.3 }); // string run into the next section
        if (build && step === 0) H.n('melody', 'strings', ch[ch.length - 1] + 12, t, 3.7, 0.4 + 0.06 * X.pos, { attack: 0.3, send: 0.4, release: 0.4 });
        if (step === 0) H.n('bass', 'upright', root, t, 1.5, 0.95);
        if (step === 7) H.n('bass', 'upright', root, t, 0.4, 0.7);
        if (step === 10) H.n('bass', 'upright', root + 7, t, 0.6, 0.8);
        if (step === 14) H.n('bass', 'upright', next - 1, t, 0.4, 0.65);
      }
    },

    // ---------------------------------------------------------------- chipmunk soul: pitched-up vocal chops, piano, strings and horns over hard drums
    soul: {
      label: 'Soul', mix: { melody: 0, bass: 1.5, drums: 1.5 }, kit: 'dusty', swing: 0.08, level: 1, duck: 0, bed: 'vinyl',
      inst: ['chipoo', 'chipah', 'piano', 'upright', 'strings', 'brass', 'choir'],
      pads: { kick: 0, snare: 1, hat: 2, ohat: 3, fx: 11, count: 5 },
      chords: [[56, 60, 61, 65], [56, 58, 61, 65], [54, 58, 61, 65], [56, 58, 61, 63], [54, 58, 61, 65], [56, 60, 63], [53, 56, 60, 63], [53, 56, 58, 61]],
      roots: [37, 34, 30, 32, 30, 32, 29, 34],
      vocal: [
        [[0, 'chipoo', 80, 0.75], [3, 'chipoo', 77, 0.25], [4, 'chipah', 77, 0.5], [6, 'chipoo', 75, 0.5], [8, 'chipoo', 77, 1], [12, 'chipah', 73, 0.5], [14, 'chipoo', 75, 0.5]],
        [[0, 'chipoo', 77, 0.75], [3, 'chipoo', 73, 0.25], [4, 'chipah', 73, 0.5], [6, 'chipoo', 70, 0.5], [8, 'chipoo', 73, 1.5]],
        [[0, 'chipoo', 82, 0.75], [3, 'chipoo', 80, 0.25], [4, 'chipah', 77, 0.5], [6, 'chipoo', 75, 0.5], [8, 'chipoo', 77, 1], [12, 'chipah', 75, 0.5], [14, 'chipoo', 73, 0.5]],
        [[0, 'chipoo', 75, 1], [4, 'chipah', 72, 0.5], [6, 'chipoo', 75, 0.5], [8, 'chipoo', 80, 1.5], [14, 'chipah', 80, 0.25], [15, 'chipah', 80, 0.25]]],
      line: [77, 75, 72, 73],
      drums: {
        A: { kick: [[0, 1, 0], [6, 0.6, 2], [8, 0.9, 0], [10, 0.7, 1]], snare: [[4, 1, 0], [12, 1, 0]], hat: eighths(0.58, 0.44, 2, 1), perc: [[4, 0.6, 9, 6], [12, 0.6, 9, 6], [2, 0.3, 9, 10], [6, 0.3, 9, 10], [10, 0.3, 9, 10], [14, 0.3, 9, 10]], fx: [[0, 0.5, 1, 11, 'first']] },
        B: { kick: [[0, 1, 0], [3, 0.6, 2], [8, 0.9, 0], [10, 0.75, 1], [11, 0.5, 2]], snare: [[4, 1, 0], [12, 1, 0]], hat: eighths(0.58, 0.44, 2, 1), ohat: [[6, 0.4, 9], [14, 0.4, 9]],
          perc: [[4, 0.65, 9, 6], [12, 0.65, 9, 6]].concat([0, 2, 4, 6, 8, 10, 12, 14].map(s => [s, 0.3, 9, 10]), [1, 3, 5, 7, 9, 11, 13, 15].map(s => [s, 0.2, 9, 7])), fx: [[0, 0.55, 1, 11, 'first']] },
        F: { kick: [[0, 1, 0], [8, 0.9, 0]], snare: [[4, 1, 0], [12, 0.9, 0], [13, 0.55, 2], [14, 0.75, 2], [15, 0.95, 2]], hat: eighths(0.58, 0.44, 2, 1).slice(0, 6), perc: [[4, 0.6, 9, 6], [10, 0.7, 9, 9], [11, 0.75, 9, 8]] }
      },
      play(c, L, bar, step, t, beat, H, X) {
        const ch = this.chords[bar], root = this.roots[bar], next = this.roots[(bar + 1) % 8], hook = X.full && X.sec !== 'break', brk = X.sec === 'break', build = X.sec === 'build';
        // the chopped vocal: syllables played well above their recorded pitch, so they come out fast and bright
        if (!build) for (const [s, inst, m, len] of this.vocal[bar % 4]) if (s === step) {
          H.n('melody', inst, m, t, len, 0.74, { send: 0.22, echo: 0.12, release: 0.03 });
          if (X.lead) H.n('melody', inst, m - ([5, 10, 0].includes(m % 12) ? 4 : 3), t, len, 0.4, { send: 0.22, pan: 0.3, release: 0.03 }); // harmony a third below
        }
        if (step === 0) { H.c('melody', 'piano', ch, t, 1, 0.62, { send: 0.15 }); H.n('melody', 'piano', root + 12, t, 1, 0.55); }
        if (step === 6 || step === 10) H.c('melody', 'piano', ch, t, step === 6 ? 0.45 : 0.7, 0.5, { send: 0.15 });
        if ((hook || brk) && step === 0) { H.n('melody', 'strings', this.line[bar % 4] + (X.lead ? 12 : 0), t, 3.7, 0.5, { attack: 0.12, send: 0.35, release: 0.4 }); H.c('melody', 'choir', ch.slice(1), t, 3.7, 0.3, { attack: 0.15, send: 0.4, release: 0.4 }); }
        if (hook && (step === 0 || step === 10)) H.c('melody', 'brass', ch.slice(-3), t, 0.3, 0.62, { send: 0.18 });
        if (build && step % 4 === 0) H.c('melody', 'brass', ch.slice(-3).map(m => m + (X.pos >= 2 ? 12 : 0)), t, 0.4, 0.45 + 0.06 * X.pos, { send: 0.25 });
        const bass = { 0: [root, 1], 3: [root, 0.25], 6: [root + 12, 0.25], 8: [root, 1], 11: [root + 7, 0.25], 14: [next - 1, 0.4] };
        if (step in bass) H.n('bass', 'upright', bass[step][0], t, bass[step][1], 0.95);
      }
    }
  };
  const ALIASES = { hiphop: 'boombap', jazzhop: 'soul', melodic: 'basshouse', dark: 'dubstep' };
  const resolve = id => (STYLES[id] ? id : ALIASES[id] && STYLES[ALIASES[id]] ? ALIASES[id] : 'boombap');
  const LANE_OF = { kick: 0, snare: 1, hat: 2, fx: 3 }, PRIORITY = ['snare', 'kick', 'fx', 'hat'];
  const ELEMENTS = ['kick', 'snare', 'hat', 'ohat', 'perc', 'fx'];
  const sectionOf = bar => (bar === 7 ? 'F' : bar >= 4 ? 'B' : 'A');
  const firstOfSection = bar => bar === 0 || sectionOf(bar) !== sectionOf((bar + 7) % 8);

  // Extra drum grooves every style gets for the song form:
  // I intro (kick and a soft hat only) · K breakdown (quiet hats only) · R1 / R2 the snare roll of a build.
  for (const S of Object.values(STYLES)) {
    const A = S.drums.A, sn = S.pads.roll === undefined ? S.pads.snare : S.pads.roll;
    S.drums.I = { kick: A.kick, hat: (A.hat || []).map(h => [h[0], h[1] * 0.7, h[2], h[3]]), fx: A.fx }; // intros stay plain: kick and a soft hat, no shakers or busy tops
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
  // bars: a named form, a bar count, or a list of rows { sec, bars, drums } from the song builder
  // (drums: 'style' = the song's own groove, 'A'-'D' = a beat-pad pattern saved with the song, 'none').
  function buildForm(bars) {
    const rows = Array.isArray(bars) ? bars : null;
    const secs = rows ? rows.map(r => [r.sec === 'outro' ? 'mixout' : r.sec, r.bars, r.drums || 'style']) : FORMS[bars] || FORMS[bars > 28 ? 32 : 24], out = [], twoDrops = secs.some(x => x[0] === 'drop2');
    let n = 0;
    for (const [sec, len, src] of secs) for (let pos = 0; pos < len; pos++, n++) {
      const last = pos === len - 1, full = sec === 'drop' || sec === 'drop2' || sec === 'break';
      let dk = last ? 'F' : full ? 'B' : 'A', bass = true, mel = true;
      if (sec === 'mixin') { dk = last ? 'F' : pos < 4 ? 'I' : 'A'; bass = false; mel = false; }
      else if (sec === 'mixout') { dk = 'A'; mel = false; }
      else if (sec === 'intro') { if (!last) dk = 'I'; bass = pos >= 2; }
      else if (sec === 'build') { dk = pos < len - 2 ? 'K' : pos === len - 2 ? 'R1' : 'R2'; bass = false; }
      else if (sec === 'break') { dk = last ? 'R2' : 'K'; bass = false; }
      out.push({ n, sec, pos, len, first: pos === 0, last, full, dk, bass, mel, src: src || 'style', hb: (full ? 4 : 0) + pos % 4, start: n - pos,
        lead: sec === 'drop2' || (!twoDrops && sec === 'drop' && pos >= 4) });
    }
    return out;
  }
  // Free play: the plain 8-bar loop.
  const LOOP = [0, 1, 2, 3, 4, 5, 6, 7].map(bar => ({ n: bar, sec: bar >= 4 ? 'drop' : 'verse', pos: bar % 4, len: 4, first: firstOfSection(bar), last: bar === 3 || bar === 7, full: bar >= 4, dk: sectionOf(bar), bass: true, hb: bar, start: bar >= 4 ? 4 : 0, lead: false }));
  const barInfo = (form, nbar) => (form ? form[Math.min(Math.max(nbar, 0), form.length - 1)] : LOOP[((nbar % 8) + 8) % 8]);

  // Which drum hits at this step are notes for the player. X: bar info; rule: { lvl, single, stage }
  function chartAt(S, X, step, rule) {
    if (X.src && X.src !== 'style') return X.src === 'none' ? [] : beatChart(X, step, rule);
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

  // ---------- user songs (song builder) ----------
  // M.song: { key (semitones), kit, swaps: { bass, keys, lead, vocal }, mutes: { drums, bass, keys, lead, vocal }, rows, beat: { kit, patterns } }
  const ROLE = { vah: 'vocal', voh: 'vocal', vee: 'vocal', vyeah: 'vocal', vhey: 'vocal', chipoo: 'vocal', chipah: 'vocal', choir: 'vocal',
    pluck: 'lead', bell: 'lead', flute: 'lead', vibes: 'lead', piano: 'keys', ep: 'keys', supersaw: 'keys', strings: 'keys', brass: 'keys', pad: 'keys' };
  const CLEAN = { vah: 'pluck', voh: 'pluck', vee: 'pluck', vyeah: 'pluck', vhey: 'pluck', chipoo: 'vibes', chipah: 'vibes', choir: 'strings', brass: 'piano' };
  const SOUNDS = { bass: ['sub', 'b808', 'upright', 'techbass', 'donk', 'reese'], keys: ['piano', 'ep', 'supersaw', 'strings', 'brass', 'pad'], lead: ['pluck', 'bell', 'flute', 'vibes'], vocal: ['vah', 'voh', 'chipoo', 'chipah', 'choir'] };
  // Drum-pad categories, so a groove written for one kit can be played on another.
  const PADCAT = [[/KICK 2|PUNCH/, 'kick2'], [/KICK/, 'kick'], [/BIG SNARE/, 'snare2'], [/SNARE/, 'snare'], [/CLAP/, 'clap'], [/OPEN/, 'ohat'], [/HAT/, 'hat'], [/RIM|SNAP/, 'rim'], [/SHAKER|PERC/, 'shaker'],
    [/LOW TOM|CONGA LO|808 TOM/, 'tomlo'], [/HIGH TOM|CONGA HI/, 'tomhi'], [/TAMB|COWBELL/, 'tamb'], [/RIDE/, 'ride'], [/CRASH|IMPACT/, 'crash']];
  const padCat = name => { for (const [re, c] of PADCAT) if (re.test(name)) return c; return null; };
  const CAT_FALLBACK = { kick2: 'kick', snare2: 'snare', clap: 'snare', snare: 'clap', rim: 'shaker', shaker: 'hat', tomhi: 'tomlo', tomlo: 'tomhi', tamb: 'shaker', ride: 'ohat', crash: 'ohat' };
  const padMaps = {};
  function padIn(from, to, i) {
    if (from === to) return i;
    const key = from + '>' + to;
    if (!padMaps[key]) {
      const K = (window.ORBIT_SOUNDS || { kits: {} }).kits, a = K[from] || [], b = K[to] || [], find = c => b.findIndex(p => padCat(p.name) === c);
      padMaps[key] = a.map(p => { const c = padCat(p.name); if (!c) return -1; let j = find(c); if (j < 0 && CAT_FALLBACK[c]) j = find(CAT_FALLBACK[c]); return j; });
    }
    const j = padMaps[key][i]; return j === undefined ? -1 : j;
  }
  const kitOf = S => (M.song && M.song.kit) || S.kit;
  const LANE_CAT = { kick: 0, kick2: 0, snare: 1, snare2: 1, clap: 1, rim: 1, hat: 2, ohat: 2, shaker: 2, tamb: 2, ride: 2 };
  function beatEvents(X, step) { // beat-pad pattern events that fall on this sixteenth of the bar
    const B = M.song && M.song.beat, P = B && B.patterns[X.src]; if (!P) return [];
    const s = (X.pos % P.bars) * 16 + step;
    return P.events.filter(e => Math.floor(e.step + 1e-6) === s);
  }
  function beatChart(X, step, rule) {
    const B = M.song.beat, names = ((window.ORBIT_SOUNDS || { kits: {} }).kits[B.kit] || []), out = [];
    if (rule.lvl === 0 && step % 2) return out;
    for (const e of beatEvents(X, step)) {
      if (e.step % 1 > 0.01) continue; // off-grid hits (note repeat) are heard, not charted
      const c = names[e.pad] ? padCat(names[e.pad].name) : null, lane = c in LANE_CAT ? LANE_CAT[c] : names.length ? 3 : e.pad % 4;
      if (!out.some(x => x.lane === lane)) out.push({ el: ['kick', 'snare', 'hat', 'fx'][lane], lane, hit: [step, e.velocity, 0, e.pad], beat: e });
    }
    if (rule.single && out.length > 1) { out.sort((a, b) => PRIORITY.indexOf(a.el) - PRIORITY.indexOf(b.el)); return [out[0]]; }
    return out;
  }

  const M = (O.music = {
    STYLES, resolve, chartAt, sectionOf, SOUNDS, song: null,
    playing: false, mode: null, style: 'boombap', bpm: 88, origin: 0, k: 0, endAt: Infinity,
    guideLevel: 0, chartRule: null, timer: 0, session: null, onStep: null, form: null, roll: null
  });
  M.list = () => Object.keys(STYLES).map(id => ({ id, label: STYLES[id].label }));
  M.unit = () => 60 / M.bpm / 4;
  M.barLen = () => 60 / M.bpm * 4;
  M.nextBarTime = function (after) { const bar = M.barLen(); return M.origin + Math.max(0, Math.ceil((after - M.origin) / bar - 1e-6)) * bar; };
  M.assetsFor = function (id, song) {
    const S = STYLES[resolve(id)], A = O.assets;
    let p = A.kitPaths((song && song.kit) || S.kit);
    S.inst.forEach(n => { p = p.concat(A.instPaths(CLEAN[n] || n)); });
    if (song) { Object.values(song.swaps || {}).forEach(n => { if (n) p = p.concat(A.instPaths(n)); }); if (song.beat) p = p.concat(A.kitPaths(song.beat.kit)); }
    if (S.bed) p.push(A.fxPath(S.bed));
    p.push(A.fxPath('riser'), A.fxPath('impact'));
    return p.filter(Boolean);
  };
  // Sound for a rhythm-game lane in the current style (so player hits match the song's kit).
  M.laneSound = function (id, lane, song) { const S = STYLES[resolve(id)], el = ['kick', 'snare', 'hat', 'fx'][lane], kit = (song && song.kit) || S.kit, j = padIn(S.kit, kit, S.pads[el]); return { kit, pad: j < 0 ? S.pads[el] : j }; };

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
  M.chartSet = function (id, bpm, leadIn, bars, diff, stage, song) {
    const S = STYLES[resolve(id)], unit = 60 / bpm / 4, beat = 60 / bpm, lvl = { easy: 0, normal: 1, expert: 2 }[diff] || 0;
    const rule = { lvl, single: diff !== 'expert', stage }, form = buildForm(bars), was = M.song;
    bars = form.length; M.song = song || null;
    let notes = [];
    for (let k = 0; k < bars * 16; k++) {
      const t = leadIn + k * unit + (k % 2 ? S.swing * unit : 0), bar = Math.floor(k / 16);
      for (const c of chartAt(S, form[bar], k % 16, rule)) {
        if (c.beat) { notes.push({ t, lane: c.lane, kit: song.beat.kit, pad: c.hit[3], done: false, bar }); continue; }
        const raw = c.hit[3] !== undefined ? c.hit[3] : S.pads[c.el], j = padIn(S.kit, kitOf(S), raw);
        notes.push({ t, lane: c.lane, pad: j < 0 ? raw : j, done: false, bar });
      }
    }
    M.song = was;
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
    // tempo-synced echo (dotted eighth) for vocal chops and stabs
    s.echo = c.createGain(); s.echoOut = c.createGain();
    const dl = c.createDelay(1.5), fb = c.createGain(), tone = c.createBiquadFilter(), hpf = c.createBiquadFilter();
    dl.delayTime.value = Math.min(1.4, 60 / M.bpm * 0.75); fb.gain.value = 0.38; tone.type = 'lowpass'; tone.frequency.value = 6000; hpf.type = 'highpass'; hpf.frequency.value = 350;
    s.echo.connect(dl); dl.connect(hpf); hpf.connect(tone); tone.connect(fb); fb.connect(dl); tone.connect(s.echoOut); s.echoOut.connect(s.melody);
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
    setTimeout(() => { for (const k of ['melody', 'bass', 'drums', 'dipM', 'dipB', 'echoOut']) { try { s[k].disconnect(); } catch (e) {} } }, 150);
  }
  function startBed(c, s, t) {
    const S = STYLES[M.style];
    if (s.bed) { try { s.bed.src.stop(t); } catch (e) {} s.bed = null; }
    if (S.bed) s.bed = Synth.oneShot(c, s.melody, O.assets.fxPath(S.bed), t, 0.55, true);
  }

  function helpers(c, L, beat, X) {
    const S = STYLES[M.style];
    return {
      // o: { attack, release, pan, send (reverb), echo, detune (cents), glide: { to (semitones), at, time (s) }, wide }
      n(layer, inst, midi, t, beats, vel, o) {
        if ((layer === 'bass' && !X.bass) || (layer === 'melody' && X.mel === false)) return;
        o = o || {};
        if ((X.sec === 'intro' || X.sec === 'mixin') && (ROLE[inst] === 'vocal' || inst === 'brass')) return; // intros are instrumental: no vocal chops, no horns
        const U = M.song, role = layer === 'bass' ? 'bass' : ROLE[inst] || 'keys';
        // Tracks open clean: no hook line and no stabs until the verse.
        if ((X.sec === 'intro' || X.sec === 'mixin') && (role === 'vocal' || inst === 'brass')) return;
        if (U && U.mutes && U.mutes[role]) return;
        // Owner feedback (v4): the synthesized voices and brass sounded like cartoon horns. Songs now play those
        // lines on ordinary instruments unless a song-builder song picks a voice on purpose.
        if (U && U.swaps && U.swaps[role]) inst = U.swaps[role]; else if (CLEAN[inst]) inst = CLEAN[inst];
        if (U) midi += U.key || 0;
        Synth.inst(c, L[layer], inst, midi, t, { dur: beats * beat, vel, attack: o.attack, release: o.release, pan: o.pan, detune: o.detune, glide: o.glide,
          send: o.send === undefined ? (layer === 'melody' ? 0.15 : 0) : o.send, sendDest: L.rev, send2: o.echo, send2Dest: L.echo });
      },
      // chord; wide plays every note twice, detuned and panned apart
      c(layer, inst, notes, t, beats, vel, o) {
        o = o || {}; const v = vel / Math.sqrt(notes.length / 2);
        for (const m of notes) {
          if (o.wide) { this.n(layer, inst, m, t, beats, v * 0.75, Object.assign({}, o, { pan: -0.6, detune: -7 })); this.n(layer, inst, m, t, beats, v * 0.75, Object.assign({}, o, { pan: 0.6, detune: 7 })); }
          else this.n(layer, inst, m, t, beats, v, o);
        }
      },
      // extra drum hit outside the 16th grid (rolls, ghost notes)
      d(pad, t, vel, o) { vel *= TOPS_LEVEL; if (M.mode === 'bare' || (X.src || 'style') !== 'style' || (M.song && M.song.mutes && M.song.mutes.drums)) return; const j = padIn(S.kit, kitOf(S), pad); if (j >= 0) Synth.kit(c, L.drums, kitOf(S), j, t, Object.assign({ vel }, o)); },
      pump(t, melody, bass) { if (L.duckable) duck(L, t, melody, bass, beat); },
      // stretch (seconds): play the sample slower or faster so it lasts that long
      fx(name, t, vel, stretch) { const v = Synth.oneShot(c, L.melody, O.assets.fxPath(name), t, vel); if (v && stretch) v.src.playbackRate.value = O.clamp(v.src.buffer.duration / stretch, 0.35, 2); }
    };
  }

  const TOPS_LEVEL = 0.7; // hats, shakers and other tops sit about 6 dB lower than written (owner feedback: too piercing)
  function scheduleStep(c, L, k, t) {
    if (M.audio) { if (M.onStep) M.onStep(k, t); return; }
    if (M.roll && k >= M.roll.k0 + M.roll.len) k = M.roll.k0 + (k - M.roll.k0) % M.roll.len; // loop roll replays earlier steps
    const S = STYLES[M.style], beat = 60 / M.bpm, step = ((k % 16) + 16) % 16, X = barInfo(M.form, Math.floor(k / 16));
    const spec = S.drums[X.dk] || {}, H = helpers(c, L, beat, X);
    const chartedNow = M.chartRule ? chartAt(S, X, step, M.chartRule) : [], charted = chartedNow.map(x => x.hit);
    const U = M.song, noDrums = M.mode === 'bare' || (U && U.mutes && U.mutes.drums), kit = kitOf(S);
    if (!noDrums && X.src && X.src !== 'style' && X.src !== 'none') { // drums from a beat-pad pattern saved with the song
      const unit = beat / 4, mine = chartedNow.map(x => x.beat);
      for (const e of beatEvents(X, step)) {
        const v = e.velocity * (mine.includes(e) ? M.guideLevel : 1);
        if (v > 0.02) Synth.kit(c, L.drums, U.beat.kit, e.pad, t + (e.step % 1) * unit, { vel: v, tune: e.tune || 0 });
        if (S.duck && L.duckable && e.pad === 0) duck(L, t, S.duck, S.duckBass === undefined ? S.duck : S.duckBass, beat);
      }
    }
    for (const el of (noDrums || (X.src || 'style') !== 'style' ? [] : ELEMENTS)) {
      for (const h of spec[el] || []) {
        if (h[0] !== step || (h[4] === 'first' && !X.first)) continue;
        let v = h[1] * (el === 'hat' || el === 'ohat' || el === 'perc' ? TOPS_LEVEL : 1);
        if (charted.includes(h)) v *= M.guideLevel;
        if (el === 'kick' && S.duck && L.duckable) { const w = h[1] > 0.7 ? 1 : 0.6; duck(L, t, S.duck * w, (S.duckBass === undefined ? S.duck : S.duckBass) * w, beat); }
        const pad = padIn(S.kit, kit, h[3] !== undefined ? h[3] : S.pads[el]);
        if (v > 0.02 && pad >= 0) Synth.kit(c, L.drums, kit, pad, t, { vel: v, pan: el === 'perc' ? ((step % 4) - 1.5) * 0.15 : el === 'hat' ? 0.12 : 0 });
      }
    }
    if (M.click && step % 4 === 0) Synth.kit(c, L.drums, S.kit, S.pads.count, t, { vel: step === 0 ? 0.7 : 0.45 }); // tutorial metronome
    if (M.form && step === 0 && M.mode !== 'bare') { // transitions between sections
      if (X.first && (X.sec === 'drop' || X.sec === 'drop2')) H.fx('impact', t, 0.5);
      if (X.dk === 'R1') H.fx('riser', t, 0.5, 8 * beat);
      if (X.dk === 'R2' && X.sec === 'break') H.fx('riser', t, 0.5, 4 * beat);
    }
    S.play(c, L, X.hb, step, t, beat, H, X);
    if (M.onStep) M.onStep(k, t);
  }
  // Sidechain-style pump: dip the music layers on each kick (house / garage / dark).
  function duck(L, t, melody, bass, beat) {
    const rel = Math.min(0.3, beat * 0.5);
    for (const [k, depth] of [['melody', melody], ['bass', bass]]) {
      if (!depth) continue;
      const g = L[k].gain, v = L.base[k];
      g.setValueAtTime(v * (1 - depth), t); g.setValueAtTime(v * (1 - depth), t + 0.025); g.linearRampToValueAtTime(v, t + 0.025 + rel);
    }
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

  /* opts: { style, bpm, origin, mode: 'set'|'jam'|'demo'|'bare', guide (0-1), chartRule, countIn, endAt, click, form, song } */
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
    M.song = opts.song || null;
    M.audio = opts.audio || null; // imported audio: play the file instead of a synthesized song
    M.roll = null;
    M.origin = opts.origin !== undefined ? opts.origin : c.currentTime + 0.12;
    M.session = openSession(c, E.nodes);
    M.session.duckable = true;
    const unit = M.unit();
    M.k = Math.max(0, Math.ceil((c.currentTime + 0.02 - M.origin) / unit));
    const S = STYLES[M.style];
    if (opts.countIn) {
      const beat = 60 / M.bpm;
      for (let i = 0; i < 4; i++) { const t = M.origin - (4 - i) * beat; if (t >= c.currentTime) Synth.kit(c, M.session.drums, S.kit, S.pads.count, t, { vel: i === 0 ? 0.6 : 0.45, tune: -5 }); } // a soft, low count-in tick
    }
    if (M.audio) { // beat 1 of the file lands on M.origin
      const src = c.createBufferSource(), g = c.createGain(), at = M.origin - M.audio.first, t = Math.max(c.currentTime + 0.02, at);
      src.buffer = M.audio.buffer; g.gain.value = 1.6; src.connect(g); g.connect(M.session.melody);
      src.start(t, Math.max(0, t - at)); if (M.endAt < Infinity) { g.gain.setValueAtTime(1.6, M.endAt + 0.6); g.gain.linearRampToValueAtTime(0, M.endAt + 2); src.stop(M.endAt + 2.1); }
      M.session.bed = { src };
    } else startBed(c, M.session, Math.max(c.currentTime + 0.01, M.origin));
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
    M.playing = false; M.mode = null; M.chartRule = null; M.click = false; M.roll = null; M.audio = null;
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
    const saved = { style: M.style, bpm: M.bpm, guideLevel: M.guideLevel, mode: M.mode, chartRule: M.chartRule, form: M.form, roll: M.roll, song: M.song };
    M.song = opts.song || null;
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
