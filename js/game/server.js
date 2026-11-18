// Simulation autoritaire, exécutée dans le navigateur de l'hôte : salon, modes de jeu, zone, butin,
// dégâts, projectiles, bots. Les clients n'envoient que leurs déplacements et leurs intentions.
import { MAP, MAPS } from '../world/maps.js';
import { getWorld } from '../world/world.js';
import { WEAPONS, WLIST, RARITY, AMMO, AMMO_TYPES, falloff, pelletDir, rayPlayer, rollWeapon, MAX_RANGE } from '../data/weapons.js';
import { sanitizeCos, randomCos } from '../data/cosmetics.js';
import { clamp, mulberry32 } from '../core/util.js';
import { F, VERSION, buildSnap, decodeState } from './proto.js';
import { botInit, botUpdate } from './bots.js';

export const MAX_HUMANS = 16, MAX_ENTS = 24;
const BOT_NAMES = ['Faucon', 'Vipère', 'Orage', 'Cobalt', 'Braise', 'Givre', 'Lynx', 'Écho', 'Onyx', 'Comète', 'Mirage', 'Rafale', 'Silex', 'Corbeau', 'Fennec', 'Tornade', 'Jaguar', 'Zéphyr', 'Kraken', 'Pixel', 'Ombre', 'Sirocco', 'Mistral', 'Titan', 'Nova', 'Bolide', 'Requin', 'Scorpion', 'Phénix', 'Cyclone', 'Granit', 'Vortex', 'Mamba', 'Colibri', 'Furie', 'Atlas'];
// [attente, rétrécissement, facteur de rayon, dégâts/s]
const ZONE = [[50, 45, 0.42, 1], [40, 35, 0.58, 2], [30, 30, 0.55, 4], [25, 25, 0.45, 7], [20, 25, 0, 12]];
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
const fin = (...a) => a.every((v) => typeof v === 'number' && Number.isFinite(v));

export class Server {
  constructor() {
    this.clients = new Map();
    this.hostId = 0; this.state = 'lobby'; this.code = '';
    this.cfg = { mode: 'br', teamSize: 1, bots: 15, diff: 1, rot: MAPS.map((m) => m.id), rotIdx: 0, auto: false, fill: true };
    this.match = null; this.autoT = 0;
  }

  // ------------------------------------------------------------ salon
  addClient(link) {
    let id = 1;
    while (this.clients.has(id)) id++;
    this.clients.set(id, { id, link, name: null, cos: null, team: 0 });
    if (link.local) this.hostId = id;
    return id;
  }

  removeClient(id) {
    if (!this.clients.delete(id)) return;
    const M = this.match;
    if (M) {
      const e = M.ents.get(id);
      if (e) {
        if (e.alive && !M.over) this.kill(e, null, '', false);
        M.ents.delete(id);
        this.evAll(['left', id]);
        if (!M.over) this._checkEnd();
      }
    }
    this.pushLobby();
  }

  humans() { return [...this.clients.values()].filter((c) => c.name); }

  lobbyState() {
    const c = this.cfg;
    return {
      code: this.code, host: this.hostId, st: this.state, cfg: c, next: c.rot[c.rotIdx % c.rot.length], auto: Math.ceil(this.autoT),
      pl: this.humans().map((p) => ({ id: p.id, n: p.name, t: p.team, cos: p.cos })),
    };
  }
  pushLobby() { const s = this.lobbyState(); for (const c of this.clients.values()) if (c.name) c.link.send(['lobby', s]); }

  setCfg(p) {
    const c = this.cfg;
    if (p.mode === 'br' || p.mode === 'ffa') c.mode = p.mode;
    if ([1, 2, 3, 4].includes(p.teamSize)) c.teamSize = p.teamSize;
    if (Number.isInteger(p.bots)) c.bots = clamp(p.bots, 0, MAX_ENTS - 1);
    if ([0, 1, 2].includes(p.diff)) c.diff = p.diff;
    if (Array.isArray(p.rot) && p.rot.length && p.rot.every((m) => MAP[m])) { c.rot = p.rot; c.rotIdx %= c.rot.length; }
    if (Number.isInteger(p.rotIdx)) c.rotIdx = ((p.rotIdx % c.rot.length) + c.rot.length) % c.rot.length;
    if (typeof p.auto === 'boolean') { c.auto = p.auto; if (!p.auto) this.autoT = 0; }
    if (typeof p.fill === 'boolean') c.fill = p.fill;
    if (c.mode === 'br' && c.teamSize > 1) for (const h of this.clients.values()) if (h.team > Math.ceil(MAX_HUMANS / c.teamSize)) h.team = 0;
    this.pushLobby();
  }

