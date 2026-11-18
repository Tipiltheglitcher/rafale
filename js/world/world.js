// Monde logique : relief, colliders, physique des personnages, lancers de rayon et navigation des bots.
// Aucune dépendance à three.js : ce module tourne à l'identique côté hôte (simulation) et côté client.
import { clamp, mulberry32 } from '../core/util.js';
import { Builder } from './mapgen.js';

export const STEP = 0.55; // hauteur de marche franchissable
export const PR = 0.4; // rayon du personnage
export const PH = 1.8; // hauteur debout
export const PHC = 1.25; // hauteur accroupi
const CELL = 8;

export function topAt(b, x, z) {
  if (!b.ramp) return b.y1;
  let t;
  if (b.ramp === 1) t = (x - b.x0) / (b.x1 - b.x0);
  else if (b.ramp === 2) t = (b.x1 - x) / (b.x1 - b.x0);
  else if (b.ramp === 3) t = (z - b.z0) / (b.z1 - b.z0);
  else t = (b.z1 - z) / (b.z1 - b.z0);
  return b.rl + (b.y1 - b.rl) * clamp(t, 0, 1);
}

const _q = [];
const worldCache = new Map();

/** Le monde est entièrement déterministe à partir de (carte, graine) : l'hôte n'envoie que ces deux valeurs. */
export function getWorld(def, seed) {
  const key = def.id + ':' + seed;
  let w = worldCache.get(key);
  if (!w) { worldCache.clear(); w = new World(def, seed); worldCache.set(key, w); }
  return w;
}

