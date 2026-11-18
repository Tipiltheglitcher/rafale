// Rendu three.js d'un World : relief, bâtiments fusionnés par matériau, décors instanciés, ciel, eau, lumières.
import * as THREE from 'three';
import { clamp, fbm, lerp, mulberry32 } from '../core/util.js';
import { Geo, glowTexture } from '../engine/geo.js';
import { topAt } from './world.js';

// ---------------------------------------------------------------- textures procédurales
const texCache = {};
function mkTex(name, size, draw) {
  if (texCache[name]) return texCache[name];
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const x = cv.getContext('2d');
  draw(x, size, mulberry32(name.length * 7919 + size));
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (texCache[name] = t);
}
function noiseFill(x, s, r, base, amp) {
  const im = x.createImageData(s, s), d = im.data;
  for (let i = 0; i < d.length; i += 4) { const v = base + (r() - 0.5) * amp; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  x.putImageData(im, 0, 0);
}
function blotches(x, s, r, n, a) {
  for (let i = 0; i < n; i++) {
    const px = r() * s, py = r() * s, rad = s * (0.05 + r() * 0.16), dark = r() < 0.6;
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, dark ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) { x.setTransform(1, 0, 0, 1, ox, oy); x.fillRect(px - rad, py - rad, rad * 2, rad * 2); }
  }
  x.setTransform(1, 0, 0, 1, 0, 0);
}
function cracks(x, s, r, n, a) {
  x.strokeStyle = `rgba(0,0,0,${a})`; x.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    let px = r() * s, py = r() * s; x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 6; k++) { px += (r() - 0.5) * s * 0.12; py += (r() - 0.5) * s * 0.12; x.lineTo(px, py); }
    x.stroke();
  }
}
const TEX = {
  concrete: () => mkTex('concrete', 256, (x, s, r) => { noiseFill(x, s, r, 228, 26); blotches(x, s, r, 14, 0.07); cracks(x, s, r, 5, 0.16); x.fillStyle = 'rgba(0,0,0,.16)'; x.fillRect(0, 0, s, 2); x.fillRect(0, 0, 2, s); }),
  metal: () => mkTex('metal', 256, (x, s, r) => {
    const im = x.createImageData(s, s), d = im.data;
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) { const v = 208 + 34 * Math.sin((i / s) * Math.PI * 2 * 12) + (r() - 0.5) * 10, k = (j * s + i) * 4; d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = 255; }
    x.putImageData(im, 0, 0);
    for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(90,50,20,${0.08 + r() * 0.16})`; x.fillRect(r() * s, r() * s, 1 + r() * 3, 2 + r() * 9); }
    x.fillStyle = 'rgba(0,0,0,.22)'; x.fillRect(0, 0, s, 3); blotches(x, s, r, 8, 0.05);
  }),
  wood: () => mkTex('wood', 256, (x, s, r) => {
    const n = 5, ph = s / n;
    for (let p = 0; p < n; p++) {
      const v = 196 + r() * 44; x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(0, p * ph, s, ph);
      for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.07})`; x.fillRect(0, p * ph + r() * ph, s, 1); }
      x.fillStyle = 'rgba(0,0,0,.38)'; x.fillRect(0, p * ph, s, 2);
      const jx = r() * s; x.fillRect(jx, p * ph, 2, ph);
    }
  }),
  brick: () => mkTex('brick', 256, (x, s, r) => {
    x.fillStyle = 'rgb(150,150,150)'; x.fillRect(0, 0, s, s);
    const rows = 8, bh = s / rows, bw = s / 4;
    for (let j = 0; j < rows; j++) for (let i = -1; i < 5; i++) { const v = 198 + r() * 52; x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(i * bw + (j & 1 ? bw / 2 : 0) + 2, j * bh + 2, bw - 4, bh - 4); }
    blotches(x, s, r, 8, 0.05);
  }),
  plaster: () => mkTex('plaster', 256, (x, s, r) => { noiseFill(x, s, r, 234, 14); blotches(x, s, r, 22, 0.06); cracks(x, s, r, 3, 0.1); }),
  rock: () => mkTex('rock', 256, (x, s, r) => { noiseFill(x, s, r, 214, 40); blotches(x, s, r, 34, 0.11); cracks(x, s, r, 14, 0.2); }),
  dark: () => mkTex('dark', 128, (x, s, r) => { noiseFill(x, s, r, 222, 34); blotches(x, s, r, 8, 0.06); }),
  ground: () => mkTex('ground', 256, (x, s, r) => { noiseFill(x, s, r, 226, 34); blotches(x, s, r, 40, 0.07); }),
  facade: () => mkTex('facade', 256, (x, s, r) => {
    noiseFill(x, s, r, 150, 12);
    const n = 8, c = s / n;
    for (let j = 0; j < n; j++) { x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(0, j * c, s, 2); for (let i = 0; i < n; i++) { x.fillStyle = 'rgb(46,52,66)'; x.fillRect(i * c + 5, j * c + 7, c - 10, c - 14); } }
  }),
  facadeGlow: () => mkTex('facadeGlow', 256, (x, s, r) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, s, s);
    const n = 8, c = s / n, cols = ['#ffd98a', '#ffe9c0', '#9fe0ff', '#ffb070', '#e8f4ff'];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (r() < 0.36) { x.globalAlpha = 0.5 + r() * 0.5; x.fillStyle = cols[(r() * cols.length) | 0]; x.fillRect(i * c + 5, j * c + 7, c - 10, c - 14); }
    x.globalAlpha = 1;
  }),
};

