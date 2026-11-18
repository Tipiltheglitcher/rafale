// IA des bots (exécutée chez l'hôte) : perception avec ligne de vue, choix d'objectif (butin, zone, chasse),
// navigation A*, combat (mitraillage latéral, gestion de la distance, rechargement, soins).
import { WEAPONS, RARITY } from '../data/weapons.js';
import { angDiff, clamp } from '../core/util.js';
import { PH, PHC } from '../world/world.js';
import { F } from './proto.js';

export const DIFF = [
  { name: 'Recrue', react: 0.75, aim: 2.4, dmg: 0.5, see: 60, turn: 3.2, fov: 0.35, err: 0.09 },
  { name: 'Soldat', react: 0.45, aim: 1.5, dmg: 0.7, see: 85, turn: 5.5, fov: 0.1, err: 0.06 },
  { name: 'Élite', react: 0.24, aim: 0.95, dmg: 0.9, see: 120, turn: 9, fov: -0.25, err: 0.035 },
];
const PREF = { pistol: 14, smg: 12, ar: 32, shotgun: 7, dmr: 55, sniper: 80, lmg: 30, launcher: 26, energy: 40 };
const CLSV = { pistol: 0.5, smg: 1, ar: 1.15, shotgun: 1, dmr: 1.05, sniper: 1.05, lmg: 1.1, launcher: 0.85, energy: 1.1 };

export function wScore(it, dist) {
  const W = WEAPONS[it.id];
  let s = CLSV[W.cls] * RARITY[it.r].dmg;
  if (dist !== undefined) s *= 1.4 - clamp(Math.abs(dist - PREF[W.cls]) / (PREF[W.cls] + 25), 0, 1);
  return s;
}

export function botInit(S, e) {
  e.ch = { x: e.x, y: e.y, z: e.z, vx: 0, vy: 0, vz: 0, onGround: true, h: PH, glide: false };
  e.ai = {
    path: null, pi: 0, goalT: 0, tgt: 0, vis: false, lastSeen: -99, lx: 0, lz: 0, seeT: 0, errY: 0, errP: 0,
    fireT: 0, burst: 0, relT: 0, strafe: 1, strafeT: 0, crouch: false, hurtBy: 0, hurtT: -99,
    lootId: 0, ignore: new Set(), think: Math.random() * 0.3, healT: 0, healK: '', sx: e.x, sz: e.z, stuckT: 0, jump: false, wselT: 0,
  };
}

const ammoOk = (e, it) => it.mag > 0 || e.inv.ammo[WEAPONS[it.id].ammo] > 0;

function useful(e, L) {
  const inv = e.inv;
  if (L.k === 'w') {
    if (inv.w.includes(null)) return true;
    let ws = 1e9;
    for (const it of inv.w) ws = Math.min(ws, wScore(it));
    return wScore({ id: L.a, r: L.b }) > ws + 0.05;
  }
  if (L.k === 'a') return inv.w.some((it) => it && WEAPONS[it.id].ammo === L.a) && inv.ammo[L.a] < 120;
  if (L.k === 'm') return inv.med < 3;
  if (L.k === 'c') return inv.cell < 3;
  return false;
}

function grab(S, e, L) {
  const inv = e.inv;
  if (L.k === 'w' && !inv.w.includes(null)) {
    let worst = 0, ws = 1e9;
    inv.w.forEach((it, i) => { const s = wScore(it); if (s < ws) { ws = s; worst = i; } });
    inv.slot = worst;
  }
  S.take(e, L, true);
}

function setPath(S, e, gx, gz) {
  const M = S.match, ai = e.ai;
  if (M.pathBudget <= 0) { ai.goalT = 0; return false; }
  M.pathBudget--;
  const p = M.world.findPath(e.ch.x, e.ch.z, gx, gz);
  ai.path = p; ai.pi = 0;
  ai.goalT = 6 + Math.random() * 4;
  return !!p;
}

