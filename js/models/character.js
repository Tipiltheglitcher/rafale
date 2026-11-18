// Personnage : squelette articulé, pièces modélisées par code selon l'apparence choisie, animation procédurale
// (marche, course, accroupi, saut, parachutage, visée avec IK des deux bras sur l'arme).
import * as THREE from 'three';
import { clamp, lerp, lerpAngle } from '../core/util.js';
import { Geo } from '../engine/geo.js';
import { getItem, SKIN_TONES, HAIR } from '../data/cosmetics.js';
import { shade } from '../world/mapgen.js';
import { WEAPONS } from '../data/weapons.js';
import { weaponMesh } from './weapons.js';

const H = Math.PI / 2;
export const HIP = 0.905, L1 = 0.29, L2 = 0.3;
const SH = 0.2; // demi-largeur d'épaules

let bodyMat = null, glowMat = null;
const mats = () => {
  if (!bodyMat) {
    bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.08 });
    glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  }
};

// ------------------------------------------------------------------ pièces du corps
function buildHead(g, gl, head, skin, hair, pal) {
  const dk = shade(skin, 0.72);
  const face = () => {
    g.sph(0.105, 0, 0.115, 0, skin, [0.92, 1.08, 1]); g.sph(0.08, 0, 0.065, -0.015, skin, [0.9, 0.8, 0.95]);
    g.sph(0.022, 0.098, 0.11, 0.005, skin, [0.5, 1, 0.8]); g.sph(0.022, -0.098, 0.11, 0.005, skin, [0.5, 1, 0.8]);
    g.box(0.022, 0.035, 0.03, 0, 0.1, -0.105, shade(skin, 0.92));
    for (const s of [-1, 1]) { g.box(0.028, 0.014, 0.01, s * 0.038, 0.128, -0.094, 0xf4f4f4); g.box(0.012, 0.013, 0.012, s * 0.038, 0.128, -0.098, 0x1a1a1a); g.box(0.036, 0.008, 0.012, s * 0.038, 0.149, -0.095, hair); }
    g.box(0.04, 0.006, 0.01, 0, 0.062, -0.092, dk);
  };
  const hairCap = () => { g.dome(0.112, 0, 0.125, 0.008, hair, [0.94, 0.98, 1.02]); g.box(0.2, 0.05, 0.1, 0, 0.11, 0.06, hair); };
  switch (head) {
    case 'casquette': face(); g.dome(0.114, 0, 0.135, 0, pal.c, [0.96, 0.8, 1]); g.box(0.15, 0.012, 0.1, 0, 0.152, -0.14, pal.c); g.sph(0.012, 0, 0.228, 0, pal.d); g.box(0.2, 0.04, 0.09, 0, 0.1, 0.065, hair); break;
    case 'beret': face(); hairCap(); g.sph(0.124, 0.018, 0.205, 0.005, 0x7a1e22, [1.06, 0.4, 1.06]); g.cyl(0.108, 0.108, 0.02, 0, 0.18, 0, 0x1a1a1c, null, 12); g.sph(0.012, 0.03, 0.25, 0, 0x1a1a1c); g.box(0.02, 0.02, 0.006, 0.05, 0.19, -0.105, 0xd9a520); break;
    case 'bandana': face(); hairCap(); g.cyl(0.112, 0.112, 0.036, 0, 0.168, 0, 0xb8222a, null, 12); g.box(0.03, 0.03, 0.03, 0, 0.165, 0.115, 0xb8222a); g.box(0.02, 0.09, 0.012, 0.012, 0.115, 0.125, 0xb8222a, [0.3, 0, 0.2]); g.box(0.02, 0.08, 0.012, -0.012, 0.12, 0.125, 0xa01e26, [0.4, 0, -0.2]); break;
    case 'cagoule': g.sph(0.11, 0, 0.115, 0, 0x1e2026, [0.95, 1.1, 1.02]); g.sph(0.084, 0, 0.065, -0.015, 0x1e2026, [0.9, 0.8, 0.95]); g.box(0.13, 0.034, 0.012, 0, 0.128, -0.097, skin);
      for (const s of [-1, 1]) { g.box(0.028, 0.014, 0.01, s * 0.038, 0.128, -0.1, 0xf4f4f4); g.box(0.012, 0.013, 0.012, s * 0.038, 0.128, -0.104, 0x1a1a1a); } g.cyl(0.07, 0.08, 0.05, 0, 0.0, 0, 0x1e2026, null, 10); break;
    case 'casque': face(); g.dome(0.127, 0, 0.125, 0.005, pal.c, [1, 0.94, 1.08]); g.cyl(0.13, 0.13, 0.02, 0, 0.128, 0.005, shade(pal.c, 0.8), null, 12, [1, 1, 1.08]);
      g.box(0.15, 0.042, 0.03, 0, 0.195, -0.105, 0x1a1a1c); g.box(0.058, 0.03, 0.006, 0.036, 0.195, -0.122, pal.d); g.box(0.058, 0.03, 0.006, -0.036, 0.195, -0.122, pal.d);
      for (const s of [-1, 1]) { g.box(0.03, 0.065, 0.06, s * 0.116, 0.1, 0.0, 0x1a1a1c); g.box(0.012, 0.11, 0.012, s * 0.1, 0.05, -0.03, 0x2a2a2a, [0.3, 0, 0]); }
      g.box(0.04, 0.03, 0.03, 0, 0.225, -0.115, 0x2a2a2e); g.box(0.2, 0.04, 0.08, 0, 0.09, 0.07, hair); break;
    case 'capuche': face(); g.dome(0.13, 0, 0.1, 0.018, pal.a, [1, 1.16, 1.1]); for (const s of [-1, 1]) g.box(0.03, 0.15, 0.13, s * 0.108, 0.07, 0.01, pal.a);
      g.box(0.22, 0.16, 0.05, 0, 0.07, 0.1, pal.a); g.cyl(0.1, 0.11, 0.06, 0, 0.0, 0.01, pal.a, null, 10); g.box(0.2, 0.03, 0.03, 0, 0.212, -0.085, shade(pal.a, 0.85)); break;
    case 'cowboy': face(); hairCap(); g.cyl(0.085, 0.1, 0.1, 0, 0.235, 0, 0x6a4a2c, null, 12, [1, 1, 1.1]); g.cyl(0.21, 0.21, 0.012, 0, 0.188, 0, 0x6a4a2c, null, 16, [1, 1, 1.12]);
      g.cyl(0.102, 0.102, 0.022, 0, 0.2, 0, 0x2a1e14, null, 12, [1, 1, 1.1]); g.box(0.02, 0.018, 0.006, 0, 0.2, -0.113, 0xd9a520); break;
    case 'chat': face(); hairCap(); g.torus(0.118, 0.012, 0, 0.12, 0, 0x26262a, null, [1, 1.05, 1]);
      for (const s of [-1, 1]) { g.box(0.03, 0.075, 0.07, s * 0.118, 0.1, 0, 0x26262a); gl.box(0.006, 0.05, 0.045, s * 0.135, 0.1, 0, 0xff7ad0); g.cone(0.038, 0.075, s * 0.07, 0.262, 0, 0x26262a, [0, 0, -s * 0.2], 4); gl.cone(0.022, 0.045, s * 0.07, 0.258, -0.014, 0xff7ad0, [0, 0, -s * 0.2], 4); }
      g.box(0.008, 0.008, 0.1, 0.1, 0.06, -0.06, 0x26262a, [0.3, 0.3, 0]); g.sph(0.014, 0.075, 0.048, -0.105, 0x26262a); break;
    case 'gaz': g.sph(0.11, 0, 0.115, 0, 0x2a2e2a, [0.95, 1.1, 1.02]); g.sph(0.086, 0, 0.065, -0.015, 0x2a2e2a, [0.9, 0.8, 0.95]);
      for (const s of [-1, 1]) { g.tube(0.034, 0.034, 0.02, s * 0.042, 0.128, -0.098, 0x16181a, 10); gl.tube(0.026, 0.026, 0.006, s * 0.042, 0.128, -0.109, 0x9fe8c0, 10); g.tube(0.03, 0.03, 0.05, s * 0.07, 0.05, -0.085, 0x4a4e4a, 8); }
      g.tube(0.036, 0.03, 0.07, 0, 0.055, -0.115, 0x16181a, 8); g.tube(0.04, 0.04, 0.012, 0, 0.055, -0.155, 0x6a6e6a, 8);
      g.box(0.24, 0.02, 0.02, 0, 0.16, 0.02, 0x16181a); g.cyl(0.07, 0.08, 0.05, 0, 0.0, 0, 0x2a2e2a, null, 10); break;
    case 'pilote': g.sph(0.08, 0, 0.065, -0.015, skin, [0.9, 0.8, 0.95]); g.sph(0.127, 0, 0.125, 0.005, 0xe8ecf0, [1, 1.02, 1.08]);
      gl.sph(0.1, 0, 0.128, -0.05, 0xd9a520, [0.98, 0.52, 0.82]); g.box(0.08, 0.06, 0.05, 0, 0.055, -0.1, 0x2a2e34); g.tube(0.018, 0.018, 0.05, 0, 0.04, -0.13, 0x16181a, 8);
      g.box(0.016, 0.014, 0.25, 0, 0.255, 0.005, 0xb8222a); for (const s of [-1, 1]) g.box(0.02, 0.05, 0.05, s * 0.125, 0.11, 0.01, 0x2a2e34);
      g.cyl(0.012, 0.012, 0.12, 0.03, -0.02, -0.11, 0x16181a, [0.3, 0, 0.2], 6); break;
    case 'crete': face(); g.dome(0.108, 0, 0.125, 0.008, shade(skin, 0.85), [0.94, 0.9, 1.02]);
      for (let i = 0; i < 7; i++) gl.box(0.018, 0.06 + Math.sin((i / 6) * 3.14) * 0.06, 0.036, 0, 0.235 + Math.sin((i / 6) * 3.14) * 0.03 - i * 0.004, -0.085 + i * 0.032, pal.glow || 0x05d9e8, [-0.5 + i * 0.16, 0, 0]); break;
    case 'lourd': g.sph(0.132, 0, 0.118, 0, pal.c, [1, 1.08, 1.1]); gl.box(0.16, 0.034, 0.02, 0, 0.128, -0.132, pal.glow || pal.d); g.box(0.18, 0.012, 0.03, 0, 0.152, -0.13, shade(pal.c, 0.7));
      g.box(0.11, 0.07, 0.05, 0, 0.05, -0.115, shade(pal.c, 0.8)); for (const s of [-1, 1]) { g.cyl(0.03, 0.03, 0.03, s * 0.132, 0.1, 0, shade(pal.c, 0.7), [0, 0, H], 8); g.box(0.01, 0.04, 0.02, s * 0.04, 0.05, -0.142, 0x16181a); }
      g.box(0.02, 0.05, 0.22, 0, 0.255, 0.0, pal.d); g.cyl(0.09, 0.1, 0.05, 0, 0.0, 0, 0x16181a, null, 10); break;
    case 'oni': face(); hairCap(); g.box(0.15, 0.13, 0.03, 0, 0.1, -0.103, 0xb8222a); g.box(0.16, 0.03, 0.035, 0, 0.158, -0.104, 0x8a1a1e);
      for (const s of [-1, 1]) { gl.box(0.034, 0.014, 0.008, s * 0.038, 0.128, -0.12, 0xffd040); g.cone(0.022, 0.12, s * 0.065, 0.24, -0.07, 0xf2ead8, [-0.3, 0, -s * 0.3], 6); g.cone(0.008, 0.03, s * 0.03, 0.048, -0.118, 0xf2ead8, [3.14, 0, 0], 4); }
      g.box(0.07, 0.014, 0.01, 0, 0.062, -0.12, 0x1a1a1a); g.box(0.03, 0.04, 0.03, 0, 0.095, -0.125, 0x9a1c22); break;
    case 'halo': face(); hairCap(); gl.torus(0.095, 0.012, 0, 0.33, 0, 0xfff0a0, [H, 0, 0]); break;
    case 'couronne': face(); hairCap(); g.cyl(0.103, 0.1, 0.05, 0, 0.215, 0, 0xe0aa20, null, 12);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; g.cone(0.022, 0.07, Math.cos(a) * 0.098, 0.27, Math.sin(a) * 0.098, 0xf2c84a, null, 4); gl.sph(0.011, Math.cos(a) * 0.105, 0.215, Math.sin(a) * 0.105, i % 2 ? 0xff3a5a : 0x3ad0ff); } break;
    default: face(); hairCap(); g.box(0.02, 0.05, 0.03, 0.098, 0.125, -0.03, hair); g.box(0.02, 0.05, 0.03, -0.098, 0.125, -0.03, hair);
  }
}

