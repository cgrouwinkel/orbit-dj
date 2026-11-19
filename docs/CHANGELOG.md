# ORBIT DJ — Changelog

## v3.1.0 — 2026-11-19 (new sound library and seven rewritten songs)

### Why
Feedback on v3.0: the music sounded like muffled elevator music. Measurement agreed: the v2/v3.0 library was generated at 32 kHz with most instruments stored at 22 kHz behind low-pass filters, so mixes had about 1% of their energy above 4 kHz and 0.3% above 8 kHz (centroid around 330 Hz on the house track). The parts were also polite: jazz-style chords and soft pads in every genre.

### Sound library (all regenerated, all still synthesized in code, no samples from records)
- Generated at 44.1 kHz; bright instruments stored at 44.1 kHz.
- **Drums:** punchier kicks with beater knock and click, layered snares and claps with short rooms; the dusty kit goes through a 26 kHz / 12-bit early-sampler stage for crunch instead of being filtered dark.
- **Basses:** tech-house pluck bass, bouncy FM "donk", reese, distorted 808 with glides, four dubstep growls (vowel "yoi", wobble, screech, tearing comb) with multiband upward compression.
- **Keys and synths:** brighter additive piano, FM electric piano, vibes, supersaw, pluck, strings, brass section, bells, flute, choir.
- **Vocals:** formant-synthesized sung syllables ("ah", "oh", "ee", "yeah", "hey", "oo") for vocal chops, with formant tuning so high notes keep their body, plus "chipmunk" versions (formants raised, fast vibrato) for sped-up-soul chops. No real singers, no recordings.

### Songs (seven, each original, written in the production language of a genre)
- **Tech house** (Neon Pressure): rolling offbeat bass riff, tops, pitched vocal hook, vocal chops that speed up through the build.
- **Bass house** (Glass Horizon): bouncy donk bassline, chipmunk vocal chops, piano stabs.
- **UK garage** (Two-Step Tonic): 2-step drums, pumping piano chords, chopped vocal phrase, sub and reese.
- **Dubstep** (Final Frequency): melodic intro and build, then a half-time growl-bass call and response with a triplet run.
- **Trap** (Night Shift): gliding 808s, hi-hat rolls, dark bell motif with choir, flute and brass.
- **Dusty boom bap** (The First Groove): a jazzy "sample" of electric piano, vibes and flute chopped like a loop over swung, crunchy drums and upright bass.
- **Chipmunk soul** (Basement Bounce): pitched-up vocal chops, piano, strings and horns over hard drums.
- Mixing: tempo-synced echo bus for chops, high-passed reverb return, sidechain pumping on the four-on-the-floor styles, songs level-matched.

### Game changes
- Venues: Bedroom DJ = boom bap (88), House Party = chipmunk soul (100), Underground Club = tech house (126), Main Stage = dubstep (140). The style menu lists all seven.
- Mix tab: seven tracks (added Night Shift, trap at 140), mastered to about −13 dBFS RMS, 160 kbps. A fifth gig, **After Hours** (dubstep into trap). The deck sampler's ZAP pad is now GROWL. Only the two lesson tracks are fetched ahead of time.
- QA adds "not dull" (at least 3% of energy above 4 kHz and 1.5% above 8 kHz) and "not boomy" checks.

### Results (measured on the rendered deck tracks)
| | v3.0 | v3.1 |
|---|---|---|
| Energy above 8 kHz (house track) | 0.29% | 2.5% |
| Spectral centroid (house track) | 331 Hz | 660 Hz |
| Energy above 4 kHz (all seven tracks) | 1–6% | 4.7–9.4% |

### Not yet verified
- Nobody has listened to these songs yet. Measurements say they are no longer dull; whether they are good is the owner's call.
- Synthesized vocals are syllables, not words, and still sound synthetic up close.
- Still no iPhone or Safari testing.

## v3.0.0 — 2026-11-18 (two-deck controller, DJ school, beat trainer, rearranged songs)

