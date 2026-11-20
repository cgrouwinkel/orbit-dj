# ORBIT DJ

**Learn to DJ by playing a game. Become a DJ by mastering the game.**

A free, open-source DJ-learning rhythm game and beat pad for the browser, built for iPhone (Safari / Home Screen app) and also usable on iPad, Android and desktop.

**Play:** https://cgrouwinkel.github.io/orbit-dj/ (in Safari: Share → *Add to Home Screen*, then hold the phone upright; iPad works both ways)

## What's in it (v4.3.0)
- **Mix tab, a two-deck DJ controller:** jog wheels, tempo faders, SYNC, CUE, loops, hot cues, loop roll, beat jump, sampler pads, 3-band EQ, filter, gain, channel faders, crossfader, FX and headphone split cue, with scrolling waveforms.
- **DJ school:** 14 lessons (one per control) that check what you actually do, plus 4 scored transition gigs.
- **Beat trainer:** 7 beat-making lessons on the beat pad.
- **Career map:** each venue is a chapter of sets, echo battles, beat challenges, mix gigs and a Club Night; stars unlock venues, ranks and highway skins.
- **DJ moves in sets:** scratches, crossfader cuts, bass kills and filter sweeps on the note highway.
- **Studio:** beat pad plus a song builder (tempo, key, sounds, arrangement, your own beat); play your songs in the game, on the decks, or export WAV.
- **Your music:** Quick Play any song at any level; import your own audio (stays on the device) with tempo detection.
- **Seven original songs:** tech house, bass house, UK garage, dubstep, trap, dusty boom bap and chipmunk soul, all synthesized in code at 44.1 kHz (no samples from records).
- **Live-show look (Grunge Arcade):** the room you are playing to is drawn above the highway, from friends on a couch to a festival crowd, and reacts to how the set is going.
- **Rigs:** SIMPLE and PRO Mix layouts; PAD FX (brake, spin, reload, echo out, kills); tempo range ±6 / 10 / 16; VINYL and LO-FI pad effects; a guide to the real gear behind UK garage, grime and rap production.
- **Rhythm game:** self-paced tutorial on first open (pick a song, controller map, five drills that each wait for a tap), round gems on a perspective highway, hold notes, HYPE, crowd meter, minute-long sets.
- **Career:** four venues (Bedroom DJ, House Party, Underground Club, Main Stage), each with its own original song. Notes are charted from the song's real kick, snare and hat parts. Rookie, Club and Headliner difficulties, stars, grades and personal bests.
- **DJ controls, revealed gradually:** pads, cue, play/pause, crossfader, low EQ and filter. Each has a briefing with a before/after sound demo, best practice, common mistakes and a scored challenge.
- **Beat pad (MPC-style):**
  - **Pads and kits:** 16 velocity pads; Dusty, Club and Midnight 808 drum kits plus three chop banks.
  - **Sequencing:** step sequencer, live overdub, swing, note repeat, 16 Levels.
  - **Editing:** mute, solo and erase; patterns A–D.
  - **Output:** synced backing tracks and WAV bounce.
- **Original audio only:** every sound is synthesized from scratch by `tools/make_sounds.py`. No recordings, samples or artist material.
- **Mobile audio reliability:** works with the iPhone silent switch, recovers from calls and app switching, judges timing on the audio clock, has a tap-test latency calibration and works offline as a PWA.

The Play tab's crossfader blends layers of one song; the Mix tab is the real two-deck setup. There is no key lock, track import or recording yet.

## Repo layout
| Path | What |
|---|---|
| `index.html`, `css/`, `js/`, `icons/`, `sounds/`, `samples/`, `sw.js`, `manifest.webmanifest` | The app. Plain files with no build step; this folder is the website. |
| `docs/` | Changelog, QA report, iPhone deploy guide, developer handoff |
| `tools/make_sounds.py` | Regenerates the sound library (`sounds/`, `js/sounds-manifest.js`) |
| `tools/build.py` | Builds a Netlify ZIP, a standalone single-file HTML and a source ZIP into `dist/` |
| `tests/qa.js`, `tests/qa-mix.js` | Automated checks (Playwright + Chrome): rhythm game, audio and beat pad; Mix tab, lessons, gigs and beat trainer |
| `tools/render_tracks.js` | Renders the six deck tracks to `tracks/*.mp3` with the app's own engine (needs ffmpeg) |
| `scriptable/` | Optional iPhone Scriptable launcher |

## Deploy
GitHub Pages serves this repo's `main` branch root, so pushing to `main` updates the live site in about a minute. When releasing, bump `O.VERSION` in `js/util.js` and `VERSION` in `sw.js` together, so phones get the "New version ready" prompt.