function chooseGoal(S, e) {
  const M = S.match, W = M.world, ai = e.ai, rng = Math.random;
  ai.lootId = 0;
  // 1. poursuivre la dernière position connue d'un ennemi
  if (ai.tgt && M.t - ai.lastSeen < 6) return setPath(S, e, ai.lx, ai.lz);
  // 2. rentrer dans la zone
  if (M.mode === 'br') {
    const z = M.zone, zn = S.zoneNow();
    const dNext = Math.hypot(e.x - z.nx, e.z - z.nz), dNow = Math.hypot(e.x - zn.x, e.z - zn.z);
    if (dNow > zn.r * 0.92 || (dNext > z.nr * 0.85 && M.t > z.t0 - 25)) {
      const p = W.randomOpen(Math.random, z.nx, z.nz, Math.max(4, z.nr * 0.6));
      return setPath(S, e, p[0], p[1]);
    }
  }
  // 3. butin utile à proximité
  const need = M.mode === 'br' && (e.inv.w.filter(Boolean).length < 2 || e.inv.med < 2 || rng() < 0.4);
  if (need) {
    let best = null, bd = 45 * 45;
    for (const L of M.loot.values()) {
      if (ai.ignore.has(L.id)) continue;
      const d = (L.x - e.x) ** 2 + (L.z - e.z) ** 2;
      if (d < bd && useful(e, L)) { bd = d; best = L; }
    }
    if (best) { ai.lootId = best.id; return setPath(S, e, best.x, best.z); }
  }
  // 4. chasse (JcJ) ou patrouille
  if (M.mode === 'ffa' && rng() < 0.65) {
    let best = null, bd = 1e9;
    for (const o of M.ents.values()) if (o.alive && o !== e) { const d = (o.x - e.x) ** 2 + (o.z - e.z) ** 2; if (d < bd) { bd = d; best = o; } }
    if (best) return setPath(S, e, best.x + (rng() - 0.5) * 16, best.z + (rng() - 0.5) * 16);
  }
  let cx = e.x, cz = e.z, r = 35;
  if (M.mode === 'br') { const zn = S.zoneNow(); const k = 0.5; cx = cx + (zn.x - cx) * k; cz = cz + (zn.z - cz) * k; r = Math.min(40, zn.r * 0.7); }
  else { cx *= 0.5; cz *= 0.5; r = Math.min(r, W.arenaR - 10); }
  const p = W.randomOpen(Math.random, cx, cz, r);
  return setPath(S, e, p[0], p[1]);
}

function perceive(S, e, D) {
  const M = S.match, W = M.world, ai = e.ai;
  const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw), cands = [];
  for (const o of M.ents.values()) {
    if (!o.alive || o.team === e.team) continue;
    const dx = o.x - e.x, dz = o.z - e.z, d = Math.hypot(dx, dz);
    if (d > D.see) continue;
    const hurt = ai.hurtBy === o.id && M.t - ai.hurtT < 3;
    if (!hurt && M.mode === 'br' && M.t < 20) continue; // début de partie : les bots pillent, le temps que tout le monde atterrisse
    if (!hurt && d > 5 && o.id !== ai.tgt && (dx * fx + dz * fz) / d < D.fov) continue;
    cands.push([o.id === ai.tgt ? d * 0.5 : d, o]);
  }
  cands.sort((a, b) => a[0] - b[0]);
  let vis = null;
  for (let i = 0; i < cands.length && i < 3; i++) {
    const o = cands[i][1];
    if (W.los(e.x, e.y + 1.55, e.z, o.x, o.y + 1.3, o.z)) { vis = o; break; }
  }
  if (vis) {
    if (ai.tgt !== vis.id) { ai.tgt = vis.id; ai.seeT = 0; ai.errY = (Math.random() - 0.5) * D.err * 6; ai.errP = (Math.random() - 0.5) * D.err * 3; }
    ai.vis = true; ai.lastSeen = M.t; ai.lx = vis.x; ai.lz = vis.z;
  } else {
    ai.vis = false;
    if (ai.tgt && M.t - ai.lastSeen > 6) ai.tgt = 0;
  }
}

function pickWeapon(e, dist) {
  let best = e.inv.slot, bs = -1;
  e.inv.w.forEach((it, i) => {
    if (!it || !ammoOk(e, it)) return;
    const W = WEAPONS[it.id];
    if (W.proj && dist < 7) return;
    const s = wScore(it, dist);
    if (s > bs) { bs = s; best = i; }
  });
  if (best !== e.inv.slot) { e.inv.slot = best; e.ai.fireT = Math.max(e.ai.fireT, 0.4); e.ai.relT = 0; }
}

