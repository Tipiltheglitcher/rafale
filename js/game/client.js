// Partie côté joueur : rendu, déplacement prédit localement, tir (détection des touches côté tireur),
// interpolation des autres joueurs, butin, zone, effets et HUD.
import * as THREE from 'three';
import { MAP } from '../world/maps.js';
import { getWorld, PH, PHC } from '../world/world.js';
import { WorldView } from '../world/worldview.js';
import { Character, nameSprite, armGeometry, bodyMaterial } from '../models/character.js';
import { weaponMesh } from '../models/weapons.js';
import { WEAPONS, WLIST, RARITY, AMMO, pelletDir, rayPlayer, MAX_RANGE } from '../data/weapons.js';
import { getItem, sanitizeCos } from '../data/cosmetics.js';
import { QUALITY } from '../data/profile.js';
import { Geo, glowTexture } from '../engine/geo.js';
import { F, encodeState, decodeSnap } from './proto.js';
import { FX } from './fx.js';
import { Hud, renderMapImage } from '../ui/hud.js';
import { clamp, lerp, angDiff, esc } from '../core/util.js';

const EYE = 1.62, EYE_C = 1.15, VM_FOV = 58;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _n = new THREE.Vector3();
const _d = [0, 0, 0], _info = {}, DOWN = new THREE.Vector3(0, -1, 0);
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;

