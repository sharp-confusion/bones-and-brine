'use strict';
/* Bones & Brine — pure liar's dice rules engine (no DOM). */
const Engine = (() => {
  const rollDie = () => 1 + Math.floor(Math.random() * 6);

  function create(seats, settings) {
    const st = Object.assign({ onesWild: false, spotOn: false, startDice: 5 }, settings || {});
    st.startDice = Math.max(3, Math.min(6, st.startDice | 0 || 5));
    const s = {
      settings: st,
      players: seats.map(p => ({
        id: p.id, name: p.name, avatar: p.avatar, kit: p.kit,
        bot: p.bot || null, count: st.startDice, dice: [], out: false
      })),
      round: 0, turn: 0, bid: null, history: [], phase: 'bidding',
      result: null, winner: -1, log: []
    };
    startRound(s, Math.floor(Math.random() * s.players.length));
    return s;
  }

  function log(s, e) { s.log.push(e); if (s.log.length > 50) s.log.shift(); }
  const active = s => s.players.filter(p => !p.out);
  function nextActive(s, from, inclusive) {
    const n = s.players.length;
    for (let k = inclusive ? 0 : 1; k <= n; k++) {
      const i = (from + k) % n;
      if (!s.players[i].out) return i;
    }
    return -1;
  }
  const totalDice = s => s.players.reduce((a, p) => a + (p.out ? 0 : p.count), 0);
  const isWildFor = (s, face) => !!s.settings.onesWild && face !== 1;
  const matches = (s, die, face) => die === face || (isWildFor(s, face) && die === 1);
  function countFace(s, face) {
    let c = 0;
    s.players.forEach(p => p.dice.forEach(d => { if (matches(s, d, face)) c++; }));
    return c;
  }

  function isLegal(s, bid) {
    const qty = bid.qty | 0, face = bid.face | 0;
    if (face < 1 || face > 6 || qty < 1 || qty > totalDice(s)) return false;
    const prev = s.bid;
    if (!prev) return true;
    const wild = s.settings.onesWild;
    if (!wild || (prev.face !== 1 && face !== 1)) {
      return qty > prev.qty || (qty === prev.qty && face > prev.face);
    }
    if (prev.face === 1 && face === 1) return qty > prev.qty;
    if (face === 1) return qty >= Math.ceil(prev.qty / 2);   // switching to wild 1s: half the count
    return qty >= prev.qty * 2 + 1;                           // leaving 1s: double plus one
  }

  function minQty(s, face) {
    const t = totalDice(s);
    for (let q = 1; q <= t; q++) if (isLegal(s, { qty: q, face })) return q;
    return null;
  }

  const err = m => ({ ok: false, error: m });

  function apply(s, idx, a) {
    if (!a || s.phase !== 'bidding') return err('Not the time for that, matey');
    if (idx !== s.turn) return err("It's not yer turn");
    const me = s.players[idx];
    if (a.type === 'bid') {
      const qty = a.qty | 0, face = a.face | 0;
      if (!isLegal(s, { qty, face })) return err('Yer wager must beat the last one');
      s.bid = { qty, face, by: idx };
      s.history.push({ qty, face, by: idx });
      log(s, { k: 'bid', p: idx, qty, face });
      s.turn = nextActive(s, idx, false);
      return { ok: true };
    }
    if (a.type === 'liar' || a.type === 'spot') {
      if (!s.bid) return err('No wager to challenge yet');
      if (a.type === 'spot' && !s.settings.spotOn) return err('Spot On is not allowed this game');
      const actual = countFace(s, s.bid.face);
      const r = { type: a.type, caller: idx, bidder: s.bid.by, bid: { ...s.bid }, actual, loser: -1, gainer: -1, eliminated: false, capped: false };
      if (a.type === 'liar') {
        r.loser = actual >= s.bid.qty ? idx : s.bid.by;
      } else if (actual === s.bid.qty) {
        r.gainer = idx;
        if (me.count < s.settings.startDice) me.count++; else r.capped = true;
      } else {
        r.loser = idx;
      }
      // who made someone lose a die (earns a doubloon): the winner of the challenge
      r.earner = r.loser < 0 ? -1 : (r.loser === idx ? s.bid.by : idx);
      log(s, { k: a.type, p: idx, t: s.bid.by });
      if (r.loser >= 0) {
        const L = s.players[r.loser];
        L.count--;
        if (L.count <= 0) { L.count = 0; L.out = true; r.eliminated = true; }
      }
      s.result = r;
      s.phase = 'reveal';
      log(s, { k: 'result', actual, face: r.bid.face, loser: r.loser, gainer: r.gainer, out: r.eliminated });
      const alive = active(s);
      if (alive.length <= 1) {
        s.phase = 'over';
        s.winner = alive.length ? s.players.indexOf(alive[0]) : r.caller;
        log(s, { k: 'win', p: s.winner });
      }
      return { ok: true, result: r };
    }
    return err('Unknown action');
  }

  function startRound(s, starter) {
    s.round++; s.bid = null; s.history = []; s.result = null; s.phase = 'bidding';
    s.players.forEach(p => { p.dice = p.out ? [] : Array.from({ length: p.count }, rollDie).sort((a, b) => a - b); });
    s.turn = nextActive(s, starter, true);
    log(s, { k: 'round', n: s.round });
  }

  function nextRound(s) {
    if (s.phase !== 'reveal') return;
    const r = s.result;
    let start = r.gainer >= 0 ? r.gainer : r.loser;
    if (start < 0 || s.players[start].out) start = nextActive(s, Math.max(0, start), false);
    startRound(s, start);
  }

  /** Copy of the state with other players' dice hidden while bidding. */
  function viewFor(s, idx) {
    const v = JSON.parse(JSON.stringify(s));
    if (s.phase === 'bidding') v.players.forEach((p, i) => { if (i !== idx) p.dice = []; });
    return v;
  }

  /** Always-legal move, used as a safety net if a bot (or a timed-out player) ever proposes an illegal one. */
  function fallbackMove(s) {
    if (s.bid) return { type: 'liar' };
    return { type: 'bid', qty: 1, face: 2 };
  }

  return { create, apply, nextRound, isLegal, minQty, totalDice, countFace, matches, isWildFor, nextActive, viewFor, fallbackMove };
})();
