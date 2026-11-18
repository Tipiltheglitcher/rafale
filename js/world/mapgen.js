// Boîte à outils de construction des cartes : chaque carte assemble ces briques à partir d'une graine.
import { lerp, smooth } from '../core/util.js';

export const STYLES = {
  concrete: { wk: 'concrete', wc: [0xb9b4aa, 0xa9adb0, 0xc4bca8], fk: 'concrete', fc: 0x86837c, rk: 'dark', rc: 0x45464c },
  brick: { wk: 'brick', wc: [0x9a5a48, 0x8a4a3c, 0xa8684e], fk: 'wood', fc: 0x7a5a3a, rk: 'dark', rc: 0x3c3d44 },
  metal: { wk: 'metal', wc: [0x6f8fa8, 0xa8644a, 0x8a9a8a, 0xc9c4b4], fk: 'concrete', fc: 0x7c7e80, rk: 'metal', rc: 0x565c66 },
  adobe: { wk: 'plaster', wc: [0xd9b88a, 0xcfa878, 0xe6cfa6, 0xc99a6c], fk: 'plaster', fc: 0xb89868, rk: 'plaster', rc: 0xc2a074, ov: 0 },
  cabin: { wk: 'wood', wc: [0x7a5536, 0x6a4a30, 0x86603e], fk: 'wood', fc: 0x5c4630, rk: 'dark', rc: 0xe9eef4, gable: 0xdfe6ee },
  polar: { wk: 'metal', wc: [0xe4e8ec, 0xd96a2a, 0xcfd6dc], fk: 'metal', fc: 0x70767e, rk: 'metal', rc: 0xb8c0c8 },
  hut: { wk: 'wood', wc: [0x9a7a4a, 0x8a6a3e], fk: 'wood', fc: 0x6e5636, rk: 'wood', rc: 0x6a5a34, gable: 0x8a7a3e },
  shop: { wk: 'concrete', wc: [0x3a3f4c, 0x44404e, 0x2f3a46, 0x4a3a44], fk: 'dark', fc: 0x2a2c34, rk: 'dark', rc: 0x1e2028 },
  stone: { wk: 'rock', wc: [0x8a8f7a, 0x7c8470], fk: 'rock', fc: 0x74796a, rk: 'rock', rc: 0x6c7262 },
};

// colliders des décors instanciés : [rayon, hauteur, proportionnel à l'échelle ?]
const PROPC = {
  pine: [0.3, 6], snowpine: [0.3, 6], oak: [0.35, 5], jungle: [0.45, 8], palm: [0.28, 6], dead: [0.25, 4],
  cactus: [0.32, 2.2], rock: [0.62, 0.8, 1], snowrock: [0.62, 0.8, 1], mossrock: [0.62, 0.8, 1], lamp: [0.14, 5],
};