// ---------------------------------------------------------------- objets au sol
let lootAssets = null;
function getLootAssets() {
  if (lootAssets) return lootAssets;
  const g = new Geo();
  g.box(0.42, 0.26, 0.26, 0, 0, 0, 0xf2f2f2); g.box(0.44, 0.04, 0.28, 0, 0.1, 0, 0xd8d8d8);
  g.box(0.06, 0.16, 0.27, 0, 0, 0, 0xd92a2a); g.box(0.16, 0.06, 0.27, 0, 0, 0, 0xd92a2a); g.box(0.12, 0.03, 0.04, 0, 0.145, 0, 0x3a3a3a);
  const med = g.build();
  const c = new Geo();
  c.cyl(0.11, 0.11, 0.34, 0, 0, 0, 0x2a3a4a, null, 10); c.cyl(0.09, 0.09, 0.36, 0, 0, 0, 0x4fd9e8, null, 10); c.cyl(0.12, 0.12, 0.05, 0, 0.16, 0, 0xc8d0d8, null, 10); c.cyl(0.12, 0.12, 0.05, 0, -0.16, 0, 0xc8d0d8, null, 10);
  const cell = c.build();
  const a = new Geo();
  a.box(0.34, 0.2, 0.22, 0, 0, 0, 0x4a5a3a); a.box(0.36, 0.05, 0.24, 0, 0.06, 0, 0xffffff); a.box(0.06, 0.04, 0.1, 0, 0.12, 0, 0x2a2a2a);
  const ammo = a.build();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 });
  const glowMat = {};
  const glow = (hex) => glowMat[hex] || (glowMat[hex] = new THREE.SpriteMaterial({ map: glowTexture(), color: hex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const beamGeo = new THREE.CylinderGeometry(0.06, 0.14, 7, 8, 1, true); beamGeo.translate(0, 3.5, 0);
  const beamMat = {};
  const beam = (hex) => beamMat[hex] || (beamMat[hex] = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const ammoTint = {};
  for (const k in AMMO) ammoTint[k] = new THREE.MeshStandardMaterial({ color: AMMO[k].color, roughness: 0.5, metalness: 0.3 });
  return (lootAssets = { med, cell, ammo, mat, glow, beamGeo, beam, ammoTint });
}

export class Game {
  constructor(app, info) {
    this.app = app; this.info = info;
    const st = app.profile.settings, q = (this.q = QUALITY[st.quality] || QUALITY.high);
    this.world = getWorld(MAP[info.map], info.seed);
    this.scene = new THREE.Scene();
    this.view = new WorldView(this.world, app.renderer, { shadows: q.shadows > 0, shadowSize: q.shadows });
    this.view.addTo(this.scene); this.view.setViewDistance(q.view);
    this.cam = new THREE.PerspectiveCamera(st.fov, innerWidth / innerHeight, 0.05, 1500);
    this.cam.rotation.order = 'YXZ';
    this.fx = new FX(this.scene);
    this.mapImg = renderMapImage(this.world);

    // vue de l'arme (scène séparée, dessinée par-dessus)
    const env = this.world.def.env;
    this.vmScene = new THREE.Scene();
    this.vmCam = new THREE.PerspectiveCamera(VM_FOV, innerWidth / innerHeight, 0.01, 10);
    this.vmScene.add(new THREE.HemisphereLight(env.hemi.sky, env.hemi.ground, env.hemi.int * 1.6));
    this.vmScene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const dl = new THREE.DirectionalLight(env.sun.color, env.sun.int * 0.9); dl.position.set(0.5, 1, 0.8); this.vmScene.add(dl);
    this.vmScene.environment = this.view.envMap || null; this.vmScene.environmentIntensity = 0.7;
    this.vmRoot = new THREE.Group(); this.vmScene.add(this.vmRoot);
    this.vmWid = undefined; this.vmGun = null; this.vmHolder = null; this.vmSightY = 0.1; this.sprintT = 0;

    // joueurs
    this.ents = new Map();
    for (const [id, name, team, bot, cos] of info.roster) {
      this.ents.set(id, { id, name, team, bot: !!bot, cos: sanitizeCos(cos), buf: [], vis: false, alive: true, kills: 0, deaths: 0, hp: 100, sh: 0, ch: null, tag: null,
        rx: 0, ry: 0, rz: 0, ryaw: 0, rpitch: 0, rfl: 0, rw: 255, vx: 0, vz: 0, stepAcc: 0, dead: false, deadAt: 0, lastSnap: -9 });
    }
    const sp = info.spawn;
    this.myTeam = this.ents.get(info.you).team;
    this.me = {
      id: info.you, ch: { x: sp[0], y: sp[1], z: sp[2], vx: 0, vy: 0, vz: 0, onGround: false, h: PH, glide: !!info.glide }, yaw: sp[3], pitch: -0.15,
      alive: true, hp: 100, sh: 0, seq: 0, eye: EYE, crouch: false, wantCrouch: false, ads: false, adsT: 0, sprint: false, slot: 0, fireT: 0, burst: 0,
      reloadT: 0, reloadDur: 0, switchT: 0, bloom: 0, healT: 0, healDur: 0, healK: '', stepAcc: 0, bobT: 0, sendT: 0, kills: 0, kick: 0, sway: 0, swayY: 0, awaitRl: false, slotT: 0,
    };
    this.inv = null;
    this.offset = null; this.snapStamp = 0; this.matchTime = 0;
    this.aliveN = this.ents.size; this.teamsN = 0;
    this.zone = info.zone; this.outside = false;
    this.over = false; this.shake = 0; this.spectating = false; this.specId = 0; this.specYaw = 0; this.specPitch = 0.25;
    this.camPos = new THREE.Vector3(sp[0], sp[1], sp[2]); this.camYaw = sp[3];
    this.curSpread = 0; this.scoped = false; this.sprinting = false;

    // butin
    this.lootGroup = new THREE.Group(); this.scene.add(this.lootGroup);
    this.loot = new Map();
    for (const l of info.loot) this.addLoot(l);
    this.lootT = 0; this.promptLoot = null;

    // zone
    this.zoneMat = new THREE.ShaderMaterial({
      transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false,
      uniforms: { t: { value: 0 }, c: { value: new THREE.Color(0x3a8aff) } },
      vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float t; uniform vec3 c; varying vec2 vUv; varying vec3 vW;
        void main(){ float s = 0.5 + 0.5 * sin(vW.y * 0.9 - t * 2.5); float h = 0.5 + 0.5 * sin((vW.x + vW.z) * 0.35 + t);
          float d = distance(cameraPosition.xz, vW.xz);
          float a = (0.16 + 0.14 * s + 0.05 * h) * smoothstep(0.0, 0.03, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y)) * (1.0 - smoothstep(60.0, 220.0, d)) * (1.0 - smoothstep(30.0, 160.0, vW.y - cameraPosition.y));
          gl_FragColor = vec4(c * (1.0 + 0.4 * s), a); }`,
    });
    this.zoneMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 128, 1, true), this.zoneMat);
    this.zoneMesh.frustumCulled = false; this.zoneMesh.renderOrder = 3;
    this.scene.add(this.zoneMesh);

    this.hud = new Hud(this);
    if (info.mode === 'br') this.hud.notice(`<b>${esc(this.world.def.name)}</b><small>Battle royale ${['', 'solo', 'duo', 'trio', 'escouade'][info.ts]} — soyez le dernier debout</small>`, 'big', 5);
    else this.hud.notice(`<b>${esc(this.world.def.name)}</b><small>Chacun pour soi — premier à ${info.score} éliminations</small>`, 'big', 5);
  }

  // ================================================================ réseau
  onInv(inv) {
    const me = this.me, old = this.inv;
    if (old) {
      // les tirs déjà partis ne doivent pas « revenir » dans le chargeur
      for (let i = 0; i < 4; i++) {
        const a = old.w[i], b = inv.w[i];
        if (a && b && a.id === b.id && !me.awaitRl && b.mag > a.mag) b.mag = a.mag;
      }
      if (me.reloadT > 0) { const a = old.w[me.slot], b = inv.w[me.slot]; if (a && b && a.id === b.id) { b.mag = a.mag; inv.ammo = { ...inv.ammo }; } }
      const got = inv.med > old.med || inv.cell > old.cell || inv.w.some((w, i) => w && (!old.w[i] || old.w[i].id !== w.id)) || Object.keys(inv.ammo).some((k) => inv.ammo[k] > old.ammo[k] && !me.awaitRl);
      if (got) this.app.sound.pickup();
    }
    me.awaitRl = false;
    if (performance.now() - me.slotT > 600 || !inv.w[me.slot]) me.slot = inv.slot;
    if (!inv.w[me.slot]) { const i = inv.w.findIndex(Boolean); if (i >= 0) { me.slot = i; this.app.net.send(['sl', i]); } }
    this.inv = inv;
  }

  onSnap(dv) {
    if (dv.byteLength < 6 || dv.getUint8(0) !== 1) return;
    const s = decodeSnap(dv), now = performance.now(), sample = s.t - now;
    if (this.offset === null) this.offset = sample;
    else if (sample > this.offset) this.offset = sample * 0.25 + this.offset * 0.75;
    else this.offset += (sample - this.offset) * 0.02;
    this.snapStamp++;
    for (const st of s.list) {
      const e = this.ents.get(st.id);
      if (!e) continue;
      e.hp = st.hp; e.sh = st.sh; e.lastSnap = this.snapStamp;
      if (st.id === this.me.id) { if (this.me.alive) { this.me.hp = st.hp; this.me.sh = st.sh; } continue; }
      if (e.dead) { if (now - e.deadAt > 700) { e.dead = false; e.buf.length = 0; } else continue; }
      e.alive = true;
      const b = e.buf;
      if (b.length && st.x === b[b.length - 1].x && s.t <= b[b.length - 1].t) continue;
      b.push({ t: s.t, x: st.x, y: st.y, z: st.z, yaw: st.yaw, pitch: st.pitch, fl: st.fl, w: st.widx });
      if (b.length > 40) b.shift();
    }
  }

  onEvents(list) {
    for (const m of list) {
      try { this.onEvent(m); } catch (err) { console.error('événement', m && m[0], err); }
    }
  }

  onEvent(m) {
    const me = this.me, hud = this.hud, snd = this.app.sound;
    switch (m[0]) {
      case 'f': this.remoteFire(m); break;
      case 'hit': {
        const [, tid, amt, head, killed, shield] = m, t = this.ents.get(tid);
        hud.hitmarker(head, killed); snd.hit(head);
        if (t && t.vis) hud.dmgNumber(_v.set(t.rx, t.ry + (t.rfl & F.CROUCH ? 1.5 : 1.95), t.rz), amt, head, shield);
        break;
      }
      case 'dmg': {
        const [, by, , bx, bz] = m;
        if (by && by !== me.id) {
          const a = Math.atan2(-(bx - me.ch.x), -(bz - me.ch.z));
          hud.damageDir(-angDiff(me.yaw, a));
        } else hud.damageDir(Math.PI);
        if (me.sh > 0) snd.shieldHit(); else snd.hurt();
        break;
      }
      case 'kill': {
        const [, kid, vid, wid, head] = m, K = this.ents.get(kid), V = this.ents.get(vid);
        if (V) { V.deaths++; V.alive = false; if (vid !== me.id && V.buf.length) { V.dead = true; V.deadAt = performance.now(); } }
        if (K && kid !== vid) K.kills++;
        hud.feed(K && kid !== vid ? K.name : null, V ? V.name : '?', wid, head, kid === me.id || vid === me.id);
        if (kid === me.id && vid !== me.id) { me.kills++; hud.notice(`<b>${esc(V ? V.name : '')}</b> éliminé${head ? ' <i>tir à la tête</i>' : ''}`, 'kill', 1.8); snd.kill(); }
        if (vid === me.id) this.die(kid);
        break;
      }
      case 'spawn': {
        const [, id, x, y, z, yaw, seq] = m;
        if (id === me.id) {
          Object.assign(me.ch, { x, y, z, vx: 0, vy: 0, vz: 0, onGround: true, glide: false });
          Object.assign(me, { alive: true, seq, yaw, pitch: 0, hp: 100, sh: 50, reloadT: 0, healT: 0, burst: 0, ads: false, adsT: 0 });
          this.spectating = false; hud.death(null);
        } else { const e = this.ents.get(id); if (e) { e.dead = false; e.buf.length = 0; } }
        break;
      }
      case 'la': this.addLoot(m[1]); break;
      case 'ld': this.removeLoot(m[1]); break;
      case 'zone': {
        this.zone = m[1];
        if (this.zone.i > 0 || this.info.mode === 'br') { snd.zone(); hud.notice(this.zone.i === 0 ? 'La zone est apparue — elle se refermera bientôt' : 'La zone va se refermer', 'zone', 3.5); }
        break;
      }
      case 'alive': this.aliveN = m[1]; this.teamsN = m[2]; break;
      case 'proj': {
        const [, pid, oid, widx, x, y, z, vx, vy, vz] = m, W = WLIST[widx];
        this.fx.addProj(pid, W ? W.proj : 'rocket', _v.set(x, y, z), _v2.set(vx, vy, vz));
        if (oid !== me.id) { snd.shot('launcher', x, y, z, false); const e = this.ents.get(oid); if (e && e.ch) e.ch.fire(); }
        break;
      }
      case 'boom': {
        const [, pid, x, y, z, R] = m;
        this.fx.removeProj(pid); this.fx.explosion(_v.set(x, y, z), R); snd.boom(x, y, z);
        const d = Math.hypot(x - this.camPos.x, y - this.camPos.y, z - this.camPos.z);
        this.shake = Math.max(this.shake, clamp(1.2 - d / 30, 0, 1));
        break;
      }
      case 'end': this.over = true; this.me.ads = false; this.app.onMatchEnd(m[1]); break;
      case 'left': { const e = this.ents.get(m[1]); if (e) { if (e.ch) this.scene.remove(e.ch.root); if (e.tag) this.scene.remove(e.tag); this.ents.delete(m[1]); } break; }
    }
  }

  // ================================================================ butin
  addLoot([id, k, a, b, x, y, z]) {
    const A = getLootAssets(), g = new THREE.Group();
    let spin = false, label = '', color = '#fff';
    if (k === 'w') {
      const m = weaponMesh(a, 'standard'); m.scale.setScalar(1.5); m.rotation.y = Math.PI / 2; g.add(m); spin = true;
      const R = RARITY[b], s = new THREE.Sprite(A.glow(R.hex)); s.scale.set(1.6, 0.7, 1); s.position.y = -0.25; g.add(s);
      if (b >= 2) { const bm = new THREE.Mesh(A.beamGeo, A.beam(R.hex)); bm.position.y = -0.3; g.add(bm); }
      label = `${WEAPONS[a].name}`; color = R.color;
    } else if (k === 'a') {
      const m = new THREE.Mesh(A.ammo, A.mat); g.add(m);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.06, 0.23), A.ammoTint[a]); strip.position.y = -0.02; g.add(strip);
      label = `Munitions ${AMMO[a].name.toLowerCase()} ×${b}`; color = AMMO[a].color;
    } else if (k === 'm') { g.add(new THREE.Mesh(A.med, A.mat)); label = 'Trousse de soins'; color = '#ff6a6a'; }
    else { g.add(new THREE.Mesh(A.cell, A.mat)); label = 'Cellule de bouclier'; color = '#4fd9e8'; }
    g.position.set(x, y + 0.32, z);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.lootGroup.add(g);
    this.loot.set(id, { id, k, a, b, x, y, z, g, spin, label, color, ph: Math.random() * 6 });
  }

  removeLoot(id) {
    const L = this.loot.get(id);
    if (!L) return;
    this.lootGroup.remove(L.g);
    this.loot.delete(id);
  }

  updateLoot(dt) {
    const me = this.me, cp = this.camPos;
    this.lootT -= dt;
    if (this.lootT <= 0) {
      this.lootT = 0.25;
      for (const L of this.loot.values()) L.g.visible = (L.x - cp.x) ** 2 + (L.z - cp.z) ** 2 < 95 * 95;
    }
    const t = performance.now() / 1000;
    let best = null, bs = 1e9;
    const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
    for (const L of this.loot.values()) {
      if (!L.g.visible) continue;
      if (L.spin) L.g.rotation.y += dt * 0.9;
      L.g.position.y = L.y + 0.32 + Math.sin(t * 2 + L.ph) * 0.05;
      if (!me.alive) continue;
      const dx = L.x - me.ch.x, dz = L.z - me.ch.z, d = Math.hypot(dx, dz);
      if (d > 2.6 || Math.abs(L.y - me.ch.y) > 2) continue;
      const facing = d < 0.01 ? 1 : (dx * fx + dz * fz) / d;
      const s = d - facing * 1.2;
      if (s < bs) { bs = s; best = L; }
    }
    this.promptLoot = best;
    if (best && this.inv) {
      const key = this.app.input.label(this.app.profile.settings.keys.use);
      const full = best.k === 'w' && !this.inv.w.includes(null) && this.inv.w[me.slot];
      const verb = full ? `Échanger <i>${esc(WEAPONS[this.inv.w[me.slot].id].name)}</i> contre` : 'Ramasser';
      const rar = best.k === 'w' ? ` <small>${RARITY[best.b].name}</small>` : '';
      this.hud.prompt(`<kbd>${esc(key)}</kbd> ${verb} <b style="color:${best.color}">${esc(best.label)}</b>${rar}`);
    } else this.hud.prompt('');
  }

  // ================================================================ joueur local
  curItem() { return this.inv && this.me.alive ? this.inv.w[this.me.slot] : null; }
  curW() { const it = this.curItem(); return it ? WEAPONS[it.id] : null; }

  spreadNow(W) {
    const me = this.me, hs = Math.hypot(me.ch.vx, me.ch.vz), a = me.adsT;
    let s = lerp(W.hip, W.ads, a);
    s *= 1 + Math.min(hs, 7) / 5 * (a > 0.5 ? 0.35 : 0.7);
    if (!me.ch.onGround) s *= 2;
    if (me.crouch) s *= 0.8;
    return s + me.bloom * (a > 0.5 ? 0.5 : 1);
  }

  updateMe(dt) {
    const me = this.me, I = this.app.input, st = this.app.profile.settings, W = this.curW(), ch = me.ch;
    const active = I.locked && me.alive && !this.over && !this.app.chatOpen;
    const [mx, my] = I.mouse();
    if (!me.alive) {
      if (I.locked) { this.specYaw -= mx * 0.003; this.specPitch = clamp(this.specPitch - my * 0.003, -0.5, 1.1); }
      return;
    }
    if (active) {
      const zoom = W ? 1 + (W.zoom - 1) * me.adsT : 1;
      const s = 0.0022 * st.sens * (me.adsT > 0.5 ? st.adsSens / zoom : 1);
      me.yaw -= mx * s; me.pitch -= my * s * (st.invertY ? -1 : 1);
      me.pitch = clamp(me.pitch, -1.52, 1.52);
      me.sway = lerp(me.sway, clamp(-mx * 0.0016, -0.07, 0.07), 0.25); me.swayY = lerp(me.swayY, clamp(-my * 0.0012, -0.05, 0.05), 0.25);
    } else { me.sway *= 0.9; me.swayY *= 0.9; }
    let f = 0, r = 0;
    if (active) { f = (I.is('forward') ? 1 : 0) - (I.is('back') ? 1 : 0); r = (I.is('right') ? 1 : 0) - (I.is('left') ? 1 : 0); }
    if (active) { if (st.toggleCrouch) { if (I.hit('crouch')) me.wantCrouch = !me.wantCrouch; } else me.wantCrouch = I.is('crouch'); }
    else if (!st.toggleCrouch) me.wantCrouch = false;
    let crouch = me.wantCrouch && !ch.glide;
    if (!crouch && ch.h < PH && this.world.ceilAt(ch.x, ch.z, ch.y) < ch.y + PH + 0.02) crouch = true;
    me.crouch = crouch; ch.h = crouch ? PHC : PH;
    if (active) { if (st.toggleAds) { if (I.mbEdge[2]) me.ads = !me.ads; } else me.ads = I.mb[2]; } else if (!st.toggleAds) me.ads = false;
    if (ch.glide || me.reloadT > 0 || me.switchT > 0 || me.healT > 0 || !W) me.ads = false;
    const sprint = active && I.is('sprint') && f > 0 && !me.ads && !crouch && me.healT <= 0 && !ch.glide && !I.mb[0] && me.burst === 0;
    const sy = Math.sin(me.yaw), cy = Math.cos(me.yaw);
    let wx = -sy * f + cy * r, wz = -cy * f - sy * r;
    const l = Math.hypot(wx, wz);
    if (l > 0) { wx /= l; wz /= l; }
    let speed = ch.glide ? 13 : crouch ? 2.6 : me.ads ? 3.2 : sprint ? 7.1 : 5.0;
    if (!ch.glide && W) speed *= W.move;
    if (me.healT > 0) speed = Math.min(speed, 2.4);
    if (ch.inWater) speed *= 0.65;
    const jump = active && I.hit('jump') && !ch.glide && !crouch;
    this.world.stepChar(ch, wx, wz, l > 0 ? speed : 0, jump, dt);
    if (ch.landed) { ch.landed = false; this.app.sound.land(); me.kick = Math.max(me.kick, 0.4); }
    ch.jumped = false;
    me.sprint = sprint && l > 0;
    this.sprinting = me.sprint;
    const hs = Math.hypot(ch.vx, ch.vz);
    if (ch.onGround && hs > 1) {
      me.stepAcc += hs * dt; me.bobT += hs * dt * 1.9;
      if (me.stepAcc > (me.sprint ? 2.5 : 2.0)) { me.stepAcc = 0; this.app.sound.step(0, 0, 0, true, crouch); }
    }
    me.eye = lerp(me.eye, crouch ? EYE_C : EYE, 1 - Math.exp(-14 * dt));
    me.adsT = clamp(me.adsT + (me.ads ? 1 : -1) * dt * (W ? 7 / Math.max(1, W.zoom * 0.5) : 7), 0, 1);
    me.sendT -= dt;
    if (me.sendT <= 0) {
      me.sendT = 1 / 30;
      const fl = (ch.onGround ? F.GROUND : 0) | (crouch ? F.CROUCH : 0) | (me.ads ? F.ADS : 0) | (ch.glide ? F.GLIDE : 0) | (me.reloadT > 0 || me.healT > 0 ? F.RELOAD : 0) | (me.sprint ? F.SPRINT : 0);
      this.app.net.sendBin(encodeState(me.seq, ch.x, ch.y, ch.z, me.yaw, me.pitch, fl));
    }
  }

  switchTo(s) {
    const me = this.me;
    me.slot = s; me.switchT = 0.35; me.reloadT = 0; me.burst = 0; me.slotT = performance.now();
    this.app.net.send(['sl', s]);
  }

  startReload() {
    const me = this.me, it = this.curItem();
    if (!it || me.reloadT > 0 || me.healT > 0) return;
    const W = WEAPONS[it.id];
    if (it.mag >= W.mag || this.inv.ammo[W.ammo] <= 0) return;
    me.reloadDur = me.reloadT = W.reload * RARITY[it.r].rl;
    me.burst = 0; me.rlStep = 0;
    this.app.sound.reload(0);
  }

  startHeal(k) {
    const me = this.me, inv = this.inv;
    if (!inv || me.healT > 0) return;
    if (k === 'med' && (inv.med <= 0 || me.hp >= 100)) { this.hud.notice(inv.med <= 0 ? 'Aucune trousse de soins' : 'Santé déjà au maximum', 'small', 1.2); return; }
    if (k === 'cell' && (inv.cell <= 0 || me.sh >= 100)) { this.hud.notice(inv.cell <= 0 ? 'Aucune cellule de bouclier' : 'Bouclier déjà au maximum', 'small', 1.2); return; }
    me.healK = k; me.healT = me.healDur = k === 'med' ? 2.2 : 1.8; me.reloadT = 0; me.burst = 0;
  }

  updateWeapon(dt) {
    const me = this.me, I = this.app.input, inv = this.inv, snd = this.app.sound;
    me.fireT -= dt;
    const W0 = this.curW();
    me.bloom = Math.max(0, me.bloom - dt * 3 * (W0 ? W0.hip : 1));
    me.kick = Math.max(0, me.kick - dt * 7);
    const wid = this.curItem() ? this.curItem().id : null;
    if (wid !== this.vmWid) this.buildVM(wid);
    if (!inv || !me.alive || this.over) { this.hud.progress(null); return; }
    const active = I.locked && !this.app.chatOpen;
    if (active) {
      let ns = -1;
      for (let i = 0; i < 4; i++) if (I.hit('s' + (i + 1)) && inv.w[i]) ns = i;
      if (I.wheel) for (let k = 1; k <= 4; k++) { const c = (((me.slot + I.wheel * k) % 4) + 4) % 4; if (inv.w[c]) { ns = c; break; } }
      if (ns >= 0 && ns !== me.slot) this.switchTo(ns);
      if (I.hit('drop') && inv.w[me.slot]) { this.app.net.send(['dr', me.slot]); me.reloadT = 0; }
      if (I.hit('heal')) this.startHeal('med');
      if (I.hit('shield')) this.startHeal('cell');
      if (I.hit('use') && this.promptLoot) this.app.net.send(['pk', this.promptLoot.id]);
      if (I.hit('reload')) this.startReload();
    }
    if (me.switchT > 0) me.switchT -= dt;
    if (me.healT > 0) {
      me.healT -= dt;
      this.hud.progress(1 - me.healT / me.healDur, me.healK === 'med' ? 'Soins' : 'Bouclier');
      if (me.healT <= 0) { this.app.net.send(['use', me.healK]); snd.heal(); this.hud.progress(null); }
    }
    const it = this.curItem(), W = it && WEAPONS[it.id];
    if (!W) { if (me.healT <= 0) this.hud.progress(null); this.curSpread = 0; return; }
    if (me.reloadT > 0) {
      me.reloadT -= dt;
      const p = 1 - me.reloadT / me.reloadDur;
      if (me.rlStep === 0 && p > 0.45) { me.rlStep = 1; snd.reload(1); }
      this.hud.progress(p, 'Rechargement');
      if (me.reloadT <= 0) {
        const n = Math.min(W.mag - it.mag, inv.ammo[W.ammo]);
        it.mag += n; inv.ammo[W.ammo] -= n;
        me.awaitRl = true; this.app.net.send(['rl', me.slot]);
        this.hud.progress(null); snd.reload(0);
      }
    } else if (me.healT <= 0) this.hud.progress(null);
    const trig = active && I.mb[0], edge = active && I.mbEdge[0];
    const can = !me.ch.glide && me.switchT <= 0 && me.reloadT <= 0;
    if (edge && me.healT > 0) { me.healT = 0; this.hud.progress(null); }
    if (can && me.healT <= 0) {
      if (W.burst) {
        if (edge && me.burst === 0 && me.fireT <= 0) me.burst = W.burst;
        if (me.burst > 0 && me.fireT <= 0) { this.shoot(it, W); if (me.burst > 0) { me.burst--; if (me.burst === 0) me.fireT = W.burstDelay; } }
      } else if ((W.auto ? trig : edge) && me.fireT <= 0) this.shoot(it, W);
    }
    this.curSpread = this.spreadNow(W);
  }

  vmMuzzleWorld(out) {
    if (!this.vmGun) return out.copy(this.cam.position);
    this.vmRoot.updateMatrixWorld(true);
    this.vmGun.localToWorld(out.copy(this.vmGun.userData.model.muzzle));
    const k = Math.tan((this.cam.fov * Math.PI) / 360) / Math.tan((VM_FOV * Math.PI) / 360);
    out.x *= k; out.y *= k;
    return out.applyMatrix4(this.cam.matrixWorld);
  }

  shoot(it, W) {
    const me = this.me, snd = this.app.sound;
    if (it.mag <= 0) { snd.empty(); me.burst = 0; me.fireT = 0.25; this.startReload(); return; }
    it.mag--; me.fireT = 60 / W.rpm; me.healT = 0;
    this.cam.updateMatrixWorld();
    const o = this.cam.position, dir = this.cam.getWorldDirection(_v2);
    const spread = this.spreadNow(W);
    me.bloom = Math.min(me.bloom + W.bloom, W.hip * 1.5);
    const muzzle = this.vmMuzzleWorld(_v3);
    if (W.proj) {
      this.app.net.send(['p', me.slot, r2(o.x + dir.x * 0.6), r2(o.y + dir.y * 0.6), r2(o.z + dir.z * 0.6), r3(dir.x), r3(dir.y), r3(dir.z)]);
    } else {
      const seed = (Math.random() * 65535) | 0, hits = new Map(), tc = getItem('tracer', this.app.profile.cos.tracer).color;
      for (let i = 0; i < W.pellets; i++) {
        pelletDir(dir.x, dir.y, dir.z, spread, seed, i, _d);
        let t = this.world.raycast(o.x, o.y, o.z, _d[0], _d[1], _d[2], MAX_RANGE, _info), best = null, head = false;
        _n.set(_info.nx, _info.ny, _info.nz);
        const wh = _info.hit;
        for (const e of this.ents.values()) {
          if (!e.vis || e.dead || e.id === me.id || e.team === this.myTeam) continue;
          const tt = rayPlayer(o.x, o.y, o.z, _d[0], _d[1], _d[2], e.rx, e.ry, e.rz, e.rfl & F.CROUCH, t);
          if (tt > 0 && tt < t) { t = tt; best = e; head = rayPlayer.head; }
        }
        const end = _v4.set(o.x + _d[0] * t, o.y + _d[1] * t, o.z + _d[2] * t);
        if (best) {
          const h = hits.get(best.id) || [best.id, 0, 0];
          if (head) h[1]++; else h[2]++;
          hits.set(best.id, h);
          this.fx.impact(end, _n.set(-_d[0], -_d[1], -_d[2]), best.sh > 0 ? 'shield' : 'flesh');
        } else if (wh && t < MAX_RANGE - 1) this.fx.impact(end, _n, 'world');
        if (i < 5) this.fx.tracer(muzzle, end, W.beam ? 0x7af2ff : W.plasma ? 0x7ad8ff : tc, W.beam ? 0.07 : 0.022, W.beam ? 0.4 : 0.06);
      }
      this.app.net.send(['s', me.slot, r2(o.x), r2(o.y), r2(o.z), r3(dir.x), r3(dir.y), r3(dir.z), seed, r2(spread), [...hits.values()]]);
    }
    const rk = W.recoil * (me.adsT > 0.5 ? 0.65 : 1) * (me.crouch ? 0.8 : 1);
    me.pitch = clamp(me.pitch + rk * 0.0045 + Math.random() * rk * 0.001, -1.52, 1.52);
    me.yaw += (Math.random() - 0.5) * rk * 0.003;
    me.kick = Math.min(1.6, me.kick + 0.3 + rk * 0.07);
    this.shake = Math.max(this.shake, Math.min(0.35, rk * 0.04));
    snd.shot(W.cls, 0, 0, 0, true);
    this.fx.muzzle(muzzle, W.cls === 'shotgun' || W.cls === 'sniper' || W.cls === 'launcher');
    if (it.mag === 0 && this.inv.ammo[W.ammo] > 0) setTimeout(() => { if (this.me.burst === 0) this.startReload(); }, 250);
  }

  die(kid) {
    const me = this.me, K = this.ents.get(kid);
    me.alive = false; me.hp = 0; me.sh = 0; me.reloadT = 0; me.healT = 0; me.ads = false; me.adsT = 0; me.burst = 0;
    this.spectating = true; this.specId = kid && kid !== me.id ? kid : 0; this.specYaw = me.yaw; this.specPitch = 0.25;
    this.hud.progress(null); this.hud.prompt('');
    const by = K && kid !== me.id ? ` par <b>${esc(K.name)}</b>` : '';
    if (this.info.mode === 'br') {
      const place = this.info.ts === 1 ? `Classement : <b>#${this.aliveN}</b><br>` : '';
      this.hud.death(`Éliminé${by}`, `${place}Vous observez la suite de la partie — clic gauche pour changer de joueur.`, [['Quitter la partie', () => this.app.leaveMatch()]]);
    } else this.hud.death(`Éliminé${by}`, 'Réapparition dans quelques secondes…', []);
  }

  // ================================================================ autres joueurs
  remoteFire(m) {
    const [, id, widx, ox, oy, oz, dx, dy, dz, seed, spread] = m, W = WLIST[widx], e = this.ents.get(id);
    if (!W) return;
    const from = _v.set(ox, oy, oz);
    const near = Math.hypot(ox - this.camPos.x, oz - this.camPos.z) < 120;
    if (e && e.ch && e.vis) { e.ch.fire(); e.ch.root.updateMatrixWorld(true); e.ch.muzzle(from); if (near) this.fx.muzzle(from, false); }
    const tc = e ? getItem('tracer', e.cos.tracer).color : 0xffd27a;
    if (near) for (let i = 0; i < Math.min(W.pellets, 4); i++) {
      pelletDir(dx, dy, dz, spread, seed, i, _d);
      const t = this.world.raycast(ox, oy, oz, _d[0], _d[1], _d[2], MAX_RANGE, _info);
      const end = _v4.set(ox + _d[0] * t, oy + _d[1] * t, oz + _d[2] * t);
      this.fx.tracer(from, end, W.beam ? 0x7af2ff : W.plasma ? 0x7ad8ff : tc, W.beam ? 0.07 : 0.02, W.beam ? 0.4 : 0.06);
      if (_info.hit && t < MAX_RANGE - 1) this.fx.impact(end, _n.set(_info.nx, _info.ny, _info.nz), 'world');
    }
    this.app.sound.shot(W.cls, ox, oy, oz, false);
  }

  updateEnts(dt) {
    const now = performance.now(), rt = now + (this.offset ?? 0) - 110, me = this.me;
    for (const e of this.ents.values()) {
      if (e.id === me.id) continue;
      const fresh = e.buf.length > 0 && e.lastSnap >= this.snapStamp - 4;
      e.vis = !!(fresh || (e.dead && now - e.deadAt < 4500 && e.buf.length));
      if (!e.vis) { if (e.ch) e.ch.root.visible = false; if (e.tag) e.tag.visible = false; continue; }
      if (!e.dead) {
        const b = e.buf;
        let a = b[0], c = b[0];
        if (rt >= b[b.length - 1].t) { a = b[Math.max(0, b.length - 2)]; c = b[b.length - 1]; }
        else for (let i = b.length - 1; i > 0; i--) if (b[i - 1].t <= rt) { a = b[i - 1]; c = b[i]; break; }
        const span = c.t - a.t;
        let k = span > 0 ? (rt - a.t) / span : 1;
        k = clamp(k, 0, 1.6);
        const nx = a.x + (c.x - a.x) * k, nz = a.z + (c.z - a.z) * k;
        if (span > 0) { e.vx = ((c.x - a.x) / span) * 1000; e.vz = ((c.z - a.z) / span) * 1000; }
        e.rx = nx; e.rz = nz; e.ry = a.y + (c.y - a.y) * Math.min(k, 1);
        e.ryaw = a.yaw + angDiff(a.yaw, c.yaw) * Math.min(k, 1); e.rpitch = a.pitch + (c.pitch - a.pitch) * Math.min(k, 1);
        e.rfl = c.fl; e.rw = c.w;
        while (b.length > 3 && b[1].t < rt - 300) b.shift();
      } else { e.vx = 0; e.vz = 0; }
      if (!e.ch) {
        e.ch = new Character(e.cos); this.scene.add(e.ch.root);
        if (e.team === this.myTeam && this.info.mode === 'br' && this.info.ts > 1) { e.tag = nameSprite(e.name); this.scene.add(e.tag); }
      }
      const dist = Math.hypot(e.rx - this.camPos.x, e.rz - this.camPos.z);
      const shown = dist < this.q.view + 20;
      e.ch.root.visible = shown;
      if (!shown) { if (e.tag) e.tag.visible = false; continue; }
      e.ch.root.position.set(e.rx, e.ry, e.rz);
      e.ch.root.rotation.y = e.ryaw;
      e.ch.setWeapon(e.rw === 255 || !WLIST[e.rw] ? null : WLIST[e.rw].id);
      const sp = Math.hypot(e.vx, e.vz), mAng = sp > 0.3 ? angDiff(e.ryaw, Math.atan2(-e.vx, -e.vz)) : 0;
      const fl = e.rfl;
      if (dist < 140 || e.dead) e.ch.update(dt, { speed: sp, moveAng: mAng, pitch: e.rpitch, crouch: !!(fl & F.CROUCH), air: !(fl & F.GROUND), glide: !!(fl & F.GLIDE), ads: !!(fl & F.ADS), sprint: !!(fl & F.SPRINT), reload: !!(fl & F.RELOAD), dead: e.dead });
      if (e.tag) { e.tag.visible = !e.dead; e.tag.position.set(e.rx, e.ry + 2.25, e.rz); }
      if (!e.dead && fl & F.GROUND && sp > 1.2 && !(fl & F.CROUCH)) {
        e.stepAcc += sp * dt;
        if (e.stepAcc > 2.2) { e.stepAcc = 0; if (dist < 35) this.app.sound.step(e.rx, e.ry, e.rz, false, false); }
      }
    }
  }

  // ================================================================ caméra, zone, vue de l'arme
  zoneNow() {
    const z = this.zone, t = this.matchTime;
    if (!z) return null;
    if (t <= z.t0) return z;
    const k = clamp((t - z.t0) / (z.t1 - z.t0 || 1), 0, 1);
    return { x: z.x + (z.nx - z.x) * k, z: z.z + (z.nz - z.z) * k, r: z.r + (z.nr - z.r) * k };
  }

  updateZone(dt) {
    const z = this.zoneNow(), me = this.me;
    if (!z) return;
    this.zoneMesh.position.set(z.x, 150, z.z);
    this.zoneMesh.scale.set(Math.max(0.5, z.r), 420, Math.max(0.5, z.r));
    this.zoneMat.uniforms.t.value += dt;
    this.outside = me.alive && Math.hypot(me.ch.x - z.x, me.ch.z - z.z) > z.r;
    if (this.outside) { this.app.sound.warn(); if (!this.wasOut) this.hud.notice('Vous êtes hors de la zone !', 'zone', 2); }
    this.wasOut = this.outside;
  }

  pickSpec() {
    const me = this.me, list = [...this.ents.values()].filter((e) => e.id !== me.id && e.vis && !e.dead);
    if (!list.length) return 0;
    const mates = list.filter((e) => e.team === this.myTeam);
    const pool = mates.length ? mates : list;
    const i = pool.findIndex((e) => e.id === this.specId);
    return pool[(i + 1) % pool.length].id;
  }

  updateCamera(dt) {
    const me = this.me, st = this.app.profile.settings, W = this.curW(), cam = this.cam;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sh = this.shake * this.shake;
    if (me.alive) {
      const ch = me.ch, hs = Math.hypot(ch.vx, ch.vz), bob = ch.onGround ? Math.min(1, hs / 6) * (1 - me.adsT * 0.8) : 0;
      cam.position.set(ch.x, ch.y + me.eye + Math.abs(Math.sin(me.bobT)) * 0.035 * bob - me.kick * 0.01, ch.z);
      cam.rotation.set(me.pitch + (Math.random() - 0.5) * sh * 0.05, me.yaw + (Math.random() - 0.5) * sh * 0.05, Math.cos(me.bobT) * 0.004 * bob);
      const zoom = W ? 1 + (W.zoom - 1) * me.adsT : 1;
      this.sprintT = lerp(this.sprintT, me.sprint ? 1 : 0, 1 - Math.exp(-8 * dt));
      cam.fov = st.fov / zoom + this.sprintT * 6 + (ch.glide ? 8 : 0);
      this.scoped = !!(W && W.scope && me.adsT > 0.92);
      this.camPos.set(ch.x, ch.y, ch.z); this.camYaw = me.yaw;
    } else {
      const I = this.app.input;
      let t = this.ents.get(this.specId);
      if (!t || !t.vis || t.dead || (I.locked && I.mbEdge[0])) { const id = this.pickSpec(); if (id) { this.specId = id; t = this.ents.get(id); } }
      if (t && t.vis) {
        const tx = t.rx, ty = t.ry + 1.6, tz = t.rz, cp = Math.cos(this.specPitch);
        let dx = Math.sin(this.specYaw) * cp, dy = Math.sin(this.specPitch), dz = Math.cos(this.specYaw) * cp;
        const d = Math.min(4.2, this.world.raycast(tx, ty, tz, dx, dy, dz, 4.2) - 0.3);
        cam.position.set(tx + dx * d, ty + dy * d, tz + dz * d);
        cam.lookAt(tx, ty, tz);
        this.camPos.set(tx, t.ry, tz); this.camYaw = t.ryaw;
        this.hud.prompt(`Vous observez <b>${esc(t.name)}</b>`);
      }
      cam.fov = st.fov; this.scoped = false;
    }
    cam.aspect = innerWidth / innerHeight;
    cam.updateProjectionMatrix();
    const L = this.app.sound.listener;
    L.x = cam.position.x; L.y = cam.position.y; L.z = cam.position.z; L.yaw = me.alive ? me.yaw : this.specYaw + Math.PI;
  }

  buildVM(wid) {
    this.vmWid = wid;
    this.vmRoot.clear();
    this.vmGun = null;
    if (!wid) return;
    const cos = this.app.profile.cos, gun = weaponMesh(wid, cos.wskin);
    gun.castShadow = false;
    const holder = new THREE.Group();
    holder.add(gun);
    const m = gun.userData.model, arm = armGeometry(cos), mat = bodyMaterial();
    const mk = (hand, off) => {
      const a = new THREE.Mesh(arm, mat), elbow = hand.clone().add(off);
      a.position.copy(elbow);
      a.quaternion.setFromUnitVectors(DOWN, hand.clone().sub(elbow).normalize());
      a.scale.setScalar(hand.distanceTo(elbow) / 0.3);
      holder.add(a);
    };
    mk(new THREE.Vector3(0, -0.035, 0.015), new THREE.Vector3(0.09, -0.17, 0.24));
    mk(m.left.clone(), new THREE.Vector3(-0.11, -0.2, 0.19));
    this.vmRoot.add(holder);
    this.vmGun = gun; this.vmHolder = holder;
    gun.geometry.computeBoundingBox();
    this.vmSightY = gun.geometry.boundingBox.max.y;
    this.vmPistol = WEAPONS[wid].cls === 'pistol';
    this.me.switchT = Math.max(this.me.switchT, 0.3);
  }

  updateVM(dt) {
    const me = this.me, H = this.vmHolder;
    this.vmRoot.visible = !!(this.vmGun && me.alive && !this.scoped && !this.over);
    if (!this.vmRoot.visible) return;
    const a = me.adsT, ch = me.ch;
    const hip = this.vmPistol ? [0.14, -0.15, -0.46] : [0.15, -0.17, -0.3];
    let x = lerp(hip[0], 0, a), y = lerp(hip[1], -this.vmSightY - 0.014, a), z = lerp(hip[2], this.vmPistol ? -0.42 : -0.4, a);
    const bs = ch.onGround ? Math.min(1, Math.hypot(ch.vx, ch.vz) / 6) * (1 - a * 0.85) : 0;
    x += Math.cos(me.bobT) * 0.012 * bs; y += Math.abs(Math.sin(me.bobT)) * 0.012 * bs;
    if (!ch.onGround) y -= clamp(ch.vy * 0.004, -0.03, 0.03);
    let rx = me.kick * 0.07 * (1 - a * 0.5) + me.swayY, ry = me.sway, rz = 0;
    z += me.kick * 0.045;
    if (me.reloadT > 0) { const d = Math.sin((1 - me.reloadT / me.reloadDur) * Math.PI); y -= d * 0.09; rx -= d * 0.55; rz += d * 0.45; }
    if (me.switchT > 0) y -= (me.switchT / 0.35) * 0.3;
    if (me.healT > 0) { y -= 0.22; rx -= 0.4; }
    const s = this.sprintT;
    ry += s * 0.55; rx -= s * 0.2; x -= s * 0.05; y -= s * 0.02;
    H.position.set(x, y, z);
    H.rotation.set(rx, ry, rz, 'YXZ');
    this.vmCam.aspect = innerWidth / innerHeight; this.vmCam.updateProjectionMatrix();
  }

  // ================================================================ boucle
  frame(dt) {
    this.matchTime = this.offset === null ? 0 : (performance.now() + this.offset) / 1000;
    this.updateMe(dt);
    this.updateWeapon(dt);
    this.updateCamera(dt);
    this.updateEnts(dt);
    this.updateLoot(dt);
    this.updateZone(dt);
    this.updateVM(dt);
    this.fx.update(dt, this.world);
    this.view.update(this.cam);
    this.hud.update(dt);
    const r = this.app.renderer;
    r.render(this.scene, this.cam);
    if (this.vmRoot.visible) { r.autoClear = false; r.clearDepth(); r.render(this.vmScene, this.vmCam); r.autoClear = true; }
  }

  dispose() {
    this.hud.dispose();
    this.fx.dispose();
    this.view.dispose(this.scene);
    this.zoneMesh.geometry.dispose(); this.zoneMat.dispose();
    this.scene.clear(); this.vmScene.clear();
  }
}