const KINDS = {
  concrete: { tex: 'concrete', rough: 0.93, uv: 1 / 3 }, metal: { tex: 'metal', rough: 0.55, metal: 0.35, uv: 1 / 3 },
  wood: { tex: 'wood', rough: 0.86, uv: 1 / 2.5 }, brick: { tex: 'brick', rough: 0.9, uv: 1 / 3 }, plaster: { tex: 'plaster', rough: 0.96, uv: 1 / 4 },
  rock: { tex: 'rock', rough: 0.96, uv: 1 / 5 }, dark: { tex: 'dark', rough: 0.9, uv: 1 / 2 }, smooth: { tex: null, rough: 0.42, metal: 0.25, uv: 1 },
  neon: { unlit: true, uv: 1 }, facade: { tex: 'facade', glow: 'facadeGlow', rough: 0.5, metal: 0.3, uv: 1 / 24 },
};

// ---------------------------------------------------------------- lot de faces (bâtiments)
class Batch {
  constructor(uv) { this.p = []; this.n = []; this.c = []; this.u = []; this.uv = uv; }
  face(v, col, ao) {
    // v = 4 sommets [x,y,z] dans le sens trigo vu de l'extérieur
    const e1x = v[1][0] - v[0][0], e1y = v[1][1] - v[0][1], e1z = v[1][2] - v[0][2];
    let e2x = v[2][0] - v[0][0], e2y = v[2][1] - v[0][1], e2z = v[2][2] - v[0][2];
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    let l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) {
      e2x = v[3][0] - v[0][0]; e2y = v[3][1] - v[0][1]; e2z = v[3][2] - v[0][2];
      nx = e1y * e2z - e1z * e2y; ny = e1z * e2x - e1x * e2z; nz = e1x * e2y - e1y * e2x; l = Math.hypot(nx, ny, nz);
      if (l < 1e-9) return;
    }
    nx /= l; ny /= l; nz /= l;
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz), s = this.uv;
    let ymin = 1e9;
    if (ao) for (const q of v) if (q[1] < ymin) ymin = q[1];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const q = v[i];
      this.p.push(q[0], q[1], q[2]); this.n.push(nx, ny, nz);
      const f = ao && q[1] - ymin < 0.01 ? 0.72 : 1;
      this.c.push(col.r * f, col.g * f, col.b * f);
      if (ay >= ax && ay >= az) this.u.push(q[0] * s, q[2] * s); else if (ax >= az) this.u.push(q[2] * s, q[1] * s); else this.u.push(q[0] * s, q[1] * s);
    }
  }
  box(b, col) {
    const { x0, x1, z0, z1, y0 } = b;
    const h00 = topAt(b, x0, z0), h10 = topAt(b, x1, z0), h11 = topAt(b, x1, z1), h01 = topAt(b, x0, z1);
    const ao = b.y1 - y0 > 0.6;
    this.face([[x0, h01, z1], [x1, h11, z1], [x1, h10, z0], [x0, h00, z0]], col, false);
    this.face([[x1, y0, z1], [x1, y0, z0], [x1, h10, z0], [x1, h11, z1]], col, ao);
    this.face([[x0, y0, z0], [x0, y0, z1], [x0, h01, z1], [x0, h00, z0]], col, ao);
    this.face([[x0, y0, z1], [x1, y0, z1], [x1, h11, z1], [x0, h01, z1]], col, ao);
    this.face([[x1, y0, z0], [x0, y0, z0], [x0, h00, z0], [x1, h10, z0]], col, ao);
    if (b.y0 > -50 && b.under !== 0) this.face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], { r: col.r * 0.6, g: col.g * 0.6, b: col.b * 0.6 }, false);
  }
  gable(b, col) {
    const { x0, x1, z0, z1, y0, y1 } = b;
    if (b.gable === 'x') {
      const zc = (z0 + z1) / 2;
      this.face([[x0, y0, z1], [x1, y0, z1], [x1, y1, zc], [x0, y1, zc]], col, false);
      this.face([[x1, y0, z0], [x0, y0, z0], [x0, y1, zc], [x1, y1, zc]], col, false);
      this.face([[x1, y0, z1], [x1, y0, z0], [x1, y1, zc], [x1, y1, zc]], col, false);
      this.face([[x0, y0, z0], [x0, y0, z1], [x0, y1, zc], [x0, y1, zc]], col, false);
    } else {
      const xc = (x0 + x1) / 2;
      this.face([[x1, y0, z1], [x1, y0, z0], [xc, y1, z0], [xc, y1, z1]], col, false);
      this.face([[x0, y0, z0], [x0, y0, z1], [xc, y1, z1], [xc, y1, z0]], col, false);
      this.face([[x0, y0, z1], [x1, y0, z1], [xc, y1, z1], [xc, y1, z1]], col, false);
      this.face([[x1, y0, z0], [x0, y0, z0], [xc, y1, z0], [xc, y1, z0]], col, false);
    }
  }
  cyl(b, col) {
    const r = b.cyl, h = b.y1 - b.y0, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, seg = r > 3 ? 20 : 12, s = this.uv;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const quad = [[cx + c0 * r, b.y0, cz + s0 * r, c0, s0], [cx + c1 * r, b.y0, cz + s1 * r, c1, s1], [cx + c1 * r, b.y1, cz + s1 * r, c1, s1], [cx + c0 * r, b.y1, cz + s0 * r, c0, s0]];
      for (const k of [0, 2, 1, 0, 3, 2]) {
        const q = quad[k], f = q[1] === b.y0 && h > 0.8 ? 0.74 : 1;
        this.p.push(q[0], q[1], q[2]); this.n.push(q[3], 0, q[4]); this.c.push(col.r * f, col.g * f, col.b * f);
        this.u.push(((k === 1 || k === 2 ? i + 1 : i) / seg) * Math.PI * 2 * r * s, q[1] * s);
      }
      for (const q of [[cx, b.y1, cz], [cx + c1 * r, b.y1, cz + s1 * r], [cx + c0 * r, b.y1, cz + s0 * r]]) {
        this.p.push(q[0], q[1], q[2]); this.n.push(0, 1, 0); this.c.push(col.r, col.g, col.b); this.u.push(q[0] * s, q[2] * s);
      }
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.computeBoundingSphere();
    return g;
  }
}