### New: Mix tab — a full two-deck DJ controller
- **Two decks** playing six original tracks (about two minutes each), with scrolling waveforms, beat / bar / 8-bar phrase marks and a live "beats in time / B is 40 ms late" readout.
- **Per deck:** PLAY, CUE (CDJ behaviour: set, return, hold to preview), jog wheel (nudge while playing, scrub when stopped), nudge + / − buttons, tempo fader (±10%, no key lock, so pitch follows tempo like vinyl), SYNC (tempo and beat lock, quantized start), LOOP with ½ and ×2, BPM and bar-of-phrase readouts, time remaining.
- **Performance pads** (8 per deck, 5 modes): HOT CUE (set, jump, delete), LOOP (¼ to 32 beats), ROLL (loop roll with slip), JUMP (beat jump ±1 to ±16), SAMPLER (8 one-shots).
- **Mixer:** GAIN, 3-band EQ with full kills, bipolar FILTER (low-pass left, high-pass right), channel faders with meters, crossfader, master, FX unit (echo at ½ / 1 / 2 beats, reverb, flanger) with a send per deck, headphone cue buttons and **SPLIT** cue (cued deck in the left ear, mix in the right; needs headphones).
- Knobs and faders are custom touch controls: drag from anywhere on the control, double-tap to reset.

### New: DJ school (Mix tab → LESSONS + GIGS)
- **14 controller lessons**, one per control: play + cue, gain + channel fader, crossfader, tempo fader, jog + nudge, SYNC, EQ + bass swap, filter, loops, hot cues, roll / jump / sampler, FX echo out, headphone cue, and a guided first transition. Every step checks the real deck and mixer state, so it only passes when you make the move.
- **4 gigs** (scored transitions out of 100): beatmatch 35%, phrasing 20%, bass swap 20%, levels 10%, finish 15%. Two allow SYNC; two are tempo-fader-and-jog only. Results list what to fix.

### New: beat trainer (Beats tab → TRAIN)
- **7 beat-making lessons:** four on the floor, backbeat + hats, finger drumming (hits judged against the beat), recording a take, note repeat + swing, a 16 Levels bassline, and arranging with patterns A–D.

### Songs
- Every song now has an arrangement instead of an 8-bar loop: intro, verse, build with a snare roll and riser, drop, breakdown and a second drop with an extra lead.
- Four new sampled instruments (piano, nylon guitar, strings, synth lead) and new parts: guitar and piano intros, breakdown riffs, string lines, lead hooks on the last drop.
- Deck tracks add a drums-only mix-in and mix-out so two tracks can be blended, and keep 8-bar phrasing throughout.
- Rhythm sets follow the arrangement: hold notes sit in builds and breakdowns, the snare roll is charted.

### Other
- Career page links to the DJ school and beat trainer and shows progress. "Reset career" also clears lesson ticks and gig scores.
- Site size is now about 17 MB (11.6 MB of that is the six deck tracks, loaded only when you open the Mix tab).

### Not yet verified
- **No iPhone or Safari testing.** Things most likely to need work on a real phone: memory with two two-minute tracks decoded (roughly 50 MB each), jog-wheel feel, knob size on small screens, and split cue routing.
- The songs have been measured (levels, structure) but not listened to by a person. Whether they now sound good enough is the owner's call.
- Portrait works but scrolls; the Mix tab is designed for landscape.

## v2.2.0 — 2026-11-18 (first-run tutorial + band-game gameplay)

### New: hands-on tutorial on first open
- New players land on a welcome card straight away; one tap starts five short drills over a metronome: **kick**, **snare**, **full beat**, **hold notes**, **HYPE**.
- Each drill has a small goal (for example "4 kicks"). If you don't reach it, the drill simply repeats; nothing fails and nothing is saved to your career.
- A coach strip at the top of the highway shows the step, the instruction and your progress, with a **SKIP** button.
- Ends on a short recap (crowd meter, multiplier, HYPE) and **PLAY YOUR FIRST SET** (Bedroom DJ, Rookie).
- Replay any time from **Setup → Replay tutorial**. Existing players see it once after updating.
- The first tap is required: phones do not allow a web page to start sound without one.