export class Builder {
  constructor(w, rng) { this.w = w; this.r = rng; }
  rnd(a = 1, b) { return b === undefined ? this.r() * a : a + this.r() * (b - a); }
  ri(a, b) { return a + Math.floor(this.r() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.r() * arr.length)]; }
  chance(p) { return this.r() < p; }
  gh(x, z) { return this.w.heightAt(x, z); }

  box(x0, y0, z0, x1, y1, z1, k, c, ex) {
    const b = { x0, y0, z0, x1, y1, z1, k, c };
    if (ex) Object.assign(b, ex);
    if (b.ramp && b.rl === undefined) b.rl = y0;
    this.w.boxes.push(b);
    return b;
  }
  cb(cx, y0, cz, w, h, d, k, c, ex) { return this.box(cx - w / 2, y0, cz - d / 2, cx + w / 2, y0 + h, cz + d / 2, k, c, ex); }
  cyl(cx, y0, cz, r, h, k, c, ex) { return this.box(cx - r * 0.78, y0, cz - r * 0.78, cx + r * 0.78, y0 + h, cz + r * 0.78, k, c, { cyl: r, ...ex }); }
  neon(x0, y0, z0, x1, y1, z1, c) { return this.box(x0, y0, z0, x1, y1, z1, 'neon', c, { nc: 1 }); }
  glow(x, y, z, r, c) { (this.w.glows || (this.w.glows = [])).push({ x, y, z, r, c }); }
  loot(x, y, z, up) { this.w.lootSpots.push({ x, y, z, up: up ? 1 : 0 }); }

  rect(cx, cz, w, d) { this.w.rects.push([cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2]); }
  free(x, z, r = 0) {
    const W = this.w;
    if (Math.abs(x) > W.half - 6 || Math.abs(z) > W.half - 6) return false;
    if (W.heightAt(x, z) < W.water + 0.35) return false;
    for (const q of W.rects) if (x > q[0] - r && x < q[2] + r && z > q[1] - r && z < q[3] + r) return false;
    return true;
  }

  /** Aplanit le relief sous un rectangle (avec fondu sur `blend` mètres). */
  flat(cx, cz, w, d, h, blend = 5) {
    const W = this.w, n = W.n, res = W.res, half = W.half;
    if (h === undefined) h = W.heightAt(cx, cz);
    const x0 = cx - w / 2 - res, x1 = cx + w / 2 + res, z0 = cz - d / 2 - res, z1 = cz + d / 2 + res;
    const i0 = Math.max(0, Math.floor((x0 - blend + half) / res)), i1 = Math.min(n - 1, Math.ceil((x1 + blend + half) / res));
    const j0 = Math.max(0, Math.floor((z0 - blend + half) / res)), j1 = Math.min(n - 1, Math.ceil((z1 + blend + half) / res));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = -half + i * res, z = -half + j * res;
      const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1), dist = Math.hypot(dx, dz);
      if (dist >= blend) continue;
      const k = j * n + i;
      W.h[k] = lerp(W.h[k], h, dist <= 0 ? 1 : 1 - smooth(dist / blend));
    }
    return h;
  }

  paint(cx, cz, w, d, p) {
    const W = this.w, n = W.n, res = W.res, half = W.half;
    const i0 = Math.max(0, Math.ceil((cx - w / 2 + half) / res)), i1 = Math.min(n - 1, Math.floor((cx + w / 2 + half) / res));
    const j0 = Math.max(0, Math.ceil((cz - d / 2 + half) / res)), j1 = Math.min(n - 1, Math.floor((cz + d / 2 + half) / res));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) W.paint[j * n + i] = p;
  }
  paintDisc(cx, cz, r, p) {
    const W = this.w, n = W.n, res = W.res, half = W.half;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = -half + i * res, z = -half + j * res;
      if ((x - cx) * (x - cx) + (z - cz) * (z - cz) <= r * r) W.paint[j * n + i] = p;
    }
  }

  prop(t, x, z, s = 1, rot) {
    const y = this.gh(x, z);
    this.w.props.push({ t, x, y, z, s, r: rot === undefined ? this.r() * 6.283 : rot });
    const pc = PROPC[t];
    if (pc) {
      const r = pc[0] * (pc[2] ? s : 0.6 + 0.4 * s), h = pc[1] * s;
      this.box(x - r, y - 1, z - r, x + r, y + h, z + r, null, 0, { nr: 1 });
    }
  }

  scatter(t, n, o = {}) {
    const W = this.w, [ax, az, ar] = o.area || [0, 0, W.half * 1.35];
    const smin = o.s ? o.s[0] : 0.8, smax = o.s ? o.s[1] : 1.3, gap = o.gap ?? 1.5;
    let placed = 0;
    for (let k = 0; k < n * 8 && placed < n; k++) {
      const a = this.r() * 6.283, d = Math.sqrt(this.r()) * ar, x = ax + Math.cos(a) * d, z = az + Math.sin(a) * d;
      if (!this.free(x, z, gap)) continue;
      if (o.cond && !o.cond(x, z)) continue;
      this.prop(t, x, z, this.rnd(smin, smax));
      placed++;
    }
  }

  lootScatter(n, o = {}) {
    const W = this.w, [ax, az, ar] = o.area || [0, 0, W.half * 1.3];
    let placed = 0;
    for (let k = 0; k < n * 10 && placed < n; k++) {
      const a = this.r() * 6.283, d = Math.sqrt(this.r()) * ar, x = ax + Math.cos(a) * d, z = az + Math.sin(a) * d;
      if (!this.free(x, z, 1)) continue;
      this.loot(x, this.gh(x, z) + 0.05, z);
      placed++;
    }
  }

  /** Mur aligné sur un axe, percé d'ouvertures (portes et fenêtres). */
  wallRun(ax, f0, f1, a0, a1, y0, y1, ops, k, c) {
    ops.sort((p, q) => p.c - q.c);
    const seg = (s, e, b, t) => {
      if (e - s < 0.03 || t - b < 0.03) return;
      if (ax === 'x') this.box(s, b, f0, e, t, f1, k, c); else this.box(f0, b, s, f1, t, e, k, c);
    };
    let a = a0;
    for (const p of ops) {
      const s = Math.max(a, p.c - p.w / 2), e = Math.min(a1, p.c + p.w / 2);
      if (e <= s) continue;
      seg(a, s, y0, y1);
      if (p.b > 0) seg(s, e, y0, y0 + p.b);
      seg(s, e, y0 + p.t, y1);
      a = e;
    }
    seg(a, a1, y0, y1);
  }

  /** Bâtiment dans lequel on peut entrer : portes, fenêtres, étage avec escalier, toit accessible en option. */
  house(cx, cz, w, d, o = {}) {
    const st = o.st || STYLES.concrete, floors = o.floors || 1, T = 0.3, FH = 3.2;
    const g = this.flat(cx, cz, w + 3, d + 3 + (o.roof ? 4 : 0), o.h);
    this.rect(cx, cz, w + 4, d + 4 + (o.roof ? 5 : 0));
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const wc = o.c ?? this.pick(st.wc);
    this.box(x0, g - 2, z0, x1, g + 0.2, z1, st.fk, st.fc);
    const F = (f) => g + 0.2 + f * FH;
    const stairs = floors > 1, sx0 = x0 + T + 1.8;
    let doors = o.doors || (this.chance(0.65) ? [this.ri(0, 3), this.ri(0, 3)] : [this.ri(0, 3)]);
    if (stairs) doors = doors.filter((s) => s !== 0);
    if (o.roof) doors = doors.filter((s) => s !== 2);
    if (!doors.length) doors = [stairs ? (o.roof ? 1 : 2) : o.roof ? 0 : 2];
    for (let f = 0; f < floors; f++) {
      const y0 = F(f), y1 = F(f + 1) - 0.2;
      for (let s = 0; s < 4; s++) {
        const alongX = s === 0 || s === 2, a0 = alongX ? x0 : z0 + T, a1 = alongX ? x1 : z1 - T;
        const ops = [];
        let dc = null;
        if (f === 0 && doors.includes(s)) {
          const span = Math.floor((a1 - a0) / 2 - 2.6);
          dc = Math.floor((a0 + a1) / 2) + 0.5 + (span > 0 ? this.ri(-span, span) : 0);
          ops.push({ c: dc, w: 2.6, b: 0, t: 2.4 });
        }
        if (o.win !== false) for (let a = a0 + 2.2; a < a1 - 2.1; a += 3.4) {
          if (dc !== null && Math.abs(a - dc) < 2.7) continue;
          ops.push({ c: a, w: 1.4, b: 1.0, t: 2.2 });
        }
        const f0 = s === 0 ? z0 : s === 2 ? z1 - T : s === 3 ? x0 : x1 - T;
        this.wallRun(alongX ? 'x' : 'z', f0, f0 + T, a0, a1, y0, y1, ops, st.wk, wc);
      }
      const top = F(f + 1);
      if (f < floors - 1) {
        const hx0 = sx0 - 0.1, hx1 = sx0 + 6, hz1 = z0 + T + 1.7;
        this.box(x0, top - 0.2, hz1, x1, top, z1, st.fk, st.fc);
        this.box(x0, top - 0.2, z0, hx0, top, hz1, st.fk, st.fc);
        this.box(hx1, top - 0.2, z0, x1, top, hz1, st.fk, st.fc);
      } else {
        const ov = o.roof ? 0 : st.ov ?? 0.35;
        this.box(x0 - ov, top - 0.2, z0 - ov, x1 + ov, top, z1 + ov, st.rk, st.rc);
        if (st.gable && !o.roof) this.box(x0 - 0.5, top, z0 - 0.5, x1 + 0.5, top + Math.min(w, d) * 0.32, z1 + 0.5, st.rk, st.gable, { nc: 1, gable: w >= d ? 'x' : 'z' });
      }
      // mobilier (caisses dans les angles sud) et butin
      const corners = [[x1 - T - 0.75, z1 - T - 0.75], [x0 + T + 0.75, z1 - T - 0.75]];
      for (const [fx, fz] of corners) if (this.chance(0.45)) {
        const s = this.rnd(0.9, 1.2);
        this.cb(fx, y0, fz, s, s, s, 'wood', 0x8a6a40);
        if (this.chance(0.3)) this.cb(fx, y0 + s, fz, 0.8, 0.8, 0.8, 'wood', 0x7a5c36);
      }
      const nl = f === 0 ? this.ri(1, 2) : 1;
      for (let i = 0; i < nl; i++) this.loot(this.rnd(x0 + 2, x1 - 2), y0 + 0.05, this.rnd(cz + 0.4, z1 - 2.2), f > 0);
    }
    if (stairs) this.box(sx0, F(0), z0 + T, sx0 + 6, F(1), z0 + T + 1.5, 'wood', 0x6e5a40, { ramp: 1 });
    const top = F(floors);
    if (o.roof) {
      const run = Math.min(w - 1, FH * floors * 1.8), rx0 = x0 + 0.5, rx1 = rx0 + run;
      this.box(rx0, g - 2, z1, rx1, top, z1 + 1.5, st.wk, wc, { ramp: 1, rl: g });
      const P = 0.25, ph = 0.7;
      this.box(x0, top, z0, x1, top + ph, z0 + P, st.wk, wc);
      this.box(x0, top, z0, x0 + P, top + ph, z1, st.wk, wc);
      this.box(x1 - P, top, z0, x1, top + ph, z1, st.wk, wc);
      if (rx1 - 2.4 > x0) this.box(x0, top, z1 - P, rx1 - 2.4, top + ph, z1, st.wk, wc);
      if (rx1 < x1) this.box(rx1, top, z1 - P, x1, top + ph, z1, st.wk, wc);
      this.loot(this.rnd(x0 + 1.5, x1 - 1.5), top + 0.05, this.rnd(z0 + 1.5, cz), true);
    }
    return { g, x0, x1, z0, z1, top, wc };
  }

  /** Grand entrepôt : portails, verrières hautes, rayonnages et mezzanine. */
  warehouse(cx, cz, w, d, hgt, c, alongX = true) {
    const T = 0.4, g = this.flat(cx, cz, w + 4, d + 4);
    this.rect(cx, cz, w + 6, d + 6);
    this.paint(cx, cz, w + 10, d + 10, 3);
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y0 = g + 0.15, y1 = g + hgt;
    this.box(x0, g - 2, z0, x1, y0, z1, 'concrete', 0x7b7d80);
    for (let s = 0; s < 4; s++) {
      const aX = s === 0 || s === 2, a0 = aX ? x0 : z0 + T, a1 = aX ? x1 : z1 - T, ops = [];
      const isDoor = alongX ? !aX : aX;
      const mid = Math.floor((a0 + a1) / 2) + 0.5;
      if (isDoor) ops.push({ c: mid, w: 7, b: 0, t: 4.6 });
      for (let a = a0 + 4; a < a1 - 3; a += 7) if (!isDoor || Math.abs(a - mid) > 6) ops.push({ c: a, w: 3.4, b: hgt - 3.4, t: hgt - 1.6 });
      const f0 = s === 0 ? z0 : s === 2 ? z1 - T : s === 3 ? x0 : x1 - T;
      this.wallRun(aX ? 'x' : 'z', f0, f0 + T, a0, a1, y0, y1, ops, 'metal', c);
    }
    this.box(x0 - 0.5, y1, z0 - 0.5, x1 + 0.5, y1 + 0.3, z1 + 0.5, 'metal', 0x50565f);
    // rayonnages
    const rows = Math.floor((alongX ? d : w) / 7);
    for (let i = 1; i < rows; i++) {
      const off = (i - rows / 2) * 7;
      for (let k = -1; k <= 1; k += 2) {
        const len = (alongX ? w : d) * 0.26, pc = k * (alongX ? w : d) * 0.24;
        if (alongX) this.cb(cx + pc, y0, cz + off, len, 3.4, 1.1, 'metal', 0x4c6a8a); else this.cb(cx + off, y0, cz + pc, 1.1, 3.4, len, 'metal', 0x4c6a8a);
        if (this.chance(0.7)) this.loot(cx + (alongX ? pc : off + 1.6), y0 + 0.05, cz + (alongX ? off + 1.6 : pc));
      }
    }
    // mezzanine au fond + rampe d'accès
    const mh = y0 + 3.4;
    if (alongX) {
      this.box(x0 + T, mh - 0.2, z0 + T, x0 + T + 5, mh, z1 - T, 'metal', 0x5c6470);
      this.box(x0 + T + 5, y0, z1 - T - 1.6, x0 + T + 11.5, mh, z1 - T, 'metal', 0x6a727e, { ramp: 2 });
      this.loot(x0 + T + 2.5, mh + 0.05, cz, true); this.loot(x0 + T + 2.5, mh + 0.05, cz - d * 0.3, true);
    } else {
      this.box(x0 + T, mh - 0.2, z0 + T, x1 - T, mh, z0 + T + 5, 'metal', 0x5c6470);
      this.box(x1 - T - 1.6, y0, z0 + T + 5, x1 - T, mh, z0 + T + 11.5, 'metal', 0x6a727e, { ramp: 4 });
      this.loot(cx, mh + 0.05, z0 + T + 2.5, true); this.loot(cx - w * 0.3, mh + 0.05, z0 + T + 2.5, true);
    }
    for (let i = 0; i < 4; i++) this.crates(this.rnd(x0 + 3, x1 - 3), this.rnd(z0 + 3, z1 - 3), 1, y0, true);
    return g;
  }

  container(cx, cz, ax, c, y, len = 12.2, open = false) {
    const hx = (ax ? len : 2.44) / 2, hz = (ax ? 2.44 : len) / 2;
    if (y === undefined) y = this.gh(cx, cz) - 0.05;
    if (!open) return this.box(cx - hx, y, cz - hz, cx + hx, y + 2.6, cz + hz, 'metal', c);
    const t = 0.12;
    this.box(cx - hx, y, cz - hz, cx + hx, y + 0.14, cz + hz, 'wood', 0x6a5a44);
    this.box(cx - hx, y + 2.48, cz - hz, cx + hx, y + 2.6, cz + hz, 'metal', c);
    if (ax) {
      this.box(cx - hx, y, cz - hz, cx + hx, y + 2.5, cz - hz + t, 'metal', c);
      this.box(cx - hx, y, cz + hz - t, cx + hx, y + 2.5, cz + hz, 'metal', c);
      this.box(cx - hx, y, cz - hz, cx - hx + t, y + 2.5, cz + hz, 'metal', c);
    } else {
      this.box(cx - hx, y, cz - hz, cx - hx + t, y + 2.5, cz + hz, 'metal', c);
      this.box(cx + hx - t, y, cz - hz, cx + hx, y + 2.5, cz + hz, 'metal', c);
      this.box(cx - hx, y, cz - hz, cx + hx, y + 2.5, cz - hz + t, 'metal', c);
    }
    this.loot(cx, y + 0.2, cz);
  }

  crates(x, z, n = 2, y, noRect) {
    if (y === undefined) y = this.gh(x, z) - 0.1;
    if (!noRect) this.rect(x, z, 3, 3);
    for (let i = 0; i < n; i++) {
      const s = this.rnd(0.9, 1.35), ox = i ? this.rnd(-1.1, 1.1) : 0, oz = i ? this.rnd(-1.1, 1.1) : 0;
      const col = this.pick([0x8a6a40, 0x7a5c36, 0x94744a, 0x5a6a4a]);
      this.cb(x + ox, y, z + oz, s, s, s, 'wood', col);
      if (i === 0 && this.chance(0.35)) this.cb(x, y + s, z, s * 0.75, s * 0.75, s * 0.75, 'wood', col);
    }
  }

  barrels(x, z, n = 3) {
    const y = this.gh(x, z) - 0.05;
    for (let i = 0; i < n; i++) this.cyl(x + this.rnd(-1, 1), y, z + this.rnd(-1, 1), 0.36, 1.0, 'smooth', this.pick([0xa83a2a, 0x2a5a9a, 0x3a7a4a, 0xc9a020]));
  }

  barrier(x, z, ax, k = 'concrete', c = 0xa8a8a4) {
    const y = this.gh(x, z) - 0.1;
    if (ax) this.cb(x, y, z, 3.2, 1.05, 0.55, k, c); else this.cb(x, y, z, 0.55, 1.05, 3.2, k, c);
  }

  /** Mirador : plateforme surélevée avec rampe et garde-corps. */
  tower(cx, cz, hgt = 5, k = 'wood', c = 0x7a6040) {
    const g = this.flat(cx, cz, 5, 5, undefined, 4);
    this.rect(cx + hgt * 0.8, cz, 6 + hgt * 1.7, 6);
    const py = g + hgt;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.cb(cx + sx * 1.8, g - 1, cz + sz * 1.8, 0.32, hgt + 3.4, 0.32, k, c);
    this.cb(cx, py - 0.2, cz, 4.2, 0.2, 4.2, k, c);
    this.cb(cx, py + 2.3, cz, 4.6, 0.15, 4.6, k, 0x5a4a34);
    this.box(cx - 2.1, py, cz - 2.1, cx + 2.1, py + 0.95, cz - 1.98, k, c);
    this.box(cx - 2.1, py, cz + 1.98, cx + 2.1, py + 0.95, cz + 2.1, k, c);
    this.box(cx - 2.1, py, cz - 2.1, cx - 1.98, py + 0.95, cz + 2.1, k, c);
    this.box(cx + 2.1, g - 1, cz - 0.75, cx + 2.1 + hgt * 1.7, py, cz + 0.75, k, c, { ramp: 2, rl: g });
    this.loot(cx, py + 0.05, cz, true);
    return py;
  }

  /** Pyramide à degrés (chaque degré se monte à pied). */
  pyramid(cx, cz, base, steps, k = 'rock', c = 0x8a8f7a) {
    const g = this.flat(cx, cz, base + 2, base + 2);
    this.rect(cx, cz, base + 2, base + 2);
    for (let i = 0; i < steps; i++) {
      const s = base - i * 2;
      this.cb(cx, g - 1, cz, s, 1 + (i + 1) * 0.5, s, k, i % 2 ? c : shade(c, 0.93));
    }
    return g + steps * 0.5;
  }

  car(x, z, ax, c) {
    const y = this.gh(x, z);
    const L = 4.3, Wd = 1.85;
    this.rect(x, z, ax ? L : Wd, ax ? Wd : L);
    this.cb(x, y + 0.28, z, ax ? L : Wd, 0.62, ax ? Wd : L, 'smooth', c);
    this.cb(x + (ax ? -0.2 : 0), y + 0.9, z + (ax ? 0 : -0.2), ax ? 2.3 : Wd - 0.2, 0.55, ax ? Wd - 0.2 : 2.3, 'smooth', 0x1c2430);
    for (const s of [-1, 1]) for (const t of [-1, 1]) {
      const wx = x + (ax ? s * 1.35 : t * 0.86), wz = z + (ax ? t * 0.86 : s * 1.35);
      this.cb(wx, y, wz, ax ? 0.66 : 0.24, 0.66, ax ? 0.24 : 0.66, 'dark', 0x16171a, { nc: 1 });
    }
  }

  truck(x, z, ax, c) {
    const y = this.gh(x, z);
    this.rect(x, z, ax ? 11 : 3, ax ? 3 : 11);
    const o = ax ? [1, 0] : [0, 1];
    this.cb(x + o[0] * 4.2, y + 0.5, z + o[1] * 4.2, ax ? 2.4 : 2.5, 2.4, ax ? 2.5 : 2.4, 'smooth', c);
    this.cb(x - o[0] * 1.4, y + 1.0, z - o[1] * 1.4, ax ? 8 : 2.5, 2.7, ax ? 2.5 : 8, 'metal', 0xd8d4cc);
    this.cb(x, y, z, ax ? 10 : 2.2, 1.0, ax ? 2.2 : 10, 'dark', 0x1a1b1e, { nc: 1 });
  }

  tent(x, z, ax, c) {
    const g = this.flat(x, z, 5, 5, undefined, 3);
    this.rect(x, z, 6, 6);
    const w = ax ? 5 : 4, d = ax ? 4 : 5;
    this.box(x - w / 2, g, z - d / 2, x + w / 2, g + 1.5, z - d / 2 + 0.12, 'plaster', c);
    if (ax) this.box(x - w / 2, g, z - d / 2, x - w / 2 + 0.12, g + 1.5, z + d / 2, 'plaster', c);
    else this.box(x + w / 2 - 0.12, g, z - d / 2, x + w / 2, g + 1.5, z + d / 2, 'plaster', c);
    this.box(x - w / 2 - 0.2, g + 1.5, z - d / 2 - 0.2, x + w / 2 + 0.2, g + 3, z + d / 2 + 0.2, 'plaster', shade(c, 0.9), { nc: 1, gable: ax ? 'x' : 'z' });
    this.loot(x, g + 0.05, z + 0.5);
  }

  stall(x, z, c) {
    const g = this.gh(x, z);
    this.rect(x, z, 4, 4);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.cb(x + sx * 1.5, g - 0.3, z + sz * 1.2, 0.14, 2.9, 0.14, 'wood', 0x6a5234);
    this.cb(x, g + 2.5, z, 3.6, 0.12, 3, 'plaster', c);
    this.cb(x, g - 0.2, z - 0.9, 3, 1.2, 0.7, 'wood', 0x8a6a40);
  }
}

export function shade(c, f) {
  const r = Math.min(255, ((c >> 16) & 255) * f) | 0, g = Math.min(255, ((c >> 8) & 255) * f) | 0, b = Math.min(255, (c & 255) * f) | 0;
  return (r << 16) | (g << 8) | b;
}
