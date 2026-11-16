'use strict';
/* Bones & Brine — pirate looks. The 3D parts come from Blender (see art/build_pirates.py and js/avatar3d.js);
   this file owns the look data, validation and a simple drawn fallback while/if 3D is unavailable. */
const Avatar = (() => {
  const SKINS = {
    deckhand: ['#f6d2b3', '#e8b98f', '#d39a6a', '#b07a4d', '#8d5524', '#5c3a21'],
    oldsalt:  ['#f1c9a8', '#dcab83', '#c08657', '#9a6a43', '#74482a', '#4e3020'],
    skeleton: ['#f1ead6', '#d9cfb3', '#b9c4c9', '#c9b38f'],
    fishfolk: ['#5fb8a5', '#4a9bc2', '#7bbf6a', '#9a7fd1', '#d98a6b']
  };
  const OPTIONS = {
    base: { label: 'Pirate', type: 'list', values: ['deckhand', 'oldsalt', 'skeleton', 'fishfolk'],
      names: { deckhand: 'Deckhand', oldsalt: 'Old Salt', skeleton: 'Bones', fishfolk: 'Fishfolk' } },
    skin: { label: 'Skin', type: 'skin' },
    hair: { label: 'Hair', type: 'list', values: ['bald', 'crop', 'messy', 'long', 'ponytail', 'braids', 'dreads', 'mohawk', 'topknot', 'afro', 'slick', 'wild', 'bob'],
      names: { bald: 'Bald', crop: 'Short Crop', messy: 'Messy', long: 'Long', ponytail: 'Ponytail', braids: 'Braids', dreads: 'Dreadlocks', mohawk: 'Mohawk', topknot: 'Top Knot', afro: 'Curly Afro', slick: 'Slicked Back', wild: 'Wild Mane', bob: 'Bob' } },
    hairColor: { label: 'Hair Colour', type: 'color', values: ['#1b1b1b', '#4a2c16', '#8a4b1f', '#c9772d', '#e0c07a', '#9e9e9e', '#f2f2f2', '#9b2226', '#2a6f97', '#6a4c93'] },
    top: { label: 'Top', type: 'list', values: ['captain', 'striped', 'vest', 'rags', 'naval'],
      names: { captain: "Captain's Coat", striped: 'Striped Shirt', vest: 'Leather Vest', rags: 'Ragged Shirt', naval: 'Naval Jacket' } },
    topColor: { label: 'Top Colour', type: 'color', values: ['#8c2323', '#1f3b7a', '#2e5e3a', '#3b2a1a', '#5b2a6e', '#222222', '#a86b2d', '#2f6f73'] },
    hat: { label: 'Hat', type: 'list', values: ['tricorn', 'bicorne', 'bandana', 'none'],
      names: { tricorn: 'Tricorn', bicorne: "Captain's Bicorne", bandana: 'Bandana', none: 'No Hat' } },
    hatColor: { label: 'Hat Colour', type: 'color', values: ['#2b1d14', '#7a1f1f', '#1f3b7a', '#2e5e3a', '#5b2a6e', '#c9a23a', '#e8e1d0', '#222222'] },
    trinket: { label: 'Trinket', type: 'list', values: ['none', 'parrot', 'earring', 'necklace', 'spyglass', 'cutlass'],
      names: { none: 'Nothing', parrot: 'Parrot', earring: 'Gold Earrings', necklace: 'Tooth Necklace', spyglass: 'Spyglass', cutlass: 'Cutlass' } },
    cosmetics: { label: 'Cosmetics (pick any)', type: 'multi', values: ['eyepatch', 'monocle', 'scar', 'goldtooth', 'warpaint', 'freckles', 'beard', 'braidbeard', 'mustache', 'goatee'],
      names: { eyepatch: 'Eyepatch', monocle: 'Monocle', scar: 'Scar', goldtooth: 'Gold Tooth', warpaint: 'War Paint', freckles: 'Freckles', beard: 'Full Beard', braidbeard: 'Braided Beard', mustache: 'Mustache', goatee: 'Goatee' } },
    bg: { label: 'Flag Colour', type: 'color', values: ['#1d3b53', '#3b1d1d', '#1d3b2a', '#3b331d', '#2a1d3b', '#111111', '#5a3519', '#0f5257'] }
  };
  const DEFAULT = { base: 'deckhand', skin: '#e8b98f', hair: 'messy', hairColor: '#4a2c16', top: 'captain', topColor: '#8c2323',
    hat: 'tricorn', hatColor: '#2b1d14', trinket: 'none', cosmetics: [], bg: '#1d3b53' };
  const FACIAL = ['beard', 'braidbeard', 'mustache', 'goatee'];

  const pick = a => a[Math.floor(Math.random() * a.length)];
  const skinsFor = base => SKINS[base] || SKINS.deckhand;

  function sanitize(a) {
    const o = { ...DEFAULT };
    if (a && typeof a === 'object') {
      for (const [k, opt] of Object.entries(OPTIONS)) {
        if (opt.type === 'list' || opt.type === 'color') { if (opt.values.includes(a[k])) o[k] = a[k]; }
      }
      o.skin = skinsFor(o.base).includes(a.skin) ? a.skin : skinsFor(o.base)[1] || skinsFor(o.base)[0];
      if (Array.isArray(a.cosmetics)) {
        o.cosmetics = [...new Set(a.cosmetics.filter(c => OPTIONS.cosmetics.values.includes(c)))];
        // only one facial-hair style and not both eyepatch and monocle
        const f = o.cosmetics.filter(c => FACIAL.includes(c));
        if (f.length > 1) o.cosmetics = o.cosmetics.filter(c => !FACIAL.includes(c) || c === f[f.length - 1]);
        if (o.cosmetics.includes('eyepatch') && o.cosmetics.includes('monocle')) o.cosmetics = o.cosmetics.filter(c => c !== 'eyepatch');
      }
    } else o.skin = DEFAULT.skin;
    return o;
  }

  /** Toggle a cosmetic, respecting the "one beard style, patch or monocle" rules. */
  function toggleCosmetic(look, c) {
    let list = look.cosmetics.filter(x => x !== c);
    if (!look.cosmetics.includes(c)) {
      if (FACIAL.includes(c)) list = list.filter(x => !FACIAL.includes(x));
      if (c === 'eyepatch') list = list.filter(x => x !== 'monocle');
      if (c === 'monocle') list = list.filter(x => x !== 'eyepatch');
      list.push(c);
    }
    return { ...look, cosmetics: list };
  }

  function random() {
    const base = pick(OPTIONS.base.values);
    const cos = [];
    if (Math.random() < 0.5 && base !== 'skeleton') cos.push(pick(FACIAL));
    if (Math.random() < 0.3) cos.push(pick(['eyepatch', 'monocle']));
    if (Math.random() < 0.3) cos.push(pick(['scar', 'goldtooth', 'warpaint', 'freckles']));
    return sanitize({
      base, skin: pick(skinsFor(base)), hair: pick(OPTIONS.hair.values), hairColor: pick(OPTIONS.hairColor.values),
      top: pick(OPTIONS.top.values), topColor: pick(OPTIONS.topColor.values), hat: pick(OPTIONS.hat.values),
      hatColor: pick(OPTIONS.hatColor.values), trinket: Math.random() < 0.6 ? pick(OPTIONS.trinket.values) : 'none',
      cosmetics: cos, bg: pick(OPTIONS.bg.values)
    });
  }

  let uid = 0;
  /** Simple drawn stand-in used until the 3D models have loaded (or if WebGL is unavailable). */
  function fallback(a, size) {
    const id = 'avf' + (++uid);
    const hat = a.hat === 'none' ? '' : a.hat === 'bandana'
      ? `<path d="M33 50Q32 27 60 26Q88 27 87 50Q60 40 33 50Z" fill="${a.hatColor}"/>`
      : `<path d="M10 44Q30 34 34 18Q60 4 86 18Q90 34 110 44Q84 34 60 38Q36 34 10 44Z" fill="${a.hatColor}" stroke="#e2ad3f" stroke-width="2.5"/>`;
    const hair = a.hair === 'bald' ? '' : `<path d="M32 56Q30 26 60 26Q90 26 88 56Q80 38 60 38Q40 38 32 56Z" fill="${a.hairColor}"/>`;
    const beard = a.cosmetics.some(c => FACIAL.includes(c)) ? `<path d="M36 64Q38 96 60 98Q82 96 84 64Q78 78 60 76Q42 78 36 64Z" fill="${a.hairColor}"/>` : '';
    const eye = a.base === 'skeleton' ? '#111' : '#1a1a1a';
    return `<svg class="avatar-svg" viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="pirate portrait"><defs><clipPath id="${id}"><circle cx="60" cy="60" r="60"/></clipPath></defs><g clip-path="url(#${id})"><rect width="120" height="120" fill="${a.bg}"/><path d="M8 124Q12 90 60 88Q108 90 112 124Z" fill="${a.topColor}"/><ellipse cx="60" cy="58" rx="26" ry="28" fill="${a.skin}"/>${hair}<circle cx="50" cy="56" r="3.4" fill="${eye}"/><circle cx="70" cy="56" r="3.4" fill="${eye}"/>${beard}<path d="M52 76Q60 81 68 76" stroke="#3a1a10" stroke-width="2.4" fill="none"/>${hat}</g></svg>`;
  }

  /** pose: 'face' (round badge) or a table pose ('rest', 'lift', 'drink', 'smokes', ...) showing arms and cup. */
  function render(look, size = 64, pose = 'face') {
    const a = sanitize(look);
    const A = window.Avatar3D;
    if (A && A.ready) {
      try {
        const url = A.portrait(a, pose);
        if (pose !== 'face') {
          const h = Math.round(size * A.TABLE_H / A.TABLE_W);
          return `<img class="avatar-table" src="${url}" width="${size}" height="${h}" alt="" style="background:radial-gradient(ellipse at 50% 30%, ${a.bg}ee, ${a.bg} 75%)">`;
        }
        return `<img class="avatar-svg avatar-img" src="${url}" width="${size}" height="${size}" alt="" style="background:radial-gradient(circle at 50% 35%, ${a.bg}cc, ${a.bg} 70%)">`;
      } catch (e) { console.warn(e); }
    }
    return fallback(a, size);
  }

  return { OPTIONS, DEFAULT, SKINS, skinsFor, render, random, sanitize, toggleCosmetic };
})();
