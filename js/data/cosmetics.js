// Catalogue de la boutique : tenues, coiffes, équipements dorsaux, peintures d'armes, traçantes.
// r = rareté (0 commun · 1 rare · 2 épique · 3 légendaire) · p = prix en crédits (0 = offert).

export const CATS = [
  { id: 'outfit', name: 'Tenues', one: 'Tenue' },
  { id: 'head', name: 'Coiffes', one: 'Coiffe' },
  { id: 'back', name: 'Dos', one: 'Dos' },
  { id: 'wskin', name: "Peintures d'arme", one: 'Peinture' },
  { id: 'tracer', name: 'Traçantes', one: 'Traçante' },
];

export const SKIN_TONES = [0xf2c9a4, 0xe0ac7e, 0xc68a5a, 0x9a6238, 0x6e4426, 0x4a2e1a];
export const HAIR = [0x2a1e16, 0x1a1a1c, 0x6a4424, 0xc9a25a, 0x8a2a1a, 0xd8d8d8];

const O = (id, name, r, p, a, b, c, d, armor, ex = {}) => ({ ...ex, id, cat: 'outfit', name, r, p, armor, pal: { a, b, c, d, boots: 0x2a2620, gloves: 0x26262a, ...ex.pal } });
export const OUTFITS = [
  O('recrue', 'Recrue', 0, 0, 0x5a6a4a, 0x4a5040, 0x3a4034, 0xd9a520, 1, { desc: 'La tenue réglementaire. Sobre, efficace.' }),
  O('sable', 'Tempête de sable', 0, 300, 0xc9a878, 0xa88a60, 0x7a6a50, 0x4a3a2c, 1, { desc: 'Pour disparaître dans les dunes.' }),
  O('urbain', 'Coursier urbain', 0, 350, 0x6a6e78, 0x2c3440, 0xd96a1e, 0xf2f2f2, 0, { desc: 'Sweat léger et gilet haute visibilité.' }),
  O('arctique', 'Arctique', 1, 600, 0xe8edf2, 0xc8d0d8, 0x8a94a0, 0x3d9bff, 1, { desc: 'Camouflage neige des unités polaires.' }),
  O('jungle', 'Jaguar', 1, 600, 0x3a5a34, 0x2f4a2c, 0x4a3a26, 0x8ab84a, 1, { desc: 'Verts profonds pour la canopée.' }),
  O('nocturne', 'Nocturne', 1, 700, 0x1e2026, 0x16181c, 0x2a2c34, 0xd92a2a, 2, { desc: 'Blindage lourd, signature rouge.' }),
  O('mercenaire', 'Mercenaire', 1, 800, 0x6a4a30, 0x3a3a34, 0x4a4a44, 0xc9a020, 2, { desc: 'Cuir usé et plaques récupérées.', pal: { boots: 0x3a2a1c } }),
  O('hazmat', 'Hazmat', 2, 1200, 0xe8c820, 0xe0c01c, 0x2a2a2a, 0x1e1e1e, 0, { desc: 'Combinaison étanche. Portez le masque assorti.', pal: { boots: 0x1e1e1e, gloves: 0x1e1e1e } }),
  O('agent', 'Agent double', 2, 1300, 0x16181e, 0x16181e, 0xf2f2f2, 0xb8222a, 0, { suit: 1, desc: 'Costume sur mesure, cravate rouge.', pal: { boots: 0x101012 } }),
  O('astro', 'Astronaute', 2, 1400, 0xf2f2f2, 0xe4e4e4, 0xd96a1e, 0x2a5aa8, 1, { desc: 'Scaphandre de sortie extravéhiculaire.', pal: { boots: 0xd8d8d8, gloves: 0xd96a1e } }),
  O('cyber', 'Cyber-runner', 2, 1500, 0x1a1c2a, 0x12141e, 0x2a2e44, 0x05d9e8, 2, { glow: 0x05d9e8, desc: 'Fibres optiques intégrées au blindage.' }),
  O('samourai', 'Samouraï', 2, 1600, 0x8a1a1a, 0x1e1a1a, 0xb8222a, 0xd9a520, 2, { desc: 'Armure laquée rouge et or.' }),
  O('magma', 'Cœur de magma', 3, 2400, 0x2a1a16, 0x1e1412, 0x3a2018, 0xff6b1a, 2, { glow: 0xff5a10, desc: 'La roche se fissure, la lave affleure.' }),
  O('spectre', 'Spectre', 3, 2600, 0xe8e8f4, 0xcfcfe4, 0x8a8ab8, 0xb967ff, 1, { glow: 0xb967ff, desc: 'Une apparition violette sur le champ de bataille.', pal: { boots: 0x8a8ab8, gloves: 0xe8e8f4 } }),
  O('or', 'Or massif', 3, 3000, 0xd9a520, 0xc9951a, 0xf2c84a, 0xffffff, 2, { desc: 'Quand la discrétion n’est plus une option.', pal: { boots: 0xb8860b, gloves: 0xf2c84a } }),
];

