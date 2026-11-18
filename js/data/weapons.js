// Arsenal : statistiques de toutes les armes + fonctions balistiques partagées par l'hôte et les clients.
import { mulberry32 } from '../core/util.js';

export const AMMO = {
  light: { name: 'Légères', color: '#f2c14e', pack: 40 },
  medium: { name: 'Moyennes', color: '#e07a3f', pack: 30 },
  heavy: { name: 'Lourdes', color: '#d05050', pack: 10 },
  shell: { name: 'Cartouches', color: '#d94f8a', pack: 8 },
  rocket: { name: 'Explosifs', color: '#9aa0a8', pack: 3 },
  cell: { name: 'Cellules', color: '#4fd9e8', pack: 16 },
};
export const AMMO_TYPES = Object.keys(AMMO);

export const RARITY = [
  { name: 'Commun', color: '#b8bcc4', hex: 0xb8bcc4, dmg: 1, rl: 1 },
  { name: 'Rare', color: '#3d9bff', hex: 0x3d9bff, dmg: 1.07, rl: 0.95 },
  { name: 'Épique', color: '#b967ff', hex: 0xb967ff, dmg: 1.14, rl: 0.9 },
  { name: 'Légendaire', color: '#ffb52e', hex: 0xffb52e, dmg: 1.22, rl: 0.84 },
];

const CLS = { pistol: 'Pistolet', smg: 'Mitraillette', ar: "Fusil d'assaut", shotgun: 'Fusil à pompe', dmr: 'Fusil de précision', sniper: 'Fusil de sniper', lmg: 'Mitrailleuse', launcher: 'Lanceur', energy: 'Arme à énergie' };

