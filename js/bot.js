'use strict';
/* Bones & Brine — bot crew. Bots only ever look at their OWN dice, like a real player. */
const Bot = (() => {
  const PERSONAS = {
    cautious: { label: 'Cautious Cook',   call: 0.40, safe: 0.62, aggro: 0.05, bluff: 0.06, spot: 0.34 },
    balanced: { label: 'Steady Sailor',   call: 0.33, safe: 0.50, aggro: 0.20, bluff: 0.14, spot: 0.30 },
    bold:     { label: 'Reckless Raider', call: 0.25, safe: 0.40, aggro: 0.50, bluff: 0.20, spot: 0.28 },
    sly:      { label: 'Sly Swindler',    call: 0.31, safe: 0.47, aggro: 0.25, bluff: 0.28, spot: 0.27 }
  };
  const KEYS = Object.keys(PERSONAS);
  const randomPersona = () => KEYS[Math.floor(Math.random() * KEYS.length)];

  function comb(n, k) {
    if (k < 0 || k > n) return 0;
    k = Math.min(k, n - k);
    let r = 1;
    for (let i = 1; i <= k; i++) r = r * (n - k + i) / i;
    return r;
  }
  const pmf = (n, p, k) => (k < 0 || k > n) ? 0 : comb(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
  function tail(n, p, k) { // P(X >= k)
    if (k <= 0) return 1;
    if (k > n) return 0;
    let s = 0;
    for (let i = k; i <= n; i++) s += pmf(n, p, i);
    return Math.min(1, s);
  }

  function ctx(s, idx, readTable) {
    const me = s.players[idx];
    const total = Engine.totalDice(s);
    const unknown = Math.max(0, total - me.dice.length);
    const known = f => me.dice.filter(d => Engine.matches(s, d, f)).length;
    const pf = f => Engine.isWildFor(s, f) ? 1 / 3 : 1 / 6;
    // Reading the table: other pirates who wagered on a face probably hold some of it.
    const implied = f => {
      if (!readTable) return 0;
      const bidders = new Set(s.history.filter(h => h.by !== idx && (h.face === f || (Engine.isWildFor(s, f) && h.face === 1))).map(h => h.by));
      return Math.min(unknown * pf(f) * 0.6, bidders.size * 0.55);
    };
    const need = b => b.qty - known(b.face) - implied(b.face);
    const tailF = (n, p, k) => { const lo = Math.floor(k), fr = k - lo; return tail(n, p, lo) * (1 - fr) + tail(n, p, lo + 1) * fr; };
    return {
      me, total, unknown, known,
      pTrue: b => tailF(unknown, pf(b.face), need(b)),
      pExact: b => pmf(unknown, pf(b.face), Math.round(need(b)))
    };
  }

  /** Probability (from seat's point of view, own dice only) that a bid is true. Used for the parrot hint. */
  function odds(s, idx, bid) { return ctx(s, idx, false).pTrue(bid); }

  function decide(s, idx) {
    const c = ctx(s, idx, true);
    const P = PERSONAS[c.me.bot && c.me.bot.persona] || PERSONAS.balanced;
    const noise = () => (Math.random() - 0.5) * 0.12;
    let curTrue = 1;

    if (s.bid) {
      curTrue = c.pTrue(s.bid);
      if (s.settings.spotOn && c.me.count < s.settings.startDice) {
        const pe = c.pExact(s.bid);
        if (pe > P.spot + 0.08 && pe > (1 - curTrue) + 0.05 && Math.random() < 0.7) return { type: 'spot' };
      }
      if (curTrue < P.call + noise()) return { type: 'liar' };
    }

    const bluffing = Math.random() < P.bluff;
    const threshold = bluffing ? P.safe - 0.22 : P.safe;
    const cands = [];
    for (let f = 1; f <= 6; f++) {
      if (!s.bid && s.settings.onesWild && f === 1 && Math.random() < 0.85) continue;
      const mq = Engine.minQty(s, f);
      if (mq == null) continue;
      for (let q = mq; q <= Math.min(c.total, mq + 3); q++) {
        const b = { qty: q, face: f };
        cands.push({ b, pt: c.pTrue(b), jump: q - mq, own: c.known(f) });
      }
    }
    if (!cands.length) return { type: 'liar' };

    const score = x => x.pt + (P.aggro - 0.25) * x.jump * 0.16 + x.own * 0.025
      + (bluffing ? (2 - x.own) * 0.05 : 0) + Math.random() * 0.1;
    const pool = cands.filter(x => x.pt >= threshold);
    if (pool.length) {
      pool.sort((a, b) => score(b) - score(a));
      const best = pool[0];
      if (s.bid && best.pt < (1 - curTrue) - 0.15) return { type: 'liar' };
      return { type: 'bid', qty: best.b.qty, face: best.b.face };
    }
    if (s.bid && curTrue < 0.5) return { type: 'liar' };
    cands.sort((a, b) => b.pt - a.pt);
    return { type: 'bid', qty: cands[0].b.qty, face: cands[0].b.face };
  }

  return { PERSONAS, randomPersona, decide, odds };
})();
