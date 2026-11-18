// Réseau pair-à-pair (WebRTC via PeerJS). L'hôte fait tourner la partie dans son navigateur ;
// les autres joueurs le rejoignent avec un code à 5 caractères. Aucun serveur de jeu à payer :
// seul le serveur de mise en relation public de PeerJS sert à échanger les premières infos de connexion.
// Messages : texte = JSON, binaire = positions (voir proto.js).
const PREFIX = 'rafale-v1-';
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const makeCode = () => Array.from({ length: 5 }, () => ALPH[(Math.random() * ALPH.length) | 0]).join('');
export const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

function peerOpts(st) {
  const ice = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];
  if (st.turnUrl) ice.push({ urls: st.turnUrl.split(',').map((s) => s.trim()).filter(Boolean), username: st.turnUser || undefined, credential: st.turnPass || undefined });
  const o = { config: { iceServers: ice }, debug: 0 };
  if (st.peerHost) {
    // serveur de mise en relation personnel (ex. PeerServer déployé ailleurs)
    try {
      const u = new URL(st.peerHost.includes('://') ? st.peerHost : 'https://' + st.peerHost);
      o.host = u.hostname; o.port = Number(u.port) || (u.protocol === 'https:' ? 443 : 80); o.secure = u.protocol === 'https:'; o.path = u.pathname || '/';
    } catch { /* adresse invalide : on garde le serveur public */ }
  }
  return o;
}

const toBuf = (d) => (d instanceof ArrayBuffer ? d : ArrayBuffer.isView(d) ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : null);

function errText(err) {
  switch (err && err.type) {
    case 'peer-unavailable': return 'Aucun salon ne correspond à ce code (ou l’hôte a fermé son salon).';
    case 'network': case 'server-error': case 'socket-error': case 'socket-closed': return 'Impossible de joindre le serveur de mise en relation. Vérifiez votre connexion Internet.';
    case 'browser-incompatible': return 'Votre navigateur ne prend pas en charge WebRTC.';
    case 'webrtc': return 'La connexion directe a échoué (pare-feu ou NAT strict). Un serveur TURN peut être configuré dans Paramètres → Réseau.';
    default: return 'Erreur réseau : ' + ((err && (err.message || err.type)) || 'inconnue');
  }
}

/**
 * Ouvre un salon. server = instance de Server (simulation locale).
 * Renvoie une promesse { code, close() }.
 */
export function hostLobby(st, server, onStatus) {
  if (!window.Peer) return Promise.reject(new Error('PeerJS n’est pas chargé.'));
  return new Promise((resolve, reject) => {
    let tries = 0, done = false, peer = null;
    const links = new Map();
    const attempt = () => {
      const code = makeCode();
      peer = new window.Peer(PREFIX + code, peerOpts(st));
      peer.on('open', () => {
        done = true; server.code = code; server.pushLobby();
        resolve({ code, close: () => { for (const c of links.keys()) try { c.close(); } catch {} peer.destroy(); } });
      });
      peer.on('error', (err) => {
        if (!done && err.type === 'unavailable-id' && tries++ < 6) { peer.destroy(); attempt(); return; }
        if (!done) { peer.destroy(); reject(new Error(errText(err))); return; }
        if (err.type !== 'peer-unavailable') onStatus && onStatus(errText(err));
      });
      peer.on('disconnected', () => { if (done && !peer.destroyed) setTimeout(() => { try { peer.reconnect(); } catch {} }, 1500); });
      peer.on('connection', (conn) => {
        conn.on('open', () => {
          if (server.humans().length >= 16) { conn.send(JSON.stringify(['kick', 'Salon complet (16 joueurs maximum).'])); setTimeout(() => conn.close(), 400); return; }
          const link = {
            send: (m) => { if (conn.open) conn.send(JSON.stringify(m)); },
            sendBin: (b) => { if (conn.open && conn.dataChannel && conn.dataChannel.bufferedAmount < 262144) conn.send(b); },
          };
          const id = server.addClient(link);
          links.set(conn, id);
          conn.on('data', (d) => {
            if (typeof d === 'string') { let m; try { m = JSON.parse(d); } catch { return; } server.onMsg(id, m); }
            else { const b = toBuf(d); if (b) server.onBin(id, new DataView(b)); }
          });
          const bye = () => { if (links.has(conn)) { links.delete(conn); server.removeClient(id); } };
          conn.on('close', bye); conn.on('error', bye);
          if (conn.peerConnection) conn.peerConnection.addEventListener('connectionstatechange', () => { const s = conn.peerConnection.connectionState; if (s === 'failed' || s === 'closed') bye(); });
        });
      });
    };
    attempt();
  });
}

