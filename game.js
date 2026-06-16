/* =====================================================================
   DEVIL'S LIE — a troll platformer (v2: balloon edition)
   Vanilla JS + Canvas. No deps. The level looks normal, then betrays you.
   Every trap is FAIR — there's always a safe path if you're smart & fast.
   ===================================================================== */
(() => {
  "use strict";

  // ---- World (logical resolution; CSS-scaled to fit any screen) --------
  const TILE = 40, COLS = 20, ROWS = 12;
  const W = COLS * TILE; // 800
  const H = ROWS * TILE; // 480

  // ---- Physics (px, seconds) ------------------------------------------
  const GRAVITY = 2400, MOVE = 250, JUMP = 700, BIG_JUMP = 980;
  const MAX_FALL = 900, ACCEL = 2600, AIR_ACCEL = 1800, FRICTION = 2200;
  const COYOTE = 0.10, JUMP_BUF = 0.12, DBL_TAP = 0.30;
  const PW = 26, PH = 28; // balloon hitbox (a touch rounder)

  // =====================================================================
  // LEVELS — ascii grids (20x12, row0 = sky). Legend:
  //  # solid   ^ spike   S start   E exit   F fake floor (looks solid, isn't)
  //  P popup spike   D guillotine (timed)   X crusher   M fake exit   O fall-through
  // =====================================================================
  const LEVELS = [
    { name: "Just walk to the door",
      grid: ["                    ","                    ","                    ","                    ",
             "                    ","                    ","                    ","                    ",
             "                    ","                    "," S    ^         E   ","#############FF#####"],
      texts: [{c:3,t:"See? Totally normal. Just walk right →"},{c:11,t:"Almost there! Keep going…"}] },

    { name: "Trust the floor",
      grid: ["                    ","                    ","                    ","                    ",
             "                    ","                    ","                    ","                    ",
             "                    ","      #  #  #       ","  S             P E ","#####FFFFFFFFFF#####"],
      texts: [{c:5,t:"A nice solid bridge. Cross it →"},{c:13,t:"Ha. Should've taken the high road."}] },

    { name: "Look up. Look out.",
      grid: ["                    ","      D   D   XX    ","                    ","                    ",
             "                    ","                    ","                    ","                    ",
             "                    ","                    "," S              M E ","####################"],
      texts: [{c:2,t:"Easy corridor. Run to the EXIT →"},{c:14,t:"Door's right there. Trust me."}] },

    { name: "The Gauntlet",
      grid: ["                    ","              D     ","                    ","                    ",
             "                    ","                    ","                    ","                    ",
             "                    ","                    "," S  OOO P       M E ","####   ###FFF#######"],
      texts: [{c:2,t:"Everything you learned. Go."},{c:9,t:"You remember fake floors… right?"},{c:15,t:"Pick a door. Choose wisely 😈"}] },

    { name: "Double Cross",
      grid: ["                    ","                    ","                    ","                    ",
             "                    ","                    ","                    ","                    ",
             "                    ","                    "," S     P        M E ","####FF####FF########"],
      texts: [{c:1,t:"Two pits, two lies. Hop smart."},{c:14,t:"Door on the left? …sure it is."}] },

    { name: "Rhythm Hell",
      grid: ["                    ","     D  D  D  XX    ","                    ","                    ",
             "                    ","                    ","                    ","                    ",
             "                    ","                    "," S              M E ","####################"],
      texts: [{c:1,t:"Feel the rhythm. Or feel the spikes."},{c:13,t:"The door is RIGHT there. (it lies)"}] },

    { name: "Spike Garden",
      grid: ["                    ","                    ","                    ","                    ",
             "                    ","                    ","                    ","                    ",
             "                    ","                    "," S   ^    P     M E ","#############FF#####"],
      texts: [{c:1,t:"Mind the garden. It bites."},{c:15,t:"Knock knock. (don't)"}] },

    { name: "The Big Lie",
      grid: ["                    ","         D   XX     ","                    ","                    ",
             "                    ","                    ","                    ","                    ",
             "                    ","                    "," S     P        M E ","####FF####FF########"],
      texts: [{c:1,t:"Last one. Every trick at once."},{c:8,t:"Don't trust ANYTHING down here."},{c:15,t:"Final door. Or is it. 😈"}] },
  ];

  // =====================================================================
  // DOM + canvas
  // =====================================================================
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const frame = document.getElementById("frame");
  const elLevel = document.getElementById("hud-level");
  const elDeaths = document.getElementById("hud-deaths");
  const elTime = document.getElementById("hud-time");
  const titleScreen = document.getElementById("title-screen");
  const winScreen = document.getElementById("win-screen");
  const lbScreen = document.getElementById("lb-screen");
  const rotateScreen = document.getElementById("rotate-screen");
  const touchUI = document.getElementById("touch");
  const winStats = document.getElementById("win-stats");
  const submitStatus = document.getElementById("submit-status");
  const nameInput = document.getElementById("name-input");
  const geoLine = document.getElementById("geo-line");

  const isTouch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;

  let renderScale = 1;
  function resize() {
    const availW = window.innerWidth, availH = window.innerHeight;
    const scale = Math.min(availW / W, availH / H);
    const cssW = Math.max(1, Math.floor(W * scale));
    const cssH = Math.max(1, Math.floor(H * scale));
    frame.style.width = cssW + "px";
    frame.style.height = cssH + "px";
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    renderScale = canvas.width / W;
    checkOrientation();
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 200));

  // =====================================================================
  // State
  // =====================================================================
  let state = "title";          // title | play | win | lb | paused
  let prevState = "title";
  let levelIndex = 0, deaths = 0, runStart = 0, runElapsed = 0;
  let player, traps, grid, texts, collapsed, textShown, activeText, activeTextT;
  let levelTime = 0, animTime = 0, particles = [], shake = 0, hitStop = 0;
  let staticLayer = null, embers = [], GRAD = null;
  let playerName = "", playerGeo = { country: "", cc: "" };
  let needsRotate = false;

  // =====================================================================
  // Input
  // =====================================================================
  const keys = { left: false, right: false, jump: false };
  let lastJumpTap = -1, pendingBig = false;

  function pressJump() {
    if (animTime - lastJumpTap < DBL_TAP) pendingBig = true;
    lastJumpTap = animTime;
    player.jumpBuf = JUMP_BUF;
    keys.jump = true;
  }
  function releaseJump() { keys.jump = false; }

  window.addEventListener("keydown", (e) => {
    if (state !== "play") return;
    const k = e.key.toLowerCase();
    if (k === "arrowleft" || k === "a") { keys.left = true; e.preventDefault(); }
    else if (k === "arrowright" || k === "d") { keys.right = true; e.preventDefault(); }
    else if ((k === "arrowup" || k === "w" || k === " ") && !e.repeat) { pressJump(); e.preventDefault(); }
    else if (k === "r") { respawn(); }
  });
  window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (k === "arrowleft" || k === "a") keys.left = false;
    else if (k === "arrowright" || k === "d") keys.right = false;
    else if (k === "arrowup" || k === "w" || k === " ") releaseJump();
  });

  // touch buttons
  function bindHold(id, on, off) {
    const el = document.getElementById(id);
    // Pointer events only — covers touch + mouse. Binding touch AND pointer
    // would double-fire on mobile (turning every jump tap into a big-jump).
    const down = (e) => { e.preventDefault(); on(); };
    const up = (e) => { e.preventDefault(); off(); };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", up);
  }
  bindHold("t-l", () => keys.left = true, () => keys.left = false);
  bindHold("t-r", () => keys.right = true, () => keys.right = false);
  bindHold("t-j", () => { if (state === "play") pressJump(); }, () => releaseJump());

  // =====================================================================
  // Audio (tiny WebAudio synth, $0)
  // =====================================================================
  let actx = null;
  function audio() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } return actx; }
  function tone(freq, dur, type = "square", vol = 0.08, slideTo = 0, delay = 0) {
    const a = audio(); if (!a) return;
    const t0 = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  const sndJump = (big) => tone(big ? 360 : 480, big ? 0.18 : 0.12, "square", 0.06, big ? 760 : 720);
  const sndLand = () => tone(160, 0.06, "sine", 0.05, 110);
  const sndStep = () => tone(420, 0.03, "square", 0.015, 380);
  const sndBreak = () => tone(200, 0.18, "sawtooth", 0.07, 90);
  const sndPop = () => { tone(900, 0.05, "square", 0.12, 200); tone(140, 0.16, "sawtooth", 0.10, 60, 0.02); };
  // the troll death sting: sad descending trombone
  function sndDeath() {
    sndPop();
    const notes = [392, 349, 311, 233];
    notes.forEach((f, i) => tone(f, 0.26, "sawtooth", 0.10, f * 0.94, 0.12 + i * 0.16));
  }
  function sndWin() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.18, "triangle", 0.09, 0, i * 0.10)); }

  // =====================================================================
  // Level load
  // =====================================================================
  function rowStr(g, r) { return g[r]; }
  function loadLevel(i) {
    levelIndex = i;
    grid = LEVELS[i].grid;
    texts = (LEVELS[i].texts || []).map(o => ({ col: o.c, text: o.t }));
    traps = [];
    let start = { c: 1, r: ROWS - 2 };
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const ch = grid[r][c];
      if (ch === "S") start = { c, r };
      else if (ch === "P") traps.push({ type: "popup", c, r, up: 0, triggered: false });
      else if (ch === "D") traps.push({ type: "guillotine", c, r, period: 2.0, down: 0.85, off: c * 0.27 });
      else if (ch === "X") traps.push({ type: "crusher", c, r, period: 2.6, down: 1.0, off: 0 });
    }
    traps = mergeCrushers(traps);
    player = player || {};
    player.startX = start.c * TILE + (TILE - PW) / 2;
    player.startY = start.r * TILE + (TILE - PH);
    elLevel.textContent = "LEVEL " + (i + 1) + "/" + LEVELS.length;
    buildStaticLayer();
    respawn();
  }
  function mergeCrushers(list) {
    const out = [], cr = list.filter(t => t.type === "crusher").sort((a, b) => a.c - b.c);
    const others = list.filter(t => t.type !== "crusher");
    for (let i = 0; i < cr.length; i++) {
      if (i + 1 < cr.length && cr[i + 1].c === cr[i].c + 1 && cr[i + 1].r === cr[i].r) { out.push({ ...cr[i], w: 2 }); i++; }
      else out.push({ ...cr[i], w: 1 });
    }
    return others.concat(out);
  }
  function respawn() {
    player.x = player.startX; player.y = player.startY;
    player.vx = 0; player.vy = 0;
    player.onGround = false; player.coyote = 0; player.jumpBuf = 0; player.facing = 1;
    player.dead = false; player.deathT = 0; player.landT = 1; player.runCycle = 0; player.fear = 0;
    player.trail = [];
    collapsed = new Set();
    textShown = new Set();
    activeText = null; activeTextT = 0; levelTime = 0;
    pendingBig = false; lastJumpTap = -1;
    keys.left = keys.right = keys.jump = false;
    for (const t of traps) { t.up = 0; t.triggered = false; }
  }

  function die(popped) {
    if (player.dead) return;
    player.dead = true; player.deathT = 0;
    deaths++; elDeaths.textContent = "DEATHS " + deaths;
    shake = 16; hitStop = 0.06;
    sndDeath();
    // balloon shreds + confetti burst
    const cx = player.x + PW / 2, cy = player.y + PH / 2;
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2, sp = 160 + Math.random() * 360;
      particles.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120,
        life: 0.7 + Math.random() * 0.6, r: 3 + Math.random() * 5,
        col: Math.random() < 0.6 ? "#ff3b54" : (Math.random() < 0.5 ? "#ffcf5c" : "#ff5d9e"),
        shred: Math.random() < 0.5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12 });
    }
  }

  function winGame() {
    state = "win";
    sndWin();
    runElapsed = (performance.now() - runStart) / 1000;
    winStats.textContent = `Beat all ${LEVELS.length} levels in ${runElapsed.toFixed(1)}s with ${deaths} death${deaths === 1 ? "" : "s"}.`;
    submitStatus.textContent = "Saving your score…";
    winScreen.classList.remove("hidden");
    LB.submit({ name: playerName, cc: playerGeo.cc, country: playerGeo.country, deaths, time: +runElapsed.toFixed(1) })
      .then(ok => { submitStatus.textContent = ok ? "✓ Score saved to the global leaderboard." : "⚠ Saved locally (couldn't reach global board)."; })
      .catch(() => { submitStatus.textContent = "⚠ Saved locally only."; });
  }

  // =====================================================================
  // Collision
  // =====================================================================
  function solidAt(c, r) {
    if (c < 0 || c >= COLS) return true;
    if (r < 0 || r >= ROWS) return false;
    const ch = grid[r][c];
    if (ch === "#") return true;
    if (ch === "F") return false; // fake floor: drawn solid, never holds you
    return false;
  }
  function moveAxis(dx, dy) {
    if (dx !== 0) {
      player.x += dx;
      const top = Math.floor(player.y / TILE), bottom = Math.floor((player.y + PH - 1) / TILE);
      if (dx > 0) { const c = Math.floor((player.x + PW - 1) / TILE);
        for (let r = top; r <= bottom; r++) if (solidAt(c, r)) { player.x = c * TILE - PW; player.vx = 0; break; }
      } else { const c = Math.floor(player.x / TILE);
        for (let r = top; r <= bottom; r++) if (solidAt(c, r)) { player.x = (c + 1) * TILE; player.vx = 0; break; }
      }
    }
    if (dy !== 0) {
      player.y += dy;
      const left = Math.floor(player.x / TILE), right = Math.floor((player.x + PW - 1) / TILE);
      if (dy > 0) { const r = Math.floor((player.y + PH - 1) / TILE);
        for (let c = left; c <= right; c++) if (solidAt(c, r)) { player.y = r * TILE - PH; player.vy = 0; player.onGround = true; break; }
      } else { const r = Math.floor(player.y / TILE);
        for (let c = left; c <= right; c++) if (solidAt(c, r)) { player.y = (r + 1) * TILE; player.vy = 0; break; }
      }
    }
  }
  function overlap(ax, ay, aw, ah, bx, by, bw, bh) { return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by; }

  // ---- trap rhythms ----
  function guillotineExtend(t) {
    const p = ((levelTime + t.off) % t.period) / t.period, dp = t.down / t.period;
    if (p < dp * 0.4) return p / (dp * 0.4);
    if (p < dp) return 1;
    return Math.max(0, 1 - (p - dp) / (1 - dp));
  }
  function crusherDown(t) {
    const p = ((levelTime + t.off) % t.period) / t.period, dp = t.down / t.period;
    if (p < dp * 0.25) return p / (dp * 0.25);
    if (p < dp) return 1;
    return Math.max(0, 1 - (p - dp) / (1 - dp));
  }
  // guillotine/crusher now reach the FLOOR so a grounded runner must time them
  function guillotineLen(t, f) { return (ROWS - 1 - t.r) * TILE * f; }
  function crusherTravel(t) { return (ROWS - 1 - t.r) * TILE; }

  function updateTraps(dt) {
    const px = player.x, py = player.y; let dead = 0, hazardNear = 0;
    for (const t of traps) {
      const tx = t.c * TILE, ty = t.r * TILE;
      if (t.type === "popup") {
        const cx = tx + TILE / 2, near = Math.abs((px + PW / 2) - cx) < TILE * 0.75;
        if (near && !t.triggered) { t.triggered = true; tone(660, 0.08, "square", 0.05, 920); }
        t.up = Math.min(1, t.up + (t.triggered ? dt * 16 : -dt * 6));
        if (Math.abs((px + PW / 2) - cx) < TILE * 1.4) hazardNear = 1;
        if (t.up > 0.12) { const sh = TILE * 0.85 * t.up;
          if (overlap(px, py, PW, PH, tx + 4, ty + TILE - sh, TILE - 8, sh)) dead = t.type === "popup" ? 2 : 1; }
      } else if (t.type === "guillotine") {
        const f = guillotineExtend(t), len = guillotineLen(t, f);
        if (Math.abs((px + PW / 2) - (tx + TILE / 2)) < TILE * 1.4) hazardNear = 1;
        if (f > 0.05 && overlap(px, py, PW, PH, tx + 8, ty, TILE - 16, len)) dead = 2;
      } else if (t.type === "crusher") {
        const f = crusherDown(t), w = (t.w || 1) * TILE, by = ty + crusherTravel(t) * f;
        if (overlap(px, py, PW, PH, tx - 6, ty, w + 12, by - ty + TILE + 8)) hazardNear = 1;
        if (f > 0.02 && overlap(px, py, PW, PH, tx, ty, w, by - ty + TILE)) dead = 1;
      }
    }
    // fake floors shatter the instant you touch them (robust: no onGround reliance)
    const fc1 = Math.floor(px / TILE), fc2 = Math.floor((px + PW - 1) / TILE);
    const fr1 = Math.floor(py / TILE), fr2 = Math.floor((py + PH - 1) / TILE);
    for (let r = fr1; r <= fr2; r++) for (let c = fc1; c <= fc2; c++)
      if (r >= 0 && r < ROWS && grid[r] && grid[r][c] === "F" && !collapsed.has(c + "," + r)) breakFloor(c, r);
    player.fear = Math.max(player.fear * 0.9, hazardNear ? 1 : 0);
    return dead; // 0 none, 1 die, 2 die-by-spike (pop)
  }
  function breakFloor(c, r) {
    collapsed.add(c + "," + r);
    sndBreak();
    for (let i = 0; i < 9; i++) particles.push({ x: c * TILE + Math.random() * TILE, y: r * TILE + 6,
      vx: (Math.random() - 0.5) * 150, vy: Math.random() * 150, life: 0.5, r: 3, col: "#5a5a72" });
  }

  function checkTiles() {
    const c1 = Math.floor(player.x / TILE), c2 = Math.floor((player.x + PW - 1) / TILE);
    const r1 = Math.floor(player.y / TILE), r2 = Math.floor((player.y + PH - 1) / TILE);
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
      const ch = grid[r][c];
      if (ch === "^" && overlap(player.x, player.y, PW, PH, c * TILE + 6, r * TILE + 14, TILE - 12, TILE - 14)) return "pop";
      if (ch === "M" && overlap(player.x, player.y, PW, PH, c * TILE + 6, r * TILE + 4, TILE - 12, TILE - 4)) return "die";
      if (ch === "E" && overlap(player.x, player.y, PW, PH, c * TILE + 6, r * TILE + 4, TILE - 12, TILE - 4)) return "win";
    }
    return null;
  }

  // =====================================================================
  // Step
  // =====================================================================
  const DT = 1 / 120;
  function step(dt) {
    if (state !== "play") return;
    animTime += dt;

    if (player.dead) { player.deathT += dt; if (player.deathT > 0.7) respawn(); return; }
    levelTime += dt;

    const want = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (want !== 0) player.facing = want;
    const a = player.onGround ? ACCEL : AIR_ACCEL;
    if (want !== 0) { player.vx += want * a * dt; player.vx = Math.max(-MOVE, Math.min(MOVE, player.vx)); }
    else { const f = FRICTION * dt; if (player.vx > f) player.vx -= f; else if (player.vx < -f) player.vx += f; else player.vx = 0; }

    if (player.jumpBuf > 0) player.jumpBuf -= dt;
    if (player.onGround) player.coyote = COYOTE; else player.coyote -= dt;
    if (player.jumpBuf > 0 && player.coyote > 0) {
      const big = pendingBig; player.vy = -(big ? BIG_JUMP : JUMP);
      player.onGround = false; player.coyote = 0; player.jumpBuf = 0; pendingBig = false;
      sndJump(big);
      for (let i = 0; i < (big ? 10 : 5); i++) particles.push({ x: player.x + PW / 2 + (Math.random() - .5) * 16,
        y: player.y + PH, vx: (Math.random() - .5) * 90, vy: Math.random() * 60, life: 0.3, r: 2.5, col: "#ffffff" });
    }
    if (!keys.jump && player.vy < 0) player.vy += GRAVITY * dt * 0.9; // variable height
    player.vy = Math.min(MAX_FALL, player.vy + GRAVITY * dt);

    const wasGround = player.onGround;
    player.onGround = false;
    moveAxis(player.vx * dt, 0);
    moveAxis(0, player.vy * dt);
    if (!wasGround && player.onGround) { // landed
      player.landT = 0; sndLand();
      for (let i = 0; i < 6; i++) particles.push({ x: player.x + PW / 2 + (Math.random() - .5) * 18,
        y: player.y + PH, vx: (Math.random() - .5) * 120, vy: -Math.random() * 40, life: 0.3, r: 2.5, col: "#c9c9d6" });
    }
    player.landT += dt;
    // running dust + step sfx
    if (player.onGround && Math.abs(player.vx) > 60) {
      player.runCycle += Math.abs(player.vx) * dt * 0.04;
      if (Math.random() < 0.12) particles.push({ x: player.x + PW / 2, y: player.y + PH, vx: -player.facing * 60 * Math.random(),
        vy: -Math.random() * 20, life: 0.25, r: 2, col: "#6b6b86" });
    }
    // trail
    player.trail.push({ x: player.x + PW / 2, y: player.y + PH / 2 });
    if (player.trail.length > 6) player.trail.shift();

    if (player.y > H + 40) { die(false); return; }
    const td = updateTraps(dt); if (td) { die(td === 2); return; }
    const hit = checkTiles();
    if (hit === "pop") { die(true); return; }
    if (hit === "die") { die(false); return; }
    if (hit === "win") {
      if (levelIndex + 1 < LEVELS.length) { sndWin(); loadLevel(levelIndex + 1); }
      else winGame(); // winGame plays its own fanfare
      return;
    }
    // troll texts
    const pcx = (player.x + PW / 2) / TILE;
    for (let i = 0; i < texts.length; i++) if (!textShown.has(i) && pcx >= texts[i].col) {
      textShown.add(i); activeText = texts[i].text; activeTextT = 2.8;
    }
    if (activeTextT > 0) { activeTextT -= dt; if (activeTextT <= 0) activeText = null; }
  }

  function updateParticles(dt) {
    for (const p of particles) { p.vy += 1300 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; if (p.vr) p.rot += p.vr * dt; }
    particles = particles.filter(p => p.life > 0);
    if (shake > 0) shake = Math.max(0, shake - dt * 60);
    for (const e of embers) { e.y -= e.s * dt; e.x += Math.sin((animTime + e.o) * e.w) * 8 * dt; if (e.y < -10) { e.y = H + 10; e.x = Math.random() * W; } }
  }

  // =====================================================================
  // Static background layer (cached per level for performance)
  // =====================================================================
  function buildStaticLayer() {
    staticLayer = document.createElement("canvas");
    staticLayer.width = W; staticLayer.height = H;
    const g = staticLayer.getContext("2d");
    // sky
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#241531"); sky.addColorStop(0.5, "#1a1024"); sky.addColorStop(1, "#0c0a14");
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // moon glow
    const moon = g.createRadialGradient(W * 0.78, H * 0.26, 8, W * 0.78, H * 0.26, 120);
    moon.addColorStop(0, "rgba(255,210,130,0.5)"); moon.addColorStop(0.4, "rgba(255,120,90,0.15)"); moon.addColorStop(1, "transparent");
    g.fillStyle = moon; g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(255,225,170,0.9)"; g.beginPath(); g.arc(W * 0.78, H * 0.26, 26, 0, 7); g.fill();
    // parallax jagged mountains (2 layers)
    function range(baseY, amp, color) {
      g.fillStyle = color; g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W; x += 40) { const y = baseY + Math.sin(x * 0.04) * amp + ((x / 40) % 2 ? -amp * 0.4 : amp * 0.4); g.lineTo(x, y); }
      g.lineTo(W, H); g.closePath(); g.fill();
    }
    range(H * 0.62, 26, "rgba(60,30,55,0.55)");
    range(H * 0.74, 34, "rgba(40,18,38,0.75)");
    // distant spike silhouettes
    g.fillStyle = "rgba(20,10,22,0.85)";
    for (let x = 0; x < W; x += 22) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + 11, H - 22 - (x % 60) * 0.2); g.lineTo(x + 22, H); g.closePath(); g.fill(); }
    // tiles: solid blocks + static spikes (these never move) — cached here
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const ch = grid[r][c], x = c * TILE, y = r * TILE;
      if (ch === "#") drawBlockTo(g, x, y);
      else if (ch === "^") drawSpikeTo(g, x, y);
    }
    // vignette
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.85);
    vg.addColorStop(0, "transparent"); vg.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    // embers
    embers = []; for (let i = 0; i < 26; i++) embers.push({ x: Math.random() * W, y: Math.random() * H, s: 8 + Math.random() * 20, w: 1 + Math.random() * 2, o: Math.random() * 9, r: 1 + Math.random() * 2 });
  }
  function drawBlockTo(g, x, y) {
    g.fillStyle = "#33324e"; g.fillRect(x, y, TILE, TILE);
    g.fillStyle = "#43425f"; g.fillRect(x, y, TILE, 6);
    g.fillStyle = "#3a3a58"; g.fillRect(x + 3, y + 8, TILE - 6, TILE - 12);
    g.fillStyle = "#23223c"; g.fillRect(x, y + TILE - 4, TILE, 4);
    g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 1; g.strokeRect(x + .5, y + .5, TILE - 1, TILE - 1);
  }
  function drawSpikeTo(g, x, y) {
    const grd = g.createLinearGradient(x, y, x, y + TILE); grd.addColorStop(0, "#eef0f6"); grd.addColorStop(1, "#9498a6");
    g.fillStyle = grd; const n = 4, w = TILE / n;
    for (let i = 0; i < n; i++) { g.beginPath(); g.moveTo(x + i * w, y + TILE); g.lineTo(x + i * w + w / 2, y + 10); g.lineTo(x + (i + 1) * w, y + TILE); g.closePath(); g.fill(); }
    g.fillStyle = "#6a6d7a"; g.fillRect(x, y + TILE - 4, TILE, 4);
  }

  // =====================================================================
  // Render
  // =====================================================================
  function render() {
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    let ox = 0, oy = 0;
    if (shake > 0) { ox = (Math.random() - .5) * shake; oy = (Math.random() - .5) * shake; ctx.translate(ox, oy); }

    if (staticLayer) ctx.drawImage(staticLayer, 0, 0, W, H);
    else { ctx.fillStyle = "#0d0d16"; ctx.fillRect(0, 0, W, H); }

    // embers
    ctx.fillStyle = "rgba(255,170,90,0.5)";
    for (const e of embers) { ctx.globalAlpha = 0.3 + 0.4 * Math.abs(Math.sin((animTime + e.o) * e.w)); ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;

    // fake floors (drawn IDENTICAL to solid — the trick) + doors + traps
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const ch = grid[r][c], x = c * TILE, y = r * TILE;
      if (ch === "F" && !collapsed.has(c + "," + r)) drawBlockTo(ctx, x, y);
      else if (ch === "O") drawFakePlatform(x, y);
      else if (ch === "E") drawDoor(x, y, true);
      else if (ch === "M") drawDoor(x, y, false);
    }
    for (const t of traps) {
      const tx = t.c * TILE, ty = t.r * TILE;
      if (t.type === "popup" && t.up > 0.02) drawSpikeColumn(tx, ty + TILE - TILE * 0.85 * t.up, TILE * 0.85 * t.up);
      else if (t.type === "guillotine") drawGuillotine(tx, ty, guillotineLen(t, guillotineExtend(t)));
      else if (t.type === "crusher") drawCrusher(tx, ty + crusherTravel(t) * crusherDown(t), (t.w || 1) * TILE);
    }

    if (!player.dead && state === "play") drawPlayer();

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2)); ctx.fillStyle = p.col;
      if (p.shred) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0);
        ctx.beginPath(); ctx.moveTo(-p.r, p.r); ctx.lineTo(0, -p.r); ctx.lineTo(p.r, p.r); ctx.closePath(); ctx.fill(); ctx.restore(); }
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.r || 3, 0, 7); ctx.fill(); }
    }
    ctx.globalAlpha = 1;

    if (activeText) {
      ctx.globalAlpha = Math.min(1, activeTextT * 2);
      ctx.fillStyle = "rgba(0,0,0,0.62)"; ctx.fillRect(0, 52, W, 40);
      ctx.fillStyle = "#ffcf5c"; ctx.font = "16px Poppins, sans-serif"; ctx.textAlign = "center";
      ctx.fillText(activeText, W / 2, 78); ctx.globalAlpha = 1; ctx.textAlign = "left";
    }
    if (shake > 0) ctx.translate(-ox, -oy);
  }

  // Gradients are constant in local (translated) space — build once, not per frame.
  function initGrads() {
    const R = PW / 2 + 1;
    GRAD = {};
    GRAD.balloon = ctx.createRadialGradient(-R * 0.3, -R * 0.4, 2, 0, 0, R * 1.2);
    GRAD.balloon.addColorStop(0, "#ff8aa0"); GRAD.balloon.addColorStop(0.5, "#ff3b54"); GRAD.balloon.addColorStop(1, "#c01030");
    GRAD.door = ctx.createLinearGradient(0, 0, 0, TILE);
    GRAD.door.addColorStop(0, "#ffe79a"); GRAD.door.addColorStop(1, "#ff9e2c");
    GRAD.spike = ctx.createLinearGradient(0, 0, 0, TILE * 0.85);
    GRAD.spike.addColorStop(0, "#ff8aa0"); GRAD.spike.addColorStop(1, "#c01030");
    GRAD.guil = ctx.createLinearGradient(0, 0, 0, 420);
    GRAD.guil.addColorStop(0, "#cfd2db"); GRAD.guil.addColorStop(1, "#ff5d73");
  }
  function drawFakePlatform(x, y) { ctx.fillStyle = "#33324e"; ctx.fillRect(x, y + 6, TILE, 13); ctx.fillStyle = "#43425f"; ctx.fillRect(x, y + 6, TILE, 4); }
  function drawSpikeColumn(x, y, h) {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = GRAD.spike;
    const n = 4, w = TILE / n;
    for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.moveTo(i * w, h); ctx.lineTo(i * w + w / 2, 0); ctx.lineTo((i + 1) * w, h); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  function drawGuillotine(x, y, len) {
    if (len < 3) { ctx.fillStyle = "#4a4a5a"; ctx.fillRect(x + 8, y, TILE - 16, 8); return; }
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "#6a6a7a"; ctx.fillRect(TILE / 2 - 3, 0, 6, len - 16);
    ctx.fillStyle = GRAD.guil; ctx.beginPath(); ctx.moveTo(5, len - 18); ctx.lineTo(TILE / 2, len); ctx.lineTo(TILE - 5, len - 18); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawCrusher(x, y, w) {
    ctx.fillStyle = "#4a2440"; ctx.fillRect(x, y, w, TILE);
    ctx.fillStyle = "#62315a"; ctx.fillRect(x, y, w, 6);
    ctx.fillStyle = "#ff5d73"; const n = Math.max(2, Math.round(w / 10));
    for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.moveTo(x + i * (w / n), y + TILE); ctx.lineTo(x + i * (w / n) + (w / n) / 2, y + TILE + 9); ctx.lineTo(x + (i + 1) * (w / n), y + TILE); ctx.closePath(); ctx.fill(); }
  }
  function drawDoor(x, y, real) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "#140e26"; ctx.fillRect(5, 2, TILE - 10, TILE - 2);
    ctx.fillStyle = GRAD.door; ctx.fillRect(8, 5, TILE - 16, TILE - 7); // real & fake look identical — that's the troll
    ctx.globalAlpha = 0.25 + 0.18 * Math.sin(animTime * 3 + x); ctx.fillStyle = "#ffd060";
    ctx.fillRect(2, 0, TILE - 4, TILE); ctx.globalAlpha = 1;
    ctx.fillStyle = "#140e26"; ctx.fillRect(TILE / 2 + 4, TILE / 2, 4, 4);
    ctx.restore();
  }

  function drawPlayer() {
    const cx = player.x + PW / 2, cy = player.y + PH / 2;
    const R = PW / 2 + 1;
    // trail
    for (let i = 0; i < player.trail.length; i++) { const tp = player.trail[i], a = (i / player.trail.length) * 0.18;
      ctx.globalAlpha = a; ctx.fillStyle = "#ff5d9e"; ctx.beginPath(); ctx.arc(tp.x, tp.y, R * (0.5 + i / player.trail.length * 0.4), 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;

    // squash & stretch
    let sx = 1, sy = 1;
    if (player.onGround) { const land = Math.min(1, player.landT * 7); sx = 1 + 0.22 * (1 - land); sy = 1 - 0.22 * (1 - land); sx += 0.03 * Math.sin(animTime * 5); sy -= 0.03 * Math.sin(animTime * 5); }
    else { const v = Math.max(-1, Math.min(1, player.vy / 700)); sy = 1 + 0.20 * Math.abs(v); sx = 1 - 0.14 * Math.abs(v); }

    ctx.save();
    ctx.translate(cx, cy + R * (1 - sy)); ctx.scale(sx, sy);

    // little feet (animate while running)
    const ft = player.onGround ? Math.sin(player.runCycle) * 4 : -3;
    ctx.fillStyle = "#c01030";
    ctx.beginPath(); ctx.ellipse(-R * 0.45, R * 0.9 - ft, 5, 4, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(R * 0.45, R * 0.9 + ft, 5, 4, 0, 0, 7); ctx.fill();

    // balloon body (cached gradient — local space is constant)
    ctx.fillStyle = GRAD.balloon; ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fill();
    // knot
    ctx.fillStyle = "#c01030"; ctx.beginPath(); ctx.moveTo(-3, R - 1); ctx.lineTo(3, R - 1); ctx.lineTo(0, R + 4); ctx.closePath(); ctx.fill();
    // shine
    ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.beginPath(); ctx.ellipse(-R * 0.35, -R * 0.4, R * 0.18, R * 0.26, -0.5, 0, 7); ctx.fill();

    // eyes (look toward movement; widen with fear)
    const look = player.facing * 2.2, fear = player.fear;
    const eyeR = 5 + fear * 1.5, dir = player.facing;
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(-6 + look * 0.3, -2, eyeR, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(6 + look * 0.3, -2, eyeR, 0, 7); ctx.fill();
    ctx.fillStyle = "#160018";
    ctx.beginPath(); ctx.arc(-6 + look * 0.3 + dir * 1.8, -2 + fear, 2.4, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(6 + look * 0.3 + dir * 1.8, -2 + fear, 2.4, 0, 7); ctx.fill();
    // mouth: smile normally, "o" of fear when hazard near
    ctx.strokeStyle = "#160018"; ctx.lineWidth = 1.6; ctx.beginPath();
    if (fear > 0.4) { ctx.arc(0, 7, 2.4, 0, 7); }
    else { ctx.arc(0, 4, 4, 0.15 * Math.PI, 0.85 * Math.PI); }
    ctx.stroke();
    ctx.restore();
  }

  // =====================================================================
  // Orientation / fullscreen
  // =====================================================================
  function checkOrientation() {
    const portrait = window.innerHeight > window.innerWidth;
    needsRotate = isTouch && portrait;
    rotateScreen.classList.toggle("hidden", !needsRotate);
  }
  document.getElementById("fs-btn").addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) { await (frame.requestFullscreen ? frame.requestFullscreen() : frame.webkitRequestFullscreen());
        if (screen.orientation && screen.orientation.lock) { try { await screen.orientation.lock("landscape"); } catch (e) {} } }
      else { await document.exitFullscreen(); }
    } catch (e) {}
    setTimeout(resize, 150);
  });
  document.addEventListener("fullscreenchange", () => setTimeout(resize, 150));

  // =====================================================================
  // Leaderboard UI
  // =====================================================================
  async function showLeaderboard(from) {
    prevState = from; state = "lb";
    titleScreen.classList.add("hidden"); winScreen.classList.add("hidden");
    lbScreen.classList.remove("hidden");
    const tbody = document.querySelector("#lb-table tbody");
    tbody.innerHTML = "<tr><td colspan='5'>Loading…</td></tr>";
    const scores = await LB.fetchScores();
    if (!scores.length) { tbody.innerHTML = "<tr><td colspan='5' style='padding:18px'>No finishers yet. Be the first 😈</td></tr>"; return; }
    let html = "<tr><th>#</th><th></th><th>Name</th><th>Deaths</th><th>Time</th></tr>";
    scores.slice(0, 50).forEach((s, i) => {
      const cls = i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "";
      const me = (s.name === playerName) ? " class='lb-me'" : "";
      // s.* come from a publicly-writable blob — escape/coerce everything
      html += `<tr${me}><td class="lb-rank ${cls}">${i + 1}</td><td class="lb-flag">${LB.flag(s.cc)}</td>` +
              `<td class="lb-name">${escapeHtml(s.name)}</td><td>${escapeHtml(String(s.deaths ?? "?"))}</td>` +
              `<td>${(Number(s.time) || 0).toFixed(1)}s</td></tr>`;
    });
    tbody.innerHTML = html;
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }
  function hideLeaderboard() {
    lbScreen.classList.add("hidden");
    if (prevState === "win") { winScreen.classList.remove("hidden"); state = "win"; }
    else { titleScreen.classList.remove("hidden"); state = "title"; }
  }

  // =====================================================================
  // Start / wiring
  // =====================================================================
  function startGame() {
    audio();
    const n = (nameInput.value || "").trim().toUpperCase() || "ANON";
    playerName = n; LB.setName(n);
    deaths = 0; elDeaths.textContent = "DEATHS 0";
    runStart = performance.now();
    titleScreen.classList.add("hidden"); winScreen.classList.add("hidden"); lbScreen.classList.add("hidden");
    if (isTouch) touchUI.classList.remove("hidden");
    state = "play";
    loadLevel(0);
  }
  document.getElementById("start-btn").addEventListener("click", startGame);
  document.getElementById("again-btn").addEventListener("click", startGame);
  document.getElementById("lb-btn").addEventListener("click", () => showLeaderboard("title"));
  document.getElementById("lb-btn2").addEventListener("click", () => showLeaderboard("win"));
  document.getElementById("lb-back").addEventListener("click", hideLeaderboard);
  document.getElementById("lb-refresh").addEventListener("click", () => showLeaderboard(prevState));
  nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") startGame(); });

  // =====================================================================
  // Main loop
  // =====================================================================
  let acc = 0, last = 0;
  function frameLoop(now) {
    if (!last) last = now;
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.1) dt = 0.1;
    if (hitStop > 0) { hitStop -= dt; dt *= 0.15; }
    if (!needsRotate) { acc += dt; while (acc >= DT) { step(DT); acc -= DT; } }
    updateParticles(dt);
    render();
    if (state === "play") elTime.textContent = ((performance.now() - runStart) / 1000).toFixed(1) + "s";
    requestAnimationFrame(frameLoop);
  }

  // boot
  resize();
  initGrads();
  nameInput.value = LB.getName();
  loadLevel(0); state = "title";
  LB.geo().then(g => { playerGeo = g; geoLine.textContent = g.cc ? `${LB.flag(g.cc)} ${g.country}` : "Flag: unknown (offline)"; });
  requestAnimationFrame(frameLoop);
})();