const H = (id, name, r, p, desc) => ({ id, cat: 'head', name, r, p, desc });
export const HEADS = [
  H('none', 'Tête nue', 0, 0, 'Rien à cacher.'),
  H('casquette', 'Casquette', 0, 200, 'Visière basse, regard discret.'),
  H('beret', 'Béret', 0, 250, 'Porté incliné, comme il se doit.'),
  H('bandana', 'Bandana', 0, 250, 'Noué serré avant l’assaut.'),
  H('cagoule', 'Cagoule', 1, 450, 'Anonymat garanti.'),
  H('casque', 'Casque tactique', 1, 500, 'Casque balistique avec lunettes relevées.'),
  H('capuche', 'Capuche', 1, 500, 'Pour les nuits de pluie.'),
  H('cowboy', 'Chapeau de cow-boy', 1, 550, 'Le duel est à midi.'),
  H('chat', 'Casque Néko', 1, 700, 'Casque audio à oreilles de chat.'),
  H('gaz', 'Masque à gaz', 2, 900, 'Double cartouche filtrante.'),
  H('pilote', 'Casque de pilote', 2, 1000, 'Visière dorée et masque à oxygène.'),
  H('crete', 'Crête néon', 2, 1100, 'Une crête qui brille dans le noir.'),
  H('lourd', 'Heaume blindé', 2, 1200, 'Casque intégral à visière lumineuse.'),
  H('oni', 'Masque Oni', 2, 1300, 'Démon rouge aux cornes d’ivoire.'),
  H('halo', 'Auréole', 3, 2200, 'Trop sage pour être honnête.'),
  H('couronne', 'Couronne', 3, 2500, 'Le dernier debout règne.'),
];

const Bk = (id, name, r, p, desc) => ({ id, cat: 'back', name, r, p, desc });
export const BACKS = [
  Bk('none', 'Aucun', 0, 0, 'Voyager léger.'),
  Bk('sac', 'Sac tactique', 0, 200, 'Sac 30 litres et tapis de sol.'),
  Bk('radio', 'Radio de campagne', 1, 450, 'Antenne longue portée.'),
  Bk('bouclier', 'Bouclier rond', 1, 500, 'Acier martelé, porté dans le dos.'),
  Bk('katana', 'Katana', 2, 900, 'Lame au fourreau, pour le style.'),
  Bk('cape', 'Cape', 2, 1000, 'Flotte derrière les héros.'),
  Bk('jetpack', 'Réacteur dorsal', 2, 1200, 'Purement décoratif. Pour l’instant.'),
  Bk('ailes', 'Ailes mécaniques', 3, 2300, 'Lames articulées à bord lumineux.'),
];

