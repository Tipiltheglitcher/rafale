// Profil local (navigateur) : pseudo, crédits, objets possédés, apparence, statistiques, paramètres.
import { DEFAULT_COS, ITEMS, ITEM, sanitizeCos } from './cosmetics.js';

const KEY = 'rafale.profile.v1';

export const ACTIONS = [
  ['forward', 'Avancer', 'KeyW'], ['back', 'Reculer', 'KeyS'], ['left', 'Gauche', 'KeyA'], ['right', 'Droite', 'KeyD'],
  ['jump', 'Sauter', 'Space'], ['crouch', "S'accroupir", 'KeyC'], ['sprint', 'Sprinter', 'ShiftLeft'],
  ['reload', 'Recharger', 'KeyR'], ['use', 'Ramasser / interagir', 'KeyE'], ['drop', "Lâcher l'arme", 'KeyX'],
  ['heal', 'Trousse de soins', 'KeyH'], ['shield', 'Cellule de bouclier', 'KeyG'],
  ['s1', 'Emplacement 1', 'Digit1'], ['s2', 'Emplacement 2', 'Digit2'], ['s3', 'Emplacement 3', 'Digit3'], ['s4', 'Emplacement 4', 'Digit4'],
  ['map', 'Carte', 'KeyM'], ['score', 'Tableau des scores', 'Tab'], ['chat', 'Discussion', 'Enter'],
];

export const QUALITY = {
  low: { name: 'Basse', pr: 0.75, shadows: 0, view: 220 },
  medium: { name: 'Moyenne', pr: 1, shadows: 1024, view: 300 },
  high: { name: 'Haute', pr: 1.25, shadows: 2048, view: 400 },
  ultra: { name: 'Ultra', pr: 2, shadows: 4096, view: 470 },
};

export const DEFAULT_SETTINGS = {
  sens: 1, adsSens: 0.8, fov: 80, invertY: false, quality: 'high', volume: 0.8, showFps: false,
  xhColor: '#ffffff', xhStyle: 'cross', toggleAds: false, toggleCrouch: false,
  turnUrl: '', turnUser: '', turnPass: '', peerHost: '',
  keys: Object.fromEntries(ACTIONS.map((a) => [a[0], a[2]])),
};

function freshProfile() {
  return {
    name: 'Joueur' + String(1000 + ((Math.random() * 9000) | 0)),
    credits: 1500,
    owned: ITEMS.filter((i) => i.p === 0).map((i) => i.cat + ':' + i.id),
    cos: { ...DEFAULT_COS },
    stats: { matches: 0, wins: 0, kills: 0, deaths: 0, dmg: 0, top: 0 },
    settings: structuredClone(DEFAULT_SETTINGS),
    last: { mode: 'br', ts: 1, bots: 15, diff: 1 },
  };
}

export class Profile {
  constructor() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { d = null; }
    const f = freshProfile();
    const p = d && typeof d === 'object' ? d : f;
    this.name = typeof p.name === 'string' && p.name.trim() ? p.name.slice(0, 16) : f.name;
    this.credits = Number.isFinite(p.credits) ? p.credits : f.credits;
    this.owned = new Set([...(Array.isArray(p.owned) ? p.owned : []), ...f.owned].filter((k) => ITEM[k]));
    this.cos = sanitizeCos(p.cos);
    for (const c of ['outfit', 'head', 'back', 'wskin', 'tracer']) if (!this.owned.has(c + ':' + this.cos[c])) this.cos[c] = DEFAULT_COS[c];
    this.stats = { ...f.stats, ...(p.stats || {}) };
    this.settings = { ...f.settings, ...(p.settings || {}), keys: { ...f.settings.keys, ...((p.settings && p.settings.keys) || {}) } };
    this.last = { ...f.last, ...(p.last || {}) };
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ name: this.name, credits: this.credits, owned: [...this.owned], cos: this.cos, stats: this.stats, settings: this.settings, last: this.last }));
    } catch { /* stockage indisponible (navigation privée) : le profil reste en mémoire */ }
  }

  owns(cat, id) { return this.owned.has(cat + ':' + id); }

  buy(item) {
    if (this.owns(item.cat, item.id) || this.credits < item.p) return false;
    this.credits -= item.p;
    this.owned.add(item.cat + ':' + item.id);
    this.save();
    return true;
  }

  equip(cat, id) { if (this.owns(cat, id)) { this.cos[cat] = id; this.save(); } }

  reset() { localStorage.removeItem(KEY); }
}

/** Gains de fin de partie. */
export function reward(res, meId) {
  const me = res.st.find((s) => s.id === meId);
  if (!me) return { total: 0, lines: [] };
  const lines = [['Participation', 100], [`Éliminations ×${me.k}`, me.k * 40], ['Dégâts infligés', Math.round(me.dmg / 10)]];
  if (res.mode === 'br') {
    const p = me.p, bonus = p === 1 ? 400 : p <= 3 ? 200 : p <= 5 ? 100 : 0;
    if (bonus) lines.push([p === 1 ? 'Victoire royale' : `Top ${p <= 3 ? 3 : 5}`, bonus]);
  } else {
    const p = me.p, bonus = p === 1 ? 300 : p <= 3 ? 150 : 0;
    if (bonus) lines.push([p === 1 ? 'Première place' : 'Podium', bonus]);
  }
  return { total: lines.reduce((a, l) => a + l[1], 0), lines, me };
}
