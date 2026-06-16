# Devil's Lie — Requests Tracker

## Round 6 (2026-06-16) — "graphics/animation polish: controls, hitbox, smoothness" — ✅ ALL DONE

1. [x] **Reliable controls + scheme** — rewrote keyboard input: **W / ↑ / Space = jump, A/D = left/right**, R = restart. Movement keys are tracked independently of game-state and **no longer cleared on respawn**, so a held key keeps you moving after dying/changing levels (the "WASD sometimes stop working" bug). Added a window-blur reset (no stuck keys) and made sure typing your name is never hijacked. **Double jump fixed**: the old double-tap "big jump" was effectively unreachable (2nd tap landed after the jump fired) — replaced with a real **mid-air double jump** (press jump again in the air, once per airtime; ~95px vs 59px single, verified).
2. [x] **Accurate hitbox** — hazards (spikes/lava/popups/shards/crushers) now test a **tighter box inset to match the round balloon** (HBX/HBY=3) instead of the full solid-collision box, and **spikes are deadly right up to their tips** (raised the deadly region ~5px) so you pop on *touch* instead of sinking into the needle first. Solid/world collision (PW/PH) unchanged so platforming stays tuned.
3. [x] **Much smoother animation (CRITICAL)** — added **render interpolation**: the player is drawn interpolated between the last two 120 Hz physics ticks (`acc/DT`), decoupling the sim from the display refresh. Eliminates stutter/jitter on any refresh rate (incl. high-Hz screens where some frames did 0 physics steps and the player appeared to freeze). Builds on Round 5's eased character animation.

### Verification — ✅ all passed
- [x] Input cross-tested with **real keyboard events**: D/A move, W/Space jump, double jump clearly higher, hazards kill, **held key resumes after respawn**.
- [x] Hazard/hitbox changes mirrored into the verifier; **all 50 levels re-proven solvable**; 8 solver plans (spike/lava/bounce levels + L50→win) replayed in the REAL engine and won.
- [x] Zero JS errors swept across all 50 levels.

## Round 5 (2026-06-16) — "control options, fix twitch, Stage 2 / new elements, music" — ✅ ALL DONE

1. [x] **Settings panel + control options + transparency** — ⚙ button (top-right). Choose on-screen controls **Auto / On / Off** (mouse users can now turn the buttons on); **transparency slider** for the buttons; buttons restyled from white to dark smoky glass so they don't hide the balloon. Persisted to localStorage.
2. [x] **Character no longer twitches** — `drawPlayer` reworked with eased/smoothed animation: removed the 5 Hz idle wobble, damped squash amplitudes, eyes glide toward facing (no snap), `fear` eases in/out (was a hard jump), feet settle level when idle (was a frozen-asymmetric pose).
3. [x] **Stage 2 + new elements/playground** — act-break interstitials ("STAGE 2 — THE VOID" at L21, "FINAL STAGE — OVERDRIVE" at L41). New **bounce-pad** mechanic (`J`) enabling **vertical/platform levels**: 4 levels reworked into bounce-up-to-elevated-exit playgrounds (Springboard L23, The Ascent L33, Skyhook L43, Vertigo L47) with the floor door as a decoy.
4. [x] **Background music** — soft, playful, fully **procedural** WebAudio loop (pentatonic pad + arpeggio + gentle bass; no assets). 🔊/🔇 toggle top-right; also in Settings; persisted.

### Verification — ✅ all passed
- [x] All 50 levels still proven solvable by the A\* physics solver (incl. the 4 new bounce levels + the new `J` mechanic added to the simulator).
- [x] Bounce mechanic cross-validated: solver plan for Springboard replayed in the REAL engine → cleared, balloon rose ~211px (pad fires identically to the sim).
- [x] Zero JS errors swept across all 50 levels; settings/music/transparency functionally tested + persisted; controls=On reveals buttons for mouse users.

## Round 4 (2026-06-16) — "balloon, 50 levels, lava, shards, leaderboard, name-gate, no bugs" — ✅ ALL DONE

1. [x] **Character** — kept the balloon, removed the trailing/jump/landing "bubble" particles that read as exhaust. Death burst kept (now fiery embers when burned in lava).
2. [x] **Harder levels 6-8** — Frostbite world (Double Cross / Spike Garden / The Big Lie) reworked with multiple pits, timed shards + a crusher, spd 1.12–1.16. Verified solvable.
3. [x] **Falling hazard redesign** — old "arrow/blade" replaced by **themed shards**: icicles (Frostbite/Abyss), stone blades (Hellpit/Inferno/Boneyard), spinning sawblades (Machine/Voltage), thorned vines (Overgrowth), crystals (Void/Nightmare).
4. [x] **New surprises** — **lava** `L` (deadly, animated molten tiles, fiery death + sizzle SFX) and **fake lava** `G` (looks identical, is safe solid floor — the troll). Distributed across worlds 2, 5–10.
5. [x] **50 levels / 10 worlds** — added 5 new worlds (Inferno, Abyss, Boneyard, Voltage, Nightmare) + themes; difficulty ramps spd 1.0→1.78; theme changes every 5 levels. Levels + themes extracted to `levels.js` (single source of truth).
6. [x] **Leaderboard redesign** — "Hall of Survivors": gold/silver/bronze **podium** for the top 3 (stepped, medals, flags) + a styled list for ranks 4+; your row highlighted.
7. [x] **Name required** — PLAY is disabled until a name is entered; clicking it empty shakes the field with a hint.
8. [x] **Bug pass + cross-device** — zero JS errors swept across all 50 levels; boot verified on phone / tablet / desktop viewports.
9. [x] **Touch controls overlap** — buttons made translucent (≈50% until pressed) and tucked into the corners so they no longer hide the balloon / play area (from the reported screenshot).