function buildChest(g, gl, o, back, skin) {
  const P = o.pal, a = P.a, c = P.c, d = P.d;
  g.cyl(0.185, 0.15, 0.34, 0, 0.17, 0, a, null, 12, [1, 1, 0.66]);
  g.sph(0.1, 0.17, 0.3, 0, a, [1, 0.8, 0.9]); g.sph(0.1, -0.17, 0.3, 0, a, [1, 0.8, 0.9]);
  g.cyl(0.048, 0.055, 0.1, 0, 0.39, 0, skin, null, 8); g.cyl(0.075, 0.088, 0.05, 0, 0.345, 0, shade(a, 0.82), null, 10);
  if (o.suit) {
    g.box(0.09, 0.22, 0.012, 0, 0.22, -0.122, c); g.box(0.03, 0.19, 0.014, 0, 0.2, -0.128, d); g.box(0.04, 0.035, 0.016, 0, 0.305, -0.126, d);
    g.box(0.05, 0.2, 0.014, 0.065, 0.22, -0.122, shade(a, 1.25), [0, 0, 0.18]); g.box(0.05, 0.2, 0.014, -0.065, 0.22, -0.122, shade(a, 1.25), [0, 0, -0.18]);
    g.sph(0.01, 0.02, 0.07, -0.118, 0x3a3a3a); g.box(0.05, 0.012, 0.01, -0.09, 0.25, -0.118, 0xf2f2f2);
  } else if (o.armor >= 1) {
    g.box(0.27, 0.25, 0.06, 0, 0.17, -0.105, c); g.box(0.27, 0.27, 0.05, 0, 0.18, 0.105, c); g.box(0.33, 0.1, 0.2, 0, 0.07, 0, shade(c, 0.9));
    g.box(0.05, 0.04, 0.24, 0.1, 0.325, 0, c); g.box(0.05, 0.04, 0.24, -0.1, 0.325, 0, c);
    for (let i = -1; i <= 1; i++) { g.box(0.06, 0.1, 0.035, i * 0.078, 0.085, -0.148, shade(c, 0.78)); g.box(0.062, 0.02, 0.037, i * 0.078, 0.13, -0.148, shade(c, 0.6)); }
    g.box(0.1, 0.03, 0.01, 0.06, 0.25, -0.137, d); g.box(0.05, 0.04, 0.03, -0.09, 0.25, -0.14, 0x1a1a1c);
    if (o.armor >= 2) {
      g.sph(0.088, 0.238, 0.315, 0, c, [1, 0.72, 1]); g.sph(0.088, -0.238, 0.315, 0, c, [1, 0.72, 1]);
      g.box(0.2, 0.06, 0.03, 0, 0.275, -0.142, shade(c, 1.2)); g.box(0.16, 0.07, 0.03, 0, 0.33, 0.12, shade(c, 0.8)); g.cyl(0.085, 0.095, 0.06, 0, 0.36, 0, shade(c, 0.85), null, 10);
      g.box(0.04, 0.02, 0.012, 0.238, 0.36, 0, d); g.box(0.04, 0.02, 0.012, -0.238, 0.36, 0, d);
    }
  } else {
    g.box(0.012, 0.3, 0.012, 0, 0.17, -0.125, d); g.box(0.09, 0.07, 0.02, 0.075, 0.07, -0.118, shade(a, 0.86)); g.box(0.09, 0.07, 0.02, -0.075, 0.07, -0.118, shade(a, 0.86));
    g.box(0.3, 0.26, 0.03, 0, 0.19, -0.1, c, [0, 0, 0]); g.box(0.3, 0.26, 0.03, 0, 0.19, 0.1, c); g.box(0.26, 0.03, 0.035, 0, 0.14, -0.103, d); g.box(0.26, 0.03, 0.035, 0, 0.14, 0.103, d);
  }
  if (o.glow) {
    gl.box(0.02, 0.2, 0.012, 0.07, 0.19, -0.14, o.glow); gl.box(0.02, 0.2, 0.012, -0.07, 0.19, -0.14, o.glow); gl.box(0.16, 0.02, 0.012, 0, 0.07, -0.14, o.glow);
    gl.box(0.02, 0.22, 0.012, 0, 0.19, 0.134, o.glow); gl.box(0.012, 0.03, 0.2, 0.19, 0.3, 0, o.glow); gl.box(0.012, 0.03, 0.2, -0.19, 0.3, 0, o.glow);
  }
  switch (back) {
    case 'sac': g.box(0.25, 0.3, 0.13, 0, 0.17, 0.195, shade(c, 0.85)); g.box(0.26, 0.07, 0.14, 0, 0.3, 0.195, shade(c, 0.7)); g.box(0.07, 0.12, 0.05, 0.13, 0.12, 0.2, shade(c, 0.75)); g.box(0.07, 0.12, 0.05, -0.13, 0.12, 0.2, shade(c, 0.75));
      g.cyl(0.048, 0.048, 0.27, 0, 0.375, 0.19, d, [0, 0, H], 8); g.box(0.14, 0.1, 0.04, 0, 0.12, 0.27, shade(c, 0.7)); break;
    case 'radio': g.box(0.2, 0.25, 0.1, 0, 0.18, 0.18, 0x3a4034); g.box(0.16, 0.05, 0.012, 0, 0.26, 0.232, 0x1a1a1a); g.cyl(0.006, 0.004, 0.56, 0.075, 0.58, 0.19, 0x1a1a1a, null, 5);
      g.cyl(0.014, 0.014, 0.02, -0.06, 0.315, 0.19, 0x8a8a8a, null, 6); gl.box(0.02, 0.012, 0.006, 0.05, 0.2, 0.232, 0x39ff14); break;
    case 'bouclier': g.tube(0.21, 0.21, 0.028, 0, 0.18, 0.165, 0x7a8088, 14); g.tube(0.22, 0.22, 0.012, 0, 0.18, 0.17, d, 14); g.sph(0.05, 0, 0.18, 0.185, 0xb8c0c8, [1, 1, 0.5]);
      for (let i = 0; i < 6; i++) { const an = (i / 6) * 6.283; g.sph(0.012, Math.cos(an) * 0.16, 0.18 + Math.sin(an) * 0.16, 0.182, 0xb8c0c8); } break;
    case 'katana': g.box(0.03, 0.62, 0.022, 0, 0.2, 0.15, 0x1a1a1e, [0, 0, 0.6]); g.box(0.028, 0.17, 0.028, -0.222, 0.525, 0.15, 0x2a2a2e, [0, 0, 0.6]); g.box(0.07, 0.014, 0.05, -0.172, 0.455, 0.15, 0xd9a520, [0, 0, 0.6]);
      for (let i = 0; i < 4; i++) g.box(0.032, 0.012, 0.032, -0.19 - i * 0.02, 0.48 + i * 0.028, 0.15, d, [0, 0, 0.6]); g.box(0.036, 0.03, 0.03, 0.17, -0.05, 0.15, 0xd9a520, [0, 0, 0.6]); break;
    case 'cape': g.box(0.36, 0.64, 0.02, 0, -0.03, 0.17, d, [0.14, 0, 0]); g.box(0.34, 0.06, 0.06, 0, 0.32, 0.11, shade(d, 0.8)); g.sph(0.022, 0.12, 0.33, -0.1, 0xd9a520); g.sph(0.022, -0.12, 0.33, -0.1, 0xd9a520); break;
    case 'jetpack': for (const s of [-1, 1]) { g.cyl(0.062, 0.062, 0.3, s * 0.085, 0.18, 0.195, 0x8a9098, null, 10); g.dome(0.062, s * 0.085, 0.33, 0.195, 0xb8c0c8); g.cyl(0.04, 0.062, 0.07, s * 0.085, 0.0, 0.195, 0x3a3e44, null, 10); gl.cyl(0.036, 0.02, 0.03, s * 0.085, -0.045, 0.195, 0x4ad8ff, null, 8); }
      g.box(0.1, 0.2, 0.08, 0, 0.2, 0.17, 0x3a3e44); g.box(0.26, 0.03, 0.03, 0, 0.26, 0.15, d); break;
    case 'ailes': g.box(0.12, 0.2, 0.07, 0, 0.2, 0.16, 0x3a3e44);
      for (const s of [-1, 1]) { g.box(0.52, 0.075, 0.02, s * 0.33, 0.33, 0.2, 0x9aa2aa, [0, 0, s * 0.5]); g.box(0.42, 0.065, 0.02, s * 0.3, 0.17, 0.2, 0x8a929a, [0, 0, s * 0.12]); g.box(0.34, 0.055, 0.02, s * 0.25, 0.03, 0.2, 0x7a828a, [0, 0, -s * 0.3]);
        gl.box(0.5, 0.012, 0.022, s * 0.345, 0.3, 0.2, o.glow || d, [0, 0, s * 0.5]); gl.box(0.4, 0.012, 0.022, s * 0.3, 0.138, 0.2, o.glow || d, [0, 0, s * 0.12]); } break;
  }
}

