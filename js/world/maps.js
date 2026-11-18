// Les 5 cartes du jeu. Chaque carte = une ambiance (env), un relief (shape) et un générateur (generate).
import { clamp, fbm, lerp, smooth } from '../core/util.js';
import { STYLES, shade } from './mapgen.js';

const CONT = [0xb5432e, 0x2e6fb5, 0x3f8f4f, 0xd9a520, 0x7a7f86, 0xc96a1e, 0x1f8f8a, 0x8a3a6a, 0xd8d4cc];
const CARS = [0xb8322a, 0x2a5aa8, 0xd8d8d4, 0x2c2e34, 0xd9a520, 0x3a8a5a, 0x7a3a8a, 0xc96a1e];
const NEON = [0xff2a6d, 0x05d9e8, 0xf9f002, 0xb967ff, 0x01ff89, 0xff6b1a, 0x3d8bff];

export const riverZ = (x) => 55 * Math.sin(x * 0.018 + 1) + 20 * Math.sin(x * 0.05);

// ------------------------------------------------------------------ 1. PORT BRISÉ
const port = {
  id: 'port', name: 'Port Brisé', tag: 'Docks industriels', size: 400, arenaR: 78,
  desc: 'Un terminal à conteneurs abandonné : allées étroites, entrepôts géants et un cargo à quai.',
  env: {
    skyTop: 0x4a86c8, skyHor: 0xc9dcec, fog: [0xbfd3e4, 70, 430],
    sun: { dir: [0.5, 0.8, 0.3], color: 0xfff2dc, int: 2.6 }, hemi: { sky: 0xbfd8ff, ground: 0x6a6456, int: 0.95 },
    water: { level: 0.6, color: 0x2a6a8a },
  },
  ground: { c: [0x6a6e64, 0x7c7a6a], steep: 0x5a5a54, shore: 0x8a8468, paint: { 1: 0x3a3c40, 2: 0x7a6a50, 3: 0x8e8f8c, 4: 0xcbb98a } },
  shape(x, z, s) {
    let h = 2.2 + fbm(x * 0.012, z * 0.012, s) * 0.9;
    h += fbm(x * 0.02, z * 0.02, s + 7) * 7 * smooth(clamp((-135 - z) / 50, 0, 1));
    return lerp(h, -5, smooth(clamp((z - 152) / 8, 0, 1)));
  },
  generate(B) {
    B.flat(0, 0, 156, 104, 2.4, 10); B.paint(0, 0, 162, 110, 3);
    B.flat(0, 140, 384, 16, 2.3, 4); B.paint(0, 140, 392, 24, 3);
    B.paint(0, -68, 384, 12, 1); B.paint(0, 68, 384, 12, 1); B.paint(-98, 0, 12, 290, 1); B.paint(98, 0, 12, 290, 1);
    // parc à conteneurs
    for (let j = -4; j <= 4; j++) for (let i = -5; i <= 5; i++) {
      if (i === 0 && j & 1) continue;
      const x = i * 13.6, z = j * 11;
      if (B.chance(0.22)) { if (B.chance(0.55)) B.crates(x + B.rnd(-3, 3), z, B.ri(1, 3), 2.35); continue; }
      const n = B.pick([1, 1, 2, 2, 2, 3]);
      for (let l = 0; l < n; l++) B.container(x, z, true, B.pick(CONT), 2.38 + l * 2.6, 12.2, n === 1 && B.chance(0.4));
      B.rect(x, z, 12.6, 2.8);
      if (n < 3 && B.chance(0.34)) B.box(x - 0.8, 2.3, z + 1.22, x + 0.8, 2.38 + n * 2.6, z + 1.22 + 3.3 * n, 'metal', 0x8a8f96, { ramp: 4 });
      if (B.chance(0.5)) B.loot(x + B.rnd(-4, 4), 2.43 + n * 2.6, z, true);
      if (B.chance(0.5)) B.loot(x + B.rnd(-5, 5), 2.45, z - 3.2);
    }
    // entrepôts
    B.warehouse(-138, -26, 36, 26, 8.5, 0x6f8fa8, true); B.warehouse(-138, 30, 36, 24, 8.5, 0xa8644a, true);
    B.warehouse(138, -26, 36, 26, 8.5, 0x8a9a8a, true); B.warehouse(138, 30, 36, 24, 8.5, 0x6f8fa8, true);
    B.warehouse(0, 104, 44, 24, 9, 0xc9c4b4, false);
    // bureaux
    B.house(-52, -100, 14, 10, { floors: 2, st: STYLES.brick }); B.house(0, -106, 16, 11, { floors: 2, st: STYLES.concrete });
    B.house(52, -100, 14, 10, { floors: 2, st: STYLES.brick }); B.house(-142, -104, 12, 9, { st: STYLES.concrete, roof: true });
    B.house(142, -104, 12, 9, { st: STYLES.concrete, roof: true }); B.house(-150, 104, 11, 9, { floors: 2, st: STYLES.metal });
    B.house(150, 104, 11, 9, { floors: 2, st: STYLES.metal });
    // silos et cuves
    let g = B.flat(-64, -150, 40, 28); B.rect(-64, -150, 40, 28); B.paint(-64, -150, 44, 32, 3);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      B.cyl(-76 + i * 12, g - 1, -156 + j * 12, 4.8, 17, 'metal', 0xc9c4b4); B.cyl(-76 + i * 12, g + 16, -156 + j * 12, 1.4, 1.6, 'metal', 0x8a8f96, { nc: 1 });
    }
    B.loot(-70, g + 0.05, -150); B.loot(-58, g + 0.05, -150);
    g = B.flat(82, -152, 66, 26); B.rect(82, -152, 66, 26); B.paint(82, -152, 70, 30, 3);
    for (let i = 0; i < 3; i++) B.cyl(60 + i * 22, g - 1, -152, 8.4, 9.5, 'smooth', i === 1 ? 0xc9c4b4 : 0xe4e0d6);
    B.box(60, g + 2, -152.4, 104, g + 2.6, -151.6, 'smooth', 0xa83a2a, { nc: 1 });
    B.loot(71, g + 0.05, -150); B.loot(93, g + 0.05, -154);
    // quai, grues et cargo
    B.box(-196, -6, 152, 196, 2.32, 153.4, 'concrete', 0x8e8f8c);
    B.box(-196, 2.3, 152.9, 20, 3.3, 153.05, 'smooth', 0xd9a520); B.box(22.6, 2.3, 152.9, 196, 3.3, 153.05, 'smooth', 0xd9a520);
    B.box(-196, 3.3, 152.8, 20, 8, 153.2, null, 0, { nr: 1, np: 1 }); B.box(22.6, 3.3, 152.8, 196, 8, 153.2, null, 0, { nr: 1, np: 1 });
    for (const x of [-110, -30, 120]) {
      B.rect(x, 138, 14, 12);
      for (const sx of [-5, 5]) for (const sz of [-4, 4]) B.cb(x + sx, 1.3, 138 + sz, 1.2, 27, 1.2, 'smooth', 0xd9a520);
      B.box(x - 5.6, 26.3, 133.4, x + 5.6, 28.3, 142.6, 'smooth', 0xd9a520, { nc: 1 });
      B.box(x - 1.2, 28.3, 110, x + 1.2, 30.3, 188, 'smooth', 0xc98a18, { nc: 1 });
      B.box(x - 1.7, 23, 147, x + 1.7, 26.3, 151, 'smooth', 0x2a3340, { nc: 1 });
      B.box(x - 0.08, 12.6, 177.9, x + 0.08, 28.3, 178.1, 'dark', 0x1a1a1a, { nc: 1 });
      B.box(x - 1.22, 10, 172, x + 1.22, 12.6, 184, 'metal', B.pick(CONT), { nc: 1 });
      B.loot(x, 2.4, 138);
    }
    // cargo
    B.box(-20, -4, 157, 72, 4.2, 173, 'smooth', 0x8a2a22);
    B.box(-20, 4.2, 157, 72, 4.5, 173, 'metal', 0x4c5058);
    const D = 4.5;
    B.box(-20, D, 157, 19.6, D + 1.3, 157.3, 'smooth', 0x8a2a22); B.box(23, D, 157, 72, D + 1.3, 157.3, 'smooth', 0x8a2a22);
    B.box(-20, D, 172.7, 72, D + 1.3, 173, 'smooth', 0x8a2a22); B.box(-20, D, 157, -19.7, D + 1.3, 173, 'smooth', 0x8a2a22); B.box(71.7, D, 157, 72, D + 1.3, 173, 'smooth', 0x8a2a22);
    B.box(-20.2, D + 1.3, 156.9, 19.6, D + 6, 157.3, null, 0, { nr: 1, np: 1 }); B.box(23, D + 1.3, 156.9, 72.2, D + 6, 157.3, null, 0, { nr: 1, np: 1 });
    B.box(-20.2, D + 1.3, 172.7, 72.2, D + 6, 173.1, null, 0, { nr: 1, np: 1 }); B.box(-20.3, D + 1.3, 157, -19.7, D + 6, 173, null, 0, { nr: 1, np: 1 }); B.box(71.7, D + 1.3, 157, 72.3, D + 6, 173, null, 0, { nr: 1, np: 1 });
    B.box(20, 1.8, 152.6, 22.6, D, 157.3, 'metal', 0x8a8f96, { ramp: 3, rl: 2.3 });
    B.box(19.8, 2.3, 152.6, 20, D + 1.2, 157.3, 'smooth', 0xd9a520); B.box(22.6, 2.3, 152.6, 22.8, D + 1.2, 157.3, 'smooth', 0xd9a520);
    B.box(54, D, 159, 68, D + 9, 171, 'smooth', 0xe8e6e0); B.box(55, D + 9, 160, 67, D + 12, 170, 'smooth', 0xd8d4cc);
    B.neon(53.9, D + 6.4, 160, 54, D + 7.6, 170, 0x9fe8ff);
    B.cyl(61, D + 12, 165, 1.6, 4, 'smooth', 0x2a2c30, { nc: 1 });
    for (let i = 0; i < 5; i++) {
      const x = -12 + i * 13.2, two = B.chance(0.5);
      if (i === 2) continue;
      for (const z of [161.5, 168.5]) { B.container(x, z, true, B.pick(CONT), D); if (two) B.container(x, z, true, B.pick(CONT), D + 2.6); }
      B.loot(x, D + 0.05, 165, true);
    }
    B.loot(21, D + 0.05, 165, true); B.loot(48, D + 0.05, 165, true); B.loot(30, D + 0.05, 160, true);
    // divers
    B.tower(-176, 84, 6, 'metal', 0x6a727e); B.tower(176, -70, 6, 'metal', 0x6a727e);
    for (let i = 0; i < 9; i++) { const x = B.pick([-98, 98]) + B.rnd(-2, 2), z = B.rnd(-130, 120); if (B.free(x, z, 4)) B.truck(x, z, false, B.pick(CARS)); }
    for (let i = 0; i < 8; i++) { const x = B.rnd(-180, 180), z = B.pick([-68, 68]) + B.rnd(-2.5, 2.5); if (B.free(x, z, 3)) B.car(x, z, true, B.pick(CARS)); }
    for (let i = 0; i < 26; i++) { const x = B.rnd(-185, 185), z = B.rnd(-140, 146); if (B.free(x, z, 2.5)) { B.chance(0.5) ? B.crates(x, z, B.ri(1, 3)) : B.barrels(x, z, B.ri(2, 4)); } }
    for (let i = 0; i < 16; i++) { const x = B.rnd(-185, 185), z = B.rnd(-140, 146); if (B.free(x, z, 2.5)) { B.barrier(x, z, B.chance(0.5)); B.rect(x, z, 3.4, 3.4); } }
    for (let x = -180; x <= 180; x += 45) for (const z of [-76, 76]) if (B.free(x, z, 1)) B.prop('lamp', x, z, 1, 0);
    B.scatter('oak', 60, { cond: (x, z) => z < -150 || Math.abs(x) > 172, gap: 3 });
    B.scatter('bush', 70, { cond: (x, z) => z < -120 || Math.abs(x) > 165 });
    B.scatter('rock', 26, { cond: (x, z) => z < -130, s: [0.8, 2] });
    B.lootScatter(34);
  },
};

