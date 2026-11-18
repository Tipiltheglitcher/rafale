// Écran des paramètres : profil, commandes (touches réassignables), graphismes, son, viseur, réseau.
import { ACTIONS, QUALITY, DEFAULT_SETTINGS } from '../data/profile.js';
import { esc } from '../core/util.js';

export function openSettings(app, root, inGame) {
  const P = app.profile, S = P.settings;
  let tab = 'controls';
  root.innerHTML = `
    <div class="settings">
      <div class="tabs">
        <button data-t="controls">Commandes</button><button data-t="keys">Touches</button><button data-t="video">Graphismes</button>
        <button data-t="audio">Son &amp; viseur</button><button data-t="net">Réseau</button><button data-t="profile">Profil</button>
      </div>
      <div class="pane"></div>
    </div>`;
  const pane = root.querySelector('.pane');
  const save = () => { P.save(); app.applySettings(); };

  const row = (label, html, hint = '') => `<label class="row"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span>${html}</label>`;
  const range = (k, min, max, step, fmt = (v) => v) => `<div class="rng"><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${S[k]}"><output>${fmt(S[k])}</output></div>`;
  const check = (k) => `<input type="checkbox" data-k="${k}" ${S[k] ? 'checked' : ''}>`;
  const text = (k, ph, type = 'text') => `<input type="${type}" data-k="${k}" value="${esc(S[k] || '')}" placeholder="${esc(ph)}" autocomplete="off" spellcheck="false">`;

  const draw = () => {
    root.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    let h = '';
    if (tab === 'controls') {
      h = row('Sensibilité de la souris', range('sens', 0.1, 4, 0.05, (v) => (+v).toFixed(2)))
        + row('Sensibilité en visée', range('adsSens', 0.2, 2, 0.05, (v) => (+v).toFixed(2)), 'multiplicateur appliqué en visée')
        + row('Inverser l’axe vertical', check('invertY'))
        + row('Visée en mode bascule', check('toggleAds'), 'clic droit pour viser / arrêter')
        + row('Accroupi en mode bascule', check('toggleCrouch'));
    } else if (tab === 'keys') {
      h = `<p class="note">Les touches sont lues selon leur position physique : sur un clavier AZERTY, « ZQSD » fonctionne directement.</p><div class="keys">`
        + ACTIONS.map(([k, label]) => `<div class="krow"><span>${label}</span><button data-key="${k}">${esc(app.input.label(S.keys[k]))}</button></div>`).join('')
        + `</div><button class="btn small" data-act="resetkeys">Touches par défaut</button>`;
    } else if (tab === 'video') {
      h = row('Qualité graphique', `<select data-k="quality">${Object.entries(QUALITY).map(([k, q]) => `<option value="${k}" ${S.quality === k ? 'selected' : ''}>${q.name}</option>`).join('')}</select>`, inGame ? 'les ombres changent à la prochaine partie' : 'résolution, ombres et distance d’affichage')
        + row('Champ de vision', range('fov', 60, 110, 1, (v) => v + '°'))
        + row('Afficher les images par seconde', check('showFps'));
    } else if (tab === 'audio') {
      h = row('Volume général', range('volume', 0, 1, 0.01, (v) => Math.round(v * 100) + ' %'))
        + row('Couleur du viseur', `<input type="color" data-k="xhColor" value="${S.xhColor}">`)
        + row('Style du viseur', `<select data-k="xhStyle"><option value="cross" ${S.xhStyle === 'cross' ? 'selected' : ''}>Croix</option><option value="dot" ${S.xhStyle === 'dot' ? 'selected' : ''}>Point</option><option value="circle" ${S.xhStyle === 'circle' ? 'selected' : ''}>Cercle</option></select>`);
    } else if (tab === 'net') {
      h = `<p class="note">Les parties sont hébergées dans le navigateur de l’hôte et les joueurs se connectent directement entre eux (WebRTC). Sur certains réseaux (4G, réseaux d’entreprise ou d’école), la connexion directe est bloquée : il faut alors un serveur relais <b>TURN</b>. Cloudflare en propose un (Cloudflare Realtime TURN) : renseignez ici l’adresse et les identifiants obtenus. Laissez vide si tout fonctionne.</p>`
        + row('Serveur TURN', text('turnUrl', 'turn:turn.cloudflare.com:3478?transport=udp'), 'plusieurs adresses séparées par des virgules')
        + row('Identifiant TURN', text('turnUser', 'nom d’utilisateur'))
        + row('Mot de passe TURN', text('turnPass', 'identifiant secret', 'password'))
        + row('Serveur de mise en relation', text('peerHost', 'vide = serveur public PeerJS'), 'optionnel : votre propre PeerServer')
        + `<p class="note">Tous les joueurs d’un même salon doivent utiliser le même serveur de mise en relation.</p>`;
    } else if (tab === 'profile') {
      h = row('Pseudo', `<input type="text" data-name maxlength="16" value="${esc(P.name)}">`)
        + `<div class="stats"><div><b>${P.stats.matches}</b><span>parties</span></div><div><b>${P.stats.wins}</b><span>victoires</span></div><div><b>${P.stats.kills}</b><span>éliminations</span></div><div><b>${P.stats.deaths ? (P.stats.kills / P.stats.deaths).toFixed(2) : P.stats.kills}</b><span>ratio É/M</span></div></div>`
        + `<p class="note">Votre profil, vos crédits et vos objets sont enregistrés dans ce navigateur.</p><button class="btn small danger" data-act="reset">Réinitialiser le profil</button>`;
    }
    pane.innerHTML = h;
    pane.querySelectorAll('[data-k]').forEach((el) => {
      const k = el.dataset.k;
      const upd = () => {
        let v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value;
        S[k] = v;
        const out = el.parentElement.querySelector('output');
        if (out) out.textContent = el.closest('.rng') ? fmtOut(k, v) : v;
        save();
      };
      el.addEventListener(el.type === 'range' || el.type === 'color' ? 'input' : 'change', upd);
    });
    const nm = pane.querySelector('[data-name]');
    if (nm) nm.addEventListener('change', () => { const v = nm.value.replace(/[<>&"']/g, '').trim().slice(0, 16); if (v) { P.name = v; P.save(); app.syncCos(); app.updateTop(); } nm.value = P.name; });
    pane.querySelectorAll('[data-key]').forEach((b) => (b.onclick = () => {
      b.textContent = 'Appuyez sur une touche… (Échap : annuler)'; b.classList.add('wait');
      app.input.onKey = (e) => {
        e.preventDefault();
        app.input.onKey = null;
        if (e.code !== 'Escape') {
          for (const a in S.keys) if (S.keys[a] === e.code && a !== b.dataset.key) S.keys[a] = S.keys[b.dataset.key];
          S.keys[b.dataset.key] = e.code; save();
        }
        draw();
        return true;
      };
    }));
    const act = (n, fn) => { const b = pane.querySelector(`[data-act="${n}"]`); if (b) b.onclick = fn; };
    act('resetkeys', () => { S.keys = { ...DEFAULT_SETTINGS.keys }; save(); draw(); });
    act('reset', () => { if (confirm('Effacer le profil (crédits, objets, statistiques, paramètres) ?')) { P.reset(); location.reload(); } });
  };
  const fmtOut = (k, v) => (k === 'fov' ? v + '°' : k === 'volume' ? Math.round(v * 100) + ' %' : (+v).toFixed(2));
  root.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => { tab = b.dataset.t; app.sound.click(); draw(); }));
  draw();
}