// ---------------------------------------------------------------- modèles des décors instanciés
const PROPS = {
  pine(g) { g.cyl(0.14, 0.22, 2.4, 0, 1.2, 0, 0x5a4028, null, 7); [[1.9, 2.4], [1.5, 3.6], [1.1, 4.7], [0.7, 5.7]].forEach(([r, y], i) => g.cone(r, 2.2, 0, y, 0, i % 2 ? 0x2c5a36 : 0x24502e, null, 8)); },
  snowpine(g) { g.cyl(0.14, 0.22, 2.4, 0, 1.2, 0, 0x4a3626, null, 7); [[1.9, 2.4], [1.5, 3.6], [1.1, 4.7], [0.7, 5.7]].forEach(([r, y]) => { g.cone(r, 2.2, 0, y, 0, 0x2a5238, null, 8); g.cone(r * 0.82, 1.7, 0, y + 0.42, 0, 0xf2f6fa, null, 8); }); },
  oak(g) { g.cyl(0.2, 0.3, 2.8, 0, 1.4, 0, 0x5a4028, null, 7); g.cyl(0.08, 0.14, 1.4, 0.5, 2.9, 0, 0x5a4028, [0, 0, -0.7], 5); [[0, 4.1, 0, 1.9], [1.1, 3.6, 0.3, 1.3], [-1, 3.7, -0.4, 1.4], [0.2, 3.5, -1.1, 1.2], [-0.2, 4.9, 0.4, 1.2]].forEach(([x, y, z, r], i) => g.sph(r, x, y, z, i % 2 ? 0x3f7a34 : 0x35692c, [1, 0.82, 1], 7)); },
  jungle(g) {
    g.cyl(0.26, 0.45, 6.6, 0, 3.3, 0, 0x4a3a26, null, 8);
    for (let i = 0; i < 4; i++) g.cone(0.3, 1.5, Math.cos(i * 1.57) * 0.45, 0.6, Math.sin(i * 1.57) * 0.45, 0x44351f, [Math.sin(i * 1.57) * 0.5, 0, -Math.cos(i * 1.57) * 0.5], 5);
    [[0, 7.6, 0, 3.1], [2.2, 6.9, 0.6, 2.1], [-2, 7, -0.8, 2.2], [0.5, 6.8, -2.2, 2], [-0.6, 7.1, 2.1, 2.1], [0, 8.8, 0, 1.9]].forEach(([x, y, z, r], i) => g.sph(r, x, y, z, [0x2c6a2c, 0x245a26, 0x347a30][i % 3], [1, 0.6, 1], 7));
    g.box(0.05, 2.2, 0.05, 1.6, 5.4, 0.8, 0x3a6a2a); g.box(0.05, 1.7, 0.05, -1.4, 5.7, -0.9, 0x3a6a2a);
  },
  palm(g) {
    for (let i = 0; i < 6; i++) g.cyl(0.13 - i * 0.008, 0.16 - i * 0.008, 1.05, i * i * 0.035, 0.5 + i * 1.0, 0, i % 2 ? 0x7a6040 : 0x86683f, [0, 0, -i * 0.07], 6);
    const tx = 1.25, ty = 6.1;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; g.box(2.6, 0.05, 0.62, tx + Math.cos(a) * 1.2, ty - 0.32, Math.sin(a) * 1.2, i % 2 ? 0x3f8a34 : 0x35782c, [0, -a, -0.42]); }
    g.sph(0.14, tx + 0.15, ty - 0.2, 0.1, 0x4a3420); g.sph(0.14, tx - 0.12, ty - 0.24, -0.1, 0x4a3420);
  },
  dead(g) { g.cyl(0.1, 0.2, 3.4, 0, 1.7, 0, 0x4a4038, null, 6); g.cyl(0.04, 0.08, 1.6, 0.5, 2.8, 0, 0x4a4038, [0, 0, -0.8], 5); g.cyl(0.04, 0.07, 1.3, -0.4, 2.3, 0.2, 0x4a4038, [0.3, 0, 0.9], 5); g.cyl(0.03, 0.06, 1.1, 0.1, 3.6, -0.3, 0x4a4038, [-0.6, 0, 0.2], 5); },
  bush(g) { g.sph(0.7, 0, 0.45, 0, 0x3a7030, [1, 0.75, 1], 6); g.sph(0.5, 0.55, 0.35, 0.2, 0x447c36, [1, 0.8, 1], 6); g.sph(0.45, -0.4, 0.3, -0.35, 0x32662a, [1, 0.8, 1], 6); },
  drybush(g) { g.sph(0.5, 0, 0.3, 0, 0xa89058, [1, 0.6, 1], 6); g.sph(0.34, 0.4, 0.24, 0.1, 0x94804c, [1, 0.7, 1], 6); },
  fern(g) { for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; g.box(1.0, 0.03, 0.3, Math.cos(a) * 0.42, 0.34, Math.sin(a) * 0.42, i % 2 ? 0x3f8a3a : 0x327a30, [0, -a, 0.5]); } },
  cactus(g) { g.cap(0.2, 1.7, 0, 1.05, 0, 0x4a8a4a); g.cap(0.12, 0.5, 0.42, 1.25, 0, 0x4a8a4a, [0, 0, 1.57]); g.cap(0.12, 0.6, 0.68, 1.6, 0, 0x447e44); g.cap(0.11, 0.4, -0.38, 0.95, 0, 0x4a8a4a, [0, 0, 1.57]); g.cap(0.11, 0.45, -0.6, 1.25, 0, 0x447e44); },
  rock(g) { g.sph(0.8, 0, 0.42, 0, 0x8a8478, [1, 0.72, 0.9], 6); g.sph(0.5, 0.55, 0.26, 0.3, 0x7c766a, [1, 0.7, 1], 6); g.sph(0.4, -0.5, 0.2, -0.3, 0x948e82, [1, 0.7, 1], 6); },
  snowrock(g) { g.sph(0.8, 0, 0.42, 0, 0x7a8088, [1, 0.72, 0.9], 6); g.sph(0.5, 0.55, 0.26, 0.3, 0x6e747c, [1, 0.7, 1], 6); g.dome(0.7, 0, 0.55, 0, 0xf2f6fa, [1, 0.62, 0.9]); },
  mossrock(g) { g.sph(0.8, 0, 0.42, 0, 0x7a7c70, [1, 0.72, 0.9], 6); g.sph(0.5, 0.55, 0.26, 0.3, 0x6c6e62, [1, 0.7, 1], 6); g.dome(0.66, -0.05, 0.56, 0.05, 0x4a7a3a, [1, 0.6, 0.9]); },
  lamp(g) { g.cyl(0.06, 0.09, 5, 0, 2.5, 0, 0x2a2c32, null, 6); g.box(1.2, 0.08, 0.1, 0.55, 4.95, 0, 0x2a2c32); g.box(0.5, 0.1, 0.22, 1.0, 4.88, 0, 0x3a3c44); },
  dome(g) { g.dome(1, 0, 0, 0, 0xe8ecf0); g.box(0.16, 0.9, 0.02, 0, 0.5, 0.86, 0x2a2c32, [-0.5, 0, 0]); },
};
const NO_SHADOW = { fern: 1, drybush: 1, bush: 1 };