// ------------------------------------------------------------------ 2. DUNES D'OCRE
const dunes = {
  id: 'dunes', name: "Dunes d'Ocre", tag: 'Village du désert', size: 400, arenaR: 72,
  desc: "Un village d'adobe aux toits-terrasses, cerné de dunes, de ruines et d'un fortin.",
  env: {
    skyTop: 0x2f7fd6, skyHor: 0xf2dcb0, fog: [0xf0d9ae, 90, 470],
    sun: { dir: [0.3, 0.9, -0.4], color: 0xfff0c8, int: 3.0 }, hemi: { sky: 0xfff0d0, ground: 0xb08850, int: 1.0 },
    water: { level: 0, color: 0x2a9a9a },
  },
  ground: { c: [0xdcc08a, 0xcfae74], steep: 0xb8905a, shore: 0x9a8a5a, paint: { 1: 0x6a6258, 2: 0xc2a070, 3: 0xb89868, 4: 0xcbb98a } },
  shape(x, z, s) {
    let h = 3.2 + fbm(x * 0.011, z * 0.011, s) * 10 + Math.abs(Math.sin(x * 0.045 + fbm(x * 0.01, z * 0.01, s + 3) * 6)) * 1.2;
    const d = Math.hypot(x - 96, z + 86);
    if (d < 26) h = lerp(-1.3, h, smooth(clamp((d - 6) / 20, 0, 1)));
    return h;
  },
  generate(B) {
    const A = STYLES.adobe;
    B.flat(0, 0, 104, 104, 7, 30); B.paint(0, 0, 30, 30, 2);
    // place du marché
    B.cyl(0, 6.5, 0, 1.6, 1.4, 'rock', 0xbfa880); B.rect(0, 0, 4, 4);
    for (const [x, z] of [[-9, -8], [9, -8], [-9, 8], [9, 8], [0, -11], [0, 11]]) B.stall(x, z, B.pick([0xb8322a, 0x2a6a9a, 0xd9a520, 0xe8e0c8]));
    B.loot(3, 7.05, 3); B.loot(-4, 7.05, -2);
    // maisons du village
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
      if ((!i && !j) || B.chance(0.14)) continue;
      const w = B.ri(8, 12), d = B.ri(7, 9), two = w >= 10 && B.chance(0.35);
      B.house(i * 22 + B.ri(-2, 2), j * 22 + B.ri(-2, 2), w, d, { st: A, h: 7, floors: two ? 2 : 1, roof: !two || B.chance(0.5) });
    }
    for (let i = 0; i < 14; i++) {
      const x = B.rnd(-52, 52), z = B.rnd(-52, 52), ax = B.chance(0.5), len = B.rnd(3, 7);
      if (!B.free(x, z, 3.5)) continue;
      B.cb(x, 6, z, ax ? len : 0.5, 2.3, ax ? 0.5 : len, 'plaster', B.pick(A.wc)); B.rect(x, z, ax ? len : 1, ax ? 1 : len);
    }
    // ruines antiques
    {
      const cx = -128, cz = -118, g = B.flat(cx, cz, 52, 52, undefined, 12);
      B.paint(cx, cz, 50, 50, 2);
      const top = B.pyramid(cx, cz, 12, 3, 'rock', 0xcdb893);
      B.loot(cx, top + 0.05, cz, true); B.loot(cx + 2, top + 0.05, cz - 1, true);
      for (let i = 0; i < 18; i++) {
        const x = cx + B.rnd(-24, 24), z = cz + B.rnd(-24, 24), len = B.rnd(3, 9), ax = B.chance(0.5);
        if (!B.free(x, z, 2)) continue;
        B.cb(x, g - 1, z, ax ? len : 0.7, B.rnd(2, 5.2), ax ? 0.7 : len, 'rock', B.pick([0xcdb893, 0xbfa880])); B.rect(x, z, ax ? len : 1, ax ? 1 : len);
      }
      for (let i = 0; i < 10; i++) { const x = cx + B.rnd(-22, 22), z = cz + B.rnd(-22, 22); if (B.free(x, z, 1.5)) { B.cyl(x, g - 1, z, 0.55, B.rnd(3.5, 7), 'rock', 0xd4c09a); B.rect(x, z, 1.2, 1.2); } }
      for (let i = 0; i < 5; i++) B.loot(cx + B.rnd(-20, 20), g + 0.05, cz + B.rnd(-20, 20));
    }
    // fortin
    {
      const cx = 128, cz = 122, g = B.flat(cx, cz, 44, 44, undefined, 9), T = 0.8, H = 4.6, c = 0xcfa878;
      B.rect(cx, cz, 46, 46); B.paint(cx, cz, 40, 40, 2);
      const x0 = cx - 18, x1 = cx + 18, z0 = cz - 18, z1 = cz + 18;
      B.wallRun('x', z0, z0 + T, x0, x1, g - 1, g + H, [{ c: cx + 0.5, w: 4.6, b: 0, t: 4.6 }], 'plaster', c);
      B.wallRun('x', z1 - T, z1, x0, x1, g - 1, g + H, [], 'plaster', c);
      B.wallRun('z', x0, x0 + T, z0 + T, z1 - T, g - 1, g + H, [{ c: cz + 0.5, w: 4.6, b: 0, t: 4.6 }], 'plaster', c);
      B.wallRun('z', x1 - T, x1, z0 + T, z1 - T, g - 1, g + H, [], 'plaster', c);
      B.box(x0 + T, g + 2.8, z1 - T - 2.2, x1 - T, g + 3, z1 - T, 'wood', 0x8a6a40);
      B.box(x1 - T - 2.2, g + 2.8, z0 + T, x1 - T, g + 3, z1 - T - 2.2, 'wood', 0x8a6a40);
      B.box(x0 + 2, g - 1, z1 - T - 3.8, x0 + 8.5, g + 3, z1 - T - 2.2, 'plaster', c, { ramp: 1, rl: g });
      B.cb(x1 - 2.6, g - 1, z1 - 2.6, 6.4, 9, 6.4, 'plaster', shade(c, 0.94)); B.cb(x0 + 2.6, g - 1, z0 + 2.6, 6.4, 9, 6.4, 'plaster', shade(c, 0.94));
      B.house(cx - 5, cz - 5, 9, 7, { st: A, h: g }); B.tent(cx + 8, cz - 8, true, 0xd8cdb0);
      B.crates(cx + 6, cz + 4, 3); B.crates(cx - 9, cz + 8, 2);
      B.loot(cx + 10, g + 3.05, z1 - T - 1.1, true); B.loot(x1 - T - 1.1, g + 3.05, cz, true); B.loot(cx, g + 0.05, cz + 6); B.loot(cx + 3, g + 0.05, cz - 10);
    }
    // site pétrolier
    {
      const cx = -134, cz = 112, g = B.flat(cx, cz, 46, 40, undefined, 10);
      B.rect(cx, cz, 16, 16); B.paint(cx, cz, 44, 38, 2);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.cb(cx + sx * 2.6, g - 1, cz + sz * 2.6, 0.4, 20, 0.4, 'metal', 0x5c6470);
      for (const y of [6, 12, 18]) B.cb(cx, g + y, cz, 5.8, 0.3, 5.8, 'metal', 0x5c6470, { nc: 1 });
      B.cb(cx, g + 2.8, cz, 6.4, 0.2, 6.4, 'metal', 0x70767e);
      B.box(cx + 3.2, g - 1, cz - 0.8, cx + 8.4, g + 3, cz + 0.8, 'metal', 0x70767e, { ramp: 2, rl: g });
      B.loot(cx, g + 3.05, cz, true); B.cyl(cx, g - 1, cz, 0.3, 19, 'smooth', 0x2a2c30, { nc: 1 });
      B.cyl(cx + 15, g - 1, cz - 9, 4.2, 6, 'smooth', 0xc9c4b4); B.cyl(cx + 15, g - 1, cz + 3, 4.2, 6, 'smooth', 0xa8644a); B.rect(cx + 15, cz - 3, 10, 24);
      B.house(cx - 13, cz + 6, 8, 7, { st: STYLES.metal, h: g }); B.barrels(cx - 4, cz - 10, 4); B.barrels(cx + 6, cz + 12, 3); B.crates(cx - 14, cz - 10, 3);
      B.loot(cx + 9, g + 0.05, cz + 9); B.loot(cx - 6, g + 0.05, cz - 13);
    }
    // campement
    {
      const cx = -122, cz = 6;
      B.flat(cx, cz, 34, 30, undefined, 10); B.paint(cx, cz, 30, 26, 2);
      for (const [x, z, ax] of [[-10, -8, 1], [0, -10, 0], [10, -6, 1], [-8, 8, 0], [8, 9, 1]]) B.tent(cx + x, cz + z, !!ax, B.pick([0xd8cdb0, 0xb8a888, 0x8a9a7a]));
      B.cyl(cx, B.gh(cx, cz) - 0.2, cz, 0.9, 0.5, 'rock', 0x5a5248); B.crates(cx + 3, cz + 2, 2); B.loot(cx - 2, B.gh(cx, cz) + 0.05, cz + 3);
    }
    // mesas
    for (const [cx, cz, s] of [[142, 46, 1.1], [-58, 152, 1], [62, -160, 1.2], [-166, -30, 0.9], [20, 132, 0.8], [160, -150, 1]]) {
      const g = B.gh(cx, cz);
      B.rect(cx, cz, 19 * s, 15 * s);
      B.cb(cx, g - 4, cz, 16 * s, 4 + 7 * s, 11 * s, 'rock', 0xb8845a); B.cb(cx + 2 * s, g + 7 * s, cz - s, 10 * s, 4 * s, 7 * s, 'rock', 0xc08e62);
      B.cb(cx - 6 * s, g - 4, cz + 6 * s, 6 * s, 4 + 3.5 * s, 5 * s, 'rock', 0xa87850);
      B.loot(cx + 9.5 * s, B.gh(cx + 9.5 * s, cz) + 0.05, cz);
    }
    B.house(74, -70, 9, 8, { st: A, roof: true }); B.tower(60, 96, 5); B.tower(-70, -40, 5);
    B.scatter('palm', 30, { area: [96, -86, 34], gap: 2, cond: (x, z) => Math.hypot(x - 96, z + 86) > 12 });
    B.scatter('bush', 40, { area: [96, -86, 36] });
    B.scatter('palm', 26, { gap: 3 }); B.scatter('rock', 130, { s: [0.7, 2.4], gap: 2 }); B.scatter('cactus', 100, { gap: 2 });
    B.scatter('drybush', 140); B.scatter('dead', 26, { gap: 2 });
    B.lootScatter(40);
  },
};

