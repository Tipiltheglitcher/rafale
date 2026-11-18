// Interface en jeu (DOM) : vie, bouclier, armes, viseur, minicarte, fil des éliminations, scores, carte.
import * as THREE from 'three';
import { WEAPONS, RARITY, AMMO } from '../data/weapons.js';
import { esc, fmtTime, clamp } from '../core/util.js';

const _v = new THREE.Vector3();

export function renderMapImage(world) {
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const x = cv.getContext('2d'), img = x.createImageData(S, S), d = img.data, def = world.def, half = world.half, size = world.size;
  const hex = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  const g0 = hex(def.ground.c[0]), wat = hex(def.env.water ? def.env.water.color : 0x2a6a8a), pc = {};
  for (const k in def.ground.paint) pc[k] = hex(def.ground.paint[k]);
  let mn = 1e9, mx = -1e9;
  for (let i = 0; i < world.h.length; i++) { mn = Math.min(mn, world.h[i]); mx = Math.max(mx, world.h[i]); }
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const wx = -half + ((i + 0.5) / S) * size, wz = -half + ((j + 0.5) / S) * size, h = world.heightAt(wx, wz), k = (j * S + i) * 4;
    let c;
    if (h < world.water) c = wat;
    else {
      const gi = Math.round((wx + half) / world.res), gj = Math.round((wz + half) / world.res), p = world.paint[gj * world.n + gi];
      c = p && pc[p] ? pc[p] : g0;
    }
    const sh = 0.72 + 0.4 * ((h - mn) / (mx - mn || 1));
    d[k] = Math.min(255, c[0] * sh); d[k + 1] = Math.min(255, c[1] * sh); d[k + 2] = Math.min(255, c[2] * sh); d[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const sc = S / size;
  x.fillStyle = 'rgba(30,70,30,.55)';
  for (const p of world.props) if (/pine|oak|jungle|palm/.test(p.t)) { x.beginPath(); x.arc((p.x + half) * sc, (p.z + half) * sc, 1.6 * p.s, 0, 6.29); x.fill(); }
  const boxes = world.boxes.filter((b) => !b.nr && !b.np && b.k && b.k !== 'neon' && b.y1 - b.y0 > 0.5).sort((a, b) => a.y1 - b.y1);
  for (const b of boxes) {
    const c = hex(b.c), f = clamp(0.55 + (b.y1 - world.heightAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2)) * 0.03, 0.55, 1);
    x.fillStyle = `rgb(${c[0] * f | 0},${c[1] * f | 0},${c[2] * f | 0})`;
    x.fillRect((b.x0 + half) * sc, (b.z0 + half) * sc, Math.max(1, (b.x1 - b.x0) * sc), Math.max(1, (b.z1 - b.z0) * sc));
  }
  x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 1;
  for (const b of boxes) if ((b.x1 - b.x0) * (b.z1 - b.z0) > 30) x.strokeRect((b.x0 + half) * sc, (b.z0 + half) * sc, (b.x1 - b.x0) * sc, (b.z1 - b.z0) * sc);
  return cv;
}

export class Hud {
  constructor(game) {
    this.g = game;
    const root = (this.root = document.createElement('div'));
    root.id = 'hud';
    root.innerHTML = `
      <div class="vig"></div><div class="flash"></div><div class="scope"><div class="reticle"></div></div>
      <div class="feed"></div>
      <div class="mmwrap"><canvas class="mm" width="200" height="200"></canvas><div class="mminfo"></div></div>
      <div class="notice"></div>
      <div class="xh"><i></i><i></i><i></i><i></i><b></b></div>
      <div class="hm"><i></i><i></i><i></i><i></i></div>
      <div class="dirs"></div><div class="nums"></div>
      <div class="prompt"></div>
      <div class="prog"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19"/><circle class="bar" cx="22" cy="22" r="19"/></svg><span></span></div>
      <div class="vitals"><div class="name"></div><div class="bar sh"><i></i><span></span></div><div class="bar hp"><i></i><span></span></div>
        <div class="cons"><div class="c med"><b>✚</b><span></span><kbd></kbd></div><div class="c cell"><b>⬢</b><span></span><kbd></kbd></div></div></div>
      <div class="weap"><div class="ammo"><b></b><span></span><em></em></div><div class="slots"></div></div>
      <div class="score"></div>
      <div class="bigmap"><canvas width="640" height="640"></canvas><div class="legend">Carte — <kbd></kbd> pour fermer</div></div>
      <div class="death"><h2></h2><p></p><div class="btns"></div></div>
      <div class="glidehint"></div>
      <div class="fps"></div>`;
    document.body.appendChild(root);
    const q = (s) => root.querySelector(s);
    this.el = {
      vig: q('.vig'), flash: q('.flash'), scope: q('.scope'), feed: q('.feed'), mm: q('.mm'), mminfo: q('.mminfo'), notice: q('.notice'),
      xh: q('.xh'), hm: q('.hm'), dirs: q('.dirs'), nums: q('.nums'), prompt: q('.prompt'), prog: q('.prog'), progBar: q('.prog .bar'), progTxt: q('.prog span'),
      name: q('.vitals .name'), shBar: q('.bar.sh i'), shTxt: q('.bar.sh span'), hpBar: q('.bar.hp i'), hpTxt: q('.bar.hp span'),
      med: q('.c.med span'), cell: q('.c.cell span'), medK: q('.c.med kbd'), cellK: q('.c.cell kbd'),
      mag: q('.ammo b'), res: q('.ammo span'), wname: q('.ammo em'), slots: q('.slots'), score: q('.score'), bigmap: q('.bigmap'), big: q('.bigmap canvas'),
      bigK: q('.bigmap kbd'), death: q('.death'), glide: q('.glidehint'), fps: q('.fps'),
    };
    this.mmx = this.el.mm.getContext('2d'); this.bigx = this.el.big.getContext('2d');
    this.cache = {}; this.mmT = 0; this.nums = []; this.noticeT = 0; this.hmT = 0; this.fpsAcc = [0, 0];
    const st = game.app.profile.settings;
    this.el.xh.style.setProperty('--xc', st.xhColor);
    this.el.xh.dataset.style = st.xhStyle;
    this.el.name.textContent = game.app.profile.name;
  }

