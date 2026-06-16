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
  // THEMES — the scenery shifts every 4 levels (and varies per level)
  // =====================================================================
  const THEMES = [
    { sky:["#2a0f1e","#1a0e16","#0c0a14"], glow:"rgba(255,120,90,0.18)", orb:"#ffd9a0",
      mtnA:"rgba(70,28,40,0.55)", mtnB:"rgba(45,18,28,0.78)", sil:"rgba(22,10,16,0.85)",
      blk:["#3a2630","#4a323e","#412a34","#291a22"], spk:["#eef0f6","#9498a6"],
      ember:"rgba(255,150,80,0.55)", decor:"spikes", name:"Hellpit" },
    { sky:["#0e2438","#0a1622","#06101a"], glow:"rgba(120,200,255,0.16)", orb:"#dcefff",
      mtnA:"rgba(40,70,100,0.5)", mtnB:"rgba(24,44,66,0.78)", sil:"rgba(14,26,40,0.85)",
      blk:["#27384a","#34495e","#2e3f52","#1d2a38"], spk:["#eaf4ff","#9fc0d8"],
      ember:"rgba(170,220,255,0.5)", decor:"crystals", name:"Frostbite" },
    { sky:["#13281c","#0d1b13","#08120c"], glow:"rgba(120,220,120,0.14)", orb:"#dfffb0",
      mtnA:"rgba(34,70,40,0.5)", mtnB:"rgba(20,44,26,0.78)", sil:"rgba(12,26,16,0.85)",
      blk:["#2a3a26","#384c30","#324428","#1f2c1a"], spk:["#eef0e0","#9aa878"],
      ember:"rgba(180,255,150,0.45)", decor:"trees", name:"Overgrowth" },
    { sky:["#1c1730","#13101e","#0a0812"], glow:"rgba(220,120,255,0.16)", orb:"#d6c4ff",
      mtnA:"rgba(60,52,80,0.5)", mtnB:"rgba(38,32,54,0.78)", sil:"rgba(22,18,32,0.85)",
      blk:["#34304a","#46415f","#3c3854","#23203a"], spk:["#dfe2ee","#9a9ab8"],
      ember:"rgba(210,160,255,0.5)", decor:"gears", name:"The Machine" },
    { sky:["#160a26","#0d0718","#04030a"], glow:"rgba(180,90,255,0.18)", orb:"#e6bcff",
      mtnA:"rgba(48,28,72,0.55)", mtnB:"rgba(30,16,48,0.8)", sil:"rgba(16,8,26,0.88)",
      blk:["#2e2444","#3e3058","#352a4c","#201838"], spk:["#f0d8ff","#b08ad0"],
      ember:"rgba(210,140,255,0.55)", decor:"shards", name:"The Void" },
  ];
  let curTheme = THEMES[0];

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
      grid: ["                    ","     D    D   XX    ","                    ","                    ",
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
      texts: [{c:1,t:"Halfway. Every trick at once."},{c:8,t:"Don't trust ANYTHING down here."},{c:15,t:"Final door. Or is it. 😈"}] },

    // ---- Theme 2: Overgrowth — scenery that LIES (decoys + phantom gaps) ----
    { name: "Hall of Mirrors", spd: 1,
      grid: ["                    ","                    ","                    ","                    ",
             "                    ","                    ","                    ","                    ",
             "                    ","                    "," S   BB    P    M E ","#######FF###########"],
      texts: [{c:2,t:"Scary spikes! Better jump them, right? 🙄"},{c:7,t:"…or walk right through. They're fake, genius."},{c:14,t:"THIS door's real. probably. maybe. 😏"}] },

    { name: "Phantom Floor", spd: 1,
      grid: ["                    ","                    ","                    ","                    ",
             "                    ","                    ","                    ","                    ",
             "                    ","                    "," S              M E ","####HHHHHH##FF######"],
      texts: [{c:2,t:"A bottomless pit! Definitely don't walk in. 😈"},{c:8,t:"…it was floor the whole time. you're welcome."},{c:11,t:"THIS gap is real though. (or is it 🙃)"}] },

    { name: "Decoy Garden", spd: 1.1,
      grid: ["                    ","             D      ","                    ","                    ",
             "                    ","                    ","                    ","                    ",
             "                    ","                    "," S    B    P    M E ","###HH###FF##########"],
      texts: [{c:1,t:"Trust nothing. Not the floor, not the rocks."},{c:6,t:"that rock? fake. that gap? fake. that one? real. 🤡"},{c:13,t:"blade incoming. you're rolling your eyes, I can tell."}] },

    { name: "Green Hell", spd: 1.15,
      grid: ["                    ","          D         ","                    ","                    ",
             "                    ","                    ","                    ","                    ",
             "                    ","                    "," S      P       M E ","####HH######FF######"],
      texts: [{c:1,t:"Jungle's end. Should be relaxing."},{c:8,t:"lol no."},{c:14,t:"so close. so very fake-close."}] },

    // ---- Theme 3: The Machine — reversed controls + a runaway exit ----
    { name: "Backwards", spd: 1, rev: [6, 13],
      grid: ["                    ","                    ","                    ","                    ",
             "                    ","                    ","                    ","                    ",
             "                    ","                    "," S              M E ","#########FF#########"],
      texts: [{c:1,t:"Clean corridor. What could go wrong."},{c:6,t:"wait… why is left now— 🙃 (controls reversed!)"},{c:14,t:"controls back to normal. you're welcome. eye-roll noted."}] },

    { name: "Now You See It", spd: 1,
      grid: ["                    ","                    ","                    ","                    ",
             "                    ","                    ","                    ","                    ",
             "                    ","                    "," S        E  M    @ ","####################"],
      texts: [{c:1,t:"Door's right there. Walk over. Win. Easy."},{c:8,t:"🏃💨 the EXIT just RAN AWAY. of course it did."},{c:14,t:"not the fake door. chase the real one →"}] },

    { name: "Double Trouble", spd: 1.2, rev: [10, 15],
      grid: ["                    ","                    ","                    ","                    ",
             "                    ","                    ","                    ","                    ",
             "                    ","                    "," S      E    M    @ ","######FF############"],
      texts: [{c:1,t:"Hop the gap, grab the door. simple."},{c:7,t:"runaway door + reversed controls. you're SO welcome 😈"},{c:13,t:"left is right, right is wrong, the door is gone. enjoy 🙃"}] },

    { name: "Machine Finale", spd: 1.1,
      grid: ["                    ","     D        XX    ","                    ","                    ",
             "                    ","                    ","                    ","                    ",
             "                    ","                    "," S     B        M E ","##########FF########"],
      texts: [{c:1,t:"Mind the gears. And the rocks. And the floor."},{c:7,t:"rock = fake. relax. now the blades = VERY real."},{c:14,t:"one crusher between you and smugness."}] },

    // ---- Theme 4: The Void — EVERYTHING, faster, meaner ----
    { name: "Void Gate", spd: 1.3, rev: [6, 11],
      grid: ["                    ","                    ","                    ","                    ",
             "                    ","                    ","                    ","                    ",
             "                    ","                    "," S      P       M E ","####FF####FF########"],
      texts: [{c:1,t:"The Void. It's been waiting for you."},{c:6,t:"controls reversed OVER a pit. yeah. we went there 😈"},{c:14,t:"deep breath. roll those eyes. jump."}] },

    { name: "Hide & Seek", spd: 1.3,
      grid: ["                    ","      D    D        ","                    ","                    ",
             "                    ","                    ","                    ","                    ",
             "                    ","                    "," S   B   E      @  M","####################"],
      texts: [{c:1,t:"Decoy rock, two blades, one runaway door. go."},{c:7,t:"and it's gone. 🏃 told you. catch it."},{c:14,t:"M is a lie. the real one bolted right. 🙄"}] },

    { name: "Everything Lies", spd: 1.35, rev: [13, 17],
      grid: ["                    ","            D       ","                    ","                    ",
             "                    ","                    ","                    ","                    ",
             "                    ","                    "," S  B     P    M  E ","##HH##FF############"],
      texts: [{c:1,t:"phantom gap, fake rock, real pit, blade, reverse. casual."},{c:6,t:"are you rolling your eyes yet? GOOD. 😈"},{c:13,t:"reversed for the finish. of course. you knew."}] },

    { name: "The Devil's Lie", spd: 1.2, rev: [4, 8],
      grid: ["                    ","         D    XX    ","                    ","                    ",
             "                    ","                    ","                    ","                    ",
             "                    ","                    "," S      P   E     @ ","##FF################"],
      texts: [{c:1,t:"Last lie. Pit, reverse, blade, runaway door, crusher."},{c:4,t:"reversed. obviously. it's the finale, did you expect mercy?"},{c:11,t:"the door RUNS. 🏃 ONE more crusher. then bragging rights."}] },
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
  // QA-only level jump (?lvl=N) — honored on localhost only, so the public board stays honest
  let QA_LEVEL = 0;
  try { if (/^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname)) { const v = parseInt(new URLSearchParams(location.search).get("lvl")); if (v >= 1 && v <= 20) QA_LEVEL = v - 1; } } catch (e) {}

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
    const L = LEVELS[i];
    grid = L.grid;
    texts = (L.texts || []).map(o => ({ col: o.c, text: o.t }));
    curTheme = THEMES[(L.theme != null ? L.theme : Math.floor(i / 4)) % THEMES.length];
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
    if (ch === "H") return true;  // phantom gap: looks like a pit, is solid floor
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

    if (player.y > H + 40) { die(false); return; }
    const td = updateTraps(dt); if (td) { die(td === 2); return; }
    const hit = checkTiles();
    if (hit === "pop") { die(true); return; }
    if (hit === "die") { die(false); return; }
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
    const T = curTheme;
    staticLayer = document.createElement("canvas");
    staticLayer.width = W; staticLayer.height = H;
    const g = staticLayer.getContext("2d");
    // sky
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, T.sky[0]); sky.addColorStop(0.55, T.sky[1]); sky.addColorStop(1, T.sky[2]);
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // glow + orb (orb shifts across each 4-level zone)
    const ox = W * (0.22 + 0.5 * ((levelIndex % 4) / 3));
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

    // fake floors (drawn IDENTICAL to solid — the trick) + decoy platforms + fake doors
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const ch = grid[r][c], x = c * TILE, y = r * TILE;
      if (ch === "F" && !collapsed.has(c + "," + r)) drawBlockTo(ctx, x, y);
      else if (ch === "O") drawFakePlatform(x, y);
      else if (ch === "M") drawDoor(x, y, false);
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
    loadLevel(QA_LEVEL);
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
