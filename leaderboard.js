/* =====================================================================
   Devil's Lie — global leaderboard + geo
   Backend: jsonblob.com (no signup, CORS-ok). localStorage fallback so
   the game ALWAYS works even if the network/service is down.

   Everyone who presses PLAY goes on the board — not just finishers.
   Ranking: finishers first (fewest deaths, then fastest time), then
   everyone still trying, by furthest level reached (then fewest deaths).
   Each browser has a stable id so a player updates their own row.
   ===================================================================== */
window.LB = (function () {
  "use strict";
  // Firebase Realtime Database (test-mode, public read/write) — sends CORS headers,
  // unlike jsonblob, so global saves actually work in the browser. Stores the scores
  // array directly at /scores.json.
  const URL = "https://devils-lie-default-rtdb.firebaseio.com/scores.json";
  const REMOTE_ON = true;
  const LS_SCORES = "devilslie.local.scores";
  const LS_GEO = "devilslie.geo";
  const LS_NAME = "devilslie.name";
  const LS_ID = "devilslie.id";

  function lget(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }
  function lset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  const getName = () => { try { return localStorage.getItem(LS_NAME) || ""; } catch (e) { return ""; } };
  const setName = (n) => { try { localStorage.setItem(LS_NAME, n); } catch (e) {} };
  function myId() {
    let id = null; try { id = localStorage.getItem(LS_ID); } catch (e) {}
    if (!id) { id = "p" + Math.abs(((getName() + navigator.userAgent).split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7))) + "_" + (lget("devilslie.seq", 0)); try { localStorage.setItem(LS_ID, id); } catch (e) {} }
    return id;
  }

  function flag(cc) {
    if (!cc || cc.length !== 2) return "🏴‍☠️";
    try { return String.fromCodePoint(...[...cc.toUpperCase()].map(c => 127397 + c.charCodeAt(0))); }
    catch (e) { return "🏴‍☠️"; }
  }

  async function geo() {
    const cached = lget(LS_GEO, null);
    if (cached && cached.cc) return cached;
    try {
      // api.country.is — CORS-enabled, no key, reliable. Returns the country code.
      const r = await fetch("https://api.country.is/", { cache: "no-store" });
      const j = await r.json();
      const cc = (j.country || "").toUpperCase();
      let country = cc;
      try { country = new Intl.DisplayNames(["en"], { type: "region" }).of(cc) || cc; } catch (e) {}
      const g = { country, cc };
      if (cc) lset(LS_GEO, g);
      return g;
    } catch (e) { return { country: "", cc: "" }; }
  }

  // ranking: finishers (deaths asc, time asc) above everyone-still-trying (level desc, deaths asc)
  function sortScores(arr) {
    return arr.slice().sort((a, b) => {
      const af = a.finished ? 1 : 0, bf = b.finished ? 1 : 0;
      if (af !== bf) return bf - af;
      if (af) return (a.deaths - b.deaths) || (a.time - b.time) || (a.ts - b.ts);
      return ((b.level || 1) - (a.level || 1)) || (a.deaths - b.deaths) || (b.ts - a.ts);
    });
  }
  // collapse to one row per player id (latest wins)
  function dedupe(arr) {
    const byId = new Map();
    for (const e of arr) {
      if (!e || typeof e !== "object") continue;
      const key = e.id || (e.name + "|" + e.ts);
      const prev = byId.get(key);
      if (!prev || (e.ts || 0) >= (prev.ts || 0)) byId.set(key, e);
    }
    return [...byId.values()];
  }

  async function fetchRemote() {
    if (!REMOTE_ON) return null;                    // local-only during dev
    try {
      const r = await fetch(URL, { cache: "no-store" });
      if (!r.ok) throw new Error("bad status");
      const j = await r.json();
      // Firebase returns the array directly (null when empty); tolerate the old {scores:[]} shape too
      return Array.isArray(j) ? j : (j && Array.isArray(j.scores) ? j.scores : []);
    } catch (e) { return null; }
  }
  async function fetchScores() {
    const remote = await fetchRemote();
    const local = lget(LS_SCORES, []);
    const merged = dedupe((remote || []).concat(local));
    return sortScores(merged);
  }

  // ---- the current player's run ----
  let me = null, flushTimer = null, lastFlush = 0;
  function saveLocal() {
    if (!me) return;
    const local = dedupe(lget(LS_SCORES, []).concat([me]));
    lset(LS_SCORES, sortScores(local).slice(0, 200));
  }
  async function flush() {
    if (!me) return false;
    lastFlush = Date.now();
    saveLocal();
    if (!REMOTE_ON) return false;                    // local-only during dev (no network noise)
    try {
      const remote = await fetchRemote();
      if (remote === null) return false;            // offline — local copy already saved
      const merged = dedupe(remote.concat([me]));
      const top = sortScores(merged).slice(0, 200);
      // text/plain is a CORS-"simple" content type → no preflight; Firebase stores the array directly.
      const r = await fetch(URL, { method: "PUT", headers: { "Content-Type": "text/plain;charset=UTF-8" }, body: JSON.stringify(top) });
      return r.ok;
    } catch (e) { return false; }
  }
  function scheduleFlush(immediate) {
    saveLocal();
    if (immediate) { if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; } return flush(); }
    if (flushTimer) return;                          // already pending
    const wait = Math.max(0, 5000 - (Date.now() - lastFlush)); // throttle network writes to ~1/5s
    flushTimer = setTimeout(() => { flushTimer = null; flush(); }, wait);
  }

  function startRun(info) {
    me = { id: myId(), name: (info.name || "ANON").slice(0, 14), cc: info.cc || "", country: info.country || "",
      finished: false, level: 1, deaths: 0, time: 0, ts: Date.now() };
    scheduleFlush(true);                             // appear on the board immediately
  }
  function progress(level, deaths) {
    if (!me) return;
    me.level = Math.max(me.level || 1, level | 0); me.deaths = deaths | 0; me.ts = Date.now();
    scheduleFlush(false);
  }
  function finish(info) {
    if (!me) me = { id: myId(), name: (info.name || "ANON").slice(0, 14), cc: info.cc || "", country: info.country || "", level: 50 };
    me.finished = true; me.deaths = info.deaths | 0; me.time = +info.time || 0; me.level = info.totalLevels || me.level || 50; me.ts = Date.now();
    return scheduleFlush(true);
  }

  return { geo, flag, fetchScores, sortScores, getName, setName, startRun, progress, finish };
})();