  set(k, v, el, prop = 'textContent') { if (this.cache[k] !== v) { this.cache[k] = v; el[prop] = v; } }

  notice(text, cls = '', dur = 2.6) {
    this.el.notice.innerHTML = `<div class="n ${cls}">${text}</div>`;
    this.noticeT = dur;
  }

  feed(killer, victim, wid, head, mine) {
    const W = WEAPONS[wid];
    const icon = wid === 'zone' ? '☁ zone' : W ? esc(W.name) : '✖';
    const div = document.createElement('div');
    div.className = 'k' + (mine ? ' mine' : '');
    div.innerHTML = killer ? `<b>${esc(killer)}</b><span>${icon}${head ? ' ◎' : ''}</span><b>${esc(victim)}</b>` : `<b>${esc(victim)}</b><span>${icon === '✖' ? 'est tombé' : icon}</span>`;
    this.el.feed.prepend(div);
    while (this.el.feed.children.length > 6) this.el.feed.lastChild.remove();
    setTimeout(() => div.classList.add('out'), 6000);
    setTimeout(() => div.remove(), 6600);
  }

  hitmarker(head, kill) {
    const h = this.el.hm;
    h.className = 'hm on' + (head ? ' head' : '') + (kill ? ' kill' : '');
    this.hmT = kill ? 0.35 : 0.16;
  }

  damageDir(ang) {
    const d = document.createElement('i');
    d.style.transform = `rotate(${ang}rad)`;
    this.el.dirs.appendChild(d);
    setTimeout(() => d.remove(), 1100);
    this.el.flash.classList.remove('on'); void this.el.flash.offsetWidth; this.el.flash.classList.add('on');
  }