function buildHips(g, o) {
  const P = o.pal;
  g.cyl(0.15, 0.14, 0.16, 0, -0.02, 0, P.b, null, 12, [1, 1, 0.68]); g.cyl(0.15, 0.147, 0.15, 0, 0.125, 0, P.a, null, 12, [1, 1, 0.66]);
  g.cyl(0.158, 0.158, 0.045, 0, 0.045, 0, 0x1e1c1a, null, 12, [1, 1, 0.7]); g.box(0.045, 0.036, 0.012, 0, 0.045, -0.112, P.d);
  if (o.suit) { g.cyl(0.16, 0.165, 0.1, 0, 0.0, 0, P.a, null, 12, [1, 1, 0.7]); return; }
  g.box(0.06, 0.075, 0.045, 0.135, 0.0, -0.03, shade(P.c, 0.8)); g.box(0.06, 0.075, 0.045, -0.135, 0.0, -0.03, shade(P.c, 0.8)); g.box(0.09, 0.07, 0.05, 0, 0.0, 0.1, shade(P.c, 0.8));
  if (o.armor >= 2) { g.box(0.1, 0.12, 0.02, 0, -0.07, -0.105, P.c); g.box(0.07, 0.1, 0.02, 0.15, -0.06, 0, P.c, [0, H, 0]); g.box(0.07, 0.1, 0.02, -0.15, -0.06, 0, P.c, [0, H, 0]); }
}

