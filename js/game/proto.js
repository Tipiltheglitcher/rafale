// Protocole binaire compact pour les données envoyées en continu (positions) ; le reste passe en JSON.
export const VERSION = 1;
export const F = { CROUCH: 1, ADS: 2, GROUND: 4, GLIDE: 8, RELOAD: 16, SPRINT: 32, USE: 64 };

const wrap = (a) => { a %= 6.283185; if (a > 3.141593) a -= 6.283185; if (a < -3.141593) a += 6.283185; return a; };
const i16 = (v) => Math.max(-32767, Math.min(32767, Math.round(v)));

/** Instantané hôte → clients : 13 octets par joueur vivant. */
export function encodeSnap(tMs, ents) {
  const n = ents.length, buf = new ArrayBuffer(6 + n * 13), dv = new DataView(buf);
  dv.setUint8(0, 1); dv.setUint32(1, tMs >>> 0, true); dv.setUint8(5, n);
  let o = 6;
  for (const e of ents) {
    dv.setUint8(o, e.id); dv.setUint8(o + 1, e.fl); dv.setUint8(o + 2, e.widx);
    dv.setInt16(o + 3, i16(e.x * 50), true); dv.setInt16(o + 5, i16(e.y * 50), true); dv.setInt16(o + 7, i16(e.z * 50), true);
    dv.setInt16(o + 9, i16(wrap(e.yaw) * 10000), true); dv.setInt8(o + 11, Math.max(-127, Math.min(127, Math.round(e.pitch * 80))));
    dv.setUint8(o + 12, (Math.max(0, Math.min(100, Math.ceil(e.hp))) & 127));
    o += 13;
  }
  return buf;
}

/** Les boucliers voyagent dans un second tableau pour garder 13 octets alignés par entité. */
export function encodeShields(ents) {
  const u = new Uint8Array(ents.length);
  for (let i = 0; i < ents.length; i++) u[i] = Math.max(0, Math.min(100, Math.ceil(ents[i].sh)));
  return u;
}

export function decodeSnap(dv) {
  const t = dv.getUint32(1, true), n = dv.getUint8(5), list = new Array(n);
  let o = 6;
  const hasSh = dv.byteLength >= 6 + n * 14;
  for (let i = 0; i < n; i++) {
    list[i] = {
      id: dv.getUint8(o), fl: dv.getUint8(o + 1), widx: dv.getUint8(o + 2),
      x: dv.getInt16(o + 3, true) / 50, y: dv.getInt16(o + 5, true) / 50, z: dv.getInt16(o + 7, true) / 50,
      yaw: dv.getInt16(o + 9, true) / 10000, pitch: dv.getInt8(o + 11) / 80, hp: dv.getUint8(o + 12),
      sh: hasSh ? dv.getUint8(6 + n * 13 + i) : 0,
    };
    o += 13;
  }
  return { t, list };
}

export function buildSnap(tMs, ents) {
  const a = new Uint8Array(encodeSnap(tMs, ents)), s = encodeShields(ents), out = new Uint8Array(a.length + s.length);
  out.set(a, 0); out.set(s, a.length);
  return out.buffer;
}

/** État client → hôte : 12 octets. */
export function encodeState(seq, x, y, z, yaw, pitch, fl) {
  const buf = new ArrayBuffer(12), dv = new DataView(buf);
  dv.setUint8(0, 2); dv.setUint8(1, seq & 255);
  dv.setInt16(2, i16(x * 50), true); dv.setInt16(4, i16(y * 50), true); dv.setInt16(6, i16(z * 50), true);
  dv.setInt16(8, i16(wrap(yaw) * 10000), true); dv.setInt8(10, Math.max(-127, Math.min(127, Math.round(pitch * 80)))); dv.setUint8(11, fl);
  return buf;
}

export function decodeState(dv, e) {
  e.x = dv.getInt16(2, true) / 50; e.y = dv.getInt16(4, true) / 50; e.z = dv.getInt16(6, true) / 50;
  e.yaw = dv.getInt16(8, true) / 10000; e.pitch = dv.getInt8(10) / 80; e.fl = dv.getUint8(11);
}
