'use strict';
/* Bones & Brine — dice kits and SVG dice renderer. */
const Dice = (() => {
  const PRESETS = [
    { id: 'bone',     name: 'Old Bone',        face: '#f4ead5', face2: '#cbb58a', pip: '#2a1a10', edge: '#7c5c3a', pipShape: 'dot',     wild: 'skull',      pattern: 'none',    round: 20 },
    { id: 'doubloon', name: 'Gold Doubloon',   face: '#ffd968', face2: '#c08a1e', pip: '#5a3a05', edge: '#7a5410', pipShape: 'coin',    wild: 'crown',      pattern: 'none',    round: 30 },
    { id: 'kraken',   name: 'Kraken Ink',      face: '#1f3347', face2: '#0a121b', pip: '#6fe3d6', edge: '#2f8f86', pipShape: 'dot',     wild: 'anchor',     pattern: 'waves',   round: 18 },
    { id: 'jade',     name: 'Cursed Jade',     face: '#62c28d', face2: '#1d6844', pip: '#f4f1d0', edge: '#0f3b27', pipShape: 'diamond', wild: 'skull',      pattern: 'speckle', round: 14 },
    { id: 'ruby',     name: 'Blood Ruby',      face: '#d03447', face2: '#6d0f1f', pip: '#ffe9b0', edge: '#3d0510', pipShape: 'star',    wild: 'crossbones', pattern: 'none',    round: 16 },
    { id: 'timber',   name: "Ship's Timber",   face: '#b0743f', face2: '#6b3f1d', pip: '#f3e0b5', edge: '#3d2410', pipShape: 'dot',     wild: 'compass',    pattern: 'grain',   round: 10 },
    { id: 'ghost',    name: 'Ghost Ship',      face: '#eef6ff', face2: '#a9c2d9', pip: '#3d5a80', edge: '#6f88a6', pipShape: 'skull',   wild: 'skull',      pattern: 'none',    round: 24 },
    { id: 'siren',    name: "Siren's Scale",   face: '#3fb6c4', face2: '#1b5d8a', pip: '#fff4d6', edge: '#123f5e', pipShape: 'heart',   wild: 'star',       pattern: 'scales',  round: 22 },
    { id: 'powder',   name: 'Black Powder',    face: '#2a2a2a', face2: '#0d0d0d', pip: '#e8b44c', edge: '#5c4512', pipShape: 'number',  wild: 'crossbones', pattern: 'stripes', round: 8 },
    { id: 'seaglass', name: 'Sea Glass',       face: '#a8e0d2', face2: '#4f9e94', pip: '#11423c', edge: '#2d7268', pipShape: 'drop',    wild: 'anchor',     pattern: 'speckle', round: 28 },
    { id: 'pearl',    name: 'Mermaid Pearl',   face: '#fbf6ee', face2: '#e3cfd9', pip: '#8a5a7a', edge: '#b996ab', pipShape: 'ring',    wild: 'heart',      pattern: 'none',    round: 34 },
    { id: 'volcano',  name: 'Volcanic Rock',   face: '#3a2a26', face2: '#140c0a', pip: '#ff7a2e', edge: '#7a2a0a', pipShape: 'gem',     wild: 'skull',      pattern: 'cracks',  round: 12 },
    { id: 'navy',     name: 'Royal Navy',      face: '#24407a', face2: '#11204a', pip: '#f2f2f2', edge: '#c9a23a', pipShape: 'star',    wild: 'crown',      pattern: 'stripes', round: 14 },
    { id: 'map',      name: 'Treasure Map',    face: '#efd9a6', face2: '#c9a565', pip: '#8c2323', edge: '#6b4a22', pipShape: 'square',  wild: 'flag',       pattern: 'checker', round: 6 },
    { id: 'moonlit',  name: 'Moonlit Tide',    face: '#2c2f5a', face2: '#11132e', pip: '#f6e7a1', edge: '#4a4f8a', pipShape: 'moon',    wild: 'moon',       pattern: 'waves',   round: 26 }
  ];
  const PIP_SHAPES = ['dot', 'diamond', 'star', 'heart', 'coin', 'skull', 'anchor', 'number', 'moon', 'ring', 'square', 'drop', 'gem'];
  const WILD_SYMBOLS = ['pip', 'skull', 'crossbones', 'anchor', 'compass', 'crown', 'star', 'moon', 'flag', 'gem', 'heart'];
  const PATTERNS = ['none', 'grain', 'speckle', 'stripes', 'scales', 'waves', 'polka', 'checker', 'zigzag', 'cracks'];
  const LABELS = {
    dot: 'Dots', diamond: 'Diamonds', star: 'Stars', heart: 'Hearts', coin: 'Coins', skull: 'Skulls', anchor: 'Anchors', number: 'Numerals',
    pip: 'Plain pip', crossbones: 'Crossbones', compass: 'Compass', crown: 'Crown',
    none: 'Smooth', grain: 'Wood grain', speckle: 'Speckled', stripes: 'Striped', scales: 'Scales', waves: 'Waves',
    moon: 'Moons', ring: 'Rings', square: 'Squares', drop: 'Drops', gem: 'Gems', flag: 'Jolly Roger',
    polka: 'Polka dots', checker: 'Checkered', zigzag: 'Zigzag', cracks: 'Cracked'
  };

  const C = 50, Y = 48, O = 22;
  const LAYOUT = {
    1: [[C, Y]],
    2: [[C - O, Y - O], [C + O, Y + O]],
    3: [[C - O, Y - O], [C, Y], [C + O, Y + O]],
    4: [[C - O, Y - O], [C + O, Y - O], [C - O, Y + O], [C + O, Y + O]],
    5: [[C - O, Y - O], [C + O, Y - O], [C, Y], [C - O, Y + O], [C + O, Y + O]],
    6: [[C - O, Y - O], [C + O, Y - O], [C - O, Y], [C + O, Y], [C - O, Y + O], [C + O, Y + O]]
  };
  let uid = 0;

  function starPath(x, y, ro, ri, n) {
    let d = '';
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? ri : ro, a = -Math.PI / 2 + i * Math.PI / n;
      d += (i ? 'L' : 'M') + (x + r * Math.cos(a)).toFixed(2) + ' ' + (y + r * Math.sin(a)).toFixed(2);
    }
    return d + 'Z';
  }
  const g = (x, y, r, inner) => `<g transform="translate(${x} ${y}) scale(${(r / 10).toFixed(3)})">${inner}</g>`;

  function symbol(kind, x, y, r, c, bg) {
    switch (kind) {
      case 'diamond': return `<path d="M${x} ${y - r * 1.3}L${x + r} ${y}L${x} ${y + r * 1.3}L${x - r} ${y}Z" fill="${c}"/>`;
      case 'star': return `<path d="${starPath(x, y, r * 1.3, r * 0.55, 5)}" fill="${c}"/>`;
      case 'compass': return `<path d="${starPath(x, y, r * 1.45, r * 0.38, 4)}" fill="${c}"/><circle cx="${x}" cy="${y}" r="${r * 0.25}" fill="${bg}"/>`;
      case 'heart': return g(x, y, r, `<path d="M0 9 C-14 0 -9 -12 0 -5 C9 -12 14 0 0 9Z" fill="${c}"/>`);
      case 'coin': return `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/><circle cx="${x}" cy="${y}" r="${r * 0.62}" fill="none" stroke="${bg}" stroke-width="${(r * 0.2).toFixed(2)}"/>`;
      case 'skull': return g(x, y, r, `<path d="M-9 -1A9 9 0 1 1 9 -1L9 3Q9 6 6 6L6 10L-6 10L-6 6Q-9 6 -9 3Z" fill="${c}"/><circle cx="-3.6" cy="0" r="2.8" fill="${bg}"/><circle cx="3.6" cy="0" r="2.8" fill="${bg}"/><path d="M0 3.4L-1.5 6H1.5Z" fill="${bg}"/><path d="M-2.6 7.6V10M0 7.6V10M2.6 7.6V10" stroke="${bg}" stroke-width="1.1"/>`);
      case 'crossbones': return g(x, y, r, `<g stroke="${c}" stroke-width="3" stroke-linecap="round"><path d="M-10 -10L10 10M10 -10L-10 10"/></g><g fill="${c}"><circle cx="-11" cy="-8" r="2.4"/><circle cx="-8" cy="-11" r="2.4"/><circle cx="11" cy="8" r="2.4"/><circle cx="8" cy="11" r="2.4"/><circle cx="11" cy="-8" r="2.4"/><circle cx="8" cy="-11" r="2.4"/><circle cx="-11" cy="8" r="2.4"/><circle cx="-8" cy="11" r="2.4"/></g>`);
      case 'anchor': return g(x, y, r, `<g fill="none" stroke="${c}" stroke-width="2.8" stroke-linecap="round"><circle cy="-8" r="2.8"/><path d="M0 -5V10M-5.5 -1.5H5.5M-9 3Q-8 10.5 0 10.5Q8 10.5 9 3"/></g>`);
      case 'moon': return `<circle cx="${x}" cy="${y}" r="${r * 1.15}" fill="${c}"/><circle cx="${x + r * 0.55}" cy="${y - r * 0.35}" r="${r}" fill="${bg}"/>`;
      case 'ring': return `<circle cx="${x}" cy="${y}" r="${r * 0.82}" fill="none" stroke="${c}" stroke-width="${(r * 0.42).toFixed(2)}"/>`;
      case 'square': return `<rect x="${x - r * 0.9}" y="${y - r * 0.9}" width="${r * 1.8}" height="${r * 1.8}" rx="${r * 0.25}" fill="${c}"/>`;
      case 'drop': return g(x, y, r, `<path d="M0 -12Q9 0 9 4A9 9 0 0 1 -9 4Q-9 0 0 -12Z" fill="${c}"/>`);
      case 'gem': return g(x, y, r, `<path d="M-10 -4L-5 -10H5L10 -4L0 11Z" fill="${c}"/><path d="M-10 -4H10M-5 -10L-2 -4L0 11M5 -10L2 -4" fill="none" stroke="${bg}" stroke-width="1" opacity=".55"/>`);
      case 'flag': return g(x, y, r, `<path d="M-10 -11V12" stroke="${c}" stroke-width="2.2"/><path d="M-9 -11H11L7 -4L11 3H-9Z" fill="${c}"/><circle cx="1" cy="-5" r="3" fill="${bg}"/><path d="M-3 0L5 0" stroke="${bg}" stroke-width="1.5"/>`);
      case 'crown': return g(x, y, r, `<path d="M-11 7L-11 -6L-5.5 0L0 -10L5.5 0L11 -6L11 7Z" fill="${c}"/><rect x="-11" y="7" width="22" height="3" fill="${c}"/>`);
      default: return `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;
    }
  }

  function patternDef(id, kind, c) {
    const u = `id="${id}" patternUnits="userSpaceOnUse"`;
    switch (kind) {
      case 'grain': return `<pattern ${u} width="100" height="13"><path d="M0 6Q25 1 50 6T100 6" fill="none" stroke="${c}" stroke-width="1.4" opacity=".4"/></pattern>`;
      case 'stripes': return `<pattern ${u} width="12" height="12" patternTransform="rotate(35)"><rect width="4" height="12" fill="${c}" opacity=".25"/></pattern>`;
      case 'speckle': return `<pattern ${u} width="20" height="20"><g fill="${c}" opacity=".45"><circle cx="3" cy="4" r="1.2"/><circle cx="13" cy="9" r=".9"/><circle cx="7" cy="15" r="1.4"/><circle cx="17" cy="17" r=".8"/></g></pattern>`;
      case 'scales': return `<pattern ${u} width="16" height="10"><g fill="none" stroke="${c}" stroke-width="1.2" opacity=".45"><path d="M0 10A8 8 0 0 1 16 10"/><path d="M-8 5A8 8 0 0 1 8 5M8 5A8 8 0 0 1 24 5"/></g></pattern>`;
      case 'waves': return `<pattern ${u} width="24" height="12"><path d="M0 6Q6 0 12 6T24 6" fill="none" stroke="${c}" stroke-width="1.4" opacity=".45"/></pattern>`;
      case 'polka': return `<pattern ${u} width="18" height="18"><g fill="${c}" opacity=".35"><circle cx="4.5" cy="4.5" r="3"/><circle cx="13.5" cy="13.5" r="3"/></g></pattern>`;
      case 'checker': return `<pattern ${u} width="20" height="20"><g fill="${c}" opacity=".22"><rect width="10" height="10"/><rect x="10" y="10" width="10" height="10"/></g></pattern>`;
      case 'zigzag': return `<pattern ${u} width="16" height="10"><path d="M0 8L4 2L8 8L12 2L16 8" fill="none" stroke="${c}" stroke-width="1.4" opacity=".45"/></pattern>`;
      case 'cracks': return `<pattern ${u} width="100" height="100"><path d="M8 20L28 34L22 52L40 70M28 34L50 30L62 12M62 70L78 58L92 72M78 58L74 40" fill="none" stroke="${c}" stroke-width="1.3" opacity=".5"/></pattern>`;
      default: return '';
    }
  }

  /** Render one die face as an SVG string. */
  function render(face, kit, size = 48, cls = '') {
    const k = sanitize(kit) || PRESETS[0];
    const id = 'dk' + (++uid);
    const pat = k.pattern !== 'none' ? patternDef(id + 'p', k.pattern, k.edge) : '';
    let pips = '';
    if (face === 1 && k.wild !== 'pip') {
      pips = symbol(k.wild, C, Y, 19, k.pip, k.face);
    } else if (k.pipShape === 'number') {
      pips = `<text x="${C}" y="${Y + 2}" dominant-baseline="central" text-anchor="middle" font-family="'Pirata One',Georgia,serif" font-size="60" fill="${k.pip}">${face | 0}</text>`;
    } else {
      const r = face === 1 ? 13 : 8.5;
      pips = (LAYOUT[face] || LAYOUT[1]).map(([x, y]) => symbol(k.pipShape, x, y, r, k.pip, k.face)).join('');
    }
    return `<svg class="die ${cls}" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="die showing ${face | 0}">`
      + `<defs><linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${k.face}"/><stop offset="1" stop-color="${k.face2}"/></linearGradient>${pat}</defs>`
      + `<rect x="4" y="7" width="92" height="90" rx="${k.round}" fill="${k.edge}"/>`
      + `<rect x="4" y="3" width="92" height="90" rx="${k.round}" fill="url(#${id}g)" stroke="${k.edge}" stroke-width="3"/>`
      + (pat ? `<rect x="4" y="3" width="92" height="90" rx="${k.round}" fill="url(#${id}p)"/>` : '')
      + `<rect x="12" y="8" width="76" height="16" rx="${Math.min(k.round, 8)}" fill="#fff" opacity=".13"/>`
      + pips + '</svg>';
  }

  const HEX = /^#[0-9a-f]{6}$/i;
  function sanitize(kit) {
    if (!kit || typeof kit !== 'object') return null;
    const d = PRESETS[0];
    const col = (v, f) => (typeof v === 'string' && HEX.test(v)) ? v : f;
    return {
      id: String(kit.id || 'kit').replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'kit',
      name: String(kit.name || 'Dice').replace(/[\u0000-\u001f]/g, '').slice(0, 20),
      face: col(kit.face, d.face), face2: col(kit.face2, d.face2), pip: col(kit.pip, d.pip), edge: col(kit.edge, d.edge),
      pipShape: PIP_SHAPES.includes(kit.pipShape) ? kit.pipShape : 'dot',
      wild: WILD_SYMBOLS.includes(kit.wild) ? kit.wild : 'pip',
      pattern: PATTERNS.includes(kit.pattern) ? kit.pattern : 'none',
      round: Math.max(0, Math.min(40, Number(kit.round) || 0)),
      custom: !!kit.custom
    };
  }

  const randomPreset = () => ({ ...PRESETS[Math.floor(Math.random() * PRESETS.length)] });

  return { PRESETS, PIP_SHAPES, WILD_SYMBOLS, PATTERNS, LABELS, render, sanitize, randomPreset };
})();