function buildLimbs(o, skin) {
  const P = o.pal, armU = new Geo(), armF = new Geo(), thigh = new Geo(), shin = new Geo(), glow = new Geo();
  armU.cap(0.053, 0.2, 0, -0.145, 0, P.a);
  if (o.armor >= 2) armU.cyl(0.06, 0.056, 0.1, 0, -0.14, 0, P.c, null, 8);
  if (o.glow) glow.cyl(0.056, 0.056, 0.014, 0, -0.2, 0, o.glow, null, 8);
  armF.cap(0.046, 0.18, 0, -0.125, 0, P.a);
  if (o.armor >= 1) armF.cyl(0.054, 0.05, 0.11, 0, -0.14, 0, P.c, null, 8);
  if (o.suit) armF.cyl(0.049, 0.049, 0.02, 0, -0.218, 0, P.c, null, 8);
  armF.cyl(0.05, 0.046, 0.05, 0, -0.245, 0, P.gloves, null, 8); armF.sph(0.046, 0, -0.3, 0, P.gloves, [0.88, 1.12, 0.88]);
  thigh.cap(0.073, 0.3, 0, -0.2, 0, P.b, null, [1, 1, 0.95]); thigh.cyl(0.078, 0.076, 0.03, 0, -0.14, 0, 0x1e1c1a, null, 8);
  if (o.armor >= 1) thigh.sph(0.062, 0, -0.425, -0.03, P.c, [0.9, 1, 0.7]);
  if (o.armor >= 2) thigh.box(0.11, 0.16, 0.03, 0, -0.2, -0.065, P.c);
  shin.cap(0.058, 0.26, 0, -0.2, 0, P.b); shin.cyl(0.067, 0.063, 0.17, 0, -0.33, 0, P.boots, null, 8);
  shin.box(0.105, 0.09, 0.25, 0, -0.412, -0.045, P.boots); shin.box(0.112, 0.026, 0.262, 0, -0.452, -0.045, 0x121214); shin.sph(0.052, 0, -0.4, -0.15, P.boots, [1, 0.8, 0.9]);
  if (o.armor >= 2) shin.box(0.09, 0.2, 0.03, 0, -0.2, -0.055, P.c);
  return { armU, armF, thigh, shin, glow };
}

