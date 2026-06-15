/* =====================================================================
   DEVIL'S LIE — a troll platformer
   Single-file vanilla JS. No assets, no deps. Runs anywhere.

   The whole joke: the level looks normal, then betrays you.
   Every trap is FAIR — there is always a safe path if you're smart
   (and fast). Death is instant; respawn is instant. Rage, then laugh.
   ===================================================================== */

(() => {
  "use strict";

  // ---- World constants ------------------------------------------------
  const TILE = 40;
  const COLS = 20;
  const ROWS = 12;
  const W = COLS * TILE; // 800
  const H = ROWS * TILE; // 480

  // ---- Physics (px, seconds) -----------------------------------------
  const GRAVITY   = 2400;
  const MOVE      = 250;   // horizontal speed
  const JUMP      = 700;   // jump impulse  -> ~2.5 tiles high, ~3.5 across
  const MAX_FALL  = 900;
  const ACCEL     = 2600;  // ground accel
  const AIR_ACCEL = 1800;
  const FRICTION  = 2200;
  const COYOTE    = 0.10;  // grace after leaving ledge
  const JUMP_BUF  = 0.12;  // grace pressing jump early

  const PW = 24, PH = 30;  // player size (smaller than tile = forgiving)

  // =====================================================================
  // LEVELS  — authored as ascii grids (20 wide x 12 tall, row0 = sky/HUD)
  //   #  solid block         ^  static spike (deadly)
  //   S  player start        E  real exit
  //   F  fake floor (collapses a beat after you stand on it)
  //   P  popup spike (springs up when you get close)
  //   D  guillotine (ceiling spike on a timed rhythm)
  //   X  crusher block (auto up/down)
  //   M  fake exit (looks like the door — kills on touch)
  //   O  fall-through platform (looks solid, you drop right through)
  // =====================================================================
  const LEVELS = [
    {
      name: "Just walk to the door",
      grid: [
        "                    ",
        "                    ",
        "                    ",
        "                    ",
        "                    ",
        "                    ",
        "                    ",
        "                    ",
        "                    ",
        "                    ",
        " S    ^         E   ",
        "#############FF#####",
      ],
      texts: [
        { col: 3,  text: "See? Totally normal. Just walk right →" },
        { col: 11, text: "Almost there! Keep going…" },
      ],
    },
    {
      name: "Trust the floor",
      grid: [
        "                    ",
        "                    ",
        "                    ",
        "                    ",
        "                    ",
        "                    ",
        "                    ",
        "                    ",
        "                    ",
        "      #  #  #       ",
        "  S             P E ",
        "#####FFFFFFFFFF#####",
      ],
      texts: [
        { col: 5,  text: "A nice solid bridge. Cross it →" },
        { col: 13, text: "Ha. Should've taken the high road." },
      ],
    },
    {
      name: "Look up. Look out.",
      grid: [
        "                    ",
        "      D   D   XX    ",
        "                    ",
        "                    ",
        "                    ",
        "                    ",
        "                    ",
        "                    ",
        "                    ",
        "                    ",
        " S              M E ",
        "####################",
      ],
      texts: [
        { col: 2,  text: "Easy corridor. Run to the EXIT →" },
        { col: 14, text: "Door's right there. Go on. Trust me." },
      ],
    },
    {
      name: "The Gauntlet",
      grid: [
        "                    ",
        "              D     ",
        "                    ",
        "                    ",
        "                    ",
        "                    ",
        "                    ",
        "                    ",
        "                    ",
        "                    ",
        " S  OOO P       M E ",
        "####   ###FFF#######",
      ],
      texts: [
        { col: 2,  text: "Last one. Everything you learned. Go." },
        { col: 9,  text: "You remember fake floors, right? …Right?" },
        { col: 15, text: "Pick a door. Choose wisely. 😈" },
      ],
    },
  ];

  // =====================================================================
  // Engine state
  // =====================================================================
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const elLevel  = document.getElementById("hud-level");
  const elDeaths = document.getElementById("hud-deaths");
  const elTime   = document.getElementById("hud-time");
  const titleScreen = document.getElementById("title-screen");
  const winScreen   = document.getElementById("win-screen");
  const winStats    = document.getElementById("win-stats");

  let state = "title"; // title | play | win
  let levelIndex = 0;
  let deaths = 0;
  let runStart = 0;
  let runElapsed = 0;

  let grid;            // array of strings (mutable copy not needed; static read)
  let traps;           // dynamic trap objects
  let collapsed;       // Set of "c,r" fake floors that fell
  let texts;           // troll text triggers
  let textShown;       // Set of shown text indices
  let activeText = null, activeTextT = 0;
  let levelTime = 0;   // resets each respawn (drives rhythms predictably)
  let particles = [];
  let shake = 0;

  const player = {
    x: 0, y: 0, vx: 0, vy: 0,
    onGround: false, coyote: 0, jumpBuf: 0, facing: 1,
    dead: false, deathT: 0, win: false,
  };

  // ---- Input ----------------------------------------------------------
  const keys = { left: false, right: false, jump: false };
  function setKey(e, down) {
    const k = e.key.toLowerCase();
    if (k === "arrowleft" || k === "a") { keys.left = down; e.preventDefault(); }
    else if (k === "arrowright" || k === "d") { keys.right = down; e.preventDefault(); }
    else if (k === "arrowup" || k === "w" || k === " ") {
      if (down && !keys.jump) player.jumpBuf = JUMP_BUF;
      keys.jump = down; e.preventDefault();
    }
    else if (k === "r" && down) { respawn(); }
  }
  window.addEventListener("keydown", (e) => { if (state === "play") setKey(e, true); });
  // keyup is processed always, so a key held when an overlay appears still clears
  window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (k === "arrowleft" || k === "a") keys.left = false;
    else if (k === "arrowright" || k === "d") keys.right = false;
    else if (k === "arrowup" || k === "w" || k === " ") keys.jump = false;
  });

  // ---- Audio (tiny WebAudio blips, $0) --------------------------------
  let actx = null;
  function audio() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } return actx; }
  function beep(freq, dur, type = "square", vol = 0.08, slide = 0) {
    const a = audio(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, a.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), a.currentTime + dur);
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g); g.connect(a.destination);
    o.start(); o.stop(a.currentTime + dur);
  }
  const sndJump  = () => beep(520, 0.12, "square", 0.06, 220);
  const sndDeath = () => { beep(300, 0.18, "sawtooth", 0.12, -220); setTimeout(() => beep(140, 0.22, "sawtooth", 0.10, -80), 70); };
  const sndWin   = () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.16, "triangle", 0.09), i * 110)); };

  // =====================================================================
  // Level loading
  // =====================================================================
  function loadLevel(i) {
    levelIndex = i;
    grid = LEVELS[i].grid;
    texts = LEVELS[i].texts || [];
    collapsed = new Set();
    textShown = new Set();
    activeText = null;
    traps = [];

    // find start + build trap objects
    let start = { c: 1, r: ROWS - 2 };
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = grid[r][c];
        if (ch === "S") start = { c, r };
        else if (ch === "P") traps.push({ type: "popup", c, r, up: 0, triggered: false });
        else if (ch === "D") traps.push({ type: "guillotine", c, r, period: 2.0, down: 0.85, off: c * 0.27 });
        else if (ch === "X") traps.push({ type: "crusher", c, r, period: 2.6, down: 1.0, off: 0 });
      }
    }
    // crushers come in pairs (XX) — merge into one 2-wide object
    traps = mergeCrushers(traps);

    player.startX = start.c * TILE + (TILE - PW) / 2;
    player.startY = start.r * TILE + (TILE - PH);
    elLevel.textContent = "LEVEL " + (i + 1);
    respawn();
  }

  function mergeCrushers(list) {
    const out = [];
    const cr = list.filter(t => t.type === "crusher").sort((a, b) => a.c - b.c);
    const others = list.filter(t => t.type !== "crusher");
    for (let i = 0; i < cr.length; i++) {
      if (i + 1 < cr.length && cr[i + 1].c === cr[i].c + 1 && cr[i + 1].r === cr[i].r) {
        out.push({ ...cr[i], w: 2 }); i++; // consume pair
      } else out.push({ ...cr[i], w: 1 });
    }
    return others.concat(out);
  }

  function respawn() {
    player.x = player.startX; player.y = player.startY;
    player.vx = 0; player.vy = 0;
    player.onGround = false; player.coyote = 0; player.jumpBuf = 0;
    player.dead = false; player.deathT = 0; player.win = false; player.facing = 1;
    collapsed = new Set();
    textShown = new Set();
    activeText = null; activeTextT = 0;
    levelTime = 0;
    for (const t of traps) { t.up = 0; t.triggered = false; }
    keys.left = keys.right = keys.jump = false;               // no phantom held keys
  }

  function die() {
    if (player.dead) return;
    player.dead = true; player.deathT = 0;
    deaths++; elDeaths.textContent = "DEATHS " + deaths;
    shake = 14;
    sndDeath();
    for (let i = 0; i < 26; i++) {
      particles.push({
        x: player.x + PW / 2, y: player.y + PH / 2,
        vx: (Math.random() - 0.5) * 420, vy: (Math.random() - 0.7) * 460,
        life: 0.6 + Math.random() * 0.4, col: Math.random() < 0.5 ? "#ff3b54" : "#ffcf5c",
      });
    }
  }

  function winGame() {
    state = "win";
    sndWin();
    runElapsed = (performance.now() - runStart) / 1000;
    winStats.textContent = `Survived all 4 lies in ${runElapsed.toFixed(1)}s with ${deaths} death${deaths === 1 ? "" : "s"}.`;
    winScreen.classList.remove("hidden");
  }

  // =====================================================================
  // Collision helpers
  // =====================================================================
  function solidAt(c, r) {
    if (c < 0 || c >= COLS) return true;     // world side walls
    if (r < 0 || r >= ROWS) return false;    // open top, open bottom (fall)
    const ch = grid[r][c];
    if (ch === "#") return true;
    if (ch === "F") return false; // fake floor: drawn solid, never actually holds you
    return false;
  }

  // Resolve one axis at a time against the grid. Substep displacement is
  // tiny (<7px) vs 40px tiles, so checking the leading edge's cell span is
  // enough — and we check EVERY cell in that span (no early-return sticking).
  function moveAxis(dx, dy) {
    if (dx !== 0) {
      player.x += dx;
      const top = Math.floor(player.y / TILE);
      const bottom = Math.floor((player.y + PH - 1) / TILE);
      if (dx > 0) {
        const c = Math.floor((player.x + PW - 1) / TILE);
        for (let r = top; r <= bottom; r++) if (solidAt(c, r)) { player.x = c * TILE - PW; player.vx = 0; break; }
      } else {
        const c = Math.floor(player.x / TILE);
        for (let r = top; r <= bottom; r++) if (solidAt(c, r)) { player.x = (c + 1) * TILE; player.vx = 0; break; }
      }
    }
    if (dy !== 0) {
      player.y += dy;
      const left = Math.floor(player.x / TILE);          // uses already-resolved X
      const right = Math.floor((player.x + PW - 1) / TILE);
      if (dy > 0) {
        const r = Math.floor((player.y + PH - 1) / TILE);
        for (let c = left; c <= right; c++) if (solidAt(c, r)) { player.y = r * TILE - PH; player.vy = 0; player.onGround = true; break; }
      } else {
        const r = Math.floor(player.y / TILE);
        for (let c = left; c <= right; c++) if (solidAt(c, r)) { player.y = (r + 1) * TILE; player.vy = 0; break; }
      }
    }
  }

  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  // =====================================================================
  // Trap behaviour — returns true if the player should die this frame
  // =====================================================================
  function guillotineExtend(t) {
    // 0..1 how far the blade has dropped, on a predictable rhythm
    const p = ((levelTime + t.off) % t.period) / t.period;
    const dphase = t.down / t.period;
    let f;
    if (p < dphase * 0.4) f = p / (dphase * 0.4);          // drop
    else if (p < dphase) f = 1;                             // hold down
    else f = Math.max(0, 1 - (p - dphase) / (1 - dphase));  // retract
    return f;
  }
  function crusherDown(t) {
    const p = ((levelTime + t.off) % t.period) / t.period;
    const dphase = t.down / t.period;
    if (p < dphase * 0.25) return p / (dphase * 0.25); // slam
    if (p < dphase) return 1;                          // stay down
    return Math.max(0, 1 - (p - dphase) / (1 - dphase)); // rise
  }

  function updateTraps(dt) {
    const px = player.x, py = player.y;
    let dead = false;

    for (const t of traps) {
      const tx = t.c * TILE, ty = t.r * TILE;

      if (t.type === "popup") {
        const cx = tx + TILE / 2;
        const near = Math.abs((px + PW / 2) - cx) < TILE * 0.7;
        if (near && !t.triggered) { t.triggered = true; beep(660, 0.08, "square", 0.05, 300); }
        t.up = Math.min(1, t.up + (t.triggered ? dt * 14 : -dt * 6));
        if (t.up > 0.15) {
          const sh = TILE * 0.8 * t.up;
          if (rectsOverlap(px, py, PW, PH, tx + 4, ty + TILE - sh, TILE - 8, sh)) dead = true;
        }
      }
      else if (t.type === "guillotine") {
        const f = guillotineExtend(t);
        const len = (ROWS - 2 - t.r) * TILE * f; // reaches toward the floor
        if (f > 0.05 && rectsOverlap(px, py, PW, PH, tx + 8, ty, TILE - 16, len)) dead = true;
      }
      else if (t.type === "crusher") {
        const f = crusherDown(t);
        const w = (t.w || 1) * TILE;
        const travel = (ROWS - 2 - t.r) * TILE;
        const by = ty + travel * f;
        if (f > 0.02 && rectsOverlap(px, py, PW, PH, tx, ty, w, by - ty + TILE)) dead = true;
      }
    }

    // fake floors break the instant you touch them — they were never real.
    // (Robust: no reliance on the flickery onGround flag. Touch = it's gone.)
    const fc1 = Math.floor(px / TILE), fc2 = Math.floor((px + PW - 1) / TILE);
    const fr1 = Math.floor(py / TILE), fr2 = Math.floor((py + PH - 1) / TILE);
    for (let r = fr1; r <= fr2; r++) {
      for (let c = fc1; c <= fc2; c++) {
        if (r >= 0 && r < ROWS && grid[r] && grid[r][c] === "F" && !collapsed.has(c + "," + r)) {
          breakFloor(c, r);
        }
      }
    }

    return dead;
  }

  // visually shatter a fake-floor tile the moment it's touched
  function breakFloor(c, r) {
    collapsed.add(c + "," + r);
    beep(200, 0.16, "sawtooth", 0.06, -120);
    for (let i = 0; i < 8; i++) particles.push({
      x: c * TILE + Math.random() * TILE, y: r * TILE + 6,
      vx: (Math.random() - 0.5) * 140, vy: Math.random() * 140,
      life: 0.5, col: "#6b6b86",
    });
  }

  // static spike / exit checks against player rect
  function checkTilesUnderPlayer() {
    const c1 = Math.floor(player.x / TILE);
    const c2 = Math.floor((player.x + PW - 1) / TILE);
    const r1 = Math.floor(player.y / TILE);
    const r2 = Math.floor((player.y + PH - 1) / TILE);
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
        const ch = grid[r][c];
        if (ch === "^") {
          // spike hitbox is the lower portion of the tile
          if (rectsOverlap(player.x, player.y, PW, PH, c * TILE + 6, r * TILE + 16, TILE - 12, TILE - 16)) return "die";
        } else if (ch === "M") {
          if (rectsOverlap(player.x, player.y, PW, PH, c * TILE + 6, r * TILE + 4, TILE - 12, TILE - 4)) return "die";
        } else if (ch === "E") {
          if (rectsOverlap(player.x, player.y, PW, PH, c * TILE + 6, r * TILE + 4, TILE - 12, TILE - 4)) return "win";
        }
      }
    }
    return null;
  }

  // =====================================================================
  // Update
  // =====================================================================
  const DT = 1 / 120;
  let acc = 0, last = 0;

  function step(dt) {
    if (state !== "play") return;

    if (player.dead) {
      player.deathT += dt;
      if (player.deathT > 0.45) respawn();
      return;
    }

    levelTime += dt;

    // ---- horizontal ----
    const want = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (want !== 0) player.facing = want;
    const a = player.onGround ? ACCEL : AIR_ACCEL;
    if (want !== 0) {
      player.vx += want * a * dt;
      player.vx = Math.max(-MOVE, Math.min(MOVE, player.vx));
    } else {
      const f = FRICTION * dt;
      if (player.vx > f) player.vx -= f; else if (player.vx < -f) player.vx += f; else player.vx = 0;
    }

    // ---- jump ----
    if (player.jumpBuf > 0) player.jumpBuf -= dt;
    if (player.onGround) player.coyote = COYOTE; else player.coyote -= dt;
    if (player.jumpBuf > 0 && player.coyote > 0) {
      player.vy = -JUMP; player.onGround = false; player.coyote = 0; player.jumpBuf = 0;
      sndJump();
    }
    // variable jump height: release early -> cut
    if (!keys.jump && player.vy < 0) player.vy += GRAVITY * dt * 0.9;

    // ---- gravity ----
    player.vy = Math.min(MAX_FALL, player.vy + GRAVITY * dt);

    // ---- move + collide ----
    player.onGround = false;
    moveAxis(player.vx * dt, 0);
    moveAxis(0, player.vy * dt);

    // ---- death by falling out of the world ----
    if (player.y > H + 40) { die(); return; }

    // ---- traps ----
    if (updateTraps(dt)) { die(); return; }

    // ---- spikes / exits ----
    const hit = checkTilesUnderPlayer();
    if (hit === "die") { die(); return; }
    if (hit === "win") {
      sndWin();
      if (levelIndex + 1 < LEVELS.length) loadLevel(levelIndex + 1);
      else winGame();
      return;
    }

    // ---- troll text triggers ----
    const pcx = (player.x + PW / 2) / TILE;
    for (let i = 0; i < texts.length; i++) {
      if (!textShown.has(i) && pcx >= texts[i].col) {
        textShown.add(i);
        activeText = texts[i].text; activeTextT = 2.6;
      }
    }
    if (activeTextT > 0) { activeTextT -= dt; if (activeTextT <= 0) activeText = null; }
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.vy += 1400 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    }
    particles = particles.filter(p => p.life > 0);
    if (shake > 0) shake = Math.max(0, shake - dt * 60);
  }

  // =====================================================================
  // Render
  // =====================================================================
  function render() {
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    // background
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#181226"); g.addColorStop(1, "#0d0d16");
    ctx.fillStyle = g; ctx.fillRect(-20, -20, W + 40, H + 40);

    // faint grid
    ctx.strokeStyle = "rgba(255,255,255,0.03)"; ctx.lineWidth = 1;
    for (let c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(c * TILE, 0); ctx.lineTo(c * TILE, H); ctx.stroke(); }
    for (let r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r * TILE); ctx.lineTo(W, r * TILE); ctx.stroke(); }

    // tiles
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = grid[r][c];
        const x = c * TILE, y = r * TILE;
        if (ch === "#" || (ch === "F" && !collapsed.has(c + "," + r))) {
          drawBlock(x, y, ch === "F"); // fake floor drawn identically — that's the trick
        } else if (ch === "^") {
          drawSpikeUp(x, y);
        } else if (ch === "O") {
          drawFakePlatform(x, y);
        } else if (ch === "E") {
          drawDoor(x, y, false);
        } else if (ch === "M") {
          drawDoor(x, y, false); // looks exactly like the real one
        }
      }
    }

    // traps
    for (const t of traps) {
      const tx = t.c * TILE, ty = t.r * TILE;
      if (t.type === "popup" && t.up > 0.02) {
        const sh = TILE * 0.8 * t.up;
        drawSpikeColumn(tx, ty + TILE - sh, sh);
      } else if (t.type === "guillotine") {
        const f = guillotineExtend(t);
        const len = (ROWS - 2 - t.r) * TILE * f;
        drawGuillotine(tx, ty, len);
      } else if (t.type === "crusher") {
        const f = crusherDown(t);
        const w = (t.w || 1) * TILE;
        const travel = (ROWS - 2 - t.r) * TILE;
        drawCrusher(tx, ty + travel * f, w);
      }
    }

    // player
    if (!player.dead) drawPlayer();

    // particles
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
      ctx.fillStyle = p.col;
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }
    ctx.globalAlpha = 1;

    // troll text banner
    if (activeText) {
      const alpha = Math.min(1, activeTextT * 2);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, 60, W, 44);
      ctx.fillStyle = "#ffcf5c";
      ctx.font = "16px Poppins, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(activeText, W / 2, 88);
      ctx.globalAlpha = 1;
      ctx.textAlign = "left";
    }

    ctx.restore();
  }

  // ---- draw primitives ------------------------------------------------
  function drawBlock(x, y) {
    ctx.fillStyle = "#2c2c44"; ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = "#3a3a58"; ctx.fillRect(x, y, TILE, 5);
    ctx.fillStyle = "#20203a"; ctx.fillRect(x, y + TILE - 4, TILE, 4);
    ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, TILE - 1, TILE - 1);
  }
  function drawFakePlatform(x, y) {
    // a thin "platform" that you'll fall straight through
    ctx.fillStyle = "#2c2c44"; ctx.fillRect(x, y + 6, TILE, 12);
    ctx.fillStyle = "#3a3a58"; ctx.fillRect(x, y + 6, TILE, 4);
  }
  function drawSpikeUp(x, y) {
    ctx.fillStyle = "#c9ccd6";
    const n = 4, w = TILE / n;
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * w, y + TILE);
      ctx.lineTo(x + i * w + w / 2, y + 12);
      ctx.lineTo(x + (i + 1) * w, y + TILE);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = "#7a7d8a"; ctx.fillRect(x, y + TILE - 4, TILE, 4);
  }
  function drawSpikeColumn(x, y, h) {
    ctx.fillStyle = "#ff5d73";
    const n = 4, w = TILE / n;
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * w, y + h);
      ctx.lineTo(x + i * w + w / 2, y);
      ctx.lineTo(x + (i + 1) * w, y + h);
      ctx.closePath(); ctx.fill();
    }
  }
  function drawGuillotine(x, y, len) {
    if (len < 2) { // resting nub on the ceiling
      ctx.fillStyle = "#555"; ctx.fillRect(x + 10, y, TILE - 20, 8); return;
    }
    ctx.fillStyle = "#6a6a7a"; ctx.fillRect(x + TILE / 2 - 3, y, 6, len - 14); // shaft
    ctx.fillStyle = "#ff5d73"; // blade
    ctx.beginPath();
    ctx.moveTo(x + 6, y + len - 16);
    ctx.lineTo(x + TILE / 2, y + len);
    ctx.lineTo(x + TILE - 6, y + len - 16);
    ctx.closePath(); ctx.fill();
  }
  function drawCrusher(x, y, w) {
    ctx.fillStyle = "#43233a"; ctx.fillRect(x, y, w, TILE);
    ctx.fillStyle = "#5e2f50"; ctx.fillRect(x, y, w, 5);
    ctx.fillStyle = "#ff5d73"; // teeth on the bottom
    const n = Math.round(w / 10);
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * (w / n), y + TILE);
      ctx.lineTo(x + i * (w / n) + (w / n) / 2, y + TILE + 8);
      ctx.lineTo(x + (i + 1) * (w / n), y + TILE);
      ctx.closePath(); ctx.fill();
    }
  }
  function drawDoor(x, y) {
    ctx.fillStyle = "#1c1430"; ctx.fillRect(x + 6, y + 2, TILE - 12, TILE - 2);
    const gg = ctx.createLinearGradient(x, y, x, y + TILE);
    gg.addColorStop(0, "#ffe08a"); gg.addColorStop(1, "#ff9e2c");
    ctx.fillStyle = gg; ctx.fillRect(x + 9, y + 5, TILE - 18, TILE - 7);
    ctx.fillStyle = "#1c1430"; ctx.fillRect(x + TILE / 2 + 4, y + TILE / 2, 4, 4); // knob
    ctx.globalAlpha = 0.25; ctx.fillStyle = "#fff";
    ctx.fillRect(x + 2, y, TILE - 4, TILE); ctx.globalAlpha = 1;
  }
  function drawPlayer() {
    const x = player.x, y = player.y;
    // squash/stretch
    let sw = PW, sh = PH, ox = 0, oy = 0;
    if (!player.onGround) { sh = PH + 4; sw = PW - 3; oy = -4; ox = 1.5; }
    ctx.fillStyle = "#ff3b54";
    roundRect(x + ox, y + oy, sw, sh, 6); ctx.fill();
    ctx.fillStyle = "#fff"; // eyes
    const ex = player.facing >= 0 ? x + sw - 12 : x + 5;
    ctx.fillRect(ex + ox, y + 8 + oy, 5, 6);
    ctx.fillRect(ex + ox - (player.facing >= 0 ? 8 : -8), y + 8 + oy, 5, 6);
    ctx.fillStyle = "#1a0008";
    ctx.fillRect(ex + ox + 2, y + 10 + oy, 2, 3);
    ctx.fillRect(ex + ox - (player.facing >= 0 ? 6 : -10), y + 10 + oy, 2, 3);
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // =====================================================================
  // Main loop
  // =====================================================================
  function frame(now) {
    if (!last) last = now;
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.1) dt = 0.1; // tab-switch guard
    acc += dt;
    while (acc >= DT) { step(DT); acc -= DT; }
    updateParticles(dt);
    render();
    if (state === "play") elTime.textContent = ((performance.now() - runStart) / 1000).toFixed(1) + "s";
    requestAnimationFrame(frame);
  }

  // =====================================================================
  // Wiring
  // =====================================================================
  function startGame() {
    audio();
    deaths = 0; elDeaths.textContent = "DEATHS 0";
    runStart = performance.now();
    titleScreen.classList.add("hidden");
    winScreen.classList.add("hidden");
    state = "play";
    loadLevel(0);
  }
  document.getElementById("start-btn").addEventListener("click", startGame);
  document.getElementById("again-btn").addEventListener("click", startGame);

  // render the title behind the overlay
  loadLevel(0); state = "title";
  requestAnimationFrame(frame);
})();