### Verification — ✅ all passed
- [x] **All 50 levels proven solvable** by an A\* search over a frame-exact physics replica (`/tmp/dltest/sim.js`), normal jumps only.
- [x] **Solver plans replayed in the REAL engine** (headless browser, deterministic `__DLtick` stepping) — 9/9 sampled levels reached the exit incl. L50 → win screen. Confirms the simulator is faithful.
- [x] Zero JS errors during live play across all 50 levels; clean boot on 3 device sizes.
- [x] Name-gate, leaderboard podium, lava/shard/fake-lava rendering all visually confirmed via screenshots.

### Notes
- `levels.js` is shared by the game (`window.LEVELS/THEMES`) and the Node verifier (`module.exports`).
- Localhost-only debug hooks in `game.js` (`window.__DL*`) drive the verifier; inert on the public site.

## Round 3 (2026-06-16) — "20 levels, harder, changing scenery, MORE troll" — ✅ ALL DONE

- [x] **20 levels total**, difficulty steadily increasing (spd ramps 1.0→1.2; more/stacked traps).
- [x] **Unprecedented out-of-the-blue lies (all passable):**
  - `B` decoy — scenery rocks/spikes that LOOK like obstacles to jump but are harmless air (jump = land in a real trap; walk through = safe).
  - `H` phantom gap — looks like a bottomless pit, is actually solid floor (walk right across the void).
  - Reversed-controls zones (left=right) with on-screen ⇄ banner + tint.
  - Runaway exit — the REAL door bolts to a new spot the moment you get close (🏃💨).
- [x] **Scenery keeps changing** — 5 themes (Hellpit→Frostbite→Overgrowth→The Machine→The Void), background shifts every 4 levels + per-level variation (orb position, mountain phase, decor).
- [x] **Scenery illusions** (the headline ask) — `B` (scenery that looks like an obstacle) and `H` (background gap that's solid) deliver both directions of the illusion.
- [x] **MORE troll drama** — sassy eye-roll taunts on every level.

### Verification — ✅ all passed
- [x] All 20 levels proven solvable (headless sim, normal jump only) — incl. reverse-over-pit, reverse+teleport, fast-rhythm stacks
- [x] 3 levels (L6/L16/L20) retuned to comfortable windows (0.96–1.24s, was 0.24–0.30s) and re-verified
- [x] Code review of new systems — fixed: runaway-exit same-frame win guard, NaN-safe trap dp clamp
- [x] All 5 themes render distinctly + new mechanics draw correctly (headless screenshots)
- [x] Zero JS errors on boot through Level 20

### Notes
- localhost-only `?lvl=N` QA jump (inert on public site, so leaderboard stays honest).

## Round 2 (2026-06-16) — "full-fledged awesome game" — ✅ ALL DONE

- [x] **R1. Mobile-friendly + landscape** — responsive DPR-aware scaling; animated "rotate your phone" overlay (CSS phone rotating) shown in portrait on touch devices, pauses the game.
- [x] **R2. High-end graphics (no perf hit)** — parallax moonlit bg (mountains, spike silhouettes, embers, vignette) cached to an offscreen layer; juicy particles, screen shake, hit-stop. PC full-window scaling + ⛶ fullscreen toggle (locks landscape on mobile). All gradients cached (no per-frame allocation).
- [x] **R3. More levels + troll energy + death SFX** — 8 levels (added Double Cross, Rhythm Hell, Spike Garden, The Big Lie); guillotines now actually reach the floor; funny death sting = balloon POP + sad descending trombone.
- [x] **R4. Public leaderboard** — name captured at start, country via ipwho.is, global board on jsonblob (everyone shares it), localStorage fallback. Ranks by fewest deaths then fastest time; flags + your-row highlight. XSS-hardened (public blob).
- [x] **R5. Mobile touch controls** — on-screen ◀ ▶ + JUMP (pointer-events only, no double-fire); double-tap JUMP = big jump.
- [x] **R6. New player character** — living red balloon w/ eyes (look toward motion, widen in fear), little animated feet, shine, squash/stretch + balloon-jump, trail; bursts into shreds + confetti on death/pop. Double-tap SPACE = bigger jump.

### Verification — ✅ all passed
- [x] All 8 levels proven solvable via headless physics sim (normal jump only; tightest jump 120px vs 144px envelope)
- [x] Traps uncheeseable; every timing window ≥1.39s (no trap conflicts)
- [x] Code review pass — fixed: mobile double-fire jump, per-frame gradients, leaderboard XSS, double win-sound, geo cache
- [x] Loads with ZERO JS errors (headless chromium) + live gameplay screenshot confirms rendering
- [x] Pushed to GitHub + Pages

### Notes
- $0/month: procedural canvas graphics, free no-signup services (jsonblob + ipwho.is).
- Leaderboard is publicly writable (no auth) — fine for a fun game; XSS-escaped on render. Could move to Supabase later for bulletproof persistence.
