'use strict';
/* Bones & Brine — accounts (Supabase): sign in with a username + password, cloud saves, admin powers.
   Security lives on the server (supabase/setup.sql): players can only change their own coins, goods and
   look; admin status and bans can only be changed by an admin or in the Supabase dashboard. */
const Auth = (() => {
  const cfg = window.BNB_CONFIG || {};
  const enabled = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase && window.supabase.createClient);
  const sb = enabled ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'bnb.auth' }
  }) : null;
  const USER_RE = /^[a-z0-9_]{3,16}$/;
  const toEmail = u => `${u.toLowerCase()}@${cfg.loginDomain || 'players.bonesandbrine.example'}`;
  let me = null;           // { id, username, coins, inv, data, is_admin, banned }
  let saveTimer = null, pending = {};

  const cleanUser = u => String(u || '').trim().toLowerCase();
  function friendly(err) {
    const m = String((err && (err.message || err.error_description)) || err || '');
    if (/invalid login/i.test(m)) return 'Wrong username or password.';
    if (/already registered|already exists|duplicate|unique/i.test(m)) return 'That username is taken — try another.';
    if (/database error saving new user/i.test(m)) return 'That username is taken — try another.';
    if (/password/i.test(m) && /6/.test(m)) return 'Password must be at least 6 characters.';
    if (/rate limit/i.test(m)) return 'Too many tries — wait a minute and try again.';
    if (/email not confirmed/i.test(m)) return 'Accounts need "Confirm email" switched off in Supabase (see README).';
    if (/fetch|network/i.test(m)) return 'Could not reach the account server. Check yer connection.';
    return m || 'Something went wrong.';
  }

  async function loadMe() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { me = null; return null; }
    const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).single();
    if (error) throw error;
    me = data;
    return me;
  }

  /** Restore a saved session on page load. Returns the profile or null. */
  async function restore() {
    if (!enabled) return null;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    try { return await loadMe(); } catch (_) { return null; }
  }

  async function signIn(username, password) {
    if (!enabled) throw new Error('Accounts are not set up yet.');
    const u = cleanUser(username);
    if (!USER_RE.test(u)) throw new Error('Usernames are 3–16 letters, numbers or _.');
    const { error } = await sb.auth.signInWithPassword({ email: toEmail(u), password });
    if (error) throw new Error(friendly(error));
    const p = await loadMe();
    if (p && p.banned) { await sb.auth.signOut(); me = null; throw new Error('This account has been banned.'); }
    return p;
  }

  async function signUp(username, password, start) {
    if (!enabled) throw new Error('Accounts are not set up yet.');
    const u = cleanUser(username);
    if (!USER_RE.test(u)) throw new Error('Usernames are 3–16 letters, numbers or _.');
    if (String(password).length < 6) throw new Error('Password must be at least 6 characters.');
    const { data, error } = await sb.auth.signUp({ email: toEmail(u), password, options: { data: { username: u } } });
    if (error) throw new Error(friendly(error));
    if (!data.session) throw new Error('Account made, but "Confirm email" is switched on in Supabase — switch it off (see README) and sign in.');
    await loadMe();
    if (start) await save(start, true);    // bring the guest pirate, purse and goods along
    return me;
  }

  async function signOut() {
    clearTimeout(saveTimer); await flush();
    if (sb) await sb.auth.signOut();
    me = null;
  }

  /** Save coins / inv / data to the cloud (debounced). */
  function save(patch, now) {
    if (!enabled || !me) return Promise.resolve();
    Object.assign(pending, patch);
    clearTimeout(saveTimer);
    if (now) return flush();
    saveTimer = setTimeout(flush, 900);
    return Promise.resolve();
  }
  async function flush() {
    if (!me || !Object.keys(pending).length) return;
    const patch = pending; pending = {};
    const { error } = await sb.from('profiles').update(patch).eq('id', me.id);
    if (error) console.warn('cloud save failed', error);
    else Object.assign(me, patch);
  }
  window.addEventListener('pagehide', () => { if (Object.keys(pending).length) flush(); });

  async function token() {
    if (!enabled) return null;
    const { data: { session } } = await sb.auth.getSession();
    return session ? session.access_token : null;
  }

  /** Host side: check a joining player's sign-in token with the server and get their real profile. */
  async function verify(accessToken) {
    if (!enabled || !accessToken) return null;
    const { data, error } = await sb.auth.getUser(accessToken);
    if (error || !data || !data.user) return null;
    const { data: prof } = await sb.from('profiles').select('id, username, is_admin, banned').eq('id', data.user.id).maybeSingle();
    if (prof) return prof;
    // a guest host can't read profiles directly; ask the server about this one verified id instead
    const { data: rows } = await sb.rpc('account_check', { p_id: data.user.id });
    return (Array.isArray(rows) ? rows[0] : rows) || null;
  }

  async function rpc(fn, args) {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw new Error(friendly(error));
    return data;
  }
  const admin = {
    lookup: u => rpc('admin_lookup', { p_username: cleanUser(u) }).then(r => (Array.isArray(r) ? r[0] : r) || null),
    addCoins: (u, d) => rpc('admin_add_coins', { p_username: cleanUser(u), p_delta: d | 0 }),
    giveItem: (u, item, q) => rpc('admin_give_item', { p_username: cleanUser(u), p_item: item, p_qty: q | 0 }),
    setBan: (u, b) => rpc('admin_set_ban', { p_username: cleanUser(u), p_banned: !!b }),
    reports: (status = 'open') => rpc('admin_reports', { p_status: status }),
    reportCount: () => rpc('admin_report_count', {}),
    resolve: (id, status) => rpc('admin_resolve_report', { p_id: id, p_status: status }),
    chatRecord: u => rpc('admin_chat_record', { p_username: cleanUser(u) }),
    clearStrikes: u => rpc('admin_clear_strikes', { p_username: cleanUser(u) }),
    notify: (u, cmd, payload) => rpc('admin_notify', { p_username: cleanUser(u), p_cmd: cmd, p_payload: payload || {} })
  };
  /** Collect (and clear) messages the admin left for me. */
  const takeMessages = () => (enabled && me) ? rpc('take_admin_messages', {}).then(r => r || []) : Promise.resolve([]);

  // --- chat moderation & reports (all checked on the server) ---
  /** Tell the server my message was censored; returns { strikes, muted_until }. */
  const recordStrike = (original, censored) => rpc('record_chat_strike', { p_original: String(original).slice(0, 300), p_censored: String(censored).slice(0, 300) });
  /** Timeout status for a player (default: me). */
  const chatStatus = userId => rpc('chat_status', { p_user: userId || null });
  const submitReport = (reported, reason, details, evidence) =>
    rpc('submit_report', { p_reported: String(reported).slice(0, 40), p_reason: reason, p_details: String(details || '').slice(0, 600), p_evidence: evidence || [] });

  // --- daily chest & leaderboard (supabase/03_daily_and_leaderboard.sql) ---
  /** Has today's (UTC) chest not been opened yet? */
  const dailyReady = () => !!me && me.last_daily !== new Date().toISOString().slice(0, 10);
  async function claimDaily() {
    clearTimeout(saveTimer); await flush();         // our own pending coin save must land first
    const r = await rpc('claim_daily', {});
    if (me && r) { me.coins = r.coins; me.daily_streak = r.streak; me.last_daily = new Date().toISOString().slice(0, 10); }
    return r;
  }
  async function recordDiceWon() {
    if (!enabled || !me) return null;
    try { const r = await rpc('record_dice_won', {}); if (r && me) Object.assign(me, r); return r; } catch (e) { console.warn('dice stat', e); return null; }
  }
  const leaderboard = period => rpc('leaderboard', { p_period: period === 'week' ? 'week' : 'all' });

  return {
    enabled, restore, signIn, signUp, signOut, save, flush, token, verify, admin, recordStrike, chatStatus, submitReport,
    dailyReady, claimDaily, recordDiceWon, leaderboard, takeMessages,
    get client() { return sb; },
    get me() { return me; },
    get isAdmin() { return !!(me && me.is_admin); },
    USER_RE
  };
})();
