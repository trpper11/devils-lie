# 😈 Devil's Lie

A troll platformer in the spirit of *Level Devil*. The level **looks** normal —
then the floor vanishes, spikes spring up, blades drop, and the door you sprint
toward kills you. Every trap is **fair**: there's always a safe path if you're
smarter (and faster) than the level expects. Death is instant. Respawn is instant.
Rage, then laugh.

**[▶ Play it](#)** &nbsp;•&nbsp; 4 hand-built levels &nbsp;•&nbsp; ~6 kinds of lie.

## Controls
- **← → / A D** — move
- **SPACE / ↑ / W** — jump (hold for higher)
- **R** — restart the level

## The lies
| Looks like | Actually |
|---|---|
| Solid floor | **Fake floor** — drops you the instant you touch it |
| Flat ground | **Popup spikes** — spring up as you get close |
| Empty ceiling | **Guillotines** on a rhythm — time your run |
| A wall | **Crusher** that slams the floor |
| The exit door | **Fake exit** — kills you. The real one is elsewhere. |
| A platform | **Fall-through** — you drop right past it |

## Levels
1. **Just walk to the door** — it's never that easy.
2. **Trust the floor** — don't take the obvious bridge.
3. **Look up. Look out.** — rhythm + the wrong door.
4. **The Gauntlet** — everything you learned, at once.

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