export class World {
  constructor(def, seed) {
    this.def = def; this.seed = seed >>> 0;
    this.size = def.size; this.half = def.size / 2;
    this.res = 2; this.n = this.size / this.res + 1;
    this.h = new Float32Array(this.n * this.n);
    this.paint = new Uint8Array(this.n * this.n);
    this.boxes = []; this.props = []; this.lootSpots = []; this.rects = [];
    this.water = def.env.water ? def.env.water.level : -1e9;
    this.arenaR = def.arenaR || 80;
    const n = this.n;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      this.h[j * n + i] = def.shape(-this.half + i * this.res, -this.half + j * this.res, this.seed);
    }
    def.generate(new Builder(this, mulberry32(this.seed ^ 0x9e3779b9)));
    let mh = -1e9;
    for (let i = 0; i < this.h.length; i++) if (this.h[i] > mh) mh = this.h[i];
    this.maxH = mh;
    this.stamp = 0;
    this._buildGrid();
    this._buildNav();
  }

  heightAt(x, z) {
    const n = this.n;
    const fx = clamp((x + this.half) / this.res, 0, n - 1.001), fz = clamp((z + this.half) / this.res, 0, n - 1.001);
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * n + i, h = this.h;
    return (h[k] * (1 - u) + h[k + 1] * u) * (1 - v) + (h[k + n] * (1 - u) + h[k + n + 1] * u) * v;
  }

  // ---------- grille spatiale ----------
  _buildGrid() {
    const gn = (this.gn = Math.ceil(this.size / CELL));
    this.cells = new Array(gn * gn);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
    for (const b of this.boxes) {
      if (b.nc) continue;
      b._s = 0;
      const i0 = clamp(Math.floor((b.x0 + this.half) / CELL), 0, gn - 1), i1 = clamp(Math.floor((b.x1 + this.half) / CELL), 0, gn - 1);
      const j0 = clamp(Math.floor((b.z0 + this.half) / CELL), 0, gn - 1), j1 = clamp(Math.floor((b.z1 + this.half) / CELL), 0, gn - 1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.cells[j * gn + i].push(b);
    }
  }

  query(x0, z0, x1, z1, out) {
    out.length = 0;
    const s = ++this.stamp, gn = this.gn;
    const i0 = clamp(Math.floor((x0 + this.half) / CELL), 0, gn - 1), i1 = clamp(Math.floor((x1 + this.half) / CELL), 0, gn - 1);
    const j0 = clamp(Math.floor((z0 + this.half) / CELL), 0, gn - 1), j1 = clamp(Math.floor((z1 + this.half) / CELL), 0, gn - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const list = this.cells[j * gn + i];
      for (let k = 0; k < list.length; k++) {
        const b = list[k];
        if (b._s === s) continue;
        b._s = s;
        if (b.x1 >= x0 && b.x0 <= x1 && b.z1 >= z0 && b.z0 <= z1) out.push(b);
      }
    }
    return out;
  }

  // ---------- physique du personnage ----------
  /** Repousse le cylindre du personnage hors des murs (tout ce qui dépasse la hauteur de marche). */
  collide(c) {
    const r = PR;
    const list = this.query(c.x - r, c.z - r, c.x + r, c.z + r, _q);
    for (let k = 0; k < list.length; k++) {
      const b = list[k];
      if (b.y0 >= c.y + c.h - 0.05) continue;
      const cx = clamp(c.x, b.x0, b.x1), cz = clamp(c.z, b.z0, b.z1);
      if (topAt(b, cx, cz) <= c.y + STEP) continue;
      const dx = c.x - cx, dz = c.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2), push = (r - d) / d;
        c.x += dx * push; c.z += dz * push;
      } else {
        const l = c.x - b.x0, rr = b.x1 - c.x, n = c.z - b.z0, f = b.z1 - c.z, m = Math.min(l, rr, n, f);
        if (m === l) c.x = b.x0 - r; else if (m === rr) c.x = b.x1 + r; else if (m === n) c.z = b.z0 - r; else c.z = b.z1 + r;
      }
    }
  }

  /** Plus haute surface praticable sous les pieds (relief, dalles, rampes, caisses). */
  groundAt(x, z, y) {
    let g = this.heightAt(x, z);
    const r = 0.22, lim = y + STEP;
    const list = this.query(x - r, z - r, x + r, z + r, _q);
    for (let k = 0; k < list.length; k++) {
      const b = list[k];
      const top = topAt(b, clamp(x, b.x0, b.x1), clamp(z, b.z0, b.z1));
      if (top <= lim && top > g) g = top;
    }
    return g;
  }

  ceilAt(x, z, y) {
    let c = 1e9;
    const r = 0.3;
    const list = this.query(x - r, z - r, x + r, z + r, _q);
    for (let k = 0; k < list.length; k++) {
      const b = list[k];
      if (!b.ramp && b.y0 >= y + 0.9 && b.y0 < c) c = b.y0;
    }
    return c;
  }

  /**
   * Avance un personnage d'un pas de temps. c = {x,y,z,vx,vy,vz,onGround,h,glide}.
   * (wx,wz) = direction voulue normalisée, speed = vitesse cible, jump = saut demandé.
   */
  stepChar(c, wx, wz, speed, jump, dt) {
    const tx = wx * speed, tz = wz * speed;
    const acc = (c.onGround ? 58 : c.glide ? 26 : 13) * dt;
    const ax = tx - c.vx, az = tz - c.vz, al = Math.hypot(ax, az);
    if (al <= acc || al === 0) { c.vx = tx; c.vz = tz; } else { c.vx += (ax / al) * acc; c.vz += (az / al) * acc; }
    if (c.glide) c.vy = Math.max(c.vy - 20 * dt, -15); else c.vy -= 22 * dt;
    if (jump && c.onGround) { c.vy = 7.2; c.onGround = false; c.jumped = true; }

    const hs = Math.hypot(c.vx, c.vz) * dt;
    const steps = Math.max(1, Math.ceil(hs / 0.22));
    for (let s = 0; s < steps; s++) {
      c.x += (c.vx * dt) / steps; c.z += (c.vz * dt) / steps;
      this.collide(c);
    }
    const lim = this.half - 1.5;
    c.x = clamp(c.x, -lim, lim); c.z = clamp(c.z, -lim, lim);

    const oldY = c.y;
    let ny = c.y + c.vy * dt;
    const g = this.groundAt(c.x, c.z, oldY);
    const was = c.onGround;
    if (c.vy <= 0) {
      if (ny <= g) { ny = g; c.vy = 0; c.onGround = true; if (!was) c.landed = true; c.glide = false; }
      else if (was && oldY - g <= STEP + 0.05) { ny = g; c.vy = 0; }
      else c.onGround = false;
    } else {
      c.onGround = false;
      const ce = this.ceilAt(c.x, c.z, oldY);
      if (ny + c.h > ce) { ny = ce - c.h; c.vy = 0; }
      if (ny < g) ny = g;
    }
    c.y = ny;
    c.inWater = c.y < this.water - 0.25;
  }

  // ---------- lancer de rayon ----------
  _rayTerrain(ox, oy, oz, dx, dy, dz, maxT) {
    let t = 0;
    if (oy > this.maxH + 0.5) {
      if (dy >= 0) return maxT;
      t = (this.maxH + 0.5 - oy) / dy;
      if (t >= maxT) return maxT;
    }
    const lim = this.half + 4;
    let prev = t;
    for (let i = 0; i < 600 && t < maxT; i++) {
      const x = ox + dx * t, z = oz + dz * t, y = oy + dy * t;
      if (x < -lim || x > lim || z < -lim || z > lim) return maxT;
      const d = y - this.heightAt(x, z);
      if (d < 0) {
        let a = prev, b = t;
        for (let k = 0; k < 7; k++) {
          const m = (a + b) / 2;
          if (oy + dy * m < this.heightAt(ox + dx * m, oz + dz * m)) b = m; else a = m;
        }
        return b;
      }
      prev = t;
      t += clamp(d * 0.6, 0.4, 5);
    }
    return maxT;
  }

  /** Renvoie la distance du premier impact (ou maxT). info reçoit la normale (nx,ny,nz) si fourni. */
  raycast(ox, oy, oz, dx, dy, dz, maxT, info) {
    let best = this._rayTerrain(ox, oy, oz, dx, dy, dz, maxT);
    let axis = 1, sign = 1;
    const terrainHit = best < maxT;
    const s = ++this.stamp, gn = this.gn, half = this.half;
    let cx = Math.floor((ox + half) / CELL), cz = Math.floor((oz + half) / CELL);
    const idx = dx !== 0 ? 1 / dx : 1e30, idy = dy !== 0 ? 1 / dy : 1e30, idz = dz !== 0 ? 1 / dz : 1e30;
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    let tx = dx !== 0 ? ((cx + (dx > 0 ? 1 : 0)) * CELL - half - ox) * idx : 1e30;
    let tz = dz !== 0 ? ((cz + (dz > 0 ? 1 : 0)) * CELL - half - oz) * idz : 1e30;
    const dtx = Math.abs(CELL * idx), dtz = Math.abs(CELL * idz);
    let boxHit = false;
    for (let guard = 0; guard < 160; guard++) {
      if (cx >= 0 && cz >= 0 && cx < gn && cz < gn) {
        const list = this.cells[cz * gn + cx];
        for (let k = 0; k < list.length; k++) {
          const b = list[k];
          if (b._s === s) continue;
          b._s = s;
          if (b.np) continue; // garde-fou invisible : bloque les joueurs, pas les balles
          let t0 = 0, t1 = best, ax = 0, a, c;
          a = (b.x0 - ox) * idx; c = (b.x1 - ox) * idx; if (a > c) { const q = a; a = c; c = q; }
          if (a > t0) { t0 = a; ax = 0; } if (c < t1) t1 = c; if (t0 > t1) continue;
          a = (b.y0 - oy) * idy; c = (b.y1 - oy) * idy; if (a > c) { const q = a; a = c; c = q; }
          if (a > t0) { t0 = a; ax = 1; } if (c < t1) t1 = c; if (t0 > t1) continue;
          a = (b.z0 - oz) * idz; c = (b.z1 - oz) * idz; if (a > c) { const q = a; a = c; c = q; }
          if (a > t0) { t0 = a; ax = 2; } if (c < t1) t1 = c; if (t0 > t1) continue;
          if (b.ramp) {
            // la partie « air » au-dessus de la pente ne doit pas arrêter les balles
            let found = -1;
            for (let i = 0; i <= 8; i++) {
              const t = t0 + ((t1 - t0) * i) / 8;
              if (oy + dy * t <= topAt(b, ox + dx * t, oz + dz * t) + 0.02) { found = t; break; }
            }
            if (found < 0) continue;
            if (found > t0) ax = 1;
            t0 = found;
          }
          if (t0 < best) { best = t0; axis = ax; boxHit = true; sign = ax === 0 ? -sx : ax === 2 ? -sz : dy > 0 ? -1 : 1; }
        }
      }
      let t;
      if (tx < tz) { t = tx; tx += dtx; cx += sx; } else { t = tz; tz += dtz; cz += sz; }
      if (t > best) break;
      if ((cx < 0 && sx < 0) || (cx >= gn && sx > 0) || (cz < 0 && sz < 0) || (cz >= gn && sz > 0)) break;
    }
    if (info) {
      info.nx = 0; info.ny = 0; info.nz = 0; info.hit = boxHit || terrainHit;
      if (boxHit) { if (axis === 0) info.nx = sign; else if (axis === 1) info.ny = sign; else info.nz = sign; }
      else info.ny = 1;
    }
    return best;
  }

  los(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return true;
    return this.raycast(ax, ay, az, dx / d, dy / d, dz / d, d) >= d - 0.05;
  }

  // ---------- navigation (grille 1 m + A*) ----------
  _buildNav() {
    const N = (this.nn = this.size), half = this.half;
    const walk = (this.walk = new Uint8Array(N * N));
    for (let j = 3; j < N - 3; j++) for (let i = 3; i < N - 3; i++) {
      const x = -half + i + 0.5, z = -half + j + 0.5, h = this.heightAt(x, z);
      if (h < this.water - 0.75) continue;
      if (Math.abs(this.heightAt(x + 1, z) - this.heightAt(x - 1, z)) > 1.7 || Math.abs(this.heightAt(x, z + 1) - this.heightAt(x, z - 1)) > 1.7) continue;
      const list = this.query(x - 0.75, z - 0.75, x + 0.75, z + 0.75, _q);
      let ok = 1;
      for (let k = 0; k < list.length; k++) {
        const b = list[k];
        if (b.y0 < h + 1.5 && topAt(b, clamp(x, b.x0, b.x1), clamp(z, b.z0, b.z1)) > h + STEP) { ok = 0; break; }
      }
      walk[j * N + i] = ok;
    }
    // zone atteignable depuis le centre : les bots, apparitions et objectifs y restent
    const start = this._nearWalk(N >> 1, N >> 1, 40, 1);
    const stack = [start];
    if (start >= 0) walk[start] = 2;
    while (stack.length) {
      const k = stack.pop(), i = k % N, j = (k / N) | 0;
      if (i > 0 && walk[k - 1] === 1) { walk[k - 1] = 2; stack.push(k - 1); }
      if (i < N - 1 && walk[k + 1] === 1) { walk[k + 1] = 2; stack.push(k + 1); }
      if (j > 0 && walk[k - N] === 1) { walk[k - N] = 2; stack.push(k - N); }
      if (j < N - 1 && walk[k + N] === 1) { walk[k + N] = 2; stack.push(k + N); }
    }
    this._g = new Float32Array(N * N); this._from = new Int32Array(N * N);
    this._open = new Uint32Array(N * N); this._closed = new Uint32Array(N * N); this._ps = 0;
  }

  _nearWalk(i, j, rad, min) {
    const N = this.nn, w = this.walk;
    i = clamp(i, 0, N - 1); j = clamp(j, 0, N - 1);
    if (w[j * N + i] >= min) return j * N + i;
    for (let r = 1; r <= rad; r++) {
      for (let d = -r; d <= r; d++) {
        const c = [[i + d, j - r], [i + d, j + r], [i - r, j + d], [i + r, j + d]];
        for (const [a, b] of c) if (a >= 0 && b >= 0 && a < N && b < N && w[b * N + a] >= min) return b * N + a;
      }
    }
    return -1;
  }

  isOpen(x, z) {
    const N = this.nn, i = Math.floor(x + this.half), j = Math.floor(z + this.half);
    return i >= 0 && j >= 0 && i < N && j < N && this.walk[j * N + i] === 2;
  }

  /** Point aléatoire atteignable dans un disque. */
  randomOpen(rng, cx, cz, r) {
    for (let k = 0; k < 40; k++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * r, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (this.isOpen(x, z)) return [x, z];
    }
    const k = this._nearWalk(Math.floor(cx + this.half), Math.floor(cz + this.half), 60, 2);
    if (k < 0) return [0, 0];
    return [(k % this.nn) - this.half + 0.5, ((k / this.nn) | 0) - this.half + 0.5];
  }

  navClear(x0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 0.4), N = this.nn, half = this.half, w = this.walk;
    for (let i = 1; i < n; i++) {
      const t = i / n, a = Math.floor(x0 + (x1 - x0) * t + half), b = Math.floor(z0 + (z1 - z0) * t + half);
      if (a < 0 || b < 0 || a >= N || b >= N || !w[b * N + a]) return false;
    }
    return true;
  }

  /** A* sur la grille ; renvoie une liste de points [x,z] simplifiée, ou null. */
  findPath(sx, sz, gx, gz, maxExp = 9000) {
    const N = this.nn, half = this.half, w = this.walk;
    const s = this._nearWalk(Math.floor(sx + half), Math.floor(sz + half), 8, 1);
    const g = this._nearWalk(Math.floor(gx + half), Math.floor(gz + half), 10, 1);
    if (s < 0 || g < 0) return null;
    if (s === g) return [[gx, gz]];
    const ps = ++this._ps, G = this._g, from = this._from, open = this._open, closed = this._closed;
    const gi = g % N, gj = (g / N) | 0;
    const hI = [], hF = [];
    const push = (k, f) => {
      let i = hI.length; hI.push(k); hF.push(f);
      while (i > 0) { const p = (i - 1) >> 1; if (hF[p] <= f) break; hI[i] = hI[p]; hF[i] = hF[p]; i = p; }
      hI[i] = k; hF[i] = f;
    };
    const pop = () => {
      const top = hI[0], li = hI.pop(), lf = hF.pop(), n = hI.length;
      if (n) {
        let i = 0;
        for (;;) {
          let c = 2 * i + 1; if (c >= n) break;
          if (c + 1 < n && hF[c + 1] < hF[c]) c++;
          if (hF[c] >= lf) break;
          hI[i] = hI[c]; hF[i] = hF[c]; i = c;
        }
        hI[i] = li; hF[i] = lf;
      }
      return top;
    };
    const heur = (k) => { const dx = Math.abs((k % N) - gi), dz = Math.abs(((k / N) | 0) - gj); return (dx + dz + (1.4142 - 2) * Math.min(dx, dz)) * 1.05; };
    G[s] = 0; from[s] = -1; open[s] = ps; push(s, heur(s));
    let best = s, bestH = heur(s), exp = 0, found = false;
    while (hI.length) {
      const k = pop();
      if (closed[k] === ps) continue;
      closed[k] = ps;
      if (k === g) { found = true; best = k; break; }
      if (++exp > maxExp) break;
      const i = k % N, j = (k / N) | 0, gk = G[k];
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= N || b >= N) continue;
        const nk = b * N + a;
        if (!w[nk] || closed[nk] === ps) continue;
        if (di && dj && (!w[j * N + a] || !w[b * N + i])) continue;
        const ng = gk + (di && dj ? 1.4142 : 1);
        if (open[nk] === ps && ng >= G[nk]) continue;
        G[nk] = ng; from[nk] = k; open[nk] = ps;
        const h = heur(nk);
        if (h < bestH) { bestH = h; best = nk; }
        push(nk, ng + h);
      }
    }
    const raw = [];
    for (let k = best; k >= 0; k = from[k]) { raw.push([(k % N) - half + 0.5, ((k / N) | 0) - half + 0.5]); if (k === s) break; }
    raw.reverse();
    if (found) raw.push([gx, gz]);
    // lissage : on saute les points intermédiaires tant que la ligne droite reste praticable
    const out = [];
    let i = 0;
    while (i < raw.length - 1) {
      let j = Math.min(raw.length - 1, i + 24);
      while (j > i + 1 && !this.navClear(raw[i][0], raw[i][1], raw[j][0], raw[j][1])) j--;
      out.push(raw[j]); i = j;
    }
    return out.length ? out : [raw[raw.length - 1]];
  }
}