### New: band-game mechanics
- **Hold notes.** Notes with a tail: tap and keep holding. They pay out while held and play a riser build-up. Letting go early stops the payout but never breaks your streak.
- **HYPE.** Runs of glowing notes charge the HYPE meter (25% per run). At 50% or more, tap the round HYPE button (or press H) for double points until the meter drains (a full meter lasts 8 bars).
- **Crowd meter.** Hits fill it, misses and off-beat taps drain it. On Club and Headliner an empty meter ends the set ("the crowd walked out") and nothing is saved. Rookie never fails.
- **Miss feedback.** A missed note plays a short record scratch and the melody and bass dip for a moment.
- **Full-length sets.** Songs now run about a minute (24 or 32 bars, 55–65 s) instead of 24 s, and end on a finale hit with an impact and a crowd cheer that is louder the better you played.
- **Streak and multiplier callouts**, a multiplier dial and the crowd meter drawn beside the lanes.
- Results add best streak, holds completed and HYPE uses.

### Highway restyle
- Round note gems with a raised cap, ring targets on the hit line, sustain tails, flame bursts on hits (a held note keeps burning), gold glow on HYPE notes and on the whole highway while HYPE is active.
- All artwork is drawn in code for ORBIT; nothing is taken from other games.

### Unchanged on purpose
- Points per note (150 / 100 / 65 × multiplier up to ×4), timing windows, star thresholds, the 1000-point combined grade and all saved-progress keys.
- Because sets are longer, new scores will be higher than v2.1 personal bests.

### Sounds
- Two new original fx: `miss.wav` (scratch) and `crowd.wav` (synthesized cheer). Library is now 78 files; existing files are byte-identical.

### Not yet verified
- No iPhone or Safari testing has been done on this version. Hold notes (long press on the lane or pad) and the HYPE button are the things to check first on a real phone.

## v2.1.0 — 2026-11-18 (real beat pad + new music engine)

### New: MPC-style beat pad (Beats tab, replaces the 16-pad sampler)
- 4×4 pads laid out like an MPC (pad 1 bottom-left), position velocity (tap higher = louder) or **Full Level**, multitouch, keyboard Z X C V / A S D F / Q W E R / 1 2 3 4.
- **Kits:** Dusty Kit (boom bap), Club Kit (house/garage) and Midnight 808 (dark/trap) are new, plus the three v1 chop banks. Each drum kit has 12 drums plus 4 melodic pads (bass, keys/organ/stab, vox, FX).
- **Step sequencer:** 1- or 2-bar patterns, tap steps to add, tap again to accent, again to clear; playhead on the step strip and on an LCD pattern overview.
- **Live recording:** REC with a one-bar count-in when stopped, overdub while playing, 1/16 snap (hits slightly early land on the beat), and no double-triggering of fresh hits.
- **Tempo** 60–180 BPM (hold +/− to scroll), **swing** 50–75 %, **metronome**.
- **Note repeat** 1/8, 1/16 and 1/32: hold a pad to roll (works stopped or playing, and records).
- **16 Levels:** the selected sound plays chromatically across all 16 pads (−7 to +8 semitones), which turns the 808 or keys into a playable instrument.
- **Mute, solo and erase** modes; per-pad level, tune (±12 st) and decay; closed hat chokes open hat.
- **Patterns A–D**, with switching that waits for the next bar line; copy to the next slot; undo (30 steps); clear.
- **Backing** toggle plays any of the 6 song styles locked to the beat pad's tempo and clock.
- **Bounce WAV:** renders 4 bars (optionally with the backing track) and opens the iOS share sheet (Save to Files) or downloads it.
- **Export/import pattern JSON:** v2 adds bars, swing and tune; v1 sampler patterns still import. Patterns save automatically.