const partCache = new Map();
function getParts(cos) {
  const key = `${cos.outfit}|${cos.head}|${cos.back}|${cos.tone}|${cos.hair}`;
  let p = partCache.get(key);
  if (p) return p;
  const o = getItem('outfit', cos.outfit), skin = SKIN_TONES[cos.tone] ?? SKIN_TONES[1], hair = HAIR[cos.hair] ?? HAIR[0];
  const head = new Geo(), headG = new Geo(), chest = new Geo(), chestG = new Geo(), hips = new Geo();
  buildHead(head, headG, cos.head, skin, hair, { ...o.pal, glow: o.glow });
  buildChest(chest, chestG, o, cos.back, skin);
  buildHips(hips, o);
  const L = buildLimbs(o, skin);
  const b = (g) => (g.empty ? null : g.build());
  p = { head: b(head), headG: b(headG), chest: b(chest), chestG: b(chestG), hips: b(hips), armU: b(L.armU), armF: b(L.armF), thigh: b(L.thigh), shin: b(L.shin), armG: b(L.glow) };
  partCache.set(key, p);
  return p;
}

/** Avant-bras + gant de la tenue (bras de la vue à la première personne). */
export function armGeometry(cos) { return getParts(cos).armF; }
export function bodyMaterial() { mats(); return bodyMat; }

