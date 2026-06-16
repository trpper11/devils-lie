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
  const GRAVITY = 2400, MOVE = 250, JUMP = 700, BIG_JUMP = 980, BOUNCE = 980;
  const MAX_FALL = 900, ACCEL = 2600, AIR_ACCEL = 1800, FRICTION = 2200;
  const COYOTE = 0.10, JUMP_BUF = 0.12, DBL_TAP = 0.30;
  const PW = 26, PH = 28; // balloon hitbox (a touch rounder)

  // =====================================================================
  // THEMES — the scenery shifts every 4 levels (and varies per level)
  // =====================================================================
  const THEMES = window.THEMES; // defined in levels.js (shared with the verifier)
  let curTheme = THEMES[0];

  // =====================================================================
  // LEVELS — ascii grids (20x12, row0 = sky). Legend:
  //  # solid   ^ spike   S start   E exit   F fake floor (looks solid, isn't)
  //  P popup spike   D guillotine (timed)   X crusher   M fake exit   O fall-through
  // =====================================================================
  const LEVELS = window.LEVELS; // defined in levels.js

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
  const startBtn = document.getElementById("start-btn");

  const isTouch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
  // QA-only level jump (?lvl=N) — honored on localhost only, so the public board stays honest
  let QA_LEVEL = 0;
  try { if (/^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname)) { const v = parseInt(new URLSearchParams(location.search).get("lvl")); if (v >= 1 && v <= 50) QA_LEVEL = v - 1; } } catch (e) {}

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
  let staticLayer = null, embers = [], GRAD = null, animDt = 1 / 60;
  let exit = null, exitHome = null, exitAlt = null, exitTeleported = false, reverseRange = null, reverseActive = false;
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
  const sndBounce = () => { tone(300, 0.12, "sine", 0.07, 760); tone(600, 0.1, "triangle", 0.04, 1100, 0.02); };
  const sndPop = () => { tone(900, 0.05, "square", 0.12, 200); tone(140, 0.16, "sawtooth", 0.10, 60, 0.02); };
  // lava sizzle: a hiss of noise + low fizzle, then the usual sad trombone
  function sndBurn() {
    const a = audio(); if (a) { try {
      const n = a.createBufferSource(), buf = a.createBuffer(1, a.sampleRate * 0.3, a.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
      const g = a.createGain(); g.gain.setValueAtTime(0.12, a.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.3);
      n.buffer = buf; n.connect(g); g.connect(a.destination); n.start();
    } catch (e) {} }
    tone(180, 0.2, "sawtooth", 0.08, 70);
    [330, 294, 262, 196].forEach((f, i) => tone(f, 0.24, "sawtooth", 0.09, f * 0.94, 0.14 + i * 0.15));
  }
  // the troll death sting: sad descending trombone
  function sndDeath() {
    sndPop();
    const notes = [392, 349, 311, 233];
    notes.forEach((f, i) => tone(f, 0.26, "sawtooth", 0.10, f * 0.94, 0.12 + i * 0.16));
  }
  function sndWin() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.18, "triangle", 0.09, 0, i * 0.10)); }

  // =====================================================================
  // Settings (persisted)
  // =====================================================================
  const DEFAULT_SETTINGS = { controls: "auto", opacity: 0.4, music: true };
  let settings = (() => {
    try { return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(localStorage.getItem("devilslie.settings")) || {}); }
    catch (e) { return Object.assign({}, DEFAULT_SETTINGS); }
  })();
  function saveSettings() { try { localStorage.setItem("devilslie.settings", JSON.stringify(settings)); } catch (e) {} }
  function controlsShouldShow() {
    return settings.controls === "on" || (settings.controls === "auto" && isTouch);
  }
  function applySettings() {
    document.documentElement.style.setProperty("--tbtn-opacity", settings.opacity);
    updateTouchVisibility();
    const mb = document.getElementById("music-btn");
    if (mb) { mb.textContent = settings.music ? "🔊" : "🔇"; mb.classList.toggle("off", !settings.music); mb.title = settings.music ? "Music: on" : "Music: off"; }
  }
  function updateTouchVisibility() {
    const show = state === "play" && controlsShouldShow();
    touchUI.classList.toggle("hidden", !show);
  }

  // =====================================================================
  // Music — soft, playful, procedural (WebAudio; no assets). Pentatonic so it
  // never sounds "wrong". Gentle pad + arpeggio + soft bass on a loop.
  // =====================================================================
  let musicGain = null, musicTimer = null, musicStep = 0;
  // C major pentatonic across a couple octaves (Hz)
  const ARP = [261.63, 329.63, 392.00, 523.25, 392.00, 329.63];
  const BASS = [130.81, 146.83, 110.00, 123.47];      // C2 D2 A1 B1 — a calm I–ii–vi–vii loop
  const PAD = [[261.63, 329.63, 392.00], [293.66, 349.23, 440.00], [220.00, 277.18, 329.63], [246.94, 311.13, 392.00]];
  function mNote(a, freq, dur, type, vol, glideTo) {
    const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + dur + 0.03);
  }
  function musicBeat() {
    const a = actx; if (!a || !settings.music) return;
    const bar = Math.floor(musicStep / 4) % 4, sub = musicStep % 4;
    if (sub === 0) { // downbeat: soft bass + pad swell
      mNote(a, BASS[bar], 1.4, "sine", 0.16);
      PAD[bar].forEach(f => mNote(a, f, 1.7, "triangle", 0.035));
    }
    // arpeggio — gentle, skips a step now and then for a playful feel
    if (sub !== 2 || bar % 2 === 0) mNote(a, ARP[musicStep % ARP.length], 0.5, "sine", 0.055);
    if (sub === 3) mNote(a, ARP[(musicStep + 2) % ARP.length] * 2, 0.3, "triangle", 0.025); // sparkle
    musicStep++;
  }
  function startMusic() {
    const a = audio(); if (!a) return;
    if (a.state === "suspended") a.resume();
    if (!musicGain) { musicGain = a.createGain(); musicGain.gain.value = 0.9; musicGain.connect(a.destination); }
    if (musicTimer) return;
    musicStep = 0; musicBeat();
    musicTimer = setInterval(musicBeat, 380); // ~158 'eighths'/min — relaxed
  }
  function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }
  function setMusic(on) {
    settings.music = on; saveSettings(); applySettings();
    if (on) startMusic(); else stopMusic();
  }

  // =====================================================================
  // Level load
  // =====================================================================
  function rowStr(g, r) { return g[r]; }
  function loadLevel(i) {
    levelIndex = i;
    const L = LEVELS[i];
    grid = L.grid;
    texts = (L.texts || []).map(o => ({ col: o.c, text: o.t }));
    curTheme = THEMES[(L.theme != null ? L.theme : Math.floor(i / 5)) % THEMES.length];
    const spd = L.spd || 1;
    reverseRange = L.rev ? [L.rev[0] * TILE, (L.rev[1] + 1) * TILE] : null;
    traps = [];
    exit = exitAlt = null; exitTeleported = false;
    let start = { c: 1, r: ROWS - 2 };
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const ch = grid[r][c];
      if (ch === "S") start = { c, r };
      else if (ch === "E") exit = { c, r };
      else if (ch === "@") exitAlt = { c, r };
      else if (ch === "P") traps.push({ type: "popup", c, r, up: 0, triggered: false });
      else if (ch === "D") traps.push({ type: "guillotine", c, r, period: 2.0 / spd, down: 0.85, off: c * 0.27 });
      else if (ch === "X") traps.push({ type: "crusher", c, r, period: 2.6 / spd, down: 1.0, off: 0 });
    }
    traps = mergeCrushers(traps);
    exitHome = exit ? { c: exit.c, r: exit.r } : { c: COLS - 2, r: ROWS - 2 };
    if (!exit) exit = { ...exitHome };
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
    exit = { ...exitHome }; exitTeleported = false; reverseActive = false; // reset the runaway door
  }

  function die(popped, burned) {
    if (player.dead) return;
    player.dead = true; player.deathT = 0;
    deaths++; elDeaths.textContent = "DEATHS " + deaths;
    shake = burned ? 20 : 16; hitStop = 0.06;
    if (burned) sndBurn(); else sndDeath();
    // balloon shreds + confetti burst (fire colours when burned in lava)
    const cx = player.x + PW / 2, cy = player.y + PH / 2;
    for (let i = 0; i < (burned ? 38 : 30); i++) {
      const a = (i / 30) * Math.PI * 2, sp = 160 + Math.random() * 360;
      const col = burned
        ? (Math.random() < 0.5 ? "#ff7a18" : (Math.random() < 0.5 ? "#ffd14d" : "#ff3b1e"))
        : (Math.random() < 0.6 ? "#ff3b54" : (Math.random() < 0.5 ? "#ffcf5c" : "#ff5d9e"));
      particles.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (burned ? 200 : 120),
        life: 0.7 + Math.random() * 0.6, r: 3 + Math.random() * 5, col,
        shred: !burned && Math.random() < 0.5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12 });
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
    if (ch === "H") return true;  // phantom gap: looks like a pit, is solid floor
    if (ch === "G") return true;  // fake lava: looks molten, is actually safe floor
    if (ch === "J") return true;  // bounce pad: solid, but launches you when you land on it
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
    const p = ((levelTime + t.off) % t.period) / t.period, dp = Math.min(0.95, t.down / t.period);
    if (p < dp * 0.4) return p / (dp * 0.4);
    if (p < dp) return 1;
    return Math.max(0, 1 - (p - dp) / (1 - dp));
  }
  function crusherDown(t) {
    const p = ((levelTime + t.off) % t.period) / t.period, dp = Math.min(0.95, t.down / t.period);
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
    // ease fear up and down so the face never snaps (was a hard jump to 1)
    player.fear += ((hazardNear ? 1 : 0) - player.fear) * (hazardNear ? 0.18 : 0.08);
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
      // real lava: surface is deadly (top ~60% of the tile so the floor edge stays fair)
      if (ch === "L" && overlap(player.x, player.y, PW, PH, c * TILE, r * TILE + 8, TILE, TILE - 8)) return "burn";
    }
    return null; // real exit (incl. the runaway one) is checked from the `exit` object in step()
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

    let want = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    reverseActive = false;
    if (reverseRange) { const pcx = player.x + PW / 2; reverseActive = pcx >= reverseRange[0] && pcx < reverseRange[1]; if (reverseActive) want = -want; }
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
    }
    if (!keys.jump && player.vy < 0) player.vy += GRAVITY * dt * 0.9; // variable height
    player.vy = Math.min(MAX_FALL, player.vy + GRAVITY * dt);

    const wasGround = player.onGround;
    player.onGround = false;
    moveAxis(player.vx * dt, 0);
    moveAxis(0, player.vy * dt);
    if (!wasGround && player.onGround) { player.landT = 0; sndLand(); } // landed (squash handles the juice; no dust puffs)
    // bounce pad: standing on a J tile flings you upward (enables vertical play)
    if (player.onGround) {
      const fr = Math.floor((player.y + PH) / TILE);
      const cL = Math.floor((player.x + 4) / TILE), cR = Math.floor((player.x + PW - 4) / TILE);
      if ((grid[fr] && (grid[fr][cL] === "J" || grid[fr][cR] === "J"))) {
        player.vy = -BOUNCE; player.onGround = false; player.coyote = 0;
        sndBounce(); shake = Math.max(shake, 4);
        for (let i = 0; i < 6; i++) particles.push({ x: player.x + PW / 2 + (Math.random() - .5) * 16, y: player.y + PH, vx: (Math.random() - .5) * 120, vy: -Math.random() * 80, life: 0.3, r: 2.5, col: "#9fe8c0" });
      }
    }
    player.landT += dt;
    // running animation (feet cycle only — no trailing dust)
    if (player.onGround && Math.abs(player.vx) > 60) player.runCycle += Math.abs(player.vx) * dt * 0.04;

    if (player.y > H + 40) { die(false); return; }
    const td = updateTraps(dt); if (td) { die(td === 2); return; }
    const hit = checkTiles();
    if (hit === "pop") { die(true); return; }
    if (hit === "die") { die(false); return; }
    if (hit === "burn") { die(false, true); return; }
    // runaway exit: get close and the REAL door bolts to its alt spot (once)
    if (exitAlt && !exitTeleported) {
      const ecx = exit.c * TILE + TILE / 2, ecy = exit.r * TILE + TILE / 2;
      if (Math.hypot((player.x + PW / 2) - ecx, (player.y + PH / 2) - ecy) < TILE * 2.6) {
        exit = exitAlt; exitTeleported = true;
        activeText = "🏃💨 nope!"; activeTextT = 1.6; tone(720, 0.1, "square", 0.06, 1300);
        for (let k = 0; k < 14; k++) particles.push({ x: ecx, y: ecy, vx: (Math.random() - .5) * 260, vy: (Math.random() - .5) * 260, life: 0.5, r: 3, col: "#ffcf5c" });
        return; // don't let WIN fire on the same frame the door bolts away
      }
    }
    if (overlap(player.x, player.y, PW, PH, exit.c * TILE + 6, exit.r * TILE + 4, TILE - 12, TILE - 4)) {
      if (levelIndex + 1 < LEVELS.length) { sndWin(); advanceTo(levelIndex + 1); }
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
    const T = curTheme;
    staticLayer = document.createElement("canvas");
    staticLayer.width = W; staticLayer.height = H;
    const g = staticLayer.getContext("2d");
    // sky
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, T.sky[0]); sky.addColorStop(0.55, T.sky[1]); sky.addColorStop(1, T.sky[2]);
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // glow + orb (orb shifts across each 5-level world)
    const ox = W * (0.22 + 0.5 * ((levelIndex % 5) / 4));
    const glow = g.createRadialGradient(ox, H * 0.26, 8, ox, H * 0.26, 150);
    glow.addColorStop(0, T.glow); glow.addColorStop(0.5, T.glow); glow.addColorStop(1, "transparent");
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    g.fillStyle = T.orb; g.beginPath(); g.arc(ox, H * 0.26, 24, 0, 7); g.fill();
    drawDecorBg(g, T);
    // parallax mountains (phase varies per level so each looks different)
    const ph = levelIndex * 0.8;
    function range(baseY, amp, color) {
      g.fillStyle = color; g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W; x += 40) { const y = baseY + Math.sin(x * 0.04 + ph) * amp + ((x / 40) % 2 ? -amp * 0.4 : amp * 0.4); g.lineTo(x, y); }
      g.lineTo(W, H); g.closePath(); g.fill();
    }
    range(H * 0.62, 26, T.mtnA);
    range(H * 0.74, 34, T.mtnB);
    g.fillStyle = T.sil;
    for (let x = 0; x < W; x += 22) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + 11, H - 22 - (x % 60) * 0.2); g.lineTo(x + 22, H); g.closePath(); g.fill(); }
    // static tiles: solid #, spikes ^, decoy B; H draws NOTHING (looks like a gap, is floor)
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const ch = grid[r][c], x = c * TILE, y = r * TILE;
      if (ch === "#") drawBlockTo(g, x, y);
      else if (ch === "^") drawSpikeTo(g, x, y);
      else if (ch === "B") drawDecoyTo(g, x, y);
    }
    // vignette
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.85);
    vg.addColorStop(0, "transparent"); vg.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    embers = []; for (let i = 0; i < 26; i++) embers.push({ x: Math.random() * W, y: Math.random() * H, s: 8 + Math.random() * 20, w: 1 + Math.random() * 2, o: Math.random() * 9, r: 1 + Math.random() * 2 });
  }
  function drawDecorBg(g, T) {
    g.save(); g.globalAlpha = 0.5; g.fillStyle = T.mtnA;
    for (let i = 0; i < 7; i++) {
      const x = ((i * 137 + levelIndex * 53) % (W - 40)) + 20, y = H * 0.34 + ((i * 71 + levelIndex * 29) % 90);
      g.fillStyle = T.mtnA;
      if (T.decor === "crystals") { g.beginPath(); g.moveTo(x, y + 22); g.lineTo(x + 7, y); g.lineTo(x + 14, y + 22); g.closePath(); g.fill(); }
      else if (T.decor === "trees") { g.fillRect(x + 6, y + 8, 4, 16); g.beginPath(); g.arc(x + 8, y + 8, 11, 0, 7); g.fill(); }
      else if (T.decor === "gears") { g.beginPath(); g.arc(x + 9, y + 9, 10, 0, 7); g.fill(); g.fillStyle = T.sky[1]; g.beginPath(); g.arc(x + 9, y + 9, 4, 0, 7); g.fill(); }
      else if (T.decor === "shards") { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 12, y + 8); g.lineTo(x + 4, y + 24); g.closePath(); g.fill(); }
      else { g.beginPath(); g.moveTo(x, y + 20); g.lineTo(x + 8, y); g.lineTo(x + 16, y + 20); g.closePath(); g.fill(); }
    }
    g.restore();
  }
  function drawBlockTo(g, x, y) {
    const B = curTheme.blk;
    g.fillStyle = B[0]; g.fillRect(x, y, TILE, TILE);
    g.fillStyle = B[1]; g.fillRect(x, y, TILE, 6);
    g.fillStyle = B[2]; g.fillRect(x + 3, y + 8, TILE - 6, TILE - 12);
    g.fillStyle = B[3]; g.fillRect(x, y + TILE - 4, TILE, 4);
    g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 1; g.strokeRect(x + .5, y + .5, TILE - 1, TILE - 1);
  }
  function drawSpikeTo(g, x, y) {
    const S = curTheme.spk;
    const grd = g.createLinearGradient(x, y, x, y + TILE); grd.addColorStop(0, S[0]); grd.addColorStop(1, S[1]);
    g.fillStyle = grd; const n = 4, w = TILE / n;
    for (let i = 0; i < n; i++) { g.beginPath(); g.moveTo(x + i * w, y + TILE); g.lineTo(x + i * w + w / 2, y + 10); g.lineTo(x + (i + 1) * w, y + TILE); g.closePath(); g.fill(); }
    g.fillStyle = "#6a6d7a"; g.fillRect(x, y + TILE - 4, TILE, 4);
  }
  function drawDecoyTo(g, x, y) {
    // looks like a spiky obstacle you must jump — but it's just scenery (non-solid, non-deadly)
    g.fillStyle = curTheme.mtnB;
    g.beginPath(); g.moveTo(x + 3, y + TILE); g.lineTo(x + TILE * 0.5, y + 6); g.lineTo(x + TILE - 3, y + TILE); g.closePath(); g.fill();
    g.fillStyle = "rgba(255,255,255,0.07)";
    g.beginPath(); g.moveTo(x + TILE * 0.5, y + 6); g.lineTo(x + TILE * 0.5 + 4, y + 18); g.lineTo(x + TILE * 0.5 - 2, y + 18); g.closePath(); g.fill();
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
    ctx.fillStyle = curTheme.ember;
    for (const e of embers) { ctx.globalAlpha = 0.3 + 0.4 * Math.abs(Math.sin((animTime + e.o) * e.w)); ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;

    // reverse-control zone tint (the floor's normal; your controls aren't)
    if (reverseRange) {
      const rx = reverseRange[0], rw = reverseRange[1] - reverseRange[0];
      ctx.fillStyle = reverseActive ? "rgba(180,80,255,0.20)" : "rgba(150,80,255,0.07)";
      ctx.fillRect(rx, 0, rw, H);
      ctx.strokeStyle = "rgba(200,140,255,0.4)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(rx, 0); ctx.lineTo(rx, H); ctx.moveTo(rx + rw, 0); ctx.lineTo(rx + rw, H); ctx.stroke();
    }

    // fake floors (drawn IDENTICAL to solid — the trick) + decoy platforms + fake doors + lava
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const ch = grid[r][c], x = c * TILE, y = r * TILE;
      if (ch === "F" && !collapsed.has(c + "," + r)) drawBlockTo(ctx, x, y);
      else if (ch === "O") drawFakePlatform(x, y);
      else if (ch === "M") drawDoor(x, y, false);
      else if (ch === "L" || ch === "G") drawLava(x, y, r); // L deadly, G safe — drawn identically (the troll)
      else if (ch === "J") drawBouncePad(x, y);
    }
    if (exit) drawDoor(exit.c * TILE, exit.r * TILE, true); // the real (possibly runaway) door
    for (const t of traps) {
      const tx = t.c * TILE, ty = t.r * TILE;
      if (t.type === "popup" && t.up > 0.02) drawSpikeColumn(tx, ty + TILE - TILE * 0.85 * t.up, TILE * 0.85 * t.up);
      else if (t.type === "guillotine") drawGuillotine(tx, ty, guillotineLen(t, guillotineExtend(t)));
      else if (t.type === "crusher") drawCrusher(tx, ty + crusherTravel(t) * crusherDown(t), (t.w || 1) * TILE);
    }

    if (!player.dead && state === "play") drawPlayer();

    // reversed-controls banner
    if (reverseActive) {
      ctx.fillStyle = "#e0b0ff"; ctx.font = "bold 14px Poppins, sans-serif"; ctx.textAlign = "center";
      ctx.fillText("⇄  CONTROLS REVERSED  ⇄", (reverseRange[0] + reverseRange[1]) / 2, 116); ctx.textAlign = "left";
    }

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
    GRAD.lava = ctx.createLinearGradient(0, 6, 0, TILE);
    GRAD.lava.addColorStop(0, "#ff9b2e"); GRAD.lava.addColorStop(0.45, "#ff5a14"); GRAD.lava.addColorStop(1, "#6e1102");
  }
  function drawFakePlatform(x, y) { ctx.fillStyle = "#33324e"; ctx.fillRect(x, y + 6, TILE, 13); ctx.fillStyle = "#43425f"; ctx.fillRect(x, y + 6, TILE, 4); }
  // bounce pad — a springy mushroom cap on a base; bobs gently so it reads as "boing"
  function drawBouncePad(x, y) {
    const bob = Math.sin(animTime * 4 + x) * 1.5;
    // dark base block
    ctx.fillStyle = "#22202e"; ctx.fillRect(x + 4, y + 20, TILE - 8, TILE - 20);
    ctx.fillStyle = "#2c2a3c"; ctx.fillRect(x + 4, y + 20, TILE - 8, 4);
    // springy cap (green = "go up!")
    const capY = y + 8 + bob;
    const g = ctx.createLinearGradient(0, capY, 0, capY + 16); g.addColorStop(0, "#7fffb0"); g.addColorStop(1, "#1ea866");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x + 2, capY + 14); ctx.quadraticCurveTo(x + TILE / 2, capY - 8, x + TILE - 2, capY + 14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.beginPath(); ctx.ellipse(x + TILE / 2 - 4, capY + 2, 4, 2.5, -0.3, 0, 7); ctx.fill();
    // up chevrons
    ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + TILE / 2 - 5, capY + 9); ctx.lineTo(x + TILE / 2, capY + 4); ctx.lineTo(x + TILE / 2 + 5, capY + 9); ctx.stroke();
  }
  // molten lava (animated). L = deadly, G = safe — drawn identically so you can't tell which lies.
  function drawLava(x, y, row) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = GRAD.lava; ctx.fillRect(0, 6, TILE, TILE - 6);
    // glowing molten crust on top
    const t = animTime;
    ctx.fillStyle = "#ffd86a"; ctx.globalAlpha = 0.85; ctx.fillRect(0, 6, TILE, 2); ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffb24d";
    for (let i = 0; i < 4; i++) {
      const bx = (i * 11 + (x * 0.7)) % TILE;
      const by = 9 + Math.sin(t * 2.4 + i * 1.7 + x) * 2.5;
      const br = 1 + (Math.sin(t * 3.1 + i * 2 + row) * 0.5 + 0.8);
      ctx.globalAlpha = 0.35 + 0.45 * (Math.sin(t * 4 + i + x) * 0.5 + 0.5);
      ctx.beginPath(); ctx.arc(bx, by, br, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // heat shimmer rising
    ctx.fillStyle = "rgba(255,170,80,0.18)";
    for (let i = 0; i < 2; i++) { const hx = ((i * 19 + x + t * 14) % TILE); ctx.fillRect(hx, 0, 2, 6); }
    ctx.restore();
  }
  function drawSpikeColumn(x, y, h) {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = GRAD.spike;
    const n = 4, w = TILE / n;
    for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.moveTo(i * w, h); ctx.lineTo(i * w + w / 2, 0); ctx.lineTo((i + 1) * w, h); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  // Falling hazard — themed "shard" instead of the old arrow/blade. Style per world:
  //  ice = icicle, saw = spinning sawblade, thorn = barbed vine, crystal = shard, blade = stone spike.
  function drawGuillotine(x, y, len) {
    const cxm = x + TILE / 2, haz = curTheme.haz || "blade", spk = curTheme.spk || ["#eef0f6", "#9498a6"];
    // ceiling mount the shard hangs from
    ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(x + 7, y, TILE - 14, 5);
    if (len < 5) { ctx.fillStyle = spk[1]; ctx.fillRect(cxm - 4, y + 3, 8, Math.max(2, len)); return; }
    const tipY = y + len, topY = y + 3, halfW = 8;
    if (haz === "saw") {
      // chain + spinning sawblade at the tip
      ctx.strokeStyle = "#5a5a6a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cxm, topY); ctx.lineTo(cxm, tipY - 11); ctx.stroke();
      const R = 13, cy = tipY - 10, teeth = 9;
      ctx.fillStyle = spk[1]; ctx.beginPath();
      for (let i = 0; i < teeth * 2; i++) { const ang = (i / (teeth * 2)) * 6.283 + animTime * 9, rr = i % 2 ? R : R * 0.66; ctx.lineTo(cxm + Math.cos(ang) * rr, cy + Math.sin(ang) * rr); }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#22222c"; ctx.beginPath(); ctx.arc(cxm, cy, 3, 0, 7); ctx.fill();
      return;
    }
    if (haz === "thorn") {
      ctx.fillStyle = spk[1]; ctx.fillRect(cxm - 4, topY, 8, len - 6);
      ctx.fillStyle = spk[0];
      for (let yy = topY + 6; yy < tipY - 6; yy += 8) {
        ctx.beginPath(); ctx.moveTo(cxm - 4, yy); ctx.lineTo(cxm - 11, yy + 3); ctx.lineTo(cxm - 4, yy + 7); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cxm + 4, yy); ctx.lineTo(cxm + 11, yy + 3); ctx.lineTo(cxm + 4, yy + 7); ctx.fill();
      }
      ctx.beginPath(); ctx.moveTo(cxm - 6, tipY - 8); ctx.lineTo(cxm, tipY); ctx.lineTo(cxm + 6, tipY - 8); ctx.closePath(); ctx.fill();
      return;
    }
    // ice / crystal / blade are all a slim tapering shard with a connecting stalk
    const g = ctx.createLinearGradient(cxm, topY, cxm, tipY);
    if (haz === "ice") { g.addColorStop(0, "#eaf7ff"); g.addColorStop(0.6, spk[1]); g.addColorStop(1, "#dff2ff"); }
    else if (haz === "crystal") { g.addColorStop(0, spk[0]); g.addColorStop(1, spk[1]); }
    else { g.addColorStop(0, "#9aa0ad"); g.addColorStop(0.55, spk[1]); g.addColorStop(1, "#b02030"); } // blade: stone→hot tip
    ctx.fillStyle = "#5a5a6a"; ctx.fillRect(cxm - 2, topY, 4, len - 12); // stalk
    ctx.globalAlpha = haz === "ice" ? 0.92 : 1; ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cxm - halfW, topY + 4); ctx.lineTo(cxm + halfW, topY + 4);
    ctx.lineTo(cxm + 3, tipY - 12); ctx.lineTo(cxm, tipY); ctx.lineTo(cxm - 3, tipY - 12);
    ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    // highlight streak
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath(); ctx.moveTo(cxm - 2, topY + 6); ctx.lineTo(cxm, topY + 6); ctx.lineTo(cxm, tipY - 8); ctx.closePath(); ctx.fill();
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

    // --- smoothed animation values (eased, so nothing snaps/twitches) ---
    if (player.look === undefined) { player.look = player.facing; player.feet = 0; }
    const ease = Math.min(1, animDt * 12);
    player.look += (player.facing - player.look) * ease;       // eyes glide toward facing
    const moving = player.onGround && Math.abs(player.vx) > 40;
    const feetTarget = moving ? Math.sin(player.runCycle) : 0;  // feet settle level when idle
    player.feet += (feetTarget - player.feet) * Math.min(1, animDt * 18);
    const fear = player.fear;

    // gentle squash & stretch (small amplitudes — calm, not jumpy)
    let sx = 1, sy = 1;
    if (player.onGround) { const land = Math.min(1, player.landT * 9); sx = 1 + 0.13 * (1 - land); sy = 1 - 0.13 * (1 - land); }
    else { const v = Math.max(-1, Math.min(1, player.vy / 800)); sy = 1 + 0.14 * Math.abs(v); sx = 1 - 0.10 * Math.abs(v); }

    ctx.save();
    ctx.translate(cx, cy + R * (1 - sy)); ctx.scale(sx, sy);

    // little feet (gentle run cycle; level when standing)
    const ft = player.feet * 4;
    ctx.fillStyle = "#c01030";
    ctx.beginPath(); ctx.ellipse(-R * 0.42, R * 0.92 - ft, 5, 4, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(R * 0.42, R * 0.92 + ft, 5, 4, 0, 0, 7); ctx.fill();

    // balloon body (cached gradient — local space is constant)
    ctx.fillStyle = GRAD.balloon; ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fill();
    // knot
    ctx.fillStyle = "#c01030"; ctx.beginPath(); ctx.moveTo(-3, R - 1); ctx.lineTo(3, R - 1); ctx.lineTo(0, R + 4); ctx.closePath(); ctx.fill();
    // shine
    ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.beginPath(); ctx.ellipse(-R * 0.35, -R * 0.4, R * 0.18, R * 0.26, -0.5, 0, 7); ctx.fill();

    // eyes (glide toward movement; widen a little with fear)
    const lx = player.look * 1.8, eyeR = 5 + fear * 1.2;
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(-6 + lx * 0.25, -2, eyeR, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(6 + lx * 0.25, -2, eyeR, 0, 7); ctx.fill();
    ctx.fillStyle = "#160018";
    ctx.beginPath(); ctx.arc(-6 + lx * 0.55, -2 + fear * 0.8, 2.4, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(6 + lx * 0.55, -2 + fear * 0.8, 2.4, 0, 7); ctx.fill();
    // mouth: smile normally, "o" of fear when a hazard is near
    ctx.strokeStyle = "#160018"; ctx.lineWidth = 1.6; ctx.beginPath();
    if (fear > 0.45) { ctx.arc(0, 7, 2.2, 0, 7); }
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
    const podium = document.getElementById("lb-podium");
    const list = document.getElementById("lb-list");
    podium.innerHTML = ""; list.innerHTML = "<div class='lb-loading'>Loading the hall of survivors…</div>";
    const scores = await LB.fetchScores();
    if (!scores.length) { list.innerHTML = "<div class='lb-empty'>No finishers yet.<br>Be the first to beat the Devil 😈</div>"; return; }
    // Podium — top 3 (order: 2nd, 1st, 3rd for the classic stepped look)
    const top = scores.slice(0, 3);
    const order = top.length === 3 ? [1, 0, 2] : top.map((_, i) => i);
    const medals = ["🥇", "🥈", "🥉"], place = ["first", "second", "third"];
    podium.innerHTML = order.map(idx => {
      const s = top[idx]; if (!s) return "";
      const me = s.name === playerName ? " me" : "";
      return `<div class="pod pod-${place[idx]}${me}">
        <div class="pod-medal">${medals[idx]}</div>
        <div class="pod-flag">${LB.flag(s.cc)}</div>
        <div class="pod-name">${escapeHtml(s.name)}</div>
        <div class="pod-stat"><b>${escapeHtml(String(s.deaths ?? "?"))}</b> deaths</div>
        <div class="pod-stat pod-time">${(Number(s.time) || 0).toFixed(1)}s</div>
      </div>`;
    }).join("");
    // List — ranks 4+ (plus a header row)
    let html = "<div class='lb-row lb-head'><span class='r'>#</span><span class='f'></span><span class='n'>NAME</span><span class='d'>DEATHS</span><span class='t'>TIME</span></div>";
    scores.slice(3, 60).forEach((s, i) => {
      const rank = i + 4, me = s.name === playerName ? " lb-me" : "";
      html += `<div class="lb-row${me}"><span class="r">${rank}</span><span class="f">${LB.flag(s.cc)}</span>` +
              `<span class="n">${escapeHtml(s.name)}</span><span class="d">${escapeHtml(String(s.deaths ?? "?"))}</span>` +
              `<span class="t">${(Number(s.time) || 0).toFixed(1)}s</span></div>`;
    });
    list.innerHTML = html;
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
  function nameValid() { return (nameInput.value || "").trim().length >= 1; }
  function refreshStartBtn() {
    const ok = nameValid();
    startBtn.disabled = !ok;
    startBtn.classList.toggle("disabled", !ok);
  }
  function rejectNoName() {
    nameInput.focus();
    nameInput.classList.remove("shake"); void nameInput.offsetWidth; nameInput.classList.add("shake");
    geoLine.dataset.hint = "1"; geoLine.textContent = "👆 Enter a name to play";
  }
  function startGame() {
    if (!nameValid()) { rejectNoName(); return; }
    audio();
    const n = nameInput.value.trim().toUpperCase().slice(0, 14);
    playerName = n; LB.setName(n);
    deaths = 0; elDeaths.textContent = "DEATHS 0";
    runStart = performance.now();
    titleScreen.classList.add("hidden"); winScreen.classList.add("hidden"); lbScreen.classList.add("hidden");
    document.getElementById("settings-screen").classList.add("hidden");
    document.getElementById("stage-screen").classList.add("hidden");
    state = "play";
    updateTouchVisibility();
    if (settings.music) startMusic();
    loadLevel(QA_LEVEL);
  }
  startBtn.addEventListener("click", startGame);
  document.getElementById("again-btn").addEventListener("click", startGame);

  // ----- Stage interstitials (act breaks) -----
  const STAGES = {
    20: { kicker: "STAGE 2", title: "THE VOID", tag: "Everything you learned? The Void forgot to care." },
    40: { kicker: "FINAL STAGE", title: "OVERDRIVE", tag: "Saws, storms, nightmares. No more training wheels." },
  };
  let pendingLevel = 0;
  function advanceTo(next) {
    if (STAGES[next]) { showStage(next); return; }
    loadLevel(next);
  }
  function showStage(next) {
    pendingLevel = next;
    const s = STAGES[next];
    document.getElementById("stage-kicker").textContent = s.kicker;
    document.getElementById("stage-title").textContent = s.title;
    document.getElementById("stage-tag").textContent = s.tag;
    document.getElementById("stage-screen").classList.remove("hidden");
    state = "stage"; // pauses stepping
    updateTouchVisibility();
  }
  document.getElementById("stage-go").addEventListener("click", () => {
    document.getElementById("stage-screen").classList.add("hidden");
    state = "play"; updateTouchVisibility();
    loadLevel(pendingLevel);
  });

  // ----- Music + Settings wiring -----
  document.getElementById("music-btn").addEventListener("click", () => setMusic(!settings.music));
  function syncSettingsUI() {
    document.querySelectorAll("#set-controls button").forEach(b => b.classList.toggle("sel", b.dataset.v === settings.controls));
    document.querySelectorAll("#set-music button").forEach(b => b.classList.toggle("sel", b.dataset.v === (settings.music ? "on" : "off")));
    const op = document.getElementById("set-opacity"); op.value = Math.round(settings.opacity * 100);
    document.getElementById("set-op-val").textContent = Math.round(settings.opacity * 100) + "%";
  }
  let settingsReturn = "title";
  function openSettings() { settingsReturn = (state === "settings") ? settingsReturn : state; state = "settings"; syncSettingsUI(); document.getElementById("settings-screen").classList.remove("hidden"); updateTouchVisibility(); }
  function closeSettings() { document.getElementById("settings-screen").classList.add("hidden"); state = settingsReturn === "settings" ? "title" : settingsReturn; updateTouchVisibility(); }
  document.getElementById("settings-btn").addEventListener("click", () => { audio(); openSettings(); });
  document.getElementById("set-back").addEventListener("click", closeSettings);
  document.querySelectorAll("#set-controls button").forEach(b => b.addEventListener("click", () => { settings.controls = b.dataset.v; saveSettings(); applySettings(); syncSettingsUI(); }));
  document.querySelectorAll("#set-music button").forEach(b => b.addEventListener("click", () => { setMusic(b.dataset.v === "on"); syncSettingsUI(); }));
  document.getElementById("set-opacity").addEventListener("input", (e) => { settings.opacity = Math.max(0.15, Math.min(1, e.target.value / 100)); document.getElementById("set-op-val").textContent = Math.round(settings.opacity * 100) + "%"; document.documentElement.style.setProperty("--tbtn-opacity", settings.opacity); });
  document.getElementById("set-opacity").addEventListener("change", saveSettings);
  nameInput.addEventListener("input", () => {
    refreshStartBtn();
    if (nameValid() && geoLine.dataset.hint) { geoLine.dataset.hint = ""; geoLine.textContent = playerGeo.cc ? `${LB.flag(playerGeo.cc)} ${playerGeo.country}` : "Detecting your flag…"; }
  });
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
    animDt = dt;
    if (hitStop > 0) { hitStop -= dt; dt *= 0.15; }
    if (!needsRotate && !window.__DLman) { acc += dt; while (acc >= DT) { step(DT); acc -= DT; } }
    updateParticles(dt);
    render();
    updateTouchVisibility();
    if (state === "play") elTime.textContent = ((performance.now() - runStart) / 1000).toFixed(1) + "s";
    requestAnimationFrame(frameLoop);
  }

  // Debug hook (localhost only) — lets the headless verifier read state & drive input.
  try {
    if (/^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname)) {
      window.__DL = () => ({ state, level: levelIndex + 1, deaths, px: player && player.x, py: player && player.y,
        onGround: player && player.onGround, exitC: exit && exit.c, reverse: reverseActive });
      window.__DLstart = (nm) => { nameInput.value = nm || "BOT"; startGame(); };
      window.__DLkey = (k, down) => { if (k === "left") keys.left = down; else if (k === "right") keys.right = down; else if (k === "jump") { if (down) pressJump(); else releaseJump(); } };
      // deterministic single-step driver (for replaying solver plans against the real engine)
      window.__DLmanual = (on) => { window.__DLman = !!on; };
      window.__DLtick = (dir, jumpStart, jumpHold) => {
        keys.right = dir > 0; keys.left = dir < 0;
        if (jumpStart) { player.jumpBuf = JUMP_BUF; pendingBig = false; }
        keys.jump = !!jumpHold;
        step(DT);
        return { state, level: levelIndex + 1, px: player.x, py: player.y, dead: player.dead };
      };
    }
  } catch (e) {}

  // boot
  resize();
  initGrads();
  nameInput.value = LB.getName();
  refreshStartBtn();
  applySettings();
  loadLevel(0); state = "title";
  LB.geo().then(g => { playerGeo = g; if (!geoLine.dataset.hint) geoLine.textContent = g.cc ? `${LB.flag(g.cc)} ${g.country}` : "Flag: unknown (offline)"; });
  requestAnimationFrame(frameLoop);
})();
