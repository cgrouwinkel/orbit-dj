# ORBIT DJ

**Learn to DJ by playing a game. Become a DJ by mastering the game.**

A free, open-source DJ-learning rhythm game and beat pad for the browser, built for iPhone (Safari / Home Screen app) and also usable on iPad, Android and desktop.

**Play:** https://cgrouwinkel.github.io/orbit-dj/ (in Safari: Share → *Add to Home Screen*, then play in landscape)

## What's in it (v2.1.0)
- **Career:** four venues (Bedroom DJ, House Party, Underground Club, Main Stage), each with its own original song. Notes are charted from the song's real kick, snare and hat parts. Rookie, Club and Headliner difficulties, stars, grades and personal bests.
- **DJ controls, revealed gradually:** pads, cue, play/pause, crossfader, low EQ and filter. Each has a briefing with a before/after sound demo, best practice, common mistakes and a scored challenge.
- **Beat pad (MPC-style):**
  - **Pads and kits:** 16 velocity pads; Dusty, Club and Midnight 808 drum kits plus three chop banks.
  - **Sequencing:** step sequencer, live overdub, swing, note repeat, 16 Levels.
  - **Editing:** mute, solo and erase; patterns A–D.
  - **Output:** synced backing tracks and WAV bounce.
- **Original audio only:** every sound is synthesized from scratch by `tools/make_sounds.py`. No recordings, samples or artist material.
- **Mobile audio reliability:** works with the iPhone silent switch, recovers from calls and app switching, judges timing on the audio clock, has a tap-test latency calibration and works offline as a PWA.

The crossfader currently blends layers of one song; true two-deck mixing is on the roadmap.

## Repo layout
| Path | What |
|---|---|
| `index.html`, `css/`, `js/`, `icons/`, `sounds/`, `samples/`, `sw.js`, `manifest.webmanifest` | The app. Plain files with no build step; this folder is the website. |
| `docs/` | Changelog, QA report, iPhone deploy guide, developer handoff |
| `tools/make_sounds.py` | Regenerates the sound library (`sounds/`, `js/sounds-manifest.js`) |
| `tools/build.py` | Builds a Netlify ZIP, a standalone single-file HTML and a source ZIP into `dist/` |
| `tests/qa.js` | 80 automated checks (Playwright + Chrome) |
| `scriptable/` | Optional iPhone Scriptable launcher |

## Deploy
GitHub Pages serves this repo's `main` branch root, so pushing to `main` updates the live site in about a minute. When releasing, bump `O.VERSION` in `js/util.js` and `VERSION` in `sw.js` together, so phones get the "New version ready" prompt.
