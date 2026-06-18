/* SHELL GAME — betrayal of SPACE.
   Boxes slide. You ride them over a spike pit; the safe footing is always moving, and the box
   you need is never where your instinct says. The exit is guarded by a box that slides across it —
   jump in early and it swats you; wait one beat and slip through. */
window.MECH_SHELL = (function () {
  const T = 40, TAU = Math.PI * 2;
  let movers = [], mt = 0;

  function build(defs) {
    return defs.map(d => ({
      cx: d.cx * T, cy: d.cy * T, w: (d.w || 2) * T, h: (d.h || 0.6) * T,
      ampX: (d.ampX || 0) * T, ampY: (d.ampY || 0) * T, om: TAU / (d.period || 2.2), ph: d.phase || 0,
      x: 0, y: 0, vx: 0,
    }));
  }
  function place() {
    for (const m of movers) {
      m.x = m.cx + m.ampX * Math.sin(m.om * mt + m.ph) - m.w / 2;
      m.y = m.cy + m.ampY * Math.sin(m.om * mt + m.ph) - m.h / 2;
      m.vx = m.ampX * m.om * Math.cos(m.om * mt + m.ph);
    }
  }

  return {
    name: "SHELL GAME · the floor keeps moving",
    bg: ["#0a1018", "#04060a"], block: "#234a6e",
    levels: [
      { // L1 — RIDE: three sliding platforms across a spike pit to the door.
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
          "  S              E  ",
          "####^^^^^^^^^^^^^####",
          "####^^^^^^^^^^^^^####",
        ],
        defs: [
          { cx: 6, cy: 8.2, w: 2, ampX: 1.6, period: 2.6 },
          { cx: 10, cy: 8.2, w: 2, ampX: 1.6, period: 2.2, phase: Math.PI },
          { cx: 14, cy: 8.4, w: 1.6, ampX: 1.1, period: 1.9 },
        ],
      },
      { // L2 — THE SWAP: an elevator + criss-crossing sliders. Timing AND nerve.
        grid: [
          "                    ",
          "                    ",
          "                 E  ",
          "               ###  ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "  S                 ",
          "###^^^^^^^^^^^^^^^^^^",
          "####################",
        ],
        defs: [
          { cx: 5, cy: 7, w: 1.6, ampY: 2.2, period: 2.4 },           // elevator
          { cx: 9.5, cy: 6.4, w: 2, ampX: 2.4, period: 2.8 },          // long slider
          { cx: 13.5, cy: 5, w: 1.8, ampX: 1.6, period: 2.0, phase: 1.6 },
        ],
      },
      { // L3 — THE GATEKEEPER: ride up to the ledge, but a box slides across the door. Time the gap.
        grid: [
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                  E ",
          "               #### ",
          "                    ",
          "                    ",
          "  S                 ",
          "###^^^^^^^^^^^^^^^^^^",
          "####################",
        ],
        defs: [
          { cx: 7, cy: 8.4, w: 1.8, ampX: 1.5, period: 2.2 },           // stepping slider
          { cx: 12, cy: 7.2, w: 1.6, ampX: 1.4, period: 1.9, phase: 1 },// stepping slider (up)
          { cx: 17.4, cy: 5.5, w: 1.3, ampX: 1.3, period: 1.6 },        // the gatekeeper across the door
        ],
      },
    ],
    reset(L) { movers = build(L.defs || []); mt = 0; place(); },
    respawn() { mt = 0; place(); },
    update(dt) { mt += dt; place(); },
    solids() { return movers; },
    drawOver(ctx) {
      for (const m of movers) {
        // a glowing sliding crate
        ctx.fillStyle = "#16324c"; ctx.fillRect(m.x, m.y, m.w, m.h);
        const g = ctx.createLinearGradient(m.x, m.y, m.x, m.y + m.h); g.addColorStop(0, "#3f7fb0"); g.addColorStop(1, "#1d4a6e");
        ctx.fillStyle = g; ctx.fillRect(m.x + 2, m.y + 2, m.w - 4, m.h - 4);
        ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(m.x + 2, m.y + 2, m.w - 4, 3);
        ctx.strokeStyle = "rgba(150,220,255,0.5)"; ctx.lineWidth = 1.4; ctx.strokeRect(m.x + 1, m.y + 1, m.w - 2, m.h - 2);
        // motion cue: faint trailing arrows
        ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = "#9fe8ff";
        const dir = m.vx > 4 ? 1 : (m.vx < -4 ? -1 : 0);
        if (dir) { const ax = dir > 0 ? m.x + m.w + 4 : m.x - 10; ctx.beginPath();
          ctx.moveTo(ax, m.y + m.h / 2 - 4); ctx.lineTo(ax + dir * 6, m.y + m.h / 2); ctx.lineTo(ax, m.y + m.h / 2 + 4); ctx.closePath(); ctx.fill(); }
        ctx.restore();
      }
    },
  };
})();