// dmg = dégâts par balle (ou par plomb) · rpm = cadence · hip/ads = dispersion en degrés · r0/r1/rmin = portée utile
const W = [
  { id: 'p9', name: 'P9 Vipère', cls: 'pistol', ammo: 'light', dmg: 22, head: 1.8, rpm: 420, mag: 15, reload: 1.3, hip: 1.6, ads: 0.5, bloom: 0.5, recoil: 1.1, r0: 18, r1: 45, rmin: 0.55, zoom: 1.25, w: 10 },
  { id: 'rex', name: 'Rex .50', cls: 'pistol', ammo: 'heavy', dmg: 55, head: 2, rpm: 150, mag: 7, reload: 1.8, hip: 1.8, ads: 0.35, bloom: 1.2, recoil: 4.2, r0: 30, r1: 70, rmin: 0.6, zoom: 1.3, w: 6 },
  { id: 'guepe', name: 'Guêpe MP', cls: 'smg', ammo: 'light', dmg: 15, head: 1.6, rpm: 1050, mag: 22, reload: 1.4, hip: 2.6, ads: 1.4, bloom: 0.35, recoil: 0.8, auto: 1, r0: 10, r1: 30, rmin: 0.45, zoom: 1.2, w: 7, one: 1 },
  { id: 'frelon', name: 'Frelon SMG', cls: 'smg', ammo: 'light', dmg: 18, head: 1.6, rpm: 820, mag: 30, reload: 1.8, hip: 2.2, ads: 1.0, bloom: 0.3, recoil: 0.75, auto: 1, r0: 14, r1: 38, rmin: 0.5, zoom: 1.25, w: 9 },
  { id: 'vecteur', name: 'Vecteur-45', cls: 'smg', ammo: 'light', dmg: 21, head: 1.6, rpm: 660, mag: 26, reload: 1.9, hip: 1.7, ads: 0.7, bloom: 0.28, recoil: 0.7, auto: 1, r0: 18, r1: 45, rmin: 0.55, zoom: 1.3, w: 7 },
  { id: 'mistral', name: 'AR-7 Mistral', cls: 'ar', ammo: 'medium', dmg: 26, head: 1.7, rpm: 600, mag: 30, reload: 2.1, hip: 2.0, ads: 0.45, bloom: 0.28, recoil: 0.95, auto: 1, r0: 40, r1: 90, rmin: 0.65, zoom: 1.45, w: 10 },
  { id: 'kodiak', name: 'Kodiak 762', cls: 'ar', ammo: 'medium', dmg: 34, head: 1.7, rpm: 470, mag: 30, reload: 2.4, hip: 2.4, ads: 0.55, bloom: 0.4, recoil: 1.6, auto: 1, r0: 45, r1: 100, rmin: 0.7, zoom: 1.45, w: 8 },
  { id: 'faucon', name: 'Faucon B3', cls: 'ar', ammo: 'medium', dmg: 30, head: 1.8, rpm: 900, burst: 3, burstDelay: 0.34, mag: 30, reload: 2.2, hip: 1.8, ads: 0.3, bloom: 0.2, recoil: 0.9, r0: 50, r1: 110, rmin: 0.7, zoom: 1.6, w: 7 },
  { id: 'brise', name: 'Brise-Porte', cls: 'shotgun', ammo: 'shell', dmg: 11, pellets: 9, head: 1.3, rpm: 68, mag: 6, reload: 3.0, hip: 4.2, ads: 3.4, bloom: 0, recoil: 5, r0: 8, r1: 26, rmin: 0.3, zoom: 1.15, w: 8 },
  { id: 'tempete', name: 'Tempête 12', cls: 'shotgun', ammo: 'shell', dmg: 8, pellets: 8, head: 1.3, rpm: 210, mag: 8, reload: 2.8, hip: 5, ads: 4.2, bloom: 0, recoil: 2.6, auto: 1, r0: 7, r1: 22, rmin: 0.3, zoom: 1.15, w: 5 },
  { id: 'chasseur', name: 'Chasseur DMR', cls: 'dmr', ammo: 'heavy', dmg: 48, head: 1.9, rpm: 230, mag: 12, reload: 2.3, hip: 3, ads: 0.12, bloom: 0.6, recoil: 2.4, r0: 70, r1: 160, rmin: 0.8, zoom: 2.6, w: 6 },
  { id: 'longuevue', name: 'Longue-Vue .338', cls: 'sniper', ammo: 'heavy', dmg: 105, head: 2.3, rpm: 42, mag: 5, reload: 3.0, hip: 5, ads: 0.02, bloom: 0, recoil: 6, r0: 150, r1: 300, rmin: 0.85, zoom: 5, scope: 1, w: 4, minR: 1 },
  { id: 'titan', name: 'Titan LMG', cls: 'lmg', ammo: 'medium', dmg: 27, head: 1.6, rpm: 640, mag: 80, reload: 4.4, hip: 2.8, ads: 0.8, bloom: 0.22, recoil: 0.9, auto: 1, r0: 45, r1: 100, rmin: 0.7, zoom: 1.4, move: 0.88, w: 4, minR: 1 },
  { id: 'volcan', name: 'Volcan RPG', cls: 'launcher', ammo: 'rocket', dmg: 115, radius: 6.5, rpm: 40, mag: 1, reload: 2.9, hip: 0.5, ads: 0.2, bloom: 0, recoil: 5, proj: 'rocket', speed: 55, zoom: 1.3, move: 0.9, w: 2.5, minR: 2 },
  { id: 'mortier', name: 'Mortier GL', cls: 'launcher', ammo: 'rocket', dmg: 80, radius: 5, rpm: 80, mag: 6, reload: 3.2, hip: 0.5, ads: 0.2, bloom: 0, recoil: 3, proj: 'grenade', speed: 32, zoom: 1.2, w: 2.5, minR: 1 },
  { id: 'eclair', name: 'Éclair Railgun', cls: 'energy', ammo: 'cell', dmg: 82, head: 1.7, rpm: 52, mag: 4, reload: 2.7, hip: 1.2, ads: 0.05, bloom: 0, recoil: 3.5, r0: 200, r1: 300, rmin: 1, zoom: 2.2, beam: 1, w: 3, minR: 2 },
  { id: 'nova', name: 'Nova PR', cls: 'energy', ammo: 'cell', dmg: 19, head: 1.5, rpm: 720, mag: 45, reload: 2.3, hip: 1.6, ads: 0.6, bloom: 0.16, recoil: 0.45, auto: 1, r0: 35, r1: 80, rmin: 0.7, zoom: 1.4, plasma: 1, w: 4, minR: 1 },
];
W.forEach((w, i) => { w.idx = i; w.clsName = CLS[w.cls]; w.pellets = w.pellets || 1; w.head = w.head || 1; w.move = w.move || 1; w.minR = w.minR || 0; });