const Ws = (id, name, r, p, body, dark, metal, acc, grip) => ({ id, cat: 'wskin', name, r, p, pal: { body, dark, metal, acc, grip } });
export const WSKINS = [
  Ws('standard', 'Standard', 0, 0, 0x3a3f46, 0x1c1e22, 0x6a7078, 0xd98a2a, 0x4a3a2c),
  Ws('sable', 'Sable', 0, 250, 0xb89a6a, 0x4a4034, 0x8a7a5a, 0x2a2a2a, 0x7a6444),
  Ws('foret', 'Forêt', 0, 250, 0x4a5a3a, 0x232a1e, 0x5a6050, 0x9ab84a, 0x3a3020),
  Ws('arctique', 'Arctique', 1, 400, 0xe4e8ec, 0x9aa2aa, 0xb8c0c8, 0x3d9bff, 0xc8ced4),
  Ws('carbone', 'Carbone rouge', 1, 600, 0x1e2024, 0x101114, 0x3a3c42, 0xd92a2a, 0x2a1414),
  Ws('ocean', 'Océan', 1, 600, 0x2a5a9a, 0x16243a, 0xd8dde2, 0xf2f2f2, 0x1e3a5a),
  Ws('rose', 'Bonbon', 2, 700, 0xff7ab0, 0x7a2a4a, 0xf2f2f2, 0x7af2e0, 0xb84a7a),
  Ws('toxique', 'Toxique', 2, 900, 0x1a1e1a, 0x0e100e, 0x2a302a, 0x39ff14, 0x16361a),
  Ws('magma', 'Magma', 2, 1500, 0x2a1a16, 0x140c0a, 0x4a2a1e, 0xff6b1a, 0x3a1a10),
  Ws('or', 'Plaqué or', 3, 2000, 0xd9a520, 0x8a6a10, 0xf2c84a, 0xffffff, 0x3a2a1c),
];

const Tr = (id, name, r, p, color) => ({ id, cat: 'tracer', name, r, p, color });
export const TRACERS = [
  Tr('jaune', 'Jaune', 0, 0, 0xffd27a), Tr('rouge', 'Rouge', 0, 300, 0xff4a3a), Tr('cyan', 'Cyan', 0, 300, 0x4ae8ff), Tr('vert', 'Vert', 0, 300, 0x5aff6a),
  Tr('blanc', 'Blanc', 1, 400, 0xffffff), Tr('violet', 'Violet', 1, 500, 0xc07aff), Tr('rose', 'Rose', 1, 500, 0xff7ad0), Tr('or', 'Or', 2, 900, 0xffb52e),
];

export const ITEMS = [...OUTFITS, ...HEADS, ...BACKS, ...WSKINS, ...TRACERS];
export const ITEM = Object.fromEntries(ITEMS.map((i) => [i.cat + ':' + i.id, i]));
export const byCat = { outfit: OUTFITS, head: HEADS, back: BACKS, wskin: WSKINS, tracer: TRACERS };
export const getItem = (cat, id) => ITEM[cat + ':' + id] || byCat[cat][0];

export const DEFAULT_COS = { outfit: 'recrue', head: 'none', back: 'none', wskin: 'standard', tracer: 'jaune', tone: 1, hair: 0 };

/** Nettoie une apparence reçue du réseau (on ne fait jamais confiance aux données distantes). */
export function sanitizeCos(c) {
  const o = { ...DEFAULT_COS };
  if (c && typeof c === 'object') {
    for (const k of ['outfit', 'head', 'back', 'wskin', 'tracer']) if (typeof c[k] === 'string' && ITEM[k + ':' + c[k]]) o[k] = c[k];
    if (Number.isInteger(c.tone) && c.tone >= 0 && c.tone < SKIN_TONES.length) o.tone = c.tone;
    if (Number.isInteger(c.hair) && c.hair >= 0 && c.hair < HAIR.length) o.hair = c.hair;
  }
  return o;
}

export function randomCos(rng) {
  const pick = (a) => a[Math.floor(rng() * a.length)].id;
  return { outfit: pick(OUTFITS), head: pick(HEADS), back: rng() < 0.5 ? 'none' : pick(BACKS), wskin: pick(WSKINS), tracer: pick(TRACERS), tone: Math.floor(rng() * SKIN_TONES.length), hair: Math.floor(rng() * HAIR.length) };
}
