// Application : écrans, sessions (solo hors ligne, hôte, invité), salon, fin de partie.
import * as THREE from 'three';
import { Profile, QUALITY, reward } from './data/profile.js';
import { Input } from './engine/input.js';
import { Sound } from './engine/audio.js';
import { Server } from './game/server.js';
import { Game } from './game/client.js';
import { DIFF } from './game/bots.js';
import { VERSION } from './game/proto.js';
import { hostLobby, joinLobby, localLink, hostClock, normCode } from './net/net.js';
import { MAPS, MAP } from './world/maps.js';
import { MenuScene } from './ui/menuscene.js';
import { openShop } from './ui/shop.js';
import { openSettings } from './ui/settings.js';
import { $, $$, esc, fmtTime } from './core/util.js';

const MODES = [
  { id: 'br1', mode: 'br', ts: 1, name: 'Battle royale', sub: 'Solo', desc: 'Seul contre tous. Le dernier debout gagne.' },
  { id: 'br2', mode: 'br', ts: 2, name: 'Battle royale', sub: 'Duo', desc: 'Par équipes de deux.' },
  { id: 'br3', mode: 'br', ts: 3, name: 'Battle royale', sub: 'Trio', desc: 'Par équipes de trois.' },
  { id: 'br4', mode: 'br', ts: 4, name: 'Battle royale', sub: 'Escouade', desc: 'Par équipes de quatre.' },
  { id: 'ffa', mode: 'ffa', ts: 1, name: 'JcJ', sub: 'Chacun pour soi', desc: 'Réapparitions, 25 éliminations ou 8 minutes.' },
];
const MAP_ART = { port: 'linear-gradient(135deg,#2f6f9f,#b5432e 60%,#d9a520)', dunes: 'linear-gradient(135deg,#f0c27a,#c98a4a 60%,#7a4a2a)', givre: 'linear-gradient(135deg,#e8f0f8,#8ab0d8 55%,#2a4a6a)', canopee: 'linear-gradient(135deg,#9ad86a,#2f6a2c 55%,#1a3a1a)', neon: 'linear-gradient(135deg,#ff2a6d,#3a1a6a 50%,#05d9e8)' };

class App {
  constructor() {
    this.profile = new Profile();
    const cv = $('#c');
    this.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.input = new Input(cv, this.profile);
    this.sound = new Sound();
    this.menu = new MenuScene();
    this.menu.setCos(this.profile.cos);
    this.session = null; this.game = null; this.pending = null; this.chatOpen = false; this.endShown = false;
    this.applySettings();
    addEventListener('resize', () => this.resize());
    this.resize();
    addEventListener('pointerdown', () => this.sound.init(), { once: false });
    addEventListener('keydown', () => this.sound.init());
    this.input.onUnlock = () => this.onUnlock();
    this.bindUi();
    this.updateTop();
    this.show('home');
    const q = new URLSearchParams(location.search).get('join');
    if (q) { this.show('multi'); $('#joincode').value = normCode(q); }
    let last = performance.now();
    const loop = () => {
      requestAnimationFrame(loop);
      const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      try {
        if (this.game) this.game.frame(dt); else this.menu.render(this.renderer, dt);
      } catch (err) { console.error(err); }
      this.input.endFrame();
    };
    loop();
  }

  /** Canal vers l'hôte de la session en cours (ou un canal muet). */
  get net() { return this.session ? this.session.net : { send() {}, sendBin() {} }; }

