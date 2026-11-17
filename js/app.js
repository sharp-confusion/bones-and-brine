'use strict';
/* Bones & Brine — UI, screens and game controller. */
(() => {
  const MAX_SEATS = 6, MAX_HUMANS = 5, REVEAL_MS = 12000, TURN_MS = 60000;
  // How long bots "think" (ms): base range per pace setting, plus extra for hard decisions late in a round
  const PACE = {
    relaxed: { label: 'Relaxed', think: [2800, 5200], autoReveal: false },
    normal:  { label: 'Normal',  think: [1600, 3200], autoReveal: false },
    quick:   { label: 'Quick',   think: [800, 1600],  autoReveal: true }
  };
  const FACE_GLYPH = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  // Tavern shop: prices in doubloons, earned 1 per die you make someone lose.
  const SHOP = [
    { id: 'drink',  name: 'Mug of Grog',     price: 1, qty: 1, prop: 'drink',     icon: 'drink',  emoji: '🍺', verb: 'downs a mug of grog', verbYou: 'down a mug of grog', ms: 90000 },
    { id: 'smokes', name: 'Pack of Smokes',  price: 2, qty: 5, prop: 'cigarette', icon: 'smokes', emoji: '🚬', verb: 'lights up a smoke', verbYou: 'light up a smoke', ms: 150000 },
    { id: 'cigar',  name: 'Pack of Cigars',  price: 3, qty: 3, prop: 'cigar',     icon: 'cigar',  emoji: '🚬', verb: 'puffs on a fat cigar', verbYou: 'puff on a fat cigar', ms: 240000 },
    { id: 'steak',  name: 'Steak',           price: 1, qty: 1, prop: 'steak',     icon: 'steak',  emoji: '🥩', verb: 'tucks into a steak', verbYou: 'tuck into a steak', ms: 100000 },
    { id: 'rum',    name: 'Shot of Rum',     price: 1, qty: 1, prop: 'rum',       icon: 'rum',    emoji: '🥃', verb: 'knocks back a shot of rum', verbYou: 'knock back a shot of rum', ms: 40000 },
    // 👑 admin only: never runs out, not sold in the Tavern
    { id: 'pipe',   name: "Captain's Pipe",  price: 0, qty: 0, prop: 'pipe',      icon: 'pipe',   emoji: '💨', verb: 'lights the captain\'s pipe', verbYou: 'light the captain\'s pipe', ms: 300000, adminOnly: true }
  ];
  const shopItem = id => SHOP.find(x => x.id === id);
  const TAUNTS = ['Arrr!', "Ye be lyin'!", 'Shiver me timbers!', 'Hah! Easy plunder.', 'Walk the plank!', 'Yo ho ho!', 'Bold wager…', 'Fair winds, matey'];
  const PIRATE_NAMES = ['Salty Sue', 'One-Eyed Jack', 'Barnacle Bess', 'Rum-Belly Rory', 'Calico Kate', 'Mad Morgan', 'Gilded Greta',
    'Bilge Rat Bob', 'Stormy Stede', 'Peg-Leg Pip', 'Red Ruth', 'Cutlass Cal', 'Grog-Bottom Gus', 'Mermaid Mae', 'Scurvy Sam',
    'Dread Delilah', 'Ironhook Ivan', 'Lucky Lou', 'Briny Bart', 'Squall Sadie'];

  // ---------- utils ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  };
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const randomName = (exclude = []) => pick(PIRATE_NAMES.filter(n => !exclude.includes(n))) || 'Nameless Pirate';
  const cleanName = n => String(n || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 16) || 'Mystery Pirate';
  const pct = p => Math.round(p * 100) + '%';
  function toast(msg, ms = 2400) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.classList.add('out'), ms);
    setTimeout(() => t.remove(), ms + 450);
  }
  function vibrate(p) { if (document.body.classList.contains('mobile') && navigator.vibrate) { try { navigator.vibrate(p); } catch (_) {} } }
  // Recent activity, shown to the admin in the Desk's Online tab (kept in memory only, never stored).
  const ActLog = [];
  function logAct(text) {
    const last = ActLog[ActLog.length - 1];
    if (last && last.text === text && Date.now() - last.at < 3000) return;
    ActLog.push({ at: Date.now(), text: String(text).slice(0, 90) });
    if (ActLog.length > 12) ActLog.shift();
    try { liveTrack(); } catch (_) {}
  }

  // ---------- sound (synthesised, no files) ----------
  const Sfx = (() => {
    let ctx = null, on = store.get('bnb.sound', true);
    function ac() {
      if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return null; } }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function tone(f, d, type = 'sine', vol = 0.12, when = 0) {
      const c = on && ac(); if (!c) return;
      const o = c.createOscillator(), gn = c.createGain(), t = c.currentTime + when;
      o.type = type; o.frequency.value = f;
      gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(gn).connect(c.destination); o.start(t); o.stop(t + d + 0.03);
    }
    function rattle() {
      const c = on && ac(); if (!c) return;
      const len = Math.floor(c.sampleRate * 0.03);
      for (let i = 0; i < 11; i++) {
        const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
        for (let j = 0; j < len; j++) d[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / len, 3);
        const src = c.createBufferSource(), f = c.createBiquadFilter(), gn = c.createGain();
        src.buffer = buf; f.type = 'bandpass'; f.frequency.value = 1500 + Math.random() * 2500; f.Q.value = 3; gn.gain.value = 0.6;
        src.connect(f).connect(gn).connect(c.destination);
        src.start(c.currentTime + i * 0.05 + Math.random() * 0.03);
      }
    }
    return {
      rattle,
      click: () => tone(660, 0.05, 'triangle', 0.05),
      bid: () => { tone(520, 0.12, 'triangle', 0.1); tone(780, 0.1, 'triangle', 0.07, 0.08); },
      liar: () => { tone(190, 0.35, 'sawtooth', 0.09); tone(140, 0.45, 'sawtooth', 0.08, 0.12); },
      lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.22, 'square', 0.05, i * 0.13)),
      coin: () => { tone(988, 0.08, 'square', 0.05); tone(1319, 0.3, 'square', 0.05, 0.08); },
      win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.28, 'triangle', 0.1, i * 0.14)),
      turn: () => tone(880, 0.14, 'sine', 0.08),
      toggle() { on = !on; store.set('bnb.sound', on); if (on) ac(); return on; },
      get on() { return on; }
    };
  })();

  // ---------- device / controls ----------
  const Device = {
    touch: (() => {
      try {
        return matchMedia('(pointer: coarse)').matches
          || /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|Opera Mini/i.test(navigator.userAgent)
          || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
      } catch (_) { return false; }
    })(),
    mode: store.get('bnb.controls', 'auto')
  };
  function applyControlsMode() {
    const mobile = Device.mode === 'auto' ? Device.touch : Device.mode === 'mobile';
    document.body.classList.toggle('mobile', mobile);
    document.body.classList.toggle('desktop', !mobile);
    $('#controls-mode').value = Device.mode;
    $('#device-note').textContent = Device.mode === 'auto' ? (Device.touch ? 'Touch device detected — touch controls on' : 'Mouse & keyboard detected') : '';
    if (G.s) render();
  }

  // ---------- profile & kits ----------
  let profile = store.get('bnb.profile', null);
  if (!profile || typeof profile !== 'object') profile = { name: randomName(), avatar: Avatar.random(), kitId: 'bone' };
  if (!profile.avatar || !profile.avatar.base) profile.avatar = Avatar.random();   // looks from older versions
  profile.name = cleanName(profile.name); profile.avatar = Avatar.sanitize(profile.avatar);
  profile.coins = Math.max(0, Number(profile.coins) | 0);
  const STARTING_COINS = 5;
  if (!profile.starterPurse) {            // every new pirate (and existing ones, once) starts with 5 doubloons
    profile.coins = Math.max(profile.coins, STARTING_COINS);
    profile.starterPurse = true;
  }
  profile.inv = Object.fromEntries(SHOP.map(x => [x.id, Math.max(0, Number((profile.inv || {})[x.id]) | 0)]));
  let customKits = (store.get('bnb.kits', []) || []).map(Dice.sanitize).filter(Boolean).map(k => ({ ...k, custom: true }));
  const allKits = () => Dice.PRESETS.concat(customKits);
  const kitById = id => allKits().find(k => k.id === id) || Dice.PRESETS[0];
  /** Everything about yer pirate that is saved to a signed-in account in the cloud. */
  const cloudData = () => ({ coins: profile.coins, inv: profile.inv, data: { avatar: profile.avatar, kitId: profile.kitId, kits: customKits } });
  function saveProfile() {
    store.set('bnb.profile', profile); renderMenuProfile();
    if (Auth.me) Auth.save(cloudData());
  }
  const saveKits = () => { store.set('bnb.kits', customKits); if (Auth.me) Auth.save(cloudData()); };

  // ---------- screens ----------
  let current = 'menu';
  const onShow = {};
  let lockerViewer = null;
  function go(name) {
    if (name !== 'locker' && lockerViewer) { lockerViewer.stop(); lockerViewer = null; }
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
    current = name;
    if (onShow[name]) onShow[name]();
    window.scrollTo(0, 0);
    try { logAct('→ ' + (WHERE[name] || name)); } catch (_) {}   // the admin's "who's online" shows where we are
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-go]');
    if (b) { Sfx.click(); go(b.dataset.go); }
  });

  // ---------- menu ----------
  function renderMenuProfile() {
    const k = kitById(profile.kitId);
    $('#menu-profile').innerHTML = `${Avatar.render(profile.avatar, 64)}<span><b>${esc(profile.name)}</b><small>${[6, 1].map(f => Dice.render(f, k, 18)).join('')} ${esc(k.name)}</small><small class="coins">🪙 ${profile.coins} doubloons · tap to edit</small></span>`;
  }
  onShow.menu = () => { renderMenuProfile(); renderDaily(); };
  $('#controls-mode').addEventListener('change', e => { Device.mode = e.target.value; store.set('bnb.controls', Device.mode); applyControlsMode(); });

  // ---------- captain's locker ----------
  function renderLockerPreview() {
    const box = $('#locker-avatar');
    if (window.Avatar3D && window.Avatar3D.ready) {
      if (!lockerViewer) lockerViewer = window.Avatar3D.viewer(box, () => profile.avatar);
      box.style.background = `radial-gradient(circle at 50% 38%, ${profile.avatar.bg}dd, ${profile.avatar.bg} 70%)`;
    } else box.innerHTML = Avatar.render(profile.avatar, 220);
  }
  function renderLocker() {
    renderLockerPreview();
    if (document.activeElement !== $('#locker-name')) $('#locker-name').value = profile.name;
    const locked = !!Auth.me;      // signed-in pirates are known by their username
    $('#locker-name').disabled = locked; $('#locker-randname').disabled = locked;
    $('#locker-name').title = locked ? 'Yer name is yer account username' : '';
    const k = kitById(profile.kitId);
    $('#locker-kit').innerHTML = [1, 3, 5].map(f => Dice.render(f, k, 34)).join('') + `<span>${esc(k.name)}</span>`;
    const a = profile.avatar;
    $('#locker-options').innerHTML = Object.entries(Avatar.OPTIONS).map(([key, opt]) => {
      const v = a[key];
      if (opt.type === 'list') {
        const vals = Avatar.choices(key, Auth.isAdmin);
        if (vals.length < 2) return '';            // e.g. the cup choice only exists for the admin
        const i = vals.indexOf(v);
        return `<div class="opt-row${Avatar.isAdminValue(key, v) ? ' admin-pick' : ''}"><span class="opt-label">${opt.label} <small>${i + 1}/${vals.length}</small></span><div class="stepper"><button data-k="${key}" data-d="-1" aria-label="Previous ${opt.label}">◀</button><span>${esc(opt.names[v] || v)}</span><button data-k="${key}" data-d="1" aria-label="Next ${opt.label}">▶</button></div></div>`;
      }
      if (opt.type === 'multi') {
        return `<div class="opt-row wide"><span class="opt-label">${opt.label}</span><div class="chips">${opt.values.map(c => `<button class="chip-btn ${a.cosmetics.includes(c) ? 'on' : ''}" data-cos="${c}">${esc(opt.names[c])}</button>`).join('')}</div></div>`;
      }
      const values = opt.type === 'skin' ? Avatar.skinsFor(a.base) : opt.values;
      return `<div class="opt-row"><span class="opt-label">${opt.label}</span><div class="swatches">${values.map(c => `<button class="sw ${v === c ? 'on' : ''}" style="background:${c}" data-k="${key}" data-c="${c}" aria-label="${opt.label} ${c}"></button>`).join('')}</div></div>`;
    }).join('');
  }
  onShow.locker = renderLocker;
  $('#locker-options').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.cos) {
      profile.avatar = Avatar.toggleCosmetic(profile.avatar, b.dataset.cos);
    } else {
      const k = b.dataset.k, opt = Avatar.OPTIONS[k]; if (!opt) return;
      if (b.dataset.d) {
        const vals = Avatar.choices(k, Auth.isAdmin);
        const i = vals.indexOf(profile.avatar[k]);
        profile.avatar[k] = vals[(i + Number(b.dataset.d) + vals.length) % vals.length];
        if (k === 'base') profile.avatar.skin = Avatar.skinsFor(profile.avatar.base)[1] || Avatar.skinsFor(profile.avatar.base)[0];
      } else profile.avatar[k] = b.dataset.c;
    }
    profile.avatar = Avatar.sanitize(profile.avatar);
    if (!Auth.isAdmin) profile.avatar = Avatar.stripAdmin(profile.avatar);
    Sfx.click(); saveProfile(); renderLocker();
  });
  $('#locker-name').addEventListener('input', e => { profile.name = cleanName(e.target.value); saveProfile(); });
  $('#locker-randname').addEventListener('click', () => { profile.name = randomName([profile.name]); saveProfile(); $('#locker-name').value = profile.name; });
  $('#locker-random').addEventListener('click', () => { profile.avatar = Avatar.random(); Sfx.click(); saveProfile(); renderLocker(); });

  // ---------- dice forge ----------
  let draft = null, draftSource = null;
  const KIT_FIELDS = ['name', 'face', 'face2', 'pip', 'edge', 'pipShape', 'wild', 'pattern', 'round'];
  const sameKit = (a, b) => !!a && !!b && KIT_FIELDS.every(f => a[f] === b[f]);
  const sourceKit = () => allKits().find(k => k.id === draftSource);
  function openInForge(kit) { draft = { ...Dice.sanitize(kit) }; draftSource = kit.id; fillForgeForm(); renderForge(true); }
  function fillForgeForm() {
    $('#f-name').value = draft.name;
    ['face', 'face2', 'pip', 'edge'].forEach(f => { $('#f-' + f).value = draft[f]; });
    $('#f-round').value = draft.round;
  }
  function chipRow(el, field, values, face) {
    el.innerHTML = values.map(v => `<button class="chip-btn ${draft[field] === v ? 'on' : ''}" data-field="${field}" data-v="${v}">${Dice.render(face, { ...draft, [field]: v }, 26)}${esc(Dice.LABELS[v] || v)}</button>`).join('');
  }
  function renderForge(roll) {
    if (!draft) openInForge(kitById(profile.kitId));
    const src = sourceKit();
    $('#kit-grid').innerHTML = allKits().map(k => `<button class="kit-card ${k.id === draftSource ? 'sel' : ''}" data-kit="${esc(k.id)}">${k.id === profile.kitId ? '<span class="badge">Equipped</span>' : ''}${k.custom ? '<span class="badge mine">Yours</span>' : ''}<span class="dd">${Dice.render(5, k, 34)}${Dice.render(1, k, 34)}</span>${esc(k.name)}</button>`).join('');
    $('#forge-preview').innerHTML = [1, 2, 3, 4, 5, 6].map((f, i) => `<span class="${roll ? 'roll' : ''}" style="animation-delay:${i * 60}ms">${Dice.render(f, draft, 68)}</span>`).join('');
    chipRow($('#f-pipShape'), 'pipShape', Dice.PIP_SHAPES, 5);
    chipRow($('#f-wild'), 'wild', Dice.WILD_SYMBOLS, 1);
    chipRow($('#f-pattern'), 'pattern', Dice.PATTERNS, 3);
    const dirty = !sameKit(draft, src);
    const isCustom = !!(src && src.custom);
    $('#f-update').disabled = !isCustom || !dirty;
    $('#f-delete').disabled = !isCustom;
    $('#f-equip').textContent = dirty ? 'Save & Equip' : (draftSource === profile.kitId ? 'Equipped ✓' : 'Equip');
    $('#f-equip').disabled = !dirty && draftSource === profile.kitId;
    $('#forge-hint').textContent = isCustom ? 'This be yer own design.' : (src ? 'A ready-made kit — tweak it and save as yer own.' : 'A fresh design — save it to keep it.');
  }
  onShow.forge = () => renderForge(true);
  $('#kit-grid').addEventListener('click', e => { const b = e.target.closest('[data-kit]'); if (b) { Sfx.rattle(); openInForge(kitById(b.dataset.kit)); } });
  $('.forge-form').addEventListener('click', e => {
    const b = e.target.closest('[data-field]'); if (!b) return;
    const f = b.dataset.field; draft[f] = b.dataset.v; Sfx.click(); renderForge(false);
  });
  $('.forge-form').addEventListener('input', e => {
    const id = e.target.id; if (!id || !id.startsWith('f-')) return;
    const f = id.slice(2);
    draft[f] = f === 'round' ? Number(e.target.value) : f === 'name' ? e.target.value.slice(0, 20) : e.target.value;
    renderForge(false);
  });
  function saveNewKit() {
    const k = { ...Dice.sanitize(draft), id: 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e4), custom: true };
    if (!k.name.trim()) k.name = 'My Dice';
    customKits.push(k); saveKits(); draftSource = k.id; draft = { ...k };
    return k;
  }
  $('#f-save').addEventListener('click', () => { saveNewKit(); toast('Kit saved to yer chest'); fillForgeForm(); renderForge(false); });
  $('#f-update').addEventListener('click', () => {
    const i = customKits.findIndex(k => k.id === draftSource); if (i < 0) return;
    customKits[i] = { ...Dice.sanitize(draft), id: draftSource, custom: true }; saveKits(); toast('Changes saved'); renderForge(false); renderMenuProfile();
  });
  $('#f-delete').addEventListener('click', () => {
    const i = customKits.findIndex(k => k.id === draftSource); if (i < 0) return;
    if (!confirm(`Scrap "${customKits[i].name}" for good?`)) return;
    customKits.splice(i, 1); saveKits();
    if (profile.kitId === draftSource) { profile.kitId = 'bone'; saveProfile(); }
    openInForge(kitById(profile.kitId));
  });
  $('#f-equip').addEventListener('click', () => {
    const src = sourceKit();
    if (!sameKit(draft, src)) {
      if (src && src.custom) { const i = customKits.findIndex(k => k.id === draftSource); customKits[i] = { ...Dice.sanitize(draft), id: draftSource, custom: true }; saveKits(); }
      else saveNewKit();
    }
    profile.kitId = draftSource; saveProfile(); Sfx.coin(); toast('Dice equipped!'); renderForge(false);
  });
  $('#forge-new').addEventListener('click', () => {
    draft = { name: 'My Dice', face: '#ffffff', face2: '#d9d9d9', pip: '#222222', edge: '#555555', pipShape: 'dot', wild: 'pip', pattern: 'none', round: 18 };
    draftSource = null; fillForgeForm(); renderForge(true);
  });

  // ---------- tavern shop ----------
  function itemIcon(item, size) {
    if (window.Avatar3D && window.Avatar3D.ready) {
      try { return `<img class="item-icon" src="${window.Avatar3D.prop(item.icon)}" width="${size}" height="${size}" alt="">`; } catch (_) {}
    }
    return `<span class="item-emoji" style="font-size:${Math.round(size * 0.6)}px">${item.emoji}</span>`;
  }
  function renderShop() {
    $('#shop-coins').textContent = profile.coins;
    $('#shop-grid').innerHTML = SHOP.filter(it => !it.adminOnly).map(it => `
      <div class="shop-card">
        ${itemIcon(it, 96)}
        <b>${esc(it.name)}</b>
        <small>${it.qty > 1 ? `${it.qty} uses · ` : ''}ye own ${profile.inv[it.id]}</small>
        <button class="btn primary" data-buy="${it.id}" ${profile.coins < it.price ? 'disabled' : ''}>Buy · 🪙 ${it.price}</button>
      </div>`).join('') + (Auth.isAdmin ? SHOP.filter(it => it.adminOnly).map(it => `
      <div class="shop-card admin-item">
        ${itemIcon(it, 96)}
        <b>👑 ${esc(it.name)}</b>
        <small>Yours, admin · free · never runs out</small>
        <span class="owned-note">Light it at the table: 🍺 → Light</span>
      </div>`).join('') : '');
  }
  onShow.shop = renderShop;
  $('#shop-grid').addEventListener('click', e => {
    const b = e.target.closest('[data-buy]'); if (!b) return;
    const it = shopItem(b.dataset.buy);
    if (!it || profile.coins < it.price) { toast('Not enough doubloons — win some challenges first!'); return; }
    profile.coins -= it.price; profile.inv[it.id] += it.qty; logAct(`Bought ${it.name} for 🪙 ${it.price}`);
    saveProfile(); Sfx.coin(); vibrate(30);
    toast(`Bought ${it.name}! Use it at the table with the 🍺 button.`);
    renderShop();
  });

  // ---------- rule toggles ----------
  function rulesHTML(st, editable) {
    const dis = editable ? '' : 'disabled';
    return `<label class="toggle"><input type="checkbox" data-r="onesWild" ${st.onesWild ? 'checked' : ''} ${dis}> 1s are wild</label>
      <label class="toggle"><input type="checkbox" data-r="spotOn" ${st.spotOn ? 'checked' : ''} ${dis}> Allow “Spot On”</label>
      <label class="toggle">Starting dice <select data-r="startDice" ${dis}>${[3, 4, 5, 6].map(n => `<option value="${n}" ${n === st.startDice ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="toggle">Game pace <select data-r="pace" ${dis}>${Object.entries(PACE).map(([k, p]) => `<option value="${k}" ${k === (st.pace || 'relaxed') ? 'selected' : ''}>${p.label}</option>`).join('')}</select></label>`;
  }
  function bindRules(el, st, onChange) {
    el.onchange = e => {
      const r = e.target.dataset.r; if (!r) return;
      st[r] = e.target.type === 'checkbox' ? e.target.checked : r === 'pace' ? e.target.value : Number(e.target.value);
      store.set('bnb.rules', st); onChange && onChange();
    };
  }
  const savedRules = Object.assign({ onesWild: false, spotOn: false, startDice: 5, pace: 'relaxed' }, store.get('bnb.rules', {}));
  if ((savedRules.rulesV | 0) < 2) {      // new defaults: plain rules, wild 1s and Spot On are opt-in
    savedRules.onesWild = false; savedRules.spotOn = false; savedRules.rulesV = 2;
    store.set('bnb.rules', savedRules);
  }
  if (!PACE[savedRules.pace]) savedRules.pace = 'relaxed';

  // ---------- local (pass & play) setup ----------
  let localSeats = [];
  const localRules = { ...savedRules };
  const seatNames = list => list.map(x => x.name);
  const makeBot = list => ({ type: 'bot', name: randomName(seatNames(list)), avatar: Avatar.random(), kit: Dice.randomPreset(), persona: Bot.randomPersona() });
  // Quick Game crewmates: bots that pass for real players. Gamer-tag names, signed-in or guest, no 🤖 tag,
  // human think times and the odd chat line. Only the admin can see they're bots.
  const TAG_A = ['salty', 'kraken', 'rum', 'jolly', 'barnacle', 'dread', 'gold', 'sea', 'storm', 'black', 'grog', 'parrot', 'cutlass', 'anchor',
    'bilge', 'crimson', 'squid', 'tide', 'wreck', 'plank', 'skull', 'reef', 'gull', 'shady', 'lucky', 'sneaky', 'captain', 'old', 'mad', 'dice'];
  const TAG_B = ['dog', 'jack', 'beard', 'legs', 'queen', 'hook', 'runner', 'pete', 'maggie', 'fox', 'lord', 'lad', 'lass', 'eye', 'bones',
    'monkey', 'king', 'wolf', 'rat', 'sam', 'shark', 'bandit', 'goblin', 'liar', 'roller', 'sailor'];
  const TAG_PLAIN = ['luca', 'finn', 'emma', 'noah', 'paul', 'mia', 'leon', 'ben', 'tim', 'jonas', 'lena', 'max', 'nico', 'sophie', 'elias',
    'jake', 'ryan', 'liam', 'chloe', 'tyler', 'kevin', 'marco', 'nina', 'tom', 'alex', 'sara', 'jan', 'felix', 'olli', 'kai'];
  function gamerTag() {
    const r = Math.random(), num = () => pick([String(Math.floor(Math.random() * 99) + 1), String(2006 + Math.floor(Math.random() * 8)), String(Math.floor(Math.random() * 900) + 100), 'x', '']);
    let t;
    if (r < 0.4) t = pick(TAG_A) + pick(['', '_']) + pick(TAG_B) + num();
    else if (r < 0.75) t = pick(TAG_PLAIN) + pick(['_', '', '_']) + pick([num(), pick(TAG_B), pick(['hd', 'yt', 'ttv', 'gg', 'lol', 'xd', 'pro', 'dk'])]);
    else t = pick(['the', 'xx', 'im', 'its', 'not', 'mr', 'ms', 'captain']) + pick(['', '_']) + pick(TAG_B.concat(TAG_PLAIN)) + num();
    t = t.replace(/[^a-z0-9_]/g, '').slice(0, 16);
    return t.length >= 3 ? t : t + '_' + Math.floor(Math.random() * 90 + 10);
  }
  function makeCrewmate(list) {
    const taken = seatNames(list);
    const signedIn = Math.random() < 0.72;
    let name;
    do { name = signedIn ? gamerTag() : randomName(taken); } while (taken.includes(name));
    const persona = pick(['balanced', 'balanced', 'cautious', 'reckless', 'sly'].filter(k => Bot.PERSONAS[k]).concat(Bot.randomPersona()));
    return { id: 'p-' + Math.random().toString(36).slice(2, 10), name, avatar: Avatar.stripAdmin(Avatar.random()), kit: Dice.randomPreset(),
      account: signedIn ? name : null, bot: { persona, disguise: true, chatty: signedIn ? Math.random() : 0, speed: 0.75 + Math.random() * 0.6 } };
  }
  /** Does this seat show up as a bot to me? Disguised crewmates only look like bots to the admin. */
  const looksBot = p => !!(p && p.bot && !(p.bot.disguise && !Auth.isAdmin));
  const makeHuman = list => ({ type: 'human', name: randomName(seatNames(list)), avatar: Avatar.random(), kit: { ...Dice.PRESETS[(list.length + 2) % Dice.PRESETS.length] } });
  function personaSelect(val, attr) {
    return `<select ${attr} aria-label="Bot style">${Object.entries(Bot.PERSONAS).map(([k, p]) => `<option value="${k}" ${k === val ? 'selected' : ''}>${p.label}</option>`).join('')}</select>`;
  }
  function kitSelect(kit, attr) {
    return `<select ${attr} aria-label="Dice kit">${allKits().map(k => `<option value="${esc(k.id)}" ${k.id === kit.id ? 'selected' : ''}>${esc(k.name)}</option>`).join('')}</select>`;
  }
  function renderLocal() {
    localSeats[0] = { type: 'human', name: profile.name, avatar: profile.avatar, kit: kitById(profile.kitId), me: true };
    $('#seat-list').innerHTML = localSeats.map((x, i) => `
      <div class="seat-row">
        ${Avatar.render(x.avatar, 48)}
        <div class="sr-main">
          ${x.me ? `<span class="sr-name">${esc(x.name)}</span><span class="tag you">You · edit in Locker</span>`
            : x.type === 'human' ? `<input data-name="${i}" value="${esc(x.name)}" maxlength="16" aria-label="Pirate name"><span class="tag">Pirate</span>`
            : `<span class="sr-name">🤖 ${esc(x.name)}</span>${personaSelect(x.persona, `data-persona="${i}"`)}`}
          ${x.me ? '' : kitSelect(x.kit, `data-kit="${i}"`)}
        </div>
        <span class="sr-btns">${Dice.render(6, x.kit, 32)}
          ${x.me ? '' : `<button class="x-btn" data-reroll="${i}" title="New look" aria-label="New look">🎲</button><button class="x-btn" data-remove="${i}" title="Remove" aria-label="Remove">✕</button>`}
        </span>
      </div>`).join('');
    const humans = localSeats.filter(x => x.type === 'human').length;
    $('#add-human').disabled = humans >= MAX_HUMANS || localSeats.length >= MAX_SEATS;
    $('#add-bot').disabled = localSeats.length >= MAX_SEATS;
    $('#local-start').disabled = localSeats.length < 2;
    $('#local-start').textContent = localSeats.length < 2 ? 'Add at least one more seat' : 'Set Sail!';
    $('#local-rules').innerHTML = rulesHTML(localRules, true);
  }
  onShow.local = () => { if (!localSeats.length) { localSeats = [{}]; localSeats.push(makeBot(localSeats), makeBot(localSeats)); } renderLocal(); };
  bindRules($('#local-rules'), localRules);
  $('#add-human').addEventListener('click', () => { localSeats.push(makeHuman(localSeats)); Sfx.click(); renderLocal(); });
  $('#add-bot').addEventListener('click', () => { localSeats.push(makeBot(localSeats)); Sfx.click(); renderLocal(); });
  $('#seat-list').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.remove) { localSeats.splice(Number(b.dataset.remove), 1); renderLocal(); }
    if (b.dataset.reroll) { const x = localSeats[Number(b.dataset.reroll)]; x.avatar = Avatar.random(); if (x.type === 'bot') x.name = randomName(seatNames(localSeats)); renderLocal(); }
  });
  $('#seat-list').addEventListener('input', e => { const i = e.target.dataset.name; if (i) localSeats[Number(i)].name = cleanName(e.target.value); });
  $('#seat-list').addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.persona) localSeats[Number(t.dataset.persona)].persona = t.value;
    if (t.dataset.kit) { localSeats[Number(t.dataset.kit)].kit = { ...kitById(t.value) }; renderLocal(); }
  });
  $('#local-start').addEventListener('click', () => {
    const players = localSeats.map((x, i) => ({ id: 'L' + i, name: cleanName(x.name), avatar: x.avatar, kit: Dice.sanitize(x.kit), bot: x.type === 'bot' ? { persona: x.persona } : null }));
    startLocal(players, { ...localRules });
  });

  // ---------- online ----------
  const Online = { role: null, code: '', seats: [], rules: { ...savedRules }, started: false, watch: false, watchers: new Set() };
  const setStatus = m => { $('#online-status').textContent = m; };
  const myProfilePayload = () => ({ name: profile.name, avatar: profile.avatar, kit: kitById(profile.kitId) });
  // `account` = the server-verified username (null for guests); `admin` = verified admin
  // disguised Quick Game crewmates go out as ordinary players; only an admin's game is told they're bots
  const publicSeat = (x, admin) => ({ id: x.id, name: x.name, avatar: x.avatar, kit: x.kit, bot: x.bot && (!x.bot.disguise || admin) ? { persona: x.bot.persona } : null, account: x.account || null, admin: !!x.admin });
  function sanitizeSeat(x) {
    return { id: String(x && x.id || '').slice(0, 80), name: cleanName(x && x.name), avatar: Avatar.sanitize(x && x.avatar),
      kit: Dice.sanitize(x && x.kit) || Dice.PRESETS[0], bot: x && x.bot ? { persona: Bot.PERSONAS[x.bot.persona] ? x.bot.persona : 'balanced' } : null,
      account: x && typeof x.account === 'string' ? x.account.slice(0, 16) : null, admin: !!(x && x.admin) };
  }
  function sanitizeRules(r) {
    r = r || {};
    return { onesWild: !!r.onesWild, spotOn: !!r.spotOn, startDice: Math.max(3, Math.min(6, Number(r.startDice) || 5)), pace: PACE[r.pace] ? r.pace : 'relaxed' };
  }
  function leaveOnline() {
    Net.close(); Online.role = null; Online.seats = []; Online.started = false; Online.code = ''; Online.quick = null;
    Online.watch = false; Online.watchers = new Set(); G.watching = false; document.body.classList.remove('watching');
    if (typeof resetChat === 'function') resetChat();
  }

  $('#host-btn').addEventListener('click', () => {
    setStatus('Hoisting the flag…'); $('#host-btn').disabled = true;
    Net.host(code => {
      $('#host-btn').disabled = false; setStatus('');
      Online.role = 'host'; Online.code = code; Online.started = false;
      Online.rules = { ...savedRules };
      Online.seats = [{ id: 'host', ...myProfilePayload(), bot: null, account: Auth.me ? Auth.me.username : null, admin: Auth.isAdmin }];
      if (!Auth.isAdmin) Online.seats[0].avatar = Avatar.stripAdmin(Online.seats[0].avatar);
      go('lobby');
    }, e => { $('#host-btn').disabled = false; setStatus(Net.describe(e)); leaveOnline(); });
  });
  function doJoin() {
    const code = $('#join-code').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 4) { setStatus('Enter the room code from yer captain.'); return; }
    setStatus('Rowing out to the ship…'); $('#join-btn').disabled = true;
    Net.join(code, async () => {
      $('#join-btn').disabled = false; Online.role = 'client'; Online.code = code;
      // signed-in pirates prove who they are with their sign-in token; the host checks it with the server
      let token = null;
      try { token = await Auth.token(); } catch (_) {}
      Net.send({ t: 'join', profile: myProfilePayload(), token });
      setStatus('Boarding…');
    }, e => { $('#join-btn').disabled = false; setStatus(Net.describe(e)); leaveOnline(); });
  }
  $('#join-btn').addEventListener('click', doJoin);
  $('#join-code').addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });

  function hostLobbyBroadcast() {
    Online.seats.forEach(r => { if (!r.bot && r.id !== 'host') Net.sendTo(r.id, { t: 'lobby', code: Online.code, seats: Online.seats.map(x => publicSeat(x, r.admin)), rules: Online.rules }); });
    Online.watchers.forEach(id => Net.sendTo(id, { t: 'lobby', code: Online.code, seats: Online.seats.map(x => publicSeat(x, true)), rules: Online.rules }));
    if (current === 'lobby') renderLobby();
  }
  function renderLobby() {
    const host = Online.role === 'host';
    $('#lobby-code').textContent = Online.code || '-----';
    const myId = host ? 'host' : null;
    $('#lobby-seats').innerHTML = Online.seats.map((x, i) => {
      const isMe = host ? x.id === 'host' : (x.id === Online.myId);
      return `<div class="seat-row">${Avatar.render(x.avatar, 48)}
        <div class="sr-main"><span class="sr-name">${looksBot(x) ? '🤖 ' : ''}${esc(x.name)}</span>
          ${looksBot(x) ? (host ? personaSelect(x.bot.persona, `data-lpersona="${i}"`) : `<span class="tag bot">${esc(Bot.PERSONAS[x.bot.persona].label)}</span>`)
            : `<span class="tag ${isMe ? 'you' : ''}">${x.id === 'host' ? 'Captain' : 'Crew'}${isMe ? ' · You' : ''}${x.admin ? ' · 👑 Admin' : x.account ? ' · ✔ Account' : ' · Guest'}</span>`}
        </div>
        <span class="sr-btns">${Dice.render(6, x.kit, 32)}${!looksBot(x) && x.id !== (host ? 'host' : Online.myId) ? `<button class="x-btn" data-lrep="${esc(x.id)}" title="Report this pirate" aria-label="Report">⚑</button>` : ''}${(host ? x.id !== myId : (Auth.isAdmin && x.id !== 'host' && x.id !== Online.myId)) ? `<button class="x-btn" data-kick="${esc(x.id)}" title="${looksBot(x) ? 'Remove bot' : 'Make them walk the plank'}">✕</button>` : ''}</span>
      </div>`;
    }).join('') + (Online.seats.length < MAX_SEATS ? `<p class="hint">${MAX_SEATS - Online.seats.length} seat(s) free — share the code, or add bots.</p>` : '');
    $('#lobby-host-ctrls').classList.toggle('hidden', !host);
    $('#lobby-add-bot').disabled = Online.seats.length >= MAX_SEATS;
    $('#lobby-start').classList.toggle('hidden', !host);
    $('#lobby-start').disabled = Online.seats.length < 2;
    $('#lobby-wait').classList.toggle('hidden', host);
    renderChat();
    $('#lobby-rules').innerHTML = rulesHTML(Online.rules, host);
  }
  onShow.lobby = renderLobby;
  $('#lobby-rules').onchange = e => {
    const r = e.target.dataset.r; if (!r || Online.role !== 'host') return;
    Online.rules[r] = e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value);
    hostLobbyBroadcast();
  };
  $('#lobby-add-bot').addEventListener('click', () => {
    if (Online.seats.length >= MAX_SEATS) return;
    const b = makeBot(Online.seats);
    Online.seats.push({ id: 'bot-' + Math.random().toString(36).slice(2, 8), name: b.name, avatar: b.avatar, kit: b.kit, bot: { persona: b.persona } });
    Sfx.click(); hostLobbyBroadcast();
  });
  /** Host: remove a pirate from the lobby, or mid-game hand their seat to a bot. */
  function hostKick(id, reason = 'The captain made ye walk the plank.') {
    const i = Online.seats.findIndex(x => x.id === id); if (i < 0) return;
    const seat = Online.seats[i];
    if (seat.id === 'host') return;
    if (!seat.bot) { Net.sendTo(id, { t: 'error', msg: reason }); setTimeout(() => Net.drop(id), 300); }
    Online.seats.splice(i, 1);
    if (G.s && G.mode === 'host') {
      const p = G.s.players.find(q => q.id === id);
      if (p && !p.bot) { p.bot = { persona: 'balanced' }; toast(`${p.name} was thrown overboard — a bot takes the seat`); update(true); }
    } else hostLobbyBroadcast();
  }
  $('#lobby-seats').addEventListener('click', e => {
    const b = e.target.closest('[data-kick]'); if (!b) return;
    if (Online.role === 'host') hostKick(b.dataset.kick);
    else if (Auth.isAdmin) Net.send({ t: 'admin', cmd: 'kick', id: b.dataset.kick });
  });
  $('#lobby-seats').addEventListener('change', e => {
    const i = e.target.dataset.lpersona; if (i == null) return;
    Online.seats[Number(i)].bot.persona = e.target.value; hostLobbyBroadcast();
  });
  $('#lobby-leave').addEventListener('click', () => { leaveOnline(); go('online'); });
  $('#copy-link').addEventListener('click', async () => {
    const url = location.origin + location.pathname + '?room=' + Online.code;
    const text = `Join me for Bones & Brine liar's dice! Room code ${Online.code}`;
    try {
      if (navigator.share && document.body.classList.contains('mobile')) { await navigator.share({ title: 'Bones & Brine', text, url }); return; }
      await navigator.clipboard.writeText(url); toast('Invite link copied!');
    } catch (_) { prompt('Share this link with yer crew:', url); }
  });
  $('#lobby-start').addEventListener('click', () => {
    if (Online.role !== 'host' || Online.seats.length < 2) return;
    Online.started = true;
    startHost(Online.seats.map(x => ({ id: x.id, name: x.name, avatar: x.avatar, kit: x.kit, bot: x.bot })), { ...Online.rules });
  });

  Net.on('data', (from, msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (Online.role === 'host') hostHandle(from, msg); else if (Online.role === 'client') clientHandle(msg);
  });
  async function hostJoin(id, msg) {
    if (Online.started) { Net.sendTo(id, { t: 'error', msg: 'That ship has already set sail — wait for the next game.' }); setTimeout(() => Net.drop(id), 400); return; }
    const prof = sanitizeSeat({ ...(msg.profile || {}), id, account: null, admin: false });
    if (msg.token && Auth.enabled) {
      // never trust what a player claims: ask the account server who this really is
      let v = null;
      try { v = await Auth.verify(String(msg.token)); } catch (_) {}
      if (v && v.banned) { Net.sendTo(id, { t: 'error', msg: 'This account has been banned from Bones & Brine.' }); setTimeout(() => Net.drop(id), 400); return; }
      if (v) { prof.name = cleanName(v.username); prof.account = v.username; prof.admin = !!v.is_admin; prof.uid = v.id; }
    }
    if (!prof.admin) prof.avatar = Avatar.stripAdmin(prof.avatar);   // 👑 looks are for the verified admin only
    if (Online.started) return;
    const existing = Online.seats.find(x => x.id === id);
      if (existing) Object.assign(existing, prof);
      else {
        const humans = Online.seats.filter(x => !x.bot).length;
        if (Online.seats.length >= MAX_SEATS || humans >= MAX_HUMANS) { Net.sendTo(id, { t: 'error', msg: 'That ship is full, matey.' }); setTimeout(() => Net.drop(id), 400); return; }
        Online.seats.push({ ...prof, bot: null });
        toast(`${prof.name}${prof.admin ? ' 👑' : ''} climbed aboard`); Sfx.bid();
      }
      Net.sendTo(id, { t: 'welcome', id });
      hostLobbyBroadcast();
      if (Online.quick) quickCheckStart();
  }
  function hostHandle(id, msg) {
    if (msg.t === 'join') { hostJoin(id, msg); return; }
    if (msg.t === 'watch') { hostWatch(id, msg); return; }
    if (msg.t === 'chat') { hostChat(id, String(msg.text || '')); return; }
    if (msg.t === 'admin') {
      const seat = Online.seats.find(x => x.id === id);
      if (seat && seat.admin) adminCommand(id, msg);   // only server-verified admins
      return;
    }
    if (!G.s || G.mode !== 'host') return;
    const seat = G.s.players.findIndex(p => p.id === id && !p.bot);
    if (seat < 0) return;
    if (msg.t === 'act') {
      const a = msg.action || {};
      act(seat, { type: String(a.type), qty: Number(a.qty) | 0, face: Number(a.face) | 0 });
    } else if (msg.t === 'taunt') {
      sendTaunt(seat, Number(msg.i) | 0);
    } else if (msg.t === 'use' && shopItem(msg.id) && (!shopItem(msg.id).adminOnly || (Online.seats.find(x => x.id === id) || {}).admin)) {
      sendUse(seat, msg.id);
    }
  }
  /** Host: a verified admin asked to spectate. They get no seat, players aren't told, and they see every cup. */
  async function hostWatch(id, msg) {
    const prof = await Auth.verify(msg.token).catch(() => null);
    if (!prof || !prof.is_admin || prof.banned) { Net.sendTo(id, { t: 'error', msg: 'Only the admin can watch a table.' }); setTimeout(() => Net.drop(id), 300); return; }
    Online.watchers.add(id);
    Net.sendTo(id, { t: 'welcome', id });
    if (G.s && G.mode === 'host') broadcastState(); else hostLobbyBroadcast();
  }
  function clientHandle(msg) {
    switch (msg.t) {
      case 'welcome': Online.myId = String(msg.id); setStatus(''); break;
      case 'lobby':
        Online.code = String(msg.code || '').slice(0, 8);
        Online.seats = (Array.isArray(msg.seats) ? msg.seats : []).slice(0, MAX_SEATS).map(sanitizeSeat);
        Online.rules = sanitizeRules(msg.rules);
        if (G.s) endGame();
        if (current !== 'lobby') go('lobby'); else renderLobby();
        break;
      case 'state': if (msg.s) { G.xrayFeed = !!msg.xray; receive(msg.s, Number(msg.you) | 0, Number(msg.turnLeft) || 0); } break;
      case 'taunt': showTaunt(Number(msg.seat) | 0, Number(msg.i) | 0); break;
      case 'chat': addChat(msg); break;
      case 'use': if (shopItem(msg.id)) showUse(Number(msg.seat) | 0, msg.id); break;
      case 'error': toast(String(msg.msg || 'Something went wrong').slice(0, 120), 4000); endGame(); leaveOnline(); go('online'); break;
    }
  }
  Net.on('disconnect', id => {
    if (Online.role !== 'host') return;
    if (Online.watchers.delete(id)) return;                       // an admin stopped watching: nobody notices
    const i = Online.seats.findIndex(x => x.id === id);
    const name = i >= 0 ? Online.seats[i].name : 'A pirate';
    if (i >= 0) Online.seats.splice(i, 1);
    if (G.s && G.mode === 'host') {
      const p = G.s.players.find(q => q.id === id);
      if (p && !p.bot) { p.bot = { persona: 'balanced' }; toast(`${p.name} was lost at sea — a bot takes the helm`); update(true); }
    } else { toast(`${name} left the ship`); hostLobbyBroadcast(); }
  });
  Net.on('hostLost', () => {
    if (Online.role !== 'client') return;
    toast("The captain's ship has vanished — connection lost", 4000);
    endGame(); leaveOnline(); go('online');
  });
  window.addEventListener('beforeunload', e => { if (Online.role && G.s && G.s.phase !== 'over') { e.preventDefault(); e.returnValue = ''; } });

  // =====================================================================
  //  GAME CONTROLLER
  // =====================================================================
  const G = { mode: null, s: null, me: -1, viewer: -1, bottom: 0, revealedFor: -1, localHumans: [], players: null,
    sel: { qty: 1, face: 2 }, snap: null, schedKey: '', T: {}, nextAt: 0, turnDeadline: 0, taunts: {}, uses: {}, seatFrameKey: {}, rollAnim: false, revealKey: '', lastTaunt: 0 };

  const snapOf = s => s ? { phase: s.phase, round: s.round, hist: s.history.length, turn: s.turn, key: `${s.round}|${s.history.length}|${s.phase}` } : null;
  const clearTimers = () => { Object.values(G.T).forEach(clearTimeout); G.T = {}; };

  function resetGame(mode) {
    clearTimers();
    Object.assign(G, { mode, s: null, me: -1, viewer: -1, bottom: 0, revealedFor: -1, localHumans: [], snap: null, schedKey: '', nextAt: 0, turnDeadline: 0, taunts: {}, uses: {}, seatFrameKey: {}, revealKey: '', myDiceWon: 0, botChat: {} });
    $('#taunt-tray').classList.add('hidden');
  }
  function startLocal(players, rules) {
    resetGame('local');
    G.players = players; G.rules = rules;
    G.s = Engine.create(players, rules);
    G.localHumans = G.s.players.map((p, i) => p.bot ? -1 : i).filter(i => i >= 0);
    G.bottom = G.localHumans[0] ?? 0;
    go('game'); update();
  }
  function startHost(players, rules) {
    resetGame('host');
    G.s = Engine.create(players, rules);
    G.me = G.s.players.findIndex(p => p.id === 'host'); G.viewer = G.bottom = G.me;
    go('game'); update();
    crewSeats().forEach(x => crewMaybe(x, 'start', 0.3, 1500 + Math.random() * 4000));
  }
  function receive(view, you, turnLeft) {
    if (G.mode !== 'client') resetGame('client');
    const v = view;
    v.players = (v.players || []).map(p => ({ ...p, name: cleanName(p.name), avatar: Avatar.sanitize(p.avatar), kit: Dice.sanitize(p.kit) || Dice.PRESETS[0],
      dice: (p.dice || []).map(d => Math.max(1, Math.min(6, d | 0))), count: p.count | 0 }));
    const prev = G.snap;
    G.s = v; G.me = G.viewer = you; G.bottom = you >= 0 ? you : 0; G.snap = snapOf(v);
    G.watching = !!Online.watch; document.body.classList.toggle('watching', G.watching);   // admin spectating: no seat, sees every cup
    G.turnDeadline = turnLeft ? Date.now() + turnLeft : 0;
    if (current !== 'game') go('game');
    effects(prev); render();
  }
  function endGame() { resetGame(null); $('#reveal').classList.add('hidden'); $('#curtain').classList.add('hidden'); }

  // --- whose dice to show / who may act -------------------------------------
  const aliveLocalHumans = () => G.localHumans.filter(i => !G.s.players[i].out);
  const isHotseat = () => G.mode === 'local' && aliveLocalHumans().length > 1;
  function controlSeat() {
    const s = G.s; if (!s) return -1;
    if (G.mode === 'local') {
      const p = s.players[s.turn];
      if (s.phase !== 'bidding' || !p || p.bot) return -1;
      if (isHotseat() && G.revealedFor !== s.turn) return -1;
      return s.turn;
    }
    return G.me;
  }
  function resolveViewer() {
    const s = G.s;
    if (!isHotseat()) {
      const h = aliveLocalHumans()[0];
      G.viewer = h ?? G.localHumans[0] ?? -1;
      if (h != null) G.bottom = h;
      hideCurtain(); return;
    }
    if (s.phase !== 'bidding') { hideCurtain(); return; }
    const p = s.players[s.turn];
    if (p.bot) { G.viewer = -1; hideCurtain(); return; }
    G.bottom = s.turn;
    if (G.revealedFor === s.turn) { G.viewer = s.turn; hideCurtain(); }
    else { G.viewer = -1; showCurtain(s.turn); }
  }
  function showCurtain(i) {
    const p = G.s.players[i], el = $('#curtain');
    if (!el.classList.contains('hidden') && el.dataset.for === String(i) + '|' + G.s.round + '|' + G.s.history.length) return;
    el.dataset.for = String(i) + '|' + G.s.round + '|' + G.s.history.length;
    $('#curtain-body').innerHTML = `${Avatar.render(p.avatar, 140)}<h2>Pass the device to ${esc(p.name)}</h2>
      <p>No peekin', the rest of ye! ${G.s.bid ? `The wager stands at <b>${G.s.bid.qty} × ${FACE_GLYPH[G.s.bid.face - 1]}</b>.` : `${esc(p.name)} opens this round.`}</p>
      <button class="btn big primary" id="curtain-go">I'm ${esc(p.name)} — show my dice</button>`;
    el.classList.remove('hidden');
  }
  function hideCurtain() { $('#curtain').classList.add('hidden'); }
  $('#curtain').addEventListener('click', e => {
    if (!e.target.closest('#curtain-go')) return;
    G.revealedFor = G.s.turn; resolveViewer(); resetSel(); Sfx.turn(); render();
  });

  // --- acting ---------------------------------------------------------------
  function act(seat, action) {
    if (!G.s) return;
    if (G.mode === 'client') { Net.send({ t: 'act', action }); return; }
    const r = Engine.apply(G.s, seat, action);
    if (!r.ok) { if (seat === controlSeat()) toast(r.error); return; }
    if (r.result) botTaunts(r.result);
    update();
  }
  const playerAct = action => { const cs = controlSeat(); if (cs >= 0) { Sfx.click(); act(cs, action); } };

  function update(force) {
    const prev = G.snap;
    G.snap = snapOf(G.s);
    if (G.mode === 'local') resolveViewer();
    schedule(force);
    if (G.mode === 'host') broadcastState();
    effects(prev);
    render();
  }
  function schedule(force) {
    const s = G.s, key = G.snap.key;
    if (!force && key === G.schedKey) return;
    G.schedKey = key;
    clearTimers(); G.turnDeadline = 0; G.nextAt = 0;
    if (s.phase === 'bidding') {
      const p = s.players[s.turn];
      if (p.bot) {
        G.T.bot = setTimeout(() => { if (G.s === s && G.snap.key === key) act(s.turn, safeBotMove(s, s.turn)); }, botThinkMs(s));
      } else if (G.mode === 'host') {
        G.turnDeadline = Date.now() + TURN_MS;
        G.T.turn = setTimeout(() => {
          if (G.s !== s || G.snap.key !== key) return;
          toast(isYou(s.turn) ? 'Ye dawdled — the parrot wagered for ye' : `${p.name} dawdled — the parrot wagers for them`);
          act(s.turn, safeBotMove(s, s.turn));
        }, TURN_MS);
      }
    } else if (s.phase === 'reveal') {
      // local games wait for "Next round" so everyone can read the reveal (unless pace is Quick)
      if (G.mode !== 'local' || (PACE[s.settings.pace] || PACE.relaxed).autoReveal) {
        G.nextAt = Date.now() + REVEAL_MS;
        G.T.next = setTimeout(nextRound, REVEAL_MS);
      }
    }
  }
  /** Bots take their time like a real player: longer on big tables, late in a round, and on close calls. */
  function botThinkMs(s) {
    const pace = PACE[s.settings.pace] || PACE.relaxed;
    let ms = pace.think[0] + Math.random() * (pace.think[1] - pace.think[0]);
    ms += Math.min(6, s.history.length) * pace.think[0] * 0.08;
    if (s.bid) {
      const p = Bot.odds(s, s.turn, s.bid);
      if (p > 0.3 && p < 0.65) ms += pace.think[0] * 0.5;     // a tough call — mull it over
    }
    const me = s.players[s.turn].bot;
    if (me && me.disguise) {
      // people are uneven: quick snap wagers, slow stares, the odd glance at their phone
      ms *= me.speed || 1;
      const r = Math.random();
      if (r < 0.18) ms *= 0.45;
      else if (r > 0.9) ms += 4000 + Math.random() * 7000;
      if (!s.bid) ms *= 0.8;                                    // opening a round is easy
      ms = Math.min(ms, TURN_MS - 8000);
    }
    return Math.round(ms);
  }
  function nextRound() {
    if (!G.s || G.mode === 'client' || G.s.phase !== 'reveal') return;
    Engine.nextRound(G.s); G.revealedFor = -1; update();
  }
  function broadcastState() {
    const s = G.s, left = G.turnDeadline ? Math.max(0, G.turnDeadline - Date.now()) : 0;
    s.players.forEach((p, i) => {
      if (p.bot || p.id === 'host') return;
      const seat = Online.seats.find(x => x.id === p.id);
      const xray = !!(seat && seat.admin && seat.xray);       // verified admin with X-ray on sees every cup
      const v = xray ? JSON.parse(JSON.stringify(s)) : Engine.viewFor(s, i);
      v.players.forEach(q => { if (q.bot) q.bot = q.bot.disguise && !(seat && seat.admin) ? null : { persona: q.bot.persona }; });
      Net.sendTo(p.id, { t: 'state', s: v, you: i, turnLeft: left, xray });
    });
    if (Online.watchers.size) { const full = JSON.parse(JSON.stringify(s)); Online.watchers.forEach(id => Net.sendTo(id, { t: 'state', s: full, you: -1, turnLeft: left, xray: true })); }
  }

  // --- "You" instead of your own name -------------------------------------------
  const isYou = i => !!G.s && i >= 0 && i === walletSeat();
  /** Display name for a seat: "You"/"you" for this device's player, otherwise the escaped pirate name. */
  const nm = (i, cap = true) => isYou(i) ? (cap ? 'You' : 'you') : esc(G.s.players[i] ? G.s.players[i].name : '?');
  /** Verb agreement: vb(i, 'loses', 'lose'). */
  const vb = (i, third, base) => isYou(i) ? base : third;
  const poss = i => isYou(i) ? 'your' : `${esc(G.s.players[i].name)}'s`;

  /** A bot's move, guaranteed legal: anything odd from the AI is replaced by a safe legal move. */
  function safeBotMove(s, seat) {
    let a = null;
    try { a = Bot.decide(s, seat); } catch (e) { console.warn('bot error', e); }
    const ok = a && ((a.type === 'bid' && Engine.isLegal(s, a))
      || (a.type === 'liar' && s.bid) || (a.type === 'spot' && s.bid && s.settings.spotOn));
    if (!ok) { console.warn('bot proposed an illegal move, using fallback', a); a = Engine.fallbackMove(s); }
    return a;
  }

  /** Which seat on this device collects doubloons. */
  function walletSeat() {
    if (!G.s) return -1;
    if (G.mode === 'local') return G.s.players.findIndex(p => p.id === 'L0');
    return G.me;
  }
  /** +1 doubloon for making someone lose a die, -1 (if ye have any) for losing one yerself. */
  function awardCoins(r) {
    if (r.earner >= 0) {
      coinPop(r.earner);
      if (r.earner === walletSeat()) {
        profile.coins += 1; saveProfile();
        G.myDiceWon = (G.myDiceWon | 0) + 1; Auth.recordDiceWon();       // counts for the leaderboard
        logAct(`Won a die off ${r.loser >= 0 && G.s.players[r.loser] ? G.s.players[r.loser].name : 'someone'}`);
        setTimeout(() => { Sfx.coin(); toast(`+1 doubloon! (🪙 ${profile.coins})`); }, 1300);
      }
    }
    if (r.loser >= 0 && r.loser === walletSeat()) {
      logAct(r.eliminated ? 'Lost their last die and walked the plank ☠' : 'Lost a die');
      r.coinLost = profile.coins > 0;
      if (r.coinLost) {
        profile.coins -= 1; saveProfile();
        coinPop(r.loser, '-1 🪙', 'coin-loss');
        setTimeout(() => toast(`-1 doubloon for losing a die (🪙 ${profile.coins})`), 1400);
      }
    }
    renderCoins();
  }
  function renderCoins() { const c = $('#g-coins'); if (c) c.textContent = '🪙 ' + profile.coins; }

  function effects(prev) {
    const s = G.s; if (!s) return;
    if (!prev && !G.watching) {
      const quick = s.players.some(p => p.bot && p.bot.disguise);
      const kind = G.mode === 'local' ? (quick ? 'a Quick Game (offline)' : 'Pass & Play') : quick ? 'a Quick Game' : 'an online game';
      logAct(`Started ${kind} with ${s.players.length} pirates`);
    }
    if (prev && prev.phase !== 'over' && s.phase === 'over' && !G.watching) logAct(isYou(s.winner) ? 'Won the game! 🏆' : `Game over: ${s.players[s.winner] ? s.players[s.winner].name : '?'} won`);
    if (!prev || s.round !== prev.round) { Sfx.rattle(); G.rollAnim = true; G.roundAt = Date.now(); setTimeout(warmTable, SHAKE_MS + 150); }
    else if (s.history.length > prev.hist && s.phase === 'bidding') Sfx.bid();
    if (prev && prev.phase === 'bidding' && s.phase !== 'bidding') {
      Sfx.liar(); vibrate([70, 40, 70]); G.revealAt = Date.now();
      const r = s.result;
      awardCoins(r);
      if (G.mode !== 'client') maybeBotSnack(r);
      if (G.mode === 'host') crewReveal(r);
      const mineLost = G.mode === 'local' ? (r.loser >= 0 && !s.players[r.loser].bot) : r.loser === G.me;
      setTimeout(() => {
        if (G.s !== s) return;
        if (s.phase === 'over') Sfx.win();
        else if (mineLost) { Sfx.lose(); vibrate(250); }
        else if (r.gainer >= 0) Sfx.coin();
      }, 1100);
      if (G.mode === 'client') G.nextAt = Date.now() + REVEAL_MS;
    }
    const cs = controlSeat();
    if (s.phase === 'bidding' && cs >= 0 && cs === s.turn && (!prev || prev.turn !== s.turn || prev.round !== s.round || prev.phase !== s.phase)) {
      Sfx.turn(); vibrate(50); resetSel();
    }
  }

  // --- taunts ---------------------------------------------------------------
  function showTaunt(seat, i) {
    if (!G.s || !G.s.players[seat] || !TAUNTS[i]) return;
    G.taunts[seat] = { i, until: Date.now() + 2800 };
    renderSeats(); setTimeout(() => { if (G.s) renderSeats(); }, 2900);
  }
  function sendTaunt(seat, i) {
    if (G.mode === 'client') { Net.send({ t: 'taunt', i }); return; }
    showTaunt(seat, i);
    if (G.mode === 'host') Net.broadcast({ t: 'taunt', seat, i });
  }
  function botTaunts(r) {
    const s = G.s, winnerSeat = r.loser === r.caller ? r.bidder : r.caller;
    const p = s.players[winnerSeat];
    if (p && p.bot && Math.random() < 0.45) setTimeout(() => { if (G.s === s) sendTaunt(winnerSeat, pick([0, 1, 3, 4, 5])); }, 1600);
  }
  $('#g-taunt-btn').addEventListener('click', () => {
    $('#item-tray').classList.add('hidden');
    const tray = $('#taunt-tray');
    tray.innerHTML = TAUNTS.map((t, i) => `<button data-t="${i}">${esc(t)}</button>`).join('');
    tray.classList.toggle('hidden');
  });
  $('#taunt-tray').addEventListener('click', e => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    $('#taunt-tray').classList.add('hidden');
    if (Date.now() - G.lastTaunt < 1500) return;
    G.lastTaunt = Date.now();
    const seat = G.mode === 'local' ? (G.viewer >= 0 ? G.viewer : G.localHumans[0]) : G.me;
    sendTaunt(seat, Number(b.dataset.t));
  });

  // --- grub & grog: using shop items at the table ------------------------------
  function floatAt(seat, html, cls, ms) {
    const pos = (G.seatPos || [])[seat]; if (!pos) return null;
    const el = document.createElement('div');
    el.className = 'float ' + cls;
    el.style.left = pos.x + '%'; el.style.top = pos.y + '%';
    el.innerHTML = html;
    $('#g-table').appendChild(el);
    setTimeout(() => el.remove(), ms);
    return el;
  }
  function coinPop(seat, text = '+1 🪙', extra = '') { floatAt(seat, text, 'coin-pop ' + extra, 2600); }
  function showUse(seat, id) {
    const it = shopItem(id), p = G.s && G.s.players[seat]; if (!it || !p) return;
    if (window.Avatar3D && window.Avatar3D.ready) {
      // the pirate's own portrait switches pose: mug to the lips, smoke between the fingers, fork in hand…
      // lasts across rounds until it's finished; the seat animates through the item's loop (see seatFrame)
      const now = Date.now();
      G.uses[seat] = { id, start: now, end: now + it.ms };
      warm(p.avatar, itemFramePoses(id));
      renderSeats();
    } else {
      const smoke = (id === 'smokes' || id === 'cigar') ? '<i class="puff"></i><i class="puff"></i><i class="puff"></i><i class="puff"></i>' : '';
      floatAt(seat, `<div class="prop prop-${id}"><span class="item-emoji">${it.emoji}</span>${smoke}</div>`, 'use use-' + id, it.ms);
    }
    const verb = isYou(seat) ? it.verbYou : it.verb;
    if (isYou(seat)) logAct(`Used ${it.name}`);
    const log = $('#log-body'); if (log) { log.insertAdjacentHTML('beforeend', `<p>${it.emoji} <b>${nm(seat)}</b> ${verb}</p>`); log.scrollTop = log.scrollHeight; }
    if (id === 'drink' || id === 'rum') setTimeout(() => Sfx.bid(), 900);
  }
  function sendUse(seat, id) {
    if (G.mode === 'client') { Net.send({ t: 'use', id }); return; }
    showUse(seat, id);
    if (G.mode === 'host') Net.broadcast({ t: 'use', seat, id });
  }
  function maybeBotSnack(r) {
    const s = G.s, winner = r.earner;
    if (winner < 0 || !s.players[winner].bot || Math.random() > 0.35) return;
    const id = pick(SHOP.filter(it => !it.adminOnly)).id;
    setTimeout(() => { if (G.s === s) sendUse(winner, id); }, 2200);
  }
  /** In-game tavern: use what ye own, or buy on the spot with yer doubloons. */
  function renderItemTray() {
    $('#item-tray').innerHTML = `<div class="tray-head">Grub &amp; Grog · yer purse: <b>🪙 ${profile.coins}</b></div>` + SHOP.filter(it => !it.adminOnly || Auth.isAdmin).map(it => {
      if (it.adminOnly) return `<div class="tray-item admin-item">${itemIcon(it, 40)}<span>👑 ${esc(it.name)}<small>admin only · never runs out</small></span><button class="btn small primary" data-use="${it.id}">Light</button></div>`;
      const owned = profile.inv[it.id] | 0;
      const action = owned > 0
        ? `<button class="btn small primary" data-use="${it.id}">Use</button>`
        : `<button class="btn small" data-buyuse="${it.id}" ${profile.coins < it.price ? 'disabled' : ''}>Buy 🪙${it.price}</button>`;
      return `<div class="tray-item">${itemIcon(it, 40)}<span>${esc(it.name)}<small>${owned > 0 ? `ye have ${owned}` : `${it.qty > 1 ? it.qty + ' uses · ' : ''}🪙 ${it.price}`}</small></span>${action}</div>`;
    }).join('') + (profile.coins === 0 && SHOP.every(it => !(profile.inv[it.id] > 0))
      ? '<p class="tray-empty">Win doubloons by making other pirates lose dice — then treat yerself.</p>' : '');
  }
  function useItem(id) {
    const it = shopItem(id); if (!it) return;
    const unlimited = it.adminOnly && Auth.isAdmin;
    if ((it.adminOnly && !Auth.isAdmin) || (!unlimited && !(profile.inv[id] > 0)) || Date.now() - (G.lastUse || 0) < 3000) return;
    const seat = G.mode === 'local' ? walletSeat() : G.me;
    if (seat < 0 || G.s.players[seat].out) { toast('Ye can only indulge while at the table'); return; }
    G.lastUse = Date.now();
    if (!unlimited) { profile.inv[id]--; saveProfile(); }
    sendUse(seat, id);
  }
  $('#g-items-btn').addEventListener('click', () => {
    $('#taunt-tray').classList.add('hidden');
    renderItemTray(); $('#item-tray').classList.toggle('hidden');
  });
  $('#item-tray').addEventListener('click', e => {
    const buy = e.target.closest('[data-buyuse]');
    if (buy) {
      const it = shopItem(buy.dataset.buyuse);
      if (!it || profile.coins < it.price) { toast('Not enough doubloons'); return; }
      profile.coins -= it.price; profile.inv[it.id] += it.qty; saveProfile(); renderCoins(); Sfx.coin(); logAct(`Bought ${it.name} at the table for 🪙 ${it.price}`);
      $('#item-tray').classList.add('hidden');
      useItem(it.id);
      return;
    }
    const b = e.target.closest('[data-use]'); if (!b) return;
    $('#item-tray').classList.add('hidden');
    useItem(b.dataset.use);
  });

  // --- bid selection ---------------------------------------------------------
  function resetSel() {
    const s = G.s, cs = controlSeat(); if (cs < 0) return;
    const hand = s.players[cs].dice;
    if (s.bid) { G.sel = { face: s.bid.face, qty: Engine.minQty(s, s.bid.face) || 1 }; }
    else {
      const counts = [0, 0, 0, 0, 0, 0, 0];
      hand.forEach(d => { for (let f = 2; f <= 6; f++) if (Engine.matches(s, d, f)) counts[f]++; });
      let best = 2; for (let f = 2; f <= 6; f++) if (counts[f] >= counts[best]) best = f;
      G.sel = { face: best, qty: Math.max(1, counts[best]) };
    }
    clampSel();
  }
  function clampSel() {
    const s = G.s, t = Engine.totalDice(s);
    if (Engine.minQty(s, G.sel.face) == null) {
      const f = [6, 5, 4, 3, 2, 1].find(x => Engine.minQty(s, x) != null);
      if (f) G.sel.face = f;
    }
    const mq = Engine.minQty(s, G.sel.face) || 1;
    G.sel.qty = Math.max(mq, Math.min(t, G.sel.qty));
  }
  function setFace(f) { G.sel.face = f; const mq = Engine.minQty(G.s, f); if (mq != null && !Engine.isLegal(G.s, G.sel)) G.sel.qty = mq; Sfx.click(); vibrate(10); render(); }
  function bumpQty(d) { G.sel.qty += d; clampSel(); Sfx.click(); vibrate(10); render(); }
  $('#c-faces').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b && !b.disabled) setFace(Number(b.dataset.f)); });
  $('#c-minus').addEventListener('click', () => bumpQty(-1));
  $('#c-plus').addEventListener('click', () => bumpQty(1));
  $('#c-bid').addEventListener('click', () => { if (Engine.isLegal(G.s, G.sel)) playerAct({ type: 'bid', qty: G.sel.qty, face: G.sel.face }); });
  $('#c-liar').addEventListener('click', () => playerAct({ type: 'liar' }));
  $('#c-spot').addEventListener('click', () => playerAct({ type: 'spot' }));

  // --- rendering --------------------------------------------------------------
  function render() {
    const s = G.s; if (!s || current !== 'game') return;
    $('#g-round').textContent = `Round ${s.round}`;
    $('#g-total').textContent = `${Engine.totalDice(s)} dice · ${s.players.filter(p => !p.out).length} pirates afloat`;
    $('#g-sound').textContent = Sfx.on ? '🔊 Sound on' : '🔇 Sound off';
    $$('.online-only').forEach(el => el.classList.toggle('hidden', G.mode === 'local'));
    $('#g-admin-btn').classList.toggle('hidden', !Auth.isAdmin);
    renderCoins(); renderSeats(); renderCenter(); renderHand(); renderControls(); renderLog(); renderReveal(); tick();
    G.rollAnim = false;
  }
  const lastBidBy = (s, i) => { for (let k = s.history.length - 1; k >= 0; k--) if (s.history[k].by === i) return s.history[k]; return null; };
  function renderSeats() {
    const s = G.s, tbl = $('#g-table'); if (!s) return;
    $$('.seat', tbl).forEach(e => e.remove());
    const n = s.players.length, W = tbl.clientWidth || 1, H = tbl.clientHeight || 1;
    const portrait = H > W * 1.05;
    const rx = portrait ? 37 : 43, ry = portrait ? 41 : 39;
    const cs = controlSeat(), now = Date.now();
    G.seatPos = [];
    s.players.forEach((p, i) => {
      const rel = (i - G.bottom + n) % n, ang = Math.PI / 2 + rel * 2 * Math.PI / n;
      const x = 50 + rx * Math.cos(ang), y = 50 + ry * Math.sin(ang);
      G.seatPos[i] = { x, y };
      const el = document.createElement('div');
      const isTurn = s.phase === 'bidding' && s.turn === i;
      const isMe = G.mode === 'local' ? i === G.viewer : i === G.me;
      el.className = 'seat' + (isTurn ? ' turn' : '') + (p.out ? ' out' : '') + (isMe ? ' me' : '') + (y < 42 ? ' upper' : '');
      el.style.left = x + '%'; el.style.top = y + '%'; el.style.setProperty('--breath', '-' + (i * 0.73).toFixed(2) + 's');
      let bubble = '';
      const t = G.taunts[i];
      const cb = (G.chatBubbles || {})[i];
      if (t && t.until > now) bubble = `<div class="s-bubble taunt">${esc(TAUNTS[t.i])}</div>`;
      else if (cb && cb.until > now) bubble = `<div class="s-bubble taunt chat-bubble">💬 ${esc(cb.text.length > 40 ? cb.text.slice(0, 38) + '…' : cb.text)}</div>`;
      else if (isTurn) {
        const think = looksBot(p) ? `<span class="dots"><i></i><i></i><i></i></span> <span class="tl">${esc(thinkLine(i))}</span>` : '<span class="dots"><i></i><i></i><i></i></span>';
        bubble = `<div class="s-bubble think">${i === cs ? 'Yer wager!' : think}</div>`;
      }
      else if (s.phase === 'bidding') { const lb = lastBidBy(s, i); if (lb) bubble = `<div class="s-bubble">${lb.qty} × ${Dice.render(lb.face, p.kit, 22)}${lb.face === 1 ? '<small class="ones">1s</small>' : ''}</div>`; }
      const cups = p.out ? '<span class="skull" title="Out">☠</span>'
        : Array.from({ length: p.count }, () => `<i class="mini" style="background:${p.kit.face};border-color:${p.kit.edge}"></i>`).join('');
      const fr = seatFrame(i, now);
      G.seatFrameKey[i] = fr.key;
      el.innerHTML = `${bubble}<div class="av ${fr.chew ? 'chewing' : ''}" data-seat="${i}">${seatPortraitHTML(p, fr)}</div><div class="s-name">${looksBot(p) ? '<span class="bot-tag">🤖</span>' : ''}${nm(i)}</div><div class="s-cups">${cups}</div>${xrayHTML(i, p)}`;
      tbl.appendChild(el);
    });
  }
  /** Admin X-ray: the dice under another pirate's cup, shown under their seat. */
  function xrayHTML(i, p) {
    if (!showXray() || G.s.phase !== 'bidding' || i === mySeatIdx() || !p.dice || !p.dice.length) return '';
    return `<div class="xray" title="X-ray">${p.dice.map(d => Dice.render(d, p.kit, 18)).join('')}</div>`;
  }
  function seatPx() {
    const t = $('#g-table'), w = t.clientWidth || 800, h = t.clientHeight || 500;
    return Math.round(Math.max(70, Math.min(124, Math.min(w, h * 1.3) / 5.4)));
  }
  // --- item animations: each use is a loop of 3D poses that lasts until the item is finished ---------
  const P3 = (...parts) => 'parts:table,' + parts.join(',');
  const burnt = f => f < 0.4 ? 'L' : f < 0.75 ? 'M' : 'S';          // how far a smoke has burnt down
  /** Pick the value for time c from steps [[until, value], ...] (the last value is used past the end). */
  const seq = (c, steps) => { for (const [until, v] of steps) if (c < until) return v; return steps[steps.length - 1][1]; };
  const SHAKE_MS = 1300, LIFT_MID_MS = 380;
  /** What a seat looks like right now: { key, pose, fx: [{kind, at}], chew } */
  function seatFrame(i, now) {
    const s = G.s, p = s.players[i];
    const revealing = s.phase !== 'bidding' && p.dice.length > 0;
    // the cup comes up in two stages at the reveal
    const LIFT = now - (G.revealAt || 0) < LIFT_MID_MS ? ['arms_liftmid', 'cup_liftmid', 'dice_table'] : ['arms_lift', 'cup_lift', 'dice_table'];
    let u = G.uses[i];
    if (u && now >= u.end) { delete G.uses[i]; u = null; }
    if (!u) {
      if (revealing) { const pose = P3(...LIFT); return { key: pose, pose, fx: [] }; }
      const sinceRound = now - (G.roundAt || 0);
      if (s.phase === 'bidding' && !p.out && sinceRound < SHAKE_MS) {   // rattling the dice in the cup
        const k = 1 + (Math.floor(sinceRound / 140) + i) % 2;
        const pose = P3('arms_rest', 'cup_shake' + k);
        return { key: pose, pose, fx: [] };
      }
      return { key: 'rest', pose: 'rest', fx: [] };
    }
    const t = now - u.start, f = Math.min(1, t / (u.end - u.start));
    let pose, fx = [], chew = false;
    switch (u.id) {
      case 'drink': {
        const e = f > 0.5 ? '_empty' : '';
        if (revealing) { pose = P3(...LIFT, 'table_drink' + e); break; }
        if (f > 0.85) { pose = P3('arms_rest', 'cup_down', 'table_drink_empty'); break; }
        const step = seq(t % 10000, [[6000, 'table'], [6450, 'hold'], [6800, 'mid'], [8800, 'sip'], [9150, 'mid'], [9600, 'hold'], [10000, 'table']]);
        if (step === 'table') pose = P3('arms_rest', 'cup_down', 'table_drink' + e);
        else if (step === 'hold') pose = P3('arms_holddrink', 'cup_down', 'chest_drink' + e);
        else if (step === 'mid') pose = P3('arms_drinkmid', 'cup_down', 'mid_drink' + e);
        else { pose = P3('arms_drink', 'cup_down', 'held_drink' + e); fx.push({ kind: 'gulp', at: 'mouth' }); }
        break;
      }
      case 'rum': {
        const step = seq(t, [[2300, 'table'], [2650, 'mid'], [4400, 'sip'], [4750, 'mid'], [1e12, 'done']]);
        if (revealing) pose = P3(...LIFT, 'table_rum' + (t > 4400 ? '_empty' : ''));
        else if (step === 'table') pose = P3('arms_rest', 'cup_down', 'table_rum');
        else if (step === 'mid') pose = P3('arms_drinkmid', 'cup_down', 'mid_rum');
        else if (step === 'sip') { pose = P3('arms_drink', 'cup_down', 'held_rum'); fx.push({ kind: 'gulp', at: 'mouth' }); }
        else pose = P3('arms_rest', 'cup_down', 'table_rum_empty');
        break;
      }
      case 'smokes': {
        const z = burnt(f);
        if (revealing) { pose = P3(...LIFT, 'lips_cigarette_' + z); fx.push({ kind: 'wisp', at: 'lips_cigarette_' + z }); break; }
        const step = seq(t % 9000, [[5200, 'down'], [5550, 'up'], [7250, 'drag'], [7600, 'up'], [9000, 'exhale']]);
        if (step === 'drag') { pose = P3('arms_smoke', 'cup_down', 'held_cigarette_' + z); fx.push({ kind: 'glow', at: 'held_cigarette_' + z }); }
        else if (step === 'up') { pose = P3('arms_smokemid', 'cup_down', 'mid_cigarette_' + z); fx.push({ kind: 'wisp', at: 'mid_cigarette_' + z }); }
        else {
          pose = P3('arms_smokedown', 'cup_down', 'hand_cigarette_' + z);
          fx.push({ kind: 'wisp', at: 'hand_cigarette_' + z });
          if (step === 'exhale') fx.push({ kind: 'exhale', at: 'mouth' });
        }
        break;
      }
      case 'cigar': {
        const z = burnt(f), c = t % 12000;
        if (revealing) { pose = P3(...LIFT, 'teeth_cigar_' + z); fx.push({ kind: 'wisp', at: 'teeth_cigar_' + z }); }
        else if (c >= 7000 && c < 10000) {          // taken out of the mouth: a big cloud
          pose = P3('arms_cigarhand', 'cup_down', 'hand_cigar_' + z);
          fx.push({ kind: 'wisp', at: 'hand_cigar_' + z }, { kind: 'exhale', at: 'mouth' });
        } else {
          pose = P3('arms_rest', 'cup_down', 'teeth_cigar_' + z);
          fx.push({ kind: c >= 10000 ? 'glow' : 'wisp', at: 'teeth_cigar_' + z });
        }
        break;
      }
      case 'steak': {
        const plate = 'plate_' + (f < 0.35 ? 'full' : f < 0.8 ? 'half' : 'bone');
        if (revealing) { pose = P3(...LIFT, plate); break; }
        const c = t % 8000;
        const saw = Math.floor(c / 380) % 2 ? ['arms_cut2', 'cut_tools2'] : ['arms_cut', 'cut_tools'];   // knife sawing back and forth
        if (f >= 0.9) pose = P3('arms_cut', 'cup_side', plate, 'cut_tools');
        else {
          const step = seq(c, [[3000, 'cut'], [3300, 'mid'], [4500, 'bite'], [4800, 'mid'], [8000, 'chew']]);
          if (step === 'cut') pose = P3(saw[0], 'cup_side', plate, saw[1]);
          else if (step === 'mid') pose = P3('arms_bitemid', 'cup_side', plate, 'mid_fork');
          else if (step === 'bite') pose = P3('arms_eat', 'cup_side', plate, 'held_fork');
          else { pose = P3('arms_cut', 'cup_side', plate, 'cut_tools'); chew = true; }
        }
        break;
      }
      case 'pipe': {                              // 👑 the captain's churchwarden pipe
        const c = t % 13000;
        if (revealing) { pose = P3(...LIFT, 'teeth_pipe'); fx.push({ kind: 'wisp', at: 'teeth_pipe' }); }
        else if (c >= 8000 && c < 11500) {          // taken out by the bowl: a long, slow exhale
          pose = P3('arms_cigarhand', 'cup_down', 'hand_pipe');
          fx.push({ kind: 'wisp', at: 'hand_pipe' }, { kind: 'exhale', at: 'mouth' });
        } else {
          pose = P3('arms_rest', 'cup_down', 'teeth_pipe');
          fx.push({ kind: c >= 11500 || c < 1200 ? 'glow' : 'wisp', at: 'teeth_pipe' });
        }
        break;
      }
      default: pose = revealing ? P3(...LIFT) : 'rest';
    }
    return { key: pose + '|' + fx.map(x => x.kind).join() + (chew ? '|chew' : ''), pose, fx, chew };
  }
  /** Every frame an item's loop can show, so they can be drawn ahead of time (no stutter mid-animation). */
  function itemFramePoses(id) {
    const out = [];
    const S = ['L', 'M', 'S'];
    if (id === 'drink') for (const e of ['', '_empty']) out.push(P3('arms_rest', 'cup_down', 'table_drink' + e), P3('arms_holddrink', 'cup_down', 'chest_drink' + e), P3('arms_drinkmid', 'cup_down', 'mid_drink' + e), P3('arms_drink', 'cup_down', 'held_drink' + e));
    if (id === 'rum') out.push(P3('arms_rest', 'cup_down', 'table_rum'), P3('arms_drinkmid', 'cup_down', 'mid_rum'), P3('arms_drink', 'cup_down', 'held_rum'), P3('arms_rest', 'cup_down', 'table_rum_empty'));
    if (id === 'smokes') out.push(...S.slice(0, 1).flatMap(z => [P3('arms_smokedown', 'cup_down', 'hand_cigarette_' + z), P3('arms_smokemid', 'cup_down', 'mid_cigarette_' + z), P3('arms_smoke', 'cup_down', 'held_cigarette_' + z)]));
    if (id === 'cigar') out.push(P3('arms_rest', 'cup_down', 'teeth_cigar_L'), P3('arms_cigarhand', 'cup_down', 'hand_cigar_L'));
    if (id === 'steak') out.push(P3('arms_cut', 'cup_side', 'plate_full', 'cut_tools'), P3('arms_cut2', 'cup_side', 'plate_full', 'cut_tools2'), P3('arms_bitemid', 'cup_side', 'plate_full', 'mid_fork'), P3('arms_eat', 'cup_side', 'plate_full', 'held_fork'));
    if (id === 'pipe') out.push(P3('arms_rest', 'cup_down', 'teeth_pipe'), P3('arms_cigarhand', 'cup_down', 'hand_pipe'));
    return out;
  }
  // draw portraits in the background, a few at a time, so the first time a frame shows it is already ready
  const warmQueue = [];
  let warmBusy = false;
  const idle = cb => window.requestIdleCallback ? window.requestIdleCallback(cb, { timeout: 250 }) : setTimeout(cb, 16);
  function warm(look, poses) {
    if (!(window.Avatar3D && window.Avatar3D.ready)) return;
    poses.forEach(pose => warmQueue.push([look, pose]));
    if (warmBusy) return;
    warmBusy = true;
    const step = () => {
      const job = warmQueue.shift();
      if (!job) { warmBusy = false; return; }
      try { window.Avatar3D.portrait(Avatar.sanitize(job[0]), job[1]); } catch (_) {}
      idle(step);
    };
    idle(step);
  }
  function warmTable() {
    if (!G.s) return;
    G.s.players.forEach(p => warm(p.avatar, ['rest', P3('arms_rest', 'cup_shake1'), P3('arms_rest', 'cup_shake2'),
      P3('arms_liftmid', 'cup_liftmid', 'dice_table'), P3('arms_lift', 'cup_lift', 'dice_table')]));
  }
  function seatPortraitHTML(p, fr) {
    const A = window.Avatar3D;
    let fxHTML = '';
    if (A && A.ready) {
      for (const e of fr.fx) {
        const pt = A.anchor(e.at);
        if (!pt) continue;
        const pos = `left:${(pt.x * 100).toFixed(1)}%;top:${(pt.y * 100).toFixed(1)}%`;
        if (e.kind === 'wisp') fxHTML += `<span class="smoke" style="${pos}"><i></i><i></i><i></i><i></i><i></i></span>`;
        else if (e.kind === 'glow') fxHTML += `<span class="ember-glow" style="${pos}"></span><span class="smoke thin" style="${pos}"><i></i><i></i><i></i></span>`;
        else if (e.kind === 'exhale') fxHTML += `<span class="exhale" style="${pos}"><i></i><i></i><i></i></span>`;
        else if (e.kind === 'gulp') fxHTML += `<span class="sip" style="${pos}">glug</span>`;
      }
    }
    return Avatar.render(p.avatar, seatPx(), fr.pose) + fxHTML;
  }
  /** Runs ~11×/s: moves each seat to its next frame, cross-fading so motion looks smooth. */
  function animateSeats() {
    if (!G.s || current !== 'game') return;
    const now = Date.now();
    G.s.players.forEach((p, i) => {
      const fr = seatFrame(i, now);
      if (fr.key === G.seatFrameKey[i]) return;
      const av = document.querySelector(`.seat .av[data-seat="${i}"]`);
      if (!av) return;
      const oldImg = av.querySelector('img.avatar-table');
      // smoke effects are only rebuilt when they change, so the puffs keep drifting smoothly
      const sameFx = (G.seatFxKey || {})[i] === fr.fx.map(x => x.kind + x.at).join();
      G.seatFrameKey[i] = fr.key;
      (G.seatFxKey = G.seatFxKey || {})[i] = fr.fx.map(x => x.kind + x.at).join();
      av.classList.toggle('chewing', !!fr.chew);
      const oldFx = sameFx ? [...av.querySelectorAll('.smoke, .ember-glow, .exhale, .sip')] : [];
      av.innerHTML = seatPortraitHTML(p, fr);
      if (sameFx && oldFx.length) { av.querySelectorAll('.smoke, .ember-glow, .exhale, .sip').forEach(e => e.remove()); oldFx.forEach(e => av.appendChild(e)); }
      const newImg = av.querySelector('img.avatar-table');
      if (oldImg && newImg) {                       // cross-fade from the old frame to the new one
        oldImg.classList.add('prev-frame');
        av.insertBefore(oldImg, newImg);
        newImg.classList.add('fade-in');
        setTimeout(() => oldImg.remove(), 200);
      }
    });
  }
  setInterval(animateSeats, 90);

  const THINK = ['Hmm…', "Countin' me dice…", 'Studyin\' yer faces…', 'Workin\' the odds…', 'Smells like a bluff…', 'Lemme think…', 'Thinkin\' it over…'];
  function thinkLine(i) {
    const k = `${G.s.round}|${G.s.history.length}|${i}`;
    if (!G.thinkKey || G.thinkKey !== k) { G.thinkKey = k; G.thinkIdx = Math.floor(Math.random() * THINK.length); G.thinkStart = Date.now(); }
    return THINK[(G.thinkIdx + Math.floor((Date.now() - (G.thinkStart || 0)) / 1800)) % THINK.length];
  }
  function renderCenter() {
    const s = G.s;
    const chips = `<div class="c-chips">${s.settings.onesWild ? '<span class="chip">1s are wild</span>' : ''}${s.settings.spotOn ? '<span class="chip">Spot On allowed</span>' : ''}</div>`;
    if (s.bid) {
      const b = s.players[s.bid.by];
      $('#g-center').innerHTML = `<div class="c-label">Current wager</div><div class="c-bid" data-k="${s.round}-${s.history.length}"><span class="c-qty">${s.bid.qty}</span><span class="c-x">×</span>${Dice.render(s.bid.face, b.kit, 62)}</div>${s.bid.face === 1 ? `<div class="c-ones">${s.bid.qty} × <b>1s</b>${s.settings.onesWild ? ' — wild, so wagers on 1s only need half the count' : ''}</div>` : ''}<div class="c-by">by ${nm(s.bid.by, false)}</div>${chips}`;
    } else {
      const p = s.players[s.turn];
      $('#g-center').innerHTML = `<div class="c-label">Round ${s.round}</div><div class="c-open">${s.phase === 'bidding' ? `${nm(s.turn)} ${vb(s.turn, 'opens', 'open')} the wager` : ''}</div>${chips}`;
    }
  }
  function renderHand() {
    const s = G.s, v = G.viewer, p = s.players[v], el = $('#g-hand');
    const mobile = document.body.classList.contains('mobile');
    if (v < 0 || !p) { el.innerHTML = `<span class="hand-hidden">🏴‍☠️ ${isHotseat() ? 'Dice stay under the cup till it be yer turn' : 'Watching the table'}</span>`; return; }
    if (p.out) { el.innerHTML = `<span class="hand-hidden">☠ Ye've walked the plank — watch the rest of the crew</span>`; return; }
    if (s.phase !== 'bidding' && G.mode !== 'client' && isHotseat()) { el.innerHTML = '<span class="hand-hidden">All cups lifted!</span>'; return; }
    const can = s.phase === 'bidding' && controlSeat() === s.turn && controlSeat() === v;
    const area = Math.min(window.innerWidth, $('.g-bottom').clientWidth || window.innerWidth);
    const size = mobile ? Math.max(30, Math.min(52, Math.floor((area - 30) / Math.max(5, p.dice.length) - 9))) : 54;
    el.innerHTML = `<span class="lbl">Yer dice</span>` + p.dice.map((d, k) =>
      `<span class="hd ${can && Engine.matches(s, d, G.sel.face) ? 'match' : ''} ${G.rollAnim ? 'roll' : ''}" style="animation-delay:${k * 70}ms">${Dice.render(d, p.kit, size)}</span>`).join('');
  }
  function renderControls() {
    const s = G.s, cs = controlSeat();
    const can = s.phase === 'bidding' && cs >= 0 && cs === s.turn;
    $('#g-controls').classList.toggle('hidden', !can);
    const wait = $('#g-wait');
    if (!can && s.phase === 'bidding') {
      const p = s.players[s.turn];
      wait.classList.remove('hidden');
      wait.textContent = looksBot(p) ? `${p.name} is scheming…` : isHotseat() ? `Pass the device to ${p.name}` : `Waiting on ${p.name}…`;
    } else wait.classList.add('hidden');
    if (!can) return;
    clampSel();
    const sel = G.sel, kit = s.players[cs].kit, total = Engine.totalDice(s);
    const mq = Engine.minQty(s, sel.face);
    $('#c-qty').textContent = sel.qty;
    $('#c-minus').disabled = mq == null || sel.qty <= mq;
    $('#c-plus').disabled = sel.qty >= total;
    $('#c-faces').innerHTML = [1, 2, 3, 4, 5, 6].map(f => `<button data-f="${f}" class="${f === sel.face ? 'on' : ''}" ${Engine.minQty(s, f) == null ? 'disabled' : ''} aria-label="Face ${f}">${Dice.render(f, kit, 40)}</button>`).join('');
    const legal = Engine.isLegal(s, sel);
    $('#c-bid').disabled = !legal;
    $('#c-bid').innerHTML = `Wager ${sel.qty} × ${FACE_GLYPH[sel.face - 1]}`;
    $('#c-liar').disabled = !s.bid;
    $('#c-spot').disabled = !s.bid;
    $('#c-liar').title = s.bid ? `Call Liar: ye bet there are FEWER than ${s.bid.qty} × ${FACE_GLYPH[s.bid.face - 1]}` : '';
    $('#c-spot').title = s.bid ? `Spot On: ye bet there are EXACTLY ${s.bid.qty} × ${FACE_GLYPH[s.bid.face - 1]}` : '';
    $('#c-liar').innerHTML = s.bid ? `Liar!<small>fewer than ${s.bid.qty}</small>` : 'Liar!';
    $('#c-spot').innerHTML = s.bid ? `Spot On<small>exactly ${s.bid.qty}</small>` : 'Spot On';
    $('#c-spot').classList.toggle('hidden', !s.settings.spotOn);
    const o = Bot.odds(s, cs, sel), oc = s.bid ? Bot.odds(s, cs, s.bid) : null;
    let ruleHint = '';
    if (s.bid && s.settings.onesWild) {
      if (s.bid.face === 1) ruleHint = `<div class="rule-hint">To leave 1s, wager at least <b>${s.bid.qty * 2 + 1}</b> of another face.</div>`;
      else ruleHint = `<div class="rule-hint">Or switch to wild 1s with just <b>${Math.ceil(s.bid.qty / 2)}</b>.</div>`;
    }
    $('#c-odds').innerHTML = `🦜 Parrot reckons yer wager be <b>${pct(o)}</b> likely` + (oc != null ? ` · the current one <b>${pct(oc)}</b>` : '') + ruleHint;
  }
  function logLine(e, s) {
    const n = (i, cap = true) => `<b>${nm(i, cap)}</b>`;
    switch (e.k) {
      case 'round': return `<p class="lr">— Round ${e.n} —</p>`;
      case 'bid': return `<p>${n(e.p)} ${vb(e.p, 'wagers', 'wager')} ${e.qty} × ${e.face === 1 ? '1s' + (s.settings.onesWild ? ' (wild)' : '') : FACE_GLYPH[e.face - 1]}</p>`;
      case 'liar': return `<p>${n(e.p)} ${vb(e.p, 'calls', 'call')} ${n(e.t, false)} a liar!</p>`;
      case 'spot': return `<p>${n(e.p)} ${vb(e.p, 'calls', 'call')} Spot On!</p>`;
      case 'result': return `<p>There were ${e.actual} × ${FACE_GLYPH[e.face - 1]}. ${e.loser >= 0 ? `${n(e.loser)} ${vb(e.loser, 'loses', 'lose')} a die${e.out ? ` and ${vb(e.loser, 'walks', 'walk')} the plank ☠` : ''}.` : `${n(e.gainer)} ${vb(e.gainer, 'was', 'were')} dead on!`}</p>`;
      case 'win': return `<p class="lr">🏆 ${n(e.p)} ${vb(e.p, 'claims', 'claim')} the treasure!</p>`;
      default: return '';
    }
  }
  function renderLog() {
    const el = $('#log-body'), s = G.s;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    el.innerHTML = s.log.map(e => logLine(e, s)).join('');
    if (atBottom || !G.logScrolled) el.scrollTop = el.scrollHeight;
  }

  // --- movable, minimisable Ship's Log -----------------------------------------
  const LogUI = {
    st: Object.assign({ open: window.innerWidth >= 1100 && !Device.touch, min: false, x: null, y: null }, store.get('bnb.log', {})),
    save() { store.set('bnb.log', this.st); },
    apply() {
      const el = $('#g-log'), wrap = $('.g-table-wrap');
      el.classList.toggle('open', !!this.st.open);
      el.classList.toggle('min', !!this.st.min);
      $('#log-min').textContent = this.st.min ? '+' : '–';
      $('#log-min').title = this.st.min ? 'Expand' : 'Minimise';
      if (this.st.x != null && wrap.clientWidth) {
        const maxX = Math.max(0, wrap.clientWidth - el.offsetWidth), maxY = Math.max(0, wrap.clientHeight - el.offsetHeight);
        this.st.x = Math.min(maxX, Math.max(0, this.st.x));
        this.st.y = Math.min(maxY, Math.max(0, this.st.y));
        el.style.left = this.st.x + 'px';
        el.style.top = this.st.y + 'px';
        el.style.right = 'auto';
      } else { el.style.left = ''; el.style.top = ''; el.style.right = ''; }
    }
  };
  $('#g-log-btn').addEventListener('click', () => { LogUI.st.open = !LogUI.st.open; if (LogUI.st.open) LogUI.st.min = false; LogUI.save(); LogUI.apply(); });
  $('#log-close').addEventListener('click', () => { LogUI.st.open = false; LogUI.save(); LogUI.apply(); });
  $('#log-min').addEventListener('click', () => { LogUI.st.min = !LogUI.st.min; LogUI.save(); LogUI.apply(); if (!LogUI.st.min) $('#log-body').scrollTop = 1e9; });
  $('#log-body').addEventListener('scroll', e => { const b = e.target; G.logScrolled = b.scrollHeight - b.scrollTop - b.clientHeight > 30; });
  (() => {   // drag by the title bar (mouse or finger)
    const head = $('#log-head'), el = $('#g-log');
    let drag = null;
    head.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      const r = el.getBoundingClientRect(), w = $('.g-table-wrap').getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, wx: w.left, wy: w.top };
      head.setPointerCapture(e.pointerId); el.classList.add('dragging');
    });
    head.addEventListener('pointermove', e => {
      if (!drag) return;
      LogUI.st.x = e.clientX - drag.wx - drag.dx; LogUI.st.y = e.clientY - drag.wy - drag.dy;
      LogUI.apply();
    });
    const end = () => { if (!drag) return; drag = null; el.classList.remove('dragging'); LogUI.save(); };
    head.addEventListener('pointerup', end); head.addEventListener('pointercancel', end);
    head.addEventListener('dblclick', e => { if (!e.target.closest('button')) $('#log-min').click(); });
  })();
  window.addEventListener('resize', () => LogUI.apply());
  onShow.game = () => requestAnimationFrame(() => LogUI.apply());
  function renderReveal() {
    const s = G.s, ov = $('#reveal');
    if (s.phase === 'bidding' || !s.result) { ov.classList.add('hidden'); G.revealKey = ''; return; }
    const key = `${s.round}|${s.phase}|${G.mode}`;
    ov.classList.remove('hidden');
    if (key === G.revealKey) return;
    G.revealKey = key;
    const r = s.result, P = i => s.players[i];
    const head = r.type === 'liar'
      ? `<h2 class="rv-title">“Liar!”</h2><p><b>${nm(r.caller)}</b> ${vb(r.caller, 'doubts', 'doubt')} <b>${nm(r.bidder, false)}</b></p>`
      : `<h2 class="rv-title gold">“Spot On!”</h2><p><b>${nm(r.caller)}</b> ${vb(r.caller, 'reckons', 'reckon')} <b>${poss(r.bidder)}</b> wager be exact</p>`;
    const wager = `<div class="rv-wager">Wager <span class="big">${r.bid.qty} ×</span>${Dice.render(r.bid.face, P(r.bidder).kit, 42)}<span>— there be</span><span class="rv-actual">${r.actual}</span></div>`;
    let verdict;
    const faceTxt = `${FACE_GLYPH[r.bid.face - 1]}${s.settings.onesWild && r.bid.face !== 1 ? ' (counting wild 1s)' : ''}`;
    const why = r.type === 'liar'
      ? (r.actual >= r.bid.qty
        ? `The wager held — needed ${r.bid.qty}, found ${r.actual} ${faceTxt}. So the caller was wrong.`
        : `The wager was a lie — needed ${r.bid.qty}, found only ${r.actual} ${faceTxt}. So the wagerer was caught.`)
      : (r.actual === r.bid.qty
        ? `Exactly ${r.actual} ${faceTxt} — a perfect call!`
        : `Needed exactly ${r.bid.qty}, but there be ${r.actual} ${faceTxt}. Not spot on.`);
    if (r.loser >= 0) verdict = `${nm(r.loser)} ${vb(r.loser, 'loses', 'lose')} a die!${r.eliminated ? ` ☠ ${nm(r.loser)} ${vb(r.loser, 'walks', 'walk')} the plank!` : ''}`;
    else verdict = r.capped ? `Dead on! ${nm(r.gainer)} already ${vb(r.gainer, 'has', 'have')} a full cup.` : `Dead on! ${nm(r.gainer)} ${vb(r.gainer, 'wins', 'win')} back a die!`;
    verdict = `<div class="rv-why">${why}</div>` + verdict;
    if (r.earner >= 0) verdict += `<div class="rv-earn">🪙 +1 doubloon for ${nm(r.earner, false)}</div>`;
    if (r.loser >= 0 && isYou(r.loser) && r.coinLost) verdict += `<div class="rv-earn loss">🪙 −1 doubloon from you for losing a die</div>`;
    const rows = s.players.map((p, i) => p.dice.length ? `<div class="rv-row ${i === r.loser ? 'loser' : ''} ${i === r.gainer ? 'gainer' : ''}">${Avatar.render(p.avatar, 38)}<span class="rv-name">${nm(i)}</span><span class="rv-dice">${p.dice.map((d, k) => `<span class="rv-die ${Engine.matches(s, d, r.bid.face) ? 'match' : 'dim'}" style="animation-delay:${(i * 4 + k) * 40}ms">${Dice.render(d, p.kit, 34)}</span>`).join('')}</span></div>` : '').join('');
    let footer;
    if (s.phase === 'over') {
      const w = P(s.winner);
      const btns = G.mode === 'local' ? '<button class="btn primary" id="rv-again">Play Again</button>'
        : G.mode === 'host' ? '<button class="btn primary" id="rv-lobby">Back to Lobby</button>'
        : '<p class="status">Waiting for the captain…</p>';
      footer = `<div class="rv-winner">${Avatar.render(w.avatar, 96)}<h2>${nm(s.winner)} ${vb(s.winner, 'claims', 'claim')} the treasure!</h2></div><div class="rv-btns">${btns}<button class="btn" id="rv-share">📣 ${isYou(s.winner) ? 'Brag' : 'Share'}</button><button class="btn" id="rv-menu">Main Menu</button></div>`;
    } else {
      footer = G.mode === 'client' ? '<p class="status">Next round in <span id="rv-count"></span>s</p>'
        : `<div class="rv-btns"><button class="btn primary" id="rv-next">Next Round${G.nextAt ? ' (<span id="rv-count"></span>)' : ' ⚓'}</button></div>`;
    }
    $('#reveal-body').innerHTML = `${head}${wager}<div class="rv-verdict">${verdict}</div><div class="rv-rows">${rows}</div>${footer}`;
  }
  $('#reveal').addEventListener('click', e => {
    if (e.target.closest('#rv-next')) nextRound();
    else if (e.target.closest('#rv-again')) startLocal(G.players, G.rules);
    else if (e.target.closest('#rv-lobby')) { endGame(); Online.started = false; go('lobby'); hostLobbyBroadcast(); }
    else if (e.target.closest('#rv-menu')) quitGame();
  });

  function tick() {
    const now = Date.now();
    const tl = document.querySelector('.s-bubble.think .tl');
    if (tl && G.s && G.s.phase === 'bidding') tl.textContent = thinkLine(G.s.turn);
    const c = $('#rv-count'); if (c && G.nextAt) c.textContent = Math.max(0, Math.ceil((G.nextAt - now) / 1000));
    const bar = $('#g-timer i');
    if (G.turnDeadline && G.s && G.s.phase === 'bidding') bar.style.width = Math.max(0, (G.turnDeadline - now) / TURN_MS * 100) + '%';
    else bar.style.width = '0';
  }
  setInterval(tick, 250);

  // --- top bar ----------------------------------------------------------------
  function quitGame() {
    if (Online.role) leaveOnline();
    endGame(); go('menu');
  }
  // ☰ game menu: log, sound, fullscreen and leaving (keeps the top bar short on phones)
  const closeGameMenu = () => { $('#game-menu').classList.add('hidden'); $('#g-menu').setAttribute('aria-expanded', 'false'); };
  $('#g-menu').addEventListener('click', e => {
    e.stopPropagation();
    $('#taunt-tray').classList.add('hidden'); $('#item-tray').classList.add('hidden'); $('#admin-tray').classList.add('hidden');
    const open = $('#game-menu').classList.toggle('hidden') === false;
    $('#g-menu').setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', e => { if (!e.target.closest('#game-menu, #g-menu')) closeGameMenu(); });
  $('#g-leave').addEventListener('click', () => {
    closeGameMenu();
    if (G.s && G.s.phase !== 'over' && !confirm('Abandon ship and return to port?')) return;
    quitGame();
  });
  $('#gm-log').addEventListener('click', () => { closeGameMenu(); $('#g-log-btn').click(); });
  $('#g-sound').addEventListener('click', () => { Sfx.toggle(); render(); });
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  const fsOK = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  $('#g-full').addEventListener('click', () => {
    closeGameMenu();
    const de = document.documentElement;
    try {
      if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else (de.requestFullscreen || de.webkitRequestFullscreen).call(de);
    } catch (_) { toast('Fullscreen not supported here — use “Add to Home Screen” instead'); }
  });
  if (!fsOK) $('#g-full').style.display = 'none';      // iPhone Safari has no fullscreen; the home-screen app is fullscreen already

  // --- keyboard ---------------------------------------------------------------
  document.addEventListener('keydown', e => {
    if (current !== 'game' || !G.s || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (!$('#curtain').classList.contains('hidden')) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#curtain-go').click(); } return; }
    if (G.s.phase === 'reveal' && e.key === 'Enter' && G.mode !== 'client') { nextRound(); return; }
    const cs = controlSeat();
    if (G.s.phase !== 'bidding' || cs !== G.s.turn || cs < 0) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowleft') { e.preventDefault(); for (let f = G.sel.face - 1; f >= 1; f--) if (Engine.minQty(G.s, f) != null) { setFace(f); break; } }
    else if (k === 'arrowright') { e.preventDefault(); for (let f = G.sel.face + 1; f <= 6; f++) if (Engine.minQty(G.s, f) != null) { setFace(f); break; } }
    else if (k === 'arrowup') { e.preventDefault(); bumpQty(1); }
    else if (k === 'arrowdown') { e.preventDefault(); bumpQty(-1); }
    else if (/^[1-6]$/.test(k)) { if (Engine.minQty(G.s, Number(k)) != null) setFace(Number(k)); }
    else if (k === 'enter') { e.preventDefault(); $('#c-bid').click(); }
    else if (k === 'l' && G.s.bid) playerAct({ type: 'liar' });
    else if (k === 's' && G.s.bid && G.s.settings.spotOn) playerAct({ type: 'spot' });
  });

  let resizeT;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (G.s && current === 'game') { renderSeats(); renderHand(); } }, 120); });

  // =====================================================================
  //  ACCOUNTS & ADMIN
  // =====================================================================
  const ITEM_IDS = SHOP.filter(x => !x.adminOnly).map(x => x.id);
  const mySeatIdx = () => G.mode === 'local' ? walletSeat() : G.me;
  const showXray = () => Auth.isAdmin && (G.watching && G.xrayFeed || G.xray && (G.mode !== 'client' || G.xrayFeed));

  /** Host: carry out a command from a server-verified admin (checked in hostHandle). */
  function adminCommand(fromId, msg) {
    const seat = Online.seats.find(x => x.id === fromId);
    if (msg.cmd === 'kick' && msg.id && msg.id !== fromId) hostKick(String(msg.id), 'An admin threw ye off the ship.');
    else if (msg.cmd === 'xray' && seat) { seat.xray = !!msg.on; if (G.s && G.mode === 'host') broadcastState(); }
    else if (msg.cmd === 'setDice' && G.s && G.mode === 'host') rigDice(G.s.players.findIndex(p => p.id === fromId), msg.dice);
    else if (msg.cmd === 'setCount' && G.s && G.mode === 'host') setDiceCount(G.s.players.findIndex(p => p.id === fromId), Number(msg.n) | 0);
  }
  /** Admin: change how many dice a seat has (1–10). Mid-round the cup gains or loses dice at once. */
  function setDiceCount(i, n) {
    const s = G.s, p = s && s.players[i];
    if (!p) return false;
    n = Math.max(1, Math.min(10, n | 0));
    p.count = n; p.out = false;
    if (s.phase === 'bidding') {
      while (p.dice.length < n) p.dice.push(1 + Math.floor(Math.random() * 6));
      if (p.dice.length > n) p.dice.length = n;
      p.dice.sort((a, b) => a - b);
    }
    if (G.mode === 'host') broadcastState();
    render();
    return true;
  }
  /** Replace a seat's dice for this round (admin only). */
  function rigDice(i, dice) {
    const s = G.s, p = s && s.players[i];
    if (!p || p.out || s.phase !== 'bidding' || !Array.isArray(dice) || dice.length !== p.dice.length) return false;
    p.dice = dice.map(d => Math.max(1, Math.min(6, d | 0)));
    if (G.mode === 'host') broadcastState();
    render();
    return true;
  }

  // --- in-game 👑 panel ---
  function renderAdminTray() {
    const s = G.s; if (!s) return;
    const me = mySeatIdx(), mine = s.players[me];
    if (!G.rigDraft || G.rigDraft.length !== (mine ? mine.dice.length : 0)) G.rigDraft = mine ? mine.dice.slice() : [];
    const canRig = mine && !mine.out && s.phase === 'bidding' && mine.dice.length;
    const others = G.mode === 'local' ? [] : s.players.map((p, i) => ({ p, i, seat: Online.seats.find(x => x.id === p.id) }))
      .filter(o => o.i !== me && !looksBot(o.p) && !(G.mode === 'client' && o.p.id === 'host'));   // the captain can't be kicked off their own ship
    $('#admin-tray').innerHTML = `
      <div class="tray-head">👑 Admin powers</div>
      <button class="btn admin-btn" id="adm-open-desk">📒 Open Admin Desk</button>
      <label class="adm-row"><input type="checkbox" id="adm-xray" ${G.xray ? 'checked' : ''}> <span><b>X-ray</b> — see everyone's dice</span></label>
      <div class="adm-block"><b>Rig yer dice</b> <small>(tap a die to change it)</small>
        <div class="rig">${canRig ? G.rigDraft.map((d, k) => `<button data-rig="${k}">${Dice.render(d, mine.kit, 34)}</button>`).join('') : '<small>Only during wagering, while ye still have dice.</small>'}</div>
        ${canRig ? '<button class="btn small primary" id="adm-rig-go">Use these dice</button>' : ''}
      </div>
      ${mine ? `<div class="adm-block"><b>Number of dice</b> <small>(1–10, changes yer cup right away)</small>
        <div class="adm-count"><button class="btn small" data-acount="-1" aria-label="Fewer dice">−</button><b>${mine.count}</b><button class="btn small" data-acount="1" aria-label="More dice">+</button></div>
      </div>` : ''}
      ${G.mode === 'local' ? '' : `<div class="adm-block"><b>Players</b>${others.length ? others.map(o => `
        <div class="adm-player"><span>${esc(o.p.name)} <small>${o.seat && o.seat.account ? '✔ account' : 'guest'}</small></span>
          ${o.seat && o.seat.account ? `<button class="btn small" data-adesk="${esc(o.seat.account)}" title="Doubloons &amp; goods">🪙</button>` : ''}
          <button class="btn small" data-akick="${esc(o.p.id)}">Kick</button>
          ${o.seat && o.seat.account ? `<button class="btn small danger" data-aban="${esc(o.p.id)}">Ban</button>` : ''}</div>`).join('') : '<small>No other human pirates aboard.</small>'}</div>`}`;
  }
  $('#g-admin-btn').addEventListener('click', () => {
    $('#taunt-tray').classList.add('hidden'); $('#item-tray').classList.add('hidden');
    G.rigDraft = null; renderAdminTray(); $('#admin-tray').classList.toggle('hidden');
  });
  $('#admin-tray').addEventListener('change', e => {
    if (e.target.id !== 'adm-xray') return;
    G.xray = e.target.checked;
    if (G.mode === 'client') Net.send({ t: 'admin', cmd: 'xray', on: G.xray });
    render();
  });
  $('#admin-tray').addEventListener('click', async e => {
    if (e.target.closest('#adm-open-desk')) { openDesk(); return; }
    const cnt = e.target.closest('[data-acount]');
    if (cnt) {
      const mine = G.s && G.s.players[mySeatIdx()]; if (!mine) return;
      const n = Math.max(1, Math.min(10, mine.count + Number(cnt.dataset.acount)));
      if (G.mode === 'client') Net.send({ t: 'admin', cmd: 'setCount', n });
      else setDiceCount(mySeatIdx(), n);
      setTimeout(() => { G.rigDraft = null; renderAdminTray(); }, G.mode === 'client' ? 400 : 0);
      return;
    }
    const dk = e.target.closest('[data-adesk]'); if (dk) { openDesk(dk.dataset.adesk); return; }
    const rig = e.target.closest('[data-rig]');
    if (rig) { const k = Number(rig.dataset.rig); G.rigDraft[k] = G.rigDraft[k] % 6 + 1; renderAdminTray(); return; }
    if (e.target.closest('#adm-rig-go')) {
      if (G.mode === 'client') Net.send({ t: 'admin', cmd: 'setDice', dice: G.rigDraft });
      else rigDice(mySeatIdx(), G.rigDraft);
      toast('🎲 Dice rigged for this round'); $('#admin-tray').classList.add('hidden');
      return;
    }
    const kick = e.target.closest('[data-akick]');
    const ban = e.target.closest('[data-aban]');
    const id = (kick || ban) && (kick || ban).dataset[kick ? 'akick' : 'aban'];
    if (!id) return;
    const seat = Online.seats.find(x => x.id === id);
    if (ban) {
      if (!seat || !seat.account) return;
      if (!confirm(`Ban ${seat.account}? They won't be able to sign in or join games until unbanned in the Admin Desk.`)) return;
      try { await Auth.admin.setBan(seat.account, true); adminSend(seat.account, 'ban', {}).catch(() => {}); toast(`${seat.account} is banned`); }
      catch (err) { toast(err.message, 4000); return; }
    }
    if (G.mode === 'host') hostKick(id, ban ? 'Ye have been banned from Bones & Brine.' : 'An admin threw ye off the ship.');
    else Net.send({ t: 'admin', cmd: 'kick', id });
    $('#admin-tray').classList.add('hidden');
  });

  // --- Admin Desk (menu): look up any pirate, give/take doubloons and goods, ban/unban ---
  let deskUser = null;
  function renderDesk(r) {
    deskUser = r;
    if (!r) { $('#adm-result').innerHTML = ''; return; }
    $('#adm-result').innerHTML = `
      <div class="adm-card">
        <h3>${esc(r.username)} ${r.is_admin ? '👑' : ''} ${r.banned ? '<span class="tag banned">BANNED</span>' : ''}</h3>
        <small>Joined ${new Date(r.created_at).toLocaleDateString()}</small>
        <div class="adm-line"><span>🪙 <b>${r.coins}</b> doubloons</span>
          ${[-5, -1, 1, 5].map(d => `<button class="btn small" data-coins="${d}">${d > 0 ? '+' : ''}${d}</button>`).join('')}
          <input id="adm-coin-n" type="number" placeholder="±n" style="width:5em"><button class="btn small" data-coins="custom">Apply</button></div>
        ${SHOP.filter(it => !it.adminOnly).map(it => `<div class="adm-line"><span>${it.emoji} ${esc(it.name)}: <b>${(r.inv || {})[it.id] | 0}</b></span>
          <button class="btn small" data-item="${it.id}" data-q="-1">−1</button><button class="btn small" data-item="${it.id}" data-q="1">+1</button></div>`).join('')}
        ${r.is_admin ? '' : `<button class="btn ${r.banned ? 'primary' : 'danger'}" data-ban="${r.banned ? 0 : 1}">${r.banned ? 'Unban' : 'Ban this pirate'}</button>`}
      </div>`;
  }
  async function deskRun(fn, okMsg) {
    $('#adm-status').textContent = 'Working…';
    try {
      await fn();
      renderDesk(await Auth.admin.lookup(deskUser.username));
      $('#adm-status').textContent = okMsg;
      if (Auth.me && deskUser && deskUser.username === Auth.me.username) {   // edited yerself: refresh yer purse
        const fresh = await Auth.restore(); if (fresh) applyAccount(fresh);
      }
    } catch (err) { $('#adm-status').textContent = err.message; }
  }
  async function deskLookup(u) {
    u = String(u || '').trim();
    if (!u) return;
    $('#adm-user').value = u;
    $('#adm-status').textContent = 'Searching…';
    try { const r = await Auth.admin.lookup(u); renderDesk(r); $('#adm-status').textContent = r ? '' : `No pirate called "${u}".`; }
    catch (err) { renderDesk(null); $('#adm-status').textContent = err.message; }
  }
  $('#desk-find').addEventListener('submit', e => { e.preventDefault(); $('#adm-user').blur(); deskLookup($('#adm-user').value); });
  /** Open the Admin Desk pop-up (from the menu or in the middle of a game), optionally on one pirate. */
  function openDesk(username) {
    if (!Auth.isAdmin) return;
    $('#admin-tray').classList.add('hidden');
    // quick picks: the signed-in pirates at this table / in this lobby
    const here = [];
    if (G.s && G.mode !== 'local') G.s.players.forEach(p => { const st = Online.seats.find(x => x.id === p.id); if (st && st.account) here.push(st.account); });
    else if (Online.role) Online.seats.forEach(st => { if (st.account) here.push(st.account); });
    if (Auth.me && !here.includes(Auth.me.username)) here.unshift(Auth.me.username);
    $('#desk-players').innerHTML = here.length ? `<small>At this table:</small>${[...new Set(here)].map(u => `<button class="chip-btn" data-dpick="${esc(u)}">${esc(u)}${Auth.me && u === Auth.me.username ? ' (you)' : ''}</button>`).join('')}` : '';
    $('#adm-status').textContent = '';
    $('#desk-overlay').classList.remove('hidden');
    renderOnline();
    if (username) deskLookup(username);
    else if (!deskUser) setTimeout(() => { if (!Device.touch) $('#adm-user').focus(); }, 60);
  }
  const closeDesk = () => $('#desk-overlay').classList.add('hidden');
  $('#admin-desk-btn').addEventListener('click', () => openDesk());
  $('#desk-close').addEventListener('click', closeDesk);
  $('#desk-overlay').addEventListener('click', e => {
    if (e.target.id === 'desk-overlay') closeDesk();                 // tap outside the sheet
    const pk = e.target.closest('[data-dpick]'); if (pk) deskLookup(pk.dataset.dpick);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#desk-overlay').classList.contains('hidden')) closeDesk(); });
  $('#adm-result').addEventListener('click', e => {
    if (!deskUser) return;
    const c = e.target.closest('[data-coins]'), it = e.target.closest('[data-item]'), b = e.target.closest('[data-ban]');
    if (c) {
      const d = c.dataset.coins === 'custom' ? Number($('#adm-coin-n').value) | 0 : Number(c.dataset.coins);
      if (d) { const u = deskUser.username; deskRun(() => Auth.admin.addCoins(u, d).then(() => liveGift(u, { coins: d })), `${d > 0 ? 'Gave' : 'Took'} ${Math.abs(d)} doubloon(s).`); }
    } else if (it) { const u = deskUser.username, item = it.dataset.item, qty = Number(it.dataset.q); deskRun(() => Auth.admin.giveItem(u, item, qty).then(() => liveGift(u, { item, qty })), 'Goods updated.'); }
    else if (b) {
      const banIt = b.dataset.ban === '1';
      if (banIt && !confirm(`Ban ${deskUser.username}?`)) return;
      const u = deskUser.username; deskRun(() => Auth.admin.setBan(u, banIt).then(() => banIt && adminSend(u, 'ban', {})), banIt ? 'Banned.' : 'Unbanned.');
    }
  });

  // --- sign in / create account ---
  let accTab = 'signin';
  function setAccTab(t) {
    accTab = t;
    $$('#screen-account .tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    $$('#screen-account .signup-only').forEach(el => el.classList.toggle('hidden', t !== 'signup'));
    $('#acc-submit').textContent = t === 'signup' ? 'Create account' : 'Sign in';
    $('#acc-pass').autocomplete = t === 'signup' ? 'new-password' : 'current-password';
    $('#acc-status').textContent = '';
  }
  $$('#screen-account .tab').forEach(b => b.addEventListener('click', () => setAccTab(b.dataset.tab)));
  $('#account-form').addEventListener('submit', async e => {
    e.preventDefault();
    const u = $('#acc-user').value, pw = $('#acc-pass').value;
    if (accTab === 'signup' && pw !== $('#acc-pass2').value) { $('#acc-status').textContent = "The passwords don't match."; return; }
    $('#acc-submit').disabled = true; $('#acc-status').textContent = accTab === 'signup' ? 'Making yer account…' : 'Signing in…';
    try {
      const me = accTab === 'signup' ? await Auth.signUp(u, pw, cloudData()) : await Auth.signIn(u, pw);
      applyAccount(me);
      $('#acc-pass').value = ''; $('#acc-pass2').value = '';
      toast(`Welcome aboard, ${me.username}!${me.is_admin ? ' 👑' : ''}`);
      go('menu');
    } catch (err) { $('#acc-status').textContent = err.message; }
    $('#acc-submit').disabled = false;
  });
  $('#acc-guest').addEventListener('click', () => { store.set('bnb.guestOk', true); go('menu'); });
  onShow.account = () => { setAccTab(accTab); setTimeout(() => $('#acc-user').focus(), 50); };

  /** Load a signed-in account's cloud save into the game. */
  function applyAccount(me) {
    if (!me) return;
    profile.name = cleanName(me.username);
    profile.coins = Math.max(0, me.coins | 0);
    profile.inv = Object.fromEntries(ITEM_IDS.map(k => [k, Math.max(0, ((me.inv || {})[k]) | 0)]));
    const d = me.data || {};
    if (d.avatar) profile.avatar = Avatar.sanitize(d.avatar);
    if (!me.is_admin) profile.avatar = Avatar.stripAdmin(profile.avatar);
    if (Array.isArray(d.kits)) customKits = d.kits.map(Dice.sanitize).filter(Boolean).map(k => ({ ...k, custom: true }));
    if (d.kitId) profile.kitId = d.kitId;
    profile.starterPurse = true;
    store.set('bnb.kits', customKits);
    store.set('bnb.profile', profile);
    if (!d.avatar) Auth.save(cloudData());       // first sign-in on this account: store the pirate
    renderMenuProfile(); renderAccountBar(); renderCoins();
    refreshMyChatStatus();
    if (me.is_admin) refreshReportCount();
    liveTrack(); checkAdminMessages(false);      // gifts sent while away are already in the purse we just loaded
  }
  function renderAccountBar() {
    const bar = $('#account-bar');
    if (!Auth.enabled) bar.innerHTML = '';
    else if (Auth.me) bar.innerHTML = `Signed in as <b>${esc(Auth.me.username)}</b>${Auth.isAdmin ? ' <span class="crown">👑 admin</span>' : ''} · <button class="linkish" id="acc-signout">Sign out</button>`;
    else bar.innerHTML = `Playing as a guest · <button class="linkish" id="acc-open">Sign in / create account</button>`;
    $('#admin-desk-btn').classList.toggle('hidden', !Auth.isAdmin);
    $('#g-admin-btn').classList.toggle('hidden', !Auth.isAdmin);
    renderDaily();
  }
  $('#account-bar').addEventListener('click', async e => {
    if (e.target.closest('#acc-open')) go('account');
    if (e.target.closest('#acc-signout')) {
      if (Online.role) leaveOnline();
      await Auth.signOut();
      store.set('bnb.guestOk', false);
      profile.name = randomName(); profile.starterPurse = true; profile.coins = 5;
      profile.inv = Object.fromEntries(ITEM_IDS.map(k => [k, 0]));
      store.set('bnb.profile', profile);
      renderMenuProfile(); renderAccountBar();
      toast('Signed out — fair winds!');
      go('account');
    }
  });

  // =====================================================================
  //  CHAT (online lobbies and tables) with server-side timeouts
  // =====================================================================
  const ChatUI = { msgs: [], unread: 0, mutedUntil: 0, strikes: 0, last: 0 };
  const fmtLeft = ms => { const s = Math.ceil(ms / 1000); if (s >= 3600) return Math.ceil(s / 3600) + ' h'; if (s >= 60) return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); return s + ' s'; };
  const fmtSpan = ms => ms >= 3600000 ? Math.round(ms / 3600000) + ' hours' : ms >= 60000 ? Math.round(ms / 60000) + ' minutes' : Math.round(ms / 1000) + ' seconds';
  function resetChat() { ChatUI.msgs = []; ChatUI.unread = 0; renderChat(); }
  async function refreshMyChatStatus() {
    if (!Auth.me) return;
    try { const st = await Auth.chatStatus(); ChatUI.mutedUntil = st.muted_until ? Date.parse(st.muted_until) : 0; ChatUI.strikes = st.strikes | 0; } catch (_) {}
    renderChatNote();
  }
  async function sendChat(raw) {
    raw = String(raw || '').trim();
    if (!raw || !Online.role) return false;
    if (!Auth.me) { toast('Sign in to chat — it keeps the seas clean'); return false; }
    if (Date.now() < ChatUI.mutedUntil) { toast(`🔇 Ye be timed out from chat for ${fmtLeft(ChatUI.mutedUntil - Date.now())}`); return false; }
    if (Date.now() - ChatUI.last < 1200) { toast('Easy there — one message at a time'); return false; }
    ChatUI.last = Date.now();
    const c = Chat.censor(raw);
    if (c.flagged) {
      try {
        const r = await Auth.recordStrike(raw, c.text);
        ChatUI.strikes = r.strikes | 0;
        ChatUI.mutedUntil = r.muted_until ? Date.parse(r.muted_until) : Date.now() + 30000;
        toast(`🤬 Watch yer tongue! Strike ${ChatUI.strikes}: chat timeout for ${fmtSpan(ChatUI.mutedUntil - Date.now())}.`, 6000);
        if (ChatUI.strikes >= 5) setTimeout(() => toast('Yer censored messages have been sent to the admin for review.', 6000), 1200);
      } catch (err) { ChatUI.mutedUntil = Date.now() + 30000; }
    }
    if (Online.role === 'client') Net.send({ t: 'chat', text: c.text });
    else hostChat('host', c.text);
    renderChatNote();
    return true;
  }
  /** Host: check, clean and pass on a chat message to everyone at the table. */
  async function hostChat(fromId, text) {
    const seat = Online.seats.find(x => x.id === fromId); if (!seat || !text.trim()) return;
    const now = Date.now();
    if (fromId !== 'host') {
      if (!seat.account) return;                                   // guests can read but not talk
      if (now - (seat.lastChat || 0) < 1000) return;              // flood guard
      seat.lastChat = now;
      if (!seat.chatCheckAt || now - seat.chatCheckAt > 15000) {   // timeouts are kept on the server
        try { const st = await Auth.chatStatus(seat.uid); seat.mutedUntil = st.muted_until ? Date.parse(st.muted_until) : 0; } catch (_) {}
        seat.chatCheckAt = now;
      }
      if (seat.mutedUntil > now) return;
    }
    const clean = Chat.censor(text.slice(0, 200));                 // censored again here, whatever the sender's game did
    if (clean.flagged) seat.chatCheckAt = 0;                       // re-check their timeout on the next message
    const msg = { t: 'chat', id: fromId, from: seat.name, account: seat.account || null, admin: !!seat.admin, text: clean.text, ts: now };
    Net.broadcast(msg);
    addChat(msg);
    crewReply(fromId, clean.text);
  }

  // --- Quick Game crewmates chat a little, like people do (host only; always clean, never spammy) ---
  const CREW_LINES = {
    hello: ['hi', 'hey', 'yo', 'ahoy', 'hi all', 'hello', 'hey guys', 'servus', 'hii', 'o/'],
    start: ['gl', 'gl hf', 'glhf', 'good luck', 'gl all', 'lets go', 'gl everyone', 'viel glück'],
    called: ['called it', 'knew it', 'lol', 'ha', 'nope', 'not today', 'caught ya', 'too greedy', 'hehe', 'easy'],
    lost: ['nooo', 'bruh', 'how', 'rip', 'unlucky', 'ugh', 'wow ok', 'no way', 'what', 'damn dice', 'na toll', 'fair'],
    held: ['told ya', 'ha', 'it was real lol', 'should have believed me', 'shouldve trusted me', 'nope its there'],
    out: ['gg', 'im out gg', 'rip me', 'gg wp', 'well that was quick', 'gg all'],
    over: ['gg', 'gg wp', 'ggs', 'gg all', 'nice one', 'gg that was close', 'wp', 'gg!', 'gut gespielt', 'again?'],
    winner: ['gg', 'ez', 'gg wp', 'lets gooo', 'ggs', 'yesss', 'gg all']
  };
  function crewSay(seat, text) {
    if (Online.role !== 'host' || !seat || !seat.account) return;    // guests can't talk, crewmates included
    const now = Date.now();
    if (now - (seat.lastSaid || 0) < 15000) return;
    seat.lastSaid = now;
    if (Math.random() < 0.15) text = text.replace(/[aeiou]/, m => m + m);  // the odd stretched letter
    const msg = { t: 'chat', id: seat.id, from: seat.name, account: seat.account, admin: false, text, ts: now };
    Net.broadcast(msg); addChat(msg);
  }
  const crewSeats = () => Online.role === 'host' ? Online.seats.filter(x => x.bot && x.bot.disguise && x.account) : [];
  function crewMaybe(seat, kind, chance, delay = 900 + Math.random() * 2600) {
    if (!seat || Math.random() > chance * (0.4 + (seat.bot.chatty || 0))) return;
    setTimeout(() => crewSay(Online.seats.find(x => x.id === seat.id), pick(CREW_LINES[kind])), delay);
  }
  /** One crewmate (at most) reacts to a reveal. */
  function crewReveal(r) {
    if (!G.s || Online.role !== 'host') return;
    const seatOf = i => i >= 0 && G.s.players[i] ? crewSeats().find(x => x.id === G.s.players[i].id) : null;
    const opts = [];
    if (r.loser >= 0 && seatOf(r.loser)) opts.push([seatOf(r.loser), r.eliminated ? 'out' : 'lost', r.eliminated ? 0.7 : 0.35]);
    if (r.earner >= 0 && seatOf(r.earner)) opts.push([seatOf(r.earner), r.type === 'liar' && r.earner === r.caller ? 'called' : 'held', 0.3]);
    if (!opts.length) return;
    const [seat, kind, chance] = pick(opts);
    crewMaybe(seat, kind, chance);
    if (G.s.phase === 'over') {
      const w = seatOf(G.s.winner);
      crewSeats().forEach(x => crewMaybe(x, x === w ? 'winner' : 'over', 0.55, 2500 + Math.random() * 4000));
    }
  }
  function crewReply(fromId, text) {
    if (!crewSeats().length || String(fromId).startsWith('p-')) return;
    const t = text.toLowerCase();
    let kind = null;
    if (/\b(hi|hey|hello|ahoy|yo|moin|servus|hallo)\b/.test(t)) kind = 'hello';
    else if (/\b(gg|good game)\b/.test(t)) kind = 'over';
    else if (/\b(gl|good luck)\b/.test(t)) kind = 'start';
    if (!kind) return;
    const cands = crewSeats().filter(x => Math.random() < 0.6);
    if (cands.length) crewMaybe(pick(cands), kind, 0.8, 1500 + Math.random() * 3500);
  }
  function addChat(m) {
    const msg = { id: String(m.id || ''), from: cleanName(m.from), account: m.account ? String(m.account).slice(0, 16) : null, admin: !!m.admin,
      text: Chat.censor(String(m.text || '')).text, ts: Number(m.ts) || Date.now() };
    ChatUI.msgs.push(msg); if (ChatUI.msgs.length > 120) ChatUI.msgs.shift();
    const mine = msg.id === (Online.role === 'host' ? 'host' : Online.myId);
    if (!mine && current === 'game' && $('#game-chat').classList.contains('hidden')) ChatUI.unread++;
    if (!mine && current === 'game' || mine) Sfx.click();
    if (G.s && current === 'game') {                                // speech bubble over the speaker's seat
      const i = G.s.players.findIndex(p => p.id === msg.id);
      if (i >= 0) { G.chatBubbles = G.chatBubbles || {}; G.chatBubbles[i] = { text: msg.text, until: Date.now() + 4500 }; renderSeats(); setTimeout(() => { if (G.s) renderSeats(); }, 4600); }
    }
    renderChat();
  }
  function renderChat() {
    const myId = Online.role === 'host' ? 'host' : Online.myId;
    const html = ChatUI.msgs.length ? ChatUI.msgs.map(m => {
      const mine = m.id === myId;
      return `<p class="cl${mine ? ' mine' : ''}${m.admin ? ' adm' : ''}"><b>${m.admin ? '👑 ' : ''}${mine ? 'You' : esc(m.from)}</b> ${esc(m.text)}${!mine ? `<button class="cl-rep" type="button" data-rep="${esc(m.id)}" title="Report">⚑</button>` : ''}</p>`;
    }).join('') : '<p class="cl-empty">No messages yet. Say ahoy!</p>';
    $$('[data-chat] .chat-log').forEach(log => {
      const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
      log.innerHTML = html;
      if (atBottom) log.scrollTop = log.scrollHeight;
    });
    $('#g-chat-badge').classList.toggle('hidden', !ChatUI.unread);
    $('#g-chat-badge').textContent = ChatUI.unread > 9 ? '9+' : ChatUI.unread || '';
    renderChatNote();
  }
  function renderChatNote() {
    const muted = Date.now() < ChatUI.mutedUntil;
    $$('[data-chat]').forEach(box => {
      const input = box.querySelector('.chat-input'), btn = box.querySelector('.chat-form button'), note = box.querySelector('.chat-note');
      const can = !!Auth.me && !muted;
      input.disabled = !can; btn.disabled = !can;
      input.placeholder = !Auth.me ? 'Sign in to chat' : muted ? 'Timed out…' : 'Say something, matey…';
      note.textContent = !Auth.me ? 'Guests can read the chat — sign in to talk.' : muted ? `🔇 Timed out for bad language: ${fmtLeft(ChatUI.mutedUntil - Date.now())} left (strike ${ChatUI.strikes})` : '';
      note.classList.toggle('warn', muted);
    });
  }
  $$('[data-chat] .chat-form').forEach(f => f.addEventListener('submit', async e => {
    e.preventDefault();
    const input = f.querySelector('.chat-input');
    if (await sendChat(input.value)) input.value = '';
  }));
  $$('[data-chat] .chat-log').forEach(log => log.addEventListener('click', e => {
    const b = e.target.closest('[data-rep]'); if (b) openReport(b.dataset.rep);
  }));
  $('#g-chat-btn').addEventListener('click', () => {
    $('#taunt-tray').classList.add('hidden'); $('#item-tray').classList.add('hidden'); $('#admin-tray').classList.add('hidden');
    const box = $('#game-chat'); box.classList.toggle('hidden');
    if (!box.classList.contains('hidden')) { ChatUI.unread = 0; renderChat(); const log = box.querySelector('.chat-log'); log.scrollTop = log.scrollHeight; if (!Device.touch) box.querySelector('.chat-input').focus(); }
  });
  $('#game-chat-close').addEventListener('click', () => $('#game-chat').classList.add('hidden'));
  setInterval(() => { if (ChatUI.mutedUntil && Online.role) renderChatNote(); }, 1000);

  // =====================================================================
  //  REPORTS
  // =====================================================================
  let reportTarget = null;
  function reportCandidates() {
    const myId = Online.role === 'host' ? 'host' : Online.myId;
    return Online.seats.filter(x => !x.bot && x.id !== myId).map(x => ({ id: x.id, name: x.name, account: x.account }));
  }
  function openReport(id) {
    if (!Auth.me) { toast('Sign in to report a player'); return; }
    const list = reportCandidates();
    if (!list.length) { toast('No other pirates here to report'); return; }
    $('#rep-who').innerHTML = list.map(x => `<option value="${esc(x.id)}" ${x.id === id ? 'selected' : ''}>${esc(x.name)}${x.account ? '' : ' (guest)'}</option>`).join('');
    $('#rep-details').value = ''; $('#rep-status').textContent = '';
    updateEvidenceNote();
    $('#report-overlay').classList.remove('hidden');
    $('#game-menu').classList.add('hidden');
  }
  function evidenceFor(id) {
    return ChatUI.msgs.filter(m => m.id === id).slice(-30).map(m => ({ at: new Date(m.ts).toISOString(), said: m.text }));
  }
  function updateEvidenceNote() {
    const n = evidenceFor($('#rep-who').value).length;
    $('#rep-evidence-note').textContent = n ? `Their last ${n} chat message${n > 1 ? 's' : ''} will be attached for the admin.` : 'No chat messages from them to attach.';
  }
  $('#rep-who').addEventListener('change', updateEvidenceNote);
  $('#report-close').addEventListener('click', () => $('#report-overlay').classList.add('hidden'));
  $('#report-overlay').addEventListener('click', e => { if (e.target.id === 'report-overlay') $('#report-overlay').classList.add('hidden'); });
  $('#report-form').addEventListener('submit', async e => {
    e.preventDefault();
    const target = reportCandidates().find(x => x.id === $('#rep-who').value); if (!target) return;
    $('#rep-send').disabled = true; $('#rep-status').textContent = 'Sending…';
    try {
      await Auth.submitReport(target.account || target.name, $('#rep-reason').value,
        ($('#rep-details').value || '') + (target.account ? '' : ' [reported player was a guest]'), evidenceFor(target.id));
      $('#report-overlay').classList.add('hidden');
      toast(`⚑ Report sent. The admin will review what ${target.name} did. Thank ye!`, 5000);
    } catch (err) { $('#rep-status').textContent = err.message; }
    $('#rep-send').disabled = false;
  });
  $('#gm-report').addEventListener('click', () => openReport(null));
  $('#lobby-seats').addEventListener('click', e => { const b = e.target.closest('[data-lrep]'); if (b) openReport(b.dataset.lrep); });

  // --- Admin Desk: Reports tab ---
  function setDeskTab(t) {
    $$('.desk-tabs .tab').forEach(b => b.classList.toggle('on', b.dataset.dtab === t));
    $('#desk-pane-reports').hidden = t !== 'reports';
    $('#desk-pane-pirates').hidden = t !== 'pirates';
    $('#desk-pane-online').hidden = t !== 'online';
    if (t === 'reports') loadReports();
    if (t === 'online') renderOnline();
  }

  // =====================================================================
  //  WHO'S ONLINE (Supabase Realtime presence) + live admin messages
  // =====================================================================
  const Live = { ch: null, key: 'v' + Math.random().toString(36).slice(2, 10), since: Date.now(), timer: null, open: new Set() };
  const WHERE = { menu: 'Main menu', queue: 'In the Quick Game queue', lobby: 'In a lobby', game: 'Playing', locker: 'Captain\'s Locker',
    forge: 'Dice Forge', shop: 'The Tavern', board: 'Leaderboard', rules: 'How to Play', local: 'Setting up Pass & Play', online: 'Online Voyage', account: 'Signing in' };
  function liveInfo() {
    let where = WHERE[current] || current;
    if (current === 'game' && G.s) {
      const kind = G.mode === 'local' ? (G.s.players.some(p => p.bot && p.bot.disguise) ? 'Quick Game (offline)' : 'Pass & Play') : G.s.players.some(p => p.bot && p.bot.disguise) ? 'Quick Game' : G.mode === 'host' ? 'online (captain)' : 'online';
      where = `Playing ${kind} · ${G.s.players.length} seats · round ${G.s.round}`;
    } else if (current === 'lobby' && Online.code) where = `In lobby ${Online.code} (${Online.seats.length} aboard)`;
    if (G.watching) where = 'Watching a table (admin)';
    // the table they're at: who's playing, the current wager, their own dice count (never their dice faces)
    let game = null;
    if (current === 'game' && G.s && !G.watching) {
      const s = G.s, me = walletSeat();
      game = { mode: G.mode, round: s.round, phase: s.phase, watchable: G.mode !== 'local',
        bid: s.bid ? `${s.bid.qty} × ${s.bid.face}s by ${s.players[s.bid.by] ? s.players[s.bid.by].name : '?'}` : null,
        turn: s.phase === 'bidding' && s.players[s.turn] ? s.players[s.turn].name : null,
        seats: s.players.map((p, i) => ({ n: String(p.name).slice(0, 16), d: p.count != null ? p.count : p.dice.length, me: i === me, out: !!p.out })) };
    }
    return { name: profile.name, account: Auth.me ? Auth.me.username : null, admin: Auth.isAdmin, where, room: Online.code || null,
      coins: profile.coins, inv: Object.fromEntries(Object.entries(profile.inv || {}).filter(([, v]) => v > 0)),
      since: Live.since, mobile: document.body.classList.contains('mobile'), device: deviceLine(), game, act: ActLog.slice(-8) };
  }
  /** "Chrome · Android · 412×915 · de" — enough to tell players apart, nothing identifying. */
  function deviceLine() {
    const ua = navigator.userAgent;
    const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox\//.test(ua) ? 'Firefox'
      : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    const os = /iPhone/.test(ua) ? 'iPhone' : /iPad|Macintosh/.test(ua) && navigator.maxTouchPoints > 1 ? 'iPad' : /Android/.test(ua) ? 'Android'
      : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : '';
    const app = window.matchMedia && matchMedia('(display-mode: standalone)').matches ? ' · installed app' : '';
    return [browser, os, `${screen.width}×${screen.height}`, (navigator.language || '').slice(0, 5)].filter(Boolean).join(' · ') + app;
  }
  function liveStart() {
    if (!Auth.enabled || !Auth.client || Live.ch) return;
    const ch = Auth.client.channel('bnb-online-v1', { config: { presence: { key: Live.key }, broadcast: { self: false } } });
    Live.ch = ch;
    ch.on('presence', { event: 'sync' }, () => { if (Auth.isAdmin) renderOnline(); });
    ch.on('broadcast', { event: 'nudge' }, ({ payload }) => { if (Auth.me && payload && payload.to === Auth.me.username) checkAdminMessages(true); });
    ch.subscribe(status => { if (status === 'SUBSCRIBED') liveTrack(); });
  }
  let liveLast = '';
  function liveTrack() {
    if (!Live.ch) return;
    if (!Auth.client.getChannels().includes(Live.ch)) { Live.ch = null; liveLast = ''; liveStart(); return; }   // dropped somehow: rejoin
    // Supabase closes the channel if presence updates come too fast, so send at most one every 15 s
    const wait = 15000 - (Date.now() - (Live.sentAt || 0));
    if (wait > 0) { if (!Live.later) Live.later = setTimeout(() => { Live.later = null; liveTrack(); }, wait); return; }
    const info = liveInfo(), sig = JSON.stringify(info);
    if (sig === liveLast) return;
    liveLast = sig; Live.sentAt = Date.now();
    Live.ch.track(info).catch(() => {});
  }
  setInterval(liveTrack, 5000);
  function onlineList() {
    if (!Live.ch) return [];
    return Object.entries(Live.ch.presenceState()).map(([key, metas]) => ({ key, ...(metas[metas.length - 1] || {}) }))
      .sort((a, b) => (b.admin - a.admin) || (!!b.account - !!a.account) || String(a.account || a.name).localeCompare(String(b.account || b.name)));
  }
  function renderOnline() {
    if (!Auth.isAdmin) return;
    const list = onlineList();
    $('#desk-online-count').textContent = list.length;
    if ($('#desk-pane-online').hidden || $('#desk-overlay').classList.contains('hidden')) return;
    const signed = list.filter(x => x.account).length, playing = list.filter(x => /^Playing/.test(x.where || '')).length;
    $('#online-sum').innerHTML = `<b>${list.length}</b> online now · ${signed} signed in · ${list.length - signed} guest${list.length - signed === 1 ? '' : 's'} · ${playing} at a table`;
    const ago = t => { const m = Math.floor((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; };
    const clock = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    $('#online-list').innerHTML = list.length ? list.map(x => {
      const me = x.key === Live.key, g = x.game;
      const inv = Object.entries(x.inv || {}).map(([k, v]) => `${(shopItem(k) || {}).emoji || ''} ${v}`).join(' ');
      const table = g ? `<div class="on-sec"><b>At the table</b> · round ${g.round | 0}${g.phase === 'reveal' ? ' · cups lifted' : g.phase === 'over' ? ' · game over' : ''}
          ${g.bid ? `<br>Wager: ${esc(g.bid)}` : ''}${g.turn ? `<br>Turn: ${esc(g.turn)}` : ''}
          <div class="on-seats">${(g.seats || []).map(p => `<span class="${p.me ? 'me' : ''} ${p.out ? 'out' : ''}">${esc(cleanName(p.n))} 🎲${p.d | 0}</span>`).join('')}</div></div>` : '';
      const acts = (x.act || []).slice().reverse().map(a => `<li><small>${clock(a.at)}</small> ${esc(a.text)}</li>`).join('');
      const canWatch = !me && x.room && (!g || g.watchable);
      return `<details class="on-row" data-okey="${esc(x.key)}" ${Live.open.has(x.key) ? 'open' : ''}>
        <summary><span class="on-dot"></span>
          <span class="on-main"><b>${x.admin ? '👑 ' : ''}${esc(cleanName(x.account || x.name || '?'))}${me ? ' (you)' : ''}</b>
            <small>${x.account ? '' : 'Guest · '}${esc(x.where || '')}${x.mobile ? ' · 📱' : ''} · on ${ago(x.since || Date.now())}</small></span>
          <span class="on-more">▾</span></summary>
        <div class="on-body">
          <div class="on-sec"><b>Device</b> ${esc(x.device || '?')}</div>
          <div class="on-sec"><b>Purse</b> 🪙 ${x.coins | 0}${inv ? ` · ${inv}` : ''}</div>
          ${table}
          ${acts ? `<div class="on-sec"><b>Recent activity</b><ul class="on-acts">${acts}</ul></div>` : ''}
          <div class="on-btns">
            ${canWatch ? `<button class="btn small primary" data-owatch="${esc(x.room)}" title="Spectate their table — they can't see you">👁 Watch</button>` : ''}
            ${x.account && !me ? `
            <button class="btn small" data-ogift="${esc(x.account)}" title="Gift 5 doubloons">🎁 +5</button>
            <button class="btn small" data-oman="${esc(x.account)}" title="Gifts, goods, ban…">Manage</button>
            <button class="btn small" data-okick="${esc(x.account)}" title="Send them back to the main menu">Kick</button>
            ${x.admin ? '' : `<button class="btn small danger" data-oban="${esc(x.account)}">Ban</button>`}` : ''}
            ${x.room && !me && !g ? `<button class="btn small" data-ojoin="${esc(x.room)}">Join their lobby</button>` : ''}
          </div>
        </div>
      </details>`;
    }).join('') : '<p class="hint">Connecting…</p>';
  }
  // remember which rows are opened across refreshes
  $('#online-list').addEventListener('toggle', e => {
    const d = e.target.closest('[data-okey]'); if (!d) return;
    if (d.open) Live.open.add(d.dataset.okey); else Live.open.delete(d.dataset.okey);
  }, true);
  /** Admin: spectate the table hosted under this room code. */
  function startWatch(code) {
    if (!Auth.isAdmin) return;
    closeDesk(); leaveQueue();
    if (Online.role) leaveOnline();
    if (G.s) endGame();
    toast('👁 Rowing out to watch…');
    Net.join(String(code).toUpperCase(), async () => {
      Online.role = 'client'; Online.code = String(code).toUpperCase(); Online.watch = true;
      let token = null;
      try { token = await Auth.token(); } catch (_) {}
      Net.send({ t: 'watch', token });
      logAct('Started watching a table');
    }, err => { toast(Net.describe(err), 4000); leaveOnline(); go('menu'); });
  }
  $('#watch-leave').addEventListener('click', () => { leaveOnline(); endGame(); go('menu'); openDesk(); setDeskTab('online'); });

  /** Leave a message for a player and nudge their open game to collect it. */
  async function adminSend(user, cmd, payload) {
    await Auth.admin.notify(user, cmd, payload);
    if (Live.ch) Live.ch.send({ type: 'broadcast', event: 'nudge', payload: { to: String(user).toLowerCase() } });
  }
  /** After a Desk gift, update that player's open game too (not needed for yerself: the Desk reloads yer purse). */
  const liveGift = (u, payload) => (Auth.me && u === Auth.me.username) ? Promise.resolve() : adminSend(u, 'gift', payload).catch(err => console.warn('live gift', err));
  $('#online-list').addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    try {
      if (d.oman) { setDeskTab('pirates'); deskLookup(d.oman); }
      else if (d.ogift) {
        await Auth.admin.addCoins(d.ogift, 5); await adminSend(d.ogift, 'gift', { coins: 5 });
        $('#adm-status').textContent = `🎁 Gave ${d.ogift} 5 doubloons.`;
      } else if (d.okick) {
        if (!confirm(`Kick ${d.okick} back to the main menu?`)) return;
        await adminSend(d.okick, 'kick', {}); $('#adm-status').textContent = `Kicked ${d.okick}.`;
      } else if (d.oban) {
        if (!confirm(`Ban ${d.oban}? They're signed out right away and can't sign in until unbanned.`)) return;
        await Auth.admin.setBan(d.oban, true); await adminSend(d.oban, 'ban', {});
        $('#adm-status').textContent = `${d.oban} is banned.`;
      } else if (d.owatch) {
        startWatch(d.owatch);
      } else if (d.ojoin) {
        closeDesk(); if (Online.role) leaveOnline(); if (G.s) endGame();
        go('online'); $('#join-code').value = d.ojoin; doJoin();
      }
    } catch (err) { $('#adm-status').textContent = err.message; }
  });
  setInterval(() => { if (Auth.isAdmin && !$('#desk-overlay').classList.contains('hidden')) renderOnline(); }, 15000);

  /** Gifts, kicks and bans from the admin. `live` = we were online when it was sent (apply gift amounts). */
  async function checkAdminMessages(live) {
    if (!Auth.me) return;
    let msgs = [];
    try { msgs = await Auth.takeMessages(); } catch (_) { return; }
    for (const m of msgs) {
      const p = m.payload || {};
      if (m.cmd === 'gift') {
        // the server already holds the gift; while online we add it here too so our next save keeps it
        if (live) {
          if (p.coins) profile.coins = Math.max(0, profile.coins + (p.coins | 0));
          if (p.item && ITEM_IDS.includes(p.item)) profile.inv[p.item] = Math.max(0, (profile.inv[p.item] | 0) + (p.qty | 0));
          saveProfile(); renderCoins();
        }
        const what = p.coins ? `${p.coins > 0 ? '+' : ''}${p.coins} doubloon${Math.abs(p.coins) === 1 ? '' : 's'}` : p.item ? `${p.qty > 0 ? '+' : ''}${p.qty} ${(shopItem(p.item) || {}).name || p.item}` : 'a gift';
        Sfx.coin(); toast(`👑 The admin sent ye ${what}!`, 5000);
      } else if (m.cmd === 'kick') {
        leaveQueue(); if (Online.role) leaveOnline(); if (G.s) endGame();
        go('menu'); toast('👑 An admin sent ye back to the main menu.', 6000);
      } else if (m.cmd === 'ban') {
        const fresh = await Auth.restore().catch(() => null);
        if (fresh && fresh.banned) {
          leaveQueue(); if (Online.role) leaveOnline(); if (G.s) endGame();
          await Auth.signOut(); renderAccountBar(); go('account'); toast('This account has been banned.', 8000);
        }
      }
    }
  }
  $$('.desk-tabs .tab').forEach(b => b.addEventListener('click', () => setDeskTab(b.dataset.dtab)));
  $('#rep-filter').addEventListener('change', loadReports);
  $('#rep-refresh').addEventListener('click', loadReports);
  async function loadReports() {
    $('#rep-list').innerHTML = '<p class="hint">Loading…</p>';
    try {
      const rows = await Auth.admin.reports($('#rep-filter').value);
      $('#rep-list').innerHTML = rows.length ? rows.map(r => `
        <div class="rep-card ${r.kind === 'chat_auto' ? 'auto' : ''}" data-rid="${r.id}">
          <div class="rep-top"><b>${r.kind === 'chat_auto' ? '🤬 Chat filter' : '⚑ Report'}: ${esc(r.reported)}</b><small>${new Date(r.created_at).toLocaleString()}</small></div>
          <div><span class="tag">${esc(r.reason)}</span> ${r.kind === 'player' ? `from <b>${esc(r.reporter || '?')}</b>` : ''}</div>
          ${r.details ? `<p class="rep-details">${esc(r.details)}</p>` : ''}
          ${(r.evidence || []).length ? `<details><summary>${r.evidence.length} message${r.evidence.length > 1 ? 's' : ''} as evidence</summary>
            <ul class="rep-ev">${r.evidence.map(e => `<li><small>${e.at ? new Date(e.at).toLocaleString() : ''}</small> “${esc(e.said || '')}”</li>`).join('')}</ul></details>` : ''}
          <div class="rep-actions">
            <button class="btn small" data-rlook="${esc(r.reported)}">🔎 Look up</button>
            ${r.status === 'open' ? `<button class="btn small danger" data-rban="${esc(r.reported)}">Ban</button>
              <button class="btn small primary" data-rres="reviewed">✔ Reviewed</button><button class="btn small" data-rres="dismissed">Dismiss</button>`
              : `<small>${esc(r.status)}</small><button class="btn small" data-rres="open">Reopen</button>`}
          </div>
        </div>`).join('') : '<p class="hint">Nothing here. Calm seas! ⛵</p>';
    } catch (err) { $('#rep-list').innerHTML = `<p class="status">${esc(err.message)}</p>`; }
    refreshReportCount();
  }
  $('#rep-list').addEventListener('click', async e => {
    const card = e.target.closest('[data-rid]'); if (!card) return;
    const id = Number(card.dataset.rid);
    const look = e.target.closest('[data-rlook]'), ban = e.target.closest('[data-rban]'), res = e.target.closest('[data-rres]');
    try {
      if (look) { setDeskTab('pirates'); deskLookup(look.dataset.rlook); return; }
      if (ban) {
        if (!confirm(`Ban ${ban.dataset.rban}?`)) return;
        await Auth.admin.setBan(ban.dataset.rban, true);
        await Auth.admin.resolve(id, 'reviewed');
        toast(`${ban.dataset.rban} is banned`);
      }
      if (res) await Auth.admin.resolve(id, res.dataset.rres);
      loadReports();
    } catch (err) { toast(err.message, 4000); }
  });
  async function refreshReportCount() {
    if (!Auth.isAdmin) return;
    let n = 0;
    try { n = await Auth.admin.reportCount(); } catch (_) {}
    $('#desk-report-count').textContent = n; $('#desk-report-count').classList.toggle('hidden', !n);
    $('#admin-desk-btn').textContent = n ? `👑 Admin Desk · 📥 ${n} new` : '👑 Admin Desk';
    $('#g-admin-btn').classList.toggle('has-news', !!n);
  }
  setInterval(() => { if (Auth.isAdmin) refreshReportCount(); }, 60000);

  // =====================================================================
  //  QUICK GAME: a matchmaking queue over Supabase Realtime
  // =====================================================================
  const QUICK_SIZE = 4, GATHER_MS = 7000;
  const Quick = { ch: null, key: null, joinedAt: 0, matched: false, timer: null, joinTimer: null };
  async function startQuick() {
    if (!Auth.enabled || !Auth.client) { toast('Quick Game needs the online server'); return; }
    if (!Net.available()) { toast('Online play is not available here (offline?)'); return; }
    leaveQueue();
    if (Online.role) leaveOnline();
    logAct('Joined the Quick Game queue');
    Object.assign(Quick, { joinedAt: Date.now(), matched: false, active: true, soloMs: 6000 + Math.random() * 9000 });
    go('queue');
    $('#q-title').textContent = 'Searching the seas…'; $('#q-sub').textContent = 'Looking for pirates to play with';
    $('#q-bots').classList.add('hidden');
    const me = () => ({ name: profile.name, at: Quick.joinedAt, admin: Auth.isAdmin });
    // The queue channel is opened once and kept: closing a channel in supabase-js can also drop the
    // "who's online" channel, so leaving the queue only withdraws our presence from it.
    if (!Quick.ch) {
      Quick.key = 'q' + Math.random().toString(36).slice(2, 10);
      const ch = Auth.client.channel('bnb-quickplay-v1', { config: { presence: { key: Quick.key }, broadcast: { self: false } } });
      Quick.ch = ch;
      ch.on('presence', { event: 'sync' }, quickTick);
      ch.on('broadcast', { event: 'match' }, ({ payload }) => onQuickMatch(payload));
      ch.subscribe(async status => {
        Quick.subscribed = status === 'SUBSCRIBED';
        if (Quick.subscribed && Quick.active) await ch.track(me());
        if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && Quick.active) $('#q-sub').textContent = 'Having trouble reaching the queue — still trying…';
      });
    } else if (Quick.subscribed) Quick.ch.track(me());
    Quick.timer = setInterval(quickTick, 1000);
  }
  function queueList() {
    if (!Quick.ch) return [];
    const st = Quick.ch.presenceState();
    return Object.entries(st).map(([key, metas]) => ({ key, ...(metas[0] || {}) }))
      .filter(x => x.at).sort((a, b) => a.at - b.at || (a.key < b.key ? -1 : 1));
  }
  function quickTick() {
    if (!Quick.ch || !Quick.active || Quick.matched || current !== 'queue') return;
    const list = queueList();
    const n = Math.max(1, list.length);
    $('#q-count').textContent = n;
    $('#q-count-label').textContent = n === 1 ? 'pirate in the queue' : 'pirates in the queue';
    $('#q-names').innerHTML = list.slice(0, 8).map(x => `<span class="chip-btn${x.key === Quick.key ? ' on' : ''}">${x.admin ? '👑 ' : ''}${esc(cleanName(x.name))}</span>`).join('');
    const waited = Date.now() - Quick.joinedAt;
    $('#q-time').textContent = `${Math.floor(waited / 60000)}:${String(Math.floor(waited / 1000) % 60).padStart(2, '0')}`;
    // Nobody else about? After a short, natural-feeling wait we crew up anyway; the seats fill as pirates "board".
    if (list.length < 2 && waited > Quick.soloMs) { formQuickMatch([{ key: Quick.key }]); return; }
    // The longest-waiting pirate captains the match once there are 4, or 2+ have waited a few seconds.
    if (list.length >= 2 && list[0].key === Quick.key && (list.length >= QUICK_SIZE || Date.now() - list[1].at > GATHER_MS)) formQuickMatch(list.slice(0, QUICK_SIZE));
  }
  function formQuickMatch(group) {
    Quick.matched = true;
    $('#q-title').textContent = 'Crew found! ⚓'; $('#q-sub').textContent = 'Hoisting the flag…';
    const solo = group.length < 2;
    Net.host(code => {
      Online.role = 'host'; Online.code = code; Online.started = false; Online.rules = { ...savedRules };
      Online.seats = [{ id: 'host', ...myProfilePayload(), bot: null, account: Auth.me ? Auth.me.username : null, admin: Auth.isAdmin }];
      if (!Auth.isAdmin) Online.seats[0].avatar = Avatar.stripAdmin(Online.seats[0].avatar);
      // table size: a crew of humans fills to 4; a lone pirate gets 3 to 5 seats, like a real queue would give
      Online.quick = { expect: group.length - 1, target: solo ? pick([3, 4, 4, 4, 5, 5]) : QUICK_SIZE };
      if (!solo) Quick.ch.send({ type: 'broadcast', event: 'match', payload: { code, members: group.slice(1).map(g => g.key) } });
      setTimeout(leaveQueue, 800);
      go('lobby');
      if (solo) setTimeout(quickAutoStart, 900 + Math.random() * 1200);
      else { toast('⚡ Crew found — setting sail as soon as everyone is aboard'); setTimeout(quickAutoStart, 15000); }   // don't wait forever for a slow joiner
    }, err => {
      Quick.matched = false;
      if (!solo) { toast(Net.describe(err)); return; }
      // the matchmaking server is down: play the same table on this device instead
      leaveQueue();
      const seats = [{ id: 'L0', name: profile.name, avatar: profile.avatar, kit: kitById(profile.kitId), bot: null }];
      while (seats.length < 4) seats.push({ ...makeCrewmate(seats), id: 'L' + seats.length });
      startLocal(seats, { ...savedRules });
    });
  }
  function onQuickMatch(p) {
    if (!p || !Quick.active || !Array.isArray(p.members) || !p.members.includes(Quick.key) || Quick.matched) return;
    Quick.matched = true;
    $('#q-title').textContent = 'Crew found! ⚓'; $('#q-sub').textContent = 'Climbing aboard…';
    leaveQueue();
    $('#join-code').value = String(p.code || '').slice(0, 8);
    doJoin();
    clearTimeout(Quick.joinTimer);
    Quick.joinTimer = setTimeout(() => { if (current !== 'lobby' && current !== 'game') { toast('That ship sailed without us — back to the queue'); startQuick(); } }, 20000);
  }
  function leaveQueue() {
    clearInterval(Quick.timer); Quick.timer = null;
    if (Quick.active && Quick.ch) { try { Quick.ch.untrack(); } catch (_) {} }
    Quick.active = false;
  }
  function quickCheckStart() {
    const humansJoined = Online.seats.filter(x => !x.bot && x.id !== 'host').length;
    if (Online.quick && humansJoined >= Online.quick.expect) setTimeout(quickAutoStart, 2000);
  }
  /** Fill the empty seats with crewmates who board one by one, then set sail. */
  function quickAutoStart() {
    if (Online.role !== 'host' || Online.started || !Online.quick) return;
    const target = Online.quick.target || QUICK_SIZE;
    Online.quick = null;
    (function board() {
      if (Online.role !== 'host' || Online.started) return;
      if (Online.seats.length >= target) {
        setTimeout(() => { if (Online.role === 'host' && !Online.started && Online.seats.length >= 2) $('#lobby-start').click(); }, 1400 + Math.random() * 1600);
        return;
      }
      const c = makeCrewmate(Online.seats);
      Online.seats.push(c);
      Sfx.click(); hostLobbyBroadcast();
      crewMaybe(c, 'hello', 0.3, 700 + Math.random() * 1800);
      setTimeout(board, 600 + Math.random() * 2400);
    })();
  }
  $('#quick-btn').addEventListener('click', () => { Sfx.click(); startQuick(); });
  $('#q-cancel').addEventListener('click', () => { leaveQueue(); go('menu'); });

  // =====================================================================
  //  DAILY CHEST · LEADERBOARD · SHARING
  // =====================================================================
  const DAILY_LADDER = [1, 1, 2, 2, 3, 3, 5];
  const todayUTC = () => new Date().toISOString().slice(0, 10);
  const dayBefore = d => new Date(Date.parse(d + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  function guestDaily() { return store.get('bnb.daily', { last: null, streak: 0 }); }
  function dailyReady() { return Auth.me ? Auth.dailyReady() : guestDaily().last !== todayUTC(); }
  function dailyStreakNext() {
    const d = Auth.me ? { last: Auth.me.last_daily, streak: Auth.me.daily_streak | 0 } : guestDaily();
    return d.last === dayBefore(todayUTC()) ? d.streak + 1 : 1;
  }
  function renderDaily() {
    const btn = $('#daily-chest'); if (!btn) return;
    const ready = dailyReady();
    btn.classList.toggle('hidden', !ready);
    if (ready) {
      const day = dailyStreakNext(), reward = DAILY_LADDER[(day - 1) % 7];
      $('#daily-sub').textContent = `Day ${day} · 🪙 ${reward} free doubloon${reward > 1 ? 's' : ''}${day % 7 === 6 ? ' · big chest tomorrow!' : ''}`;
    }
  }
  $('#daily-chest').addEventListener('click', async () => {
    const btn = $('#daily-chest'); if (btn.disabled) return;
    btn.disabled = true;
    try {
      let reward, streak;
      if (Auth.me) {
        const r = await Auth.claimDaily();
        if (!r.claimed) { toast('Ye already opened today\'s chest — come back tomorrow!'); renderDaily(); return; }
        reward = r.reward; streak = r.streak; profile.coins = r.coins;
      } else {
        streak = dailyStreakNext(); reward = DAILY_LADDER[(streak - 1) % 7];
        store.set('bnb.daily', { last: todayUTC(), streak });
        profile.coins += reward;
      }
      saveProfile(); Sfx.coin(); vibrate([40, 30, 80]); logAct(`Opened the daily chest: day ${streak}, +${reward} 🪙`);
      btn.classList.add('opened');
      toast(`🧰 Day ${streak} chest: +${reward} doubloon${reward > 1 ? 's' : ''}! (🪙 ${profile.coins}) Come back tomorrow to keep the streak.`, 5000);
      setTimeout(() => { btn.classList.remove('opened'); renderDaily(); }, 900);
    } catch (err) { toast(err.message, 4000); }
    finally { btn.disabled = false; }
  });
  setInterval(() => { if (current === 'menu') renderDaily(); }, 60000);

  let boardPeriod = 'week';
  async function loadBoard() {
    $$('.board-tabs .tab').forEach(b => b.classList.toggle('on', b.dataset.period === boardPeriod));
    const list = $('#board-list'), meBox = $('#board-me');
    if (!Auth.enabled) { list.innerHTML = '<p class="hint">The leaderboard needs the online server.</p>'; meBox.innerHTML = ''; return; }
    list.innerHTML = '<p class="hint">Countin\' the plunder…</p>';
    try {
      const r = await Auth.leaderboard(boardPeriod);
      const rows = r.rows || [];
      const mine = Auth.me ? Auth.me.username : null;
      const medal = n => n === 1 ? '🥇' : n === 2 ? '🥈' : n === 3 ? '🥉' : '#' + n;
      list.innerHTML = rows.length ? rows.map(x => `<li class="${x.username === mine ? 'me' : ''} ${x.pos <= 3 ? 'top' : ''}">
          <span class="b-pos">${medal(x.pos)}</span>${Avatar.render(Avatar.sanitize(x.avatar || {}), 40)}
          <span class="b-name">${x.username === mine ? 'You' : esc(cleanName(x.username))}</span><span class="b-score">🎲 ${x.score | 0}</span></li>`).join('')
        : `<p class="hint">No dice won ${boardPeriod === 'week' ? 'this week' : 'yet'}. Be the first name on the board!</p>`;
      meBox.innerHTML = !Auth.me ? '<p class="hint">Playing as a guest: <button class="linkish" data-go="account">sign in</button> to get yer name on the board.</p>'
        : r.me && r.me.pos ? `<b>Yer rank: #${r.me.pos}</b> · 🎲 ${r.me.score} dice won${boardPeriod === 'week' ? ' this week' : ''}`
        : `<b>Not on the board yet.</b> Make another pirate lose a die to get on it!`;
    } catch (err) { list.innerHTML = `<p class="status">${esc(err.message)}</p>`; }
  }
  onShow.board = loadBoard;
  $$('.board-tabs .tab').forEach(b => b.addEventListener('click', () => { boardPeriod = b.dataset.period; loadBoard(); }));

  const GAME_URL = 'https://sharp-confusion.github.io/bones-and-brine/';
  async function shareGame(text) {
    const url = /^https?:/.test(location.protocol) && !/localhost|127\.0\.0\.1/.test(location.host) ? location.origin + location.pathname : GAME_URL;
    try {
      if (navigator.share) { await navigator.share({ title: 'Bones & Brine — Pirate Liar\'s Dice', text, url }); return; }
      await navigator.clipboard.writeText(`${text} ${url}`); toast('📣 Link copied! Paste it to yer crew.');
    } catch (err) {
      if (err && err.name === 'AbortError') return;          // they closed the share sheet
      prompt('Copy this and send it to yer crew:', `${text} ${url}`);
    }
  }
  $('#share-btn').addEventListener('click', () => { Sfx.click(); shareGame('Come play pirate liar\'s dice with me 🏴‍☠️🎲 Free in the browser:'); });
  $('#reveal').addEventListener('click', e => {
    if (!e.target.closest('#rv-share') || !G.s) return;
    const s = G.s, won = isYou(s.winner);
    const mine = Number(G.myDiceWon) || 0;
    shareGame(won ? `I just won a game of Bones & Brine${mine ? ` and took ${mine} dice off the table` : ''} 🏴‍☠️🎲 Think ye can out-bluff me?`
      : `Just played Bones & Brine, pirate liar's dice 🏴‍☠️🎲 Come out-bluff me:`);
  });

  // ---------- boot ----------
  window.addEventListener('avatar3d-ready', () => {
    renderMenuProfile();
    if (onShow[current] && current !== 'game') onShow[current]();
    if (G.s) render();
  });
  applyControlsMode();
  saveProfile();
  const room = new URLSearchParams(location.search).get('room');
  if (room) { go('online'); $('#join-code').value = room.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); setStatus('Ye have an invite — press Climb Aboard.'); }

  liveStart();                                   // "who's online" for the admin Desk
  // accounts: restore a saved sign-in, otherwise offer the sign-in screen (once; guests can carry on)
  renderAccountBar();
  if (Auth.enabled) {
    Auth.restore().then(me => {
      if (me && me.banned) {
        Auth.signOut(); toast('This account has been banned.', 5000); renderAccountBar();
        if (current === 'menu') go('account');
      } else if (me) applyAccount(me);
      else if (!store.get('bnb.guestOk', false) && current === 'menu') go('account');
    }).catch(err => console.warn('account restore', err));
  }

  // installable app + offline play
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('service worker', e));
  }

  // exposed for debugging in the console
  window.BonesAndBrine = { G, Online, showUse, act, coins: () => profile.coins };
})();