const _col = new THREE.Color(), _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

export class WorldView {
  /** q = { shadows:boolean, shadowSize:number } */
  constructor(world, renderer, q = {}) {
    this.world = world;
    const def = world.def, env = def.env;
    this.group = new THREE.Group();
    this.disposables = [];
    const track = (o) => { this.disposables.push(o); return o; };

    // --- bâtiments et volumes
    const batches = {};
    for (const b of world.boxes) {
      if (b.nr || !b.k) continue;
      const K = KINDS[b.k] || KINDS.concrete;
      const bt = batches[b.k] || (batches[b.k] = new Batch(K.uv));
      _col.setHex(b.c, THREE.SRGBColorSpace);
      if (b.cyl) bt.cyl(b, _col); else if (b.gable) bt.gable(b, _col); else bt.box(b, _col);
    }
    // ampoules des lampadaires
    for (const p of world.props) if (p.t === 'lamp') {
      const bt = batches.neon || (batches.neon = new Batch(1));
      _col.setHex(env.night ? 0xffe2b0 : 0xd8d8d0, THREE.SRGBColorSpace);
      bt.box({ x0: p.x + 0.78, x1: p.x + 1.22, z0: p.z - 0.09, z1: p.z + 0.09, y0: p.y + 4.76, y1: p.y + 4.83, under: 1 }, _col);
    }
    for (const k in batches) {
      const K = KINDS[k] || KINDS.concrete, geo = track(batches[k].build());
      let mat;
      if (K.unlit) mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false });
      else {
        mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: K.rough, metalness: K.metal || 0, map: K.tex ? TEX[K.tex]() : null });
        if (K.glow) { mat.emissive = new THREE.Color(0xffffff); mat.emissiveMap = TEX[K.glow](); mat.emissiveIntensity = env.night ? 1.6 : 0.15; }
      }
      track(mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = !K.unlit; mesh.receiveShadow = !K.unlit;
      this.group.add(mesh);
    }

    // --- relief
    {
      const n = world.n, res = world.res, half = world.half, G = def.ground;
      const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2);
      const c0 = new THREE.Color().setHex(G.c[0], THREE.SRGBColorSpace), c1 = new THREE.Color().setHex(G.c[1], THREE.SRGBColorSpace);
      const cs = new THREE.Color().setHex(G.steep, THREE.SRGBColorSpace), sh = new THREE.Color().setHex(G.shore, THREE.SRGBColorSpace);
      const pc = {}; for (const k in G.paint) pc[k] = new THREE.Color().setHex(G.paint[k], THREE.SRGBColorSpace);
      const c = new THREE.Color();
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const k = j * n + i, x = -half + i * res, z = -half + j * res, h = world.h[k];
        pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z; uv[k * 2] = x / 7; uv[k * 2 + 1] = z / 7;
        const nz = fbm(x * 0.045, z * 0.045, world.seed + 31, 3);
        const p = world.paint[k];
        if (p && pc[p]) c.copy(pc[p]).multiplyScalar(0.9 + nz * 0.22);
        else {
          c.copy(c0).lerp(c1, clamp((nz - 0.25) * 2, 0, 1));
          const sl = Math.max(Math.abs(world.h[Math.min(k + 1, n * n - 1)] - h), Math.abs(world.h[Math.min(k + n, n * n - 1)] - h)) / res;
          if (sl > 0.5) c.lerp(cs, clamp((sl - 0.5) * 2.2, 0, 1));
          if (h < world.water + 0.7) c.lerp(sh, clamp((world.water + 0.7 - h) / 0.8, 0, 1));
        }
        col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      }
      const idx = new Uint32Array((n - 1) * (n - 1) * 6);
      let t = 0;
      for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, d = a + n, e = d + 1; idx[t++] = a; idx[t++] = d; idx[t++] = b; idx[t++] = b; idx[t++] = d; idx[t++] = e; }
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.computeVertexNormals();
      const mat = track(new THREE.MeshStandardMaterial({ vertexColors: true, map: TEX.ground(), roughness: 0.97 }));
      const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = true;
      this.group.add(mesh);
      // jupe : cache le vide sous les bords de la carte
      const skirt = new THREE.Mesh(track(new THREE.PlaneGeometry(world.size * 6, world.size * 6)), track(new THREE.MeshStandardMaterial({ color: new THREE.Color().setHex(env.water ? env.water.color : G.c[1], THREE.SRGBColorSpace), roughness: 1 })));
      skirt.rotation.x = -Math.PI / 2; skirt.position.y = env.water ? world.water - 6 : -0.5;
      if (!env.water) { skirt.geometry.dispose(); const ring = track(new THREE.RingGeometry(world.half * 1.4142, world.size * 4, 4, 1, Math.PI / 4)); skirt.geometry = ring; skirt.position.y = Math.max(0, world.heightAt(world.half - 1, 0) - 0.2); }
      this.group.add(skirt);
    }

    // --- décors instanciés
    {
      const by = {};
      for (const p of world.props) (by[p.t] || (by[p.t] = [])).push(p);
      const pm = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
      const rng = mulberry32(world.seed + 5);
      for (const t in by) {
        if (!PROPS[t]) continue;
        const g = new Geo(); PROPS[t](g);
        const geo = track(g.build()), list = by[t], im = new THREE.InstancedMesh(geo, pm, list.length);
        list.forEach((p, i) => {
          _q.setFromAxisAngle(_up, p.r);
          const sy = p.s * (0.9 + rng() * 0.25);
          _m4.compose(_v.set(p.x, p.y - 0.05, p.z), _q, _s.set(p.s, sy, p.s));
          im.setMatrixAt(i, _m4);
          const f = 0.82 + rng() * 0.3; im.setColorAt(i, _col.setRGB(f, f, f * (0.94 + rng() * 0.1)));
        });
        im.castShadow = !NO_SHADOW[t]; im.receiveShadow = true;
        im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
        this.group.add(im);
      }
    }

    // --- halos au sol (néons, lampadaires)
    if (world.glows && world.glows.length) {
      const geo = track(new THREE.PlaneGeometry(1, 1)); geo.rotateX(-Math.PI / 2);
      const mat = track(new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: env.night ? 0.5 : 0.12, fog: false }));
      const im = new THREE.InstancedMesh(geo, mat, world.glows.length);
      world.glows.forEach((gl, i) => { _m4.compose(_v.set(gl.x, gl.y, gl.z), _q.identity(), _s.set(gl.r * 2, 1, gl.r * 2)); im.setMatrixAt(i, _m4); im.setColorAt(i, _col.setHex(gl.c, THREE.SRGBColorSpace)); });
      im.renderOrder = 2;
      this.group.add(im);
    }

    // --- eau
    if (env.water) {
      const mat = track(new THREE.MeshStandardMaterial({ color: new THREE.Color().setHex(env.water.color, THREE.SRGBColorSpace), transparent: true, opacity: 0.8, roughness: 0.12, metalness: 0.35 }));
      const w = new THREE.Mesh(track(new THREE.PlaneGeometry(world.size * 6, world.size * 6)), mat);
      w.rotation.x = -Math.PI / 2; w.position.y = world.water; w.receiveShadow = true;
      this.group.add(w);
    }

    // --- ciel
    const sunDir = new THREE.Vector3(...env.sun.dir).normalize();
    this.sunDir = sunDir;
    const skyMat = track(new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(env.skyTop) }, hor: { value: new THREE.Color(env.skyHor) }, sun: { value: sunDir }, sunCol: { value: new THREE.Color(env.sun.color) }, night: { value: env.night ? 1 : 0 } },
      vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 d; uniform vec3 top; uniform vec3 hor; uniform vec3 sun; uniform vec3 sunCol; uniform float night;
        void main(){ vec3 n = normalize(d); float t = pow(clamp(n.y, 0.0, 1.0), 0.55); vec3 c = mix(hor, top, t);
          if (n.y < 0.0) c = mix(hor, hor * 0.55, clamp(-n.y * 4.0, 0.0, 1.0));
          float s = max(dot(n, sun), 0.0);
          c += sunCol * (pow(s, 700.0) * (night > 0.5 ? 1.6 : 6.0) + pow(s, 24.0) * (night > 0.5 ? 0.12 : 0.28));
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    const sky = new THREE.Mesh(track(new THREE.SphereGeometry(900, 24, 14)), skyMat);
    sky.frustumCulled = false; this.sky = sky;
    this.group.add(sky);
    if (env.night) {
      const r = mulberry32(99), sp = new Float32Array(900 * 3);
      for (let i = 0; i < 900; i++) { const a = r() * 6.283, y = 0.08 + r() * 0.92, rr = Math.sqrt(1 - y * y); sp[i * 3] = Math.cos(a) * rr * 850; sp[i * 3 + 1] = y * 850; sp[i * 3 + 2] = Math.sin(a) * rr * 850; }
      const sg = track(new THREE.BufferGeometry()); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      const stars = new THREE.Points(sg, track(new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 })));
      stars.frustumCulled = false; this.stars = stars;
      this.group.add(stars);
    }

    // --- lumières
    this.hemi = new THREE.HemisphereLight(env.hemi.sky, env.hemi.ground, env.hemi.int);
    this.sun = new THREE.DirectionalLight(env.sun.color, env.sun.int);
    this.sun.castShadow = !!q.shadows;
    if (q.shadows) {
      const s = this.sun.shadow, R = 62;
      s.mapSize.set(q.shadowSize || 2048, q.shadowSize || 2048);
      s.camera.left = -R; s.camera.right = R; s.camera.top = R; s.camera.bottom = -R; s.camera.near = 1; s.camera.far = 260;
      s.bias = -0.0006; s.normalBias = 0.05;
    }
    this.group.add(this.hemi, this.sun, this.sun.target);
    this.fog = new THREE.Fog(env.fog[0], env.fog[1], env.fog[2]);

    // --- réflexions : carte d'environnement tirée du ciel
    if (renderer) {
      const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene();
      es.add(new THREE.Mesh(sky.geometry, skyMat));
      this.envMap = pm.fromScene(es, 0.04).texture;
      pm.dispose();
    }
  }

  addTo(scene) {
    scene.add(this.group);
    scene.fog = this.fog;
    scene.background = null;
    scene.environment = this.envMap || null;
    scene.environmentIntensity = this.world.def.env.night ? 0.7 : 0.55;
  }

  setViewDistance(d) { const f = this.world.def.env.fog; this.fog.far = Math.min(f[2], d); this.fog.near = Math.min(f[1], d * 0.3); }

  /** Recentre le ciel et la zone d'ombres sur la caméra. */
  update(cam) {
    this.sky.position.copy(cam.position);
    if (this.stars) this.stars.position.copy(cam.position);
    const tx = Math.round(cam.position.x / 4) * 4, tz = Math.round(cam.position.z / 4) * 4;
    this.sun.target.position.set(tx, 0, tz);
    this.sun.position.set(tx + this.sunDir.x * 130, this.sunDir.y * 130, tz + this.sunDir.z * 130);
    this.sun.target.updateMatrixWorld();
  }

  dispose(scene) {
    scene.remove(this.group);
    scene.fog = null; scene.environment = null;
    for (const d of this.disposables) d.dispose();
    if (this.envMap) this.envMap.dispose();
    this.group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
  }
}