  // ---------------------------------------------------------------- réglages
  applySettings() {
    const s = this.profile.settings, q = QUALITY[s.quality] || QUALITY.high;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.pr));
    this.sound.setVolume(s.volume);
    if (this.game) { this.game.hud.el.xh.style.setProperty('--xc', s.xhColor); this.game.hud.el.xh.dataset.style = s.xhStyle; this.game.view.setViewDistance(q.view); this.game.q = q; }
    this.resize();
  }
  resize() { this.renderer.setSize(innerWidth, innerHeight, false); }
  syncCos() {
    this.menu.setCos(this.profile.cos);
    if (this.session && this.session.net && this.session.myId) this.session.net.send(['cos', this.profile.cos, this.profile.name]);
  }
  updateTop() { $('#credits').textContent = this.profile.credits.toLocaleString('fr-FR'); $('#pname').textContent = this.profile.name; }
  toast(msg, err) {
    const t = document.createElement('div');
    t.className = 'toast' + (err ? ' err' : ''); t.innerHTML = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.classList.add('out'), err ? 6000 : 3200);
    setTimeout(() => t.remove(), err ? 6600 : 3800);
  }

  // ---------------------------------------------------------------- navigation
  show(name) {
    this.screen = name;
    $$('.screen').forEach((s) => s.classList.toggle('on', s.id === 's-' + name));
    $('#topbar').classList.toggle('hide', name === 'game');
    $('#ui').classList.toggle('ingame', name === 'game');
    $$('#topbar nav button').forEach((b) => b.classList.toggle('on', b.dataset.go === name));
    if (name === 'shop') openShop(this, $('#shopbox'));
    else if (name !== 'game') { this.menu.setCos(this.profile.cos); this.menu.frame(name === 'home' ? -1 : name === 'settings' ? 0 : 1, false); }
    if (name === 'settings') openSettings(this, $('#setbox'), false);
    if (name === 'play') this.renderPlay();
    if (name === 'home') this.renderHome();
  }

  bindUi() {
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-go]');
      if (b) { this.sound.click(); if (b.dataset.go === 'home' && this.session) this.leave(); this.show(b.dataset.go); }
    });
    $('#btn-create').onclick = () => this.createLobby();
    $('#btn-join').onclick = () => this.join($('#joincode').value);
    $('#joincode').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.join($('#joincode').value); });
    $('#joincode').addEventListener('input', (e) => { e.target.value = normCode(e.target.value); });
    $('#lobby-leave').onclick = () => { this.leave(); this.show('multi'); };
    $('#lobby-copy').onclick = () => this.copyInvite();
    $('#lobby-start').onclick = () => { if (this.session && this.session.server) this.session.server.start(); };
    $('#lobby-stop').onclick = () => { if (this.session && this.session.server) this.session.server.abort(); };
    $('#lobby-back').onclick = () => { if (this.game) this.enterGameView(); };
    const lc = $('#lobby-chat input');
    lc.addEventListener('keydown', (e) => { if (e.key === 'Enter' && lc.value.trim() && this.session) { this.session.net.send(['chat', lc.value]); lc.value = ''; } });
    // discussion en jeu
    this.input.onKey = null;
    addEventListener('keydown', (e) => {
      if (!this.game || this.chatOpen || !this.input.locked) return;
      if (e.code === this.profile.settings.keys.chat && this.session.kind !== 'offline') { e.preventDefault(); this.openChat(); }
    });
    const ci = $('#chat input');
    ci.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { if (ci.value.trim()) this.session.net.send(['chat', ci.value]); this.closeChat(); }
      else if (e.key === 'Escape') this.closeChat();
      e.stopPropagation();
    });
    $('#pause-resume').onclick = () => { this.sound.init(); this.input.lock(); };
    $('#pause-settings').onclick = () => { $('#pause').classList.add('set'); openSettings(this, $('#pause-set'), true); };
    $('#pause-setback').onclick = () => $('#pause').classList.remove('set');
    $('#c').addEventListener('click', () => { if (this.game && !this.input.locked && !this.game.over && !this.chatOpen) { this.sound.init(); this.input.lock(); } });
    document.addEventListener('pointerlockchange', () => { if (this.input.locked) { $('#pause').classList.remove('on', 'set'); } });
    document.addEventListener('pointerlockerror', () => this.toast('Le navigateur a refusé de capturer la souris : cliquez à nouveau dans la fenêtre.', true));
  }

  renderHome() {
    const s = this.profile.stats;
    $('#home-stats').innerHTML = `<div><b>${s.matches}</b><span>Parties</span></div><div><b>${s.wins}</b><span>Victoires</span></div><div><b>${s.kills}</b><span>Éliminations</span></div><div><b>${s.top}</b><span>Top 5</span></div>`;
  }

  // ---------------------------------------------------------------- partie solo (hors ligne, avec bots)
  renderPlay() {
    const L = this.profile.last;
    const cur = MODES.find((m) => m.mode === L.mode && m.ts === L.ts) || MODES[0];
    $('#play-modes').innerHTML = MODES.map((m) => `<button class="mode${m === cur ? ' on' : ''}" data-m="${m.id}"><small>${m.name}</small><b>${m.sub}</b><span>${m.desc}</span></button>`).join('');
    const mapSel = L.map || 'rot';
    $('#play-maps').innerHTML = `<button class="map${mapSel === 'rot' ? ' on' : ''}" data-map="rot" style="--art:linear-gradient(135deg,#2f6f9f,#d9a520,#2f6a2c,#ff2a6d)"><b>Rotation</b><span>Les 5 cartes à la suite</span></button>`
      + MAPS.map((m) => `<button class="map${mapSel === m.id ? ' on' : ''}" data-map="${m.id}" style="--art:${MAP_ART[m.id]}"><b>${m.name}</b><span>${m.tag}</span></button>`).join('');
    $('#play-bots').value = L.bots; $('#play-botsv').textContent = L.bots;
    $('#play-diff').innerHTML = DIFF.map((d, i) => `<button class="${L.diff === i ? 'on' : ''}" data-d="${i}">${d.name}</button>`).join('');
    const sync = () => this.profile.save();
    $$('#play-modes .mode').forEach((b) => (b.onclick = () => { const m = MODES.find((x) => x.id === b.dataset.m); L.mode = m.mode; L.ts = m.ts; sync(); this.sound.click(); this.renderPlay(); }));
    $$('#play-maps .map').forEach((b) => (b.onclick = () => { L.map = b.dataset.map; sync(); this.sound.click(); this.renderPlay(); }));
    $$('#play-diff button').forEach((b) => (b.onclick = () => { L.diff = +b.dataset.d; sync(); this.sound.click(); this.renderPlay(); }));
    $('#play-bots').oninput = (e) => { L.bots = +e.target.value; $('#play-botsv').textContent = L.bots; sync(); };
    $('#play-go').onclick = () => this.startOffline();
  }

  newServer(kind) {
    const server = new Server();
    const h = { onMsg: (m) => this.onMsg(m), onBin: (d) => this.onBin(d) };
    const link = localLink(server, h);
    server.onMsg(link.id, ['hello', this.profile.name, this.profile.cos, VERSION]);
    const stop = hostClock((dt) => { try { server.tick(dt); } catch (err) { console.error(err); } });
    this.session = { kind, server, net: link, myId: link.id, stop, lobby: server.lobbyState(), close: () => { stop(); } };
    return server;
  }

  startOffline() {
    this.sound.init();
    const L = this.profile.last;
    if (this.session) this.leave(true);
    const server = this.newServer('offline');
    server.setCfg({ mode: L.mode, teamSize: L.ts, bots: L.bots, diff: L.diff, fill: true, rot: !L.map || L.map === 'rot' ? MAPS.map((m) => m.id) : [L.map], rotIdx: 0 });
    server.start();
  }

  replayOffline() {
    const s = this.session;
    if (!s || !s.server) return;
    if (s.server.match) s.server._toLobby();
    this.closeEnd();
    s.server.start();
  }

  // ---------------------------------------------------------------- multijoueur
  async createLobby() {
    this.sound.init();
    if (this.session) this.leave(true);
    const L = this.profile.last;
    const server = this.newServer('host');
    server.setCfg({ mode: L.mode, teamSize: L.ts, bots: Math.min(L.bots, 8), diff: L.diff, fill: true, rot: MAPS.map((m) => m.id), auto: false });
    this.session.rotUI = { order: MAPS.map((m) => m.id), on: new Set(MAPS.map((m) => m.id)) };
    this.buildLobby();
    this.show('lobby');
    this.renderLobby();
    try {
      const h = await hostLobby(this.profile.settings, server, (msg) => this.toast(msg, true));
      if (!this.session || this.session.server !== server) { h.close(); return; }
      const prev = this.session.close;
      this.session.close = () => { h.close(); prev(); };
      this.session.code = h.code;
      history.replaceState(null, '', location.pathname);
      this.renderLobby();
      this.toast(`Salon ouvert : <b>${h.code}</b> — partagez ce code`);
    } catch (err) {
      this.toast(esc(err.message), true);
      this.leave(true);
      this.show('multi');
    }
  }

  async join(code) {
    this.sound.init();
    code = normCode(code);
    if (code.length !== 5) { this.toast('Entrez le code à 5 caractères donné par l’hôte.', true); return; }
    if (this.session) this.leave(true);
    $('#btn-join').disabled = true; $('#btn-join').textContent = 'Connexion…';
    try {
      const net = await joinLobby(this.profile.settings, code, { onMsg: (m) => this.onMsg(m), onBin: (d) => this.onBin(d), onClose: (r) => { if (this.session && this.session.net === net) { this.leave(true); this.show('multi'); this.toast(esc(r), true); } } });
      this.session = { kind: 'client', net, myId: 0, code, lobby: null, close: () => net.close() };
      net.send(['hello', this.profile.name, this.profile.cos, VERSION]);
      this.buildLobby();
      this.show('lobby');
      this.renderLobby();
    } catch (err) { this.toast(esc(err.message), true); }
    $('#btn-join').disabled = false; $('#btn-join').textContent = 'Rejoindre';
  }

  copyInvite() {
    const s = this.session;
    if (!s || !s.code) return;
    const url = `${location.origin}${location.pathname}?join=${s.code}`;
    const txt = `Rejoins mon salon RAFALE ! Code : ${s.code} — ${url}`;
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => this.toast('Invitation copiée dans le presse-papiers'), () => this.toast(`Code : <b>${s.code}</b>`));
  }

  /** Construit une fois les contrôles du salon (évite de perdre le focus à chaque mise à jour). */
  buildLobby() {
    const box = $('#lobby-cfg'), s = this.session, host = s.kind === 'host';
    $('#lobby-chat .log').innerHTML = '';
    box.innerHTML = `
      <h3>Mode de jeu</h3><div class="seg" id="lc-mode">${MODES.map((m) => `<button data-m="${m.id}"><small>${m.name}</small>${m.sub}</button>`).join('')}</div>
      <div class="two">
        <label>Bots <output id="lc-botsv"></output><input type="range" id="lc-bots" min="0" max="23"></label>
        <label>Difficulté des bots<div class="seg small" id="lc-diff">${DIFF.map((d, i) => `<button data-d="${i}">${d.name}</button>`).join('')}</div></label>
      </div>
      <label class="chk"><input type="checkbox" id="lc-fill"> Compléter les équipes avec des bots</label>
      <h3>Rotation des cartes</h3><div id="lc-rot" class="rot"></div>
      <label class="chk"><input type="checkbox" id="lc-auto"> Enchaîner automatiquement sur la carte suivante (15 s après chaque partie)</label>`;
    box.classList.toggle('ro', !host);
    if (!host) return;
    const S = s.server;
    $$('#lc-mode button').forEach((b) => (b.onclick = () => { const m = MODES.find((x) => x.id === b.dataset.m); S.setCfg({ mode: m.mode, teamSize: m.ts }); this.profile.last.mode = m.mode; this.profile.last.ts = m.ts; this.profile.save(); }));
    $$('#lc-diff button').forEach((b) => (b.onclick = () => S.setCfg({ diff: +b.dataset.d })));
    $('#lc-bots').oninput = (e) => { $('#lc-botsv').textContent = e.target.value; S.setCfg({ bots: +e.target.value }); };
    $('#lc-fill').onchange = (e) => S.setCfg({ fill: e.target.checked });
    $('#lc-auto').onchange = (e) => S.setCfg({ auto: e.target.checked });
  }

  pushRot() {
    const s = this.session, R = s.rotUI, rot = R.order.filter((id) => R.on.has(id));
    if (!rot.length) { this.toast('Gardez au moins une carte dans la rotation.', true); R.on.add(R.order[0]); return this.pushRot(); }
    const next = s.server.cfg.rot[s.server.cfg.rotIdx % s.server.cfg.rot.length];
    const idx = Math.max(0, rot.indexOf(next));
    s.server.setCfg({ rot, rotIdx: idx });
  }

  renderLobby() {
    const s = this.session;
    if (!s || this.screen !== 'lobby') return;
    const L = s.lobby, host = s.kind === 'host';
    $('#lobby-code').textContent = s.code || (host ? '…' : s.code || '');
    $('#lobby-sub').textContent = host ? (s.code ? 'Vous hébergez ce salon : gardez cet onglet ouvert pendant la partie.' : 'Ouverture du salon…') : 'Connecté au salon.';
    $('#lobby-copy').disabled = !s.code;
    if (!L) { $('#lobby-players').innerHTML = '<p class="note">Connexion au salon…</p>'; return; }
    const cfg = L.cfg, teams = cfg.mode === 'br' && cfg.teamSize > 1;
    const nT = Math.ceil(16 / cfg.teamSize);
    $('#lobby-count').textContent = `${L.pl.length} / 16`;
    $('#lobby-players').innerHTML = L.pl.map((p) => `<div class="pl${p.id === s.myId ? ' me' : ''}">
      <span class="dot" style="background:${teams && p.t ? `hsl(${(p.t * 67) % 360} 70% 55%)` : '#555'}"></span>
      <b>${esc(p.n)}</b>${p.id === L.host ? '<i title="Hôte">★ hôte</i>' : ''}${p.id === s.myId ? '<i>vous</i>' : ''}
      ${teams ? (p.id === s.myId ? `<select class="teamsel">${['Équipe auto', ...Array.from({ length: nT }, (_, i) => 'Équipe ' + (i + 1))].map((t, i) => `<option value="${i}" ${p.t === i ? 'selected' : ''}>${t}</option>`).join('')}</select>` : `<em>${p.t ? 'Équipe ' + p.t : 'auto'}</em>`) : ''}
    </div>`).join('');
    const ts = $('#lobby-players .teamsel');
    if (ts) ts.onchange = () => s.net.send(['team', +ts.value]);
    // réglages
    const mid = cfg.mode === 'ffa' ? 'ffa' : 'br' + cfg.teamSize;
    $$('#lc-mode button').forEach((b) => b.classList.toggle('on', b.dataset.m === mid));
    $$('#lc-diff button').forEach((b) => b.classList.toggle('on', +b.dataset.d === cfg.diff));
    const bots = $('#lc-bots');
    if (document.activeElement !== bots) { bots.value = cfg.bots; $('#lc-botsv').textContent = cfg.bots; }
    $('#lc-fill').checked = cfg.fill; $('#lc-auto').checked = cfg.auto;
    $('#lc-fill').closest('label').style.display = teams ? '' : 'none';
    // rotation
    const R = s.rotUI || { order: [...cfg.rot, ...MAPS.map((m) => m.id).filter((id) => !cfg.rot.includes(id))], on: new Set(cfg.rot) };
    if (!host) s.rotUI = R;
    $('#lc-rot').innerHTML = R.order.map((id, i) => {
      const m = MAP[id], on = R.on.has(id), next = L.next === id;
      return `<div class="rm${on ? '' : ' off'}${next ? ' next' : ''}" style="--art:${MAP_ART[id]}">
        ${host ? `<input type="checkbox" data-on="${id}" ${on ? 'checked' : ''}>` : ''}<div class="art"></div>
        <div class="t"><b>${m.name}</b><span>${next ? '▶ Prochaine carte' : m.tag}</span></div>
        ${host ? `<button data-next="${id}" title="Jouer celle-ci ensuite" ${on ? '' : 'disabled'}>▶</button><button data-up="${i}" title="Monter" ${i ? '' : 'disabled'}>▲</button><button data-dn="${i}" title="Descendre" ${i < R.order.length - 1 ? '' : 'disabled'}>▼</button>` : ''}
      </div>`;
    }).join('');
    if (host) {
      $$('#lc-rot [data-on]').forEach((c) => (c.onchange = () => { c.checked ? R.on.add(c.dataset.on) : R.on.delete(c.dataset.on); this.pushRot(); }));
      $$('#lc-rot [data-up]').forEach((b) => (b.onclick = () => { const i = +b.dataset.up; [R.order[i - 1], R.order[i]] = [R.order[i], R.order[i - 1]]; this.pushRot(); }));
      $$('#lc-rot [data-dn]').forEach((b) => (b.onclick = () => { const i = +b.dataset.dn; [R.order[i + 1], R.order[i]] = [R.order[i], R.order[i + 1]]; this.pushRot(); }));
      $$('#lc-rot [data-next]').forEach((b) => (b.onclick = () => { const rot = s.server.cfg.rot; s.server.setCfg({ rotIdx: rot.indexOf(b.dataset.next) }); }));
    }
    // état
    const playing = L.st === 'playing';
    let st = '';
    if (playing) st = this.game ? 'Partie en cours.' : 'Partie en cours — vous rejoindrez la prochaine.';
    else if (L.auto > 0) st = `Lancement automatique dans <b>${L.auto}</b> s`;
    else st = host ? 'Lancez la partie quand tout le monde est prêt.' : 'En attente du lancement par l’hôte…';
    $('#lobby-status').innerHTML = st;
    $('#lobby-start').style.display = host && !playing ? '' : 'none';
    $('#lobby-stop').style.display = host && playing ? '' : 'none';
    $('#lobby-back').style.display = playing && this.game ? '' : 'none';
  }

  // ---------------------------------------------------------------- messages de l'hôte
  onMsg(m) {
    const s = this.session;
    if (!s || !Array.isArray(m)) return;
    if (this.pending && (m[0] === 'ev' || m[0] === 'inv')) { this.pending.push(m); return; }
    switch (m[0]) {
      case 'welcome': s.myId = m[1]; s.lobby = m[2]; this.renderLobby(); break;
      case 'lobby': {
        s.lobby = m[1];
        if (s.lobby.st === 'lobby' && this.game) this.closeGame();
        this.renderLobby();
        break;
      }
      case 'start': this.startGame(m[1]); break;
      case 'ev': if (this.game) this.game.onEvents(m[1]); break;
      case 'inv': if (this.game) this.game.onInv(m[1]); break;
      case 'chat': this.addChat(m[1], m[2]); break;
      case 'kick': this.leave(true); this.show('multi'); this.toast(esc(m[1]), true); break;
    }
  }
  onBin(dv) {
    if (this.pending) { this.pending.push(dv); return; }
    if (this.game) this.game.onSnap(dv);
  }

  startGame(info) {
    this.closeEnd();
    if (this.game) this.closeGame();
    this.pending = [];
    $('#loading').classList.add('on');
    $('#loading b').textContent = MAP[info.map].name;
    $('#loading span').textContent = MAP[info.map].desc;
    setTimeout(() => {
      try {
        this.game = new Game(this, info);
      } catch (err) {
        console.error(err); this.pending = null; $('#loading').classList.remove('on');
        this.toast('Impossible de lancer la partie : ' + esc(err.message), true);
        return;
      }
      const q = this.pending; this.pending = null;
      for (const m of q) { if (m instanceof DataView) this.game.onSnap(m); else this.onMsg(m); }
      $('#loading').classList.remove('on');
      this.enterGameView();
    }, 60);
  }

  enterGameView() {
    this.show('game');
    this.input.enabled = true;
    this.menu.active = false;
    this.showPause(true);
  }

  showPause(first) {
    if (!this.game) return;
    const s = this.session, P = $('#pause');
    P.classList.add('on'); P.classList.remove('set');
    $('#pause h2').textContent = first ? 'Prêt ?' : 'Pause';
    $('#pause-resume').textContent = first ? 'Cliquez pour jouer' : 'Reprendre';
    const k = this.input.label.bind(this.input), K = this.profile.settings.keys;
    $('#pause-help').innerHTML = `<span><kbd>${k(K.forward)}${k(K.left)}${k(K.back)}${k(K.right)}</kbd> se déplacer</span><span><kbd>Souris</kbd> viser · <kbd>Clic</kbd> tirer · <kbd>Clic droit</kbd> viser</span>
      <span><kbd>${k(K.sprint)}</kbd> sprint · <kbd>${k(K.crouch)}</kbd> accroupi · <kbd>${k(K.jump)}</kbd> saut</span><span><kbd>${k(K.use)}</kbd> ramasser · <kbd>${k(K.reload)}</kbd> recharger · <kbd>${k(K.drop)}</kbd> lâcher</span>
      <span><kbd>${k(K.heal)}</kbd> soins · <kbd>${k(K.shield)}</kbd> bouclier · <kbd>1-4</kbd> armes</span><span><kbd>${k(K.map)}</kbd> carte · <kbd>${k(K.score)}</kbd> scores${s.kind !== 'offline' ? ` · <kbd>${k(K.chat)}</kbd> discussion` : ''}</span>`;
    const acts = $('#pause-acts');
    acts.innerHTML = '';
    const add = (label, fn, cls = '') => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; b.onclick = () => { this.sound.click(); fn(); }; acts.appendChild(b); };
    if (s.kind === 'offline') add('Abandonner la partie', () => this.leaveMatch(), 'danger');
    else if (s.kind === 'host') { add('Retour au salon', () => this.leaveMatch()); add('Terminer la partie pour tous', () => s.server.abort(), 'danger'); }
    else { add('Retour au salon', () => this.leaveMatch()); add('Quitter le salon', () => { this.leave(); this.show('multi'); }, 'danger'); }
  }

  onUnlock() {
    if (!this.game || this.chatOpen || this.game.over || this.endShown) return;
    this.showPause(false);
  }

  openChat() {
    this.chatOpen = true;
    $('#chat').classList.add('open');
    this.input.unlock();
    setTimeout(() => $('#chat input').focus(), 0);
  }
  closeChat() {
    const ci = $('#chat input');
    ci.value = ''; ci.blur();
    $('#chat').classList.remove('open');
    this.chatOpen = false;
    if (this.game && !this.game.over) this.input.lock();
  }
  addChat(name, text) {
    for (const log of [$('#chat .log'), $('#lobby-chat .log')]) {
      const d = document.createElement('div');
      d.innerHTML = `<b>${esc(name)}</b> ${esc(text)}`;
      log.appendChild(d);
      while (log.children.length > 40) log.firstChild.remove();
      log.scrollTop = log.scrollHeight;
    }
    $('#chat').classList.add('recent');
    clearTimeout(this.chatT);
    this.chatT = setTimeout(() => $('#chat').classList.remove('recent'), 7000);
  }

  // ---------------------------------------------------------------- fin de partie
  onMatchEnd(res) {
    const s = this.session, P = this.profile, g = this.game;
    const myId = s.myId, rw = reward(res, myId), me = rw.me;
    if (me) {
      P.credits += rw.total;
      P.stats.matches++; P.stats.kills += me.k; P.stats.deaths += me.d; P.stats.dmg += me.dmg;
      if (me.p === 1) P.stats.wins++;
      if (me.p <= 5) P.stats.top++;
      P.save(); this.updateTop();
    }
    this.endShown = true;
    this.input.unlock();
    $('#pause').classList.remove('on');
    const br = res.mode === 'br', win = me && me.p === 1;
    const myTeam = me ? me.t : -1;
    const title = !me ? 'Partie terminée' : win ? (br ? 'VICTOIRE ROYALE' : 'PREMIÈRE PLACE') : br ? `#${me.p} sur ${new Set(res.st.map((x) => x.t)).size}` : `${me.p}e place`;
    const rows = res.st.slice(0, 24).map((x) => `<tr class="${x.id === myId ? 'me' : ''}${br && x.t === myTeam && x.id !== myId ? ' mate' : ''}"><td>#${x.p}</td><td>${esc(x.n)}${x.b ? ' <small>BOT</small>' : ''}</td><td>${x.k}</td><td>${x.d}</td><td>${x.dmg}</td></tr>`).join('');
    const nextMap = s.server ? MAP[s.server.cfg.rot[(s.server.cfg.rotIdx + 1) % s.server.cfg.rot.length]] : null;
    $('#endscr').innerHTML = `
      <div class="endbox${win ? ' win' : ''}">
        <h1>${title}</h1><p class="sub">${g ? esc(g.world.def.name) : ''} · ${br ? 'Battle royale' : 'Chacun pour soi'} · ${fmtTime(res.dur)}</p>
        <div class="cols">
          <table><tr><th></th><th>Joueur</th><th>Élim.</th><th>Morts</th><th>Dégâts</th></tr>${rows}</table>
          <div class="reward"><h3>Crédits gagnés</h3>${rw.lines.map((l) => `<div><span>${l[0]}</span><b>+${l[1]}</b></div>`).join('')}<div class="tot"><span>Total</span><b>+${rw.total} ¢</b></div>
            <p class="note">Dépensez vos crédits dans la boutique.</p></div>
        </div>
        <div class="acts"></div>
      </div>`;
    const acts = $('#endscr .acts');
    const add = (label, fn, cls = '') => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; b.onclick = () => { this.sound.click(); fn(); }; acts.appendChild(b); };
    if (s.kind === 'offline') {
      add(`Rejouer${nextMap && s.server.cfg.rot.length > 1 ? ' — ' + nextMap.name : ''}`, () => this.replayOffline(), 'primary');
      add('Boutique', () => { this.leave(); this.show('shop'); });
      add('Menu principal', () => { this.leave(); this.show('home'); });
    } else {
      add('Retour au salon', () => { if (s.kind === 'host' && s.server.match) s.server._toLobby(); this.closeEnd(); this.closeGame(); this.show('lobby'); this.renderLobby(); }, 'primary');
      if (s.kind === 'host' && s.server.cfg.auto) acts.insertAdjacentHTML('beforeend', '<p class="note">La carte suivante se lancera automatiquement.</p>');
    }
    $('#endscr').classList.add('on');
  }

  closeEnd() { this.endShown = false; $('#endscr').classList.remove('on'); }

  closeGame() {
    if (!this.game) return;
    this.game.dispose();
    this.game = null;
    this.pending = null;
    this.input.enabled = false;
    this.input.unlock();
    this.menu.active = true;
    $('#pause').classList.remove('on');
    $('#chat').classList.remove('open');
    this.chatOpen = false;
    if (this.screen === 'game' && !this.endShown) { if (this.session && this.session.kind !== 'offline') this.show('lobby'); else this.show('play'); }
  }

  /** Quitter la partie en cours sans quitter le salon. */
  leaveMatch() {
    const s = this.session;
    if (!s) return;
    if (s.kind === 'offline') { this.leave(); this.show('play'); return; }
    this.closeEnd();
    this.closeGame();
    this.show('lobby');
    this.renderLobby();
  }

  /** Fermer complètement la session (salon, hôte, partie hors ligne). */
  leave(silent) {
    const s = this.session;
    this.session = null;
    this.closeEnd();
    if (this.game) { this.game.dispose(); this.game = null; this.input.enabled = false; this.input.unlock(); }
    this.pending = null; this.menu.active = true;
    $('#pause').classList.remove('on');
    if (s) { try { s.close(); } catch {} }
    if (!silent && s && s.kind !== 'offline') this.toast('Vous avez quitté le salon.');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try { window.app = new App(); }
  catch (err) {
    console.error(err);
    document.body.insertAdjacentHTML('beforeend', `<div class="fatal">Impossible de démarrer le jeu : ${esc(err.message)}<br>Votre navigateur doit prendre en charge WebGL.</div>`);
  }
});