// ------------------------------------------------------------------ IK à deux os
const _d = new THREE.Vector3(), _ax = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3(), _el = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), DOWN = new THREE.Vector3(0, -1, 0);
function solveArm(upper, fore, S, T, pole) {
  _d.subVectors(T, S);
  const d = clamp(_d.length(), 0.08, L1 + L2 - 0.004);
  _d.normalize();
  const A = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  _ax.crossVectors(_d, pole);
  if (_ax.lengthSq() < 1e-6) _ax.set(1, 0, 0);
  _ax.normalize();
  _u.copy(_d).applyAxisAngle(_ax, A);
  _el.copy(_u).multiplyScalar(L1).add(S);
  _f.copy(_d).multiplyScalar(d).add(S).sub(_el).normalize();
  upper.quaternion.setFromUnitVectors(DOWN, _u);
  _qa.copy(upper.quaternion).invert();
  _qb.setFromUnitVectors(DOWN, _f);
  fore.quaternion.multiplyQuaternions(_qa, _qb);
}

const POSE = {
  aim: { p: [0.12, 0.2, -0.2], r: [0, 0, 0] },
  ads: { p: [0.07, 0.3, -0.22], r: [0, 0, 0] },
  run: { p: [0.1, 0.1, -0.2], r: [-0.4, 0.75, 0] },
  reload: { p: [0.1, 0.2, -0.22], r: [0.5, 0.2, 0.35] },
  pAim: { p: [0.03, 0.25, -0.36], r: [0, 0, 0] },
  pAds: { p: [0.0, 0.33, -0.4], r: [0, 0, 0] },
  pRun: { p: [0.14, 0.02, -0.14], r: [-1.2, 0, 0] },
  pReload: { p: [0.06, 0.24, -0.26], r: [0.6, 0.3, 0.3] },
};
const SR = new THREE.Vector3(SH, 0.3, 0), SL = new THREE.Vector3(-SH, 0.3, 0);
const POLE_R = new THREE.Vector3(0.5, -1, 0.3).normalize(), POLE_L = new THREE.Vector3(-0.7, -0.8, 0.2).normalize();
const _t = new THREE.Vector3(), _e = new THREE.Euler(), _qt = new THREE.Quaternion();

