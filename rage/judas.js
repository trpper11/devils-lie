/* JUDAS — betrayal of TRUST.
   'J' = a block that looks solid (it IS solid) but erupts spikes a beat after you land on it.
   'C' = a block that crumbles away a beat after you stand on it.
   The TELL (fair): J has a faint hairline CRACK; C has faint loose SEAMS. Read them, or never linger. */
window.MECH_JUDAS = (function () {
  const T = 40;
  let st = {};          // per-cell trigger state, key "c,r"
  const ERUPT = 0.24, CRUMBLE = 0.34;

  function key(c, r) { return c + "," + r; }

  return {
    name: "JUDAS · trust nothing you stand on",
    bg: ["#140a12", "#070409"], block: "#3a2350",
    levels: [
      { // L1 — the lesson: hop the stones; cracked ones (Judas) erupt if you linger. 2-wide, easy gaps.
        grid: [
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "   ## JJ ## JJ ##   ",
          "  S               E ",
          "###^^^^^^^^^^^^^^^^##",
          "###^^^^^^^^^^^^^^^^##",
        ],
      },
      { // L2 — a traitor ramp: crumble first step, then wide Judas steps, up to the door. Keep moving.
        grid: [
          "                    ",
          "                    ",
          "                    ",
          "        E           ",
          "      ####          ",
          "     JJJ            ",
          "   JJJ              ",
          " ###                ",
          " S                  ",
          "##                  ",
          "##^^^^^^^^^^^^^^^^^^^",
          "####################",
        ],
      },
      { // L3 — pure gauntlet: every stone is a Judas. Never stop moving, all the way to the door.
        grid: [
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "                    ",
          "  JJ JJ JJ JJ JJ    ",
          " S               E  ",
          "##^^^^^^^^^^^^^^^##^^",
          "####################",
        ],
      },
    ],
    reset() { st = {}; },
    respawn() { st = {}; },
    isSolidTile(ch, c, r) {
      if (ch === "#" || ch === "=") return true;
      if (ch === "J") return true;                       // always solid; the spikes are what kill
      if (ch === "C") { const s = st[key(c, r)]; return !(s && s.gone); }
      return ch === "E" ? false : undefined;
    },
    onLand(c, r, ch) {
      const k = key(c, r);
      if (ch === "J" && !st[k]) st[k] = { kind: "J", t: 0 };
      else if (ch === "C" && !st[k]) st[k] = { kind: "C", t: 0 };
    },
    update(dt) {
      for (const k in st) { const s = st[k]; s.t += dt;
        if (s.kind === "C" && !s.gone && s.t > CRUMBLE) { s.gone = true; const [c, r] = k.split(",").map(Number);
          Rage.parts(c * T + T / 2, r * T + T / 2, 10, "#6b4ea0"); }
      }
    },
    hazards() {  // erupted Judas spikes (top of the block) become deadly
      const h = [];
      for (const k in st) { const s = st[k]; if (s.kind === "J" && s.t > ERUPT) { const [c, r] = k.split(",").map(Number);
        h.push({ x: c * T + 2, y: r * T - 4, w: T - 4, h: 16 }); } }
      return h;
    },
    drawTile(ctx, ch, x, y, c, r) {
      if (ch === "J") {
        // looks like a normal block, with a faint hairline crack (the tell)
        ctx.fillStyle = "#3a2350"; ctx.fillRect(x, y, T, T);
        ctx.fillStyle = "rgba(255,255,255,0.06)"; ctx.fillRect(x, y, T, 4);
        ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(x, y + T - 4, T, 4);
        ctx.strokeStyle = "rgba(20,0,25,0.55)"; ctx.lineWidth = 1.1; ctx.beginPath();
        ctx.moveTo(x + 12, y + 6); ctx.lineTo(x + 20, y + 18); ctx.lineTo(x + 16, y + 30); ctx.stroke();
        const s = st[key(c, r)];
        if (s && s.kind === "J") {                       // spikes growing/erupted on top
          const g = Math.min(1, s.t / ERUPT), full = s.t > ERUPT;
          const hh = (full ? 16 : 16 * g), n = 3; ctx.fillStyle = full ? "#fff" : "#ff8aa0";
          for (let i = 0; i < n; i++) { const sx = x + (i + .5) * (T / n);
            ctx.beginPath(); ctx.moveTo(sx - T / n / 2, y); ctx.lineTo(sx, y - hh); ctx.lineTo(sx + T / n / 2, y); ctx.closePath(); ctx.fill(); }
        }
      } else if (ch === "C") {
        const s = st[key(c, r)]; if (s && s.gone) return;
        const shake = s ? Math.sin(s.t * 50) * Math.min(3, s.t * 12) : 0;
        ctx.save(); ctx.translate(shake, 0);
        ctx.fillStyle = "#43355e"; ctx.fillRect(x, y, T, T);
        ctx.fillStyle = "rgba(255,255,255,0.06)"; ctx.fillRect(x, y, T, 4);
        // loose seams (the tell)
        ctx.strokeStyle = "rgba(15,0,20,0.5)"; ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(x + 13, y + 3); ctx.lineTo(x + 13, y + T - 3); ctx.moveTo(x + 27, y + 3); ctx.lineTo(x + 27, y + T - 3);
        ctx.moveTo(x + 3, y + 20); ctx.lineTo(x + T - 3, y + 20); ctx.stroke();
        ctx.restore();
      }
    },
  };
})();
