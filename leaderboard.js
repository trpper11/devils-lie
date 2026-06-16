/* =====================================================================
   Devil's Lie — global leaderboard + geo
   Backend: jsonblob.com (no signup, CORS-ok). localStorage fallback so
   the game ALWAYS works even if the network/service is down.
   Score ranking: fewest deaths, then fastest time. Finishers only.
   ===================================================================== */
window.LB = (function () {
  "use strict";
  const BLOB = "019ecf14-8391-750a-9021-96eb26ec64c0";
  const URL = "https://jsonblob.com/api/jsonBlob/" + BLOB;
  const LS_SCORES = "devilslie.local.scores";
  const LS_GEO = "devilslie.geo";
  const LS_NAME = "devilslie.name";

  function lget(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }
  function lset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  // ---- name memory ----
  const getName = () => { try { return localStorage.getItem(LS_NAME) || ""; } catch (e) { return ""; } };
  const setName = (n) => { try { localStorage.setItem(LS_NAME, n); } catch (e) {} };

  // ---- country flag from ISO code ----
  function flag(cc) {
    if (!cc || cc.length !== 2) return "🏴‍☠️";
    try { return String.fromCodePoint(...[...cc.toUpperCase()].map(c => 127397 + c.charCodeAt(0))); }
    catch (e) { return "🏴‍☠️"; }
  }

  // ---- geolocate the player (cached) ----
  async function geo() {
    const cached = lget(LS_GEO, null);
    if (cached && cached.cc !== undefined) return cached;
    try {
      const r = await fetch("https://ipwho.is/?fields=country,country_code", { cache: "no-store" });
      const j = await r.json();
      const g = { country: j.country || "", cc: (j.country_code || "").toUpperCase() };
      if (g.cc) lset(LS_GEO, g); // don't cache an empty 200 result permanently
      return g;
    } catch (e) {
      return { country: "", cc: "" };
    }
  }

  function sortScores(arr) {
    return arr.slice().sort((a, b) => (a.deaths - b.deaths) || (a.time - b.time) || (a.ts - b.ts));
  }

  async function fetchScores() {
    try {
      const r = await fetch(URL, { cache: "no-store" });
      if (!r.ok) throw new Error("bad status");
      const j = await r.json();
      const remote = Array.isArray(j.scores) ? j.scores : [];
      // merge any local-only entries that never made it up
      const local = lget(LS_SCORES, []);
      const seen = new Set(remote.map(e => e.name + "|" + e.ts));
      const merged = remote.concat(local.filter(e => !seen.has(e.name + "|" + e.ts)));
      return sortScores(merged);
    } catch (e) {
      return sortScores(lget(LS_SCORES, []));
    }
  }

  // entry: {name, cc, country, deaths, time}
  async function submit(entry) {
    entry.ts = Date.now();
    entry.name = (entry.name || "ANON").slice(0, 14);
    // always record locally first
    const local = lget(LS_SCORES, []);
    local.push(entry);
    lset(LS_SCORES, sortScores(local).slice(0, 200));
    // then try to push to the global board (read-modify-write)
    try {
      const cur = await fetchScores();
      cur.push(entry);
      const top = sortScores(cur).slice(0, 200);
      const r = await fetch(URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scores: top }),
      });
      return r.ok;
    } catch (e) {
      return false; // local still saved
    }
  }

  return { geo, flag, fetchScores, submit, sortScores, getName, setName };
})();
