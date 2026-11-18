// Boutique et casier : acheter avec les crédits gagnés en jeu, équiper, prévisualiser en 3D.
import * as THREE from 'three';
import { CATS, byCat, getItem, SKIN_TONES, HAIR } from '../data/cosmetics.js';
import { RARITY } from '../data/weapons.js';
import { Character } from '../models/character.js';
import { weaponMesh } from '../models/weapons.js';
import { Thumbs } from './menuscene.js';
import { esc } from '../core/util.js';

let thumbs = null;
const hexc = (c) => '#' + c.toString(16).padStart(6, '0');

function thumbFor(app, item, img) {
  thumbs = thumbs || new Thumbs();
  const base = app.profile.cos;
  if (item.cat === 'tracer') {
    const c = hexc(item.color);
    img.style.background = `radial-gradient(ellipse at 50% 50%, ${c}55, transparent 60%), linear-gradient(115deg, transparent 47%, ${c} 49%, #fff 50%, ${c} 51%, transparent 53%)`;
    return;
  }
  const key = `${item.cat}:${item.id}:${base.tone}:${base.hair}:${item.cat === 'head' || item.cat === 'back' ? base.outfit : ''}`;
  thumbs.get(key, (cam) => {
    if (item.cat === 'wskin') {
      const m = weaponMesh('mistral', item.id);
      m.rotation.set(0.15, Math.PI / 2 + 0.35, 0);
      cam.position.set(0, 0.06, 1.25); cam.lookAt(0, 0.0, 0);
      const g = new THREE.Group(); m.position.set(-0.07, -0.02, 0); g.add(m); return g;
    }
    const cos = { ...base, head: 'none', back: 'none', [item.cat]: item.id };
    if (item.cat === 'head') cos.outfit = base.outfit;
    const ch = new Character(cos);
    ch.setWeapon(item.cat === 'outfit' ? 'p9' : null);
    ch.update(0.016, { speed: 0, moveAng: 0, pitch: 0, crouch: false, air: false, glide: false, ads: false, sprint: false, reload: false, dead: false });
    ch.root.updateMatrixWorld(true);
    // le personnage regarde vers -Z : la caméra se place devant lui (z négatif), ou derrière pour les objets portés dans le dos
    if (item.cat === 'outfit') { ch.root.rotation.y = -0.45; cam.position.set(0, 1.0, -4.4); cam.lookAt(0, 0.92, 0); }
    else if (item.cat === 'head') { ch.root.rotation.y = -0.5; cam.position.set(0, 1.68, -1.25); cam.lookAt(0, 1.6, 0); }
    else { ch.root.rotation.y = 0.6; cam.position.set(0, 1.35, 2.6); cam.lookAt(0, 1.2, 0); }
    return ch.root;
  }, (url) => { img.style.backgroundImage = `url(${url})`; });
}

export function openShop(app, root) {
  const P = app.profile;
  let cat = 'outfit', sel = P.cos.outfit;
  root.innerHTML = `
    <div class="shop">
      <div class="tabs">${CATS.map((c) => `<button data-cat="${c.id}">${c.name}</button>`).join('')}<button data-cat="look">Apparence</button></div>
      <div class="grid"></div>
      <div class="detail"></div>
    </div>`;
  const grid = root.querySelector('.grid'), det = root.querySelector('.detail');

  const preview = () => {
    if (cat === 'look') { app.menu.setCos(P.cos); app.menu.frame(1, true); return; }
    const cos = { ...P.cos, [cat]: sel };
    app.menu.setCos(cos, cat === 'wskin' ? 'mistral' : undefined);
    app.menu.frame(1, cat === 'head');
  };

  const detail = () => {
    if (cat === 'look') { det.innerHTML = '<h3>Apparence</h3><p>Choisissez la couleur de peau et de cheveux de votre personnage. Gratuit.</p>'; return; }
    const it = getItem(cat, sel), R = RARITY[it.r], own = P.owns(cat, it.id), eq = P.cos[cat] === it.id;
    const CN = CATS.find((c) => c.id === cat).one;
    let btn;
    if (eq) btn = '<button class="btn" disabled>Équipé</button>';
    else if (own) btn = '<button class="btn primary" data-act="equip">Équiper</button>';
    else if (P.credits >= it.p) btn = `<button class="btn primary" data-act="buy">Acheter — ${it.p} ¢</button>`;
    else btn = `<button class="btn" disabled>Il manque ${it.p - P.credits} ¢</button>`;
    det.innerHTML = `<div class="rar" style="--rc:${R.color}">${R.name} · ${CN}</div><h3>${esc(it.name)}</h3><p>${esc(it.desc || (cat === 'tracer' ? 'Couleur des balles traçantes de vos armes.' : cat === 'wskin' ? 'Peinture appliquée à toutes vos armes.' : ''))}</p>${btn}`;
    const b = det.querySelector('[data-act]');
    if (b) b.onclick = () => {
      app.sound.click();
      if (b.dataset.act === 'buy') { if (P.buy(it)) { P.equip(cat, it.id); app.toast(`${it.name} acheté et équipé`); } }
      else P.equip(cat, it.id);
      app.syncCos(); app.updateTop(); draw();
    };
  };

  const draw = () => {
    root.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.cat === cat));
    if (cat === 'look') {
      grid.innerHTML = `<div class="look"><h4>Peau</h4><div class="sw">${SKIN_TONES.map((c, i) => `<button data-tone="${i}" class="${P.cos.tone === i ? 'on' : ''}" style="background:${hexc(c)}"></button>`).join('')}</div>
        <h4>Cheveux et sourcils</h4><div class="sw">${HAIR.map((c, i) => `<button data-hair="${i}" class="${P.cos.hair === i ? 'on' : ''}" style="background:${hexc(c)}"></button>`).join('')}</div></div>`;
      grid.querySelectorAll('[data-tone]').forEach((b) => (b.onclick = () => { P.cos.tone = +b.dataset.tone; P.save(); app.syncCos(); draw(); preview(); }));
      grid.querySelectorAll('[data-hair]').forEach((b) => (b.onclick = () => { P.cos.hair = +b.dataset.hair; P.save(); app.syncCos(); draw(); preview(); }));
      detail();
      return;
    }
    grid.innerHTML = byCat[cat].map((it) => {
      const R = RARITY[it.r], own = P.owns(cat, it.id), eq = P.cos[cat] === it.id;
      return `<button class="card${it.id === sel ? ' sel' : ''}${eq ? ' eq' : ''}" data-id="${it.id}" style="--rc:${R.color}">
        <div class="img"></div><b>${esc(it.name)}</b><span>${eq ? '✔ Équipé' : own ? 'Possédé' : it.p + ' ¢'}</span></button>`;
    }).join('');
    grid.querySelectorAll('.card').forEach((c) => {
      const it = getItem(cat, c.dataset.id);
      thumbFor(app, it, c.querySelector('.img'));
      c.onclick = () => { sel = c.dataset.id; app.sound.click(); draw(); preview(); };
    });
    detail();
  };

  root.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => {
    cat = b.dataset.cat; sel = cat === 'look' ? null : P.cos[cat]; app.sound.click(); draw(); preview();
  }));
  draw(); preview();
}