/** Rejoint un salon. h = { onMsg(m), onBin(DataView), onClose(reason) }. Renvoie une promesse { send, sendBin, close }. */
export function joinLobby(st, code, h) {
  if (!window.Peer) return Promise.reject(new Error('PeerJS n’est pas chargé.'));
  code = normCode(code);
  if (code.length !== 5) return Promise.reject(new Error('Le code d’un salon contient 5 caractères.'));
  return new Promise((resolve, reject) => {
    const peer = new window.Peer(undefined, peerOpts(st));
    let open = false, closed = false;
    const fail = (msg) => { if (closed) return; closed = true; clearTimeout(to); try { peer.destroy(); } catch {} if (open) h.onClose(msg); else reject(new Error(msg)); };
    const to = setTimeout(() => fail('Le salon ne répond pas. Vérifiez le code, ou l’hôte est peut-être derrière un réseau qui bloque les connexions directes.'), 15000);
    peer.on('error', (err) => fail(errText(err)));
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code, { serialization: 'raw', reliable: true });
      conn.on('open', () => {
        open = true; clearTimeout(to);
        resolve({
          send: (m) => { if (conn.open) conn.send(JSON.stringify(m)); },
          sendBin: (b) => { if (conn.open) conn.send(b); },
          close: () => { closed = true; try { conn.close(); peer.destroy(); } catch {} },
        });
      });
      conn.on('data', (d) => {
        if (typeof d === 'string') { let m; try { m = JSON.parse(d); } catch { return; } h.onMsg(m); }
        else { const b = toBuf(d); if (b) h.onBin(new DataView(b)); }
      });
      conn.on('close', () => fail('La connexion avec l’hôte a été perdue.'));
      conn.on('error', () => fail('La connexion avec l’hôte a été perdue.'));
    });
  });
}

/** Lien direct en mémoire, pour l'hôte lui-même et le mode hors-ligne. */
export function localLink(server, h) {
  const link = {
    local: true,
    send: (m) => { const s = JSON.stringify(m); queueMicrotask(() => h.onMsg(JSON.parse(s))); },
    sendBin: (b) => { const c = b.slice(0); queueMicrotask(() => h.onBin(new DataView(c))); },
  };
  const id = server.addClient(link);
  return {
    id,
    send: (m) => { const s = JSON.stringify(m); queueMicrotask(() => server.onMsg(id, JSON.parse(s))); },
    sendBin: (b) => { const c = b.slice(0); queueMicrotask(() => server.onBin(id, new DataView(c))); },
    close: () => server.removeClient(id),
  };
}

/** Horloge non bridée quand l'onglet de l'hôte passe en arrière-plan (un Worker n'est pas ralenti à 1 Hz). */
export function hostClock(fn, hz = 30) {
  const src = `let t=setInterval(()=>postMessage(0),${Math.round(1000 / hz)});onmessage=()=>{clearInterval(t);close()}`;
  let w = null;
  try { w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))); } catch { /* pas de Worker : setInterval */ }
  let last = performance.now();
  const step = () => { const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now; fn(dt); };
  if (w) { w.onmessage = step; return () => { w.postMessage(0); w.terminate(); }; }
  const t = setInterval(step, 1000 / hz);
  return () => clearInterval(t);
}
