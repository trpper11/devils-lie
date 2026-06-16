# Devil's Lie — Requests Tracker

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
