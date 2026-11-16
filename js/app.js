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
  onShow.menu = renderMenuProfile;
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
      </div>`).join('');
  }
  onShow.shop = renderShop;
  $('#shop-grid').addEventListener('click', e => {
    const b = e.target.closest('[data-buy]'); if (!b) return;
    const it = shopItem(b.dataset.buy);
    if (!it || profile.coins < it.price) { toast('Not enough doubloons — win some challenges first!'); return; }
    profile.coins -= it.price; profile.inv[it.id] += it.qty;
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
  const Online = { role: null, code: '', seats: [], rules: { ...savedRules }, started: false };
  const setStatus = m => { $('#online-status').textContent = m; };
  const myProfilePayload = () => ({ name: profile.name, avatar: profile.avatar, kit: kitById(profile.kitId) });
  // `account` = the server-verified username (null for guests); `admin` = verified admin
  const publicSeat = x => ({ id: x.id, name: x.name, avatar: x.avatar, kit: x.kit, bot: x.bot, account: x.account || null, admin: !!x.admin });
  function sanitizeSeat(x) {
    return { id: String(x && x.id || '').slice(0, 80), name: cleanName(x && x.name), avatar: Avatar.sanitize(x && x.avatar),
      kit: Dice.sanitize(x && x.kit) || Dice.PRESETS[0], bot: x && x.bot ? { persona: Bot.PERSONAS[x.bot.persona] ? x.bot.persona : 'balanced' } : null,
      account: x && typeof x.account === 'string' ? x.account.slice(0, 16) : null, admin: !!(x && x.admin) };
  }
  function sanitizeRules(r) {
    r = r || {};
    return { onesWild: !!r.onesWild, spotOn: !!r.spotOn, startDice: Math.max(3, Math.min(6, Number(r.startDice) || 5)), pace: PACE[r.pace] ? r.pace : 'relaxed' };
  }
  function leaveOnline() { Net.close(); Online.role = null; Online.seats = []; Online.started = false; Online.code = ''; }

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
    Net.broadcast({ t: 'lobby', code: Online.code, seats: Online.seats.map(publicSeat), rules: Online.rules });
    if (current === 'lobby') renderLobby();
  }
  function renderLobby() {
    const host = Online.role === 'host';
    $('#lobby-code').textContent = Online.code || '-----';
    const myId = host ? 'host' : null;
    $('#lobby-seats').innerHTML = Online.seats.map((x, i) => {
      const isMe = host ? x.id === 'host' : (x.id === Online.myId);
      return `<div class="seat-row">${Avatar.render(x.avatar, 48)}
        <div class="sr-main"><span class="sr-name">${x.bot ? '🤖 ' : ''}${esc(x.name)}</span>
          ${x.bot ? (host ? personaSelect(x.bot.persona, `data-lpersona="${i}"`) : `<span class="tag bot">${esc(Bot.PERSONAS[x.bot.persona].label)}</span>`)
            : `<span class="tag ${isMe ? 'you' : ''}">${x.id === 'host' ? 'Captain' : 'Crew'}${isMe ? ' · You' : ''}${x.admin ? ' · 👑 Admin' : x.account ? ' · ✔ Account' : ' · Guest'}</span>`}
        </div>
        <span class="sr-btns">${Dice.render(6, x.kit, 32)}${(host ? x.id !== myId : (Auth.isAdmin && x.id !== 'host' && x.id !== Online.myId)) ? `<button class="x-btn" data-kick="${esc(x.id)}" title="${x.bot ? 'Remove bot' : 'Make them walk the plank'}">✕</button>` : ''}</span>
      </div>`;
    }).join('') + (Online.seats.length < MAX_SEATS ? `<p class="hint">${MAX_SEATS - Online.seats.length} seat(s) free — share the code, or add bots.</p>` : '');
    $('#lobby-host-ctrls').classList.toggle('hidden', !host);
    $('#lobby-add-bot').disabled = Online.seats.length >= MAX_SEATS;
    $('#lobby-start').classList.toggle('hidden', !host);
    $('#lobby-start').disabled = Online.seats.length < 2;
    $('#lobby-wait').classList.toggle('hidden', host);
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
      if (v) { prof.name = cleanName(v.username); prof.account = v.username; prof.admin = !!v.is_admin; }
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
  }
  function hostHandle(id, msg) {
    if (msg.t === 'join') { hostJoin(id, msg); return; }
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
      case 'use': if (shopItem(msg.id)) showUse(Number(msg.seat) | 0, msg.id); break;
      case 'error': toast(String(msg.msg || 'Something went wrong').slice(0, 120), 4000); endGame(); leaveOnline(); go('online'); break;
    }
  }
  Net.on('disconnect', id => {
    if (Online.role !== 'host') return;
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
    Object.assign(G, { mode, s: null, me: -1, viewer: -1, bottom: 0, revealedFor: -1, localHumans: [], snap: null, schedKey: '', nextAt: 0, turnDeadline: 0, taunts: {}, uses: {}, seatFrameKey: {}, revealKey: '' });
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
  }
  function receive(view, you, turnLeft) {
    if (G.mode !== 'client') resetGame('client');
    const v = view;
    v.players = (v.players || []).map(p => ({ ...p, name: cleanName(p.name), avatar: Avatar.sanitize(p.avatar), kit: Dice.sanitize(p.kit) || Dice.PRESETS[0],
      dice: (p.dice || []).map(d => Math.max(1, Math.min(6, d | 0))), count: p.count | 0 }));
    const prev = G.snap;
    G.s = v; G.me = G.viewer = G.bottom = you; G.snap = snapOf(v);
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
      Net.sendTo(p.id, { t: 'state', s: xray ? JSON.parse(JSON.stringify(s)) : Engine.viewFor(s, i), you: i, turnLeft: left, xray });
    });
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
        setTimeout(() => { Sfx.coin(); toast(`+1 doubloon! (🪙 ${profile.coins})`); }, 1300);
      }
    }
    if (r.loser >= 0 && r.loser === walletSeat()) {
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
    if (!prev || s.round !== prev.round) { Sfx.rattle(); G.rollAnim = true; }
    else if (s.history.length > prev.hist && s.phase === 'bidding') Sfx.bid();
    if (prev && prev.phase === 'bidding' && s.phase !== 'bidding') {
      Sfx.liar(); vibrate([70, 40, 70]);
      const r = s.result;
      awardCoins(r);
      if (G.mode !== 'client') maybeBotSnack(r);
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
      renderSeats();
    } else {
      const smoke = (id === 'smokes' || id === 'cigar') ? '<i class="puff"></i><i class="puff"></i><i class="puff"></i><i class="puff"></i>' : '';
      floatAt(seat, `<div class="prop prop-${id}"><span class="item-emoji">${it.emoji}</span>${smoke}</div>`, 'use use-' + id, it.ms);
    }
    const verb = isYou(seat) ? it.verbYou : it.verb;
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
      profile.coins -= it.price; profile.inv[it.id] += it.qty; saveProfile(); renderCoins(); Sfx.coin();
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
    $('#g-sound').textContent = Sfx.on ? '🔊' : '🔇';
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
      el.style.left = x + '%'; el.style.top = y + '%';
      let bubble = '';
      const t = G.taunts[i];
      if (t && t.until > now) bubble = `<div class="s-bubble taunt">${esc(TAUNTS[t.i])}</div>`;
      else if (isTurn) {
        const think = p.bot ? `<span class="dots"><i></i><i></i><i></i></span> <span class="tl">${esc(thinkLine(i))}</span>` : '<span class="dots"><i></i><i></i><i></i></span>';
        bubble = `<div class="s-bubble think">${i === cs ? 'Yer wager!' : think}</div>`;
      }
      else if (s.phase === 'bidding') { const lb = lastBidBy(s, i); if (lb) bubble = `<div class="s-bubble">${lb.qty} × ${Dice.render(lb.face, p.kit, 22)}${lb.face === 1 ? '<small class="ones">1s</small>' : ''}</div>`; }
      const cups = p.out ? '<span class="skull" title="Out">☠</span>'
        : Array.from({ length: p.count }, () => `<i class="mini" style="background:${p.kit.face};border-color:${p.kit.edge}"></i>`).join('');
      const fr = seatFrame(i, now);
      G.seatFrameKey[i] = fr.key;
      el.innerHTML = `${bubble}<div class="av ${fr.chew ? 'chewing' : ''}" data-seat="${i}">${seatPortraitHTML(p, fr)}</div><div class="s-name">${p.bot ? '<span class="bot-tag">🤖</span>' : ''}${nm(i)}</div><div class="s-cups">${cups}</div>${xrayHTML(i, p)}`;
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
  /** What a seat looks like right now: { key, pose, fx: [{kind, at}], chew } */
  function seatFrame(i, now) {
    const s = G.s, p = s.players[i];
    const revealing = s.phase !== 'bidding' && p.dice.length > 0;
    const LIFT = ['arms_lift', 'cup_lift', 'dice_table'];
    let u = G.uses[i];
    if (u && now >= u.end) { delete G.uses[i]; u = null; }
    if (!u) {
      const pose = revealing ? 'lift' : 'rest';
      return { key: pose, pose, fx: [] };
    }
    const t = now - u.start, f = Math.min(1, t / (u.end - u.start));
    let pose, fx = [], chew = false;
    switch (u.id) {
      case 'drink': {
        const e = f > 0.5 ? '_empty' : '';
        const c = t % 10000;
        if (revealing) pose = P3(...LIFT, 'table_drink' + e);
        else if (f > 0.85 || c < 6500) pose = P3('arms_rest', 'cup_down', 'table_drink' + (f > 0.85 ? '_empty' : e));
        else if (c < 7400 || c >= 9500) pose = P3('arms_holddrink', 'cup_down', 'chest_drink' + e);
        else { pose = P3('arms_drink', 'cup_down', 'held_drink' + e); fx.push({ kind: 'gulp', at: 'mouth' }); }
        break;
      }
      case 'rum': {
        const e = t > 4800 ? '_empty' : '';
        if (revealing) pose = P3(...LIFT, 'table_rum' + e);
        else if (t < 2500 || t >= 4800) pose = P3('arms_rest', 'cup_down', 'table_rum' + e);
        else { pose = P3('arms_drink', 'cup_down', 'held_rum'); fx.push({ kind: 'gulp', at: 'mouth' }); }
        break;
      }
      case 'smokes': {
        const z = burnt(f), c = t % 9000;
        if (revealing) { pose = P3(...LIFT, 'lips_cigarette_' + z); fx.push({ kind: 'wisp', at: 'lips_cigarette_' + z }); }
        else if (c >= 5500 && c < 7300) {           // taking a drag: the tip glows
          pose = P3('arms_smoke', 'cup_down', 'held_cigarette_' + z);
          fx.push({ kind: 'glow', at: 'held_cigarette_' + z });
        } else {
          pose = P3('arms_smokedown', 'cup_down', 'hand_cigarette_' + z);
          fx.push({ kind: 'wisp', at: 'hand_cigarette_' + z });
          if (c >= 7300) fx.push({ kind: 'exhale', at: 'mouth' });
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
        const c = t % 8000;
        if (revealing) pose = P3(...LIFT, plate);
        else if (f >= 0.9 || c < 3000) pose = P3('arms_cut', 'cup_side', plate, 'cut_tools');
        else if (c < 4500) pose = P3('arms_eat', 'cup_side', plate, 'held_fork');
        else { pose = P3('arms_cut', 'cup_side', plate, 'cut_tools'); chew = true; }
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
      default: pose = revealing ? 'lift' : 'rest';
    }
    return { key: pose + '|' + fx.map(x => x.kind).join() + (chew ? '|chew' : ''), pose, fx, chew };
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
  /** Called from tick(): moves each seat on to the next frame of whatever it's eating, drinking or smoking. */
  function animateSeats() {
    if (!G.s || current !== 'game') return;
    const now = Date.now();
    for (const i of Object.keys(G.uses).map(Number)) {
      const p = G.s.players[i]; if (!p) continue;
      const fr = seatFrame(i, now);
      if (fr.key === G.seatFrameKey[i]) continue;
      G.seatFrameKey[i] = fr.key;
      const av = document.querySelector(`.seat .av[data-seat="${i}"]`);
      if (!av) continue;
      av.classList.toggle('chewing', !!fr.chew);
      av.innerHTML = seatPortraitHTML(p, fr);
    }
  }

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
      wait.textContent = p.bot ? `${p.name} is scheming…` : isHotseat() ? `Pass the device to ${p.name}` : `Waiting on ${p.name}…`;
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
      footer = `<div class="rv-winner">${Avatar.render(w.avatar, 96)}<h2>${nm(s.winner)} ${vb(s.winner, 'claims', 'claim')} the treasure!</h2></div><div class="rv-btns">${btns}<button class="btn" id="rv-menu">Main Menu</button></div>`;
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
    animateSeats();
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
  $('#g-menu').addEventListener('click', () => {
    if (G.s && G.s.phase !== 'over' && !confirm('Abandon ship and return to port?')) return;
    quitGame();
  });
  $('#g-sound').addEventListener('click', () => { Sfx.toggle(); render(); });
  $('#g-full').addEventListener('click', () => {
    try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen({ navigationUI: 'hide' }); }
    catch (_) { toast('Fullscreen not supported here — try “Add to Home Screen”'); }
  });
  if (!document.fullscreenEnabled) $('#g-full').style.display = 'none';

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
  const showXray = () => Auth.isAdmin && G.xray && (G.mode !== 'client' || G.xrayFeed);

  /** Host: carry out a command from a server-verified admin (checked in hostHandle). */
  function adminCommand(fromId, msg) {
    const seat = Online.seats.find(x => x.id === fromId);
    if (msg.cmd === 'kick' && msg.id && msg.id !== fromId) hostKick(String(msg.id), 'An admin threw ye off the ship.');
    else if (msg.cmd === 'xray' && seat) { seat.xray = !!msg.on; if (G.s && G.mode === 'host') broadcastState(); }
    else if (msg.cmd === 'setDice' && G.s && G.mode === 'host') rigDice(G.s.players.findIndex(p => p.id === fromId), msg.dice);
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
      .filter(o => o.i !== me && !o.p.bot && !(G.mode === 'client' && o.p.id === 'host'));   // the captain can't be kicked off their own ship
    $('#admin-tray').innerHTML = `
      <div class="tray-head">👑 Admin powers</div>
      <label class="adm-row"><input type="checkbox" id="adm-xray" ${G.xray ? 'checked' : ''}> <span><b>X-ray</b> — see everyone's dice</span></label>
      <div class="adm-block"><b>Rig yer dice</b> <small>(tap a die to change it)</small>
        <div class="rig">${canRig ? G.rigDraft.map((d, k) => `<button data-rig="${k}">${Dice.render(d, mine.kit, 34)}</button>`).join('') : '<small>Only during wagering, while ye still have dice.</small>'}</div>
        ${canRig ? '<button class="btn small primary" id="adm-rig-go">Use these dice</button>' : ''}
      </div>
      ${G.mode === 'local' ? '' : `<div class="adm-block"><b>Players</b>${others.length ? others.map(o => `
        <div class="adm-player"><span>${esc(o.p.name)} <small>${o.seat && o.seat.account ? '✔ account' : 'guest'}</small></span>
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
      try { await Auth.admin.setBan(seat.account, true); toast(`${seat.account} is banned`); }
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
  $('#adm-find').addEventListener('click', async () => {
    const u = $('#adm-user').value.trim();
    if (!u) return;
    $('#adm-status').textContent = 'Searching…';
    try { const r = await Auth.admin.lookup(u); renderDesk(r); $('#adm-status').textContent = r ? '' : `No pirate called "${u}".`; }
    catch (err) { renderDesk(null); $('#adm-status').textContent = err.message; }
  });
  $('#adm-user').addEventListener('keydown', e => { if (e.key === 'Enter') $('#adm-find').click(); });
  $('#adm-result').addEventListener('click', e => {
    if (!deskUser) return;
    const c = e.target.closest('[data-coins]'), it = e.target.closest('[data-item]'), b = e.target.closest('[data-ban]');
    if (c) {
      const d = c.dataset.coins === 'custom' ? Number($('#adm-coin-n').value) | 0 : Number(c.dataset.coins);
      if (d) deskRun(() => Auth.admin.addCoins(deskUser.username, d), `${d > 0 ? 'Gave' : 'Took'} ${Math.abs(d)} doubloon(s).`);
    } else if (it) deskRun(() => Auth.admin.giveItem(deskUser.username, it.dataset.item, Number(it.dataset.q)), 'Goods updated.');
    else if (b) {
      const banIt = b.dataset.ban === '1';
      if (banIt && !confirm(`Ban ${deskUser.username}?`)) return;
      deskRun(() => Auth.admin.setBan(deskUser.username, banIt), banIt ? 'Banned.' : 'Unbanned.');
    }
  });
  onShow.admin = () => { if (!Auth.isAdmin) { go('menu'); return; } $('#adm-status').textContent = ''; };

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
    renderMenuProfile(); renderAccountBar();
  }
  function renderAccountBar() {
    const bar = $('#account-bar');
    if (!Auth.enabled) bar.innerHTML = '';
    else if (Auth.me) bar.innerHTML = `Signed in as <b>${esc(Auth.me.username)}</b>${Auth.isAdmin ? ' <span class="crown">👑 admin</span>' : ''} · <button class="linkish" id="acc-signout">Sign out</button>`;
    else bar.innerHTML = `Playing as a guest · <button class="linkish" id="acc-open">Sign in / create account</button>`;
    $('#admin-desk-btn').classList.toggle('hidden', !Auth.isAdmin);
    $('#g-admin-btn').classList.toggle('hidden', !Auth.isAdmin);
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