// ------------------------------------------------------------------ 3. GIVRE-NORD
const givre = {
  id: 'givre', name: 'Givre-Nord', tag: 'Station polaire', size: 400, arenaR: 72,
  desc: 'Une station de recherche prise dans la glace, entre forêt de sapins et lac gelé.',
  env: {
    skyTop: 0x6a9fd8, skyHor: 0xe8f0f8, fog: [0xdfe9f2, 55, 390],
    sun: { dir: [-0.5, 0.6, 0.4], color: 0xfff6ee, int: 2.3 }, hemi: { sky: 0xdfeaff, ground: 0x8a94a8, int: 1.1 },
    water: null,
  },
  ground: { c: [0xf2f6fa, 0xe2eaf2], steep: 0x8a9098, shore: 0xe2eaf2, paint: { 1: 0x5a5e66, 2: 0xcfd6dc, 3: 0x9a9ea2, 4: 0xb8dcee } },
  shape(x, z, s) {
    let h = 3 + fbm(x * 0.011, z * 0.011, s) * 11;
    h += smooth(clamp((Math.max(Math.abs(x), Math.abs(z)) - 172) / 28, 0, 1)) * 15;
    const d = Math.hypot(x, z - 96);
    return lerp(1.2, h, smooth(clamp((d - 46) / 22, 0, 1)));
  },
  generate(B) {
    const P = STYLES.polar;
    B.paintDisc(0, 96, 50, 4);
    // station centrale
    const g = B.flat(0, -8, 112, 84, 6, 16);
    B.paint(0, -8, 108, 80, 2);
    B.house(0, -14, 18, 12, { floors: 2, st: P, h: g, c: 0xe4e8ec });
    for (const [x, z, w, d] of [[-30, -30, 11, 7], [30, -30, 11, 7], [-34, -4, 8, 11], [34, -4, 8, 11], [-24, 20, 11, 7], [24, 20, 11, 7]]) B.house(x, z, w, d, { st: P, h: g });
    for (const [x0, z0, x1, z1] of [[-24, -27, -9, -25], [9, -27, 24, -25], [-30, -24, -28, -10], [28, -24, 30, -10], [-18, 4, -16, 16], [16, 4, 18, 16]]) B.box(x0, g - 0.5, z0, x1, g + 0.22, z1, 'wood', 0x7a6a50);
    B.neon(-9.05, g + 5.3, -18, -9, g + 5.8, -10, 0xff6b1a);
    const ty = B.tower(0, 22, 7, 'metal', 0x8a929c);
    B.cyl(0, ty + 2.4, 22, 2.2, 0.5, 'smooth', 0xe4e8ec, { nc: 1 }); B.cyl(0, ty + 2.9, 22, 0.25, 2.4, 'smooth', 0xd96a2a, { nc: 1 });
    for (const x of [-46, 46]) { B.cb(x, g - 1, -42, 0.36, 25, 0.36, 'metal', 0xb8322a); B.cb(x, g + 23, -42, 2.4, 0.2, 0.2, 'metal', 0xb8322a, { nc: 1 }); B.rect(x, -42, 1.5, 1.5); }
    for (let i = 0; i < 3; i++) { B.cyl(-48 + i * 7, g - 1, 26, 2.6, 4.6, 'smooth', 0xd96a2a); B.rect(-48 + i * 7, 26, 6, 6); }
    B.truck(44, 30, true, 0xd96a2a); B.truck(-6, -40, true, 0xe4e8ec); B.truck(8, 6, false, 0xd96a2a);
    for (let i = 0; i < 12; i++) { const x = B.rnd(-52, 52), z = B.rnd(-46, 30); if (B.free(x, z, 2.5)) B.crates(x, z, B.ri(1, 3)); }
    for (let i = 0; i < 8; i++) { const x = B.rnd(-52, 52), z = B.rnd(-46, 30); if (B.free(x, z, 2.5)) { B.barrier(x, z, B.chance(0.5), 'metal', 0xd96a2a); B.rect(x, z, 3.4, 3.4); } }
    // camp de bûcherons
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 6.283, x = Math.round(-128 + Math.cos(a) * 22), z = Math.round(-112 + Math.sin(a) * 20);
      B.house(x, z, 8, 7, { st: STYLES.cabin });
    }
    for (let i = 0; i < 7; i++) {
      const x = -128 + B.rnd(-14, 14), z = -112 + B.rnd(-12, 12), ax = B.chance(0.5), y = B.gh(x, z) - 0.2;
      if (!B.free(x, z, 3)) continue;
      B.cb(x, y, z, ax ? 5 : 2.2, 1.1, ax ? 2.2 : 5, 'wood', 0x7a5536); B.cb(x, y + 1.1, z, ax ? 5 : 1.1, 0.9, ax ? 1.1 : 5, 'wood', 0x86603e); B.rect(x, z, 5, 5);
    }
    B.loot(-128, B.gh(-128, -112) + 0.05, -112);
    // village de pêche sur la glace
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * 6.283 + 0.3, x = Math.round(Math.cos(a) * 26), z = Math.round(96 + Math.sin(a) * 22);
      B.house(x, z, 6, 6, { st: STYLES.cabin, h: 1.2, win: false, c: B.pick([0xb8322a, 0x2a5a9a, 0xd9a520, 0x3a7a4a]) });
    }
    B.barrels(0, 96, 4); B.crates(4, 100, 2); B.loot(-3, 1.25, 93); B.loot(5, 1.25, 90);
    // épave d'avion-cargo
    {
      const cx = 136, cz = 34, pg = B.flat(cx, cz, 44, 30, undefined, 10), c = 0xd8dde2;
      B.rect(cx, cz, 44, 30);
      const fus = (x0, x1, z) => {
        B.box(x0, pg, z - 2.3, x1, pg + 0.2, z + 2.3, 'metal', 0x70767e); B.box(x0, pg + 3.9, z - 2.3, x1, pg + 4.1, z + 2.3, 'smooth', c);
        B.box(x0, pg + 0.2, z - 2.3, x1, pg + 3.9, z - 2.1, 'smooth', c); B.box(x0, pg + 0.2, z + 2.1, x1, pg + 3.9, z + 2.3, 'smooth', c);
        B.loot((x0 + x1) / 2, pg + 0.25, z);
      };
      fus(cx - 16, cx - 2, cz); fus(cx + 4, cx + 15, cz + 3.5);
      B.box(cx - 12, pg - 1, cz + 2.3, cx - 6, pg + 4.1, cz + 13, 'smooth', 0xc8ced4, { ramp: 4, rl: pg });
      B.box(cx + 12.5, pg + 4.1, cz + 3.2, cx + 15, pg + 8.5, cz + 3.8, 'smooth', 0xd96a2a, { nc: 1 });
      B.cyl(cx - 9, pg - 0.4, cz - 7, 1.3, 2.4, 'smooth', 0x5c6470); B.crates(cx + 1, cz - 6, 3); B.crates(cx - 18, cz + 8, 2);
      B.loot(cx - 9, pg + 4.15, cz, true); B.loot(cx + 1, pg + 0.05, cz + 9);
    }
    // observatoire
    {
      const cx = -140, cz = 78, og = B.flat(cx, cz, 30, 30, undefined, 8);
      B.rect(cx, cz, 22, 22);
      B.cyl(cx, og - 1, cz, 9, 6.5, 'concrete', 0xc8ccd0);
      B.w.props.push({ t: 'dome', x: cx, y: og + 5.5, z: cz, s: 8.6, r: 0 });
      B.house(cx + 17, cz + 2, 9, 8, { st: P, h: og }); B.loot(cx - 12, og + 0.05, cz + 4); B.loot(cx, og + 0.05, cz - 12);
    }
    // avant-poste
    B.house(128, -128, 12, 9, { st: STYLES.concrete, roof: true }); B.tower(144, -116, 6, 'metal', 0x8a929c);
    for (let i = 0; i < 5; i++) { const x = 128 + B.rnd(-14, 14), z = -128 + B.rnd(-14, 14); if (B.free(x, z, 2)) { B.barrier(x, z, B.chance(0.5)); B.rect(x, z, 3.4, 3.4); } }
    B.tower(-60, 60, 5); B.tower(70, 70, 5);
    const noIce = (x, z) => Math.hypot(x, z - 96) > 52;
    B.scatter('snowpine', 150, { area: [-128, -112, 62], gap: 2, s: [0.9, 1.5] });
    B.scatter('snowpine', 330, { gap: 2.5, cond: noIce, s: [0.8, 1.6] });
    B.scatter('snowrock', 90, { s: [0.7, 2.4], gap: 2, cond: noIce }); B.scatter('dead', 36, { gap: 2, cond: noIce });
    B.lootScatter(40);
  },
};

