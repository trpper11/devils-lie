/* Rage core — a compact, SMOOTH platformer engine shared by the rage-bait prototypes.
   Each prototype supplies a MECH object (levels + mechanic hooks); this runs it.
   Physics/feel reuse the tuned, de-stuttered values from the main game. No text taunts. */
(function () {
  const TILE = 40, COLS = 20, ROWS = 12, W = COLS * TILE, H = ROWS * TILE;
  const GRAVITY = 2400, MOVE = 250, JUMP = 700, ACCEL = 3300, AIR = 2400, FRICTION = 2600, MAX_FALL = 980;
  const COYOTE = 0.10, JBUF = 0.12, DT = 1 / 120, PW = 24, PH = 26;

  let canvas, ctx, renderScale = 1, MECH;
  let grid, LROWS, start, exitCell, li = 0, deaths = 0;
  let player, particles = [], shake = 0, animTime = 0, levelTime = 0, hitStop = 0;
  let state = "play", winT = 0;
  const keys = { left: false, right: false, jump: false };
  let acc = 0, last = 0;

  // ---- audio (tiny synth) ----
  let actx = null;
  const A = () => { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } return actx; };
  function beep(f, d, type = "square", v = 0.06, to = 0) {
    const a = A(); if (!a) return; const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + 0.02);
  }
  const sJump = () => beep(470, 0.12, "square", 0.05, 720);
  const sDie = () => { beep(200, 0.2, "sawtooth", 0.09, 60); beep(120, 0.3, "sawtooth", 0.07, 50, 0.04); };
  const sWin = () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.16, "triangle", 0.07), i * 70));
  const sStep = () => beep(900, 0.04, "square", 0.02, 300);

  // ---- canvas / DPR cap (kept light → smooth everywhere) ----
  function resize() {
    const availW = innerWidth, availH = innerHeight, scale = Math.min(availW / W, availH / H);
    const cssW = Math.max(1, Math.floor(W * scale)), cssH = Math.max(1, Math.floor(H * scale));
    canvas.style.width = cssW + "px"; canvas.style.height = cssH + "px";
    const dpr = Math.min(2, devicePixelRatio || 1);
    let cw = Math.floor(cssW * dpr), ch = Math.floor(cssH * dpr), MAX = 2300000;
    if (cw * ch > MAX) { const k = Math.sqrt(MAX / (cw * ch)); cw = Math.floor(cw * k); ch = Math.floor(ch * k); }
    canvas.width = cw; canvas.height = ch; renderScale = cw / W;
  }

  // ---- level loading ----
  function loadLevel(i) {
    li = ((i % MECH.levels.length) + MECH.levels.length) % MECH.levels.length;
    const L = MECH.levels[li];
    grid = L.grid.map(r => r.padEnd(COLS, " ").slice(0, COLS)); LROWS = grid.length;
    start = { c: 1, r: LROWS - 2 }; exitCell = null;
    for (let r = 0; r < LROWS; r++) for (let c = 0; c < COLS; c++) {
      const ch = grid[r][c];
      if (ch === "S") start = { c, r };
      if (ch === "E") exitCell = { c, r };
    }
    if (MECH.reset) MECH.reset(L, { TILE, COLS });
    spawn();
  }
  function spawn() {
    player = { x: start.c * TILE + (TILE - PW) / 2, y: start.r * TILE + (TILE - PH), prevX: 0, prevY: 0,
      vx: 0, vy: 0, onGround: false, coyote: 0, jumpBuf: 0, dead: false, deathT: 0, facing: 1, gdir: 1, run: 0 };
    player.prevX = player.x; player.prevY = player.y;
    particles = []; levelTime = 0; state = "play";
    if (MECH.respawn) MECH.respawn();
  }
  function die() {
    if (player.dead) return; player.dead = true; player.deathT = 0; deaths++;
    document.getElementById("hud-d").textContent = "DEATHS " + deaths;
    shake = 16; hitStop = 0.05; sDie();
    const cx = player.x + PW / 2, cy = player.y + PH / 2;
    for (let i = 0; i < 26; i++) { const a = i / 26 * 6.28, s = 140 + Math.random() * 280;
      particles.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, life: 0.6 + Math.random() * 0.5, r: 2 + Math.random() * 4,
        c: Math.random() < 0.6 ? "#ff3b54" : (Math.random() < 0.5 ? "#ffcf5c" : "#ff7a18") }); }
  }
  function nextLevel() {
    if (li + 1 < MECH.levels.length) { li++; sWin(); loadLevel(li); }
    else { state = "win"; winT = 0; sWin(); }
    document.getElementById("hud-l").textContent = "LEVEL " + (li + 1) + "/" + MECH.levels.length;
  }

  // ---- collision helpers ----
  function tileSolid(c, r) {
    if (c < 0 || c >= COLS) return true;
    if (r < 0 || r >= LROWS) return false;
    const ch = grid[r][c];
    if (MECH.isSolidTile) { const v = MECH.isSolidTile(ch, c, r); if (v !== undefined) return v; }
    return ch === "#" || ch === "=";
  }
  function moversSolidAt(nx, ny) { // returns the mover AABB the player rect overlaps, else null
    const ms = MECH.solids ? MECH.solids() : null; if (!ms) return null;
    for (const m of ms) if (nx < m.x + m.w && nx + PW > m.x && ny < m.y + m.h && ny + PH > m.y) return m;
    return null;
  }
  function moveAxis(dx, dy) {
    player.x += dx; player.y += dy;
    // grid resolve
    let c0 = Math.floor(player.x / TILE), c1 = Math.floor((player.x + PW - 1) / TILE);
    let r0 = Math.floor(player.y / TILE), r1 = Math.floor((player.y + PH - 1) / TILE);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (!tileSolid(c, r)) continue;
      const bx = c * TILE, by = r * TILE;
      if (dx > 0) player.x = bx - PW; else if (dx < 0) player.x = bx + TILE;
      if (dy > 0) { player.y = by - PH; player.vy = 0; player.onGround = true; landed(c, r); }
      else if (dy < 0) { player.y = by + TILE; player.vy = 0; }
    }
  }
  function landed(c, r) { if (MECH.onLand) MECH.onLand(c, r, grid[r] && grid[r][c]); }

  // ---- step (fixed 120Hz) ----
  function step(dt) {
    if (state !== "play") return;
    animTime += dt;
    player.prevX = player.x; player.prevY = player.y;
    if (player.dead) { player.deathT += dt; if (player.deathT > 0.55) spawn(); return; }
    levelTime += dt;
    if (MECH.preStep) MECH.preStep(dt, env());
    if (MECH.update) MECH.update(dt, env());
    if (state !== "play" || player.dead) return;

    let want = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (Rage._reversed) want = -want;
    if (want !== 0) player.facing = want;
    const a = player.onGround ? ACCEL : AIR;
    if (want !== 0) { player.vx += want * a * dt; player.vx = Math.max(-MOVE, Math.min(MOVE, player.vx)); }
    else { const f = FRICTION * dt; if (player.vx > f) player.vx -= f; else if (player.vx < -f) player.vx += f; else player.vx = 0; }

    if (player.jumpBuf > 0) player.jumpBuf -= dt;
    if (player.onGround) player.coyote = COYOTE; else player.coyote -= dt;
    if (player.jumpBuf > 0 && player.coyote > 0) { player.vy = -JUMP * player.gdir; player.onGround = false; player.coyote = 0; player.jumpBuf = 0; sJump(); }
    if (!keys.jump && player.vy * player.gdir < 0) player.vy += GRAVITY * player.gdir * dt * 0.9;
    player.vy += GRAVITY * player.gdir * dt; player.vy = Math.max(-MAX_FALL, Math.min(MAX_FALL, player.vy));

    const wasG = player.onGround; player.onGround = false;
    moveAxis(player.vx * dt, 0);
    // ride / block on movers (horizontal)
    let onMover = null;
    moveAxis(0, player.vy * dt);
    // mover collision (treat as solid; allow standing & carry)
    const ms = MECH.solids ? MECH.solids() : null;
    if (ms) for (const m of ms) {
      if (player.x < m.x + m.w && player.x + PW > m.x && player.y < m.y + m.h && player.y + PH > m.y) {
        // resolve out by least penetration
        const pen = [ (m.x + m.w) - player.x, (player.x + PW) - m.x, (m.y + m.h) - player.y, (player.y + PH) - m.y ];
        const mn = Math.min(pen[0], pen[1], pen[2], pen[3]);
        if (mn === pen[2]) { player.y = m.y + m.h; if (player.vy < 0) player.vy = 0; }
        else if (mn === pen[3]) { player.y = m.y - PH; player.vy = 0; player.onGround = true; onMover = m; }
        else if (mn === pen[0]) { player.x = m.x + m.w; player.vx = 0; }
        else { player.x = m.x - PW; player.vx = 0; }
      }
    }
    if (onMover && onMover.vx) player.x += onMover.vx * dt; // carry

    // ground-stick (no micro-jitter)
    if (!player.onGround && player.vy * player.gdir >= 0) {
      const fr = player.gdir > 0 ? Math.floor((player.y + PH) / TILE) : Math.floor((player.y - 1) / TILE);
      const cL = Math.floor((player.x + 2) / TILE), cR = Math.floor((player.x + PW - 2) / TILE);
      if (tileSolid(cL, fr) || tileSolid(cR, fr)) { player.y = player.gdir > 0 ? fr * TILE - PH : (fr + 1) * TILE; player.vy = 0; player.onGround = true; }
    }
    if (player.onGround && Math.abs(player.vx) > 60 && Math.random() < 0.15) sStep();
    player.run += Math.abs(player.vx) * dt * 0.05;

    // hazards: grid spikes + dynamic hazards
    const hb = { x: player.x + 3, y: player.y + 4, w: PW - 6, h: PH - 6 };
    let cc = Math.floor((player.x + PW / 2) / TILE), rr = Math.floor((player.y + PH / 2) / TILE);
    const here = grid[rr] && grid[rr][cc];
    if (here === "^" || (MECH.isHazardTile && MECH.isHazardTile(here, cc, rr))) return die();
    const hz = MECH.hazards ? MECH.hazards() : null;
    if (hz) for (const z of hz) if (hb.x < z.x + z.w && hb.x + hb.w > z.x && hb.y < z.y + z.h && hb.y + hb.h > z.y) return die();
    // fall out
    if (player.y > LROWS * TILE + 60 || player.y < -120) return die();
    // reach exit
    if (exitCell && !MECH.fakeExit?.(exitCell)) {
      const ex = exitCell.c * TILE, ey = exitCell.r * TILE;
      if (player.x + PW > ex + 6 && player.x < ex + TILE - 6 && player.y + PH > ey + 6 && player.y < ey + TILE) { winLevel(); }
    }
  }
  function winLevel() { state = "won-anim"; setTimeout(nextLevel, 60); }

  function env() { return { player, grid, LROWS, TILE, COLS, time: levelTime, kill: die, P: pushParts, exit: exitCell }; }
  function pushParts(x, y, n, col) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = 40 + Math.random() * 160; particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4, r: 2, c: col || "#fff" }); } }

  // ---- render ----
  function render() {
    const al = Math.max(0, Math.min(1, acc / DT));
    const rx = player.prevX + (player.x - player.prevX) * al, ry = player.prevY + (player.y - player.prevY) * al;
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    let ox = 0, oy = 0; if (shake > 0) { ox = (Math.random() - .5) * shake; oy = (Math.random() - .5) * shake; ctx.translate(ox, oy); }
    // bg
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, MECH.bg ? MECH.bg[0] : "#0c0810"); g.addColorStop(1, MECH.bg ? MECH.bg[1] : "#05070a");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (MECH.drawBack) MECH.drawBack(ctx, env());
    // grid tiles
    for (let r = 0; r < LROWS; r++) for (let c = 0; c < COLS; c++) {
      const ch = grid[r][c], x = c * TILE, y = r * TILE;
      if (ch === " " || ch === "S") continue;
      if (ch === "#" || ch === "=") drawBlock(x, y);
      else if (ch === "^") drawSpikes(x, y, TILE);
      else if (ch === "E") { if (!MECH.skipDoor) drawDoor(x, y, true); }
      else if (MECH.drawTile) MECH.drawTile(ctx, ch, x, y, c, r);
    }
    if (MECH.drawOver) MECH.drawOver(ctx, env());
    if (!player.dead && state === "play") drawPlayer(rx, ry);
    // particles
    for (const p of particles) { ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2)); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    // vignette
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.9); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    if (state === "win") { ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#ffcf5c"; ctx.font = "bold 40px system-ui"; ctx.textAlign = "center"; ctx.fillText("YOU ESCAPED 😈", W / 2, H / 2 - 8);
      ctx.fillStyle = "#cdd3df"; ctx.font = "18px system-ui"; ctx.fillText(deaths + " deaths · press R to run it back", W / 2, H / 2 + 28); ctx.textAlign = "left"; }
    if (shake > 0) ctx.translate(-ox, -oy);
  }
  function drawBlock(x, y) {
    ctx.fillStyle = MECH.block || "#3a2f55"; ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = "rgba(255,255,255,0.07)"; ctx.fillRect(x, y, TILE, 4);
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(x, y + TILE - 4, TILE, 4);
    ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, TILE - 1, TILE - 1);
  }
  function drawSpikes(x, y, w, up) { // up=true → point up from base y+TILE
    const n = Math.max(2, Math.round(w / 13)); ctx.fillStyle = "#e9edf4";
    for (let i = 0; i < n; i++) { const sx = x + (i + 0.5) * (w / n); ctx.beginPath();
      ctx.moveTo(sx - w / n / 2, y + TILE); ctx.lineTo(sx, y + TILE - 16); ctx.lineTo(sx + w / n / 2, y + TILE); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(x, y + TILE - 3, w, 3);
  }
  function drawDoor(x, y, real) {
    ctx.fillStyle = "#1b1320"; ctx.fillRect(x + 6, y + 2, TILE - 12, TILE - 2);
    const g = ctx.createLinearGradient(x, y, x, y + TILE); g.addColorStop(0, "#ffe79a"); g.addColorStop(1, "#ff9e2c");
    ctx.fillStyle = g; ctx.fillRect(x + 9, y + 5, TILE - 18, TILE - 5);
    ctx.fillStyle = "#1b1320"; ctx.beginPath(); ctx.arc(x + TILE - 14, y + TILE / 2 + 2, 2, 0, 7); ctx.fill();
    const gl = 0.4 + 0.3 * Math.sin(animTime * 3); ctx.save(); ctx.globalAlpha = gl; ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "rgba(255,180,80,0.5)"; ctx.beginPath(); ctx.ellipse(x + TILE / 2, y + TILE / 2, TILE * 0.7, TILE * 0.7, 0, 0, 7); ctx.fill(); ctx.restore();
  }
  function drawPlayer(x, y) {
    const cx = x + PW / 2, cy = y + PH / 2, R = 12, dir = player.facing;
    ctx.save(); ctx.translate(cx, cy);
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(0, R + 2, R, 3, 0, 0, 7); ctx.fill();
    // base glow
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(animTime * 4);
    const gg = ctx.createRadialGradient(0, R, 1, 0, R, 22); gg.addColorStop(0, "rgba(255,90,60,0.6)"); gg.addColorStop(1, "transparent");
    ctx.fillStyle = gg; ctx.beginPath(); ctx.ellipse(0, R, 20, 7, 0, 0, 7); ctx.fill(); ctx.restore();
    // shoes
    const sw = Math.sin(player.run) * 3;
    ctx.fillStyle = "#f2c14e"; ctx.beginPath(); ctx.ellipse(-5 + sw, R, 5, 2.4, 0, 0, 7); ctx.ellipse(5 - sw, R, 5, 2.4, 0, 0, 7); ctx.fill();
    // body
    const bg = ctx.createRadialGradient(-R * .3, -R * .4, 1, 0, 0, R * 1.2); bg.addColorStop(0, "#ff8aa0"); bg.addColorStop(.5, "#ff3b54"); bg.addColorStop(1, "#c01030");
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fill();
    // angry brows + eyes
    const ex = 4.5; ctx.strokeStyle = "#160018"; ctx.lineWidth = 2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-ex - 3, -6.5); ctx.lineTo(-ex + 2.5, -4); ctx.moveTo(ex + 3, -6.5); ctx.lineTo(ex - 2.5, -4); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(-ex, -1.5, 3, 2.6, 0, 0, 7); ctx.ellipse(ex, -1.5, 3, 2.6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#160018"; ctx.beginPath(); ctx.arc(-ex + dir, -1, 1.5, 0, 7); ctx.arc(ex + dir, -1, 1.5, 0, 7); ctx.fill();
    ctx.restore();
  }

  // ---- loop ----
  function frame(now) {
    if (!last) last = now; let dt = (now - last) / 1000; last = now; if (dt > 0.1) dt = 0.1;
    if (hitStop > 0) { hitStop -= dt; dt *= 0.15; }
    acc += dt; let n = 0; while (acc >= DT && n++ < 8) { step(DT); acc -= DT; }
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.life -= dt; } particles = particles.filter(p => p.life > 0);
    if (shake > 0) shake = Math.max(0, shake - dt * 60);
    render(); requestAnimationFrame(frame);
  }

  // ---- input (hardened: game owns the keyboard) ----
  addEventListener("keydown", e => {
    const k = e.key.toLowerCase();
    if (document.activeElement && document.activeElement.tagName === "BUTTON") document.activeElement.blur();
    if (k === "tab" || k === "enter") { e.preventDefault(); return; }
    if (k === "arrowleft" || k === "a") { keys.left = true; e.preventDefault(); }
    else if (k === "arrowright" || k === "d") { keys.right = true; e.preventDefault(); }
    else if (k === "arrowup" || k === "w" || k === " ") { if (state === "play" && !player.dead && !e.repeat) { player.jumpBuf = JBUF; keys.jump = true; } e.preventDefault(); }
    else if (k === "r") { deaths = 0; document.getElementById("hud-d").textContent = "DEATHS 0"; loadLevel(state === "win" ? 0 : li); }
  });
  addEventListener("keyup", e => { const k = e.key.toLowerCase();
    if (k === "arrowleft" || k === "a") keys.left = false; else if (k === "arrowright" || k === "d") keys.right = false;
    else if (k === "arrowup" || k === "w" || k === " ") keys.jump = false; });
  addEventListener("blur", () => { keys.left = keys.right = keys.jump = false; });
  addEventListener("resize", resize);

  const Rage = {
    _reversed: false,
    TILE, COLS, PW, PH,
    init(mech) {
      MECH = mech; canvas = document.getElementById("game"); ctx = canvas.getContext("2d");
      document.getElementById("hud-name").textContent = mech.name;
      resize(); loadLevel(0);
      document.getElementById("hud-l").textContent = "LEVEL 1/" + mech.levels.length;
      // tap-to-focus for autoplay audio
      addEventListener("pointerdown", () => A() && A().resume && A().resume(), { once: false });
      requestAnimationFrame(frame);
    },
    get player() { return player; }, get grid() { return grid; }, get time() { return levelTime; },
    kill: () => die(), parts: pushParts,
    // debug / test hooks
    get state() { return state; }, get level() { return li; }, get deaths() { return deaths; },
    goto(i) { deaths = 0; loadLevel(i); document.getElementById("hud-l").textContent = "LEVEL " + (i + 1) + "/" + MECH.levels.length; },
    press(k, v) { if (k === "left") keys.left = v; else if (k === "right") keys.right = v; else if (k === "jump") { if (v) { player.jumpBuf = JBUF; keys.jump = true; } else keys.jump = false; } },
    exitPx() { return exitCell ? { x: exitCell.c * TILE, y: exitCell.r * TILE } : null; },
  };
  window.Rage = Rage;
})();