function startReload(e, it) { e.ai.relT = WEAPONS[it.id].reload * RARITY[it.r].rl; }
function finishReload(e) {
  const it = e.inv.w[e.inv.slot];
  if (!it) return;
  const W = WEAPONS[it.id];
  let n = Math.min(W.mag - it.mag, e.inv.ammo[W.ammo]);
  if (n > 0) e.inv.ammo[W.ammo] -= n;
  else n = Math.ceil((W.mag - it.mag) / 2); // les bots ne restent jamais totalement à sec
  it.mag += n;
}

function combat(S, e, D, tgt, dt) {
  const M = S.match, ai = e.ai;
  ai.fireT -= dt;
  if (ai.relT > 0) { ai.relT -= dt; if (ai.relT <= 0) finishReload(e); return; }
  const cur = e.inv.w[e.inv.slot];
  if (!tgt || !ai.vis) {
    if (cur && cur.mag < WEAPONS[cur.id].mag * 0.5 && M.t - ai.lastSeen > 1.5) startReload(e, cur);
    return;
  }
  ai.seeT += dt;
  const dx = tgt.x - e.x, dz = tgt.z - e.z, dist = Math.hypot(dx, dz);
  ai.wselT -= dt;
  if (ai.wselT <= 0 || !cur) { ai.wselT = 1.5; pickWeapon(e, dist); }
  const it = e.inv.w[e.inv.slot];
  if (!it) return;
  const W = WEAPONS[it.id];
  if (it.mag <= 0) { if (e.inv.ammo[W.ammo] > 0 || !e.inv.w.some((o) => o && o !== it && ammoOk(e, o))) startReload(e, it); else pickWeapon(e, dist); return; }
  if (ai.seeT < D.react || ai.fireT > 0) return;
  if (!W.proj && W.r1 && dist > W.r1 * 1.25) return;
  const want = Math.atan2(-dx, -dz);
  if (Math.abs(angDiff(e.yaw, want)) > 0.35) return;

  const cp = Math.cos(e.pitch), oy = e.y + (e.fl & F.CROUCH ? 1.15 : 1.55);
  let ddx = -Math.sin(e.yaw) * cp, ddy = Math.sin(e.pitch), ddz = -Math.cos(e.yaw) * cp;
  e.prot = 0;
  it.mag--;
  if (W.proj) {
    if (W.proj === 'grenade') { ddy += clamp(dist / 70, 0.05, 0.6); const l = Math.hypot(ddx, ddy, ddz); ddx /= l; ddy /= l; ddz /= l; }
    S.launch(e, it, e.x, oy, e.z, ddx, ddy, ddz);
    ai.fireT = 60 / W.rpm + 0.3;
  } else {
    const spread = Math.max(W.ads, W.hip * 0.55) * (0.6 + D.aim * 0.4) * (ai.crouch ? 0.85 : 1);
    S.fireHitscan(e, it, e.x, oy, e.z, ddx, ddy, ddz, spread, D.dmg);
    if (W.burst) { ai.burst = (ai.burst + 1) % W.burst; ai.fireT = ai.burst ? 60 / W.rpm : W.burstDelay + 0.15; }
    else ai.fireT = (60 / W.rpm) * (W.auto ? 1 : 1.5) + (W.auto ? 0 : 0.08);
    // la précision s'affine en restant sur la cible, puis dérive de temps en temps
    ai.errY *= 0.8; ai.errP *= 0.8;
    if (Math.random() < 0.08) { ai.errY = (Math.random() - 0.5) * D.err * 4; ai.errP = (Math.random() - 0.5) * D.err * 2; }
  }
}