  dmgNumber(pos, amt, head, shield) {
    const e = document.createElement('div');
    e.className = 'num' + (head ? ' head' : '') + (shield ? ' sh' : '');
    e.textContent = amt;
    this.el.nums.appendChild(e);
    this.nums.push({ e, p: pos.clone().add(_v.set((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5)), t: 0 });
  }

  prompt(html) { this.set('prompt', html || '', this.el.prompt, 'innerHTML'); this.el.prompt.classList.toggle('on', !!html); }

  progress(k, label) {
    const on = k !== null && k !== undefined;
    this.el.prog.classList.toggle('on', on);
    if (on) { this.el.progBar.style.strokeDashoffset = String(119.4 * (1 - clamp(k, 0, 1))); this.set('pl', label, this.el.progTxt); }
  }

  death(title, sub, buttons) {
    const d = this.el.death;
    if (!title) { d.classList.remove('on'); return; }
    d.querySelector('h2').innerHTML = title;
    d.querySelector('p').innerHTML = sub || '';
    const b = d.querySelector('.btns');
    b.innerHTML = '';
    for (const [label, fn] of buttons || []) { const x = document.createElement('button'); x.textContent = label; x.onclick = fn; b.appendChild(x); }
    d.classList.add('on');
  }

  update(dt) {
    const g = this.g, me = g.me, inv = g.inv, I = g.app.input, st = g.app.profile.settings;
    // vie et bouclier
    this.set('hp', me.hp, this.el.hpTxt); this.el.hpBar.style.width = me.hp + '%';
    this.set('sh', me.sh, this.el.shTxt); this.el.shBar.style.width = me.sh + '%';
    this.el.vig.style.opacity = me.alive ? String(clamp((45 - me.hp) / 45, 0, 0.9) + (g.outside ? 0.25 : 0)) : '0';
    this.el.vig.classList.toggle('zone', g.outside && me.hp > 45);
    // inventaire
    if (inv) {
      this.set('med', String(inv.med), this.el.med); this.set('cell', String(inv.cell), this.el.cell);
      this.set('medK', I.label(st.keys.heal), this.el.medK); this.set('cellK', I.label(st.keys.shield), this.el.cellK);
      const it = inv.w[me.slot], W = it && WEAPONS[it.id];
      this.set('mag', it ? String(it.mag) : '—', this.el.mag);
      this.set('res', W ? String(inv.ammo[W.ammo]) : '', this.el.res);
      this.set('wn', W ? `<i style="color:${RARITY[it.r].color}">${esc(W.name)}</i> · ${AMMO[W.ammo].name}` : 'Mains nues', this.el.wname, 'innerHTML');
      this.el.mag.classList.toggle('low', !!it && it.mag <= Math.ceil(W.mag * 0.25));
      const sk = inv.w.map((x, i) => (x ? x.id + x.r + (i === me.slot ? '*' : '') : '-')).join('|');
      if (sk !== this.cache.slots) {
        this.cache.slots = sk;
        this.el.slots.innerHTML = inv.w.map((x, i) => {
          const w = x && WEAPONS[x.id];
          return `<div class="s${i === me.slot ? ' on' : ''}" style="--rc:${x ? RARITY[x.r].color : '#555'}"><kbd>${i + 1}</kbd>${w ? `<b>${esc(w.name)}</b><span>${w.clsName}</span>` : '<span>vide</span>'}</div>`;
        }).join('');
      }
    }
    // viseur dynamique
    const spread = g.curSpread || 0, gap = 6 + spread * 9;
    this.el.xh.style.setProperty('--gap', gap.toFixed(1) + 'px');
    this.el.xh.classList.toggle('hide', !me.alive || g.scoped || g.sprinting || g.spectating);
    this.el.xh.classList.toggle('ads', me.adsT > 0.6);
    this.el.scope.classList.toggle('on', !!g.scoped);
    if (this.hmT > 0) { this.hmT -= dt; if (this.hmT <= 0) this.el.hm.className = 'hm'; }
    if (this.noticeT > 0) { this.noticeT -= dt; if (this.noticeT <= 0) this.el.notice.innerHTML = ''; }
    // nombres de dégâts
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i];
      n.t += dt;
      if (n.t > 0.9) { n.e.remove(); this.nums.splice(i, 1); continue; }
      _v.copy(n.p); _v.y += n.t * 0.8; _v.project(g.cam);
      if (_v.z > 1) { n.e.style.display = 'none'; continue; }
      n.e.style.display = '';
      n.e.style.transform = `translate(${((_v.x + 1) / 2) * innerWidth}px,${((1 - _v.y) / 2) * innerHeight}px) translate(-50%,-50%) scale(${1.2 - n.t * 0.4})`;
      n.e.style.opacity = String(1 - Math.max(0, n.t - 0.5) / 0.4);
    }
    // infos de partie
    const info = g.info, br = info.mode === 'br';
    let txt;
    if (br) {
      const z = g.zone, t = g.matchTime;
      let zs = '';
      if (!z.done) zs = t < z.t0 ? `Zone dans <b>${fmtTime(z.t0 - t)}</b>` : `Zone se ferme <b>${fmtTime(z.t1 - t)}</b>`;
      else zs = 'Zone finale';
      txt = `<span>👤 <b>${g.aliveN}</b> en vie</span><span>✖ <b>${me.kills}</b></span><span>${zs}</span>`;
    } else {
      let top = 0;
      for (const e of g.ents.values()) top = Math.max(top, e.kills);
      txt = `<span>✖ <b>${me.kills}</b> / ${info.score}</span><span>Meilleur <b>${top}</b></span><span>⏱ <b>${fmtTime(info.time - g.matchTime)}</b></span>`;
    }
    this.set('mminfo', txt, this.el.mminfo, 'innerHTML');
    // minicarte
    this.mmT -= dt;
    if (this.mmT <= 0) { this.mmT = 0.1; this.drawMini(); }
    // grande carte et scores
    const showMap = I.is('map'), showScore = I.is('score') || g.over;
    this.el.bigmap.classList.toggle('on', showMap);
    if (showMap) { this.set('bigK', I.label(st.keys.map), this.el.bigK); this.drawBig(); }
    this.el.score.classList.toggle('on', showScore && !g.over);
    if (showScore && !g.over) this.drawScore();
    // FPS
    this.el.fps.style.display = st.showFps ? '' : 'none';
    if (st.showFps) { this.fpsAcc[0] += dt; this.fpsAcc[1]++; if (this.fpsAcc[0] > 0.5) { this.el.fps.textContent = Math.round(this.fpsAcc[1] / this.fpsAcc[0]) + ' i/s'; this.fpsAcc = [0, 0]; } }
    this.el.glide.textContent = g.me.alive && g.me.ch.glide ? 'Parachutage — dirigez-vous avec les touches de déplacement' : '';
  }

  _drawZone(x, cx, cz, sc, ox, oy) {
    const g = this.g, z = g.zoneNow();
    if (!z) return;
    x.lineWidth = 2;
    if (g.info.mode === 'br' && !g.zone.done) {
      x.strokeStyle = 'rgba(255,255,255,.9)'; x.setLineDash([5, 4]);
      x.beginPath(); x.arc(ox + (g.zone.nx - cx) * sc, oy + (g.zone.nz - cz) * sc, g.zone.nr * sc, 0, 6.29); x.stroke(); x.setLineDash([]);
    }
    x.strokeStyle = '#4aa8ff'; x.lineWidth = 2.5;
    x.beginPath(); x.arc(ox + (z.x - cx) * sc, oy + (z.z - cz) * sc, z.r * sc, 0, 6.29); x.stroke();
  }

  _drawUnits(x, cx, cz, sc, ox, oy, big) {
    const g = this.g, me = g.me;
    for (const e of g.ents.values()) {
      if (e.id === me.id || !e.vis || e.team !== g.myTeam) continue;
      x.fillStyle = '#3df27a'; x.strokeStyle = '#000'; x.lineWidth = 1.5;
      x.beginPath(); x.arc(ox + (e.rx - cx) * sc, oy + (e.rz - cz) * sc, big ? 6 : 4, 0, 6.29); x.fill(); x.stroke();
    }
    const px = ox + (g.camPos.x - cx) * sc, pz = oy + (g.camPos.z - cz) * sc, yaw = g.camYaw;
    x.save(); x.translate(px, pz); x.rotate(-yaw);
    x.fillStyle = '#ffd23a'; x.strokeStyle = '#000'; x.lineWidth = 1.5;
    const s = big ? 1.5 : 1;
    x.beginPath(); x.moveTo(0, -8 * s); x.lineTo(5.5 * s, 6 * s); x.lineTo(0, 3 * s); x.lineTo(-5.5 * s, 6 * s); x.closePath(); x.fill(); x.stroke();
    x.restore();
  }

  drawMini() {
    const g = this.g, x = this.mmx, W = 200, R = 85, img = g.mapImg, half = g.world.half, ps = img.width / g.world.size;
    const cx = g.camPos.x, cz = g.camPos.z, sc = W / (R * 2);
    x.save();
    x.clearRect(0, 0, W, W);
    x.beginPath(); x.arc(W / 2, W / 2, W / 2 - 1, 0, 6.29); x.clip();
    x.fillStyle = '#1a1d22'; x.fillRect(0, 0, W, W);
    x.drawImage(img, (cx - R + half) * ps, (cz - R + half) * ps, R * 2 * ps, R * 2 * ps, 0, 0, W, W);
    this._drawZone(x, cx, cz, sc, W / 2, W / 2);
    this._drawUnits(x, cx, cz, sc, W / 2, W / 2, false);
    x.restore();
    x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 2; x.beginPath(); x.arc(W / 2, W / 2, W / 2 - 1, 0, 6.29); x.stroke();
    x.fillStyle = '#fff'; x.font = '700 12px system-ui'; x.textAlign = 'center'; x.fillText('N', W / 2, 14);
  }

  drawBig() {
    const g = this.g, x = this.bigx, S = 640, sc = S / g.world.size;
    x.drawImage(g.mapImg, 0, 0, S, S);
    this._drawZone(x, 0, 0, sc, S / 2, S / 2);
    this._drawUnits(x, 0, 0, sc, S / 2, S / 2, true);
  }

  drawScore() {
    const g = this.g, list = [...g.ents.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    const br = g.info.mode === 'br';
    const rows = list.map((e) => `<tr class="${e.id === g.me.id ? 'me' : ''}${e.team === g.myTeam && br && g.info.ts > 1 ? ' mate' : ''}${br && !e.alive ? ' dead' : ''}"><td>${esc(e.name)}${e.bot ? ' <small>BOT</small>' : ''}</td><td>${e.kills}</td><td>${e.deaths}</td><td>${br ? (e.alive ? 'En vie' : 'Éliminé') : ''}</td></tr>`).join('');
    const html = `<h3>${br ? 'Battle royale' : 'Chacun pour soi'} — ${esc(g.world.def.name)}</h3><table><tr><th>Joueur</th><th>Élim.</th><th>Morts</th><th></th></tr>${rows}</table>`;
    this.set('score', html, this.el.score, 'innerHTML');
  }

  dispose() { this.root.remove(); }
}