// ------------------------------------------------------------------ 4. CANOPÉE
const canopee = {
  id: 'canopee', name: 'Canopée', tag: 'Ruines dans la jungle', size: 400, arenaR: 66,
  desc: 'Un temple à degrés englouti par la jungle, une rivière à traverser et un village sur pilotis.',
  env: {
    skyTop: 0x3f8fcf, skyHor: 0xcfe8d8, fog: [0xb8d8c0, 38, 310],
    sun: { dir: [0.4, 0.85, 0.2], color: 0xfff4d0, int: 2.5 }, hemi: { sky: 0xcfeecf, ground: 0x3a4a2a, int: 1.0 },
    water: { level: 0, color: 0x3a7a5a },
  },
  ground: { c: [0x3f6a2c, 0x527c34], steep: 0x5a5a40, shore: 0x6a5a3a, paint: { 1: 0x5a5448, 2: 0x6a5a3a, 3: 0x7c8270, 4: 0xcbb98a } },
  shape(x, z, s) {
    const h = 2.6 + fbm(x * 0.012, z * 0.012, s) * 7.5;
    const d = Math.abs(z - riverZ(x));
    return d < 16 ? lerp(-0.55, h, smooth(clamp((d - 5) / 11, 0, 1))) : h;
  },
  generate(B) {
    const S = 0x8a8f7a;
    // temple central
    const g = B.flat(0, -8, 92, 86, 5.5, 14);
    B.paint(0, -8, 60, 56, 3);
    const top = B.pyramid(0, -8, 34, 12, 'rock', S);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.cyl(sx * 3.4, top, -8 + sz * 3.4, 0.5, 3.4, 'rock', 0x9a9f88);
    B.cb(0, top + 3.4, -8, 9, 0.6, 9, 'rock', 0x7c8470); B.cb(0, top + 4, -8, 6, 0.5, 6, 'rock', 0x8a8f7a, { nc: 1 });
    B.cb(0, top, -8, 1.6, 0.9, 1.6, 'rock', 0xc9a020);
    B.loot(2.4, top + 0.05, -8, true); B.loot(-2.4, top + 0.05, -8, true); B.loot(0, top + 0.05, -5, true);
    for (const [x, z] of [[-32, -36], [32, -36], [-32, 22], [32, 22]]) {
      const t = B.pyramid(x, z, 10, 3, 'rock', 0x80856f);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.cyl(x + sx * 1.5, t, z + sz * 1.5, 0.3, 2.6, 'rock', 0x9a9f88);
      B.cb(x, t + 2.6, z, 4.4, 0.4, 4.4, 'rock', 0x7c8470); B.loot(x, t + 0.05, z, true);
    }
    for (let i = 0; i < 26; i++) {
      const x = B.rnd(-44, 44), z = -8 + B.rnd(-40, 40), ax = B.chance(0.5), len = B.rnd(3, 8);
      if (!B.free(x, z, 2.5)) continue;
      B.cb(x, g - 1, z, ax ? len : 0.8, B.rnd(1.9, 4.2), ax ? 0.8 : len, 'rock', B.pick([S, 0x7c8470, 0x969a84])); B.rect(x, z, ax ? len : 1, ax ? 1 : len);
    }
    for (let i = 0; i < 14; i++) { const x = B.rnd(-42, 42), z = -8 + B.rnd(-38, 38); if (B.free(x, z, 1.6)) { B.cyl(x, g - 1, z, 0.6, B.rnd(2.4, 6.5), 'rock', 0x9a9f88); B.rect(x, z, 1.3, 1.3); } }
    for (let i = 0; i < 8; i++) { const x = B.rnd(-40, 40), z = -8 + B.rnd(-36, 36); if (B.free(x, z, 1)) B.loot(x, g + 0.05, z); }
    // village sur pilotis
    for (const [hx, hz] of [[-136, -124], [-116, -134], [-98, -118], [-126, -102], [-106, -96], [-144, -100], [-120, -78]]) {
      const hg = B.flat(hx, hz, 8, 8, undefined, 4), st = STYLES.hut, c = B.pick(st.wc), T = 0.2, py = hg + 2.6;
      B.rect(hx + 3, hz, 17, 9);
      const x0 = hx - 3, x1 = hx + 3, z0 = hz - 3, z1 = hz + 3;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.cb(hx + sx * 2.7, hg - 1, hz + sz * 2.7, 0.3, 3.5, 0.3, 'wood', 0x5c4a2e);
      B.cb(hx, py - 0.2, hz, 6.4, 0.2, 6.4, 'wood', st.fc);
      B.wallRun('x', z0, z0 + T, x0, x1, py, py + 2.4, [{ c: hx, w: 1.4, b: 1, t: 2 }], 'wood', c);
      B.wallRun('x', z1 - T, z1, x0, x1, py, py + 2.4, [{ c: hx, w: 1.4, b: 1, t: 2 }], 'wood', c);
      B.wallRun('z', x0, x0 + T, z0 + T, z1 - T, py, py + 2.4, [{ c: hz, w: 1.4, b: 1, t: 2 }], 'wood', c);
      B.wallRun('z', x1 - T, x1, z0 + T, z1 - T, py, py + 2.4, [{ c: hz, w: 2.2, b: 0, t: 2.1 }], 'wood', c);
      B.box(x0, py + 2.3, z0, x1, py + 2.4, z1, 'wood', st.fc);
      B.box(x0 - 0.5, py + 2.4, z0 - 0.5, x1 + 0.5, py + 4.6, z1 + 0.5, 'wood', st.gable, { nc: 1, gable: 'x' });
      B.box(x1, py - 0.2, hz - 1.3, x1 + 1.5, py, hz + 1.3, 'wood', st.fc);
      B.box(x1 + 1.5, hg - 1, hz - 0.8, x1 + 6.3, py, hz + 0.8, 'wood', c, { ramp: 2, rl: hg });
      B.loot(hx - 1, py + 0.05, hz + 1, true); if (B.chance(0.6)) B.loot(hx + 1, hg + 0.05, hz - 1);
    }
    // labyrinthe de ruines
    {
      const cx = 126, cz = -104, mg = B.flat(cx, cz, 46, 46, undefined, 10);
      B.paint(cx, cz, 44, 44, 3); B.rect(cx, cz, 44, 44);
      for (let j = 0; j <= 7; j++) for (let i = 0; i <= 7; i++) {
        const x = cx - 21 + i * 6, z = cz - 21 + j * 6;
        if (i < 7 && B.chance(0.42)) B.box(x, mg - 1, z - 0.3, x + (B.chance(0.3) ? 3.4 : 6), mg + B.rnd(2.5, 3.6), z + 0.3, 'rock', B.pick([S, 0x7c8470]));
        if (j < 7 && B.chance(0.42)) B.box(x - 0.3, mg - 1, z, x + 0.3, mg + B.rnd(2.5, 3.6), z + (B.chance(0.3) ? 3.4 : 6), 'rock', B.pick([S, 0x7c8470]));
        if (i < 7 && j < 7 && B.chance(0.2)) B.loot(x + 3, mg + 0.05, z + 3);
      }
    }
    // camp de recherche
    {
      const cx = -112, cz = 124, cg = B.flat(cx, cz, 40, 34, undefined, 9);
      B.paint(cx, cz, 36, 30, 2);
      for (const [x, z, ax] of [[-12, -9, 1], [0, -11, 0], [12, -8, 1], [-11, 9, 0], [11, 10, 1]]) B.tent(cx + x, cz + z, !!ax, B.pick([0x6a7a4a, 0x8a9a7a, 0xb8a888]));
      B.container(cx, cz + 1, true, 0xd8d4cc, cg - 0.05, 12.2, true); B.rect(cx, cz + 1, 13, 3);
      B.cb(cx + 16, cg - 1, cz - 2, 0.3, 19, 0.3, 'metal', 0xb8322a); B.rect(cx + 16, cz - 2, 1.4, 1.4);
      B.crates(cx - 4, cz + 8, 3); B.crates(cx + 5, cz - 5, 2); B.barrels(cx - 16, cz, 3);
    }
    // porte antique et allée de colonnes
    {
      const cx = 128, cz = 112, pg = B.flat(cx, cz, 26, 18, undefined, 8);
      B.rect(cx, cz, 22, 8);
      B.cb(cx - 7, pg - 1, cz, 4.4, 13, 4.4, 'rock', S); B.cb(cx + 7, pg - 1, cz, 4.4, 13, 4.4, 'rock', S);
      B.cb(cx, pg + 10.5, cz, 20, 2.6, 5, 'rock', 0x7c8470, { nc: 1 }); B.cb(cx, pg + 13.1, cz, 14, 1.2, 4, 'rock', 0x969a84, { nc: 1 });
      B.loot(cx, pg + 0.05, cz);
      for (let i = 1; i <= 7; i++) for (const s of [-1, 1]) {
        const x = cx - i * 13 + s * 0, z = cz - i * 11 + s * 5;
        if (B.free(x, z, 1.5)) { B.cyl(x, B.gh(x, z) - 1, z, 0.7, B.rnd(3, 6), 'rock', 0x9a9f88); B.rect(x, z, 1.5, 1.5); }
      }
    }
    // ponts
    for (const x of [-64, 20, 104]) {
      const zc = riverZ(x);
      B.flat(x, zc - 17, 5, 4, 1.5, 6); B.flat(x, zc + 17, 5, 4, 1.5, 6);
      B.box(x - 2, 1.25, zc - 15.5, x + 2, 1.5, zc + 15.5, 'wood', 0x7a6040);
      B.box(x - 2, 1.5, zc - 15.5, x - 1.85, 2.4, zc + 15.5, 'wood', 0x5c4a2e); B.box(x + 1.85, 1.5, zc - 15.5, x + 2, 2.4, zc + 15.5, 'wood', 0x5c4a2e);
      for (const dz of [-8, 0, 8]) for (const s of [-1.7, 1.7]) B.cb(x + s, -1.5, zc + dz, 0.3, 2.8, 0.3, 'wood', 0x4a3c26, { nc: 1 });
      B.rect(x, zc, 6, 40); B.loot(x, 1.55, zc, true);
    }
    B.tower(60, -70, 6); B.tower(-60, 100, 6); B.house(60, 130, 10, 8, { st: STYLES.stone, roof: true }); B.house(-30, -150, 10, 8, { st: STYLES.stone, roof: true });
    const dry = (x, z) => B.gh(x, z) > 1.2;
    B.scatter('jungle', 520, { gap: 2.2, cond: dry, s: [0.8, 1.7] });
    B.scatter('palm', 90, { gap: 2, cond: (x, z) => Math.abs(z - riverZ(x)) < 30 && dry(x, z) });
    B.scatter('bush', 320, { gap: 0.5, cond: dry }); B.scatter('fern', 380, { gap: 0.5, cond: dry });
    B.scatter('mossrock', 110, { s: [0.7, 2.6], gap: 2 });
    B.lootScatter(44);
  },
};