### New: music across the whole app
- **Original sound library, 76 files:** 3 drum kits plus 11 sampled instruments (FM electric piano, sub bass, 808, upright bass, saw bass, synth pluck, drawbar organ, warm pad, FM bell, breathy flute, formant "ah" vox) and fx (vinyl bed, riser, impact). All synthesized from scratch by `tools/make_sounds.py`; no recordings, artist material or third-party samples.
- **Six songs** written as 8-bar forms (sparser A section, fuller B section with the hook, a drum fill): Dusty boom bap, Lo-fi jazz hop (walking upright bass), Deep house, UK garage, Melodic electronic and Dark bass (half-time 808).
- **Mix:** room reverb, bus glue compression, sidechain-style pumping on house, garage, melodic and dark, and per-style layer balance. All styles sit within 1.3 dB of each other with 7–9 dB of peak headroom. Melody is now 1–5 dB under the bass (v2.0: 3–6 dB; first v2 drafts: 13–22 dB).
- **Venues now have their own songs:** Bedroom DJ = boom bap, House Party = jazz hop, Underground Club = deep house, Main Stage = dark bass. The backing menu offers all six.

### Gameplay
- **Notes are charted from the song's real drum parts.** The KICK lane plays the song's kick, SNARE plays its snare or clap, HAT plays its hat, and FX plays crashes and accents. Rookie gets the main hits, Club adds off-beats and syncopation, Headliner gets everything, including two-finger hits.
- Your taps play the song's actual kit sound for that note.
- **Guide drums** (Setup): Auto plays your notes quietly on Rookie and Club and drops them on Headliner, so missed hits leave a gap. Always and Off are also available.
- Changing the backing during a set now applies to the next set, so notes always match the music.
- The CUE preview plays the song's first chord on its lead instrument.

### Unchanged
v1/v2.0 scoring, windows, stars, grades, equipment challenges, saved progress keys, both themes and all mobile-reliability behaviour. The v1 note charts are kept in code as `G.makeNotesV1` for reference.

## v2.0.0 — 2026-11-18 (Arcade, mobile reliability + redesign)

Rebuilt from `ORBIT-Arcade-Final-Prototype.zip` (v1.1 + 16-pad "final lab"). The v1 single file had five layers patched on top of each other (`tap`, `finish` and `updateHeader` each wrapped two or three times), so it was split into six modules and every v1 feature was ported and re-tested. Saved progress from v1 carries over (same localStorage keys).

### Mobile audio reliability
- One AudioContext, created and resumed inside a user gesture; re-unlocks on any later tap if iOS suspends it.
- iPhone silent switch: `navigator.audioSession.type = "playback"` on iOS 17+, silent media-element fallback on older iOS. Toggle in Setup.
- Interruptions (calls, Siri, alarms, app switching): the set auto-pauses and a "Tap to resume" sheet restores audio. If iOS leaves audio stuck, the next tap rebuilds the audio engine (Setup also has "Restart audio engine").
- Leaving the app pauses the set, stops loops and jam, and releases the screen wake lock.
- Lookahead scheduler on the audio clock for all music, guide drums, count-in and sampler loops. Late timers skip steps instead of bursting them.
- **Fixed:** changing backing style mid-set fired several notes up to 1.7 s late at once (measured in v1).
- **Fixed:** after pause/resume, music drifted ~50 ms off the note grid (measured in v1). Now 0 ms.
- Master bus with compressor plus a soft-clip ceiling. Worst-case peak under deliberate pad + sampler spam: −0.9 dBFS (v1 had no master stage).
- Sample loading: bytes prefetched at page load, decoded in parallel once audio unlocks, re-decoded automatically if the engine is rebuilt, and a built-in synth fallback if a WAV can't load.
- Screen wake lock during sets (where supported).

