# 😈 Devil's Lie

A troll platformer in the spirit of *Level Devil*. The level **looks** normal —
then the floor vanishes, lava bubbles up, ice shards drop, and the door you sprint
toward kills you. Every trap is **fair**: there's always a safe path if you're
smarter (and faster) than the level expects. Death is instant. Respawn is instant.
Rage, then laugh.

**[▶ Play it](https://trpper11.github.io/devils-lie/)** &nbsp;•&nbsp; 50 levels &nbsp;•&nbsp; 10 themed worlds &nbsp;•&nbsp; 14 kinds of lie &nbsp;•&nbsp; global leaderboard 🏆

Play as a **grumpy little red fellow** — angry brows, a handlebar moustache and
tiny shoes — who bursts into shreds (or embers, in lava) when a trap gets him. Works on desktop
(full-screen) and phones (landscape + translucent touch controls). Your name +
country flag go on the leaderboard the moment you start — finishers rank
first (fewest deaths, then time), everyone else by how far they got.
*(The board is local during development; a global backend gets wired at launch.)*

## Controls
- **← → / A D** — move
- **W / ↑ / SPACE** — jump (hold for higher; **press again in mid-air = double jump**)
- **R** — restart the level
- **⛶** — fullscreen &nbsp;•&nbsp; **⚙** settings &nbsp;•&nbsp; **🔊** music on/off (top-right)
- On-screen ◀ ▶ + JUMP buttons (auto on phones; mouse users can enable them in **Settings**, with an adjustable transparency slider)

You must **enter a name** before you can play (it's how you get on the board).
Soft, playful background music plays by default — toggle it any time with the 🔊 button.

## The lies
| Looks like | Actually |
|---|---|
| Solid floor | **Fake floor** — drops you the instant you touch it |
| Flat ground | **Popup spikes** — spring up as you get close |
| Empty ceiling | **Falling shards** — a piece forms, then drops & shatters on a rhythm (themed: icicles, blades, sawblades, crystals, thorns). Watch the floor-target |
| A block on chains | **Crusher** that slams down from above — never under it |
| The whole level | Sometimes **multi-story** — drop through a hole into a **basement** to find the real exit |
| A wall | **Crusher** that slams the floor |
| The exit door | **Fake exit** — kills you. The real one is elsewhere. |
| A platform | **Fall-through** — you drop right past it |
| Scenery spikes/rocks | **Decoy** — harmless air; walk right through |
| A bottomless pit | **Phantom floor** — solid; walk across the "gap" |
| A pool of lava | **Real lava** — burns you. *Or* **fake lava** — safe solid floor. Identical on sight. |
| Your own controls | **Reversed** in marked zones (left = right) |
| The exit | **Runaway door** — bolts to a new spot the moment you get close 🏃 |
| A door on the floor | Sometimes a **decoy** — the *real* exit is on a ledge above; ride a **bounce pad** up to it |

## 50 levels across 10 themed worlds
The scenery changes every 5 levels and the lies get meaner:
1. **Hellpit** (1-5) — the basics betray you.
2. **Frostbite** (6-10) — pits, ice-shard rhythm, the wrong door, first lava.
3. **Overgrowth** (11-15) — the *scenery* lies: decoy rocks, phantom gaps, fake lava.
4. **The Machine** (16-20) — reversed controls and a runaway exit.
5. **The Void** (21-25) — everything at once, faster.
6. **Inferno** (26-30) — lava everywhere; tell the deadly pools from the safe ones.
7. **The Abyss** (31-35) — crystal shards, phantom gaps, runaway doors in the dark.
8. **Boneyard** (36-40) — dense spikes, jaws of crushers, reversed marrow.
9. **Voltage** (41-45) — sawblades on wires, short-circuited controls.
10. **Nightmare** (46-50) — every lie, reversed, on fire, running away. Good luck.

## Tech
Pure vanilla JS + Canvas. No assets, no dependencies, no build step — one
`index.html`, one `style.css`, `levels.js` (all 50 levels + themes), `leaderboard.js`,
`game.js`. Fixed-timestep physics (120 Hz) with **render interpolation** for smooth
motion on any refresh rate, coyote-time + jump-buffer + mid-air double jump for tight
controls, WebAudio for sound + procedural music, parallax backgrounds cached per level.

Levels and themes live in `levels.js` as a single source of truth, shared by the
game **and** a headless physics verifier.

### Verified solvable
Every level was proven **beatable with normal jumps** by an A\* search running a
frame-exact replica of the game's physics. The winning input sequences were then
**replayed against the real engine in a headless browser** and confirmed to reach
the exit — so the simulator can't be lying either. Boot is clean (zero JS errors)
through all 50 levels on phone, tablet, and desktop.

## Run locally
```bash
python3 -m http.server 8080
# then open http://localhost:8080
# localhost-only QA: append ?lvl=N (1–50) to jump to a level
```

---
*Built for fun. All names and mechanics are original — no third-party IP.*
