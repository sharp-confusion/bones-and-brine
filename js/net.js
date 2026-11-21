'use strict';
/* Bones & Brine — peer-to-peer online play over WebRTC (PeerJS).
   The host's browser runs the game; other players connect to it with a room code.
   Works from any static web host — no game server needed. */
const Net = (() => {
  const PREFIX = 'bonesbrine-liarsdice-v2-';
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  // Phones pause pages that are in the background (sharing the room code over WhatsApp, a quick
  // message, the screen dimming), so a player can go quiet for a while and still be there.
  const PING_MS = 4000, TIMEOUT_MS = 30000;
  let peer = null, hostConn = null, beat = null, lastHost = 0, lastTick = 0;
  const conns = new Map();
  const lastSeen = new Map();
  const h = {};

  // Heartbeat: WebRTC often never reports a closed tab, so we notice silence instead.
  function lose(id) {
    if (!conns.has(id)) return;
    const c = conns.get(id); conns.delete(id); lastSeen.delete(id);
    try { c.close(); } catch (_) {}
    h.disconnect && h.disconnect(id);
  }
  // If our own page was asleep, every timer is late and everyone looks silent. That says nothing
  // about the other players, so start counting again instead of dropping them.
  function wokeUp(now) {
    const slept = lastTick && now - lastTick > PING_MS * 2.5;
    lastTick = now;
    if (slept) { lastSeen.forEach((_, id) => lastSeen.set(id, now)); lastHost = now; }
    return slept;
  }
  function startHostBeat() {
    clearInterval(beat);
    lastTick = Date.now();
    beat = setInterval(() => {
      const now = Date.now();
      wokeUp(now);
      conns.forEach((c, id) => {
        if (now - (lastSeen.get(id) || now) > TIMEOUT_MS) lose(id);
        else if (c.open) c.send({ t: 'ping' });
      });
    }, PING_MS);
  }
  function startClientBeat() {
    clearInterval(beat);
    lastHost = lastTick = Date.now();
    beat = setInterval(() => {
      if (!hostConn) return;
      const now = Date.now();
      wokeUp(now);
      if (now - lastHost > TIMEOUT_MS) { hostConn = null; clearInterval(beat); h.hostLost && h.hostLost(); }
      else if (hostConn.open) hostConn.send({ t: 'pong' });
    }, PING_MS);
  }
  window.addEventListener('pagehide', e => { if (e.persisted) return; try { if (hostConn && hostConn.open) hostConn.send({ t: 'bye' }); } catch (_) {} });
  // back from the background: say hello straight away and get the signalling line back
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const now = Date.now();
    wokeUp(now);
    try { if (hostConn && hostConn.open) hostConn.send({ t: 'pong' }); } catch (_) {}
    conns.forEach(c => { try { if (c.open) c.send({ t: 'ping' }); } catch (_) {} });
    if (peer && peer.disconnected && !peer.destroyed) { try { peer.reconnect(); } catch (_) {} }
  });

  // --- how browsers find a path to each other ---------------------------------------------------
  // STUN lets most players connect directly. Behind strict NATs (schools, offices, some mobile
  // carriers) a direct path is impossible, so a TURN relay passes the game traffic along instead.
  const STUN = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ];
  let ice = STUN.slice(), iceAt = 0, iceLoading = null;
  function loadRelay() {
    const cfg = window.BNB_CONFIG || {};
    if (!cfg.turnApp || !cfg.turnKey || typeof fetch !== 'function') return Promise.resolve(ice);
    if (iceLoading) return iceLoading;
    if (Date.now() - iceAt < 30 * 60000 && ice.length > STUN.length) return Promise.resolve(ice);
    const url = `https://${encodeURIComponent(cfg.turnApp)}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(cfg.turnKey)}`;
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const t = setTimeout(() => ctrl && ctrl.abort(), 4000);           // never hold a game up waiting for the relay
    iceLoading = fetch(url, ctrl ? { signal: ctrl.signal } : {}).then(r => r.ok ? r.json() : [])
      .then(list => { if (Array.isArray(list) && list.length) { ice = STUN.concat(list); iceAt = Date.now(); } return ice; })
      .catch(() => ice)
      .finally(() => { clearTimeout(t); iceLoading = null; });
    return iceLoading;
  }
  loadRelay();
  const peerOpts = () => ({ debug: 0, config: { iceServers: ice } });
  const hasRelay = () => ice.length > STUN.length;

  const on = (ev, fn) => { h[ev] = fn; };
  const available = () => typeof window.Peer === 'function';
  const makeCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

  function describe(e) {
    switch (e && e.type) {
      case 'peer-unavailable': return 'No ship found with that code. Check it and try again.';
      case 'network': case 'server-error': case 'socket-error': case 'socket-closed':
        return 'Could not reach the harbour master (matchmaking server). Check yer connection.';
      case 'browser-incompatible': return 'This browser cannot play online. Try a recent Chrome, Firefox or Safari.';
      default: return 'Online error: ' + ((e && (e.message || e.type)) || 'unknown');
    }
  }

  // Start once the relay list is in (or after 2.5 s without it), unless the player backed out meanwhile.
  let session = 0;
  function afterRelay(fn) {
    const s = session; let done = false;
    const run = () => { if (done || s !== session) return; done = true; fn(); };
    setTimeout(run, 2500);
    loadRelay().then(run, run);
  }

  function host(onReady, onError, tries = 0) {
    close();
    if (!available()) return onError({ message: 'Online library failed to load (are ye offline?)' });
    afterRelay(() => startHost(onReady, onError, tries));
  }
  function startHost(onReady, onError, tries) {
    const code = makeCode();
    const p = new Peer(PREFIX + code, peerOpts());
    peer = p;
    let ready = false, retry = null, retries = 0;
    const giveUp = setTimeout(() => { if (!ready && peer === p) onError({ type: 'network' }); }, 20000);
    // Losing the matchmaking server after the room is up does NOT end the game: players already
    // aboard talk to us directly. Keep trying to get back on it so new players can still find us.
    const redial = () => {
      if (peer !== p || p.destroyed || !p.disconnected || retry) return;
      retry = setTimeout(() => { retry = null; if (peer !== p || p.destroyed || !p.disconnected) return; retries++; try { p.reconnect(); } catch (_) {} redial(); },
        Math.min(15000, 1000 * Math.pow(2, Math.min(retries, 4))));
    };
    p.on('open', () => { retries = 0; if (ready) return; ready = true; clearTimeout(giveUp); startHostBeat(); onReady(code); });
    p.on('connection', conn => {
      conn.on('open', () => { conns.set(conn.peer, conn); lastSeen.set(conn.peer, Date.now()); h.connect && h.connect(conn.peer); });
      conn.on('data', d => {
        if (conns.get(conn.peer) !== conn) return;
        lastSeen.set(conn.peer, Date.now());
        if (d && (d.t === 'ping' || d.t === 'pong')) return;
        if (d && d.t === 'bye') return lose(conn.peer);
        h.data && h.data(conn.peer, d);
      });
      conn.on('close', () => { if (conns.get(conn.peer) === conn) lose(conn.peer); });
      conn.on('error', () => {});
    });
    p.on('error', e => {
      if (peer !== p) return;
      if (e.type === 'peer-unavailable') return; // a guest vanished; harmless for host
      if (ready) { redial(); return; }           // room already open: never close it over a server hiccup
      clearTimeout(giveUp);
      if (e.type === 'unavailable-id' && tries < 4) return host(onReady, onError, tries + 1);
      onError(e);
    });
    p.on('disconnected', () => { if (peer === p && ready) { try { p.reconnect(); } catch (_) {} redial(); } });
    p.on('close', () => { clearTimeout(retry); clearTimeout(giveUp); });
  }

  function join(code, onOpen, onError, onRetry) {
    close();
    if (!available()) return onError({ message: 'Online library failed to load (are ye offline?)' });
    // wait (briefly) for the relay list first: on mobile data the relay is often the only way through
    const go = () => {
      const p = new Peer(peerOpts());
      peer = p;
      let opened = false, failed = false, attempt = 0, timer = null;
      const fail = e => { if (opened || failed || peer !== p) return; failed = true; clearTimeout(timer); onError(e); };
      // The host may be a phone that just stepped away (to send ye the code!) and is still getting
      // back onto the matchmaking server, so "no ship found" is retried a few times before we give up.
      const MAX_TRIES = 4;
      // whatever happens, give a clear answer within 45 s instead of rowing forever
      const giveUp = setTimeout(() => fail({ type: p.open ? 'peer-unavailable' : 'network' }), 45000);
      p.on('close', () => clearTimeout(giveUp));
      const dial = () => {
        if (opened || failed || peer !== p || p.destroyed) return;
        attempt++;
        const c = p.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        hostConn = c;
        clearTimeout(timer);
        timer = setTimeout(() => { if (opened || hostConn !== c) return; try { c.close(); } catch (_) {} again({ type: 'peer-unavailable' }); }, 12000);
        c.on('open', () => { if (hostConn !== c || opened) return; opened = true; clearTimeout(timer); clearTimeout(giveUp); startClientBeat(); onOpen(); });
        c.on('data', d => {
          if (hostConn !== c) return;
          lastHost = Date.now();
          if (d && d.t === 'ping') { c.send({ t: 'pong' }); return; }
          h.data && h.data('host', d);
        });
        c.on('close', () => { if (opened && hostConn === c) { hostConn = null; clearInterval(beat); h.hostLost && h.hostLost(); } });
      };
      const again = e => {
        if (opened || failed || peer !== p) return;
        if (attempt >= MAX_TRIES) return fail(e);
        if (onRetry) { try { onRetry(attempt + 1, MAX_TRIES); } catch (_) {} }
        clearTimeout(timer);
        timer = setTimeout(dial, 1500 * attempt);
      };
      p.on('open', () => { if (!opened && attempt === 0) dial(); });
      p.on('error', e => {
        if (peer !== p) return;
        // Once aboard, the game runs over the direct line to the host. Trouble with the matchmaking
        // server doesn't matter then; a real loss of the host is caught by the heartbeat.
        if (opened) return;
        if (e.type === 'peer-unavailable') return again(e);
        if (['network', 'server-error', 'socket-error', 'socket-closed', 'disconnected'].includes(e.type) && attempt < MAX_TRIES) {
          clearTimeout(timer); timer = setTimeout(() => { if (peer === p && p.disconnected && !p.destroyed) { try { p.reconnect(); } catch (_) {} } attempt++; again(e); }, 1500);
          return;
        }
        fail(e);
      });
      p.on('disconnected', () => { if (peer === p && !p.destroyed && !opened) { try { p.reconnect(); } catch (_) {} } });
    };
    afterRelay(go);
  }

  const send = msg => { if (hostConn && hostConn.open) hostConn.send(msg); };
  const sendTo = (id, msg) => { const c = conns.get(id); if (c && c.open) c.send(msg); };
  const broadcast = msg => conns.forEach(c => { if (c.open) c.send(msg); });
  function drop(id) { const c = conns.get(id); if (c) { conns.delete(id); lastSeen.delete(id); try { c.close(); } catch (_) {} } }
  function close() {
    const p = peer;
    session++;
    clearInterval(beat);
    if (hostConn && hostConn.open) { try { hostConn.send({ t: 'bye' }); } catch (_) {} }
    peer = null; hostConn = null; conns.clear(); lastSeen.clear();
    if (p) { try { p.destroy(); } catch (_) {} }
  }

  return { on, available, host, join, send, sendTo, broadcast, drop, close, describe, loadRelay, hasRelay };
})();