export class Character {
  constructor(cos) {
    mats();
    this.cos = cos;
    this.root = new THREE.Group();
    this.tilt = new THREE.Group(); this.root.add(this.tilt);
    const P = getParts(cos);
    const mesh = (geo, parent, glow) => {
      if (!geo) return null;
      const m = new THREE.Mesh(geo, glow ? glowMat : bodyMat);
      m.castShadow = !glow; m.receiveShadow = false;
      parent.add(m);
      return m;
    };
    const grp = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
    this.hips = grp(this.tilt, 0, HIP, 0); mesh(P.hips, this.hips);
    this.spine = grp(this.hips, 0, 0, 0);
    this.chest = grp(this.spine, 0, 0.22, 0); mesh(P.chest, this.chest); mesh(P.chestG, this.chest, true);
    this.head = grp(this.chest, 0, 0.4, 0); mesh(P.head, this.head); mesh(P.headG, this.head, true);
    this.armR = grp(this.chest, SH, 0.3, 0); mesh(P.armU, this.armR); mesh(P.armG, this.armR, true);
    this.foreR = grp(this.armR, 0, -L1, 0); mesh(P.armF, this.foreR);
    this.armL = grp(this.chest, -SH, 0.3, 0); mesh(P.armU, this.armL); mesh(P.armG, this.armL, true);
    this.foreL = grp(this.armL, 0, -L1, 0); mesh(P.armF, this.foreL);
    this.legR = grp(this.hips, 0.1, 0, 0); mesh(P.thigh, this.legR);
    this.shinR = grp(this.legR, 0, -0.44, 0); mesh(P.shin, this.shinR);
    this.legL = grp(this.hips, -0.1, 0, 0); mesh(P.thigh, this.legL);
    this.shinL = grp(this.legL, 0, -0.44, 0); mesh(P.shin, this.shinL);
    this.mount = grp(this.chest, 0.12, 0.2, -0.2);
    this.weapon = null; this.wid = null; this.pistol = false;
    this.phase = Math.random() * 6; this.sp = 0; this.legYaw = 0; this.crouchT = 0; this.airT = 0; this.glideT = 0; this.deadT = 0; this.kick = 0;
    this.pp = new THREE.Vector3(0.12, 0.2, -0.2); this.pq = new THREE.Quaternion(); this.relT = 0;
    this.leftOff = new THREE.Vector3(0, 0, -0.25);
  }

  setWeapon(id) {
    if (id === this.wid) return;
    this.wid = id;
    if (this.weapon) { this.mount.remove(this.weapon); this.weapon = null; }
    if (!id) return;
    this.weapon = weaponMesh(id, this.cos.wskin);
    this.mount.add(this.weapon);
    this.pistol = WEAPONS[id].cls === 'pistol' || !!WEAPONS[id].one;
    this.leftOff.copy(this.weapon.userData.model.left);
  }

  /** Position monde de la bouche du canon. */
  muzzle(out) {
    if (!this.weapon) return this.chest.getWorldPosition(out);
    return this.weapon.localToWorld(out.copy(this.weapon.userData.model.muzzle));
  }

  fire() { this.kick = 1; }

