// Décor 3D des menus : le personnage du joueur sur un plateau, éclairé comme dans un studio.
import * as THREE from 'three';
import { Character } from '../models/character.js';
import { Geo } from '../engine/geo.js';
import { lerp } from '../core/util.js';

export class MenuScene {
  constructor() {
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x0d1015);
    s.fog = new THREE.Fog(0x0d1015, 9, 34);
    this.cam = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 100);
    s.add(new THREE.HemisphereLight(0x8a9ac0, 0x2a1e16, 0.9));
    const key = new THREE.SpotLight(0xffe2c0, 60, 20, 0.5, 0.6, 1.4);
    key.position.set(3, 6, 4); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005;
    s.add(key); s.add(key.target);
    const rim = new THREE.SpotLight(0x4a9aff, 70, 20, 0.6, 0.7, 1.4); rim.position.set(-3, 4, -4); s.add(rim); s.add(rim.target);
    const rim2 = new THREE.PointLight(0xff7a2a, 8, 8, 2); rim2.position.set(2.5, 1.2, -2.2); s.add(rim2);
    // sol et plateau
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 48), new THREE.MeshStandardMaterial({ color: 0x15181e, roughness: 0.85, metalness: 0.2 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
    const g = new Geo();
    g.cyl(1.25, 1.35, 0.16, 0, 0.08, 0, 0x22262e, null, 48);
    g.cyl(1.1, 1.1, 0.02, 0, 0.17, 0, 0x2c313a, null, 48);
    const plat = new THREE.Mesh(g.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.6 }));
    plat.receiveShadow = true; plat.castShadow = true; s.add(plat);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.018, 8, 96), new THREE.MeshBasicMaterial({ color: 0xff7a2a, toneMapped: false }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.12; s.add(ring);
    // décor : caisses, conteneur, barils
    const d = new Geo();
    d.box(6.1, 2.6, 2.44, -3.4, 1.3, -5.2, 0x8a3a2a, [0, 0.3, 0]); d.box(6.1, 2.6, 2.44, -3.0, 3.9, -5.4, 0x2a4a6a, [0, 0.25, 0]);
    d.box(1.1, 1.1, 1.1, 2.8, 0.55, -2.6, 0x7a5c36, [0, 0.4, 0]); d.box(0.8, 0.8, 0.8, 2.85, 1.5, -2.6, 0x8a6a40, [0, 0.1, 0]); d.box(1.2, 1.2, 1.2, 3.9, 0.6, -3.3, 0x6a5030, [0, -0.3, 0]);
    d.cyl(0.36, 0.36, 1, -2.6, 0.5, -1.6, 0xa83a2a, null, 14); d.cyl(0.36, 0.36, 1, -2.0, 0.5, -2.2, 0x2a5a9a, null, 14);
    d.box(3.2, 1.05, 0.55, 4.4, 0.52, -0.6, 0x8a8a86, [0, -0.7, 0]);
    const deco = new THREE.Mesh(d.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.15 }));
    deco.castShadow = true; deco.receiveShadow = true; s.add(deco);
    // poussière en suspension
    const n = 260, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 12; pos[i * 3 + 1] = Math.random() * 5; pos[i * 3 + 2] = (Math.random() - 0.5) * 10; }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xffd9a8, size: 0.025, transparent: true, opacity: 0.5, depthWrite: false }));
    s.add(this.dust);
    this.char = null; this.rot = -0.35; this.rotV = 0; this.t = 0; this.pan = -1.3; this.panT = -1.3; this.zoom = 6.2; this.zoomT = 6.2; this.camY = 1.25; this.camYT = 1.25; this.look = 1.0; this.lookT = 1.0;
    this.weapon = 'mistral';
    // rotation du personnage à la souris
    let drag = null;
    addEventListener('pointerdown', (e) => { if (this.active && e.target.tagName === 'CANVAS') drag = e.clientX; });
    addEventListener('pointermove', (e) => { if (drag !== null) { this.rotV = (e.clientX - drag) * 0.01; this.rot += this.rotV; drag = e.clientX; } });
    addEventListener('pointerup', () => { drag = null; });
    this.active = true;
  }

  setCos(cos, weapon) {
    if (weapon) this.weapon = weapon;
    if (this.char) this.scene.remove(this.char.root);
    this.char = new Character(cos);
    this.char.setWeapon(this.weapon);
    this.char.root.position.y = 0.18;
    this.scene.add(this.char.root);
  }

  /** Cadrage : side = -1 personnage à droite de l'écran, +1 à gauche, 0 au centre ; close = gros plan sur la tête. */
  frame(side, close) {
    const narrow = innerWidth < 900;
    this.panT = narrow ? 0 : side * (close ? 0.75 : 1.6);
    this.zoomT = close ? 3.2 : 6.2;
    this.camYT = close ? 1.85 : 1.25;
    this.lookT = close ? 1.75 : 1.0;
  }

  render(renderer, dt) {
    this.t += dt;
    const k = 1 - Math.exp(-5 * dt);
    this.pan = lerp(this.pan, this.panT, k); this.zoom = lerp(this.zoom, this.zoomT, k); this.camY = lerp(this.camY, this.camYT, k); this.look = lerp(this.look, this.lookT, k);
    this.rotV *= 0.95;
    if (Math.abs(this.rotV) < 0.001) this.rot += dt * 0.12;
    this.cam.aspect = innerWidth / innerHeight;
    const sc = this.cam.aspect < 1 ? 1.5 : 1;
    this.cam.position.set(this.pan, this.camY, this.zoom * sc);
    this.cam.lookAt(this.pan, this.look, 0);
    this.cam.updateProjectionMatrix();
    if (this.char) {
      this.char.root.rotation.y = this.rot + Math.PI;
      this.char.update(dt, { speed: 0, moveAng: 0, pitch: Math.sin(this.t * 0.6) * 0.08, crouch: false, air: false, glide: false, ads: false, sprint: false, reload: false, dead: false });
    }
    this.dust.rotation.y += dt * 0.02;
    renderer.render(this.scene, this.cam);
  }
}

/** Petites vignettes 3D des objets de la boutique (rendu hors écran, mis en cache). */
export class Thumbs {
  constructor() {
    this.cv = document.createElement('canvas'); this.cv.width = this.cv.height = 192;
    this.r = new THREE.WebGLRenderer({ canvas: this.cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xc8d4ff, 0x40342a, 1.6));
    const l = new THREE.DirectionalLight(0xffffff, 2.6); l.position.set(2, 3, -4); this.scene.add(l);
    const l3 = new THREE.DirectionalLight(0xffffff, 1.6); l3.position.set(-1, 2, 4); this.scene.add(l3);
    const l2 = new THREE.DirectionalLight(0x6aa8ff, 1.2); l2.position.set(-3, 2, -1); this.scene.add(l2);
    this.cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
    this.cache = new Map(); this.queue = []; this.busy = false;
  }

  get(key, build, cb) {
    if (this.cache.has(key)) { cb(this.cache.get(key)); return; }
    this.queue.push({ key, build, cb });
    if (!this.busy) { this.busy = true; requestAnimationFrame(() => this._run()); }
  }

  _run() {
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < 12) {
      const { key, build, cb } = this.queue.shift();
      if (this.cache.has(key)) { cb(this.cache.get(key)); continue; }
      const obj = build(this.cam);
      this.scene.add(obj);
      this.r.render(this.scene, this.cam);
      this.scene.remove(obj);
      const url = this.cv.toDataURL('image/png');
      this.cache.set(key, url);
      cb(url);
    }
    if (this.queue.length) requestAnimationFrame(() => this._run()); else this.busy = false;
  }
}