export function botUpdate(S, e, dt) {
  if (!e.alive) return;
  const M = S.match, W = M.world, ai = e.ai, ch = e.ch, D = DIFF[S.cfg.diff] || DIFF[1];
  ai.think -= dt;
  if (ai.think <= 0) {
    ai.think = 0.22 + Math.random() * 0.08;
    perceive(S, e, D);
    if (!ai.vis) {
      ai.goalT -= 0.25;
      if (ai.lootId) {
        const L = M.loot.get(ai.lootId);
        if (!L || !useful(e, L)) { ai.lootId = 0; ai.goalT = 0; }
        else if (Math.hypot(L.x - ch.x, L.z - ch.z) < 1.7 && Math.abs(L.y - ch.y) < 2) { grab(S, e, L); ai.ignore.add(L.id); ai.lootId = 0; ai.goalT = 0; }
      }
      if (!ai.path || ai.goalT <= 0) chooseGoal(S, e);
      // soins hors combat
      if (ai.healT <= 0 && M.t - ai.lastSeen > 3) {
        if (e.hp < 65 && e.inv.med > 0) { ai.healT = 1.6; ai.healK = 'med'; }
        else if (e.sh < 50 && e.inv.cell > 0) { ai.healT = 1.6; ai.healK = 'cell'; }
      }
    } else ai.healT = 0;
  }
  if (ai.healT > 0) { ai.healT -= dt; if (ai.healT <= 0) S.useItem(e, ai.healK); }

  let tgt = ai.tgt ? M.ents.get(ai.tgt) : null;
  if (tgt && !tgt.alive) { tgt = null; ai.tgt = 0; ai.vis = false; }

  let mx = 0, mz = 0, speed = 5.2, jump = false;
  const P = ai.path;
  if (P && ai.pi < P.length) {
    const p = P[ai.pi], dx = p[0] - ch.x, dz = p[1] - ch.z, d = Math.hypot(dx, dz);
    if (d < 0.75) { ai.pi++; if (ai.pi >= P.length) ai.path = null; } else { mx = dx / d; mz = dz / d; }
  }
  if (ai.healT > 0) speed = 2.4;
  let lookYaw = mx || mz ? Math.atan2(-mx, -mz) : e.yaw, lookPitch = 0;
  if (tgt && (ai.vis || M.t - ai.lastSeen < 1.5)) {
    const dx = tgt.x - e.x, dz = tgt.z - e.z, dist = Math.max(0.1, Math.hypot(dx, dz));
    const ty = tgt.y + (tgt.fl & F.CROUCH ? 1.0 : 1.3);
    lookYaw = Math.atan2(-dx, -dz) + ai.errY;
    lookPitch = Math.atan2(ty - (e.y + 1.55), dist) + ai.errP;
    if (ai.vis) {
      ai.path = null;
      const it = e.inv.w[e.inv.slot], pref = it ? PREF[WEAPONS[it.id].cls] : 10;
      const fx = dx / dist, fz = dz / dist;
      let ax = -fz * ai.strafe, az = fx * ai.strafe;
      if (dist > pref * 1.4) { ax += fx * 1.5; az += fz * 1.5; } else if (dist < pref * 0.6) { ax -= fx; az -= fz; }
      const l = Math.hypot(ax, az) || 1;
      mx = ax / l; mz = az / l; speed = 3.8;
      ai.strafeT -= dt;
      if (ai.strafeT <= 0) {
        ai.strafe = Math.random() < 0.5 ? -1 : 1; ai.strafeT = 0.5 + Math.random() * 1.4;
        ai.crouch = Math.random() < 0.22;
        if (Math.random() < 0.12) jump = true;
      }
      if (!W.isOpen(ch.x + mx * 1.3, ch.z + mz * 1.3)) { ai.strafe = -ai.strafe; mx = -mx; mz = -mz; }
    }
  } else ai.crouch = false;

  const turn = D.turn * dt;
  e.yaw += clamp(angDiff(e.yaw, lookYaw), -turn, turn);
  e.pitch += clamp(lookPitch - e.pitch, -turn * 0.6, turn * 0.6);

  // détection de blocage
  ai.stuckT += dt;
  if (ai.stuckT > 1.3) {
    const moved = Math.hypot(ch.x - ai.sx, ch.z - ai.sz);
    if ((mx || mz) && moved < 0.45) { jump = true; ai.path = null; ai.goalT = 0; ai.strafe = -ai.strafe; }
    ai.sx = ch.x; ai.sz = ch.z; ai.stuckT = 0;
  }

  const crouch = ai.crouch;
  ch.h = crouch ? PHC : PH;
  if (crouch) speed = Math.min(speed, 2.6);
  W.stepChar(ch, mx, mz, mx || mz ? speed : 0, jump, dt);
  e.x = ch.x; e.y = ch.y; e.z = ch.z;
  e.fl = (ch.onGround ? F.GROUND : 0) | (crouch ? F.CROUCH : 0) | (ai.relT > 0 ? F.RELOAD : 0) | (speed > 5 && (mx || mz) ? F.SPRINT : 0) | (ai.vis ? F.ADS : 0);
  combat(S, e, D, tgt, dt);
}
