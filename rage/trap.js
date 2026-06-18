/* DEVIL'S LIE — real rage bait.
   The level looks like a 4-second walk to an obvious door. It is not. Every trap is INVISIBLE and
   UNTELEGRAPHED — no cracks, no tells, no warning. You cannot avoid them the first time; you die,
   you learn the spot, you retry. Traps re-arm on every death, so the gauntlet is identical each run.
   Grid liars (drawn IDENTICAL to a safe element):
     v = floor that VANISHES the instant you stand on it.
     B = block that ERUPTS spikes the instant you land on it.
   Position-triggered traps (invisible until they fire):
     popspike  — a spike stabs up from flat ground as you reach it.
     drop      — a spike falls from the ceiling through your path, then vanishes into the pit.
     doorspike — a spike pops up kissing the door; jump it or die on the doorstep.
     runaway   — the door bolts somewhere behind you the instant you get close. */
window.MECH_TRAP = (function () {
  const T = 40, BLOCK = "#3a2350";
  let traps = [], vanished = new Set(), baited = {};

  function blockArt(ctx, x, y) {            // identical to core's safe block — that's the lie
    ctx.fillStyle = BLOCK; ctx.fillRect(x, y, T, T);
    ctx.fillStyle = "rgba(255,255,255,0.07)"; ctx.fillRect(x, y, T, 4);
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(x, y + T - 4, T, 4);
    ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, T - 1, T - 1);
  }
  function spikesUp(ctx, x, yTop, w) {      // spikes filling a tile [yTop, yTop+T], pointing up
    const n = Math.max(2, Math.round(w / 13)); ctx.fillStyle = "#eef2f8";
    for (let i = 0; i < n; i++) { const sx = x + (i + .5) * (w / n);
      ctx.beginPath(); ctx.moveTo(sx - w / n / 2, yTop + T); ctx.lineTo(sx, yTop + 2); ctx.lineTo(sx + w / n / 2, yTop + T); ctx.closePath(); ctx.fill(); }
  }
  function spikesDown(ctx, x, y, w) {       // points down from y
    const n = Math.max(2, Math.round(w / 13)); ctx.fillStyle = "#eef2f8";
    for (let i = 0; i < n; i++) { const sx = x + (i + .5) * (w / n);
      ctx.beginPath(); ctx.moveTo(sx - w / n / 2, y); ctx.lineTo(sx, y + 28); ctx.lineTo(sx + w / n / 2, y); ctx.closePath(); ctx.fill(); }
  }
  const fire = (t) => { t.on = true; t.t = 0; Rage.shakeNow(t.do === "runaway" ? 9 : 13); Rage.boom(); };
  const dropY = (t) => Math.min(8 * T, t.r * T + 1700 * t.t);   // falls, then plants on the floor as a spike

  return {
    name: "DEVIL'S LIE · it only looks easy",
    bg: ["#0c0710", "#05040a"], block: BLOCK,
    levels: [
      { // L1 — "easy." A flat stroll to the door. Three cheap deaths hide in plain sight.
        grid: [
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "  S              E  ",
          "########v###########",
          "^^^^^^^^^^^^^^^^^^^^^",
        ],
        traps: [
          { do: "popspike", c: 5, r: 8, at: 4.2 },     // stabs up mid-stroll
          { do: "drop", c: 11, r: 0, at: 9.0 },         // a spike on the head once you relax
          { do: "doorspike", c: 16, r: 8, at: 14.3 },   // and the doorstep itself
        ],
      },
      { // L2 — the bait block. The floor breaks; the obvious stepping-stone is the kill.
        grid: [
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "  S              E  ",
          "#####B^####v########",
          "^^^^^^^^^^^^^^^^^^^^^",
        ],
        traps: [
          { do: "drop", c: 9, r: 0, at: 7.0 },          // ambush on step two
          { do: "doorspike", c: 16, r: 8, at: 14.3 },
        ],
      },
      { // L3 — the door is the bait. Walk the whole gauntlet, reach for it... and it bolts behind you.
        grid: [
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "  S              E  ",
          "##########v#########",
          "^^^^^^^^^^^^^^^^^^^^^",
        ],
        traps: [
          { do: "popspike", c: 5, r: 8, at: 4.2 },
          { do: "runaway", c: 17, r: 8, to: { c: 1, r: 8 }, at: 14.6 }, // the door bolts back to the start — walk it all again
        ],
      },
    ],
    reset(L) { traps = (L.traps || []).map(t => ({ ...t, on: false, t: 0 })); vanished = new Set(); baited = {}; },
    respawn() { for (const t of traps) { t.on = false; t.t = 0; } vanished = new Set(); baited = {}; },

    isSolidTile(ch, c, r) {
      if (ch === "v") return !vanished.has(c + "," + r);
      if (ch === "B") return true;
      if (ch === "#" || ch === "=") return true;
      return ch === "E" ? false : undefined;
    },
    isHazardTile(ch) { return ch === "^"; },

    onLand(c, r, ch) {
      if (ch === "v" && !vanished.has(c + "," + r)) { vanished.add(c + "," + r); Rage.shakeNow(11); Rage.boom(); }
      if (ch === "B" && !baited[c + "," + r]) { baited[c + "," + r] = 0.0001; Rage.shakeNow(13); Rage.boom(); }
    },

    preStep(dt, env) {
      const px = (env.player.x + Rage.PW / 2) / T;
      for (const k in baited) baited[k] += dt;
      for (const t of traps) {
        if (t.on) { t.t += dt; }
        else if (t.at != null && px >= t.at) {
          fire(t);
          if (t.do === "runaway" && env.exit) { env.exit.c = t.to.c; env.exit.r = t.to.r; }
        }
      }
    },

    hazards() {
      const h = [];
      for (const k in baited) { if (baited[k] > 0.05) { const [c, r] = k.split(",").map(Number); h.push({ x: c * T + 2, y: r * T - 13, w: T - 4, h: 17 }); } }
      for (const t of traps) {
        if (!t.on) continue;
        if (t.do === "popspike" || t.do === "doorspike") h.push({ x: t.c * T + 3, y: t.r * T + 5, w: T - 6, h: T - 5 });
        else if (t.do === "drop") { const y = dropY(t); h.push({ x: t.c * T + 5, y: y, w: T - 10, h: 38 }); }  // falling, then a planted floor spike
      }
      return h;
    },

    drawTile(ctx, ch, x, y, c, r) {
      if (ch === "v") { if (!vanished.has(c + "," + r)) blockArt(ctx, x, y); }
      else if (ch === "B") { blockArt(ctx, x, y); if (baited[c + "," + r] > 0.04) spikesUp(ctx, x, y - T, T); }
    },
    drawOver(ctx) {
      for (const t of traps) {
        if (!t.on) continue;
        if (t.do === "popspike" || t.do === "doorspike") { const g = Math.min(1, t.t / 0.05); spikesUp(ctx, t.c * T, t.r * T + (1 - g) * T, T); }
        else if (t.do === "drop") { const y = dropY(t); if (y < 8 * T - 1) spikesDown(ctx, t.c * T, y, T); else spikesUp(ctx, t.c * T, 8 * T, T); }
      }
    },
  };
})();
