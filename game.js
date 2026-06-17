/* =====================================================================
   DEVIL'S LIE — a troll platformer (v2: balloon edition)
   Vanilla JS + Canvas. No deps. The level looks normal, then betrays you.
   Every trap is FAIR — there's always a safe path if you're smart & fast.
   ===================================================================== */
(() => {
  "use strict";

  // ---- World (logical resolution; CSS-scaled to fit any screen) --------
  const TILE = 40, COLS = 20, ROWS = 12;
  let LROWS = ROWS;        // rows in the CURRENT level (>12 for multi-story levels); set per level
  let sawWorld = false;    // true in saw-themed worlds → D = spinning blade on a chain (not a falling shard)
  const W = COLS * TILE; // 800
  const H = ROWS * TILE; // 480

  // ---- Physics (px, seconds) ------------------------------------------
  const GRAVITY = 2400, MOVE = 250, JUMP = 700, BIG_JUMP = 980, BOUNCE = 980, DBL_JUMP = 660;
  const MAX_FALL = 900, ACCEL = 3300, AIR_ACCEL = 2400, FRICTION = 2600;
  const COYOTE = 0.10, JUMP_BUF = 0.12, DBL_TAP = 0.30;
  const PW = 26, PH = 28;   // solid-collision box (floors/walls/gaps) — unchanged so platforming stays tuned
  const HBX = 3, HBY = 3;   // hazard box inset — spikes/lava/traps test this tighter box (matches the round balloon)

  // ---- Power-ups (pick ONE at the start; each boon costs a sacrifice) ----
  const POWERS = {
    none:    { dbljump: false, moveMul: 1,    jumpMul: 1,    trueSight: false },
    dbljump: { dbljump: true,  moveMul: 1,    jumpMul: 0.90, trueSight: false }, // +double jump, −jump height
    speed:   { dbljump: false, moveMul: 1.25, jumpMul: 0.90, trueSight: false }, // +speed, −jump height
    sight:   { dbljump: false, moveMul: 1,    jumpMul: 0.90, trueSight: true  }, // +see the lies, −jump height
  };
  let pwr = POWERS.none, pwrId = "none";
  // ---- Upgrade charge: a power lasts ~4-5 levels. The bar on top grows a little on a clean
  // (deathless) clear, drains on every death, and is spent a chunk each level you use it. At 0
  // the upgrade LAPSES back to no power. ----
  const PWR_META = {
    dbljump: { label: "DOUBLE JUMP", col: "#5cc8ff" },
    speed:   { label: "SPEED",       col: "#ffd14d" },
    sight:   { label: "TRUE SIGHT",  col: "#b388ff" },
  };
  const PWR_LEVEL_COST = 0.22, PWR_CLEAN_BONUS = 0.10, PWR_DEATH_DRAIN = 0.14;
  let pwrCharge = 0, pwrChargeShown = 0, levelDeaths = 0;
  let baseGlow = true;   // neon under-glow on the character (toggle with L)

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
    // Crisp but CHEAP: cap DPR at 2 (full-retina sharp) AND cap total backing-store area so the
    // per-frame dynamic redraw stays light — that's exactly why the small preview never drops a
    // frame. A 3x canvas on a 4K display is ~7 MP/frame; this keeps it ~2.3 MP → buttery 60 fps.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let cw = Math.floor(cssW * dpr), ch = Math.floor(cssH * dpr);
    const MAXPX = 2300000;
    if (cw * ch > MAXPX) { const k = Math.sqrt(MAXPX / (cw * ch)); cw = Math.max(1, Math.floor(cw * k)); ch = Math.max(1, Math.floor(ch * k)); }
    canvas.width = cw; canvas.height = ch;
    renderScale = canvas.width / W;
    checkOrientation();
    if (grid) { if (_staticTimer) clearTimeout(_staticTimer); _staticTimer = setTimeout(() => { _staticTimer = null; if (grid) buildStaticLayer(); }, 120); } // debounced re-bake (crisp, no drag jank)
  }
  let _staticTimer = null;
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
  let staticLayer = null, staticSR = 1, embers = [], GRAD = null, animDt = 1 / 60, camY = 0;
  let exit = null, exitHome = null, exitAlt = null, exitTeleported = false, reverseRange = null, reverseActive = false;
  let doorCells = [], fakeDoors = new Set(); // all door cells, and which ones kill (the real exit is randomized)
  let teleSrc = [], teleDst = [];            // teleport doors (T) and their landing points (t)
  let playerName = "", playerGeo = { country: "", cc: "" };
  let needsRotate = false;

  // =====================================================================
  // Input
  // =====================================================================
  const keys = { left: false, right: false, jump: false };
  let lastJumpTap = -1, pendingBig = false;

  function pressJump() {
    lastJumpTap = animTime;
    if (player.onGround || player.coyote > 0) {
      player.jumpBuf = JUMP_BUF;            // ground jump (buffered with coyote-time)
    } else if (pwr.dbljump && !player.dblUsed) {
      player.vy = -DBL_JUMP * pwr.jumpMul;  // mid-air DOUBLE JUMP — only with the Double Jump power
      player.dblUsed = true;
      sndJump(true);
    }
    keys.jump = true;
  }
  function releaseJump() { keys.jump = false; }

  // Robust keyboard: movement flags are always tracked (effect only applies while
  // playing), so a held key keeps working across deaths/level loads. Jump/restart
  // only fire during play. Typing your name is never hijacked.
  window.addEventListener("keydown", (e) => {
    if (e.target === nameInput) return;                 // let the name field type freely
    const k = e.key.toLowerCase();
    // While playing, the game OWNS the keyboard. If a chrome/touch button is focused (from a
    // mouse click or a stray Tab), Space (jump) or Enter would "click" it and pop an overlay
    // that pauses the game — which feels exactly like "WASD stopped working". So: keep Tab from
    // moving focus, drop focus off any focused button, and swallow Enter mid-game.
    if (state === "play" || state === "stage") {
      if (k === "tab") { e.preventDefault(); return; }
      const ae = document.activeElement;
      if (ae && ae.tagName === "BUTTON") ae.blur();
      if (k === "enter") { e.preventDefault(); return; }
    }
    if (k === "arrowleft" || k === "a") { keys.left = true; e.preventDefault(); }
    else if (k === "arrowright" || k === "d") { keys.right = true; e.preventDefault(); }
    else if (k === "arrowup" || k === "w" || k === " ") { if (state === "play" && !e.repeat) pressJump(); e.preventDefault(); }
    else if (k === "r") { if (state === "play") respawn(); }
    else if (k === "l") { baseGlow = !baseGlow; settings.glow = baseGlow; saveSettings(); }
  });
  window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (k === "arrowleft" || k === "a") keys.left = false;
    else if (k === "arrowright" || k === "d") keys.right = false;
    else if (k === "arrowup" || k === "w" || k === " ") releaseJump();
  });
  // never get stuck "holding" a key when focus leaves the window
  window.addEventListener("blur", () => { keys.left = keys.right = keys.jump = false; });
  // a clicked button must not KEEP focus — otherwise the next Space (jump) would re-activate it
  document.addEventListener("click", (e) => { const btn = e.target && e.target.closest && e.target.closest("button"); if (btn) btn.blur(); });

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
  const DEFAULT_SETTINGS = { controls: "auto", opacity: 0.4, music: true, glow: true };
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
    baseGlow = settings.glow !== false;
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
    levelDeaths = 0; // track deaths within this level for the clean-clear upgrade bonus
    const L = LEVELS[i];
    grid = L.grid;
    LROWS = grid.length; // multi-story levels are taller than one screen
    texts = (L.texts || []).map(o => ({ col: o.c, text: o.t }));
    curTheme = THEMES[(L.theme != null ? L.theme : Math.floor(i / 5)) % THEMES.length];
    sawWorld = curTheme.haz === "saw";
    const spd = L.spd || 1;
    reverseRange = L.rev ? [L.rev[0] * TILE, (L.rev[1] + 1) * TILE] : null;
    traps = [];
    exit = exitAlt = null; exitTeleported = false; teleSrc = []; teleDst = [];
    let start = { c: 1, r: LROWS - 2 }, eCell = null, mCells = [];
    for (let r = 0; r < LROWS; r++) for (let c = 0; c < COLS; c++) {
      const ch = grid[r][c];
      if (ch === "S") start = { c, r };
      else if (ch === "E") eCell = { c, r };
      else if (ch === "M") mCells.push({ c, r });
      else if (ch === "T") teleSrc.push({ c, r });       // teleport door (looks like a door)
      else if (ch === "t") teleDst.push({ c, r });       // teleport landing point
      else if (ch === "@") exitAlt = { c, r };
      else if (ch === "P") traps.push({ type: "popup", c, r, up: 0, triggered: false });
      // timed traps get a RANDOM phase each run, so the rhythm can't be memorised (each is still
      // individually passable — wait for its window — and there's safe ground between them).
      else if (ch === "D") { const p = (sawWorld ? 2.0 : 2.6) / spd; traps.push({ type: "guillotine", c, r, period: p, down: 0.85, off: Math.random() * p }); }
      else if (ch === "X") { const p = 2.6 / spd; traps.push({ type: "crusher", c, r, period: p, down: 1.0, off: Math.random() * p }); }
    }
    traps = mergeCrushers(traps);
    // RANDOMIZE which gate is the real exit (so the 2nd door isn't always right).
    doorCells = (eCell ? [eCell] : []).concat(mCells);
    if (exitAlt) { exit = eCell ? { ...eCell } : null; }            // runaway levels keep their special logic
    else if (doorCells.length) { exit = { ...doorCells[Math.floor(Math.random() * doorCells.length)] }; }
    if (!exit) exit = { c: COLS - 2, r: LROWS - 2 };
    exitHome = { c: exit.c, r: exit.r };
    // every OTHER door is a deadly fake
    fakeDoors = new Set(doorCells.filter(d => !(d.c === exit.c && d.r === exit.r)).map(d => d.c + "," + d.r));
    if (exitAlt) for (const d of mCells) fakeDoors.add(d.c + "," + d.r); // runaway: all M are fakes
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
    player.prevX = player.x; player.prevY = player.y; // interpolation: no glide from the old spot
    player.vx = 0; player.vy = 0;
    player.onGround = false; player.coyote = 0; player.jumpBuf = 0; player.facing = 1;
    player.dead = false; player.deathT = 0; player.landT = 1; player.runCycle = 0; player.fear = 0;
    player.look = player.facing; player.feet = 0; player.dblUsed = false;
    collapsed = new Set();
    textShown = new Set();
    activeText = null; activeTextT = 0; levelTime = 0;
    pendingBig = false; lastJumpTap = -1; keys.jump = false;
    // NOTE: keys.left/right are intentionally NOT cleared here, so a held key keeps you moving after respawn
    for (const t of traps) { t.up = 0; t.triggered = false; }
    exit = { ...exitHome }; exitTeleported = false; reverseActive = false; // reset the runaway door
  }

  function die(popped, burned) {
    if (player.dead) return;
    player.dead = true; player.deathT = 0;
    deaths++; elDeaths.textContent = "DEATHS " + deaths;
    if (pwrId !== "none") { levelDeaths++; pwrCharge -= PWR_DEATH_DRAIN; if (pwrCharge <= 0) lapsePower(); } // each death bleeds the upgrade bar
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
    LB.finish({ name: playerName, cc: playerGeo.cc, country: playerGeo.country, deaths, time: +runElapsed.toFixed(1), totalLevels: LEVELS.length })
      .then(ok => { submitStatus.textContent = ok ? "✓ Score saved to the global leaderboard." : "✓ Score saved to your leaderboard."; })
      .catch(() => { submitStatus.textContent = "✓ Score saved."; });
  }

  // =====================================================================
  // Collision
  // =====================================================================
  function solidAt(c, r) {
    if (c < 0 || c >= COLS) return true;
    if (r < 0 || r >= LROWS) return false;
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
  // Falling shard: a piece forms at the ceiling (telegraph), then DROPS under gravity
  // to the floor and shatters, then a new one forms next cycle. Deadly only while falling.
  const SHARD_WARN = 0.34, SHARD_FALL = 0.82; // slower fall so the big ice shard is clearly visible
  function shardState(t) {
    const cyc = (levelTime + t.off) % t.period, ceil = t.r * TILE, floorTop = (LROWS - 1) * TILE;
    if (cyc < SHARD_WARN) return { phase: "warn", k: cyc / SHARD_WARN, y: ceil };
    if (cyc < SHARD_WARN + SHARD_FALL) { const k = (cyc - SHARD_WARN) / SHARD_FALL; return { phase: "fall", k, y: ceil + Math.pow(k, 1.3) * (floorTop - ceil) }; }
    return { phase: "gone", k: 0, y: ceil };
  }
  // Saw worlds keep the old spinning-blade-on-a-chain: it lowers to the floor and rises on a rhythm.
  function sawExtend(t) {
    const p = ((levelTime + t.off) % t.period) / t.period, dp = Math.min(0.95, t.down / t.period);
    if (p < dp * 0.4) return p / (dp * 0.4);
    if (p < dp) return 1;
    return Math.max(0, 1 - (p - dp) / (1 - dp));
  }
  function sawLen(t, f) { return (LROWS - 1 - t.r) * TILE * f; }
  function crusherDown(t) {
    const p = ((levelTime + t.off) % t.period) / t.period, dp = Math.min(0.95, t.down / t.period);
    if (p < dp * 0.25) return p / (dp * 0.25);
    if (p < dp) return 1;
    return Math.max(0, 1 - (p - dp) / (1 - dp));
  }
  function crusherTravel(t) { return (LROWS - 1 - t.r) * TILE; }

  function updateTraps(dt) {
    const px = player.x, py = player.y; let dead = 0, hazardNear = 0;
    // tighter hazard box (HB*) — matches the round balloon so deaths read as real touches
    const hx = px + HBX, hy = py + HBY, hw = PW - 2 * HBX, hh = PH - 2 * HBY;
    for (const t of traps) {
      const tx = t.c * TILE, ty = t.r * TILE;
      if (t.type === "popup") {
        const cx = tx + TILE / 2, near = Math.abs((px + PW / 2) - cx) < TILE * 0.75;
        if (near && !t.triggered) { t.triggered = true; tone(660, 0.08, "square", 0.05, 920); }
        t.up = Math.min(1, t.up + (t.triggered ? dt * 16 : -dt * 6));
        if (Math.abs((px + PW / 2) - cx) < TILE * 1.4) hazardNear = 1;
        if (t.up > 0.12) { const sh = TILE * 0.85 * t.up;
          if (overlap(hx, hy, hw, hh, tx + 6, ty + TILE - sh, TILE - 12, sh)) dead = 2; }
      } else if (t.type === "guillotine") {
        if (sawWorld) { // spinning sawblade on a chain (extend/retract)
          const f = sawExtend(t), len = sawLen(t, f);
          if (Math.abs((px + PW / 2) - (tx + TILE / 2)) < TILE * 1.3) hazardNear = 1;
          if (f > 0.05 && overlap(hx, hy, hw, hh, tx + 7, ty, TILE - 14, len)) dead = 2;
        } else {        // big falling ICE shard (drops & shatters)
          const s = shardState(t);
          if (s.phase !== "gone" && Math.abs((px + PW / 2) - (tx + TILE / 2)) < TILE * 1.2) hazardNear = 1;
          if (s.phase === "fall" && overlap(hx, hy, hw, hh, tx + 7, s.y, TILE - 14, TILE - 4)) dead = 2;
          const cycNum = Math.floor((levelTime + t.off) / t.period);
          if (s.phase === "gone" && t.shatterCyc !== cycNum) {
            t.shatterCyc = cycNum; sndBreak();
            for (let i = 0; i < 9; i++) particles.push({ x: tx + TILE / 2, y: (LROWS - 1) * TILE, vx: (Math.random() - .5) * 240, vy: -Math.random() * 170, life: 0.45, r: 2.6, col: Math.random() < 0.6 ? "#dff2ff" : "#9fd8f2" });
          }
        }
      } else if (t.type === "crusher") {
        const f = crusherDown(t), w = (t.w || 1) * TILE, by = ty + crusherTravel(t) * f;
        if (overlap(px, py, PW, PH, tx - 6, ty, w + 12, by - ty + TILE + 8)) hazardNear = 1;
        if (f > 0.02 && overlap(hx, hy, hw, hh, tx, ty, w, by - ty + TILE)) dead = 1;
      }
    }
    // fake floors shatter the instant you touch them (robust: no onGround reliance)
    const fc1 = Math.floor(px / TILE), fc2 = Math.floor((px + PW - 1) / TILE);
    const fr1 = Math.floor(py / TILE), fr2 = Math.floor((py + PH - 1) / TILE);
    for (let r = fr1; r <= fr2; r++) for (let c = fc1; c <= fc2; c++)
      if (r >= 0 && r < LROWS && grid[r] && grid[r][c] === "F" && !collapsed.has(c + "," + r)) breakFloor(c, r);
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
    // tighter hazard box than the solid-collision box, matching the round balloon
    const hx = player.x + HBX, hy = player.y + HBY, hw = PW - 2 * HBX, hh = PH - 2 * HBY;
    const c1 = Math.floor(hx / TILE), c2 = Math.floor((hx + hw - 1) / TILE);
    const r1 = Math.floor(hy / TILE), r2 = Math.floor((hy + hh - 1) / TILE);
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
      if (c < 0 || c >= COLS || r < 0 || r >= LROWS) continue;
      const ch = grid[r][c];
      // spikes are deadly right up to their tips now — touch a needle, pop instantly
      if (ch === "^" && overlap(hx, hy, hw, hh, c * TILE + 2, r * TILE + 8, TILE - 4, TILE - 8)) return "pop";
      // a FAKE door (randomized) blasts you — the real exit is the other one
      if (fakeDoors.has(c + "," + r) && overlap(hx, hy, hw, hh, c * TILE + 6, r * TILE + 4, TILE - 12, TILE - 4)) return "die";
      // real lava: surface is deadly (top ~60% of the tile so the floor edge stays fair)
      if (ch === "L" && overlap(hx, hy, hw, hh, c * TILE, r * TILE + 8, TILE, TILE - 8)) return "burn";
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
    // remember the pre-step position so render() can interpolate between physics ticks
    if (player) { player.prevX = player.x; player.prevY = player.y; }

    if (player.dead) { player.deathT += dt; if (player.deathT > 0.7) respawn(); return; }
    levelTime += dt;

    let want = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    reverseActive = false;
    if (reverseRange) { const pcx = player.x + PW / 2; reverseActive = pcx >= reverseRange[0] && pcx < reverseRange[1]; if (reverseActive) want = -want; }
    if (want !== 0) player.facing = want;
    const a = player.onGround ? ACCEL : AIR_ACCEL;
    const moveCap = MOVE * pwr.moveMul;
    if (want !== 0) { player.vx += want * a * dt; player.vx = Math.max(-moveCap, Math.min(moveCap, player.vx)); }
    else { const f = FRICTION * dt; if (player.vx > f) player.vx -= f; else if (player.vx < -f) player.vx += f; else player.vx = 0; }

    if (player.jumpBuf > 0) player.jumpBuf -= dt;
    if (player.onGround) player.coyote = COYOTE; else player.coyote -= dt;
    if (player.jumpBuf > 0 && player.coyote > 0) {
      const big = pendingBig; player.vy = -(big ? BIG_JUMP : JUMP) * pwr.jumpMul;
      player.onGround = false; player.coyote = 0; player.jumpBuf = 0; pendingBig = false;
      sndJump(big);
    }
    if (!keys.jump && player.vy < 0) player.vy += GRAVITY * dt * 0.9; // variable height
    player.vy = Math.min(MAX_FALL, player.vy + GRAVITY * dt);

    const wasGround = player.onGround;
    player.onGround = false;
    moveAxis(player.vx * dt, 0);
    moveAxis(0, player.vy * dt);
    // GROUND STICK: if solid floor is right under the feet, rest on it (vy=0, grounded).
    // Without this a resting player perpetually micro-falls ~1px and re-lands every frame
    // (the floor isn't "detected" until the hitbox overlaps it) — that was the vibration/twitch.
    if (!player.onGround && player.vy >= 0) {
      const footRow = Math.floor((player.y + PH) / TILE);
      const cL = Math.floor((player.x + 2) / TILE), cR = Math.floor((player.x + PW - 2) / TILE);
      if (solidAt(cL, footRow) || solidAt(cR, footRow)) { player.y = footRow * TILE - PH; player.vy = 0; player.onGround = true; }
    }
    if (!wasGround && player.onGround) { player.landT = 0; player.dblUsed = false; sndLand(); } // landed; refresh the double jump
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

    if (player.y > LROWS * TILE + 40) { die(false); return; }
    const td = updateTraps(dt); if (td) { die(td === 2); return; }
    const hit = checkTiles();
    if (hit === "pop") { die(true); return; }
    if (hit === "die") { die(false); return; }
    if (hit === "burn") { die(false, true); return; }
    // teleport door: enter T → warp to a random landing point (even mid-air)
    if (player.teleCool > 0) player.teleCool -= dt;
    if (teleSrc.length && teleDst.length && player.teleCool <= 0) {
      for (const s of teleSrc) {
        if (overlap(player.x, player.y, PW, PH, s.c * TILE + 6, s.r * TILE + 4, TILE - 12, TILE - 4)) {
          const d = teleDst[Math.floor(Math.random() * teleDst.length)];
          const ex0 = player.x + PW / 2, ey0 = player.y + PH / 2;
          player.x = d.c * TILE + (TILE - PW) / 2; player.y = d.r * TILE + (TILE - PH) / 2;
          player.prevX = player.x; player.prevY = player.y; player.vy = 0; player.vx = 0; player.teleCool = 0.4;
          sndBounce(); tone(520, 0.12, "sine", 0.06, 980);
          const ex1 = player.x + PW / 2, ey1 = player.y + PH / 2;
          for (let k = 0; k < 12; k++) { const a = Math.random() * 7, sp = 80 + Math.random() * 160;
            particles.push({ x: ex0, y: ey0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.4, r: 2.5, col: "#b388ff" });
            particles.push({ x: ex1, y: ey1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.4, r: 2.5, col: "#88e0ff" }); }
          return;
        }
      }
    }
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
    const T = curTheme, levelH = LROWS * TILE;
    staticSR = Math.max(1, Math.min(4, renderScale)); // bake the background at display resolution (crisp on 4K)
    staticLayer = document.createElement("canvas");
    staticLayer.width = Math.ceil(W * staticSR); staticLayer.height = Math.ceil(levelH * staticSR);
    const g = staticLayer.getContext("2d");
    g.scale(staticSR, staticSR);                    // draw in logical coords, store at hi-res
    // sky over the first screen…
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, T.sky[0]); sky.addColorStop(0.55, T.sky[1]); sky.addColorStop(1, T.sky[2]);
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // …then dark "underground" below it for multi-story / basement levels
    if (levelH > H) {
      g.fillStyle = T.sky[2]; g.fillRect(0, H, W, levelH - H);
      const ug = g.createLinearGradient(0, H, 0, levelH);
      ug.addColorStop(0, "rgba(0,0,0,0)"); ug.addColorStop(1, "rgba(0,0,0,0.6)");
      g.fillStyle = ug; g.fillRect(0, H, W, levelH - H);
    }
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
    for (let r = 0; r < LROWS; r++) for (let c = 0; c < COLS; c++) {
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
  // TRUE SIGHT — mark the lies: green ✓ = safe (but looks scary), red ✗ = deadly (but looks safe)
  function truthBadge(x, y, ok) {
    ctx.save(); ctx.globalAlpha = 0.92;
    ctx.fillStyle = ok ? "#2cb45a" : "#dc3340"; ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.beginPath();
    if (ok) { ctx.moveTo(x - 3.2, y + 0.3); ctx.lineTo(x - 0.6, y + 3); ctx.lineTo(x + 3.6, y - 3.2); }
    else { ctx.moveTo(x - 3, y - 3); ctx.lineTo(x + 3, y + 3); ctx.moveTo(x + 3, y - 3); ctx.lineTo(x - 3, y + 3); }
    ctx.stroke(); ctx.restore();
  }
  function drawTruthBadges() {
    for (let r = 0; r < LROWS; r++) for (let c = 0; c < COLS; c++) {
      const ch = grid[r][c], x = c * TILE + TILE / 2;
      if (ch === "F" && !collapsed.has(c + "," + r)) truthBadge(x, r * TILE + 9, false); // fake floor — drops you
      else if (ch === "L") truthBadge(x, r * TILE + 4, false);   // real lava — deadly
      else if (ch === "G") truthBadge(x, r * TILE + 4, true);    // fake lava — safe
      else if (ch === "B") truthBadge(x, r * TILE + 6, true);    // decoy — harmless
      else if (ch === "H") truthBadge(x, r * TILE + 30, true);   // phantom gap — solid/safe
    }
    // doors: green ✓ on the real exit, red ✗ on the deadly fakes (reflects the randomized assignment)
    for (const d of doorCells) truthBadge(d.c * TILE + TILE / 2, d.r * TILE + 8, !fakeDoors.has(d.c + "," + d.r));
    if (exit && !doorCells.some(d => d.c === exit.c && d.r === exit.r)) truthBadge(exit.c * TILE + TILE / 2, exit.r * TILE + 8, true);
    // teleport doors get a purple ↻ badge (not exit, not death — it warps you)
    for (const s of teleSrc) {
      const x = s.c * TILE + TILE / 2, y = s.r * TILE + 8;
      ctx.save(); ctx.globalAlpha = 0.92; ctx.fillStyle = "#9b6bff"; ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x, y, 3.2, 0.4, 5.4); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x + 3, y - 1.6, 1.2, 0, 7); ctx.fill(); ctx.restore();
    }
  }
  // rounded-rect path helper (used by the HUD upgrade meter)
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function render() {
    // Interpolate the player between the last two physics ticks for silky motion
    // (decouples the 120 Hz sim from the display refresh — no stutter on any screen).
    if (player) {
      const a = Math.max(0, Math.min(1, acc / DT));
      if (player.prevX === undefined) { player.prevX = player.x; player.prevY = player.y; }
      player.rx = player.prevX + (player.x - player.prevX) * a;
      player.ry = player.prevY + (player.y - player.prevY) * a;
    }
    // vertical camera — follows the balloon in tall (multi-story) levels; 0 when the level fits one screen
    const levelH = LROWS * TILE, camMax = Math.max(0, levelH - H);
    const camTarget = Math.max(0, Math.min(camMax, (player && state === "play" ? (player.ry !== undefined ? player.ry : player.y) : 0) + PH / 2 - H / 2));
    camY += (camTarget - camY) * (1 - Math.pow(0.00008, animDt)); // framerate-independent follow (silky on any refresh)
    if (camY < 0.4) camY = 0; if (Math.abs(camY - camTarget) < 0.4) camY = camTarget;

    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    let ox = 0, oy = 0;
    if (shake > 0) { ox = (Math.random() - .5) * shake; oy = (Math.random() - .5) * shake; ctx.translate(ox, oy); }

    // background — hi-res slice of the (possibly tall) static layer, drawn 1:1 (crisp)
    if (staticLayer) ctx.drawImage(staticLayer, 0, camY * staticSR, W * staticSR, H * staticSR, 0, 0, W, H);
    else { ctx.fillStyle = "#0d0d16"; ctx.fillRect(0, 0, W, H); }

    // embers (screen-space ambient)
    ctx.fillStyle = curTheme.ember;
    for (const e of embers) { ctx.globalAlpha = 0.3 + 0.4 * Math.abs(Math.sin((animTime + e.o) * e.w)); ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;

    ctx.save(); ctx.translate(0, -camY); // ---- world space (scrolls with the camera) ----

    // reverse-control zone tint (full level height)
    if (reverseRange) {
      const rx = reverseRange[0], rw = reverseRange[1] - reverseRange[0];
      ctx.fillStyle = reverseActive ? "rgba(180,80,255,0.20)" : "rgba(150,80,255,0.07)";
      ctx.fillRect(rx, 0, rw, levelH);
      ctx.strokeStyle = "rgba(200,140,255,0.4)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(rx, 0); ctx.lineTo(rx, levelH); ctx.moveTo(rx + rw, 0); ctx.lineTo(rx + rw, levelH); ctx.stroke();
    }

    // fake floors (drawn IDENTICAL to solid — the trick) + decoy platforms + fake doors + lava
    for (let r = 0; r < LROWS; r++) for (let c = 0; c < COLS; c++) {
      const ch = grid[r][c], x = c * TILE, y = r * TILE;
      if (ch === "F" && !collapsed.has(c + "," + r)) drawBlockTo(ctx, x, y);
      else if (ch === "O") drawFakePlatform(x, y);
      else if (ch === "L" || ch === "G") drawLava(x, y, r); // L deadly, G safe — drawn identically (the troll)
      else if (ch === "J") drawBouncePad(x, y);
    }
    // every gate is drawn IDENTICALLY (real, fakes AND teleport doors) — you can't tell them apart
    for (const d of doorCells) drawDoor(d.c * TILE, d.r * TILE, false);
    for (const s of teleSrc) drawDoor(s.c * TILE, s.r * TILE, false);
    for (const d of teleDst) drawPortal(d.c * TILE, d.r * TILE); // swirling landing portal
    if (exit) drawDoor(exit.c * TILE, exit.r * TILE, true); // the real (possibly runaway) door
    for (const t of traps) {
      const tx = t.c * TILE, ty = t.r * TILE;
      if (t.type === "popup" && t.up > 0.02) drawSpikeColumn(tx, ty + TILE - TILE * 0.85 * t.up, TILE * 0.85 * t.up);
      else if (t.type === "guillotine") { if (sawWorld) drawSaw(tx, ty, sawExtend(t)); else drawShard(tx, ty, shardState(t)); }
      else if (t.type === "crusher") drawCrusher(tx, ty + crusherTravel(t) * crusherDown(t), (t.w || 1) * TILE, ty);
    }

    if (pwr.trueSight) drawTruthBadges();

    if (!player.dead && state === "play") drawPlayer();

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2)); ctx.fillStyle = p.col;
      if (p.shred) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0);
        ctx.beginPath(); ctx.moveTo(-p.r, p.r); ctx.lineTo(0, -p.r); ctx.lineTo(p.r, p.r); ctx.closePath(); ctx.fill(); ctx.restore(); }
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.r || 3, 0, 7); ctx.fill(); }
    }
    ctx.globalAlpha = 1;

    ctx.restore(); // ---- end world space; back to screen space ----

    // ---- upgrade charge meter (top-center HUD) — only while a power is active ----
    pwrChargeShown += (pwrCharge - pwrChargeShown) * Math.min(1, animDt * 6); // smooth fill/drain
    if (state === "play" && (pwrId !== "none" || pwrChargeShown > 0.02)) {
      const meta = PWR_META[pwrId] || { label: "UPGRADE", col: "#9aa6b8" };
      const bw = 300, bh = 13, bx = (W - bw) / 2, by = 14, frac = Math.max(0, Math.min(1, pwrChargeShown));
      const low = frac < 0.28, blink = low ? (0.55 + 0.45 * Math.abs(Math.sin(animTime * 6))) : 1;
      ctx.save();
      // track
      ctx.fillStyle = "rgba(0,0,0,0.55)"; roundRect(bx - 2, by - 2, bw + 4, bh + 4, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.10)"; roundRect(bx, by, bw, bh, 5); ctx.fill();
      // fill
      const fg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      fg.addColorStop(0, meta.col); fg.addColorStop(1, low ? "#ff5d6c" : "#ffffff");
      ctx.globalAlpha = blink; ctx.fillStyle = fg; roundRect(bx, by, Math.max(2, bw * frac), bh, 5); ctx.fill();
      ctx.globalAlpha = 1;
      // segment ticks (each ~one level of charge)
      ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1.5;
      for (let s = 1; s < 5; s++) { const sx = bx + bw * (s / 5); ctx.beginPath(); ctx.moveTo(sx, by); ctx.lineTo(sx, by + bh); ctx.stroke(); }
      // label
      ctx.font = "bold 10px Poppins, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = low ? "#ffd0d4" : meta.col;
      ctx.fillText("⚡ " + meta.label + (low ? "  — fading!" : ""), W / 2, by + bh / 2 + 0.5);
      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      ctx.restore();
    }

    // reversed-controls banner (screen-space HUD)
    if (reverseActive) {
      ctx.fillStyle = "#e0b0ff"; ctx.font = "bold 14px Poppins, sans-serif"; ctx.textAlign = "center";
      ctx.fillText("⇄  CONTROLS REVERSED  ⇄", (reverseRange[0] + reverseRange[1]) / 2, 116); ctx.textAlign = "left";
    }

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
  // Real molten lava: dark drifting crust, a flowing glowing surface wave, rising
  // bubbles that swell & pop, and flame tongues licking up off the surface.
  function drawLava(x, y, row) {
    const t = animTime, seed = x * 0.13 + row * 1.7;
    ctx.save(); ctx.translate(x, y);
    ctx.beginPath(); ctx.rect(-1, 4, TILE + 2, TILE - 3); ctx.clip(); // keep molten body inside the tile
    // molten base
    ctx.fillStyle = GRAD.lava; ctx.fillRect(0, 5, TILE, TILE - 5);
    // flowing bright surface wave (the hot top of the pool)
    const waveY = (xx) => 9 + Math.sin(xx * 0.32 + t * 2.6 + seed) * 1.8 + Math.sin(xx * 0.11 - t * 1.4) * 1.0;
    ctx.fillStyle = "#ff7a1e"; ctx.beginPath(); ctx.moveTo(0, waveY(0));
    for (let xx = 0; xx <= TILE; xx += 4) ctx.lineTo(xx, waveY(xx));
    ctx.lineTo(TILE, TILE); ctx.lineTo(0, TILE); ctx.closePath(); ctx.fill();
    // bright hot crest line
    ctx.strokeStyle = "#ffe27a"; ctx.lineWidth = 2; ctx.beginPath();
    for (let xx = 0; xx <= TILE; xx += 4) (xx ? ctx.lineTo(xx, waveY(xx)) : ctx.moveTo(xx, waveY(xx)));
    ctx.stroke();
    // dark cooled crust patches drifting across the surface
    ctx.fillStyle = "rgba(48,12,6,0.6)";
    for (let i = 0; i < 3; i++) {
      const cw = 9 + i * 4, cx = ((i * 16 + t * (5 + i * 4) + seed * 9) % (TILE + cw)) - cw;
      ctx.beginPath(); ctx.ellipse(cx + cw / 2, waveY(cx + cw / 2) + 3, cw / 2, 2.6, 0, 0, 7); ctx.fill();
    }
    // bubbles swelling up to the surface and popping
    for (let i = 0; i < 4; i++) {
      const ph = ((t * 0.55 + i * 0.31 + seed * 0.1) % 1);
      const bx = 5 + ((i * 13 + seed * 7) % (TILE - 10)), by = (TILE - 4) - ph * (TILE - 16), br = (1 - ph) * 2.4 + 0.5;
      ctx.globalAlpha = 0.25 + 0.45 * (1 - ph); ctx.fillStyle = "#ffcf6a";
      ctx.beginPath(); ctx.arc(bx, by, br, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // flame tongues / embers rising ABOVE the surface (drawn unclipped, into the air)
    ctx.save(); ctx.translate(x, y);
    for (let i = 0; i < 3; i++) {
      const ph = ((t * 0.9 + i * 0.41 + seed) % 1), fa = 1 - ph;
      const fx = 7 + ((i * 15 + seed * 5) % (TILE - 14)), fy = 8 - ph * 13;
      ctx.globalAlpha = fa * 0.55; ctx.fillStyle = ph < 0.5 ? "#ffb43a" : "#ff5e16";
      ctx.beginPath(); ctx.ellipse(fx, fy, 2.0 * fa + 0.5, 4.2 * fa + 1, 0, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.restore();
  }
  function drawSpikeColumn(x, y, h) {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = GRAD.spike;
    const n = 4, w = TILE / n;
    for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.moveTo(i * w, h); ctx.lineTo(i * w + w / 2, 0); ctx.lineTo((i + 1) * w, h); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  // Falling hazard — themed "shard" instead of the old arrow/blade. Style per world:
  //  ice = icicle, saw = spinning sawblade, thorn = barbed vine, crystal = shard, blade = stone spike.
  // Falling shard: forms at the ceiling (telegraph) then drops & shatters on the floor.
  // BIG ICE SHARD — a chunky jagged icicle that cracks off the ceiling and drops, like
  // ice breaking off a cave roof. Always ice (regardless of world), bigger than before.
  function drawShard(tx, ty, s) {
    const cxm = tx + TILE / 2, floorTop = (LROWS - 1) * TILE;
    // floor impact target (telegraph — glowing cyan ring where it will land)
    if (s.phase !== "gone") {
      const inten = s.phase === "warn" ? s.k * 0.6 : 1;
      ctx.save(); ctx.globalAlpha = 0.32 * inten; ctx.fillStyle = "#37e6ff";
      ctx.beginPath(); ctx.ellipse(cxm, floorTop + TILE - 3, 13, 3.2, 0, 0, 7); ctx.fill(); ctx.restore();
    }
    if (s.phase === "gone") return;               // shattered — nothing hanging
    let topY = s.y;
    if (s.phase === "warn") topY = ty + Math.sin(animTime * 40) * 1.2 * s.k; // forms & shivers at the ceiling
    drawIceCrystal(cxm, topY);                     // no tail
  }
  // A glowing, faceted, double-pointed ice crystal (matches the concept ref).
  function drawIceCrystal(cxm, topY) {
    const w = 10, h = TILE + 6;
    const P = [[0, 0], [-w * 0.5, h * 0.2], [-w, h * 0.42], [-w * 0.66, h * 0.66], [-w * 0.3, h * 0.86],
      [0, h], [w * 0.3, h * 0.86], [w * 0.66, h * 0.66], [w, h * 0.42], [w * 0.5, h * 0.2]];
    ctx.save(); ctx.translate(cxm, topY);
    ctx.shadowColor = "#3ce8ff"; ctx.shadowBlur = 14;        // soft outer glow
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#bfeaf3"); g.addColorStop(0.5, "#1fa9c9"); g.addColorStop(1, "#0a4f63");
    ctx.fillStyle = g; ctx.beginPath();
    P.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#c8fbff"; ctx.lineWidth = 1.5; ctx.stroke(); // bright glowing edge
    // internal facet lines
    ctx.strokeStyle = "rgba(190,250,255,0.75)"; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(0, h * 0.08); ctx.lineTo(0, h * 0.92);
    ctx.moveTo(-w * 0.5, h * 0.2); ctx.lineTo(0, h * 0.46); ctx.moveTo(w * 0.5, h * 0.2); ctx.lineTo(0, h * 0.46);
    ctx.moveTo(-w, h * 0.42); ctx.lineTo(0, h * 0.62); ctx.moveTo(w, h * 0.42); ctx.lineTo(0, h * 0.62);
    ctx.stroke();
    // bright highlight sliver
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath(); ctx.moveTo(-1.6, h * 0.14); ctx.lineTo(0.4, h * 0.14); ctx.lineTo(-0.6, h * 0.5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // Spinning sawblade lowered on a chain (the saw-world hazard).
  function drawSaw(tx, ty, f) {
    const cxm = tx + TILE / 2, row = Math.floor(ty / TILE), tipY = ty + (LROWS - 1 - row) * TILE * f;
    ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(tx + 8, ty, TILE - 16, 4); // ceiling mount
    if (f < 0.05) { ctx.fillStyle = "#6a6a78"; ctx.fillRect(cxm - 3, ty + 3, 6, 6); return; }
    // chain
    ctx.strokeStyle = "#8a8a98"; ctx.lineWidth = 2.4;
    for (let yy = ty + 3; yy < tipY - 12; yy += 6) { ctx.beginPath(); ctx.ellipse(cxm, yy + 3, 2.6, 3, 0, 0, 7); ctx.stroke(); }
    // spinning blade
    const R = 13, by = tipY - 11, teeth = 10;
    const gr = ctx.createRadialGradient(cxm, by, 2, cxm, by, R); gr.addColorStop(0, "#e9edf4"); gr.addColorStop(1, "#9aa0ad");
    ctx.fillStyle = gr; ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) { const ang = (i / (teeth * 2)) * 6.283 + animTime * 14, rr = i % 2 ? R : R * 0.62; ctx.lineTo(cxm + Math.cos(ang) * rr, by + Math.sin(ang) * rr); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#2a2a36"; ctx.beginPath(); ctx.arc(cxm, by, 3.2, 0, 7); ctx.fill();
    ctx.fillStyle = "#9aa0ad"; ctx.beginPath(); ctx.arc(cxm, by, 1.4, 0, 7); ctx.fill();
  }
  // Crusher — now hangs from CHAINS so it clearly reads as "slams down, don't be under it".
  function drawCrusher(x, y, w, anchorY) {
    const a = anchorY != null ? anchorY : y;
    // ceiling bracket + two chains down to the block
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(x + 2, a, w - 4, 4);
    ctx.strokeStyle = "#7a7a88"; ctx.lineWidth = 2.5;
    for (const cxp of [x + w * 0.3, x + w * 0.7]) {
      ctx.beginPath();
      for (let yy = a + 2; yy < y; yy += 6) { ctx.moveTo(cxp - 2, yy); ctx.lineTo(cxp + 2, yy + 3); }
      ctx.stroke();
      ctx.fillStyle = "#5a5a66"; ctx.beginPath(); ctx.arc(cxp, a + 2, 2, 0, 7); ctx.fill();
    }
    // the heavy block
    ctx.fillStyle = "#4a2440"; ctx.fillRect(x, y, w, TILE);
    ctx.fillStyle = "#62315a"; ctx.fillRect(x, y, w, 6);
    ctx.fillStyle = "#2a1426"; ctx.fillRect(x, y, 3, TILE); ctx.fillRect(x + w - 3, y, 3, TILE); // bolts/edges
    ctx.fillStyle = "#ff5d73"; const n = Math.max(2, Math.round(w / 10)); // spiked underside
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
  // swirling teleport landing portal
  function drawPortal(x, y) {
    const cx = x + TILE / 2, cy = y + TILE / 2;
    ctx.save(); ctx.translate(cx, cy);
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, TILE * 0.5);
    g.addColorStop(0, "rgba(180,140,255,0.5)"); g.addColorStop(0.6, "rgba(120,200,255,0.22)"); g.addColorStop(1, "transparent");
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, TILE * 0.42, TILE * 0.5, 0, 0, 7); ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "rgba(200,180,255,0.7)"; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { const a = animTime * 2 + i * 2.1; ctx.beginPath(); ctx.ellipse(0, 0, TILE * 0.3 - i * 4, TILE * 0.42 - i * 4, a, 0.3, 2.8); ctx.stroke(); }
    ctx.restore();
  }

  // A grumpy little fellow — angry brows, a handlebar moustache and tiny shoes.
  // Deliberately STILL: the only motion is a subtle landing squash and a walk
  // cycle that runs only while actually moving — so it never "twitches".
  function drawPlayer() {
    const px = player.rx !== undefined ? player.rx : player.x, py = player.ry !== undefined ? player.ry : player.y;
    const cx = px + PW / 2, cy = py + PH / 2, R = PW / 2 + 1;
    const dir = player.facing >= 0 ? 1 : -1;

    // subtle squash on landing / stretch in the air — no idle animation at all
    let sx = 1, sy = 1;
    if (player.onGround) { const land = Math.min(1, player.landT * 11); sx = 1 + 0.10 * (1 - land); sy = 1 - 0.10 * (1 - land); }
    else { const v = Math.max(-1, Math.min(1, player.vy / 900)); sy = 1 + 0.10 * Math.abs(v); sx = 1 - 0.07 * Math.abs(v); }

    const moving = player.onGround && Math.abs(player.vx) > 60;
    const wcyc = player.runCycle;                 // walk phase
    const ll = moving ? Math.max(0, Math.sin(wcyc)) * 5 : 0;   // left foot lifts…
    const rl = moving ? Math.max(0, -Math.sin(wcyc)) * 5 : 0;  // …then the right (silly march)

    if (window.__DLrec) window.__DLrec.push({ rx: +px.toFixed(2), ry: +py.toFixed(2), sx: +sx.toFixed(3), sy: +sy.toFixed(3), ll: +ll.toFixed(2), rl: +rl.toFixed(2), g: player.onGround ? 1 : 0, vx: +player.vx.toFixed(1), vy: +player.vy.toFixed(1), lt: +player.landT.toFixed(3) });

    ctx.save();
    ctx.translate(cx, cy + R * (1 - sy)); ctx.scale(sx, sy);

    // Layout (local space): floor surface is the BOTTOM of the hitbox so the shoes sit
    // ON the road (not inside it). The ball is lifted, with slim legs reaching down.
    const floorY = R, BR = 12, bodyY = floorY - 8 - BR; // body bottom 8px above the floor

    // ground shadow at the floor surface
    if (player.onGround) { ctx.fillStyle = "rgba(0,0,0,0.30)"; ctx.beginPath(); ctx.ellipse(0, floorY, BR * 1.05, 3.0, 0, 0, 7); ctx.fill(); }
    // base under-glow — vivid neon lights that vibe with the world's colour (toggle with L)
    if (baseGlow) {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const pulse = 0.6 + 0.4 * Math.sin(animTime * 3.2), gc = curTheme.ember || "rgba(255,150,80,0.6)";
      const gg = ctx.createRadialGradient(0, floorY + 1, 1, 0, floorY + 1, 30);
      gg.addColorStop(0, "rgba(255,255,255,0.5)"); gg.addColorStop(0.25, gc); gg.addColorStop(1, "transparent");
      ctx.globalAlpha = pulse; ctx.fillStyle = gg;
      ctx.beginPath(); ctx.ellipse(0, floorY + 1, 26, 9, 0, 0, 7); ctx.fill();
      // bright glowing light pucks under each shoe
      ctx.globalAlpha = pulse; ctx.fillStyle = gc;
      ctx.beginPath(); ctx.ellipse(-7, floorY + 1, 6, 2.4, 0, 0, 7); ctx.ellipse(7, floorY + 1, 6, 2.4, 0, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.9 * pulse; ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(-7, floorY, 1.4, 0, 7); ctx.arc(7, floorY, 1.4, 0, 7); ctx.fill();
      ctx.restore();
    }

    // ---- slim stick legs + bright shoes splayed OPPOSITE ways, resting ON the floor ----
    const hipY = bodyY + BR * 0.6;
    ctx.strokeStyle = "#3a2410"; ctx.lineWidth = 2.4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-3.5, hipY); ctx.lineTo(-7, floorY - ll); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3.5, hipY); ctx.lineTo(7, floorY - rl); ctx.stroke();
    function shoe(sxp, syp, sgn) {                 // sgn -1 = points left, +1 = points right
      ctx.save(); ctx.translate(sxp, syp); ctx.rotate(sgn * 0.1);
      ctx.fillStyle = "#3a2410"; ctx.beginPath(); ctx.ellipse(sgn * 2.5, -0.6, 7.6, 3.4, 0, 0, 7); ctx.fill();   // dark sole
      ctx.fillStyle = "#f2c14e"; ctx.beginPath(); ctx.ellipse(sgn * 2.5, -2.2, 6.8, 2.8, 0, 0, 7); ctx.fill();   // bright yellow shoe
      ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.beginPath(); ctx.ellipse(sgn * 3.2, -3, 2.8, 1, 0, 0, 7); ctx.fill(); // shine
      ctx.restore();
    }
    shoe(-7, floorY - ll, -1);
    shoe(7, floorY - rl, 1);

    // ---- body + angry face (lifted up so legs show) ----
    ctx.save(); ctx.translate(0, bodyY);
    ctx.fillStyle = GRAD.balloon; ctx.beginPath(); ctx.arc(0, 0, BR, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(80,0,12,0.5)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, BR - 0.5, 0, 7); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.beginPath(); ctx.ellipse(-BR * 0.38, -BR * 0.42, BR * 0.16, BR * 0.24, -0.5, 0, 7); ctx.fill();
    const ex = 5;
    ctx.strokeStyle = "#160018"; ctx.lineWidth = 2.2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-ex - 3.5, -7.5); ctx.lineTo(-ex + 3, -4.8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ex + 3.5, -7.5); ctx.lineTo(ex - 3, -4.8); ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.ellipse(-ex, -2, 3.6, 3, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(ex, -2, 3.6, 3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#160018";
    ctx.beginPath(); ctx.arc(-ex + dir * 1.3, -1.2, 1.8, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(ex + dir * 1.3, -1.2, 1.8, 0, 7); ctx.fill();
    // angry snarl with gritted teeth
    ctx.fillStyle = "#2a0006";
    ctx.beginPath(); ctx.moveTo(-6, 5.5); ctx.lineTo(6, 5.5); ctx.quadraticCurveTo(0, 10.5, -6, 5.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#f2f2f6"; ctx.beginPath();
    for (let i = 0; i < 5; i++) { const tx = -5 + i * 2.5; ctx.moveTo(tx, 5.5); ctx.lineTo(tx + 1.25, 7.8); ctx.lineTo(tx + 2.5, 5.5); }
    ctx.fill();
    ctx.restore();

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
    if (!scores.length) { list.innerHTML = "<div class='lb-empty'>Nobody's played yet.<br>Be the first 😈</div>"; return; }
    const total = LEVELS.length;
    // a finisher shows their time; everyone still trying shows how far they got
    const progressOf = (s) => s.finished ? `${(Number(s.time) || 0).toFixed(1)}s` : `Lv ${Math.min(total, Math.max(1, s.level || 1))}`;
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
        <div class="pod-stat pod-time">${s.finished ? "🏁 " : ""}${progressOf(s)}</div>
      </div>`;
    }).join("");
    // List — ranks 4+ (plus a header row)
    let html = "<div class='lb-row lb-head'><span class='r'>#</span><span class='f'></span><span class='n'>NAME</span><span class='d'>DEATHS</span><span class='t'>PROGRESS</span></div>";
    scores.slice(3, 100).forEach((s, i) => {
      const rank = i + 4, me = s.name === playerName ? " lb-me" : "";
      const prog = s.finished ? `<span class="lb-done">🏁 ${(Number(s.time) || 0).toFixed(1)}s</span>` : `<span class="lb-prog">Lv ${Math.min(total, Math.max(1, s.level || 1))}</span>`;
      html += `<div class="lb-row${me}"><span class="r">${rank}</span><span class="f">${LB.flag(s.cc)}</span>` +
              `<span class="n">${escapeHtml(s.name)}</span><span class="d">${escapeHtml(String(s.deaths ?? "?"))}</span>` +
              `<span class="t">${prog}</span></div>`;
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
  // PLAY → pick a power → begin the run
  function startGame() {
    if (!nameValid()) { rejectNoName(); return; }
    audio();
    playerName = nameInput.value.trim().toUpperCase().slice(0, 14); LB.setName(playerName);
    titleScreen.classList.add("hidden"); winScreen.classList.add("hidden"); lbScreen.classList.add("hidden");
    document.getElementById("settings-screen").classList.add("hidden");
    document.getElementById("power-screen").classList.remove("hidden");
    state = "power";
  }
  function lapsePower() {
    pwrCharge = 0; pwrId = "none"; pwr = POWERS.none;
    activeText = "⚡ upgrade lapsed"; activeTextT = 1.9;
    tone(220, 0.28, "sawtooth", 0.05, 110);
  }
  function beginRun() {
    pwr = POWERS[pwrId] || POWERS.none;
    pwrCharge = pwrChargeShown = (pwrId === "none") ? 0 : 1; levelDeaths = 0; // full charge when a power is picked
    document.getElementById("power-screen").classList.add("hidden");
    deaths = 0; elDeaths.textContent = "DEATHS 0";
    runStart = performance.now();
    LB.startRun({ name: playerName, cc: playerGeo.cc, country: playerGeo.country }); // everyone goes on the board
    if (QA_LEVEL > 0) LB.progress(QA_LEVEL + 1, 0);
    document.getElementById("stage-screen").classList.add("hidden");
    keys.left = keys.right = keys.jump = false;
    state = "play";
    updateTouchVisibility();
    if (settings.music) startMusic();
    loadLevel(QA_LEVEL);
  }
  startBtn.addEventListener("click", startGame);
  document.getElementById("again-btn").addEventListener("click", startGame);
  document.querySelectorAll("#power-screen .pcard").forEach(c => c.addEventListener("click", () => { pwrId = c.dataset.pwr; beginRun(); }));
  document.getElementById("power-skip").addEventListener("click", () => { pwrId = "none"; beginRun(); });

  // ----- Stage interstitials (act breaks) -----
  const STAGES = {
    20: { kicker: "STAGE 2", title: "THE VOID", tag: "Everything you learned? The Void forgot to care." },
    40: { kicker: "FINAL STAGE", title: "OVERDRIVE", tag: "Saws, storms, nightmares. No more training wheels." },
  };
  let pendingLevel = 0;
  function advanceTo(next) {
    // upgrade accounting for the level just CLEARED: a clean (deathless) clear nudges the bar up,
    // then using the power costs a chunk; the bar lapses the boon when it runs dry.
    if (pwrId !== "none") {
      if (levelDeaths === 0) pwrCharge = Math.min(1, pwrCharge + PWR_CLEAN_BONUS);
      pwrCharge -= PWR_LEVEL_COST;
      if (pwrCharge <= 0) lapsePower();
    }
    LB.progress(next + 1, deaths); // record how far they've gotten (non-finishers count too)
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
    if (state === "power") drawPowerIcons(now / 1000);
    if (state === "play") elTime.textContent = ((performance.now() - runStart) / 1000).toFixed(1) + "s";
    requestAnimationFrame(frameLoop);
  }

  // animated premium icons inside the power cards
  const _picons = {};
  function powerIconCtx(id) { if (!(id in _picons)) { const cv = document.querySelector('#power-screen .picon[data-icon="' + id + '"]'); _picons[id] = cv ? cv.getContext("2d") : null; } return _picons[id]; }
  function miniGuy(g, cx, cy, r) {
    const grad = g.createRadialGradient(cx - r * 0.3, cy - r * 0.4, 1, cx, cy, r * 1.2);
    grad.addColorStop(0, "#ff8aa0"); grad.addColorStop(0.5, "#ff3b54"); grad.addColorStop(1, "#c01030");
    g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
    g.strokeStyle = "#160018"; g.lineWidth = r * 0.16; g.lineCap = "round";
    g.beginPath(); g.moveTo(cx - r * 0.6, cy - r * 0.5); g.lineTo(cx - r * 0.1, cy - r * 0.25); g.stroke();
    g.beginPath(); g.moveTo(cx + r * 0.6, cy - r * 0.5); g.lineTo(cx + r * 0.1, cy - r * 0.25); g.stroke();
    g.fillStyle = "#fff"; g.beginPath(); g.arc(cx - r * 0.3, cy, r * 0.17, 0, 7); g.fill(); g.beginPath(); g.arc(cx + r * 0.3, cy, r * 0.17, 0, 7); g.fill();
    g.fillStyle = "#160018"; g.beginPath(); g.arc(cx - r * 0.3, cy, r * 0.09, 0, 7); g.fill(); g.beginPath(); g.arc(cx + r * 0.3, cy, r * 0.09, 0, 7); g.fill();
  }
  function drawPowerIcons(t) {
    const S = 120;
    let g = powerIconCtx("dbljump");
    if (g) { g.clearRect(0, 0, S, S);
      const ph = (t % 1.7) / 1.7; let y = ph < 0.5 ? 92 - Math.sin((ph / 0.5) * Math.PI) * 28 : 64 - Math.sin(((ph - 0.5) / 0.5) * Math.PI) * 34;
      g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(24, 96, 72, 3);
      g.strokeStyle = "rgba(127,224,160," + (0.35 + 0.4 * Math.sin(t * 6)) + ")"; g.lineWidth = 4; g.lineCap = "round";
      g.beginPath(); g.moveTo(52, 26); g.lineTo(60, 18); g.lineTo(68, 26); g.stroke();
      g.beginPath(); g.moveTo(52, 40); g.lineTo(60, 32); g.lineTo(68, 40); g.stroke();
      miniGuy(g, 60, y, 16);
    }
    g = powerIconCtx("speed");
    if (g) { g.clearRect(0, 0, S, S);
      g.lineCap = "round"; g.strokeStyle = "rgba(255,207,92,0.8)"; g.lineWidth = 4;
      for (let i = 0; i < 4; i++) { const len = 22 + ((t * 320 + i * 40) % 50); g.globalAlpha = 0.7 - i * 0.14; g.beginPath(); g.moveTo(8, 38 + i * 15); g.lineTo(8 + len, 38 + i * 15); g.stroke(); }
      g.globalAlpha = 1;
      miniGuy(g, 76 + Math.sin(t * 16) * 1.5, 60, 17);
      g.fillStyle = "#ffd24a"; g.beginPath(); g.moveTo(98, 26); g.lineTo(89, 54); g.lineTo(98, 54); g.lineTo(91, 80); g.lineTo(108, 46); g.lineTo(99, 46); g.closePath(); g.fill();
    }
    g = powerIconCtx("sight");
    if (g) { g.clearRect(0, 0, S, S);
      const blink = (t % 2.6) > 2.45, look = Math.sin(t * 1.6) * 9;
      g.fillStyle = "#0c1320"; g.beginPath(); g.ellipse(60, 60, 44, blink ? 3 : 27, 0, 0, 7); g.fill();
      if (!blink) {
        g.fillStyle = "#bfe7ff"; g.beginPath(); g.arc(60 + look, 60, 17, 0, 7); g.fill();
        g.fillStyle = "#16324a"; g.beginPath(); g.arc(60 + look, 60, 8.5, 0, 7); g.fill();
        g.fillStyle = "#fff"; g.beginPath(); g.arc(64 + look, 55, 3, 0, 7); g.fill();
      }
      g.strokeStyle = "#ffcf5c"; g.lineWidth = 3; g.beginPath(); g.ellipse(60, 60, 44, 27, 0, 0, 7); g.stroke();
    }
  }

  // Debug hook (localhost only) — lets the headless verifier read state & drive input.
  try {
    if (/^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname)) {
      window.__DL = () => ({ state, level: levelIndex + 1, deaths, px: player && player.x, py: player && player.y,
        onGround: player && player.onGround, exitC: exit && exit.c, reverse: reverseActive,
        pwrId, pwrCharge: +pwrCharge.toFixed(3) });
      window.__DLstart = (nm) => { nameInput.value = nm || "BOT"; startGame(); };
      window.__DLkey = (k, down) => { if (k === "left") keys.left = down; else if (k === "right") keys.right = down; else if (k === "jump") { if (down) pressJump(); else releaseJump(); } };
      // simulate clearing the current level (advances through stage interstitials too)
      window.__DLwin = () => { if (state === "play") { if (levelIndex + 1 < LEVELS.length) advanceTo(levelIndex + 1); else winGame(); } };
      window.__DLdie = () => { if (state === "play" && player && !player.dead) die(false); };
      window.__DLfocus = () => (document.activeElement && (document.activeElement.id || document.activeElement.tagName));
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
  LB.geo().then(g => { playerGeo = g; if (!geoLine.dataset.hint) geoLine.textContent = g.cc ? `${LB.flag(g.cc)} ${g.country}` : "🏴‍☠️ flag of the unknown"; });
  requestAnimationFrame(frameLoop);
})();
