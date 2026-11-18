# RAFALE

Jeu de tir 3D multijoueur **qui tourne entièrement dans le navigateur** : rien à installer, pas de serveur de jeu à payer.

**Jouer :** https://tipiltheglitcher.github.io/rafale/

## Modes de jeu

| Mode | Détails |
| --- | --- |
| Battle royale **Solo / Duo / Trio / Escouade** | Parachutage, butin au sol, zone qui se referme en 5 phases, dernier joueur ou dernière équipe en vie. |
| **JcJ chacun pour soi** | Réapparition au bout de 3 s, équipement de départ, premier à 25 éliminations ou 8 minutes. |
| **Contre des bots** | Tous les modes jouables hors ligne, de 1 à 23 bots, 3 niveaux de difficulté (Recrue, Soldat, Élite). |

- **Jusqu'à 16 joueurs** par salon, complété par des bots (24 participants max).
- **Salon avec un code** à 5 caractères (ou un lien d'invitation `?join=CODE`). La partie est **hébergée chez la personne qui crée le salon**.
- **Rotation des cartes** : l'hôte choisit les cartes, leur ordre, la prochaine carte, et peut enchaîner automatiquement les parties.

## Les 5 cartes

1. **Port Brisé** : terminal à conteneurs, entrepôts avec mezzanines, grues, cargo à quai.
2. **Dunes d'Ocre** : village d'adobe à toits-terrasses, ruines antiques, fortin, oasis, site pétrolier.
3. **Givre-Nord** : station polaire, camp de bûcherons, village de pêche sur lac gelé, épave d'avion, observatoire.
4. **Canopée** : temple à degrés dans la jungle, village sur pilotis, labyrinthe, rivière et ponts.
5. **Néon-District** : centre-ville de nuit, tours éclairées, boutiques ouvertes, chantiers, parkings.

Les cartes sont générées à partir d'une graine : chaque partie a une disposition différente, identique pour tous les joueurs.

## Arsenal (17 armes)

Pistolets (P9 Vipère, Rex .50), mitraillettes (Guêpe MP, Frelon SMG, Vecteur-45), fusils d'assaut (AR-7 Mistral, Kodiak 762, Faucon B3 en rafale), fusils à pompe (Brise-Porte, Tempête 12), Chasseur DMR, Longue-Vue .338 (lunette), Titan LMG, Volcan RPG, Mortier GL, et deux armes à énergie (Éclair Railgun, Nova PR).

Chaque arme a ses dégâts, sa cadence, son chargeur, son temps de rechargement, sa dispersion et son recul, une atténuation avec la distance et un bonus de tir à la tête. Le butin a **4 raretés** (Commun, Rare, Épique, Légendaire) qui augmentent les dégâts et accélèrent le rechargement. Il y a 6 types de munitions, des trousses de soins et des cellules de bouclier.

## Boutique et personnalisation

Les crédits se gagnent en jouant (participation, éliminations, dégâts, classement). Ils s'utilisent dans la boutique avec un aperçu 3D :
15 tenues, 16 coiffes, 8 équipements dorsaux, 10 peintures d'arme, 8 couleurs de traçantes, ainsi que la couleur de peau et de cheveux.

## Paramètres

Sensibilité (normale et en visée), inversion de l'axe vertical, visée et accroupi en bascule, **toutes les touches sont réassignables** (ZQSD fonctionne directement sur AZERTY), qualité graphique (4 niveaux), champ de vision, compteur d'images par seconde, volume, couleur et style du viseur, serveur TURN.

## Commandes par défaut

| Action | Touche |
| --- | --- |
| Se déplacer | ZQSD (AZERTY) / WASD (QWERTY) |
| Tirer / viser | Clic gauche / clic droit |
| Sprint, accroupi, saut | Maj, C, Espace |
| Ramasser, recharger, lâcher l'arme | E, R, X |
| Soins, bouclier | H, G |
| Armes | 1 à 4, molette |
| Carte, scores, discussion | M, Tab, Entrée |

## Comment fonctionne le multijoueur

- La personne qui crée le salon fait tourner la **simulation de la partie dans son navigateur** (déplacements des bots, zone, butin, dégâts, fin de partie). Elle doit garder l'onglet ouvert.
- Les joueurs se connectent **directement à l'hôte en WebRTC** (pair-à-pair) via [PeerJS](https://peerjs.com). Le serveur public gratuit de PeerJS sert seulement à la mise en relation, puis tout passe en direct.
- Les positions transitent en binaire compact (environ 13 octets par joueur, 20 fois par seconde). Les autres joueurs sont interpolés pour rester fluides.
- Le site lui-même est statique et hébergé gratuitement sur **GitHub Pages**.

### Et Cloudflare ?

Ce n'est **pas nécessaire** pour jouer. Sur certains réseaux (4G, entreprise, école), une connexion directe entre deux navigateurs est impossible. Il faut alors un **relais TURN**. Cloudflare en propose un (Cloudflare Realtime TURN, avec une offre gratuite) :

1. Créer une clé TURN dans le tableau de bord Cloudflare (*Realtime → TURN Server*).
2. Générer des identifiants (nom d'utilisateur et mot de passe) pour cette clé.
3. Dans le jeu : **Paramètres → Réseau**, renseigner `turn:turn.cloudflare.com:3478?transport=udp,turns:turn.cloudflare.com:5349?transport=tcp` et les identifiants.

Le site peut aussi être publié sur Cloudflare Pages au lieu de GitHub Pages : c'est un dossier statique, sans étape de compilation.

## Développement

```bash
npm install      # facultatif : seulement pour mettre à jour three.js / PeerJS dans vendor/
npm start        # serveur local sur http://localhost:5173
```

Aucune compilation : le jeu est en JavaScript moderne (modules ES) avec [three.js](https://threejs.org) pour la 3D. Tout le reste est généré par le code : modèles des personnages et des armes, textures, sons (Web Audio) et cartes. `dev.html` est une visionneuse de développement (`dev.html?map=port`, `?show=chars`, `?show=weapons`).

```
js/
  core/      utilitaires, bruit, aléatoire déterministe
  world/     cartes, génération, physique, lancer de rayon, navigation des bots, rendu du monde
  models/    personnages articulés et armes modélisés par code
  data/      armes, objets de la boutique, profil et paramètres
  game/      simulation de l'hôte, bots, protocole réseau, client de jeu, effets
  net/       connexion pair-à-pair (salon par code)
  ui/        HUD, menus, boutique, paramètres
  engine/    géométrie, entrées clavier/souris, sons
```

## Licence

MIT
