'use strict';
/* Bones & Brine — chat language filter.
   Catches swearing and slurs in English and German, including common disguises:
   leetspeak (5h1t, @ss), stretched letters (fuuuck), spaced or dotted letters (f u c k, f.u.c.k)
   and umlauts. Censored words are replaced with ★ symbols. Pirate words like "arr" are left alone. */
const Chat = (() => {
  // Words that are bad anywhere inside a longer word (e.g. "motherfucker", "bullshit").
  const ROOTS = [
    'fuck', 'fuk', 'fck', 'fuq', 'phuck', 'shit', 'sh1t', 'cunt', 'bitch', 'biatch', 'whore', 'slut', 'bastard', 'asshole', 'arsehole',
    'dickhead', 'cocksucker', 'motherf', 'wanker', 'twat', 'bollock', 'nigger', 'nigga', 'faggot', 'fagot', 'retard', 'tranny', 'kike',
    'spic', 'chink', 'gook', 'wetback', 'raghead', 'pussy', 'dildo', 'jizz', 'cum', 'porn', 'rape', 'nazi', 'hitler', 'kys',
    // German
    'scheiss', 'scheis', 'arschloch', 'fotze', 'hurensohn', 'wichser', 'wixxer', 'wixer', 'ficken', 'fick', 'schlampe', 'missgeburt',
    'spast', 'mongo', 'neger', 'schwuchtel', 'kanake', 'nutte', 'hure', 'pisser', 'drecksau'
  ];
  // Words that only count as a whole word (they appear innocently inside other words: "class", "Dickens", "assume").
  const WHOLE = [
    'ass', 'arse', 'dick', 'cock', 'tits', 'tit', 'fag', 'fags', 'piss', 'prick', 'hoe', 'hoes', 'douche', 'jerkoff', 'stfu',
    'gtfo', 'milf', 'dumbass', 'arsch', 'behindert', 'schwanz'
  ];
  // Innocent words that contain a root and must never be censored.
  const SAFE = ['scunthorpe', 'cumberland', 'cucumber', 'circumstance', 'document', 'accumulate', 'cumulative', 'therapist', 'grape', 'drape',
    'scrape', 'rapeseed', 'spice', 'spick', 'spicy', 'despicable', 'cocktail', 'peacock', 'hancock', 'shitake', 'shiitake', 'fickle',
    'opferbereit', 'hurensohnfrei', 'nazir', 'assassin', 'classic', 'passion', 'pussycat', 'pissarro', 'chinkapin', 'cumin', 'kumquat',
    'basement', 'bassoon', 'snigger', 'niggard', 'dickens', 'parapet', 'trapeze', 'conspicuous', 'auspicious', 'perspicac',
    'mongoose', 'mongolia', 'skyscraper', 'spicule'];

  const LEET = { '0': 'o', '1': 'i', '!': 'i', '|': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '+': 't', '8': 'b', '9': 'g', 'ä': 'a', 'ö': 'o', 'ü': 'u', 'ß': 'ss', '€': 'e', '¢': 'c' };
  const norm = s => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[01!|34@5$7+89äöüß€¢]/g, c => LEET[c] || c);
  const squash = s => s.replace(/(.)\1+/g, '$1');            // fuuuuck -> fuck

  function badToken(t) {
    if (!t) return false;
    const n = norm(t).replace(/[^a-z]/g, '');
    if (!n) return false;
    const variants = [n, squash(n)];
    if (SAFE.some(w => n.includes(w))) return false;
    for (const v of variants) {
      if (WHOLE.includes(v)) return true;
      if (ROOTS.some(r => r.length >= 4 ? v.includes(r) : v === r || v.startsWith(r) && v.length <= r.length + 2)) return true;
    }
    return false;
  }

  // control characters and invisible / direction-changing characters people use to dodge filters
  const CTRL = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(0x200b) + '-' + String.fromCharCode(0x200f) +
    String.fromCharCode(0x2028) + '-' + String.fromCharCode(0x202e) + String.fromCharCode(0xfeff) + ']', 'g');

  /** Returns { text, flagged }. `text` has offending words replaced with ★s. */
  function censor(input) {
    let text = String(input || '').replace(CTRL, '').slice(0, 200);
    let flagged = false;
    // 1) spaced or dotted out words: "f u c k", "s.h.i.t", "f-u-c-k"
    text = text.replace(/\b(?:[a-zA-Z0-9@$!][\s._\-*]+){2,}[a-zA-Z0-9@$!]\b/g, m => {
      const joined = m.replace(/[\s._\-*]+/g, '');
      if (badToken(joined)) { flagged = true; return '★'.repeat(joined.length); }
      return m;
    });
    // 2) ordinary words (letters, digits and leet symbols)
    text = text.replace(/[\p{L}\p{N}@$!|+€¢]+/gu, w => {
      if (badToken(w)) { flagged = true; return '★'.repeat([...w].length); }
      return w;
    });
    return { text, flagged };
  }

  return { censor, badToken };
})();
