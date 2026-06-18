/* MIRROR — betrayal of PERCEPTION.
   'M' = a fake door, identical to the real one, but deadly. The obvious door is the lie.
   'O' = a fake platform: looks solid, you fall straight through.
   'H' = a phantom floor: looks like empty air, but it holds you up (the tell: a faint shimmer).
   'R' columns = a reverse zone: your left/right flip (the tell: a faint violet haze). */
window.MECH_MIRROR = (function () {
  const T = 40;
  let revZones = [];

  function doorArt(ctx, x, y, t) {
    ctx.fillStyle = "#1b1320"; ctx.fillRect(x + 6, y + 2, T - 12, T - 2);
    const g = ctx.createLinearGradient(x, y, x, y + T); g.addColorStop(0, "#ffe79a"); g.addColorStop(1, "#ff9e2c");
    ctx.fillStyle = g; ctx.fillRect(x + 9, y + 5, T - 18, T - 5);
    ctx.fillStyle = "#1b1320"; ctx.beginPath(); ctx.arc(x + T - 14, y + T / 2 + 2, 2, 0, 7); ctx.fill();
    const gl = 0.4 + 0.3 * Math.sin(t * 3); ctx.save(); ctx.globalAlpha = gl; ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "rgba(255,180,80,0.5)"; ctx.beginPath(); ctx.ellipse(x + T / 2, y + T / 2, T * 0.7, T * 0.7, 0, 0, 7); ctx.fill(); ctx.restore();
  }
  function blockArt(ctx, x, y) {
    ctx.fillStyle = "#2a3550"; ctx.fillRect(x, y, T, T);
    ctx.fillStyle = "rgba(255,255,255,0.07)"; ctx.fillRect(x, y, T, 4);
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(x, y + T - 4, T, 4);
    ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, T - 1, T - 1);
  }

  return {
    name: "MIRROR · forward is a lie",
    bg: ["#0b1016", "#05070a"], block: "#2a3550",
    levels: [
      { // L1 — the obvious door (right) is fake; the real one is behind you (left).
        grid: [
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          " E       S        M ",
          "####################",
          "####################",
          "####################",
        ],
      },
      { // L2 — the floor lies: solid-looking tiles (O) drop you; an empty-looking gap (H) holds you.
        grid: [
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "  S            E    ",
          "####OO####  HH######",
          "####^^####^^^^######",
          "####^^####^^^^######",
        ],
      },
      { // L3 — controls flip in the violet haze; the first door is a fake, jump it, reach the real one.
        grid: [
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "  S          M   E  ",
          "####################",
          "####################",
          "####################",
        ],
        rev: [[7, 17]],
      },
    ],
    reset(L) { revZones = L.rev || []; Rage._reversed = false; },
    respawn() { Rage._reversed = false; },
    isSolidTile(ch) {
      if (ch === "#" || ch === "=") return true;
      if (ch === "H") return true;     // phantom floor — looks empty, holds you
      if (ch === "O") return false;    // fake platform — looks solid, drops you
      if (ch === "M") return false;    // fake door
      return ch === "E" ? false : undefined;
    },
    isHazardTile(ch) { return ch === "M"; },   // the fake door kills on touch
    preStep() {
      const p = Rage.player, cx = (p.x + Rage.PW / 2) / T;
      let on = false; for (const z of revZones) if (cx >= z[0] && cx <= z[1] + 1) on = true;
      Rage._reversed = on;
    },
    drawBack(ctx) {
      for (const z of revZones) { const x = z[0] * T, w = (z[1] - z[0] + 1) * T;
        ctx.fillStyle = "rgba(150,80,255,0.10)"; ctx.fillRect(x, 0, w, 12 * T);
        ctx.strokeStyle = "rgba(180,120,255,0.35)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 12 * T); ctx.moveTo(x + w, 0); ctx.lineTo(x + w, 12 * T); ctx.stroke(); }
    },
    drawTile(ctx, ch, x, y, c, r) {
      if (ch === "M") doorArt(ctx, x, y, Rage.time * 6 + c);   // identical to the real door
      else if (ch === "O") blockArt(ctx, x, y);                 // identical to a real block
      else if (ch === "H") {                                    // phantom floor — barely-there shimmer (the tell)
        const a = 0.06 + 0.05 * Math.sin(Rage.time * 4 + c);
        ctx.fillStyle = "rgba(150,200,255," + a + ")"; ctx.fillRect(x, y + T - 6, T, 6);
        ctx.fillStyle = "rgba(200,225,255,0.12)"; for (let i = 0; i < 3; i++) ctx.fillRect(x + 4 + i * 12, y + T - 5, 2, 2);
      }
    },
  };
})();
