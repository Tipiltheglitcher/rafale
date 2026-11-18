// Effets visuels : traçantes, éclairs de bouche, étincelles, impacts, explosions, fumée.
import * as THREE from 'three';
import { glowTexture } from '../engine/geo.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1);

export class FX {
  constructor(scene) {
    this.scene = scene;
    const glow = glowTexture();
    // traçantes
    this.tracerGeo = new THREE.BoxGeometry(1, 1, 1); this.tracerGeo.translate(0, 0, 0.5);
    this.tracers = [];
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(this.tracerGeo, new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
      m.visible = false; m.frustumCulled = false; m.userData.life = 0; scene.add(m); this.tracers.push(m);
    }
    // particules (sprites)
    this.parts = [];
    for (let i = 0; i < 260; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
      s.visible = false; s.userData = { life: 0 }; scene.add(s); this.parts.push(s);
    }
    this.pi = 0;
    // fumée (non additive)
    this.smokeTex = (() => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d');
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,.75)'); g.addColorStop(0.6, 'rgba(255,255,255,.25)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    this.smoke = [];
    for (let i = 0; i < 90; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, transparent: true, depthWrite: false, color: 0x888888 }));
      s.visible = false; s.userData = { life: 0 }; scene.add(s); this.smoke.push(s);
    }
    this.si = 0;
    // impacts (traces au mur)
    const dg = new THREE.CircleGeometry(0.06, 8);
    this.decals = [];
    for (let i = 0; i < 80; i++) {
      const m = new THREE.Mesh(dg, new THREE.MeshBasicMaterial({ color: 0x18140f, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
      m.visible = false; scene.add(m); this.decals.push(m);
    }
    this.di = 0;
    // lumières dynamiques (bouche du canon, explosions)
    this.lights = [];
    for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffb060, 0, 9, 2); l.userData.life = 0; scene.add(l); this.lights.push(l); }
    this.li = 0;
    // projectiles visibles
    this.projs = new Map();
    this.rocketGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.6, 8); this.rocketGeo.rotateX(Math.PI / 2);
    this.grenGeo = new THREE.SphereGeometry(0.09, 10, 8);
    this.projMat = new THREE.MeshStandardMaterial({ color: 0x5a6068, metalness: 0.6, roughness: 0.4 });
  }

  tracer(from, to, color, width = 0.025, life = 0.07) {
    const m = this.tracers.find((t) => !t.visible) || this.tracers[0];
    _v.subVectors(to, from);
    const len = _v.length();
    if (len < 0.5) return;
    m.position.copy(from);
    m.quaternion.setFromUnitVectors(_z, _v.normalize());
    m.scale.set(width, width, len);
    m.material.color.setHex(color); m.material.opacity = 1;
    m.userData.life = life; m.userData.max = life;
    m.visible = true;
  }

  _part(pos, vel, color, size, life, grow = 0, grav = 0) {
    const s = this.parts[this.pi++ % this.parts.length];
    s.position.copy(pos); s.material.color.setHex(color); s.material.opacity = 1;
    s.scale.setScalar(size);
    Object.assign(s.userData, { life, max: life, vx: vel.x, vy: vel.y, vz: vel.z, size, grow, grav });
    s.visible = true;
  }

  _smoke(pos, size, life, color = 0x888888, rise = 0.6) {
    const s = this.smoke[this.si++ % this.smoke.length];
    s.position.copy(pos); s.material.color.setHex(color); s.material.opacity = 0.55;
    s.scale.setScalar(size); s.material.rotation = Math.random() * 6.28;
    Object.assign(s.userData, { life, max: life, vx: (Math.random() - 0.5) * 0.4, vy: rise, vz: (Math.random() - 0.5) * 0.4, size, grow: size * 1.2 });
    s.visible = true;
  }

  light(pos, color, intensity, life, dist = 9) {
    const l = this.lights[this.li++ % this.lights.length];
    l.position.copy(pos); l.color.setHex(color); l.intensity = intensity; l.distance = dist;
    l.userData.life = life; l.userData.max = life; l.userData.int = intensity;
  }

  muzzle(pos, big) {
    _w.set(0, 0, 0);
    this._part(pos, _w, 0xffc070, big ? 0.7 : 0.45, 0.05);
    this._part(pos, _w, 0xffffff, big ? 0.3 : 0.2, 0.04);
    this.light(pos, 0xffb060, big ? 6 : 3.5, 0.06);
  }

  impact(pos, n, kind) {
    const col = kind === 'flesh' ? 0xc0201a : kind === 'shield' ? 0x4fd9ff : 0xffd090;
    for (let i = 0; i < (kind === 'flesh' ? 5 : 4); i++) {
      _w.set((Math.random() - 0.5) * 2 + n.x * 2, Math.random() * 2 + n.y * 2, (Math.random() - 0.5) * 2 + n.z * 2);
      this._part(pos, _w, col, kind === 'flesh' ? 0.16 : 0.08, 0.25, 0, 9);
    }
    if (kind === 'world') {
      this._smoke(_v.copy(pos).addScaledVector(n, 0.1), 0.35, 0.6, 0x9a9488, 0.3);
      const d = this.decals[this.di++ % this.decals.length];
      d.position.copy(pos).addScaledVector(n, 0.01);
      d.quaternion.setFromUnitVectors(_z, n);
      d.visible = true;
    }
  }

  explosion(pos, r) {
    this.light(pos, 0xff8a30, 30, 0.35, r * 4);
    for (let i = 0; i < 18; i++) {
      _w.set((Math.random() - 0.5), Math.random() * 0.8, (Math.random() - 0.5)).normalize().multiplyScalar(4 + Math.random() * 10);
      this._part(pos, _w, i % 3 ? 0xff9a3a : 0xffe0a0, 0.5 + Math.random() * 0.8, 0.35 + Math.random() * 0.3, 1.5, 6);
    }
    this._part(pos, _w.set(0, 0, 0), 0xffb060, r * 0.9, 0.22, r * 3);
    for (let i = 0; i < 10; i++) this._smoke(_v.copy(pos).add(_w.set((Math.random() - 0.5) * r * 0.6, Math.random() * r * 0.4, (Math.random() - 0.5) * r * 0.6)), r * 0.5, 2.2 + Math.random(), 0x4a4642, 1.2);
  }

  addProj(id, kind, pos, vel) {
    const m = new THREE.Mesh(kind === 'grenade' ? this.grenGeo : this.rocketGeo, this.projMat);
    m.position.copy(pos); m.castShadow = true;
    this.scene.add(m);
    this.projs.set(id, { m, v: vel.clone(), g: kind === 'grenade', t: 0 });
  }

  removeProj(id) { const p = this.projs.get(id); if (p) { this.scene.remove(p.m); this.projs.delete(id); } }

  update(dt, world) {
    for (const m of this.tracers) if (m.visible) { m.userData.life -= dt; if (m.userData.life <= 0) m.visible = false; else m.material.opacity = m.userData.life / m.userData.max; }
    for (const s of this.parts) if (s.visible) {
      const u = s.userData; u.life -= dt;
      if (u.life <= 0) { s.visible = false; continue; }
      u.vy -= u.grav * dt;
      s.position.x += u.vx * dt; s.position.y += u.vy * dt; s.position.z += u.vz * dt;
      const k = u.life / u.max; s.material.opacity = k; s.scale.setScalar(u.size + u.grow * (1 - k));
    }
    for (const s of this.smoke) if (s.visible) {
      const u = s.userData; u.life -= dt;
      if (u.life <= 0) { s.visible = false; continue; }
      s.position.x += u.vx * dt; s.position.y += u.vy * dt; s.position.z += u.vz * dt;
      const k = u.life / u.max; s.material.opacity = 0.55 * k; s.scale.setScalar(u.size + u.grow * (1 - k));
    }
    for (const l of this.lights) if (l.userData.life > 0) { l.userData.life -= dt; l.intensity = Math.max(0, l.userData.int * (l.userData.life / l.userData.max)); }
    for (const p of this.projs.values()) {
      if (p.g) p.v.y -= 15 * dt;
      p.m.position.addScaledVector(p.v, dt);
      if (world && p.g) { const g = world.groundAt(p.m.position.x, p.m.position.z, p.m.position.y + 0.2); if (p.m.position.y < g + 0.09) { p.m.position.y = g + 0.09; p.v.y = Math.abs(p.v.y) * 0.4; p.v.x *= 0.6; p.v.z *= 0.6; } }
      if (!p.g) { _v.copy(p.v).normalize(); p.m.quaternion.setFromUnitVectors(_z, _v); p.t += dt; if (p.t > 0.03) { p.t = 0; this._smoke(p.m.position, 0.3, 0.9, 0xb0aaa0, 0.2); this._part(p.m.position, _w.set(0, 0, 0), 0xff9a3a, 0.4, 0.08); } }
    }
  }

  dispose() {
    for (const p of this.projs.values()) this.scene.remove(p.m);
    this.projs.clear();
  }
}
