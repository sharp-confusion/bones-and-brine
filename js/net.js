'use strict';
/* Bones & Brine — peer-to-peer online play over WebRTC (PeerJS).
   The host's browser runs the game; other players connect to it with a room code.
   Works from any static web host — no game server needed. */
const Net = (() => {
  const PREFIX = 'bonesbrine-liarsdice-v2-';
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const PING_MS = 4000, TIMEOUT_MS = 15000;
  let peer = null, hostConn = null, beat = null, lastHost = 0;
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
  function startHostBeat() {
    clearInterval(beat);
    beat = setInterval(() => {
      const now = Date.now();
      conns.forEach((c, id) => {
        if (now - (lastSeen.get(id) || now) > TIMEOUT_MS) lose(id);
        else if (c.open) c.send({ t: 'ping' });
      });
    }, PING_MS);
  }
  function startClientBeat() {
    clearInterval(beat);
    lastHost = Date.now();
    beat = setInterval(() => {
      if (!hostConn) return;
      if (Date.now() - lastHost > TIMEOUT_MS) { hostConn = null; clearInterval(beat); h.hostLost && h.hostLost(); }
      else if (hostConn.open) hostConn.send({ t: 'pong' });
    }, PING_MS);
  }
  window.addEventListener('pagehide', () => { try { if (hostConn && hostConn.open) hostConn.send({ t: 'bye' }); } catch (_) {} });

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

  function host(onReady, onError, tries = 0) {
    close();
    if (!available()) return onError({ message: 'Online library failed to load (are ye offline?)' });
    const code = makeCode();
    const p = new Peer(PREFIX + code, { debug: 0 });
    peer = p;
    p.on('open', () => { startHostBeat(); onReady(code); });
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
      if (e.type === 'unavailable-id' && tries < 4) return host(onReady, onError, tries + 1);
      if (e.type === 'peer-unavailable') return; // a guest vanished; harmless for host
      onError(e);
    });
    p.on('disconnected', () => { if (peer === p) { try { p.reconnect(); } catch (_) {} } });
  }

  function join(code, onOpen, onError) {
    close();
    if (!available()) return onError({ message: 'Online library failed to load (are ye offline?)' });
    const p = new Peer({ debug: 0 });
    peer = p;
    let opened = false;
    const timer = setTimeout(() => { if (!opened && peer === p) onError({ type: 'peer-unavailable' }); }, 15000);
    p.on('open', () => {
      const c = p.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      hostConn = c;
      c.on('open', () => { opened = true; clearTimeout(timer); startClientBeat(); onOpen(); });
      c.on('data', d => {
        if (hostConn !== c) return;
        lastHost = Date.now();
        if (d && d.t === 'ping') { c.send({ t: 'pong' }); return; }
        h.data && h.data('host', d);
      });
      c.on('close', () => { if (opened && hostConn === c) { hostConn = null; h.hostLost && h.hostLost(); } });
    });
    p.on('error', e => { if (peer !== p) return; clearTimeout(timer); if (!opened) onError(e); else if (e.type !== 'peer-unavailable') { h.hostLost && h.hostLost(); } });
  }

  const send = msg => { if (hostConn && hostConn.open) hostConn.send(msg); };
  const sendTo = (id, msg) => { const c = conns.get(id); if (c && c.open) c.send(msg); };
  const broadcast = msg => conns.forEach(c => { if (c.open) c.send(msg); });
  function drop(id) { const c = conns.get(id); if (c) { conns.delete(id); lastSeen.delete(id); try { c.close(); } catch (_) {} } }
  function close() {
    const p = peer;
    clearInterval(beat);
    if (hostConn && hostConn.open) { try { hostConn.send({ t: 'bye' }); } catch (_) {} }
    peer = null; hostConn = null; conns.clear(); lastSeen.clear();
    if (p) { try { p.destroy(); } catch (_) {} }
  }

  return { on, available, host, join, send, sendTo, broadcast, drop, close, describe };
})();