  /**
   * s = { speed, moveAng, pitch, crouch, air, glide, ads, sprint, reload, dead }
   * moveAng : angle du déplacement par rapport au regard (0 = vers l'avant).
   */
  update(dt, s) {
    const k = 1 - Math.exp(-12 * dt), k2 = 1 - Math.exp(-8 * dt);
    this.sp = lerp(this.sp, s.speed, k);
    const amp = clamp(this.sp / 6.2, 0, 1);
    const back = Math.abs(s.moveAng) > 1.75;
    const wantYaw = amp > 0.12 ? clamp(back ? s.moveAng - Math.sign(s.moveAng) * Math.PI : s.moveAng, -0.9, 0.9) : 0;
    this.legYaw = lerpAngle(this.legYaw, wantYaw, k2);
    this.phase += (back ? -1 : 1) * this.sp * dt * 2.15;
    this.crouchT = lerp(this.crouchT, s.crouch ? 1 : 0, k);
    this.airT = lerp(this.airT, s.air && !s.glide ? 1 : 0, k);
    this.glideT = lerp(this.glideT, s.glide ? 1 : 0, k2);
    this.deadT = s.dead ? Math.min(1, this.deadT + dt * 2.6) : 0;
    this.kick = Math.max(0, this.kick - dt * 9);
    const cT = this.crouchT, aT = this.airT, gT = this.glideT, ph = this.phase;

    this.tilt.rotation.x = -1.5 * this.deadT - 1.15 * gT;
    this.tilt.position.y = gT * 0.5 + this.deadT * 0.12;
    this.hips.position.y = HIP - cT * 0.3 + Math.abs(Math.sin(ph)) * 0.035 * amp;
    this.hips.rotation.y = this.legYaw;
    this.hips.rotation.z = Math.sin(ph) * 0.04 * amp;
    const pitch = s.dead ? 0 : s.pitch;
    this.spine.rotation.set(pitch * 0.45 - cT * 0.22 - (s.sprint ? 0.14 : 0) * amp + gT * 0.5, -this.legYaw, -this.hips.rotation.z);
    this.chest.rotation.x = pitch * 0.55 + cT * 0.22;
    this.chest.rotation.y = Math.sin(ph) * 0.05 * amp;
    this.head.rotation.x = -cT * 0.05 + gT * 0.5;

    const leg = (thigh, shin, off, side) => {
      const sw = Math.sin(ph + off) * 0.85 * amp, bend = (0.15 + 0.95 * Math.max(0, Math.cos(ph + off))) * amp;
      thigh.rotation.x = sw * (1 - cT * 0.45) * (1 - gT) + cT * 1.05 + aT * (side ? 0.5 : 0.15) - gT * (0.25 + side * 0.2);
      shin.rotation.x = -(bend * (1 - gT) + cT * 1.75 + aT * (side ? 0.9 : 0.4) + gT * (0.5 - side * 0.3));
    };
    leg(this.legL, this.shinL, 0, 0); leg(this.legR, this.shinR, Math.PI, 1);

    // pose de l'arme puis IK des bras
    const pre = this.pistol ? 'p' : '';
    const cap = (n) => (pre ? pre + n[0].toUpperCase() + n.slice(1) : n);
    const pose = s.reload ? POSE[cap('reload')] : s.ads ? POSE[cap('ads')] : s.sprint && amp > 0.8 && this.kick < 0.05 ? POSE[cap('run')] : POSE[cap('aim')];
    this.pp.lerp(_t.set(pose.p[0], pose.p[1], pose.p[2]), k);
    this.pq.slerp(_qt.setFromEuler(_e.set(pose.r[0], pose.r[1], pose.r[2])), k);
    this.mount.position.copy(this.pp); this.mount.position.z += this.kick * 0.035; this.mount.position.y += Math.sin(ph * 2) * 0.006 * amp;
    this.mount.quaternion.copy(this.pq);
    if (this.kick > 0) this.mount.rotateX(this.kick * 0.07);
    this.relT = s.reload ? this.relT + dt : 0;

    _t.set(0, -0.035, 0.012).applyQuaternion(this.mount.quaternion).add(this.mount.position);
    solveArm(this.armR, this.foreR, SR, _t, POLE_R);
    _t.copy(this.leftOff);
    if (s.reload) { const w = Math.sin(this.relT * 5); _t.set(0, -0.12 - Math.max(0, w) * 0.1, -0.08); }
    _t.applyQuaternion(this.mount.quaternion).add(this.mount.position);
    solveArm(this.armL, this.foreL, SL, _t, POLE_L);
  }
}

/** Étiquette de nom flottante (coéquipiers). */
export function nameSprite(text, color = '#7af2a0') {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const x = cv.getContext('2d');
  x.font = '700 30px "Segoe UI", system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,.75)'; x.strokeText(text, 128, 32); x.fillStyle = color; x.fillText(text, 128, 32);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, fog: false }));
  sp.scale.set(1.5, 0.375, 1); sp.renderOrder = 10;
  return sp;
}