// ------------------------------------------------------------------ 5. NÉON-DISTRICT
const neon = {
  id: 'neon', name: 'Néon-District', tag: 'Centre-ville de nuit', size: 400, arenaR: 80,
  desc: 'Un quartier noyé de néons : tours, boutiques ouvertes, chantiers et une grande place centrale.',
  env: {
    night: true, skyTop: 0x05060f, skyHor: 0x2a1a4a, fog: [0x140f2a, 35, 320],
    sun: { dir: [-0.3, 0.8, 0.5], color: 0x8fa0ff, int: 1.0 }, hemi: { sky: 0x6a7ae0, ground: 0x2a1c36, int: 1.5 },
    water: null,
  },
  ground: { c: [0x1e2026, 0x22242c], steep: 0x1e2026, shore: 0x1e2026, paint: { 1: 0x1e2026, 2: 0x2f4a2c, 3: 0x4a4c56, 4: 0x5a5648 } },
  shape() { return 2; },
  generate(B) {
    const P = 56, BS = 42, g = 2;
    const sign = (x0, y0, z0, x1, y1, z1) => { const c = B.pick(NEON); B.neon(x0, y0, z0, x1, y1, z1, c); B.glow((x0 + x1) / 2, g + 0.06, (z0 + z1) / 2, 7, c); };
    for (let bj = -3; bj <= 3; bj++) for (let bi = -3; bi <= 3; bi++) {
      const cx = bi * P, cz = bj * P;
      B.paint(cx, cz, BS, BS, 3);
      if (!bi && !bj) {
        // place centrale
        B.cyl(0, g - 0.5, 0, 5, 1.1, 'concrete', 0x5a5c68); B.cyl(0, g, 0, 1.2, 4, 'concrete', 0x6a6c78); B.rect(0, 0, 9, 9);
        B.neon(-4, g + 0.62, -4, 4, g + 0.66, 4, 0x05d9e8); B.glow(0, g + 0.7, 0, 12, 0x05d9e8);
        for (const s of [-1, 1]) { B.cb(s * 9, g - 1, -17, 1.4, 9, 1.4, 'concrete', 0x3a3f4c); B.rect(s * 9, -17, 2, 2); }
        B.neon(-9.7, g + 8, -17.4, 9.7, g + 9, -16.6, 0xff2a6d); B.glow(0, g + 0.06, -17, 12, 0xff2a6d);
        for (const [x, z] of [[-15, 12], [15, 12], [-14, -4], [14, -4]]) { B.stall(x, z, B.pick([0x2a2c44, 0x44203a])); sign(x - 1.6, g + 2.7, z - 1.6, x + 1.6, g + 2.95, z - 1.5); B.loot(x, g + 0.05, z + 1.4); }
        for (const [x, z] of [[-17, -17], [17, -17], [-17, 17], [17, 17]]) { B.cb(x, g - 1, z, 1, 12, 1, 'dark', 0x16171c); B.rect(x, z, 1.6, 1.6); for (const y of [3, 6, 9]) sign(x - 0.7, g + y, z - 0.7, x + 0.7, g + y + 0.35, z + 0.7); }
        for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; B.cb(Math.cos(a) * 9.5, g - 0.2, Math.sin(a) * 9.5, 2.2, 0.7, 0.7, 'wood', 0x5a4630); B.rect(Math.cos(a) * 9.5, Math.sin(a) * 9.5, 2.4, 1); }
        B.loot(6, g + 0.05, 6); B.loot(-6, g + 0.05, 7); B.loot(0, g + 0.05, 14);
        continue;
      }
      const t = B.r();
      if (t < 0.34) {
        // tours pleines
        const four = B.chance(0.5), list = four ? [[-11, -11], [11, -11], [-11, 11], [11, 11]] : [[0, 0]], w = four ? 18 : 32;
        for (const [ox, oz] of list) {
          const x = cx + ox, z = cz + oz, hh = B.rnd(16, four ? 34 : 52), ww = w - B.ri(0, 3), tint = B.pick([0x8a94b8, 0x9a8ab0, 0x7a9ab0, 0xa89a9a]);
          B.box(x - ww / 2, g - 1, z - ww / 2, x + ww / 2, g + hh, z + ww / 2, 'facade', tint);
          B.cb(x, g + hh, z, ww * 0.5, 2.2, ww * 0.5, 'dark', 0x1e2028, { nc: 1 });
          const c = B.pick(NEON);
          B.neon(x - ww / 2 - 0.1, g + hh - 0.6, z - ww / 2 - 0.1, x + ww / 2 + 0.1, g + hh - 0.25, z + ww / 2 + 0.1, c);
          B.neon(x - ww / 2 - 0.12, g + 3.3, z - ww / 2 - 0.12, x + ww / 2 + 0.12, g + 3.5, z + ww / 2 + 0.12, c);
          const side = B.ri(0, 3), sy = g + B.rnd(6, 10), sh = B.rnd(4, 8);
          if (side === 0) sign(x - 0.5, sy, z - ww / 2 - 0.5, x + 0.5, sy + sh, z - ww / 2);
          else if (side === 1) sign(x + ww / 2, sy, z - 0.5, x + ww / 2 + 0.5, sy + sh, z + 0.5);
          else if (side === 2) sign(x - 0.5, sy, z + ww / 2, x + 0.5, sy + sh, z + ww / 2 + 0.5);
          else sign(x - ww / 2 - 0.5, sy, z - 0.5, x - ww / 2, sy + sh, z + 0.5);
        }
        B.rect(cx, cz, BS - 2, BS - 2);
        for (const [x, z] of [[cx - 19.5, cz], [cx + 19.5, cz], [cx, cz - 19.5], [cx, cz + 19.5]]) if (B.chance(0.5)) B.loot(x, g + 0.05, z);
      } else if (t < 0.66) {
        // boutiques dans lesquelles on entre
        const sh = STYLES.shop;
        const mk = (x, z, w, d, door) => {
          const two = w >= 10 && d >= 8 && B.chance(0.4);
          const r = B.house(x, z, w, d, { st: sh, h: g, floors: two ? 2 : 1, doors: [door], roof: !two && B.chance(0.4) && door !== 2 });
          const y = g + 2.9;
          if (door === 0) sign(x - w * 0.3, y, r.z0 - 0.16, x + w * 0.3, y + 0.5, r.z0 - 0.02);
          else if (door === 2) sign(x - w * 0.3, y, r.z1 + 0.02, x + w * 0.3, y + 0.5, r.z1 + 0.16);
          else if (door === 1) sign(r.x1 + 0.02, y, z - d * 0.3, r.x1 + 0.16, y + 0.5, z + d * 0.3);
          else sign(r.x0 - 0.16, y, z - d * 0.3, r.x0 - 0.02, y + 0.5, z + d * 0.3);
        };
        mk(cx - 10, cz - 13, 16, 10, 0); mk(cx + 12, cz - 12, 12, 12, 1); mk(cx + 10, cz + 13, 16, 10, 2); mk(cx - 12, cz + 12, 12, 12, 3);
        for (let i = 0; i < 3; i++) { const x = cx + B.rnd(-3, 3), z = cz + B.rnd(-3, 3); if (B.free(x, z, 1.5)) { B.cb(x, g - 0.1, z, 2.2, 1.4, 1.3, 'smooth', 0x2a5a3a); B.rect(x, z, 2.6, 1.8); } }
        B.loot(cx, g + 0.05, cz + 1.5);
      } else if (t < 0.78) {
        // parc
        B.paint(cx, cz, BS - 4, BS - 4, 2);
        B.cyl(cx, g - 0.4, cz, 3.2, 1, 'concrete', 0x5a5c68); B.rect(cx, cz, 6, 6);
        B.neon(cx - 2.4, g + 0.56, cz - 2.4, cx + 2.4, g + 0.6, cz + 2.4, 0x01ff89); B.glow(cx, g + 0.65, cz, 9, 0x01ff89);
        B.scatter('oak', 14, { area: [cx, cz, 19], gap: 2.5 }); B.scatter('bush', 16, { area: [cx, cz, 19] });
        for (let i = 0; i < 4; i++) { const a = i * 1.571 + 0.78; B.cb(cx + Math.cos(a) * 7, g - 0.2, cz + Math.sin(a) * 7, 2.2, 0.7, 0.7, 'wood', 0x5a4630); }
        B.loot(cx + 5, g + 0.05, cz); B.loot(cx - 8, g + 0.05, cz + 9); B.loot(cx + 2, g + 0.05, cz - 12);
      } else if (t < 0.88) {
        // parking
        B.paint(cx, cz, BS - 2, BS - 2, 1);
        for (let r = -1; r <= 1; r++) for (let k = -3; k <= 3; k++) if (B.chance(0.6)) B.car(cx + k * 5.2, cz + r * 13, false, B.pick(CARS));
        B.house(cx - 16, cz - 16, 6, 6, { st: STYLES.shop, h: g, doors: [1] });
        for (const x of [cx - 12, cx + 12]) { B.prop('lamp', x, cz - 6.5, 1, 0); B.glow(x, g + 0.06, cz - 6.5, 8, 0xffd9a0); }
        B.loot(cx + 3, g + 0.05, cz + 6.5); B.loot(cx - 6, g + 0.05, cz - 6.5);
      } else {
        // chantier : échafaudage à deux niveaux
        B.paint(cx, cz, BS - 2, BS - 2, 4); B.rect(cx, cz, 26, 22);
        for (const sx of [-10, -3.4, 3.4, 10]) for (const sz of [-6, 0, 6]) B.cb(cx + sx, g - 1, cz + sz, 0.5, 10.4, 0.5, 'concrete', 0x8a8c90);
        B.box(cx - 10.4, g + 3, cz - 6.4, cx + 10.4, g + 3.25, cz + 6.4, 'concrete', 0x74767c);
        B.box(cx - 10.4, g + 6.2, cz - 6.4, cx + 4, g + 6.45, cz + 6.4, 'concrete', 0x74767c);
        B.box(cx + 10.4, g - 1, cz - 1, cx + 16.6, g + 3.25, cz + 1, 'wood', 0x8a6a40, { ramp: 2, rl: g });
        B.box(cx + 4, g + 3.25, cz + 3.8, cx + 10, g + 6.45, cz + 5.8, 'wood', 0x8a6a40, { ramp: 2 });
        B.neon(cx - 10.5, g + 3.3, cz - 6.5, cx + 10.5, g + 3.4, cz - 6.4, 0xff6b1a);
        B.loot(cx - 6, g + 3.3, cz, true); B.loot(cx + 6, g + 3.3, cz - 3, true); B.loot(cx - 4, g + 6.5, cz, true); B.loot(cx, g + 0.05, cz + 2);
        B.crates(cx - 15, cz + 12, 3); B.crates(cx + 14, cz - 13, 2); B.barrels(cx - 14, cz - 12, 3);
        B.cb(cx + 17, g - 1, cz + 15, 1.6, 34, 1.6, 'smooth', 0xd9a520); B.box(cx - 8, g + 31, cz + 14.5, cx + 20, g + 32.4, cz + 15.5, 'smooth', 0xd9a520, { nc: 1 }); B.rect(cx + 17, cz + 15, 2.4, 2.4);
      }
    }
    // rues : véhicules, obstacles, lampadaires
    const ST = [-140, -84, -28, 28, 84, 140];
    for (let i = 0; i < 60; i++) {
      const ax = B.chance(0.5), s = B.pick(ST) + B.pick([-3.4, 3.4]), a = B.rnd(-188, 188), x = ax ? a : s, z = ax ? s : a;
      if (!B.free(x, z, 3.2)) continue;
      if (B.chance(0.12)) { B.cb(x, g, z, ax ? 11 : 2.7, 3.1, ax ? 2.7 : 11, 'smooth', B.pick([0x2a5aa8, 0xb8322a, 0xd8d8d4])); B.rect(x, z, ax ? 11 : 3, ax ? 3 : 11); }
      else B.car(x, z, ax, B.pick(CARS));
    }
    for (let i = 0; i < 30; i++) {
      const ax = B.chance(0.5), s = B.pick(ST) + B.rnd(-5, 5), a = B.rnd(-188, 188), x = ax ? a : s, z = ax ? s : a;
      if (!B.free(x, z, 2.5)) continue;
      if (B.chance(0.5)) { B.barrier(x, z, !ax); B.rect(x, z, 3.4, 3.4); } else B.crates(x, z, B.ri(1, 3));
    }
    for (const sx of ST) for (const sz of ST) for (const [ox, oz] of [[-8, -8], [8, 8]]) {
      const x = sx + ox, z = sz + oz;
      if (B.free(x, z, 0.5)) { B.prop('lamp', x, z, 1, 0); B.glow(x, g + 0.06, z, 9, 0xffd9a0); }
    }
    for (let i = 0; i < 46; i++) {
      const ax = B.chance(0.5), s = B.pick(ST) + B.rnd(-6, 6), a = B.rnd(-188, 188), x = ax ? a : s, z = ax ? s : a;
      if (B.free(x, z, 1.2)) B.loot(x, g + 0.05, z);
    }
  },
};

export const MAPS = [port, dunes, givre, canopee, neon];
export const MAP = Object.fromEntries(MAPS.map((m) => [m.id, m]));
