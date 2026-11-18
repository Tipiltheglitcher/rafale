// Assembleur de géométrie : fusionne des primitives colorées (couleur par sommet) en un seul maillage.
// Les personnages et les armes sont entièrement modélisés par code avec cet outil.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _n = new THREE.Matrix3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _c = new THREE.Color();
const cache = new Map();

function prim(key, make) {
  let g = cache.get(key);
  if (!g) { g = make(); if (g.index) g = g.toNonIndexed(); cache.set(key, g); }
  return g;
}

export class Geo {
  constructor() { this.p = []; this.n = []; this.c = []; }

  /** Ajoute une géométrie transformée (position, rotation d'Euler XYZ, échelle) avec une couleur unie. */
  add(g, x, y, z, color, rot, scale) {
    _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0);
    _q.setFromEuler(_e);
    if (scale) _s.set(scale[0], scale[1], scale[2]); else _s.set(1, 1, 1);
    _m.compose(_p.set(x, y, z), _q, _s);
    _n.getNormalMatrix(_m);
    _c.setHex(color, THREE.SRGBColorSpace);
    const pa = g.attributes.position.array, na = g.attributes.normal.array, P = this.p, N = this.n, C = this.c;
    for (let i = 0; i < pa.length; i += 3) {
      _v.set(pa[i], pa[i + 1], pa[i + 2]).applyMatrix4(_m); P.push(_v.x, _v.y, _v.z);
      _v.set(na[i], na[i + 1], na[i + 2]).applyMatrix3(_n).normalize(); N.push(_v.x, _v.y, _v.z);
      C.push(_c.r, _c.g, _c.b);
    }
    return this;
  }

  box(w, h, d, x, y, z, c, rot) { return this.add(prim('b', () => new THREE.BoxGeometry(1, 1, 1)), x, y, z, c, rot, [w, h, d]); }
  /** Cylindre d'axe Y (rt = rayon haut, rb = rayon bas). */
  cyl(rt, rb, h, x, y, z, c, rot, seg = 10, scale) {
    return this.add(prim(`c${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), x, y, z, c, rot, scale);
  }
  /** Cylindre d'axe Z (canons, tubes) : r1 côté -Z (avant), r2 côté +Z. */
  tube(r1, r2, len, x, y, z, c, seg = 10) {
    return this.add(prim(`c${r2}|${r1}|${len}|${seg}`, () => new THREE.CylinderGeometry(r2, r1, len, seg)), x, y, z, c, [Math.PI / 2, 0, 0]);
  }
  sph(r, x, y, z, c, scale, seg = 10) {
    return this.add(prim(`s${seg}`, () => new THREE.SphereGeometry(1, seg, Math.max(6, seg - 2))), x, y, z, c, null, scale ? [r * scale[0], r * scale[1], r * scale[2]] : [r, r, r]);
  }
  /** Demi-sphère (dôme vers +Y). */
  dome(r, x, y, z, c, scale, rot) {
    return this.add(prim('d', () => new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), x, y, z, c, rot, scale ? [r * scale[0], r * scale[1], r * scale[2]] : [r, r, r]);
  }
  /** Capsule d'axe Y : len = longueur du tronçon droit. */
  cap(r, len, x, y, z, c, rot, scale) {
    return this.add(prim(`k${r}|${len}`, () => new THREE.CapsuleGeometry(r, len, 3, 8)), x, y, z, c, rot, scale);
  }
  cone(r, h, x, y, z, c, rot, seg = 8, scale) {
    return this.add(prim(`o${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg)), x, y, z, c, rot, scale);
  }
  torus(r, t, x, y, z, c, rot, scale) {
    return this.add(prim(`t${r}|${t}`, () => new THREE.TorusGeometry(r, t, 6, 12)), x, y, z, c, rot, scale);
  }

  get empty() { return this.p.length === 0; }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

/** Texture de point lumineux (halo radial) réutilisée par les effets. */
let _glow = null;
export function glowTexture() {
  if (_glow) return _glow;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const x = cv.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(0.6, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  _glow = new THREE.CanvasTexture(cv); _glow.colorSpace = THREE.SRGBColorSpace;
  return _glow;
}