  onMsg(id, m) {
    const c = this.clients.get(id);
    if (!c || !Array.isArray(m)) return;
    switch (m[0]) {
      case 'hello': {
        if (m[3] !== VERSION) { c.link.send(['kick', 'Version du jeu différente de celle de l’hôte. Rechargez la page.']); return; }
        c.name = String(m[1] || 'Joueur').replace(/[<>&"']/g, '').trim().slice(0, 16) || 'Joueur';
        c.cos = sanitizeCos(m[2]);
        c.link.send(['welcome', id, this.lobbyState()]);
        this.pushLobby();
        break;
      }
      case 'cos': if (c.name) { c.cos = sanitizeCos(m[1]); if (typeof m[2] === 'string') c.name = m[2].replace(/[<>&"']/g, '').trim().slice(0, 16) || c.name; this.pushLobby(); } break;
      case 'team': if (Number.isInteger(m[1]) && m[1] >= 0 && m[1] <= MAX_HUMANS) { c.team = m[1]; this.pushLobby(); } break;
      case 'chat': {
        if (!c.name) break;
        const t = String(m[1] || '').slice(0, 140);
        if (t.trim()) for (const o of this.clients.values()) if (o.name) o.link.send(['chat', c.name, t]);
        break;
      }
      default: if (this.match && c.name) this._game(c, m);
    }
  }

  onBin(id, dv) {
    const M = this.match;
    if (!M || dv.byteLength < 12 || dv.getUint8(0) !== 2) return;
    const e = M.ents.get(id);
    if (!e || !e.alive || e.bot || dv.getUint8(1) !== e.seq) return;
    decodeState(dv, e);
  }

  // ------------------------------------------------------------ lancement d'une partie
  start() {
    if (this.state !== 'lobby') return;
    const cfg = this.cfg, humans = this.humans();
    if (!humans.length) return;
    this.autoT = 0;
    const mapId = cfg.rot[cfg.rotIdx % cfg.rot.length] || MAPS[0].id, seed = (Math.random() * 0x7fffffff) | 0;
    const world = getWorld(MAP[mapId], seed), rng = mulberry32(seed ^ 0x51ed);
    const br = cfg.mode === 'br', ts = br ? cfg.teamSize : 1;
    const M = (this.match = {
      world, rng, mapId, seed, mode: cfg.mode, ts, t: 0, ents: new Map(), loot: new Map(), lootId: 1, projs: [], projId: 1,
      over: false, endT: 0, snapAcc: 0, slowAcc: 0, zoneAcc: 0, zone: null, phase: -1, scoreLimit: 25, timeLimit: 480, respawns: [], pathBudget: 2, humans0: humans.length,
    });
    this.state = 'playing';

    // --- équipes
    const list = [];
    const teams = new Map();
    let nextTeam = 1;
    const join = (e, t) => { e.team = t; (teams.get(t) || teams.set(t, []).get(t)).push(e); };
    const mk = (id, name, bot, cos, link) => {
      const e = { id, name, bot, cos, link, team: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, fl: F.GROUND, hp: 100, sh: 0, alive: true, kills: 0, deaths: 0, dmg: 0, place: 0, seq: 0, out: [], respawnT: 0, prot: 0,
        inv: { w: [null, null, null, null], slot: 0, ammo: { light: 0, medium: 0, heavy: 0, shell: 0, rocket: 0, cell: 0 }, med: 0, cell: 0 } };
      list.push(e); M.ents.set(id, e);
      return e;
    };
    const hs = humans.map((h) => mk(h.id, h.name, false, h.cos, h.link));
    if (br && ts > 1) {
      for (const [i, e] of hs.entries()) { const pick = humans[i].team; if (pick > 0 && (teams.get(pick + 100) || []).length < ts) join(e, pick + 100); }
      for (const e of hs) {
        if (e.team) continue;
        let done = false;
        for (const [t, mem] of teams) if (mem.length < ts) { join(e, t); done = true; break; }
        if (!done) join(e, nextTeam++);
      }
    } else for (const e of hs) join(e, nextTeam++);
    let nb = clamp(cfg.bots, 0, MAX_ENTS - hs.length), bid = 100;
    const names = BOT_NAMES.slice().sort(() => rng() - 0.5);
    const bot = () => { const e = mk(bid, names[(bid - 100) % names.length], true, randomCos(rng), null); bid++; nb--; return e; };
    if (br && ts > 1 && cfg.fill) for (const [t, mem] of teams) while (mem.length < ts && nb > 0) join(bot(), t);
    while (nb > 0) { const t = 50 + nextTeam++; for (let i = 0; i < ts && nb > 0; i++) join(bot(), t); }

    // --- apparitions
    if (br) {
      const cand = [];
      for (let i = 0; i < 260; i++) cand.push(world.randomOpen(rng, 0, 0, world.half * 0.84));
      const pts = [cand[(rng() * cand.length) | 0]];
      while (pts.length < teams.size) {
        let best = cand[0], bd = -1;
        for (const c of cand) { let d = 1e9; for (const p of pts) d = Math.min(d, (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2); if (d > bd) { bd = d; best = c; } }
        pts.push(best);
      }
      pts.sort(() => rng() - 0.5);
      let ti = 0;
      for (const mem of teams.values()) {
        const p = pts[ti++];
        for (const e of mem) {
          const q = world.randomOpen(rng, p[0], p[1], 4), g = world.groundAt(q[0], q[1], 500);
          e.x = q[0]; e.z = q[1]; e.y = e.bot ? g : g + 70; e.yaw = Math.atan2(e.x, e.z);
          if (!e.bot) e.fl = F.GLIDE;
          e.inv.w[0] = { id: 'p9', r: 0, mag: WEAPONS.p9.mag }; e.inv.ammo.light = 30;
        }
      }
      const R0 = world.half * 1.45;
      M.zone = { i: -1, x: 0, z: 0, r: R0, nx: 0, nz: 0, nr: R0, t0: 0, t1: 0, dps: 1 };
      this._nextZone();
      // butin au sol
      for (const s of world.lootSpots) this._spawnLootAt(s, s.up ? 0.12 : 0);
    } else {
      M.zone = { i: 0, x: 0, z: 0, r: world.arenaR, nx: 0, nz: 0, nr: world.arenaR, t0: 1e9, t1: 1e9, dps: 9 };
      M.spots = world.lootSpots.filter((s) => Math.hypot(s.x, s.z) < world.arenaR - 3);
      for (const s of M.spots) this._spawnLootAt(s, 0.16);
      for (const e of list) this._ffaSpawn(e, true);
    }
    for (const e of list) if (e.bot) botInit(this, e);

    const roster = list.map((e) => [e.id, e.name, e.team, e.bot ? 1 : 0, e.cos]);
    const loot = [...M.loot.values()].map(lootWire);
    for (const e of hs) {
      e.link.send(['start', { map: mapId, seed, mode: M.mode, ts, you: e.id, roster, loot, zone: M.zone, spawn: [r2(e.x), r2(e.y), r2(e.z), r2(e.yaw)], glide: br ? 1 : 0, score: M.scoreLimit, time: M.timeLimit }]);
      this.sendInv(e);
    }
    this.pushLobby();
    this._alive();
  }

  _ffaSpawn(e, first) {
    const M = this.match, W = M.world;
    let best = null, bd = -1;
    for (let i = 0; i < 12; i++) {
      const p = W.randomOpen(M.rng, 0, 0, W.arenaR - 8);
      let d = 1e9;
      for (const o of M.ents.values()) if (o !== e && o.alive) d = Math.min(d, (o.x - p[0]) ** 2 + (o.z - p[1]) ** 2);
      if (d > bd) { bd = d; best = p; }
    }
    e.x = best[0]; e.z = best[1]; e.y = W.groundAt(e.x, e.z, 500); e.yaw = Math.atan2(e.x, e.z);
    e.hp = 100; e.sh = 50; e.alive = true; e.fl = F.GROUND; e.prot = M.t + 2;
    const prim = ['mistral', 'kodiak', 'faucon', 'frelon', 'vecteur'][(M.rng() * 5) | 0], sec = ['p9', 'rex', 'brise', 'guepe'][(M.rng() * 4) | 0];
    e.inv = { w: [{ id: prim, r: 1, mag: WEAPONS[prim].mag }, { id: sec, r: 1, mag: WEAPONS[sec].mag }, null, null], slot: 0, ammo: { light: 120, medium: 120, heavy: 28, shell: 24, rocket: 2, cell: 32 }, med: 1, cell: 1 };
    if (e.bot) { if (e.ch) { e.ch.x = e.x; e.ch.y = e.y; e.ch.z = e.z; e.ch.vx = e.ch.vy = e.ch.vz = 0; } if (e.ai) { e.ai.path = null; e.ai.goal = null; e.ai.tgt = 0; } }
    else { e.seq = (e.seq + 1) & 255; }
    if (!first) { this.evAll(['spawn', e.id, r2(e.x), r2(e.y), r2(e.z), r2(e.yaw), e.seq]); if (!e.bot) this.sendInv(e); }
  }

  // ------------------------------------------------------------ butin
  _spawnLootAt(s, luck) {
    const M = this.match, r = M.rng(), rng = M.rng;
    if (r < 0.56) {
      const [id, rar] = rollWeapon(rng, luck);
      this._addLoot({ k: 'w', a: id, b: rar, mag: WEAPONS[id].mag, x: s.x, y: s.y, z: s.z, spot: s }, true);
      if (rng() < 0.75) { const at = WEAPONS[id].ammo; this._addLoot({ k: 'a', a: at, b: AMMO[at].pack, x: s.x + 0.7, y: s.y, z: s.z + 0.4 }, true); }
    } else if (r < 0.76) { const at = AMMO_TYPES[(rng() * AMMO_TYPES.length) | 0]; this._addLoot({ k: 'a', a: at, b: AMMO[at].pack * (rng() < 0.3 ? 2 : 1), x: s.x, y: s.y, z: s.z, spot: s }, true); }
    else if (r < 0.88) this._addLoot({ k: 'm', a: '', b: 1, x: s.x, y: s.y, z: s.z, spot: s }, true);
    else this._addLoot({ k: 'c', a: '', b: 1, x: s.x, y: s.y, z: s.z, spot: s }, true);
  }
  _addLoot(L, quiet) {
    const M = this.match;
    L.id = M.lootId++; L.up = L.spot ? L.spot.up : L.up || 0;
    M.loot.set(L.id, L);
    if (!quiet) this.evAll(['la', lootWire(L)]);
    return L;
  }
  _delLoot(L) {
    const M = this.match;
    if (!M.loot.delete(L.id)) return;
    this.evAll(['ld', L.id]);
    if (M.mode === 'ffa' && L.spot) M.respawns.push({ t: M.t + 22, spot: L.spot });
  }
  _drop(e, L) {
    const a = Math.random() * 6.283, d = 0.5 + Math.random() * 0.7, W = this.match.world;
    const x = e.x + Math.cos(a) * d, z = e.z + Math.sin(a) * d;
    this._addLoot({ ...L, x: r2(x), y: r2(Math.max(W.groundAt(x, z, e.y + 0.5), e.y - 0.6) + 0.05), z: r2(z), dropBy: e.id, dropT: this.match.t, up: e.y > W.heightAt(e.x, e.z) + 1.2 ? 1 : 0 });
  }

  sendInv(e) { if (e.link) e.link.send(['inv', e.inv]); }

  /** Applique un ramassage. manual = le joueur a appuyé sur la touche (autorise l'échange d'arme). */
  take(e, L, manual) {
    const inv = e.inv;
    if (L.k === 'w') {
      let s = inv.w.indexOf(null);
      if (s < 0) { if (!manual) return false; s = inv.slot; const old = inv.w[s]; this._drop(e, { k: 'w', a: old.id, b: old.r, mag: old.mag }); }
      else if (!inv.w[inv.slot]) s = inv.slot;
      inv.w[s] = { id: L.a, r: L.b, mag: L.mag ?? WEAPONS[L.a].mag };
      if (manual || !inv.w[inv.slot]) inv.slot = s;
    } else if (L.k === 'a') inv.ammo[L.a] = Math.min(999, (inv.ammo[L.a] || 0) + L.b);
    else if (L.k === 'm') { if (inv.med >= 4) return false; inv.med++; }
    else if (L.k === 'c') { if (inv.cell >= 4) return false; inv.cell++; }
    this._delLoot(L);
    this.sendInv(e);
    return true;
  }

  dropWeapon(e, s) {
    const it = e.inv.w[s];
    if (!it) return;
    e.inv.w[s] = null;
    this._drop(e, { k: 'w', a: it.id, b: it.r, mag: it.mag });
    this.sendInv(e);
  }

  reload(e, s) {
    const it = e.inv.w[s];
    if (!it) return;
    const W = WEAPONS[it.id], n = Math.min(W.mag - it.mag, e.inv.ammo[W.ammo]);
    if (n > 0) { it.mag += n; e.inv.ammo[W.ammo] -= n; }
    this.sendInv(e);
  }

  useItem(e, k) {
    if (!e.alive) return;
    if (k === 'med' && e.inv.med > 0 && e.hp < 100) { e.inv.med--; e.hp = Math.min(100, e.hp + 50); }
    else if (k === 'cell' && e.inv.cell > 0 && e.sh < 100) { e.inv.cell--; e.sh = Math.min(100, e.sh + 50); }
    this.sendInv(e);
  }

  // ------------------------------------------------------------ messages de jeu
  _game(c, m) {
    const M = this.match, e = M.ents.get(c.id);
    if (!e || M.over) return;
    switch (m[0]) {
      case 's': {
        if (!e.alive) return;
        const [, slot, ox, oy, oz, dx, dy, dz, seed, spread, hits] = m;
        const it = e.inv.w[slot];
        if (!it || !fin(ox, oy, oz, dx, dy, dz, seed, spread) || it.mag <= 0) return;
        const W = WEAPONS[it.id];
        if (W.proj || Math.hypot(ox - e.x, oy - e.y, oz - e.z) > 8) return;
        it.mag--; e.prot = 0;
        this.evAll(['f', e.id, W.idx, r2(ox), r2(oy), r2(oz), r3(dx), r3(dy), r3(dz), seed | 0, r2(spread)], e);
        if (!Array.isArray(hits)) return;
        let left = W.pellets;
        for (const h of hits.slice(0, 8)) {
          if (!Array.isArray(h)) continue;
          const t = M.ents.get(h[0]);
          const hd = clamp(h[1] | 0, 0, left); left -= hd;
          const bd = clamp(h[2] | 0, 0, left); left -= bd;
          if (!t || !t.alive || t.team === e.team || hd + bd <= 0) continue;
          const dist = Math.hypot(t.x - e.x, t.y - e.y, t.z - e.z);
          if (dist > MAX_RANGE + 20) continue;
          this.damage(t, W.dmg * falloff(W, dist) * RARITY[it.r].dmg * (hd * W.head + bd), e, W.id, hd > 0);
        }
        break;
      }
      case 'p': {
        if (!e.alive) return;
        const [, slot, ox, oy, oz, dx, dy, dz] = m;
        const it = e.inv.w[slot];
        if (!it || !fin(ox, oy, oz, dx, dy, dz) || it.mag <= 0 || !WEAPONS[it.id].proj) return;
        if (Math.hypot(ox - e.x, oy - e.y, oz - e.z) > 8) return;
        it.mag--; e.prot = 0;
        this.launch(e, it, ox, oy, oz, dx, dy, dz);
        break;
      }
      case 'pk': { const L = M.loot.get(m[1]); if (L && e.alive && Math.hypot(L.x - e.x, L.y - e.y, L.z - e.z) < 4.5) this.take(e, L, true); break; }
      case 'dr': if (e.alive && Number.isInteger(m[1]) && m[1] >= 0 && m[1] < 4) this.dropWeapon(e, m[1]); break;
      case 'sl': if (Number.isInteger(m[1]) && m[1] >= 0 && m[1] < 4) e.inv.slot = m[1]; break;
      case 'rl': if (e.alive && Number.isInteger(m[1]) && m[1] >= 0 && m[1] < 4) this.reload(e, m[1]); break;
      case 'use': this.useItem(e, m[1]); break;
    }
  }

  launch(e, it, ox, oy, oz, dx, dy, dz) {
    const M = this.match, W = WEAPONS[it.id], l = Math.hypot(dx, dy, dz) || 1;
    const p = { id: M.projId++, o: e.id, team: e.team, w: W.id, r: it.r, x: ox, y: oy, z: oz, vx: (dx / l) * W.speed, vy: (dy / l) * W.speed + (W.proj === 'grenade' ? 3 : 0), vz: (dz / l) * W.speed, life: W.proj === 'grenade' ? 2.3 : 6, g: W.proj === 'grenade' };
    M.projs.push(p);
    this.evAll(['proj', p.id, e.id, W.idx, r2(p.x), r2(p.y), r2(p.z), r2(p.vx), r2(p.vy), r2(p.vz)]);
  }

  /** Tir à impact immédiat résolu par l'hôte (utilisé par les bots). */
  fireHitscan(e, it, ox, oy, oz, dx, dy, dz, spread, mul) {
    const M = this.match, W = WEAPONS[it.id], seed = (Math.random() * 65535) | 0, d = [0, 0, 0], acc = new Map();
    this.evAll(['f', e.id, W.idx, r2(ox), r2(oy), r2(oz), r3(dx), r3(dy), r3(dz), seed, r2(spread)]);
    for (let i = 0; i < W.pellets; i++) {
      pelletDir(dx, dy, dz, spread, seed, i, d);
      let bt = M.world.raycast(ox, oy, oz, d[0], d[1], d[2], MAX_RANGE), best = null, bh = false;
      for (const t of M.ents.values()) {
        if (!t.alive || t.team === e.team) continue;
        const tt = rayPlayer(ox, oy, oz, d[0], d[1], d[2], t.x, t.y, t.z, t.fl & F.CROUCH, bt);
        if (tt > 0 && tt < bt) { bt = tt; best = t; bh = rayPlayer.head; }
      }
      if (best) { const a = acc.get(best) || [0, 0, bt]; a[bh ? 0 : 1]++; acc.set(best, a); }
    }
    for (const [t, a] of acc) this.damage(t, W.dmg * falloff(W, a[2]) * RARITY[it.r].dmg * (a[0] * W.head + a[1]) * mul, e, W.id, a[0] > 0);
  }

  // ------------------------------------------------------------ dégâts et éliminations
  damage(t, amount, by, wid, head, bypass) {
    const M = this.match;
    if (!t.alive || M.over || amount <= 0 || t.prot > M.t) return;
    let a = amount, s = 0;
    if (!bypass) { s = Math.min(t.sh, a); t.sh -= s; a -= s; }
    t.hp -= a;
    if (by && by !== t) { by.dmg += amount; this.ev(by, ['hit', t.id, Math.round(amount), head ? 1 : 0, t.hp <= 0 ? 1 : 0, s > 0 ? 1 : 0]); }
    this.ev(t, ['dmg', by ? by.id : 0, Math.round(amount), by ? r2(by.x) : r2(t.x), by ? r2(by.z) : r2(t.z)]);
    if (t.bot && by && t.ai) { t.ai.hurtBy = by.id; t.ai.hurtT = M.t; }
    if (t.hp <= 0) this.kill(t, by && by !== t ? by : t.lastBy && M.t - t.lastT < 8 ? M.ents.get(t.lastBy) : null, wid, head);
    else if (by && by !== t) { t.lastBy = by.id; t.lastT = M.t; }
  }

  kill(v, killer, wid, head) {
    const M = this.match;
    v.alive = false; v.hp = 0; v.sh = 0; v.deaths++;
    if (killer) killer.kills++;
    this.evAll(['kill', killer ? killer.id : 0, v.id, wid || '', head ? 1 : 0]);
    if (M.mode === 'br') {
      for (let s = 0; s < 4; s++) { const it = v.inv.w[s]; if (it) this._drop(v, { k: 'w', a: it.id, b: it.r, mag: it.mag }); }
      for (const at of AMMO_TYPES) if (v.inv.ammo[at] > 0) this._drop(v, { k: 'a', a: at, b: v.inv.ammo[at] });
      for (let i = 0; i < v.inv.med; i++) this._drop(v, { k: 'm', a: '', b: 1 });
      for (let i = 0; i < v.inv.cell; i++) this._drop(v, { k: 'c', a: '', b: 1 });
      v.inv = { w: [null, null, null, null], slot: 0, ammo: { light: 0, medium: 0, heavy: 0, shell: 0, rocket: 0, cell: 0 }, med: 0, cell: 0 };
      let teamAlive = false;
      for (const e of M.ents.values()) if (e.alive && e.team === v.team) teamAlive = true;
      if (!teamAlive) { const left = this._teamsAlive().size; for (const e of M.ents.values()) if (e.team === v.team) e.place = left + 1; }
      this._alive();
      this._checkEnd();
    } else {
      v.respawnT = M.t + 3;
      if (killer && killer.kills >= M.scoreLimit) this._end(killer.team);
    }
  }

  _teamsAlive() { const s = new Set(); for (const e of this.match.ents.values()) if (e.alive) s.add(e.team); return s; }
  _alive() { let n = 0; for (const e of this.match.ents.values()) if (e.alive) n++; this.evAll(['alive', n, this._teamsAlive().size]); }

  _checkEnd() {
    const M = this.match;
    if (M.over || M.mode !== 'br') { if (!M.over && ![...M.ents.values()].some((e) => !e.bot)) this._end(0); return; }
    const teams = this._teamsAlive();
    let humanAlive = false, anyHuman = false;
    for (const e of M.ents.values()) if (!e.bot) { anyHuman = true; if (e.alive) humanAlive = true; }
    if (teams.size <= 1) this._end(teams.size ? [...teams][0] : 0);
    else if (!humanAlive || !anyHuman) {
      // plus aucun joueur humain en vie : on désigne le meilleur survivant plutôt que de faire attendre
      let best = null;
      for (const e of M.ents.values()) if (e.alive && (!best || e.kills > best.kills)) best = e;
      this._end(best ? best.team : 0);
    }
  }

  _end(winTeam) {
    const M = this.match;
    if (M.over) return;
    M.over = true; M.endT = M.t + 12;
    const br = M.mode === 'br';
    if (br) {
      // équipes encore en vie quand la partie s'arrête : classées selon leurs éliminations
      const alive = new Map();
      for (const e of M.ents.values()) if (e.alive && e.team !== winTeam) alive.set(e.team, (alive.get(e.team) || 0) + e.kills);
      [...alive.entries()].sort((a, b) => b[1] - a[1]).forEach(([t], i) => { for (const e of M.ents.values()) if (e.team === t) e.place = i + 2; });
    }
    const st = [...M.ents.values()].map((e) => ({ id: e.id, n: e.name, t: e.team, k: e.kills, d: e.deaths, dmg: Math.round(e.dmg), p: br ? (e.team === winTeam ? 1 : e.place || 2) : 0, b: e.bot ? 1 : 0 }));
    if (br) st.sort((a, b) => a.p - b.p || b.k - a.k); else { st.sort((a, b) => b.k - a.k || a.d - b.d); st.forEach((s, i) => (s.p = i + 1)); if (!winTeam && st[0]) winTeam = st[0].t; }
    this.evAll(['end', { mode: M.mode, win: winTeam, st, n: st.length, dur: Math.round(M.t) }]);
  }

  _toLobby() {
    this.match = null; this.state = 'lobby';
    this.cfg.rotIdx = (this.cfg.rotIdx + 1) % this.cfg.rot.length;
    if (this.cfg.auto) this.autoT = 15;
    this.pushLobby();
  }

  /** L'hôte interrompt la partie en cours. */
  abort() { if (this.match && !this.match.over) this._end(0); }

  // ------------------------------------------------------------ zone
  _nextZone() {
    const M = this.match, z = M.zone, W = M.world;
    z.i++;
    z.x = z.nx; z.z = z.nz; z.r = z.nr;
    const ph = ZONE[z.i];
    if (!ph) { z.t0 = z.t1 = 1e9; z.done = 1; return; }
    z.nr = z.i === 0 ? W.half * 0.62 : z.r * ph[2];
    const off = z.i === 0 ? W.half * 0.3 : (z.r - z.nr) * 0.85;
    const p = W.randomOpen(M.rng, z.x, z.z, Math.max(1, off));
    z.nx = r2(p[0]); z.nz = r2(p[1]); z.t0 = r2(M.t + ph[0]); z.t1 = r2(z.t0 + ph[1]); z.dps = ph[3];
    this.evAll(['zone', z]);
  }

  zoneNow() {
    const M = this.match, z = M.zone;
    if (M.t <= z.t0) return z;
    const k = clamp((M.t - z.t0) / (z.t1 - z.t0 || 1), 0, 1);
    return { x: z.x + (z.nx - z.x) * k, z: z.z + (z.nz - z.z) * k, r: z.r + (z.nr - z.r) * k };
  }

  // ------------------------------------------------------------ boucle
  ev(e, m) { if (e.link) e.out.push(m); }
  evAll(m, except) { for (const e of this.match.ents.values()) if (e.link && e !== except) e.out.push(m); }

  tick(dt) {
    if (this.state === 'lobby') {
      if (this.autoT > 0) { const b = Math.ceil(this.autoT); this.autoT -= dt; if (this.autoT <= 0) this.start(); else if (Math.ceil(this.autoT) !== b) this.pushLobby(); }
      return;
    }
    const M = this.match;
    if (!M) return;
    M.t += dt;
    if (M.over) { if (M.t >= M.endT) { this._flush(); this._toLobby(); return; } this._flush(); return; }
    M.pathBudget = 2;
    for (const e of M.ents.values()) if (e.bot) botUpdate(this, e, dt);
    this._projectiles(dt);
    if (M.mode === 'br' && !M.zone.done && M.t >= M.zone.t1) this._nextZone();
    M.slowAcc += dt;
    if (M.slowAcc >= 0.2) { M.slowAcc -= 0.2; this._slow(); }
    M.snapAcc += dt;
    if (M.snapAcc >= 0.05) { M.snapAcc = 0; this._snapshot(); }
    this._flush();
  }

  _slow() {
    const M = this.match;
    // ramassage automatique (munitions, soins, arme si emplacement libre)
    for (const e of M.ents.values()) {
      if (!e.alive || e.bot) continue;
      for (const L of M.loot.values()) {
        const dx = L.x - e.x, dz = L.z - e.z;
        if (dx * dx + dz * dz > 1.7 || Math.abs(L.y - e.y) > 1.6) continue;
        if (L.dropBy === e.id && M.t - L.dropT < 3) continue;
        if (L.k === 'w' && e.inv.w.indexOf(null) < 0) continue;
        this.take(e, L, false);
      }
    }
    M.zoneAcc += 0.2;
    if (M.zoneAcc >= 1) {
      M.zoneAcc = 0;
      const z = this.zoneNow();
      for (const e of M.ents.values()) if (e.alive && Math.hypot(e.x - z.x, e.z - z.z) > z.r) this.damage(e, M.zone.dps, null, 'zone', false, true);
    }
    if (M.mode === 'ffa') {
      for (const e of M.ents.values()) if (!e.alive && M.t >= e.respawnT) this._ffaSpawn(e, false);
      for (let i = M.respawns.length - 1; i >= 0; i--) if (M.t >= M.respawns[i].t) { const s = M.respawns[i].spot; M.respawns.splice(i, 1); const n = M.lootId; this._spawnLootAt(s, 0.16); for (let id = n; id < M.lootId; id++) this.evAll(['la', lootWire(M.loot.get(id))]); }
      if (M.t >= M.timeLimit) this._end(0);
    }
  }

  _projectiles(dt) {
    const M = this.match, W = M.world, info = {};
    for (let i = M.projs.length - 1; i >= 0; i--) {
      const p = M.projs[i];
      if (p.g) p.vy -= 15 * dt;
      const sp = Math.hypot(p.vx, p.vy, p.vz), len = sp * dt, dx = p.vx / sp, dy = p.vy / sp, dz = p.vz / sp;
      let t = sp > 0.01 ? W.raycast(p.x, p.y, p.z, dx, dy, dz, len, info) : len, boom = false;
      const worldHit = t < len && info.hit;
      // contact direct avec un joueur
      for (const e of M.ents.values()) {
        if (!e.alive || e.team === p.team) continue;
        const tt = rayPlayer(p.x, p.y, p.z, dx, dy, dz, e.x, e.y, e.z, e.fl & F.CROUCH, t + 0.5);
        if (tt > 0 && tt <= t + 0.5) { t = Math.min(t, tt); boom = true; break; }
      }
      p.x += dx * t; p.y += dy * t; p.z += dz * t;
      p.life -= dt;
      if (!boom && worldHit) {
        if (!p.g) boom = true;
        else {
          const dot = p.vx * info.nx + p.vy * info.ny + p.vz * info.nz;
          p.vx = (p.vx - 2 * dot * info.nx) * 0.45; p.vy = (p.vy - 2 * dot * info.ny) * 0.45; p.vz = (p.vz - 2 * dot * info.nz) * 0.45;
          p.x += info.nx * 0.06; p.y += info.ny * 0.06; p.z += info.nz * 0.06;
        }
      }
      if (boom || p.life <= 0) { M.projs.splice(i, 1); this._explode(p); }
    }
  }

  _explode(p) {
    const M = this.match, W = WEAPONS[p.w], R = W.radius, owner = M.ents.get(p.o);
    this.evAll(['boom', p.id, r2(p.x), r2(p.y), r2(p.z), R]);
    for (const e of [...M.ents.values()]) {
      if (!e.alive) continue;
      const self = e.id === p.o;
      if (e.team === p.team && !self) continue;
      const d = Math.hypot(e.x - p.x, e.y + 0.9 - p.y, e.z - p.z);
      if (d >= R) continue;
      let dmg = W.dmg * RARITY[p.r].dmg * (1 - (d / R) * 0.8) * (self ? 0.5 : 1);
      if (!M.world.los(p.x, p.y + 0.25, p.z, e.x, e.y + 1.1, e.z)) dmg *= 0.3;
      this.damage(e, dmg, owner || null, W.id, false);
    }
  }

  _snapshot() {
    const M = this.match, list = [];
    for (const e of M.ents.values()) {
      if (!e.alive) continue;
      const it = e.inv.w[e.inv.slot];
      e.widx = it ? WEAPONS[it.id].idx : 255;
      list.push(e);
    }
    const buf = buildSnap(M.t * 1000, list);
    for (const e of M.ents.values()) if (e.link) e.link.sendBin(buf);
  }

  _flush() {
    for (const e of this.match.ents.values()) if (e.link && e.out.length) { e.link.send(['ev', e.out]); e.out = []; }
  }
}

function lootWire(L) { return [L.id, L.k, L.a, L.b, r2(L.x), r2(L.y), r2(L.z)]; }