export const WLIST = W;
export const WEAPONS = Object.fromEntries(W.map((w) => [w.id, w]));
export const MAX_RANGE = 320;

export function falloff(w, d) {
  if (w.proj || d <= w.r0) return 1;
  if (d >= w.r1) return w.rmin;
  return 1 + ((w.rmin - 1) * (d - w.r0)) / (w.r1 - w.r0);
}

/** Direction d'un plomb/d'une balle : cône de dispersion déterministe (seed) autour de la visée. */
export function pelletDir(dx, dy, dz, spreadDeg, seed, i, out) {
  const r = mulberry32((seed + 1) * 2654435 + i * 40503);
  const a = r() * 6.2832, m = Math.tan(spreadDeg * 0.017453) * Math.sqrt(r());
  let ux, uz;
  const l = Math.hypot(dx, dz);
  if (l > 0.01) { ux = -dz / l; uz = dx / l; } else { ux = 1; uz = 0; }
  const vx = dy * uz, vy = dz * ux - dx * uz, vz = -dy * ux;
  const ca = Math.cos(a) * m, sa = Math.sin(a) * m;
  const x = dx + ux * ca + vx * sa, y = dy + vy * sa, z = dz + uz * ca + vz * sa, n = Math.hypot(x, y, z);
  out[0] = x / n; out[1] = y / n; out[2] = z / n;
  return out;
}

/**
 * Intersection rayon / joueur (tête = sphère, corps = cylindre). Renvoie la distance, ou -1.
 * rayPlayer.head indique si la tête a été touchée.
 */
export function rayPlayer(ox, oy, oz, dx, dy, dz, px, py, pz, crouch, maxT) {
  let best = -1;
  rayPlayer.head = false;
  const hy = py + (crouch ? 1.2 : 1.63), hr = 0.21;
  let lx = px - ox, ly = hy - oy, lz = pz - oz;
  let b = lx * dx + ly * dy + lz * dz, c = lx * lx + ly * ly + lz * lz - hr * hr, disc = b * b - c;
  if (disc >= 0) { const t = b - Math.sqrt(disc); if (t > 0 && t < maxT) { best = t; rayPlayer.head = true; } }
  const top = py + (crouch ? 1.05 : 1.48), r = 0.36, a = dx * dx + dz * dz;
  if (a > 1e-8) {
    lx = ox - px; lz = oz - pz;
    b = lx * dx + lz * dz; c = lx * lx + lz * lz - r * r; disc = b * b - a * c;
    if (disc >= 0) {
      let t = (-b - Math.sqrt(disc)) / a;
      if (t > 0 && t < maxT) {
        const y = oy + dy * t;
        if (y > top && dy < 0) { t = (top - oy) / dy; const ex = ox + dx * t - px, ez = oz + dz * t - pz; if (ex * ex + ez * ez > r * r) t = -1; }
        else if (y < py || y > top) t = -1;
        if (t > 0 && t < maxT && (best < 0 || t < best)) { best = t; rayPlayer.head = false; }
      }
    }
  }
  return best;
}

// ---------- butin ----------
export function rollRarity(rng, luck = 0) {
  const r = rng() - luck;
  return r < 0.04 ? 3 : r < 0.16 ? 2 : r < 0.45 ? 1 : 0;
}
export function rollWeapon(rng, luck = 0) {
  const rar = rollRarity(rng, luck);
  const pool = W.filter((w) => w.minR <= rar);
  let tot = 0;
  for (const w of pool) tot += w.w;
  let r = rng() * tot;
  for (const w of pool) { r -= w.w; if (r <= 0) return [w.id, rar]; }
  return [pool[0].id, rar];
}