### Timing and scoring
- Judgement uses the audio clock mapped to input event timestamps, corrected for reported output latency plus a user offset.
- New **Tap test** (Setup) measures your personal delay (e.g. AirPods) and sets the offset. Automated test: a simulated 100 ms delay was measured as +119 ms (includes one display frame of test jitter).
- Hit feedback shows EARLY/LATE in milliseconds.
- Count-in now follows the venue tempo (v1 used fixed 0.35 s clicks). At 88 BPM the first note moves from 2.70 s to 2.98 s so a full 4-beat count fits.
- Unchanged from v1: timing windows (190/130/85 ms), PERFECT/GREAT/GOOD thresholds, combo multiplier, star thresholds, 700 + 300 combined grade, note charts.

### Music and gain staging
- Three original arrangements rewritten on a 16th-note grid: dusty boom bap (swing, Rhodes-style 9th chords, sub bass, flute-like hook, vinyl dust), house/garage (offbeat stabs, octave bass, arpeggio), dark electronic (detuned pads, filtered saw bass, bells). Same keys and tempos as v1.
- Melody vs bass rebalanced: hooks now sit 3–6 dB under the bassline (first measurements of the arrangement had them 13–22 dB under). Styles level-matched to within 2.4 dB RMS.
- Drum sounds use filtered noise for snare and hats (v1 used pure tones). Guide drums now pass through the EQ and filter, so the bass-swap lesson is audible on the kick too.
- Independent MUSIC, PADS and SAMPLER levels, saved per device.

### Interface (both themes redesigned)
- One-screen layouts with no page scrolling during play: landscape is a DJ-controller layout (transport | highway + pads | mixer); portrait stacks the same parts.
- Canvas note highway with perspective, scrolling beat and bar lines, lane targets and hit sparks (v1 rebuilt DOM nodes every frame).
- Tap anywhere in a lane, not just the pad. Multitouch on every pad and fader.
- Faders grab anywhere on the track; double-tap EQ or filter to reset.
- Sections: Play, Pads (16-pad sampler), Career, Setup.
- First-run welcome: one tap starts the first groove at Rookie.
- Equipment briefing sheet per control: what it does, before/after sound demo, pro move, common mistakes, challenge, plus live feedback in the mixer. (v1's CUE + PLAY lesson text was never shown; it now is.)
- Results screen: grade, stars, rhythm vs equipment breakdown, PERFECT/GREAT/GOOD/MISS counts, new-best badge.
- Grunge Arcade: noise and scratch textures, concert lighting, condensed italic type, hard offset shadows, screw-head panels. Cyber Aero: glass panels, chrome logo, jelly buttons, grid floor, bubbles. Theme switching never touches audio or progress.
- Reduce-motion setting (also follows the system setting), note-speed setting (visual only), and pads sized at 44 pt or larger.

### Sampler
- Works without starting a set; new **Jam** button plays the backing track for free play.
- Recording lands on the music's next bar line when Jam is playing; quantized hits snap to 16ths, including hits a little early on beat 1.
- Loops lock to the beat; a 16-step pattern strip shows hits and the playhead.
- Export uses the iOS share sheet (Save to Files) where available. Pattern JSON format unchanged from v1. Keys 1–8 still work on the Play screen; the Pads screen maps all 16 (1–4, Q–R, A–F, Z–V).
- Voice limit (24) prevents overload when hammering pads.

### App and deploy
- PWA: manifest, icons, Home Screen support, network-first service worker with a versioned cache (works offline after one visit; an in-app "New version ready" prompt appears for future updates).
- Standalone single-file HTML with samples embedded (works from Files or email; no offline cache).
- `tools/build.py` produces the Netlify ZIP, standalone HTML and source bundle; automated QA lives in `tests/qa.js`.

### Changed on purpose
- The v1 "PAUSE" button is now a contextual START / PAUSE / RESUME button, plus a separate **STOP**.
- The filter fader is logarithmic (200 Hz–20 kHz, fully open at the top); v1 was linear 200–8000 Hz. Challenge thresholds are the same (900 Hz / 7000 Hz).
- Switching to the Pads screen pauses a running set (use Jam for backing there).
