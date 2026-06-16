# 😈 Devil's Lie

A troll platformer in the spirit of *Level Devil*. The level **looks** normal —
then the floor vanishes, spikes spring up, blades drop, and the door you sprint
toward kills you. Every trap is **fair**: there's always a safe path if you're
smarter (and faster) than the level expects. Death is instant. Respawn is instant.
Rage, then laugh.

**[▶ Play it](https://trpper11.github.io/devils-lie/)** &nbsp;•&nbsp; 20 levels &nbsp;•&nbsp; 5 themed worlds &nbsp;•&nbsp; 10 kinds of lie &nbsp;•&nbsp; global leaderboard 🏆

Play as a living red **balloon** — eyes, little feet, squash & stretch, and it
bursts into shreds when a spike pops it. Works on desktop (full-screen) and
phones (landscape + touch controls). Your name + country flag go on a global
leaderboard ranked by fewest deaths.

## Controls
- **← → / A D** — move
- **SPACE / ↑ / W** — jump (hold for higher; **tap twice = big jump**)
- **R** — restart the level
- **⛶** — fullscreen &nbsp;•&nbsp; on phones: on-screen ◀ ▶ + JUMP buttons

## The lies
| Looks like | Actually |
|---|---|
| Solid floor | **Fake floor** — drops you the instant you touch it |
| Flat ground | **Popup spikes** — spring up as you get close |
| Empty ceiling | **Guillotines** on a rhythm — time your run |
| A wall | **Crusher** that slams the floor |
| The exit door | **Fake exit** — kills you. The real one is elsewhere. |
| A platform | **Fall-through** — you drop right past it |

## 20 levels across 5 themed worlds
The scenery changes every 4 levels and the lies get meaner:
1. **Hellpit** (1-4) — the basics betray you.
2. **Frostbite** (5-8) — pits, rhythm, the wrong door.
3. **Overgrowth** (9-12) — **the scenery lies**: rocks that look like obstacles but are air, "pits" that are actually solid floor.
4. **The Machine** (13-16) — **reversed controls** and a **runaway exit** that bolts when you get close.
5. **The Void** (17-20) — everything at once, faster, meaner. Good luck.

### The lies
Fake floors • popup spikes • guillotines • crushers • fake exits • fall-through platforms • **decoy scenery** • **phantom (solid) gaps** • **reversed controls** • **a teleporting exit**.

## Tech
Pure vanilla JS + Canvas. No assets, no dependencies, no build step — one
`index.html`, one `style.css`, one `game.js`. Fixed-timestep physics (120 Hz),
coyote-time + jump-buffer for tight controls, WebAudio blips for sound.

Every level was verified **solvable** and every trap verified **fair /
uncheeseable** by headless physics simulation.

## Run locally
```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

---
*Built for fun. All names and mechanics are original — no third-party IP.*
