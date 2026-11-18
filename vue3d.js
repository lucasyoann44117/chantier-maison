// Visualiseur 3D, copié depuis le prototype maison-3d (outils/exporter.mjs).
// Les données de la maison ne sont pas ici : maquette.html les lit dans Supabase.
// Maison 3D : vue d'ensemble (orbite) et visite à hauteur d'homme.
// Plan (x est, y nord, cm) → scène (X = x, Z = -y, en mètres).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const { HAUTEUR, murs, pieces, objets, etage } = window.MAISON;

const M = v => v / 100;
const H = M(HAUTEUR);
const CENTRE = new THREE.Vector3(M(790), 0, -M(700));

// ---------- Scène ----------

const rendu = new THREE.WebGLRenderer({ antialias: true });
rendu.setPixelRatio(Math.min(devicePixelRatio, 2));
rendu.setSize(innerWidth, innerHeight);
rendu.shadowMap.enabled = true;
rendu.shadowMap.type = THREE.PCFSoftShadowMap;
rendu.outputColorSpace = THREE.SRGBColorSpace;
document.body.prepend(rendu.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#bcd3e6');
scene.fog = new THREE.Fog('#bcd3e6', 40, 90);

scene.add(new THREE.HemisphereLight('#f4f7ff', '#8a8572', 1.1));
// Soleil au sud-ouest (le nord est vers -Z).
const soleil = new THREE.DirectionalLight('#fff3df', 2.2);
soleil.position.set(CENTRE.x - 9, 14, CENTRE.z + 12);
soleil.target.position.copy(CENTRE);
soleil.castShadow = true;
soleil.shadow.mapSize.set(2048, 2048);
Object.assign(soleil.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 50 });
soleil.shadow.bias = -0.0005;
scene.add(soleil, soleil.target);
const lumiereInterieure = new THREE.PointLight('#fff1d6', 0, 9);
scene.add(lumiereInterieure);

const sol = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshLambertMaterial({ color: '#8fa877' }));
sol.rotation.x = -Math.PI / 2;
sol.position.set(CENTRE.x, -0.03, CENTRE.z);
sol.receiveShadow = true;
scene.add(sol);

// ---------- Jardin (plan de masse DPC02 au 1/150 + photos du 18/11) ----------
// Repère du plan : x vers l'est, y vers le nord (cm), origine au coin sud-ouest du garage ;
// le garage touche la limite ouest, la rue des Iris est à 5,20 m au sud de la maison.
// Terrain : 20,55 m sur la rue, 19,89 m au fond, 34,44 m à l'ouest, 33,22 m à l'est.
// (appelé plus bas, une fois « ajouter » et la liste des éléments prêts)
function construireJardin() {
  const P =(x, y) => new THREE.Vector2(M(x), M(y));
  const plaque = (pts, couleur, haut, phase) => {
    const forme = new THREE.Shape(pts.map(([x, y]) => P(x, y)));
    const m = new THREE.Mesh(new THREE.ShapeGeometry(forme), new THREE.MeshLambertMaterial({ color: couleur }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = haut; // la rotation envoie déjà le y du plan vers -Z
    m.material.side = THREE.DoubleSide;
    m.castShadow = false; m.receiveShadow = true;
    m.userData.phase = phase; scene.add(m); elements.push(m);
  };
  const boite = (x0, y0, x1, y1, h, z0, couleur, phase, rugueux = 0.9) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(M(Math.abs(x1 - x0)), M(h), M(Math.abs(y1 - y0))),
      new THREE.MeshStandardMaterial({ color: couleur, roughness: rugueux }));
    m.position.set(M((x0 + x1) / 2), M(z0 + h / 2), -M((y0 + y1) / 2));
    return ajouter(m, phase);
  };
  // Haie : suite de touffes (sphères aplaties) le long d'un segment, hauteur un peu irrégulière.
  const matHaie = new THREE.MeshStandardMaterial({ color: '#3d5632', roughness: 1, flatShading: true });
  const haie = (x0, y0, x1, y1, h, ep, phase, clairsemee = false) => {
    const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(L / 110));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, hk = h * (0.85 + 0.3 * ((k * 37) % 7) / 7);
      if (clairsemee && k % 3 === 1) continue;
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), clairsemee ? matHaieTaillee : matHaie);
      m.scale.set(M(Math.max(ep, L / n * 0.6)), M(hk / 2), M(ep));
      m.position.set(M(x0 + (x1 - x0) * t), M(hk / 2), -M(y0 + (y1 - y0) * t));
      m.rotation.y = -Math.atan2(y1 - y0, x1 - x0);
      ajouter(m, phase);
    }
  };
  const matHaieTaillee = new THREE.MeshStandardMaterial({ color: '#6b5a43', roughness: 1, flatShading: true });
  const arbre = (x, y, hTronc, rTronc, hCime, rCime, couleur, phase) => {
    const tronc = new THREE.Mesh(new THREE.CylinderGeometry(M(rTronc * 0.8), M(rTronc), M(hTronc), 8),
      new THREE.MeshStandardMaterial({ color: '#6e5e4c', roughness: 1 }));
    tronc.position.set(M(x), M(hTronc / 2), -M(y));
    ajouter(tronc, phase);
    const cime = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: couleur, roughness: 1, flatShading: true }));
    cime.scale.set(M(rCime), M(hCime / 2), M(rCime));
    cime.position.set(M(x), M(hTronc + hCime / 2 - 20), -M(y));
    ajouter(cime, phase);
  };

  // Sol : rue, pelouse de la parcelle, puis devant la maison (dit par Yoann le 18/11) : deux
  // places de parking face au garage, une petite haie, et l'allée bordée de pavés qui monte à
  // la porte ; pelouse à droite. Tout reste sous le niveau des sols des pièces (y = 0).
  plaque([[-1500, -520], [3500, -520], [3500, -1300], [-1500, -1300]], '#5b5d60', -0.018);
  plaque([[0, -520], [2055, -520], [1994, 2802], [0, 2924]], '#6f8c4c', -0.016);
  plaque([[0, -520], [500, -520], [500, 145], [0, 145]], '#2c2c2e', -0.013);           // parking
  plaque([[580, -520], [790, -520], [800, 0], [580, 0]], '#2c2c2e', -0.013);            // allée
  plaque([[336, -60], [580, -60], [580, 0], [336, 0]], '#2c2c2e', -0.013);              // bande devant la cuisine
  // Bordures en pavés clairs de chaque côté de l'allée (photos de l'entrée).
  boite(574, -520, 586, -60, 6, -1.5, '#d9d2c4');
  boite(790, -520, 802, 20, 6, -1.5, '#d9d2c4');
  // Petite haie entre le parking et l'allée : taillée depuis peu (photo de l'entrée).
  haie(540, -500, 540, -90, 120, 55, 'avant');
  haie(540, -500, 540, -90, 90, 45, 'apres', true);

  // Haies de limite : ouest (derrière le garage), fond (nord), est.
  haie(-40, 800, -40, 2900, 260, 140);
  haie(0, 2950, 1994, 2830, 320, 160);
  haie(2030, 2780, 2050, 250, 260, 150);
  // À droite de la maison : la haie continue de la rue jusqu'au petit mur (Yoann, 18/11).
  haie(2035, -480, 2035, 110, 200, 110);
  // Haie sur la rue, devant la pelouse : complète avant les travaux ; commencée à tailler
  // (le 18/11) pour laisser passer les engins de chantier.
  haie(900, -470, 2030, -470, 170, 90, 'avant');
  haie(900, -470, 2030, -470, 120, 70, 'apres', true);
  // Petit mur (claustra gris) côté est, entre le pignon et la limite, avec un portillon côté
  // maison (photos du pignon et du passage). Il sera déposé pendant les travaux puis remis :
  // on le laisse dans les deux phases.
  boite(1700, 120, 1990, 126, 180, 0, '#6d6a66', undefined, 0.8);
  boite(1578, 120, 1600, 126, 180, 0, '#3f3d3b', undefined, 0.8);           // poteau
  boite(1600, 121, 1696, 125, 170, 5, '#7c7873', undefined, 0.8);           // portillon
  boite(1696, 120, 1700, 126, 180, 0, '#3f3d3b', undefined, 0.8);           // poteau
  for (let x = 1610; x < 1690; x += 12) boite(x, 119.5, x + 2, 120.5, 160, 10, '#5d5a56'); // lames
  boite(1990, 120, 2010, 126, 180, 0, '#3f3d3b', undefined, 0.8);           // poteau de limite

  // Terrasse en bois contre la façade nord (photos du 18/11) : complète avant les travaux ;
  // aujourd'hui démontée, seules restent les lambourdes. Après : l'extension prend sa place.
  boite(330, 930, 1180, 1300, 6, 0, '#8a7a66', 'avant', 0.95);
  boite(0, 791, 330, 900, 6, 0, '#8a7a66', undefined, 0.95);
  for (let x = 950; x <= 1180; x += 60) boite(x - 4, 1000, x + 4, 1300, 5, 0, '#7b6a55', 'apres');

  // Arbres. Olivier : avant, à droite de la terrasse (terre nue sur la photo), plus touffu ;
  // après, replanté à gauche, taillé.
  arbre(1260, 1180, 140, 12, 300, 210, '#8c9a78', 'avant');
  arbre(380, 1700, 110, 8, 160, 90, '#8c9a78', 'apres');
  arbre(1150, 2050, 170, 14, 380, 300, '#5f6f45');   // pommier au milieu de la pelouse
  arbre(820, 2480, 160, 13, 360, 260, '#66704a');    // fruitier près de la bâche
  arbre(250, 2750, 250, 20, 650, 380, '#4f5a3a');    // grands arbres du fond
  arbre(1700, 2700, 280, 22, 700, 420, '#55603e');
  // Abri de jardin blanc au fond, à droite.
  boite(1350, 2620, 1600, 2820, 220, 0, '#e7ebe8', undefined, 0.85);
}

const matMur = new THREE.MeshStandardMaterial({ color: '#f1ede6', roughness: 0.92 });
const matPlafond = new THREE.MeshStandardMaterial({ color: '#fbfaf7', roughness: 1, side: THREE.DoubleSide });
const matVitre = new THREE.MeshStandardMaterial({ color: '#a9cbe0', transparent: true, opacity: 0.28, roughness: 0.1, metalness: 0.1 });
const matPorteGarage = new THREE.MeshStandardMaterial({ color: '#f2f1ec', roughness: 0.6 });
const matRainure = new THREE.MeshStandardMaterial({ color: '#c9c7c0', roughness: 0.7 });
// Menuiseries blanches (matMenuiserie, plus bas ; teinte des baies alu de l'extension à confirmer).
let voirFenetres = true; // bouton « Fenêtres »

// Chaque élément garde sa phase pour le bouton Avant / Après.
const elements = [];
const obstacles = []; // rectangles au sol : { cx, cz, angle, hl, he, phase, niveau (0 = RDC, 1 = étage) }
let infoEscalier = null; // géométrie de l'escalier, pour monter en visite
const BASE_ETAGE = etage ? M(etage.niveau) : 0;

function ajouter(mesh, phase, ombre = true) {
  mesh.castShadow = ombre;
  mesh.receiveShadow = true;
  mesh.userData.phase = phase;
  scene.add(mesh);
  elements.push(mesh);
  return mesh;
}
construireJardin();

// ---------- Murs ----------

const piecesDeMur = [];

// Crépi extérieur : blanc cassé (Street View de 2008 : même teinte que la porte de
// garage blanche, à l'ombre) ; l'extension prend la même teinte. Grain fin en relief.
function texteCrepi() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 256, 256);
  let graine = 3;
  const hasard = () => (graine = (graine * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 9000; k++) {
    const n = 90 + Math.round(hasard() * 90);
    g.fillStyle = `rgba(${n},${n},${n},0.5)`;
    const r = 0.6 + hasard() * 1.6;
    g.beginPath(); g.arc(hasard() * 256, hasard() * 256, r, 0, 6.3); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const grainCrepi = texteCrepi();
// Photos du 18/11 : enduit blanc crème (plus clair et plus chaud qu'avant, qui ressortait gris à
// l'ombre), volets et portes gris anthracite, ardoise foncée.
// emissive : un peu de lumière propre, sinon l'enduit à l'ombre vire au beige.
const matCrepi = new THREE.MeshStandardMaterial({ color: '#fbf5ea', emissive: '#5c574d', roughness: 0.95, bumpMap: grainCrepi, bumpScale: 0.6 });
const matCrepiPignon = new THREE.MeshStandardMaterial({ color: '#fbf5ea', emissive: '#5c574d', roughness: 0.95, side: THREE.DoubleSide });
// Ardoise : 1 m de toit = 5 rangs de 20 cm de pureau, ardoises de 25 cm décalées d'un rang à
// l'autre, gris-bleu un peu varié, joints sombres.
function texteArdoise() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#2a2e33';
  g.fillRect(0, 0, 256, 256);
  let graine = 7;
  const hasard = () => (graine = (graine * 16807) % 2147483647) / 2147483647;
  const rang = 256 / 5, larg = 256 / 4;
  for (let r = 0; r < 5; r++) {
    for (let k = -1; k < 5; k++) {
      const x = k * larg + (r % 2) * larg / 2, v = 62 + Math.round(hasard() * 18);
      g.fillStyle = `rgb(${v},${v + 4},${v + 10})`;
      g.fillRect(x + 1.5, r * rang + 1.5, larg - 3, rang - 2.5);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const matArdoise = new THREE.MeshStandardMaterial({ color: '#ffffff', map: texteArdoise(), roughness: 0.7, side: THREE.DoubleSide });
const matVolet = new THREE.MeshStandardMaterial({ color: '#4b545e', roughness: 0.6 });
const peintures = {};
const materiauPeinture = couleur => (peintures[couleur] ??= new THREE.MeshStandardMaterial({ color: couleur, roughness: 0.92 }));
// UV d'une boîte à l'échelle réelle (une image = « echelle » mètres), sans rotation.
function uvEchelle(geo, l, h, p, echelle) {
  const uv = geo.attributes.uv, tailles = [[p, h], [p, h], [l, p], [l, p], [l, h], [l, h]];
  for (let f = 0; f < 6; f++) for (let k = f * 4; k < f * 4 + 4; k++) {
    uv.setXY(k, uv.getX(k) * tailles[f][0] / echelle, uv.getY(k) * tailles[f][1] / echelle);
  }
  uv.needsUpdate = true;
}

function construireMur(m) {
  const [ax, ay] = m.a, [bx, by] = m.b;
  const longueur = Math.hypot(bx - ax, by - ay);
  const angle = Math.atan2(by - ay, bx - ax);
  const ux = (bx - ax) / longueur, uy = (by - ay) / longueur;
  const ep = M(m.ep);
  const ouvertures = (m.ouvertures || []).slice().sort((a, b) => a.pos - b.pos);

  // Face extérieure : celle dont le côté ne tombe dans aucune pièce (l'autre, si).
  // La face +Z locale de la boîte regarde vers (uy, -ux) dans le plan.
  // Testé en plusieurs points le long du mur (le milieu peut tomber sur un placard).
  const d = m.ep / 2 + 20;
  const dansUnePiece = (x, y) => pieces.some(p => (!p.phase || !m.phase || p.phase === m.phase) && dans(p.poly, x, y));
  let plus = 0, moins = 0;
  for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
    const p1 = dansUnePiece(px + uy * d, py - ux * d), p2 = dansUnePiece(px - uy * d, py + ux * d);
    if (p1 && !p2) plus++;
    if (p2 && !p1) moins++;
  }
  const faceExterieure = plus === moins ? -1 : plus > moins ? 5 : 4;

  // Peinture : une fine couche posée 3 mm devant chaque face qui donne sur une pièce
  // peinte (pièce.peinture, ou pièce.peintureMurs[id du mur]), limitée à la portion du
  // mur qui borde vraiment la pièce. Elle a la phase de la pièce (couleurs « après »).
  const peindre = (s, e, z0, z1) => {
    for (const cote of [1, -1]) {
      const nx = uy * cote, ny = -ux * cote, ecart = m.ep / 2 + 10;
      for (const p of pieces) {
        if (!p.peinture || (p.phase && m.phase && p.phase !== m.phase)) continue;
        const couleur = p.peintureMurs?.[m.id] || p.peinture;
        // Portions du mur (pas de 5 cm) dont le devant tombe dans la pièce.
        let debut = null;
        for (let u = s; u <= e + 0.01; u += Math.min(5, Math.max(e - s, 0.5))) {
          const ici = u <= e && dans(p.poly, ax + ux * u + nx * ecart, ay + uy * u + ny * ecart);
          if (ici && debut === null) debut = u;
          if ((!ici || u + 5 > e + 0.01) && debut !== null) {
            const fin = ici ? e : Math.min(e, u);
            if (fin - debut > 1) {
              const couche = new THREE.Mesh(new THREE.PlaneGeometry(M(fin - debut), z1 - z0), materiauPeinture(couleur));
              const mil = (debut + fin) / 2, d = m.ep / 2 + 0.3;
              couche.position.set(M(ax + ux * mil + nx * d), (z0 + z1) / 2, -M(ay + uy * mil + ny * d));
              couche.rotation.y = angle + (cote === 1 ? 0 : Math.PI);
              ajouter(couche, p.phase || m.phase, false);
            }
            debut = null;
          }
        }
      }
    }
  };

  // Un pavé du mur entre s et e (cm, le long du mur), de z0 à z1 (m).
  const pave = (s, e, z0, z1, materiau = matMur, bloque = true) => {
    if (e - s < 0.5 || z1 - z0 < 0.005) return;
    const geo = new THREE.BoxGeometry(M(e - s), z1 - z0, materiau === matVitre ? 0.02 : ep);
    let mat = materiau;
    if (materiau === matMur && faceExterieure >= 0) {
      // Crépi sur la seule face extérieure, grain à l'échelle réelle.
      mat = [matMur, matMur, matMur, matMur, matMur, matMur];
      mat[faceExterieure] = matCrepi;
      uvEchelle(geo, M(e - s), z1 - z0, ep, 0.5);
    }
    const mesh = new THREE.Mesh(geo, mat);
    const milieu = (s + e) / 2;
    mesh.position.set(M(ax + ux * milieu), (z0 + z1) / 2, -M(ay + uy * milieu));
    mesh.rotation.y = angle;
    ajouter(mesh, m.phase, materiau !== matVitre);
    if (materiau === matMur) peindre(s, e, z0, z1);
    if (materiau !== matVitre) piecesDeMur.push(mesh); // pour cacher les cotes derrière un mur
    // Bloque la marche s'il occupe la hauteur d'une personne.
    if (bloque && z0 < 1.2 && z1 > 0.3) obstacles.push({ cx: mesh.position.x, cz: mesh.position.z, angle, hl: M(e - s) / 2, he: Math.max(ep, 0.06) / 2, phase: m.phase });
  };

  // Menuiserie d'une fenêtre ou d'une baie : dormant de 6 cm et montants entre vantaux,
  // dans le plan de la vitre. Bouton « Fenêtres » pour les afficher ou les masquer.
  // Vantaux : 1 si la fenêtre fait 80 cm ou moins, 2 sinon ; une baie de 2,50 m et plus en a 3.
  const menuiserie = (s, e, o) => {
    const z0 = o.allege, z1 = o.haut, c = 6;
    const barre = (a, b, h0, h1) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(M(b - a), M(h1 - h0), 0.07), matMenuiserie);
      const mil = (a + b) / 2;
      mesh.position.set(M(ax + ux * mil), M((h0 + h1) / 2), -M(ay + uy * mil));
      mesh.rotation.y = angle;
      mesh.userData.menuiserie = true;
      ajouter(mesh, m.phase, false);
    };
    barre(s, e, z0, z0 + c); barre(s, e, z1 - c, z1);
    barre(s, s + c, z0, z1); barre(e - c, e, z0, z1);
    const n = o.vantaux || (o.type === 'baie' ? (o.largeur >= 250 ? 3 : 2) : o.largeur > 80 ? 2 : 1);
    for (let k = 1; k < n; k++) { const x = s + (e - s) * k / n; barre(x - 4, x + 4, z0, z1); }
  };

  // Porte extérieure fermée, dans le plan du mur (photos du 18/11) : porte de garage blanche
  // coulissante latérale de 2007 (lames verticales étroites d'environ 12 cm, poignée), ou porte pleine
  // gris anthracite (entrée, garage côté jardin).
  const porteExterieure = (s, e, o) => {
    const garage = o.panneau === 'garage';
    const plaque = (a, b, h0, h1, mat, ep = 0.04) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(M(b - a), M(h1 - h0), ep), mat);
      const mil = (a + b) / 2;
      mesh.position.set(M(ax + ux * mil), M((h0 + h1) / 2), -M(ay + uy * mil));
      mesh.rotation.y = angle;
      ajouter(mesh, m.phase, false);
    };
    plaque(s, e, 0, o.haut, garage ? matPorteGarage : matVolet);
    if (garage) {
      const n = Math.round((e - s) / 12); // lames étroites, porte « à l'ancienne » (Yoann, 18/11)
      for (let k = 1; k < n; k++) { const x = s + (e - s) * k / n; plaque(x - 0.6, x + 0.6, 2, o.haut - 2, matRainure, 0.05); }
      plaque(e - 30, e - 18, 98, 104, matRainure, 0.07); // poignée
    }
  };

  let curseur = 0;
  for (const o of ouvertures) {
    pave(curseur, o.pos, 0, H);
    const s = o.pos, e = o.pos + o.largeur;
    if (o.allege > 0) pave(s, e, 0, M(o.allege));
    if (o.type === 'fenetre' || o.type === 'baie') { pave(s, e, M(o.allege), M(o.haut), matVitre, true); menuiserie(s, e, o); }
    if (o.type === 'porte' && o.vitree) porteVitree(m, o, angle, ux, uy);
    if (o.type === 'porte' && o.panneau) porteExterieure(s, e, o);
    if (o.type === 'arche') arche(m, o, angle, ux, uy, ep);
    else pave(s, e, M(o.haut), H, matMur, false);
    curseur = e;
  }
  pave(curseur, longueur, 0, H);

  // Volets ouverts contre la façade, de part et d'autre des fenêtres extérieures.
  if (faceExterieure < 0) return;
  const sens = faceExterieure === 4 ? 1 : -1; // vers l'extérieur : (uy, -ux) * sens
  const decal = M(m.ep) / 2 + 0.025;
  for (const o of ouvertures) {
    if (o.type !== 'fenetre' || o.volet === false) continue; // volet: false = pas de volet
    const hv = M(o.haut - o.allege), lv = M(o.largeur / 2);
    for (const centre of [o.pos - o.largeur / 4, o.pos + o.largeur + o.largeur / 4]) {
      const volet = new THREE.Mesh(new THREE.BoxGeometry(lv, hv, 0.03), matVolet);
      volet.position.set(M(ax + ux * centre) + uy * sens * decal, M(o.allege) + hv / 2, -(M(ay + uy * centre) - ux * sens * decal));
      volet.rotation.y = angle;
      ajouter(volet, m.phase, true);
    }
  }
}

// Linteau en arc : un rectangle percé d'un demi-cercle, extrudé dans l'épaisseur.
// Porte vitrée à petits carreaux (fermée, dans le plan du mur) : cadre blanc, vitre,
// petits bois formant 3 × 5 carreaux, pour laisser passer la lumière.
const matMenuiserie = new THREE.MeshStandardMaterial({ color: '#f4f3ef', roughness: 0.5 });
function porteVitree(m, o, angle, ux, uy) {
  const [ax, ay] = m.a, c = o.pos + o.largeur / 2, g = new THREE.Group();
  const L = M(o.largeur) - 0.02, h = M(o.haut) - 0.01, e = 0.04, b = 0.07, f = 0.022;
  const pave = (l, hh, x, y, mat = matMenuiserie, ep = e) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(l, hh, ep), mat);
    p.position.set(x, y, 0);
    g.add(p);
  };
  pave(L, b, 0, h - b / 2); pave(L, b * 1.6, 0, b * 0.8);
  pave(b, h, -L / 2 + b / 2, h / 2); pave(b, h, L / 2 - b / 2, h / 2);
  const x0 = -L / 2 + b, x1 = L / 2 - b, y0 = b * 1.6, y1 = h - b;
  pave(x1 - x0, y1 - y0, 0, (y0 + y1) / 2, matVitre, 0.01);
  for (let k = 1; k < 3; k++) pave(f, y1 - y0, x0 + (x1 - x0) * k / 3, (y0 + y1) / 2, matMenuiserie, 0.03);
  for (let k = 1; k < 5; k++) pave(x1 - x0, f, 0, y0 + (y1 - y0) * k / 5, matMenuiserie, 0.03);
  pave(0.02, 0.12, L / 2 - b - 0.05, h * 0.47, new THREE.MeshStandardMaterial({ color: '#8f9296', metalness: 0.7, roughness: 0.3 }), 0.06);
  g.position.set(M(ax + ux * c), 0, -M(ay + uy * c));
  g.rotation.y = angle;
  ajouter(g, m.phase, false);
}
function arche(m, o, angle, ux, uy, ep) {
  const w = M(o.largeur), r = w / 2, naissance = M(o.haut) - r;
  const forme = new THREE.Shape();
  forme.moveTo(-r, naissance);
  forme.lineTo(-r, H);
  forme.lineTo(r, H);
  forme.lineTo(r, naissance);
  forme.absarc(0, naissance, r, 0, Math.PI, false);
  const geo = new THREE.ExtrudeGeometry(forme, { depth: ep, bevelEnabled: false, curveSegments: 24 });
  geo.translate(0, 0, -ep / 2);
  const mesh = new THREE.Mesh(geo, matMur);
  const milieu = o.pos + o.largeur / 2;
  mesh.position.set(M(m.a[0] + ux * milieu), 0, -M(m.a[1] + uy * milieu));
  mesh.rotation.y = angle;
  ajouter(mesh, m.phase);
}

murs.forEach(construireMur);

// ---------- Sols, plafonds, objets ----------

let texteVeinage; // veinage du chêne, créé au premier meuble qui en a besoin
const formeDe = poly => new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(M(x), M(y))));

// Calepinages : un motif qui se répète, en cases de grille [x, y, largeur, hauteur].
const MOTIFS = {
  // Carrelage actuel (photos) : carrés identiques posés droit, 4 × 4 pour varier les teintes.
  // D'après la photo du sol (33 × 33) : blanc légèrement grisé, joints gris foncé, petits
  // éclats sombres dans le carreau et le long des bords.
  carre: { cases: 4, rects: Array.from({ length: 16 }, (_, k) => [k % 4, Math.floor(k / 4), 1, 1]),
    couleur: [232, 230, 224], ecart: 6, joint: '#5c5f60', largeurJoint: 3, mouchetis: 0, eclats: true },
  // Futur sol (provisoire, rien n'est choisi) : multi-formats façon carrelage ancien, grège.
  // Pose aléatoire sur 40 × 40 modules (8 m avec un module de 20 cm) : pas de motif
  // répété visible ni de centrage. Formats de 1 × 1 à 3 × 3 modules (20 à 60 cm).
  // relief : force du relief (carrelage ancien : joints creux, bords arrondis, usure).
  // Joint fin : 1 pixel pour 20 cm, soit environ 6 mm.
  multiformat: { cases: 40, px: 32, centre: false, relief: 3, ecart: 22, largeurJoint: 1,
    formats: [[1, 1, 1], [2, 1, 2], [1, 2, 2], [2, 2, 3], [3, 2, 3], [2, 3, 3], [3, 3, 2]],
    couleur: [196, 188, 175], joint: '#cfc9bf', mouchetis: 6 },
  // Roma Celio (Concept Mosaïque) : opus romain effet travertin, gris nuancé, finition douce.
  // Formats réels sur un module de 20,3 cm : 20,3 × 20,3, 20,3 × 40,6, 40,6 × 40,6, 40,6 × 60,9.
  // Teinte relevée sur la photo du fabricant (gris-beige chaud).
  romaCelio: { cases: 40, px: 32, centre: false, relief: 1.6, ecart: 14, largeurJoint: 1, travertin: true,
    formats: [[1, 1, 1], [2, 1, 1], [1, 2, 1], [2, 2, 2], [3, 2, 2], [2, 3, 2]],
    couleur: [194, 182, 164], joint: '#d3ccc0', mouchetis: 5 },
  // Lino imitation carreaux de ciment (buanderie) : carreaux de 20 cm imprimés en noir,
  // gris et blanc cassé ; chaque carreau tourné d'un quart de tour forme une rosace sur
  // 2 × 2 carreaux. Surface lisse : joints seulement imprimés, pas d'usure.
  cimentLino: { cases: 4, px: 128, rects: Array.from({ length: 16 }, (_, k) => [k % 4, Math.floor(k / 4), 1, 1]),
    ciment: true, usure: false, relief: 0.15, ecart: 0, largeurJoint: 1, mouchetis: 0,
    couleur: [238, 235, 228], joint: '#c9c5bd', encre: '#2e343b', gris: '#8f969c' },
};

// Motif d'un carreau de ciment dans le carré (x, y, s), tourné de rot quarts de tour :
// quart de cercle sombre dans un coin, pétale gris vers le centre, losange au centre.
function dessinCiment(g, m, x, y, s, rot) {
  g.save();
  g.translate(x + s / 2, y + s / 2);
  g.rotate(rot * Math.PI / 2);
  g.translate(-s / 2, -s / 2);
  g.fillStyle = m.encre;
  g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, s * 0.5, 0, Math.PI / 2); g.closePath(); g.fill();
  g.fillStyle = `rgb(${m.couleur.join(',')})`;
  g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, s * 0.32, 0, Math.PI / 2); g.closePath(); g.fill();
  g.fillStyle = m.gris;
  g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, s * 0.18, 0, Math.PI / 2); g.closePath(); g.fill();
  // Pétale en diagonale vers le coin opposé (centre de la rosace voisine).
  g.fillStyle = m.gris;
  g.beginPath(); g.ellipse(s * 0.72, s * 0.72, s * 0.2, s * 0.08, Math.PI / 4, 0, 2 * Math.PI); g.fill();
  g.fillStyle = m.encre;
  g.beginPath(); g.moveTo(s, s - s * 0.16); g.lineTo(s - s * 0.16, s); g.lineTo(s, s); g.closePath(); g.fill();
  // Filets sur les bords.
  g.strokeStyle = m.encre;
  g.lineWidth = Math.max(1, s * 0.02);
  g.strokeRect(s * 0.04, s * 0.04, s * 0.92, s * 0.92);
  g.restore();
}

// Remplit la grille au hasard : à chaque case libre, un format tiré au sort
// (selon son poids) parmi ceux qui tiennent sans chevaucher.
function poseAleatoire(m, hasard) {
  const n = m.cases, pris = Array.from({ length: n }, () => new Array(n).fill(false)), rects = [];
  const libre = (i, j, l, h) => {
    if (i + l > n || j + h > n) return false;
    for (let a = i; a < i + l; a++) for (let b = j; b < j + h; b++) if (pris[b][a]) return false;
    return true;
  };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (pris[j][i]) continue;
    const possibles = m.formats.filter(([l, h]) => libre(i, j, l, h));
    let t = hasard() * possibles.reduce((s, f) => s + f[2], 0), choix = possibles[0];
    for (const f of possibles) { t -= f[2]; if (t <= 0) { choix = f; break; } }
    const [l, h] = choix;
    for (let a = i; a < i + l; a++) for (let b = j; b < j + h; b++) pris[b][a] = true;
    rects.push([i, j, l, h]);
  }
  return rects;
}

// Deux images du même calepinage : les couleurs, et le relief (clair = haut) qui
// creuse les joints, arrondit les bords et rend la surface irrégulière.
function texteCarrelage(nom) {
  const m = MOTIFS[nom], px = m.px || 96, taille = px * m.cases;
  const toile = () => { const c = document.createElement('canvas'); c.width = c.height = taille; return [c, c.getContext('2d')]; };
  const [c, g] = toile(), [cr, gr] = toile();
  g.fillStyle = m.joint;
  g.fillRect(0, 0, taille, taille);
  gr.fillStyle = '#000';
  gr.fillRect(0, 0, taille, taille);
  let graine = 7;
  const hasard = () => (graine = (graine * 16807) % 2147483647) / 2147483647;
  // largeurJoint : largeur totale du joint en pixels de la texture.
  const joint = px >= 64 ? 2 : 1, ecart = m.ecart || 12, bord = m.relief ? 2 : 1;
  const lj = m.largeurJoint ?? 2 * joint, dj = Math.floor(lj / 2);
  for (const [i, j, l, h] of m.rects || poseAleatoire(m, hasard)) {
    const v = Math.round(hasard() * ecart - ecart / 2), [r, v2, b] = m.couleur;
    const x = i * px + dj, y = j * px + dj, w = l * px - lj, hh = h * px - lj;
    g.fillStyle = `rgb(${r + v}, ${v2 + v}, ${b + v})`;
    g.fillRect(x, y, w, hh);
    // Relief : bords arrondis (dégradé vers le joint), chaque carreau un peu plus haut ou bas.
    const haut = 200 + Math.round(hasard() * 40 - 20);
    for (let k = 0; k <= bord; k++) {
      const n = Math.round(90 + (haut - 90) * Math.sin((k / bord) * Math.PI / 2));
      gr.fillStyle = `rgb(${n}, ${n}, ${n})`;
      gr.fillRect(x + k, y + k, w - 2 * k, hh - 2 * k);
    }
    if (m.eclats) {
      // Voile plus clair ou plus gris, puis éclats sombres : quelques-uns dans le carreau,
      // davantage en bordure (bords ébréchés).
      for (let k = 0; k < 6; k++) {
        const rx = x + hasard() * w, ry = y + hasard() * hh, rr = px * (0.15 + hasard() * 0.3);
        const d = g.createRadialGradient(rx, ry, 0, rx, ry, rr);
        d.addColorStop(0, hasard() < 0.5 ? 'rgba(205,203,198,0.07)' : 'rgba(250,250,247,0.08)');
        d.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = d;
        g.fillRect(x, y, w, hh);
      }
      const eclat = (ex, ey, taille) => {
        g.fillStyle = `rgba(${55 + hasard() * 30},${55 + hasard() * 30},${55 + hasard() * 30},${0.6 + hasard() * 0.3})`;
        g.beginPath();
        for (let a = 0; a < 6; a++) {
          const r = taille * (0.5 + hasard() * 0.7), t = a / 6 * 2 * Math.PI;
          a ? g.lineTo(ex + Math.cos(t) * r, ey + Math.sin(t) * r) : g.moveTo(ex + Math.cos(t) * r, ey + Math.sin(t) * r);
        }
        g.fill();
        gr.fillStyle = 'rgba(0,0,0,0.6)';
        gr.beginPath(); gr.arc(ex, ey, taille, 0, 2 * Math.PI); gr.fill();
      };
      for (let k = 0; k < 5; k++) eclat(x + 4 + hasard() * (w - 8), y + 4 + hasard() * (hh - 8), 0.5 + hasard() * 0.8);
      for (let k = 0; k < 10; k++) {
        const bordH = hasard() < 0.5, loin = hasard() < 0.5;
        const ex = bordH ? x + hasard() * w : (loin ? x + w - 1.5 : x + 1.5);
        const ey = bordH ? (loin ? y + hh - 1.5 : y + 1.5) : y + hasard() * hh;
        eclat(ex, ey, 0.6 + hasard() * 1.1);
      }
    }
    if (m.ciment) dessinCiment(g, m, x, y, w, (i % 2) + 2 * (j % 2) === 0 ? 0 : (i % 2) && !(j % 2) ? 1 : (i % 2) && (j % 2) ? 2 : 3);
    // Usure : taches plus claires ou foncées, et creux dans le relief.
    if (m.relief && m.usure !== false) for (let k = 0; k < 3 * l * h; k++) {
      const rx = x + bord + hasard() * (w - 2 * bord), ry = y + bord + hasard() * (hh - 2 * bord), rr = px * (0.08 + hasard() * 0.25);
      // Taches floues (dégradé radial) pour éviter les ronds nets.
      const tache = (ctx, rgb, a) => {
        const d = ctx.createRadialGradient(rx, ry, 0, rx, ry, rr);
        d.addColorStop(0, `rgba(${rgb},${a})`);
        d.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = d;
        ctx.fillRect(Math.max(x, rx - rr), Math.max(y, ry - rr), Math.min(x + w, rx + rr) - Math.max(x, rx - rr), Math.min(y + hh, ry + rr) - Math.max(y, ry - rr));
      };
      tache(g, hasard() < 0.5 ? '120,110,95' : '250,245,235', 0.14);
      tache(gr, hasard() < 0.6 ? '0,0,0' : '255,255,255', 0.15);
    }
    // Travertin : petits pores allongés dans le sens de la veine, plus foncés et creux.
    if (m.travertin) {
      const sens = hasard() < 0.5;
      for (let k = 0; k < 2 * l * h; k++) {
        const lg = 2 + hasard() * px * 0.12, px0 = x + 1 + hasard() * (w - lg - 2), py0 = y + 1 + hasard() * (hh - lg - 2);
        const [lw, lh] = sens ? [lg, 1] : [1, lg];
        g.fillStyle = 'rgba(125,110,90,0.18)';
        g.fillRect(px0, py0, lw, lh);
        gr.fillStyle = 'rgba(0,0,0,0.25)';
        gr.fillRect(px0, py0, lw, lh);
      }
    }
    for (let k = 0; k < m.mouchetis * l * h; k++) {
      const sombre = hasard() < 0.5, mx = x + 1 + hasard() * (w - 2), my = y + 1 + hasard() * (hh - 2);
      g.fillStyle = sombre ? 'rgba(130,120,105,0.3)' : 'rgba(255,250,240,0.35)';
      g.fillRect(mx, my, joint, joint);
      if (m.relief && sombre) { gr.fillStyle = 'rgba(0,0,0,0.35)'; gr.fillRect(mx, my, joint, joint); }
    }
  }
  const texture = (toile, couleurs) => {
    const t = new THREE.CanvasTexture(toile);
    if (couleurs) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = rendu.capabilities.getMaxAnisotropy();
    return t;
  };
  return { couleurs: texture(c, true), relief: texture(cr, false) };
}

const textures = {};
// Carrelage { motif, module (cm) } d'une pièce, centré sur elle pour rester symétrique.
function materiauCarrelage(p, { motif, module }) {
  textures[motif] ??= texteCarrelage(motif);
  // Les UV d'une ShapeGeometry sont les coordonnées du plan, en mètres.
  const rep = 1 / (MOTIFS[motif].cases * M(module));
  const [map, bumpMap] = [textures[motif].couleurs, textures[motif].relief].map(source => {
    const t = source.clone();
    t.needsUpdate = true;
    t.repeat.set(rep, rep);
    if (motif === 'carre' && p.origineAvant) {
      // Pose réelle : un croisement de joints au point donné (même quadrillage partout).
      t.offset.set(-M(p.origineAvant[0]) * rep, -M(p.origineAvant[1]) * rep);
    } else if (MOTIFS[motif].centre !== false) {
      const xs = p.poly.map(q => q[0]), ys = p.poly.map(q => q[1]);
      const cx = M((Math.min(...xs) + Math.max(...xs)) / 2), cy = M((Math.min(...ys) + Math.max(...ys)) / 2);
      t.offset.set(0.5 - cx * rep, 0.5 - cy * rep);
    }
    return t;
  });
  const relief = MOTIFS[motif].relief || 0.6;
  return new THREE.MeshStandardMaterial({ map, bumpMap, bumpScale: relief, roughness: MOTIFS[motif].relief ? 0.75 : 0.5 });
}

function materiauSol(p, ph) {
  // carrelageAvant : côté des carreaux actuels (cm) ; carrelageApres : { motif, module }.
  if (ph === 'avant' && p.carrelageAvant) return materiauCarrelage(p, { motif: 'carre', module: p.carrelageAvant });
  if (ph === 'apres' && p.carrelageApres) return materiauCarrelage(p, p.carrelageApres);
  return new THREE.MeshStandardMaterial({ color: p.sol, roughness: 0.85 });
}

// Forme d'une pièce percée d'un rectangle [x0, y0, x1, y1] (trémie), si le rectangle
// tombe dans la pièce ; sinon null. Le trou est gardé 1 cm à l'intérieur du contour.
function formeTrouee(poly, [x0, y0, x1, y1]) {
  if (!dans(poly, (x0 + x1) / 2, (y0 + y1) / 2)) return null;
  const xs = poly.map(q => q[0]), ys = poly.map(q => q[1]);
  const a = Math.max(x0, Math.min(...xs) + 1), b = Math.min(x1, Math.max(...xs) - 1);
  const c = Math.max(y0, Math.min(...ys) + 1), d = Math.min(y1, Math.max(...ys) - 1);
  const forme = formeDe(poly);
  forme.holes.push(new THREE.Path([[a, c], [a, d], [b, d], [b, c]].map(([x, y]) => new THREE.Vector2(M(x), M(y)))));
  const geo = new THREE.ShapeGeometry(forme);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

const plafonds = [];
const plafondsRdc = []; // plafonds des pièces du RDC, montrés en transparence (bouton Plafonds)
for (const p of pieces) {
  const geo = new THREE.ShapeGeometry(formeDe(p.poly));
  geo.rotateX(-Math.PI / 2); // (x, y) du plan → (X, -Z)
  // Un sol par phase quand il change : carrelage actuel en « avant », futur sol en « après ».
  const deuxSols = !p.phase && (p.carrelageAvant || p.carrelageApres);
  for (const ph of deuxSols ? ['avant', 'apres'] : [p.phase]) {
    const solPiece = new THREE.Mesh(geo, materiauSol(p, ph));
    solPiece.position.y = 0.001;
    ajouter(solPiece, ph, false);
  }
  // Le plafond de la pièce où arrive l'escalier est percé par la trémie.
  const plafond = new THREE.Mesh(etage ? formeTrouee(p.poly, etage.tremie) || geo : geo, matPlafond);
  plafond.position.y = H;
  // Le plafond fait de l'ombre : le soleil n'entre que par les fenêtres.
  ajouter(plafond, p.phase, true);
  plafonds.push(plafond);
  plafondsRdc.push(plafond);
  // plafondPeint : [{ poly, couleur }] = zone du plafond peinte (ex. au-dessus de la cuisine).
  for (const z of p.plafondPeint || []) {
    const g = new THREE.ShapeGeometry(formeDe(z.poly));
    g.rotateX(-Math.PI / 2);
    const peint = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: z.couleur, roughness: 0.95, side: THREE.DoubleSide }));
    peint.position.y = H - 0.004;
    peint.userData.peint = true;
    ajouter(peint, p.phase, false);
    plafonds.push(peint);
    plafondsRdc.push(peint);
  }
}

// Pièces de part et d'autre d'une ouverture (à une demi-épaisseur de mur + 15 cm).
function piecesAutour(m, o) {
  const [ax, ay] = m.a, [bx, by] = m.b, lg = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / lg, uy = (by - ay) / lg;
  const mx = ax + ux * (o.pos + o.largeur / 2), my = ay + uy * (o.pos + o.largeur / 2), d = m.ep / 2 + 15;
  return pieces.filter(p => (!p.phase || !m.phase || p.phase === m.phase) &&
    (dans(p.poly, mx - uy * d, my + ux * d) || dans(p.poly, mx + uy * d, my - ux * d)));
}

// Sol continu sous les portes et les passages entre deux pièces (pas de seuil) :
// sans ça, on voit l'herbe dans l'épaisseur du mur. Même sol que la première pièce.
for (const m of murs) for (const o of m.ouvertures || []) {
  if (o.type === 'fenetre' || o.allege > 0) continue;
  const lieux = piecesAutour(m, o);
  if (lieux.length < 2) continue;
  const [ax, ay] = m.a, [bx, by] = m.b, lg = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / lg, uy = (by - ay) / lg;
  const e = m.ep / 2 + 1, s0 = o.pos, s1 = o.pos + o.largeur;
  const coin = (s, d) => [ax + ux * s - uy * d, ay + uy * s + ux * d];
  const geo = new THREE.ShapeGeometry(formeDe([coin(s0, -e), coin(s1, -e), coin(s1, e), coin(s0, e)]));
  geo.rotateX(-Math.PI / 2);
  const p = lieux[0];
  const deuxSols = !p.phase && (p.carrelageAvant || p.carrelageApres);
  const phases = m.phase ? [m.phase] : p.phase ? [p.phase] : deuxSols ? ['avant', 'apres'] : [undefined];
  for (const ph of phases) {
    const raccord = new THREE.Mesh(geo, materiauSol(p, ph));
    raccord.position.y = 0.0012;
    ajouter(raccord, ph, false);
  }
}

// ---------- Éclairage intérieur (bouton Lumière) ----------
// Un spot au plafond au centre de chaque pièce, ou aux points « lampes » de la pièce.
// Lumière sans ombres portées pour rester fluide sur téléphone.
const lampes = [];
const matSpot = new THREE.MeshStandardMaterial({ color: '#f4f1ea', emissive: '#000000', roughness: 0.4 });
for (const p of pieces) {
  const xs = p.poly.map(q => q[0]), ys = p.poly.map(q => q[1]);
  const points = p.lampes || [[(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]];
  for (const [x, y] of points) {
    const lampe = new THREE.PointLight('#fff0dc', 0, 0, 2); // blanc chaud (3000 K environ)
    lampe.position.set(M(x), H - 0.12, -M(y));
    lampe.userData.phase = p.phase;
    scene.add(lampe);
    elements.push(lampe);
    lampes.push(lampe);
    const spot = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 20), matSpot);
    spot.position.set(M(x), H - 0.006, -M(y));
    ajouter(spot, p.phase, false);
    plafonds.push(spot); // caché en vue d'ensemble, comme le plafond
  }
}
// Les spots n'éclairent qu'en visite : en vue d'ensemble, sans plafond, ils éblouiraient.
let lumiere = true;
function reglerLampes(visite) {
  for (const l of lampes) l.intensity = lumiere && visite ? (l.userData.puissance ?? 5) : 0;
  matSpot.emissive.set(lumiere ? '#fff1d6' : '#000000');
  document.getElementById('lumiere')?.setAttribute('aria-pressed', String(lumiere));
}
document.getElementById('lumiere')?.addEventListener('click', () => {
  lumiere = !lumiere;
  reglerLampes(mode === 'visite');
});

for (const o of objets) {
  if (o.type === 'escalier') escalier(o);
  else if (o.type === 'tabouret') tabouret(o);
  else if (o.type === 'meuble') continue; // construits plus bas (mobilier déplaçable)
  else if (o.type === 'spot') {
    // Spot encastré sous un meuble haut : petit disque et lumière douce vers le bas.
    // Cône vers le bas : sans ombres, une lumière ponctuelle éclairerait aussi l'intérieur
    // de la niche à travers la tablette.
    const lampe = new THREE.SpotLight('#fff0dc', 0, 2.5, 1.0, 0.7, 2);
    lampe.position.set(M(o.x), M(o.z) - 0.01, -M(o.y));
    lampe.target.position.set(M(o.x), 0, -M(o.y));
    Object.assign(lampe.userData, { phase: o.phase, puissance: 2.5 });
    scene.add(lampe, lampe.target);
    elements.push(lampe);
    lampes.push(lampe);
    const spot = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 16), matSpot);
    spot.position.set(M(o.x), M(o.z) - 0.003, -M(o.y));
    ajouter(spot, o.phase, false);
  } else {
    const h = M(o.h);
    const mat = o.matiere === 'chene'
      ? new THREE.MeshStandardMaterial({ color: o.couleur, map: veinage(), roughness: 0.65 })
      : new THREE.MeshStandardMaterial({ color: o.couleur, roughness: 0.7 });
    const geo = new THREE.BoxGeometry(M(o.l), h, M(o.p));
    if (o.matiere === 'chene') uvBois(geo, M(o.l), h, M(o.p));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(M(o.x + o.l / 2), M(o.z || 0) + h / 2, -M(o.y + o.p / 2));
    // angle (degrés) : tourne l'objet sur lui-même, pour suivre un mur en biais.
    const angle = (o.angle || 0) * Math.PI / 180;
    mesh.rotation.y = angle;
    ajouter(mesh, o.phase);
    if (!o.z) obstacles.push({ cx: mesh.position.x, cz: mesh.position.z, angle, hl: M(o.l) / 2, he: M(o.p) / 2, phase: o.phase });
  }
}

// Veinage de chêne clair (gris sur blanc, multiplié par la couleur du meuble) :
// fils fins et ondulés, quelques nœuds. Une seule image pour tous les meubles.
function veinage() {
  if (texteVeinage) return texteVeinage;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 512, 512);
  let graine = 11;
  const hasard = () => (graine = (graine * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 170; k++) {
    const x0 = hasard() * 512, amp = 2 + hasard() * 6, per = 80 + hasard() * 200, ph = hasard() * 6.3;
    g.strokeStyle = `rgba(120, 90, 50, ${0.05 + hasard() * 0.12})`;
    g.lineWidth = 0.6 + hasard() * 1.8;
    g.beginPath();
    for (let y = 0; y <= 512; y += 8) {
      const x = x0 + amp * Math.sin(y / per * 6.28 + ph);
      y ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
  }
  for (let k = 0; k < 4; k++) {
    const x = hasard() * 512, y = hasard() * 512;
    g.strokeStyle = 'rgba(110, 80, 45, 0.18)';
    for (let r = 2; r < 12; r += 3) { g.beginPath(); g.ellipse(x, y, r * 0.6, r * 1.8, 0, 0, 6.3); g.stroke(); }
  }
  // Fentes sombres dans le fil, comme sur l'échantillon Chêne San Rémo.
  for (let k = 0; k < 9; k++) {
    const x0 = hasard() * 512, y0 = hasard() * 512, lg = 60 + hasard() * 220;
    g.strokeStyle = `rgba(60, 45, 32, ${0.35 + hasard() * 0.3})`;
    g.lineWidth = 0.8 + hasard() * 1.2;
    g.beginPath();
    for (let y = 0; y <= lg; y += 6) {
      const x = x0 + Math.sin((y0 + y) / 40) * 2 + (hasard() - 0.5) * 1.5;
      y ? g.lineTo(x, (y0 + y) % 512) : g.moveTo(x, y0);
      if ((y0 + y) % 512 < 6 && y) g.moveTo(x, (y0 + y) % 512);
    }
    g.stroke();
  }
  texteVeinage = new THREE.CanvasTexture(c);
  texteVeinage.wrapS = texteVeinage.wrapT = THREE.RepeatWrapping;
  texteVeinage.colorSpace = THREE.SRGBColorSpace;
  texteVeinage.anisotropy = rendu.capabilities.getMaxAnisotropy();
  return texteVeinage;
}

// UV d'une boîte à l'échelle réelle (une image de veinage = 80 cm), pour que le bois
// ne soit pas étiré. Le fil suit la plus grande longueur de chaque face (vertical sur
// les colonnes, en long sur les plans de travail, la crédence et les meubles hauts).
function uvBois(geo, l, h, p) {
  const uv = geo.attributes.uv, echelle = 0.8;
  // Ordre des faces d'une BoxGeometry : +x, -x, +y, -y, +z, -z (4 sommets chacune).
  const tailles = [[p, h], [p, h], [l, p], [l, p], [l, h], [l, h]];
  for (let f = 0; f < 6; f++) {
    const [tu, tv] = tailles[f], tourner = tu > tv;
    for (let k = f * 4; k < f * 4 + 4; k++) {
      const u = uv.getX(k) * tu / echelle, v = uv.getY(k) * tv / echelle;
      tourner ? uv.setXY(k, v, u) : uv.setXY(k, u, v);
    }
  }
  uv.needsUpdate = true;
}

// Tabouret de bar : assise ronde rembourrée, petit dossier, 4 pieds fins et repose-pieds.
// x, y : centre (cm) ; assise : hauteur d'assise ; dos : côté du dossier (angle en degrés,
// 0 = vers l'est, 90 = vers le nord, 180 = vers l'ouest).
// ---------- Mobilier déplaçable ----------
// Meubles modélisés d'après les photos (table, chaises, vaisselier, meuble bas).
// x, y : centre (cm) ; angle (degrés) : 0 = façade vers le sud (−y), -90 = vers l'ouest,
// 90 = vers l'est, 180 = vers le nord. Repère du modèle : largeur sur X, profondeur
// sur Z, façade (ou devant de l'assise) côté +Z. Les positions déplacées par le foyer
// sont enregistrées (Supabase dans l'appli, navigateur sinon) et remplacent celles-ci.
const meubles = [];
let positionsMeubles = {};
try { positionsMeubles = window.MAISON_MOBILIER || JSON.parse(localStorage.getItem('maquette-mobilier') || '{}'); } catch { positionsMeubles = {}; }
// Version de la disposition : quand les places d'origine sont refaites, les positions
// enregistrées avant ne valent plus et sont ignorées (une seule fois).
const VERSION_MOBILIER = 3; // 3 : salon recalé sur les photos du 16/11/2026
// Objets ajoutés par le foyer (achats prévus…) : { id, nom, modele, l, p, h, couleur… }.
// Ils survivent à un changement de version (ils repartent alors en réserve).
const ajouts = Array.isArray(positionsMeubles?._ajouts) ? positionsMeubles._ajouts : [];
if (positionsMeubles?._version !== VERSION_MOBILIER) positionsMeubles = {};
const matsMeuble = {};
function matMeuble(nom) {
  if (matsMeuble[nom]) return matsMeuble[nom];
  // Une couleur « #rrggbb » donne un matériau uni (tissus, laqués, linge).
  if (nom[0] === '#') return (matsMeuble[nom] = new THREE.MeshStandardMaterial({ color: nom, roughness: 0.8 }));
  const bois = (couleur) => new THREE.MeshStandardMaterial({ color: couleur, map: veinage(), roughness: 0.6 });
  const defs = {
    chene: () => bois('#c99a63'), cheneFonce: () => bois('#8f6a47'), teck: () => bois('#c9904f'), lattes: () => bois('#7a5536'),
    pin: () => bois('#d6a86c'), boisClair: () => bois('#dcc19a'), boisFonce: () => bois('#5e4330'),
    noir: () => new THREE.MeshStandardMaterial({ color: '#1d1d1f', roughness: 0.5 }),
    inox: () => new THREE.MeshStandardMaterial({ color: '#b9bcbf', roughness: 0.3, metalness: 0.7 }),
    miroir: () => new THREE.MeshStandardMaterial({ color: '#dfe7ea', roughness: 0.05, metalness: 0.9 }),
    ombre: () => new THREE.MeshStandardMaterial({ color: '#4a4640', roughness: 1 }),
    ecran: () => new THREE.MeshStandardMaterial({ color: '#0d0f12', roughness: 0.2, metalness: 0.3 }),
    porcelaine: () => new THREE.MeshStandardMaterial({ color: '#fbfbf9', roughness: 0.2 }),
    gris: () => new THREE.MeshStandardMaterial({ color: '#8a8d90', roughness: 0.6 }),
    blanc: () => new THREE.MeshStandardMaterial({ color: '#f3f1ea', roughness: 0.55 }),
    metalNoir: () => new THREE.MeshStandardMaterial({ color: '#1e1f21', roughness: 0.45, metalness: 0.4 }),
    metalBlanc: () => new THREE.MeshStandardMaterial({ color: '#f1f1ee', roughness: 0.4, metalness: 0.2 }),
    ceramique: () => new THREE.MeshStandardMaterial({ color: '#6c6a67', roughness: 0.5, bumpMap: grainCrepi, bumpScale: 0.4 }),
    vitre: () => new THREE.MeshStandardMaterial({ color: '#d7e3ea', transparent: true, opacity: 0.35, roughness: 0.1 }),
    joint: () => new THREE.MeshStandardMaterial({ color: '#b9b4aa', roughness: 0.8 }),
    poignee: () => new THREE.MeshStandardMaterial({ color: '#8a6a3a', roughness: 0.4, metalness: 0.6 }),
  };
  return (matsMeuble[nom] = defs[nom]());
}
// Pavé (cm) centré en (x, y, z) dans le repère du meuble, y = hauteur du centre.
function piece3d(g, l, h, p, x, y, z, mat, rx = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(M(l), M(h), M(p)), matMeuble(mat));
  m.position.set(M(x), M(y), M(z));
  m.rotation.set(rx, 0, rz);
  g.add(m);
  return m;
}
// Barre ou lame (cm) tendue entre deux points a et b [x, y, z] du repère du meuble.
function barre3d(g, a, b, larg, ep, mat) {
  const A = new THREE.Vector3(...a.map(M)), B = new THREE.Vector3(...b.map(M)), d = B.clone().sub(A);
  const m = new THREE.Mesh(new THREE.BoxGeometry(M(larg), d.length(), M(ep)), matMeuble(mat));
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  g.add(m);
  return m;
}
const MODELES = {
  // Table à rallonge (photos de Yoann, 16/11) : plateau céramique gris 200 × 95 en deux
  // moitiés (joint au milieu), chant brun, ceinture noire, et sur chaque grand côté deux
  // pieds en V (deux lames noires jointes au sol, l'une penchée vers le bout de la table).
  table: { l: 95, p: 200, construire(g) {
    piece3d(g, 95, 1.2, 200, 0, 75.4, 0, 'ceramique');
    piece3d(g, 95, 1, 200, 0, 74.3, 0, 'boisFonce');
    piece3d(g, 95, 0.2, 0.4, 0, 76.05, 0, 'noir'); // joint de la rallonge
    piece3d(g, 84, 7, 176, 0, 70.3, 0, 'metalNoir');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const pied = [sx * 44, 0, sz * 66];
      barre3d(g, pied, [sx * 39, 67, sz * 52], 7, 2, 'metalNoir');
      barre3d(g, pied, [sx * 39, 67, sz * 86], 7, 2, 'metalNoir');
    }
  } },
  // Chaise en chêne massif : assise 44 × 43 à 46 cm, dossier plein.
  chaise: { l: 44, p: 46, construire(g, o) {
    const b = o.teinte || 'chene';
    piece3d(g, 44, 4, 43, 0, 45, 1, b);
    for (const sx of [-1, 1]) {
      piece3d(g, 4, 45, 4, sx * 19, 22.5, 19, b);            // pieds avant
      piece3d(g, 4, 88, 4, sx * 19, 44, -20, b, -0.06);      // montants arrière
    }
    piece3d(g, 42, 20, 2.5, 0, 76, -21, b, -0.08);           // dossier
  } },
  // Chaise pliante de bistrot : armature blanche, lattes de bois.
  // Photos de Yoann (16/11) : de face, pieds droits avec une barre en bas ; de côté, les
  // pieds se croisent en X (le montant du dossier descend jusqu'au pied avant, le pied
  // arrière part de l'avant de l'assise). Assise 5 lattes, dossier 2 lattes.
  chaisePliante: { l: 42, p: 46, construire(g) {
    for (let k = 0; k < 5; k++) piece3d(g, 40, 1.5, 6.5, 0, 45, -15 + k * 7.6, 'boisClair');
    for (const sx of [-1, 1]) {
      const x = sx * 19;
      barre3d(g, [x, 0, 15], [x, 45, -18], 2, 1.2, 'metalBlanc');   // pied avant → arrière de l'assise
      barre3d(g, [x, 45, -18], [x, 88, -22], 2.5, 1.2, 'metalBlanc'); // montant du dossier
      barre3d(g, [x, 44, 17], [x, 0, -17], 1.6, 1.6, 'metalBlanc');  // pied arrière, croise le premier
      barre3d(g, [x, 44, -18], [x, 44, 17], 1.6, 1.6, 'metalBlanc'); // cadre de l'assise
    }
    piece3d(g, 38, 1, 1, 0, 6, 14, 'metalBlanc');   // barre basse entre les pieds avant
    piece3d(g, 38, 1, 1, 0, 6, -16, 'metalBlanc');
    piece3d(g, 44, 6.5, 1.5, 0, 72, -20.5, 'boisClair', -0.1);
    piece3d(g, 46, 7, 1.5, 0, 84, -21.7, 'boisClair', -0.1);
  } },
  // Vaisselier blanc : buffet bas (3 portes, 3 tiroirs) et haut vitré (3 portes coulissantes).
  // Photos de Yoann (16/11) : bas à 3 tiroirs, un tiroir central dessous, 3 portes, boutons
  // blancs, plinthe ; haut à 3 portes coulissantes vitrées de 2 × 2 carreaux, poignées
  // noires encastrées, corniche moulurée.
  vaisselier: { l: 152, p: 50, construire(g) {
    piece3d(g, 150, 10, 48, 0, 5, 0, 'blanc');
    piece3d(g, 146, 76, 45, 0, 48, -0.5, 'blanc');
    piece3d(g, 154, 3, 51, 0, 87.5, 0.5, 'blanc');
    const z = 22.4, bouton = (x, y) => piece3d(g, 3, 3, 2.5, x, y, z + 1, 'porcelaine');
    piece3d(g, 146, 0.6, 0.4, 0, 71, z, 'joint');
    for (const x of [-24.5, 24.5]) piece3d(g, 0.6, 74, 0.4, x, 47, z, 'joint');
    piece3d(g, 49, 0.6, 0.4, 0, 57, z, 'joint');
    for (const x of [-48, 0, 48]) bouton(x, 78);
    bouton(0, 64); bouton(-30, 46); bouton(30, 46); bouton(-14, 40);
    piece3d(g, 144, 113, 36, 0, 145.5, -7, 'blanc');
    for (const [k, x] of [-47, 0, 47].entries()) {
      for (const dx of [-10.5, 10.5]) for (const y of [122, 168]) piece3d(g, 18, 40, 0.6, x + dx, y, 11.4, 'vitre');
      piece3d(g, 0.6, 108, 0.4, x + 23.5, 145, 11.5, 'joint');
      piece3d(g, 2, 8, 0.5, x + (k === 2 ? -20 : 20), 145, 11.6, 'noir'); // poignée encastrée
    }
    piece3d(g, 152, 3, 40, 0, 203.5, -6, 'blanc');
    piece3d(g, 158, 8, 44, 0, 209, -6, 'blanc');
  } },
  // Meuble bas en bois : deux tiroirs vitrés et deux portes coulissantes.
  buffetBois: { l: 112, p: 46, construire(g) {
    piece3d(g, 108, 78, 44, 0, 41, 0, 'teck');
    piece3d(g, 112, 3, 47, 0, 81.5, 0.5, 'teck');
    piece3d(g, 108, 0.6, 0.4, 0, 60, 22.2, 'joint');
    piece3d(g, 0.6, 78, 0.4, 0, 41, 22.2, 'joint');
    for (const x of [-27, 27]) {
      piece3d(g, 30, 7, 0.4, x, 67, 22.3, 'vitre');
      piece3d(g, 8, 2, 1.5, x, 74, 22.6, 'poignee');
    }
  } },

  // ----- Kit paramétrique : chaque meuble de la vidéo est un « ordre » d'une ligne
  // (maison.js, ORDRES) qui donne le modèle, la place et les cotes l × p × h (cm). -----

  // Caisson : corps plein et façades rangées du bas vers le haut. rangs = « T3:20,P2 » :
  // lettre (P porte, T tiroir, V vitrée, M miroir, C coulissante, O niche ouverte),
  // nombre de cases, hauteur (le dernier rang prend le reste). pieds = hauteur des pieds.
  caisson: { construire(g, o) {
    const { l, p, h } = o, m = o.mat || 'blanc', pz = o.pieds || 0, z = p / 2;
    piece3d(g, l, h - pz, p, 0, pz + (h - pz) / 2, 0, m);
    if (pz) for (const sx of [-1, 1]) for (const sz of [-1, 1]) piece3d(g, 3, pz, 3, sx * (l / 2 - 4), pz / 2, sz * (z - 4), o.matPieds || m);
    let y = pz;
    const rangs = String(o.rangs || 'P2').split(',');
    rangs.forEach((r, i) => {
      // « P2 » = 2 portes ; « MP » = une case miroir puis une case porte.
      const lettres = r.match(/^[A-Z]+/)[0], hr = i === rangs.length - 1 ? h - y : +r.split(':')[1];
      const n = lettres.length > 1 ? lettres.length : parseInt(r.slice(1)) || 1, lw = l / n;
      for (let k = 0; k < n; k++) {
        const t = lettres[Math.min(k, lettres.length - 1)];
        const x = -l / 2 + lw * (k + 0.5), yc = y + hr / 2;
        if (t === 'O') {
          // Niche : fond sombre en retrait et tablette au milieu si la niche est haute.
          // Fond de niche : un peu plus sombre que le meuble (un meuble blanc reste blanc).
          piece3d(g, lw - 3, hr - 3, 0.4, x, yc, z + 0.05, o.fond || (m === 'blanc' ? '#d6d1c8' : 'ombre'));
          if (hr > 45) piece3d(g, lw - 3, 1.8, 0.6, x, yc, z + 0.2, m);
          continue;
        }
        piece3d(g, 0.5, hr, 0.5, x - lw / 2 + 0.25, yc, z + 0.1, 'joint');
        piece3d(g, lw, 0.5, 0.5, x, y + 0.25, z + 0.1, 'joint');
        if (t === 'V') piece3d(g, lw - 8, hr - 8, 0.4, x, yc, z + 0.15, 'vitre');
        if (t === 'M') piece3d(g, lw - 8, hr - 10, 0.4, x, yc, z + 0.2, 'miroir');
        if (t === 'T') piece3d(g, Math.min(14, lw / 3), 1.2, 1.5, x, y + hr - 4, z + 0.7, o.poignee || 'poignee');
        if (t === 'P' || t === 'V' || t === 'M') {
          const cote = n === 1 ? 1 : k < n / 2 ? 1 : -1;
          piece3d(g, 1.2, Math.min(14, hr / 3), 1.5, x + cote * (lw / 2 - 4), yc, z + 0.7, o.poignee || 'poignee');
        }
      }
      y += hr;
    });
    piece3d(g, 0.5, h - pz, 0.5, l / 2 - 0.25, pz + (h - pz) / 2, z + 0.1, 'joint');
  } },
  // Bibliothèque blanche à cases décalées (salon, photos du 18/11) : côté gauche et montant droit
  // pleine hauteur ; rang du haut fermé sur 80 % (niche de droite ouverte, livres penchés) ;
  // rang du milieu : petite case à gauche, grande case jusqu'au montant ; rang du bas : une case
  // sur 73 %, vide à droite. Livres en couleurs dans les cases.
  biblioDecalee: { construire(g, o) {
    const { l, p, h } = o, m = o.mat || 'blanc', e = 2, z = 0, X = f => -l / 2 + f * l;
    const planche = (f0, f1, y) => piece3d(g, (f1 - f0) * l, e, p, X((f0 + f1) / 2), y, z, m);
    const montant = (f, y0, y1) => piece3d(g, e, y1 - y0, p, X(f) + (f === 0 ? e / 2 : f === 1 ? -e / 2 : 0), (y0 + y1) / 2, z, m);
    const fond = (f0, f1, y0, y1) => piece3d(g, (f1 - f0) * l - e, y1 - y0, 0.6, X((f0 + f1) / 2), (y0 + y1) / 2, -p / 2 + 0.3, '#e4e0d8');
    const y1 = h * 0.34, y2 = h * 0.64;
    montant(0, 0, h); montant(1, 0, h * 0.97);
    planche(0, 0.8, h - e / 2); planche(0, 1, y2); planche(0, 1, y1); planche(0, 0.73, e / 2);
    montant(0.8, y2, h); montant(0.29, y1, y2); montant(0.73, 0, y1);
    fond(0, 0.8, y2, h); fond(0, 1, y1, y2); fond(0, 0.73, 0, y1);
    // Livres : tranches de couleurs, hauteur et épaisseur variables, un peu en retrait du bord.
    const teintes = ['#f2efe6', '#e8c33a', '#2f8f8a', '#1f2a3a', '#d8552b', '#f0f0ee', '#c43b6b', '#3d7a3a', '#3a5fa8', '#8a6b4a'];
    let n = 0;
    const livres = (f0, f1, yb, hmax) => {
      for (let x = X(f0) + e + 1; x < X(f1) - e - 2;) {
        const ep = 2 + (n * 7 % 5), hl = hmax * (0.72 + (n * 13 % 9) / 40);
        piece3d(g, ep, hl, p * 0.7, x + ep / 2, yb + e / 2 + hl / 2, z + p * 0.08, teintes[n++ % teintes.length]);
        x += ep + 0.3;
      }
    };
    livres(0, 0.8, y2, h - y2 - 4); livres(0.8, 1, y2, h * 0.3);
    livres(0, 0.29, y1, y2 - y1 - 6); livres(0.29, 1, y1, y2 - y1 - 6);
    livres(0, 0.73, 0, y1 - 6);
  } },
  // Lit : sommier, matelas, couette (linge) sur les deux tiers, oreillers ; tete = tête de lit.
  lit: { construire(g, o) {
    // pieds = hauteur des pieds sous le sommier (lit de Marine : pieds en bois, photos du 16/11).
    const { l, p } = o, h = o.h || 45, m = o.mat || 'blanc', pz = o.pieds || 0;
    piece3d(g, l, h - 20 - pz, p, 0, pz + (h - 20 - pz) / 2, 0, m);
    if (pz) for (const sx of [-1, 1]) for (const sz of [-1, 1]) piece3d(g, 5, pz, 5, sx * (l / 2 - 10), pz / 2, sz * (p / 2 - 12), o.matPieds || 'boisClair');
    piece3d(g, l - 2, 20, p - 2, 0, h - 10, 0, '#f4f2ee');
    piece3d(g, l + 3, 5, p * 0.7, 0, h + 1, p * 0.15, o.linge || '#e9e9e6');
    for (const x of l > 110 ? [-l / 4, l / 4] : [0]) piece3d(g, l > 110 ? l / 2 - 10 : l - 20, 12, 35, x, h + 6, -p / 2 + 22, o.oreiller || '#f6f5f2');
    if (o.tete) piece3d(g, l + 4, o.tete, 6, 0, o.tete / 2, -p / 2 - 3, m);
  } },
  // Canapé : assise, dossier, accoudoirs ; meridienne = g ou d (longueur totale lm).
  canape: { construire(g, o) {
    const { l, p } = o, h = o.h || 85, c = o.couleur || '#8e9196';
    piece3d(g, l, 42, p, 0, 21, 0, c);
    piece3d(g, l, h, 22, 0, h / 2, -p / 2 + 11, c);
    for (const s of [-1, 1]) piece3d(g, 20, 62, p, s * (l / 2 - 10), 31, 0, c);
    for (let k = 1; k < 3; k++) piece3d(g, 0.6, 14, p - 24, -l / 2 + 20 + k * (l - 40) / 3, 42, 10, 'ombre');
    if (o.meridienne) {
      const s = o.meridienne === 'g' ? -1 : 1, lm = o.lm || 160, lw = o.lmLarg || 85;
      piece3d(g, lw, 42, lm - p, s * (l / 2 - lw / 2), 21, p / 2 + (lm - p) / 2, c);
      piece3d(g, 20, 62, lm - p, s * (l / 2 - 10), 31, p / 2 + (lm - p) / 2, c);
    }
  } },
  // Pouf rond ou table basse ronde.
  pouf: { construire(g, o) {
    // carre=1 : gros pouf rectangulaire en tissu (salon, photos du 16/11), coussin sur une base.
    if (o.carre) {
      const c = o.couleur || '#5d5f62';
      piece3d(g, o.l - 4, o.h - 16, o.p - 4, 0, (o.h - 16) / 2, 0, c);
      piece3d(g, o.l, 16, o.p, 0, o.h - 8, 0, c);
      return;
    }
    const m = new THREE.Mesh(new THREE.CylinderGeometry(M(o.l) / 2, M(o.l) / 2, M(o.h), 28), matMeuble(o.couleur || o.mat || 'gris'));
    m.position.y = M(o.h) / 2;
    g.add(m);
  } },
  // Bureau : plateau, pieds (mat) ou caissons ; retour « d60 » = retour d'angle de 60 cm
  // à droite ; ecrans = nombre d'écrans posés au fond.
  bureau: { construire(g, o) {
    const { l, p } = o, h = o.h || 74, m = o.mat || 'boisClair';
    piece3d(g, l, 2.5, p, 0, h - 1.25, 0, m);
    if (o.caissons) for (const s of [-1, 1]) piece3d(g, 40, h - 2.5, p - 4, s * (l / 2 - 21), (h - 2.5) / 2, 0, o.caissons);
    else for (const sx of [-1, 1]) for (const sz of [-1, 1]) piece3d(g, 4, h - 2.5, 4, sx * (l / 2 - 5), (h - 2.5) / 2, sz * (p / 2 - 5), o.pied || 'metalNoir');
    if (o.retour) {
      const s = o.retour[0] === 'g' ? -1 : 1, lr = +o.retour.slice(1);
      piece3d(g, 60, 2.5, lr, s * (l / 2 - 30), h - 1.25, p / 2 + lr / 2, m);
      piece3d(g, 4, h - 2.5, 4, s * (l / 2 - 5), (h - 2.5) / 2, p / 2 + lr - 5, o.pied || 'metalNoir');
    }
    const n = o.ecrans || 0;
    for (let k = 0; k < n; k++) {
      const x = (k - (n - 1) / 2) * 58;
      piece3d(g, 55, 33, 2, x, h + 24, -p / 2 + 14, 'ecran');
      piece3d(g, 4, 8, 4, x, h + 4, -p / 2 + 12, 'noir');
    }
  } },
  // Chaise de bureau pivotante : piètement en étoile, vérin, assise et dossier.
  chaiseBureau: { construire(g, o) {
    const c = o.couleur || '#f2f2f0';
    for (let k = 0; k < 5; k++) {
      const b = piece3d(g, 30, 3, 4, 0, 6, 0, o.pied || 'gris');
      b.rotation.y = k * Math.PI * 2 / 5;
      b.position.set(Math.cos(k * 1.2566) * M(15), M(6), -Math.sin(k * 1.2566) * M(15));
    }
    piece3d(g, 5, 38, 5, 0, 25, 0, o.pied || 'gris');
    piece3d(g, 46, 7, 46, 0, 47, 0, c);
    piece3d(g, 44, 45, 5, 0, 75, -22, c, -0.1);
  } },
  // Tapis : simple épaisseur au sol, ne gêne pas la marche.
  tapis: { construire(g, o) { piece3d(g, o.l, 1.2, o.p, 0, 0.6, 0, o.couleur || '#9a9a98'); } },
  // Table basse : plateau et 4 pieds.
  tableBasse: { construire(g, o) {
    const { l, p } = o, h = o.h || 42, m = o.mat || 'boisClair';
    piece3d(g, l, 4, p, 0, h - 2, 0, m);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) piece3d(g, 5, h - 4, 5, sx * (l / 2 - 5), (h - 4) / 2, sz * (p / 2 - 5), m);
    if (o.tablette) piece3d(g, l - 6, 2, p - 6, 0, 12, 0, m); // tablette basse
  } },
  // Poêle à granulés rond (photos) : cylindre noir brillant, porte vitrée bombée avec la
  // flamme, conduit noir jusqu'au plafond (conduit = longueur).
  // Poêle Jolly Mec (photo du 18/11) : cylindre noir brillant, couvercle plat un peu débordant,
  // bandeau de verre noir en haut de façade, porte avec une haute vitre de flamme au centre
  // (avant = +Z), conduit Ø 15 cm jusqu'au plafond.
  poele: { construire(g, o) {
    const { l, h } = o, r = M(l / 2);
    const laque = new THREE.MeshStandardMaterial({ color: '#0f1012', roughness: 0.18, metalness: 0.35 });
    const corps = new THREE.Mesh(new THREE.CylinderGeometry(r, r, M(h - 3), 48), laque);
    corps.position.y = M((h - 3) / 2);
    g.add(corps);
    const couvercle = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.015, r + 0.015, 0.03, 48), laque);
    couvercle.position.y = M(h - 1.5);
    g.add(couvercle);
    const coque = (y0, y1, ouverture, mat, dr) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r + dr, r + dr, M(y1 - y0), 32, 1, true, -ouverture / 2, ouverture), mat);
      m.position.y = M((y0 + y1) / 2);
      g.add(m);
    };
    const verreNoir = new THREE.MeshStandardMaterial({ color: '#050506', roughness: 0.05, metalness: 0.5, side: THREE.DoubleSide });
    coque(h * 0.78, h * 0.93, 1.6, verreNoir, 0.002);                                   // bandeau en verre
    coque(h * 0.06, h * 0.76, 1.1, new THREE.MeshStandardMaterial({ color: '#1b1c1f', roughness: 0.3, side: THREE.DoubleSide }), 0.003); // porte
    // Vitre : flamme en dégradé (jaune en bas au centre, orange, puis sombre vers les bords).
    const toile = document.createElement('canvas');
    toile.width = 64; toile.height = 128;
    const gc = toile.getContext('2d'), dg = gc.createRadialGradient(32, 110, 4, 32, 100, 80);
    dg.addColorStop(0, '#ffe08a'); dg.addColorStop(0.3, '#f39a2e'); dg.addColorStop(0.6, '#a8380f'); dg.addColorStop(1, '#1a0d08');
    gc.fillStyle = dg; gc.fillRect(0, 0, 64, 128);
    const flamme = new THREE.CanvasTexture(toile);
    flamme.colorSpace = THREE.SRGBColorSpace;
    coque(h * 0.27, h * 0.72, 0.75, new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffffff', emissiveMap: flamme, emissiveIntensity: 0.9, roughness: 0.1, side: THREE.DoubleSide }), 0.005); // vitre
    const c = o.conduit || 160;
    const tuyau = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, M(c), 24), matMeuble('noir'));
    tuyau.position.set(0, M(h + c / 2), 0);
    g.add(tuyau);
  } },
  // Chaise longue (le « morceau de canapé » à part) : piètement métal, assise gris foncé,
  // dossier gris clair au bout (côté -Z).
  chaiseLongue: { construire(g, o) {
    const { l, p } = o;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) piece3d(g, 3, 14, 3, sx * (l / 2 - 5), 7, sz * (p / 2 - 6), 'metalBlanc');
    piece3d(g, l, 6, p, 0, 17, 0, 'gris');
    piece3d(g, l - 4, 14, p - 4, 0, 27, 0, o.couleur || '#4a4c50');
    piece3d(g, l, 45, 16, 0, 52, -p / 2 + 8, o.dos || '#b9b8b3');
    piece3d(g, 14, 22, 45, -l / 2 + 7, 45, -p / 2 + 30, o.dos || '#b9b8b3');
  } },
  // Lampadaire arc : socle, mât qui monte puis s'incurve, abat-jour noir suspendu (en +Z).
  lampadaire: { construire(g, o) {
    const metal = matMeuble('inox'), h = o.h || 200, port = o.p || 120;
    const socle = new THREE.Mesh(new THREE.CylinderGeometry(M(16), M(16), M(3), 24), metal);
    socle.position.y = M(1.5);
    g.add(socle);
    const courbe = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, M(h * 1.15), 0), new THREE.Vector3(0, M(h * 0.82), M(port)));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(courbe, 24, M(1), 6), metal));
    const abat = new THREE.Mesh(new THREE.CylinderGeometry(M(18), M(20), M(22), 24, 1, true), new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.8, side: THREE.DoubleSide }));
    abat.position.set(0, M(h * 0.82 - 14), M(port));
    g.add(abat);
  } },
  // Écran plat (télévision, tableau, miroir, cadre) : panneau mince, posé à z cm du sol.
  panneau: { construire(g, o) {
    piece3d(g, o.l, o.h, o.p || 3, 0, o.h / 2, 0, o.mat || 'ecran');
    if (o.cadre) piece3d(g, o.l - 2 * o.cadre, o.h - 2 * o.cadre, 0.4, 0, o.h / 2, (o.p || 3) / 2 + 0.1, o.fond || '#f4f2ee');
    if (o.pied) piece3d(g, o.l / 3, o.pied, 20, 0, -o.pied / 2, 0, 'noir');
  } },
  // Enceinte colonne.
  enceinte: { construire(g, o) {
    piece3d(g, o.l, o.h, o.p, 0, o.h / 2, 0, o.mat || 'noir');
    piece3d(g, o.l - 4, o.h - 20, 0.4, 0, o.h / 2 + 4, o.p / 2 + 0.1, 'gris');
  } },
  // Piano numérique sur pied en X : caisse, touches blanches et noires.
  piano: { construire(g, o) {
    const { l, p } = o, h = o.h || 75;
    piece3d(g, l, 12, p, 0, h + 6, 0, o.mat || '#d9dadb');
    piece3d(g, l - 12, 2, 15, 0, h + 12.5, p / 2 - 8, 'porcelaine');
    for (let x = -l / 2 + 10; x < l / 2 - 10; x += 2.4 * 7 / 5) piece3d(g, 1.1, 1.2, 9, x, h + 14, p / 2 - 11, 'noir');
    for (const s of [-1, 1]) for (const r of [0.55, -0.55]) piece3d(g, 3, h * 1.15, 3, s * (l / 2 - 25), h / 2, 0, 'noir', 0, r);
  } },
  // Baignoire : coque blanche, fond creusé (plus clair).
  baignoire: { construire(g, o) {
    const { l, p } = o, h = o.h || 56;
    piece3d(g, l, h, p, 0, h / 2, 0, 'porcelaine');
    piece3d(g, l - 14, 1, p - 14, 0, h + 0.1, 0, '#e3eaed');
  } },
  // Meuble double vasque : caisson à tiroirs (mat), plan en chêne, vasques à poser.
  vasques: { construire(g, o) {
    const { l, p } = o, h = o.h || 85;
    MODELES.caisson.construire(g, { l, p, h: h - 3, mat: o.mat || 'gris', rangs: o.rangs || 'T2:40,T2', pieds: o.pieds });
    piece3d(g, l + 1, 3, p + 1, 0, h - 1.5, 0, o.plan || 'chene');
    for (const s of o.n === 1 ? [0] : [-1, 1]) {
      const v = new THREE.Mesh(new THREE.CylinderGeometry(M(20), M(16), M(14), 28), matMeuble('porcelaine'));
      v.position.set(M(s * l / 4), M(h + 7), 0);
      g.add(v);
    }
  } },
  // WC : cuvette, réservoir, abattant (couleur).
  wc: { construire(g, o) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(M(19), M(13), M(40), 24), matMeuble('porcelaine'));
    c.position.set(0, M(20), M(8));
    c.scale.z = 1.4;
    g.add(c);
    piece3d(g, 38, 38, 18, 0, 59, -22, 'porcelaine');
    piece3d(g, 38, 2.5, 48, 0, 41, 8, o.couleur || 'porcelaine');
  } },
  // Lampadaire trépied : trois pieds en bois clair, abat-jour blanc cylindrique.
  trepied: { construire(g, o) {
    const h = o.h || 150;
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI * 2 / 3, pied = piece3d(g, 2.5, h * 0.82, 2.5, Math.cos(a) * 14, h * 0.4, Math.sin(a) * 14, 'boisClair');
      pied.rotation.set(Math.sin(a) * 0.17, 0, -Math.cos(a) * 0.17);
    }
    const abat = new THREE.Mesh(new THREE.CylinderGeometry(M(20), M(20), M(34), 24), new THREE.MeshStandardMaterial({ color: '#f6f3ec', emissive: '#3a3328', roughness: 0.9 }));
    abat.position.y = M(h - 17);
    g.add(abat);
  } },
  // Lave-linge ou sèche-linge : caisse blanche, hublot devant, bandeau de commande.
  lavelinge: { construire(g, o) {
    const { l, p, h } = o;
    piece3d(g, l, h, p, 0, h / 2, 0, 'porcelaine');
    piece3d(g, l - 4, 10, 0.5, 0, h - 7, p / 2 + 0.2, '#e4e6e8');
    const hublot = new THREE.Mesh(new THREE.CylinderGeometry(M(17), M(17), M(1.5), 32), matMeuble('vitre'));
    hublot.rotation.x = Math.PI / 2;
    hublot.position.set(0, M(h * 0.45), M(p / 2 + 0.6));
    const bague = new THREE.Mesh(new THREE.TorusGeometry(M(17), M(2), 8, 32), matMeuble('gris'));
    bague.position.copy(hublot.position);
    g.add(hublot, bague);
  } },
  // Vélo de route : deux roues, cadre en losange, selle, cintre (longueur sur X).
  velo: { construire(g, o) {
    const r = 34, e = o.l / 2 - r, mat = o.mat || '#2b2d31';
    for (const x of [-e, e]) {
      const roue = new THREE.Mesh(new THREE.TorusGeometry(M(r), M(1.5), 8, 32), matMeuble('noir'));
      roue.position.set(M(x), M(r), 0);
      g.add(roue);
    }
    const tube = (x1, y1, x2, y2) => {
      const lg = Math.hypot(x2 - x1, y2 - y1), t = piece3d(g, lg, 3, 3, (x1 + x2) / 2, (y1 + y2) / 2, 0, mat);
      t.rotation.z = Math.atan2(y2 - y1, x2 - x1);
    };
    const pedalier = [-5, 30], selle = [-e + 25, 75], douille = [e - 12, 72];
    tube(-e, r, ...pedalier); tube(-e, r, ...selle); tube(...pedalier, ...selle);
    tube(...pedalier, ...douille); tube(...selle, ...douille); tube(...douille, e, r);
    piece3d(g, 25, 4, 12, selle[0] - 3, 80, 0, 'noir');
    piece3d(g, 4, 3, 42, douille[0] + 4, 84, 0, 'noir');
  } },
  // Coupes (trophées) dorées alignées, posées sur un meuble (z).
  coupes: { construire(g, o) {
    const or = new THREE.MeshStandardMaterial({ color: '#d4a93a', roughness: 0.3, metalness: 0.8 });
    const n = Math.max(1, Math.floor(o.l / 14));
    for (let k = 0; k < n; k++) {
      const h = o.h * (0.7 + 0.3 * ((k * 7) % 3) / 2), x = -o.l / 2 + 7 + k * (o.l - 14) / Math.max(1, n - 1);
      for (const [rh, r1, r2, y] of [[0.15, 4, 4, 0], [0.45, 1, 1, 0.15], [0.4, 6, 2, 0.6]]) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(M(r1), M(r2), M(h * rh), 16), or);
        m.position.set(M(x), M(h * y + h * rh / 2), 0);
        g.add(m);
      }
    }
  } },
  // Fauteuil modulable (photos du 16/11) : cadre et pieds alu, assise gris foncé, dossier et
  // accoudoir gris clair arrondis ; accoudoir = g ou d (vu assis).
  fauteuilModule: { construire(g, o) {
    const { l, p } = o, alu = 'inox', s = o.accoudoir === 'd' ? 1 : -1;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      piece3d(g, 4, 14, 4, sx * (l / 2 - 8), 7, sz * (p / 2 - 8), alu);
      piece3d(g, 9, 1, 9, sx * (l / 2 - 8), 0.5, sz * (p / 2 - 8), alu);
    }
    piece3d(g, l, 8, p, 0, 18, 0, alu);
    piece3d(g, l - 2, 14, p - 2, 0, 29, 0, '#3d3e40');
    piece3d(g, l - 16, 38, 14, -s * 7, 55, -p / 2 + 8, '#c9c6bf');
    piece3d(g, 14, 30, p - 14, s * (l / 2 - 8), 51, 6, '#c9c6bf');
  } },
  // Banquette de table en velours (projet, photos du 16/11) : assise et dossier capitonnés à
  // coutures verticales, dossier légèrement incliné aux bords évasés, 4 pieds noirs écartés.
  banquette: { construire(g, o) {
    const { l, p } = o, h = o.h || 86, c = o.couleur || '#5a5452', ligne = '#3f3a39', pieds = 'metalNoir';
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const haut = [sx * (l / 2 - 18), 38, sz * (p / 2 - 14)], bas = [sx * (l / 2 - 6), 0, sz * (p / 2 - 6)];
      barre3d(g, bas, haut, 3, 3, pieds);
    }
    piece3d(g, l - 6, 10, p - 6, 0, 43, 3, c);
    const n = Math.round(l / 16);
    for (let k = 1; k < n; k++) piece3d(g, 0.5, 0.4, p - 12, -l / 2 + 3 + k * (l - 6) / n, 48.1, 3, ligne);
    const dos = piece3d(g, l, h - 46, 9, 0, 46 + (h - 46) / 2, -p / 2 + 6, c, -0.14);
    for (let k = 1; k < n; k++) piece3d(g, 0.5, h - 52, 0.4, -l / 2 + k * l / n, 46 + (h - 46) / 2, -p / 2 + 10.9, ligne, -0.14);
    for (const sx of [-1, 1]) piece3d(g, 6, h - 46, 14, sx * (l / 2 - 1), 46 + (h - 46) / 2, -p / 2 + 9, c, -0.14, sx * 0.12);
    return dos;
  } },
  // Banc coffre capitonné (projet) : caisson tapissé, assise rembourrée à boutons,
  // petits pieds en bois ; l × p × h.
  bancCoffre: { construire(g, o) {
    const { l, p, h } = o, c = o.couleur || '#cbbfa8', pz = 5;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) piece3d(g, 4, pz, 4, sx * (l / 2 - 5), pz / 2, sz * (p / 2 - 5), o.matPieds || 'chene');
    piece3d(g, l, h - pz - 9, p, 0, pz + (h - pz - 9) / 2, 0, c);
    piece3d(g, l + 1, 9, p + 1, 0, h - 4.5, 0, c);
    piece3d(g, l + 1.2, 0.4, p + 1.2, 0, h - 9, 0, '#a89c86'); // joint du couvercle
    const nx = Math.round(l / 18), nz = 2;
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(M(1), 8, 6), matMeuble('#9d917b'));
      b.position.set(M(-l / 2 + (i + 0.5 + (k % 2) * 0.5) * l / (nx + 0.5)), M(h + 0.2), M(-p / 4 + k * p / 2));
      g.add(b);
    }
  } },
  // Coussins muraux carrés posés en grille : colonnes × rangs de c cm (épaisseur p), joints fins.
  coussinsMuraux: { construire(g, o) {
    const c = o.cote || 45, nx = o.colonnes || Math.round(o.l / c), ny = o.rangs || Math.round(o.h / c), e = o.p || 3.7;
    for (let i = 0; i < nx; i++) for (let k = 0; k < ny; k++) {
      const x = -nx * c / 2 + c / 2 + i * c, y = c / 2 + k * c;
      piece3d(g, c - 0.6, c - 0.6, e - 0.8, x, y, 0, o.couleur || '#d8ccb6');
      piece3d(g, c - 3, c - 3, 0.8, x, y, e / 2 - 0.2, o.couleur || '#d8ccb6'); // bombé du coussin
    }
  } },
  // Coussin / galette d'assise : pavé souple l × p × h, posé à z cm (sur un banc).
  coussin: { construire(g, o) {
    piece3d(g, o.l, o.h, o.p, 0, o.h / 2, 0, o.couleur || '#3f9e9a');
    piece3d(g, o.l + 0.6, 0.6, o.p + 0.6, 0, o.h / 2, 0, o.passepoil || '#2f7f7b'); // couture
  } },
  // Patère murale : planche et crochets (n = nombre de crochets), accrochée à z cm.
  patere: { construire(g, o) {
    const n = o.n || 6, m = o.mat || 'blanc';
    piece3d(g, o.l, 8, 2, 0, 4, 0, m);
    for (let k = 0; k < n; k++) piece3d(g, 3, 3, 5, -o.l / 2 + 10 + k * (o.l - 20) / Math.max(1, n - 1), 4, 3, m, -0.4);
  } },
  // Suspension boule (plumes, papier) : sphère accrochée au plafond (z = bas de la boule).
  suspension: { construire(g, o) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(M(o.l) / 2, 24, 16), new THREE.MeshStandardMaterial({ color: '#fbf8f2', emissive: '#4a4236', roughness: 1 }));
    b.position.y = M(o.l) / 2;
    g.add(b);
  } },
};
function construireMeuble(o) {
  const pos = positionsMeubles[o.id];
  const g = new THREE.Group();
  MODELES[o.modele].construire(g, o);
  g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  // Une place par phase : la place « avant » (positions déjà enregistrées sous l'id) et
  // la place « après » (enregistrée sous id@apres ; par défaut l'option apres=x,y,angle
  // de l'ordre, sinon la même place qu'avant). Un meuble de phase 'avant' n'existe qu'avant.
  const defauts = { avant: { x: o.x, y: o.y, angle: o.angle ?? 0 } };
  const [ax, ay, aa] = String(o.apres ?? '').split(',').map(Number);
  defauts.apres = o.apres ? { x: ax, y: ay, angle: aa || 0 } : { ...defauts.avant };
  // Une place peut porter reserve: true : le meuble est rangé dans la réserve pour cette
  // phase (invisible, ne gêne pas). Un objet ajouté sans place enregistrée est en réserve.
  // reserve=1 dans un ordre : meuble connu mais pas encore placé (Yoann le sort de la réserve).
  // reserve='avant' ou 'apres' : en réserve dans cette phase seulement.
  const defaut = ph => (o.ajout || o.reserve === 1 || o.reserve === true || o.reserve === ph) ? { ...defauts[ph], reserve: true } : defauts[ph];
  const places = o.fixe ? { avant: defauts.avant, apres: defauts.apres } : {
    avant: positionsMeubles[o.id] ?? defaut('avant'),
    apres: positionsMeubles[o.id + '@apres'] ?? defaut('apres'),
  };
  g.userData = { phase: o.phase, meuble: o, defauts, places, ...places.apres };
  if (o.niveau) g.userData.niveau = 1;
  // Emprise au sol mesurée sur le meuble construit (méridienne, retour de bureau compris).
  const boite = new THREE.Box3().setFromObject(g), c = boite.getCenter(new THREE.Vector3());
  g.userData.decale = { x: c.x, z: c.z };
  scene.add(g);
  elements.push(g);
  meubles.push(g);
  // Tapis, cadres, suspensions et meubles posés en hauteur ne gênent pas la marche.
  g.userData.obstacle = { cx: 0, cz: 0, angle: 0, hl: o.libre || o.z ? 0 : (boite.max.x - boite.min.x) / 2, he: o.libre || o.z ? 0 : (boite.max.z - boite.min.z) / 2, phase: o.phase, niveau: o.niveau ? 1 : 0 };
  obstacles.push(g.userData.obstacle);
  placerMeuble(g);
  // Objet ajouté : son modèle 3D, s'il a été fabriqué, porte son id (objets3d/<id>.glb).
  if (o.glb || o.ajout) chargerObjet3d(g, o);
  return g;
}
// Objet 3D fabriqué sur le PC d'après une photo (objets3d/<id>.glb, Hunyuan3D-2) : il
// remplace le modèle simple une fois chargé, mis aux cotes l × p × h de l'ordre et tourné
// de glbAngle degrés. S'il manque (appli en ligne, fichier pas encore fait), le modèle simple reste.
// (chargeur créé au premier appel : les tabourets sont construits avant ce point du fichier)
async function chargerObjet3d(g, o) {
  try {
    const chargeur3d = (chargerObjet3d.chargeur ||= new GLTFLoader());
    // glb: true → objets3d/<id>.glb ; glb: 'nom' → objets3d/<nom>.glb (un modèle pour plusieurs meubles).
    const nom = typeof o.glb === 'string' ? o.glb : o.id;
    const url = window.MAISON_OBJET3D ? await window.MAISON_OBJET3D(nom) : `objets3d/${nom}.glb`;
    if (!url) return;
    const gltf = await chargeur3d.loadAsync(url);
    const modele = gltf.scene;
    modele.rotation.y = (o.glbAngle || 0) * Math.PI / 180;
    const pivot = new THREE.Group();
    pivot.add(modele);
    const boite = new THREE.Box3().setFromObject(pivot), t = boite.getSize(new THREE.Vector3());
    pivot.scale.set(M(o.l) / t.x, M(o.h) / t.y, M(o.p) / t.z);
    const c = boite.getCenter(new THREE.Vector3());
    modele.position.set(-c.x, -boite.min.y, -c.z);
    pivot.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    g.clear();
    g.add(pivot);
    // Le conduit du poêle n'est pas sur la photo découpée : on le remet jusqu'au plafond.
    if (o.conduit) {
      // Il part de 15 cm sous le dessus du poêle : aucun jour entre le poêle et le conduit (Ø 15 cm, photo du 18/11).
      const enfonce = 15, tuyau = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, M(o.conduit + enfonce), 24), matMeuble('noir'));
      tuyau.position.y = M(o.h - enfonce + (o.conduit + enfonce) / 2);
      g.add(tuyau);
    }
  } catch { /* pas de modèle 3D pour cet objet : on garde le modèle simple */ }
}
function placerMeuble(g) {
  const { x, y, angle, meuble: o, decale: d } = g.userData, a = angle * Math.PI / 180;
  g.position.set(M(x), (o.niveau ? BASE_ETAGE : 0) + M(o.z || 0), -M(y));
  g.rotation.y = a;
  const cos = Math.cos(a), sin = Math.sin(a);
  Object.assign(g.userData.obstacle, { cx: M(x) + d.x * cos + d.z * sin, cz: -M(y) - d.x * sin + d.z * cos, angle: a, range: !!g.userData.reserve });
}
for (const o of objets) if (o.type === 'meuble') construireMeuble(o);
for (const o of ajouts) construireMeuble({ ...o, type: 'meuble', ajout: true });

function tabouret(o) {
  const groupe = new THREE.Group();
  const matAssise = new THREE.MeshStandardMaterial({ color: o.couleur || '#e6e1d8', roughness: 0.9 });
  const matPied = new THREE.MeshStandardMaterial({ color: o.pieds || '#1e1e1e', roughness: 0.5, metalness: 0.3 });
  const hA = M(o.assise || 65), r = M(o.diametre || 42) / 2;
  const assise = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.95, 0.07, 28), matAssise);
  assise.position.y = hA - 0.035;
  const dossier = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.2, 28, 1, true, -Math.PI / 2 - 0.9, 1.8), matAssise);
  dossier.material = matAssise.clone();
  dossier.material.side = THREE.DoubleSide;
  dossier.position.y = hA + 0.1;
  groupe.add(assise);
  if (o.dossier !== false) groupe.add(dossier); // dossier: false = tabouret sans dossier
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const pied = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, hA - 0.07, 8), matPied);
    pied.position.set(dx * r * 0.62, (hA - 0.07) / 2, dz * r * 0.62);
    pied.rotation.set(dz * 0.06, 0, -dx * 0.06);
    groupe.add(pied);
  }
  const repose = new THREE.Mesh(new THREE.TorusGeometry(r * 0.7, 0.01, 6, 24), matPied);
  repose.rotation.x = Math.PI / 2;
  repose.position.y = 0.25;
  groupe.add(repose);
  groupe.position.set(M(o.x), 0, -M(o.y));
  // Le dossier est dessiné côté -X local : on tourne le tabouret pour le mettre du côté voulu.
  groupe.rotation.y = ((o.dos ?? 180) - 180) * Math.PI / 180;
  if (o.glb) chargerObjet3d(groupe, { l: o.diametre || 42, p: o.diametre || 42, h: o.assise || 65, ...o });
  groupe.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  groupe.userData.phase = o.phase;
  scene.add(groupe);
  elements.push(groupe);
  obstacles.push({ cx: M(o.x), cz: -M(o.y), angle: 0, hl: r, he: r, phase: o.phase });
}

// Escalier à quart tournant double (demi-tour à gauche), marches ouvertes,
// comme sur le plan et la photo : départ côté ouest/sud, volée vers l'est,
// marches balancées autour du noyau, puis volée vers l'ouest côté nord.
function escalier(o) {
  // n marches, puis le palier : n + 1 hauteurs jusqu'au plancher de l'étage.
  const n = o.marches, marche = (H + M(o.dalle)) / (n + 1);
  const mat = new THREE.MeshStandardMaterial({ color: '#9a9a96', roughness: 0.8 });
  const bas = o.bas, haut = o.haut, tour = n - bas - haut;
  const x0 = o.x, y0 = o.y, x1 = o.x + o.l, y1 = o.y + o.p;
  const cx = x1 - o.p / 2, cy = y0 + o.p / 2, w = o.p * 0.45, ep = 4;
  const gb = (cx - x0) / bas, gh = (cx - x0) / haut;
  // Point où un rayon partant du noyau touche le bord de la cage.
  const rayon = a => {
    const dx = Math.cos(a), dy = Math.sin(a);
    let t = Infinity;
    if (dx > 1e-9) t = Math.min(t, (x1 - cx) / dx);
    if (dx < -1e-9) t = Math.min(t, (x0 - cx) / dx);
    if (dy > 1e-9) t = Math.min(t, (y1 - cy) / dy);
    if (dy < -1e-9) t = Math.min(t, (y0 - cy) / dy);
    return [cx + dx * t, cy + dy * t];
  };
  const coins = [[x1, y0], [x1, y1]].map(p => ({ p, a: Math.atan2(p[1] - cy, p[0] - cx) }));
  for (let i = 0; i < n; i++) {
    let pts;
    if (i < bas) {
      const xa = x0 + i * gb;
      pts = [[xa, y0], [xa + gb, y0], [xa + gb, y0 + w], [xa, y0 + w]];
    } else if (i < bas + tour) {
      const pas = Math.PI / tour, a1 = -Math.PI / 2 + (i - bas) * pas, a2 = a1 + pas;
      pts = [[cx, cy], rayon(a1), ...coins.filter(c => c.a > a1 && c.a < a2).map(c => c.p), rayon(a2)];
    } else {
      const xa = cx - (i - bas - tour + 1) * gh;
      pts = [[xa, y1 - w], [xa + gh, y1 - w], [xa + gh, y1], [xa, y1]];
    }
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(M(x), M(y)))), { depth: M(ep), bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = marche * (i + 1) - M(ep);
    ajouter(mesh);
  }
  // Limons : planches inclinées sous les deux volées droites.
  const limon = (xa, xb, y, ha, hb) => {
    const dx = M(xb - xa), dh = hb - ha;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(dx, dh), 0.25, 0.04), mat);
    mesh.position.set(M(xa) + dx / 2, (ha + hb) / 2 - 0.06, -M(y));
    mesh.rotation.z = Math.atan2(dh, dx);
    ajouter(mesh);
  };
  const hTour = marche * bas, hHaut = marche * (bas + tour), hFin = marche * (n + 1);
  limon(x0, cx, y0 + 2, 0, hTour); limon(x0, cx, y0 + w - 2, 0, hTour);
  limon(cx, x0, y1 - 2, hHaut, hFin); limon(cx, x0, y1 - w + 2, hHaut, hFin);
  // Rampe (photos) : barreaux gris tous les 12 cm et main courante à 90 cm,
  // côté hall et autour du tournant, et des deux côtés du jour central.
  // Chaque point : [x, y, hauteur du dessus de marche en m].
  const rampe = pts => {
    for (let k = 1; k < pts.length; k++) {
      const [xa, ya, ha] = pts[k - 1], [xb, yb, hb] = pts[k];
      const nb = Math.max(1, Math.round(Math.hypot(xb - xa, yb - ya) / 12));
      for (let s = 0; s <= nb; s++) {
        if (s === nb && k < pts.length - 1) continue;
        const t = s / nb, h = ha + (hb - ha) * t;
        const barreau = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.9, 0.035), mat);
        barreau.position.set(M(xa + (xb - xa) * t), h + 0.45, -M(ya + (yb - ya) * t));
        ajouter(barreau);
      }
      const a = new THREE.Vector3(M(xa), ha + 0.92, -M(ya)), b = new THREE.Vector3(M(xb), hb + 0.92, -M(yb));
      const main = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.045, a.distanceTo(b) + 0.03), mat);
      main.position.copy(a).lerp(b, 0.5);
      main.lookAt(b);
      ajouter(main);
    }
  };
  const dessus = i => marche * (i + 1);
  rampe([[x0 + 4, y0 + 2, dessus(0)], [cx, y0 + 2, dessus(bas)],
    [x1 - 2, y0 + 2, dessus(bas + tour / 4)], [x1 - 2, y1 - 2, dessus(bas + tour * 3 / 4)]]);
  rampe([[x0 + 4, y0 + w - 2, dessus(0)], [cx, y0 + w - 2, dessus(bas)]]);
  rampe([[cx, y1 - w + 2, dessus(bas + tour - 1)], [x0 + 4, y1 - w + 2, dessus(n - 1)]]);
  // Noyau central et poteau de départ.
  for (const [x, y, h] of [[cx, cy, hFin], [x0 + 4, y0 + w - 4, 1]]) {
    const poteau = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, 0.08), mat);
    poteau.position.set(M(x), h / 2, -M(y));
    ajouter(poteau);
  }
  // Pas d'obstacle : on peut monter. La hauteur sous les pieds suit les marches
  // (hauteurEscalier), et on ne peut pas entrer dans la cage par le côté.
  infoEscalier = { x0, y0, x1, y1, cx, cy, gb, gh, bas, tour, n, marche };
}

// ---------- Étiquettes des pièces ----------

const conteneurEtiquettes = document.getElementById('etiquettes');
const etiquettes = pieces.map(p => {
  const el = document.createElement('span');
  el.textContent = p.nom;
  conteneurEtiquettes.append(el);
  const [sx, sy] = p.poly.reduce(([a, b], [x, y]) => [a + x, b + y], [0, 0]);
  return { el, p, pos: new THREE.Vector3(M(sx / p.poly.length), 0.1, -M(sy / p.poly.length)) };
});

// ---------- Cotes (bouton Cotes, vue d'ensemble) ----------
// Longueur intérieure de chaque côté de pièce (les pièces sont tracées au nu
// intérieur des murs) et largeur de chaque ouverture, avec un trait de cote.
const cotes = [];
const matCote = new THREE.LineBasicMaterial({ color: '#1f6fd1' });
let cotesVisibles = false;
const enMetres = cm => `${(cm / 100).toFixed(2).replace('.', ',')} m`;
function coter([ax, ay], [bx, by], hauteur, texte, phase, classe = 'cote', lieux = []) {
  const lg = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / lg, uy = (by - ay) / lg;
  const t = 7; // demi-longueur des petits traits d'extrémité (cm)
  const pts = [[ax, ay], [bx, by], [ax - uy * t, ay + ux * t], [ax + uy * t, ay - ux * t], [bx - uy * t, by + ux * t], [bx + uy * t, by - ux * t]]
    .map(([x, y]) => new THREE.Vector3(M(x), hauteur, -M(y)));
  const ligne = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), matCote);
  ligne.visible = false;
  scene.add(ligne);
  const el = document.createElement('span');
  el.className = classe;
  el.textContent = texte;
  el.style.display = 'none';
  conteneurEtiquettes.append(el);
  cotes.push({ el, ligne, phase, lieux, pos: new THREE.Vector3(M((ax + bx) / 2), hauteur, -M((ay + by) / 2)) });
}
// Ouvertures portées par un côté de pièce : celles d'un mur parallèle à ce côté,
// à moins d'une demi-épaisseur de mur, dont le milieu tombe sur le côté.
// Renvoie [{ s, e, phase }] en cm le long du côté.
function ouverturesDuCote(a, b) {
  const lg = Math.hypot(b[0] - a[0], b[1] - a[1]), ex = (b[0] - a[0]) / lg, ey = (b[1] - a[1]) / lg;
  const surCote = ([x, y]) => (x - a[0]) * ex + (y - a[1]) * ey;
  const trouvees = [];
  for (const m of murs) {
    if (!m.ouvertures) continue;
    const [ax, ay] = m.a, [bx, by] = m.b, lm = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / lm, uy = (by - ay) / lm;
    if (Math.abs(ux * ey - uy * ex) > 0.05) continue; // pas parallèle
    for (const o of m.ouvertures) {
      const point = d => [ax + ux * d, ay + uy * d];
      const [mx, my] = point(o.pos + o.largeur / 2);
      const ecart = Math.abs((mx - a[0]) * ey - (my - a[1]) * ex);
      const t = surCote([mx, my]);
      if (ecart > m.ep / 2 + 4 || t < 0 || t > lg) continue;
      const s = Math.max(0, Math.min(surCote(point(o.pos)), surCote(point(o.pos + o.largeur))));
      const e = Math.min(lg, Math.max(surCote(point(o.pos)), surCote(point(o.pos + o.largeur))));
      trouvees.push({ s, e, phase: m.phase });
    }
  }
  return trouvees;
}
for (const p of pieces) {
  const xs = p.poly.map(q => q[0]), ys = p.poly.map(q => q[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  p.poly.forEach((a, i) => {
    const b = p.poly[(i + 1) % p.poly.length];
    const lg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (lg < 3) return;
    const ex = (b[0] - a[0]) / lg, ey = (b[1] - a[1]) / lg;
    let nx = -ey, ny = ex;
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    if (nx * (cx - mx) + ny * (cy - my) < 0) { nx = -nx; ny = -ny; } // vers l'intérieur
    const le = (t, d) => [a[0] + ex * t + nx * d, a[1] + ey * t + ny * d];
    // Une pièce qui n'existe qu'après travaux ne garde que les ouvertures de sa phase.
    const ouvertures = ouverturesDuCote(a, b).filter(o => !p.phase || !o.phase || o.phase === p.phase);
    // Longueur totale du côté ; plus loin du mur s'il y a une chaîne de cotes devant.
    coter(le(0, ouvertures.length ? 48 : 22), le(lg, ouvertures.length ? 48 : 22), 0.03, enMetres(lg), p.phase, 'cote', [p]);
    // Chaîne de cotes par phase : morceaux de mur pleins entre les ouvertures.
    const phases = [...new Set(ouvertures.map(o => o.phase))];
    const parPhase = !ouvertures.length ? [] : phases.some(ph => ph) ? phases.filter(ph => ph) : [undefined];
    for (const ph of parPhase) {
      const liste = ouvertures.filter(o => !o.phase || o.phase === ph).sort((u, w) => u.s - w.s);
      let t = 0;
      for (const o of [...liste, { s: lg, e: lg }]) {
        if (o.s - t >= 2) coter(le(t, 22), le(o.s, 22), 0.03, enMetres(o.s - t), p.phase || ph, 'cote', [p]);
        t = Math.max(t, o.e);
      }
    }
  });
}
// Pièces ouvertes l'une sur l'autre (passage, arche) : en visite, on voit aussi
// les cotes de la pièce d'à côté.
const liens = [];
for (const m of murs) for (const o of m.ouvertures || []) {
  const [ax, ay] = m.a, [bx, by] = m.b, lg = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / lg, uy = (by - ay) / lg;
  const lieux = piecesAutour(m, o);
  if ((o.type === 'passage' || o.type === 'arche') && lieux.length === 2) liens.push({ a: lieux[0], b: lieux[1], phase: m.phase });
  coter([ax + ux * o.pos, ay + uy * o.pos], [ax + ux * (o.pos + o.largeur), ay + uy * (o.pos + o.largeur)],
    H + 0.03, `↔ ${enMetres(o.largeur)}`, m.phase, 'cote ouverture', lieux);
  const c = cotes[cotes.length - 1];
  c.posVisite = c.pos.clone();
  c.posVisite.y = Math.min(H, M(o.haut)) - 0.07; // juste sous le linteau, dans le vide de l'ouverture
}
function reglerCotes() {
  for (const c of cotes) {
    c.ligne.visible = cotesVisibles && visible(c.phase) && niveauMontre(c.niveau);
    // En visite, la cote d'une ouverture descend juste sous le haut de l'ouverture
    // (en vue d'ensemble, elle est posée sur le dessus du mur).
    c.ligne.position.y = mode === 'visite' && c.posVisite ? c.posVisite.y - c.pos.y : 0;
  }
  document.getElementById('cotes')?.setAttribute('aria-pressed', String(cotesVisibles));
}
document.getElementById('cotes')?.addEventListener('click', () => {
  cotesVisibles = !cotesVisibles;
  reglerCotes();
});

// ---------- Étage ----------
// Combles : murs découpés sous le toit, plancher percé par la trémie, rampants,
// plafond plat, fenêtres de toit. Chaque élément porte userData.niveau = 1 pour le
// bouton Étage (vue d'ensemble) ; le toit (userData.toit) n'apparaît qu'en visite.
const piecesEtage = etage ? etage.pieces.map(p => ({ ...p, niveau: 1 })) : [];
const toit = etage?.toit;
// Hauteur sous toit (cm, au-dessus du plancher de l'étage) en un point du plan.
function hauteurToit(x, y) {
  // Dans l'épaisseur d'un mur bas, on garde la hauteur de sa face intérieure : le
  // haut du mur rejoint ainsi le rampant, sans jour.
  const yc = Math.max(toit.ySud, Math.min(toit.yNord, y));
  let h = Math.min(toit.plafond, toit.hSud + toit.pente * (yc - toit.ySud), toit.hNord + toit.pente * (toit.yNord - yc));
  // Avancée : son propre rampant, du mur bas du fond jusqu'au plafond plat.
  const l = toit.lucarne;
  const yPlafondNord = toit.yNord - (toit.plafond - toit.hNord) / toit.pente; // début du plafond plat côté nord
  if (l && x >= l.x0 - 4 && x <= l.x1 + 4 && y <= l.yFond + 6 && y >= yPlafondNord) {
    h = Math.max(h, Math.min(toit.plafond, l.hFond + toit.pente * (l.yFond - Math.min(y, l.yFond))));
  }
  return Math.max(h, 0);
}
function ajouterEtage(mesh, extra = {}) {
  mesh.position.y += BASE_ETAGE;
  Object.assign(mesh.userData, { niveau: 1 }, extra);
  return mesh;
}
// Mur de l'étage : pans pleins entre les ouvertures, dont le haut suit le toit.
function murEtage(m) {
  const [ax, ay] = m.a, [bx, by] = m.b, lg = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / lg, uy = (by - ay) / lg;
  const haut = u => hauteurToit(ax + ux * u, ay + uy * u);
  const pan = (s, e, bas, plafonne) => {
    if (e - s < 0.5) return;
    const pts = [[s, bas], [e, bas]];
    for (let u = e; u >= s - 1e-6; u -= Math.min(10, Math.max(e - s, 0.5))) pts.push([u, plafonne ?? haut(u)]);
    if (pts[pts.length - 1][0] > s) pts.push([s, plafonne ?? haut(s)]);
    if (pts.slice(2).every(([, v]) => v - bas < 0.5)) return;
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(M(u), M(Math.max(v, bas))))), { depth: M(m.ep), bevelEnabled: false });
    geo.translate(0, 0, -M(m.ep) / 2);
    const mesh = new THREE.Mesh(geo, matMur);
    mesh.position.set(M(ax), 0, -M(ay));
    mesh.rotation.y = Math.atan2(by - ay, bx - ax);
    ajouter(ajouterEtage(mesh), undefined, true);
    piecesDeMur.push(mesh);
    if (bas < 120) obstacles.push({ cx: M(ax + ux * (s + e) / 2), cz: -M(ay + uy * (s + e) / 2), angle: Math.atan2(by - ay, bx - ax), hl: M(e - s) / 2, he: M(m.ep) / 2, niveau: 1 });
  };
  let t = 0;
  for (const o of (m.ouvertures || []).slice().sort((p, q) => p.pos - q.pos)) {
    pan(t, o.pos, 0);
    pan(o.pos, o.pos + o.largeur, o.haut);                       // linteau
    if (o.allege > 0) pan(o.pos, o.pos + o.largeur, 0, o.allege); // allège
    if (o.type === 'fenetre') {
      const vitre = new THREE.Mesh(new THREE.BoxGeometry(M(o.largeur), M(o.haut - o.allege), 0.02), matVitre);
      vitre.position.set(M(ax + ux * (o.pos + o.largeur / 2)), M((o.allege + o.haut) / 2), -M(ay + uy * (o.pos + o.largeur / 2)));
      vitre.rotation.y = Math.atan2(by - ay, bx - ax);
      ajouter(ajouterEtage(vitre), undefined, false);
    }
    t = o.pos + o.largeur;
  }
  pan(t, lg, 0);
}
// Surface plane du toit à partir de points du plan (cm) et de leur hauteur (cm).
const matToit = new THREE.MeshStandardMaterial({ color: '#fbfaf7', roughness: 1, side: THREE.DoubleSide });
const matFenetreToit = new THREE.MeshStandardMaterial({ color: '#bcd6ea', emissive: '#6f8fa8', roughness: 0.2, side: THREE.DoubleSide });
function surfaceToit(points, materiau = matToit, decalage = 0) {
  const geo = new THREE.BufferGeometry().setFromPoints(points.map(([x, y, h]) => new THREE.Vector3(M(x), M(h) - decalage, -M(y))));
  geo.setIndex(points.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2]);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, materiau);
  ajouter(ajouterEtage(mesh, { toit: true }), undefined, true);
  plafonds.push(mesh);
  return mesh;
}
if (etage) {
  // Planchers (la mezzanine est percée par la trémie).
  for (const p of piecesEtage) {
    const geo = formeTrouee(p.poly, etage.tremie) || (() => { const g = new THREE.ShapeGeometry(formeDe(p.poly)); g.rotateX(-Math.PI / 2); return g; })();
    const sol = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: p.sol, roughness: 0.85 }));
    sol.position.y = 0.001;
    ajouter(ajouterEtage(sol), undefined, false);
  }
  // Chants de la dalle autour de la trémie (entre le plafond du RDC et le plancher).
  const [t0, t1, t2, t3] = etage.tremie, ep = BASE_ETAGE - H;
  for (const [x, y, l, p] of [[t0, t1, t2 - t0, 1], [t0, t3 - 1, t2 - t0, 1], [t0, t1, 1, t3 - t1], [t2 - 1, t1, 1, t3 - t1]]) {
    const chant = new THREE.Mesh(new THREE.BoxGeometry(M(l), ep, M(p)), matMur);
    chant.position.set(M(x + l / 2), H + ep / 2, -M(y + p / 2));
    ajouter(chant, undefined, false);
  }
  etage.murs.forEach(murEtage);
  // Toit : rampants sud et nord, plafond plat, lucarne de la mezzanine.
  const { xOuest: xo, xEst: xe, ySud: ys, yNord: yn, hSud, hNord, pente, plafond: hp, lucarne: l } = toit;
  const ys2 = ys + (hp - hSud) / pente, yn2 = yn - (hp - hNord) / pente;
  surfaceToit([[xo, ys, hSud], [xe, ys, hSud], [xe, ys2, hp], [xo, ys2, hp]]);
  surfaceToit([[xo, ys2, hp], [xe, ys2, hp], [xe, yn2, hp], [xo, yn2, hp]]);
  const morceauxNord = l ? [[xo, l.x0], [l.x1, xe]] : [[xo, xe]];
  for (const [a, b] of morceauxNord) surfaceToit([[a, yn, hNord], [b, yn, hNord], [b, yn2, hp], [a, yn2, hp]]);
  if (l) {
    // Rampant de l'avancée, plafond plat jusqu'au plafond général, et jouée côté est
    // (triangle entre les deux rampants ; côté ouest, la cloison de la chambre 3 la ferme).
    const yHaut = l.yFond - (hp - l.hFond) / pente;
    surfaceToit([[l.x0, l.yFond, l.hFond], [l.x1, l.yFond, l.hFond], [l.x1, yHaut, hp], [l.x0, yHaut, hp]]);
    if (yHaut > yn2) surfaceToit([[l.x0, yHaut, hp], [l.x1, yHaut, hp], [l.x1, yn2, hp], [l.x0, yn2, hp]]);
    // Jouée : du mur bas jusqu'au plafond plat, entre le rampant principal et celui de l'avancée.
    surfaceToit([[l.x1, yn, hNord], [l.x1, yn, Math.min(hp, l.hFond + pente * (l.yFond - yn))], [l.x1, Math.min(yHaut, yn), hp], [l.x1, yn2, hp]]);
  }
  // Fenêtres de toit : posées 1 cm sous le rampant.
  for (const f of etage.fenetresToit || []) {
    const [x0, y0, x1, y1] = f.r;
    surfaceToit([[x0, y0, hauteurToit(x0, y0)], [x1, y0, hauteurToit(x1, y0)], [x1, y1, hauteurToit(x1, y1)], [x0, y1, hauteurToit(x0, y1)]], matFenetreToit, 0.01);
  }
  // Garde-corps autour de la trémie, sauf côté arrivée de l'escalier (ouest, en haut).
  const matGarde = new THREE.MeshStandardMaterial({ color: '#9a9a96', roughness: 0.8 });
  const garde = ([ax, ay], [bx, by]) => {
    const lg = Math.hypot(bx - ax, by - ay), nb = Math.max(1, Math.round(lg / 12));
    for (let k = 0; k <= nb; k++) {
      const barreau = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.9, 0.035), matGarde);
      barreau.position.set(M(ax + (bx - ax) * k / nb), 0.45, -M(ay + (by - ay) * k / nb));
      ajouter(ajouterEtage(barreau), undefined, true);
    }
    const main = new THREE.Mesh(new THREE.BoxGeometry(M(lg) + 0.03, 0.045, 0.055), matGarde);
    main.position.set(M((ax + bx) / 2), 0.92, -M((ay + by) / 2));
    main.rotation.y = Math.atan2(by - ay, bx - ax);
    ajouter(ajouterEtage(main), undefined, true);
  };
  const e = infoEscalier;
  if (e) {
    // Côté sud, sous le rampant : pas de garde-corps (remarque de Yoann). Une barrière
    // longe la trémie côté ouest, avant la sortie de l'escalier.
    const arrivee = e.y1 - (e.y1 - e.y0) * 0.45; // début de la volée du haut
    garde([t0, t3], [t2, t3]);
    garde([t0, etage.debutGardeOuest ?? t1], [t0, arrivee]);
  }
  // Spots, étiquettes et cotes des pièces de l'étage.
  for (const p of piecesEtage) {
    const xs = p.poly.map(q => q[0]), ys = p.poly.map(q => q[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const lampe = new THREE.PointLight('#fff0dc', 0, 0, 2);
    lampe.position.set(M(cx), BASE_ETAGE + M(hauteurToit(cx, cy)) - 0.12, -M(cy));
    lampe.userData.niveau = 1;
    scene.add(lampe);
    elements.push(lampe);
    lampes.push(lampe);
    const el = document.createElement('span');
    el.textContent = p.nom;
    conteneurEtiquettes.append(el);
    etiquettes.push({ el, p, pos: new THREE.Vector3(M(cx), BASE_ETAGE + 0.1, -M(cy)) });
    p.poly.forEach((a, i) => {
      const b = p.poly[(i + 1) % p.poly.length];
      const lg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (lg < 3) return;
      let nx = -(b[1] - a[1]) / lg, ny = (b[0] - a[0]) / lg;
      if (nx * (cx - (a[0] + b[0]) / 2) + ny * (cy - (a[1] + b[1]) / 2) < 0) { nx = -nx; ny = -ny; }
      coter([a[0] + nx * 22, a[1] + ny * 22], [b[0] + nx * 22, b[1] + ny * 22], BASE_ETAGE + 0.03, enMetres(lg), undefined, 'cote', [p]);
      cotes[cotes.length - 1].niveau = 1;
    });
  }
}

// ---------- Toit extérieur (ardoise) ----------
// Toit à deux pans sur le corps de la maison, faîtage est-ouest au milieu (y = 469,
// comme le faîtage de l'étage), pignons à l'ouest et à l'est ; toit à quatre pans
// sur le garage. Pente et débords supposés (40°, 30 cm) : à confirmer.
// Visible en visite (on le voit de dehors) et, en vue d'ensemble, avec le bouton Toit.
const toitDehors = [];
function pan(points, materiau = matArdoise, phase) {
  const geo = new THREE.BufferGeometry().setFromPoints(points.map(([x, y, h]) => new THREE.Vector3(M(x), M(h), -M(y))));
  geo.setIndex(points.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2]);
  geo.computeVertexNormals();
  // Coordonnées de texture en mètres, rangs d'ardoise parallèles à l'égout : le long de
  // l'égout (x ou z selon le pan) et dans la pente (longueur vraie, en tenant compte de la hauteur).
  const n = geo.attributes.normal, pos = geo.attributes.position, uv = [];
  const versZ = Math.abs(n.getZ(0)) >= Math.abs(n.getX(0));
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    uv.push(versZ ? x : z, Math.hypot(versZ ? z : x, y) * Math.sign(y || 1));
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const mesh = new THREE.Mesh(geo, materiau);
  mesh.material.side = THREE.DoubleSide;
  ajouter(mesh, phase, true);
  mesh.userData.toitDehors = true;
  toitDehors.push(mesh);
}
if (etage) {
  const p = 0.84, deb = 30, egout = 255;
  const [xo, xe, ys, yn] = [320 - deb, 1578 + deb, 0 - deb, 938 + deb], yf = 469;
  const hf = egout + p * (yf - ys);
  pan([[xo, ys, egout], [xe, ys, egout], [xe, yf, hf], [xo, yf, hf]]);
  pan([[xo, yn, egout], [xe, yn, egout], [xe, yf, hf], [xo, yf, hf]]);
  // Pignons en crépi (triangles au-dessus des murs).
  for (const x of [320, 1578]) pan([[x, -deb, H * 100], [x, 938 + deb, H * 100], [x, yf, hf]], matCrepiPignon);
  // Garage : un seul pan, adossé à la maison (dit par Yoann le 18/11) : égout côté limite
  // ouest, il monte vers le pignon de la maison. Pente supposée 35°, à confirmer.
  const pg = 0.7, [gx0, gx1, gy0, gy1] = [0 - 20, 320, 145 - 20, 791 + 20], ge = 250, gh = ge + pg * (gx1 - gx0);
  pan([[gx0, gy0, ge], [gx0, gy1, ge], [gx1, gy1, gh], [gx1, gy0, gh]]);
  // Murs en triangle au nord et au sud, sous le pan.
  for (const y of [145, 791]) pan([[0, y, ge], [320, y, ge], [320, y, ge + pg * (320 - gx0)]], matCrepiPignon);

  // Velux (plan de masse DPC02 et photos) : trois sur le pan nord, dont un double, un sur le
  // pan sud. Cadre gris et vitre sombre, posés à plat sur l'ardoise. Tailles estimées sur le plan.
  const hToit = y => (y < yf ? egout + p * (y - ys) : egout + p * (yn - y)) + 3;
  const matCadreVelux = new THREE.MeshStandardMaterial({ color: '#5a5e63', roughness: 0.5 });
  const matVitreVelux = new THREE.MeshStandardMaterial({ color: '#27313b', roughness: 0.15, metalness: 0.3 });
  const velux = (xc, y0, y1, l) => {
    const [xa, xb] = [xc - l / 2, xc + l / 2];
    pan([[xa, y0, hToit(y0)], [xb, y0, hToit(y0)], [xb, y1, hToit(y1)], [xa, y1, hToit(y1)]], matCadreVelux);
    const [ia, ib, j0, j1] = [xa + 7, xb - 7, y0 + 6, y1 - 6];
    pan([[ia, j0, hToit(j0) + 1], [ib, j0, hToit(j0) + 1], [ib, j1, hToit(j1) + 1], [ia, j1, hToit(j1) + 1]], matVitreVelux);
  };
  velux(530, 650, 770, 78);
  velux(842, 560, 680, 78); velux(842, 700, 820, 78);
  velux(1394, 650, 770, 78);
  velux(1110, 190, 310, 78);

  // Extension : toit plat (plan de masse : acrotère à +3,15 m). Dalle à 3,00 m, acrotère
  // en crépi tout autour. Seulement après travaux.
  const [ex0, ex1, ey0, ey1] = [420, 932, 921, 1408], acro = 315, dalle = 300;
  pan([[ex0, ey0, dalle], [ex1, ey0, dalle], [ex1, ey1, dalle], [ex0, ey1, dalle]], new THREE.MeshStandardMaterial({ color: '#4a4c50', roughness: 0.9 }), 'apres');
  for (const [a, b] of [[[ex0, ey1], [ex1, ey1]], [[ex0, ey0], [ex0, ey1]], [[ex1, ey0], [ex1, ey1]]]) {
    pan([[a[0], a[1], H * 100], [b[0], b[1], H * 100], [b[0], b[1], acro], [a[0], a[1], acro]], matCrepiPignon, 'apres');
  }
}
let voirToit = false;
document.getElementById('toit')?.addEventListener('click', () => {
  voirToit = !voirToit;
  document.getElementById('toit').setAttribute('aria-pressed', String(voirToit));
  appliquerPhase();
});
document.getElementById('fenetres')?.addEventListener('click', () => {
  voirFenetres = !voirFenetres;
  document.getElementById('fenetres').setAttribute('aria-pressed', String(voirFenetres));
  appliquerPhase();
});
// Bouton Plafonds (vue d'ensemble) : plafonds du RDC en transparence, les zones peintes
// (plafond vert de la cuisine) bien visibles par-dessus.
let voirPlafonds = false;
function reglerPlafonds() {
  const transparent = mode !== 'visite';
  for (const m of plafondsRdc) {
    const mat = m.material;
    mat.transparent = transparent;
    mat.opacity = transparent ? (m.userData.peint ? 0.75 : 0.12) : 1;
    mat.depthWrite = !transparent;
  }
}
const boutonPlafonds = document.createElement('button');
boutonPlafonds.id = 'plafonds';
boutonPlafonds.setAttribute('aria-pressed', 'false');
boutonPlafonds.textContent = '⬜ Plafonds';
document.getElementById('toit')?.after(boutonPlafonds);
boutonPlafonds.addEventListener('click', () => {
  voirPlafonds = !voirPlafonds;
  boutonPlafonds.setAttribute('aria-pressed', String(voirPlafonds));
  appliquerPhase();
});

// Hauteur des marches sous les pieds (m), en continu le long de l'escalier ;
// null hors de la cage.
function hauteurEscalier(x, y) {
  const e = infoEscalier;
  if (!e || x < e.x0 || x > e.x1 || y < e.y0 || y > e.y1) return null;
  let i;
  if (x >= e.cx) i = e.bas + (Math.max(-Math.PI / 2, Math.min(Math.PI / 2, Math.atan2(y - e.cy, x - e.cx))) + Math.PI / 2) / Math.PI * e.tour;
  else if (y < e.cy) i = (x - e.x0) / e.gb;
  else i = e.bas + e.tour + (e.cx - x) / e.gh;
  return e.marche * Math.max(0, Math.min(e.n, i));
}

// ---------- Modes ----------

let phase = 'apres';
let mode = 'ensemble';
const tactile = matchMedia('(pointer: coarse)').matches;
if (tactile) document.body.classList.add('tactile');

function visible(ph) { return !ph || ph === phase; }
// Bouton Étage (vue d'ensemble) : montre l'étage par-dessus le RDC. En visite, tout
// est construit, toit compris, pour pouvoir monter.
let voirEtage = false;
const niveauMontre = niv => mode === 'visite' || (niv === 1) === voirEtage || (!niv && !voirEtage);
function appliquerPhase() {
  // Chaque meuble reprend sa place de la phase affichée.
  for (const g of meubles) { Object.assign(g.userData, { reserve: false }, g.userData.places[phase]); placerMeuble(g); }
  for (const e of elements) {
    e.visible = visible(e.userData.phase) && !e.userData.reserve &&
      (mode === 'visite' || !plafonds.includes(e) || (voirPlafonds && !voirEtage && plafondsRdc.includes(e))) &&
      (e.userData.niveau !== 1 || mode === 'visite' || voirEtage) &&
      (!e.userData.toitDehors || mode === 'visite' || voirToit) &&
      (!e.userData.menuiserie || voirFenetres);
  }
  reglerLampes(mode === 'visite');
  reglerCotes();
  reglerPlafonds();
  majReserve();
  majElec();
}

const camEnsemble = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 200);
camEnsemble.position.set(CENTRE.x + 9, 17, CENTRE.z + 15);
const orbite = new OrbitControls(camEnsemble, rendu.domElement);
orbite.target.copy(CENTRE);
orbite.enableDamping = true;
orbite.maxPolarAngle = Math.PI * 0.48;
orbite.minDistance = 4;
orbite.maxDistance = 45;
// Vue de contrôle : #vue=cibleX,cibleY,cibleH,camX,camY,camH (cm, coordonnées du plan) cadre un
// meuble de près, pour vérifier un modèle sans manipuler la souris.
const vueDemandee = /^#vue=([-\d.,]+)$/.exec(location.hash);
if (vueDemandee) {
  const [tx, ty, th, cx, cy, ch] = vueDemandee[1].split(',').map(Number);
  orbite.minDistance = 0.3;
  orbite.target.set(M(tx), M(th), -M(ty));
  camEnsemble.position.set(M(cx), M(ch), -M(cy));
}

const camVisite = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 120);
const joueur = { x: M(740), z: -M(220), lacet: 0.8, tangage: 0, yeux: 1.70, alt: 0, niveau: 0 };// ---------- Déplacer les meubles (bouton Meubles, vue d'ensemble) ----------
// Attraper un meuble et le faire glisser au sol ; une barre permet de le tourner.
// Positions enregistrées : window.MAISON_SAUVER_MOBILIER (appli) ou le navigateur.
let modeMeubles = false, meubleChoisi = null, glisse = null, minuterieSauvegarde = null;
const solPlan = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const pointeur = new THREE.Vector2(), rayonMeuble = new THREE.Raycaster(), surSol = new THREE.Vector3();
const cadre = new THREE.BoxHelper(undefined, '#f5b800');
cadre.visible = false;
scene.add(cadre);
const barreMeuble = document.createElement('div');
barreMeuble.style.cssText = 'position:fixed;left:50%;bottom:86px;transform:translateX(-50%);z-index:5;display:none;flex-wrap:wrap;justify-content:center;width:max-content;max-width:calc(100vw - 24px);box-sizing:border-box;gap:6px;align-items:center;background:#1e2429;color:#fff;padding:6px 8px;border-radius:22px;font:600 13px system-ui;box-shadow:0 4px 14px rgb(0 0 0 / .3)';
barreMeuble.innerHTML = '<span id="nom-meuble" style="padding:0 6px"></span>' +
  ['↺ 15°|-15', '↻ 15°|15', '↻ 90°|90', 'Origine|origine', '📦 Ranger|ranger', 'OK|ok'].map(t => {
    const [lib, val] = t.split('|');
    return `<button data-tourner="${val}" style="font:inherit;border:0;border-radius:999px;padding:6px 10px;background:${val === 'ok' ? '#f5b800' : '#38424a'};color:${val === 'ok' ? '#1e2429' : '#fff'};cursor:pointer">${lib}</button>`;
  }).join('');
document.body.append(barreMeuble);
function choisirMeuble(g) {
  meubleChoisi = g;
  cadre.visible = !!g;
  if (g) cadre.setFromObject(g);
  barreMeuble.style.display = g ? 'flex' : 'none';
  if (g) barreMeuble.querySelector('#nom-meuble').innerHTML = nomEtReference(g.userData.meuble);
}
// Objet à l'essai (achat envisagé) : ref = { magasin, nom, prix (€), url } → « nom · magasin · prix · Voir ».
function nomEtReference(o) {
  const r = o.ref;
  if (!r) return esc(o.nom || o.id);
  // Prix en francs suisses : converti en euros au cours du 16/11/2026 (1 CHF ≈ 1,08 €, taux médian).
  const CHF_EUR = 1.08, nb = v => Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  const prix = !r.prix ? '' : r.devise === 'CHF' ? `${nb(r.prix)} CHF (≈ ${nb(Math.round(r.prix * CHF_EUR * 100) / 100)} €)` : `${nb(r.prix)} ${r.devise || '€'}`;
  return `${esc(o.nom || o.id)}<small style="font-weight:400;opacity:.8"> · ${esc([r.magasin, r.nom].filter(Boolean).join(' '))}${prix ? ` · ${prix}` : ''}</small>` +
    (r.url ? ` <a href="${esc(r.url)}" target="_blank" rel="noopener" style="color:#f5b800">Voir</a>` : '');
}
// Meubles qui suivent celui-ci (option suit=id : les chaises suivent la table).
const suiveurs = g => meubles.filter(f => f.userData.meuble.suit === g.userData.meuble.id && visible(f.userData.phase) && !f.userData.reserve);
// Déplace et tourne un meuble ; ceux qui le suivent gardent leur place autour de lui.
function bougerMeuble(g, x, y, angle) {
  const u = g.userData, da = (angle - u.angle) * Math.PI / 180, c = Math.cos(da), s = Math.sin(da);
  for (const f of suiveurs(g)) {
    const v = f.userData, rx = v.x - u.x, ry = v.y - u.y;
    Object.assign(v, { x: x + rx * c - ry * s, y: y + rx * s + ry * c, angle: ((v.angle + angle - u.angle) % 360 + 360) % 360 });
    v.places[phase] = { x: v.x, y: v.y, angle: v.angle };
    placerMeuble(f);
  }
  Object.assign(u, { x, y, angle });
  u.places[phase] = { x, y, angle };
  placerMeuble(g);
}
function sauverMeubles() {
  clearTimeout(minuterieSauvegarde);
  minuterieSauvegarde = setTimeout(async () => {
    const pos = { _version: VERSION_MOBILIER, _ajouts: ajouts },
      arrondi = p => ({ x: Math.round(p.x), y: Math.round(p.y), angle: p.angle, ...(p.reserve && { reserve: true }) });
    for (const g of meubles) {
      pos[g.userData.meuble.id] = arrondi(g.userData.places.avant);
      pos[g.userData.meuble.id + '@apres'] = arrondi(g.userData.places.apres);
    }
    try {
      if (window.MAISON_SAUVER_MOBILIER) await window.MAISON_SAUVER_MOBILIER(pos);
      else localStorage.setItem('maquette-mobilier', JSON.stringify(pos));
    } catch (err) { console.warn('Mobilier non enregistré', err); }
  }, 500);
}
barreMeuble.addEventListener('click', e => {
  const v = e.target.closest('button')?.dataset.tourner;
  if (!v || !meubleChoisi) return;
  if (v === 'ok') { choisirMeuble(null); return; }
  const u = meubleChoisi.userData;
  if (v === 'ranger') {
    // Dans la réserve pour cette phase seulement ; il garde sa place dans l'autre.
    u.places[phase] = { ...u.places[phase], reserve: true };
    choisirMeuble(null);
    appliquerPhase();
    sauverMeubles();
    return;
  }
  if (v === 'origine') {
    // Remet le meuble et ceux qui le suivent à leur place d'origine pour cette phase.
    for (const g of [meubleChoisi, ...suiveurs(meubleChoisi)]) {
      Object.assign(g.userData, g.userData.defauts[phase]);
      g.userData.places[phase] = { ...g.userData.defauts[phase] };
      placerMeuble(g);
    }
  } else bougerMeuble(meubleChoisi, u.x, u.y, ((u.angle + Number(v)) % 360 + 360) % 360);
  cadre.setFromObject(meubleChoisi);
  sauverMeubles();
});
document.getElementById('meubles')?.addEventListener('click', () => {
  modeMeubles = !modeMeubles;
  document.getElementById('meubles').setAttribute('aria-pressed', String(modeMeubles));
  if (!modeMeubles) choisirMeuble(null);
  majReserve();
});

// ---------- Réserve et objets ajoutés (mode Meubles) ----------
// Bouton « Réserve » : liste des meubles rangés dans la phase affichée (Reprendre les pose
// au centre de la vue) et formulaire pour ajouter un objet (achat prévu : canapé…).
const TYPES_AJOUT = {
  canape: { lib: 'Canapé', modele: 'canape', l: 220, p: 95, h: 85, couleur: '#8e9196' },
  fauteuil: { lib: 'Fauteuil', modele: 'canape', l: 85, p: 85, h: 85, couleur: '#8e9196' },
  table: { lib: 'Table', modele: 'bureau', l: 180, p: 90, h: 75, couleur: '#c99a63' },
  tableBasse: { lib: 'Table basse', modele: 'tableBasse', l: 110, p: 60, h: 42, couleur: '#c99a63' },
  chaise: { lib: 'Chaise', modele: 'chaise', l: 44, p: 46, h: 90, couleur: '#c99a63' },
  lit: { lib: 'Lit', modele: 'lit', l: 160, p: 200, h: 45, couleur: '#f3f1ea' },
  armoire: { lib: 'Armoire', modele: 'caisson', l: 100, p: 60, h: 200, couleur: '#f3f1ea', rangs: 'P2' },
  meubleBas: { lib: 'Meuble bas, buffet', modele: 'caisson', l: 120, p: 45, h: 80, couleur: '#f3f1ea', rangs: 'T2:20,P2' },
  etagere: { lib: 'Étagère', modele: 'caisson', l: 80, p: 35, h: 180, couleur: '#f3f1ea', rangs: 'O1:45,O1:45,O1:45,O1' },
  pouf: { lib: 'Pouf rond', modele: 'pouf', l: 50, p: 50, h: 42, couleur: '#8e9196' },
  tapis: { lib: 'Tapis', modele: 'tapis', l: 200, p: 140, h: 1, couleur: '#9a9a98', libre: true },
};
const styleBouton = 'font:600 13px system-ui;border:0;border-radius:999px;padding:6px 12px;cursor:pointer';
// Créés au premier appel : appliquerPhase (qui appelle majReserve) peut tourner avant cette ligne.
function uiReserve() {
  if (uiReserve.ui) return uiReserve.ui;
  const bouton = document.createElement('button');
  // En haut à droite, sous la barre d'outils : la barre du meuble choisi occupe le bas.
  bouton.style.cssText = `position:fixed;right:12px;top:var(--haut-reserve,110px);z-index:5;display:none;background:#1e2429;color:#fff;box-shadow:0 4px 14px rgb(0 0 0 / .3);${styleBouton}`;
  const panneau = document.createElement('div');
  panneau.style.cssText = 'position:fixed;right:12px;top:calc(var(--haut-reserve,110px) + 40px);z-index:6;display:none;width:min(320px,calc(100vw - 24px));max-height:60vh;overflow:auto;background:#1e2429;color:#fff;border-radius:14px;padding:10px;font:14px system-ui;box-shadow:0 8px 24px rgb(0 0 0 / .4)';
  document.body.append(bouton, panneau);
  bouton.onclick = () => {
    panneau.style.display = panneau.style.display === 'none' ? 'block' : 'none';
    dessinerReserve();
  };
  panneau.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const g = meubles.find(m => m.userData.meuble.id === b.dataset.id);
    if (b.dataset.action === 'reprendre' && g) reprendre(g);
    else if (b.dataset.action === 'supprimer' && g && confirm(`Supprimer « ${g.userData.meuble.nom} » pour de bon ?`)) supprimerAjout(g);
    else if (b.dataset.action === 'nouveau') { uiReserve.form = true; dessinerReserve(); }
    else if (b.dataset.action === 'annuler') { uiReserve.form = false; dessinerReserve(); }
    else if (b.dataset.action === 'creer') creerAjout(panneau);
  });
  panneau.addEventListener('change', e => {
    // Changer de type remet les cotes et la couleur habituelles de ce type.
    if (e.target.name !== 'type') return;
    const t = TYPES_AJOUT[e.target.value];
    for (const k of ['l', 'p', 'h', 'couleur']) panneau.querySelector(`[name=${k}]`).value = t[k];
  });
  return (uiReserve.ui = { bouton, panneau });
}
const rangés = () => meubles.filter(g => visible(g.userData.phase) && g.userData.places[phase]?.reserve);
function majReserve() {
  const { bouton, panneau } = uiReserve(), actif = modeMeubles && mode === 'ensemble';
  bouton.style.display = actif ? 'block' : 'none';
  // Juste sous la barre d'outils, quelle que soit sa hauteur (elle passe sur deux lignes au téléphone).
  const barre = document.querySelector('.barre');
  if (actif && barre) document.body.style.setProperty('--haut-reserve', `${Math.round(barre.getBoundingClientRect().bottom) + 8}px`);
  if (!actif) panneau.style.display = 'none';
  bouton.textContent = `📦 Réserve (${rangés().length})`;
  if (panneau.style.display !== 'none') dessinerReserve();
}
const echapper = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function dessinerReserve() {
  const { panneau } = uiReserve();
  if (uiReserve.form) {
    const t = TYPES_AJOUT.canape, champ = 'width:100%;box-sizing:border-box;font:inherit;padding:6px;border-radius:8px;border:0;margin:2px 0 8px';
    panneau.innerHTML = `<b>Nouvel objet</b>
      <label style="display:block;margin-top:8px">Nom<input name="nom" placeholder="Canapé à acheter" style="${champ}"></label>
      <label style="display:block">Type<select name="type" style="${champ}">${Object.entries(TYPES_AJOUT).map(([k, v]) => `<option value="${k}">${v.lib}</option>`).join('')}</select></label>
      <div style="display:flex;gap:6px">${[['l', 'Largeur'], ['p', 'Profondeur'], ['h', 'Hauteur']].map(([k, lib]) =>
        `<label style="flex:1">${lib}<input name="${k}" type="number" min="1" value="${t[k]}" style="${champ}"></label>`).join('')}</div>
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px">
        <label>Couleur <input name="couleur" type="color" value="${t.couleur}"></label>
        <label><input name="etage" type="checkbox"> À l'étage</label></div>
      <label style="display:block">Magasin et référence<input name="magasin" placeholder="Pier Import Melbourne" style="${champ}"></label>
      <div style="display:flex;gap:6px"><label style="flex:1">Prix (€)<input name="prix" type="number" min="0" style="${champ}"></label>
        <label style="flex:2">Lien<input name="url" type="url" placeholder="https://…" style="${champ}"></label></div>
      <div style="display:flex;gap:6px;justify-content:flex-end">
        <button data-action="annuler" style="${styleBouton};background:#38424a;color:#fff">Annuler</button>
        <button data-action="creer" style="${styleBouton};background:#f5b800;color:#1e2429">Ajouter</button></div>
      <p style="margin:8px 0 0;color:#aab;font-size:12px">Cotes en cm. Il est posé au centre de la vue ; dans l'autre phase, il reste en réserve.</p>`;
    return;
  }
  const liste = rangés();
  panneau.innerHTML = `<b>Réserve (${phase === 'apres' ? 'après travaux' : 'avant travaux'})</b>` +
    (liste.length ? liste.map(g => {
      const o = g.userData.meuble;
      return `<div style="display:flex;align-items:center;gap:6px;margin-top:8px"><span style="flex:1">${nomEtReference(o)}</span>` +
        (o.ajout ? `<button data-action="supprimer" data-id="${o.id}" title="Supprimer" style="${styleBouton};background:#38424a;color:#fff">✕</button>` : '') +
        `<button data-action="reprendre" data-id="${o.id}" style="${styleBouton};background:#f5b800;color:#1e2429">Reprendre</button></div>`;
    }).join('') : '<p style="color:#aab;margin:8px 0">Rien en réserve. Choisir un meuble puis « 📦 Ranger ».</p>') +
    `<button data-action="nouveau" style="${styleBouton};margin-top:12px;width:100%;background:#38424a;color:#fff">＋ Nouvel objet</button>`;
}
// Pose le meuble au centre de la vue (au bon niveau) et le sélectionne pour le placer.
function poserAuCentre(g) {
  const etage = !!g.userData.meuble.niveau;
  if (etage !== voirEtage) {
    voirEtage = etage;
    document.getElementById('etage')?.setAttribute('aria-pressed', String(voirEtage));
  }
  g.userData.places[phase] = { x: Math.round(orbite.target.x * 100), y: Math.round(-orbite.target.z * 100), angle: g.userData.places[phase]?.angle || 0 };
  appliquerPhase();
  choisirMeuble(g);
  sauverMeubles();
}
function reprendre(g) {
  uiReserve().panneau.style.display = 'none';
  poserAuCentre(g);
}
function creerAjout(panneau) {
  const v = k => panneau.querySelector(`[name=${k}]`), type = TYPES_AJOUT[v('type').value];
  const cote = k => Math.max(1, Math.round(+v(k).value || type[k])), c = v('couleur').value;
  const o = {
    id: 'ajout-' + Date.now().toString(36), nom: v('nom').value.trim() || type.lib, modele: type.modele,
    l: cote('l'), p: cote('p'), h: cote('h'), couleur: c, mat: c, teinte: c, angle: 0,
    x: Math.round(orbite.target.x * 100), y: Math.round(-orbite.target.z * 100),
    ...(type.rangs && { rangs: type.rangs }), ...(type.libre && { libre: true }), ...(v('etage').checked && { niveau: 1 }),
  };
  // Référence de l'objet à l'essai (pour retrouver le lien et le prix).
  const ref = { magasin: v('magasin').value.trim(), prix: +v('prix').value || null, url: /^https?:\/\//.test(v('url').value.trim()) ? v('url').value.trim() : '' };
  if (ref.magasin || ref.prix || ref.url) o.ref = ref;
  ajouts.push(o);
  const g = construireMeuble({ ...o, type: 'meuble', ajout: true });
  uiReserve.form = false;
  panneau.style.display = 'none';
  poserAuCentre(g); // l'autre phase garde la réserve par défaut
}
function supprimerAjout(g) {
  const id = g.userData.meuble.id;
  ajouts.splice(ajouts.findIndex(o => o.id === id), 1);
  for (const liste of [meubles, elements]) liste.splice(liste.indexOf(g), 1);
  obstacles.splice(obstacles.indexOf(g.userData.obstacle), 1);
  scene.remove(g);
  if (meubleChoisi === g) choisirMeuble(null);
  sauverMeubles();
  majReserve();
}

// ---------- Électricité : prises et interrupteurs (bouton ⚡) ----------
// Toucher un mur (vue d'ensemble ou visite) pose le type choisi à sa hauteur habituelle.
// État : existant (blanc, avant et après), à créer (vert, après seulement), à retirer
// (rouge, avant seulement). Enregistré pour le foyer : window.MAISON_SAUVER_ELEC (ligne
// « electricite » dans l'appli), sinon le navigateur. Point : { id, type, etat, x, y, z, a, niv }
// (x, y en cm du plan ; z = hauteur du centre en cm ; a = direction du mur vers la pièce).
const TYPES_ELEC = {
  prise: { lib: 'Prise', z: 25, l: 8 }, prise2: { lib: 'Prise double', z: 25, l: 15 },
  inter: { lib: 'Interrupteur', z: 110, l: 8 }, vav: { lib: 'Va-et-vient', z: 110, l: 8 },
  rj45: { lib: 'Prise RJ45 / TV', z: 25, l: 8 },
};
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ETATS_ELEC = { existant: 'Existant', nouveau: 'À créer', retirer: 'À retirer' };
const COULEURS_ELEC = { existant: '#f6f4ef', nouveau: '#2ea043', retirer: '#d1242f' };
function elec() {
  if (elec.s) return elec.s;
  let d = window.MAISON_ELEC;
  if (!d) try { d = JSON.parse(localStorage.getItem('maquette-elec') || 'null'); } catch { d = null; }
  const s = elec.s = { points: Array.isArray(d?.points) ? d.points : [], actif: false, type: 'prise', etat: null, choisi: null, groupe: new THREE.Group(), meshes: new Map() };
  scene.add(s.groupe);
  for (const p of s.points) dessinerPoint(p);
  return s;
}
function dessinerPoint(p) {
  const s = elec.s, t = TYPES_ELEC[p.type] || TYPES_ELEC.prise, g = new THREE.Group();
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(M(t.l), M(8), M(1.2)), new THREE.MeshStandardMaterial({ color: COULEURS_ELEC[p.etat] || COULEURS_ELEC.existant, roughness: 0.5 }));
  g.add(plaque);
  const fonce = new THREE.MeshStandardMaterial({ color: '#3a3d42' });
  const trou = x => { const c = new THREE.Mesh(new THREE.CylinderGeometry(M(2.2), M(2.2), M(0.4), 16), fonce); c.rotation.x = Math.PI / 2; c.position.set(M(x), 0, M(0.6)); g.add(c); };
  if (p.type === 'prise') trou(0);
  else if (p.type === 'prise2') { trou(-3.6); trou(3.6); }
  else if (p.type === 'rj45') { const c = new THREE.Mesh(new THREE.BoxGeometry(M(3), M(2.5), M(0.4)), fonce); c.position.z = M(0.6); g.add(c); }
  else {
    const b = new THREE.Mesh(new THREE.BoxGeometry(M(5), M(5.5), M(0.6)), new THREE.MeshStandardMaterial({ color: '#d9d6cf' }));
    b.position.z = M(0.8); g.add(b);
    if (p.type === 'vav') { const f = new THREE.Mesh(new THREE.BoxGeometry(M(3), M(0.5), M(0.3)), fonce); f.position.z = M(1.2); g.add(f); }
  }
  g.position.set(M(p.x), (p.niv ? BASE_ETAGE : 0) + M(p.z), -M(p.y));
  g.rotation.y = p.a;
  g.userData.point = p;
  s.groupe.add(g);
  s.meshes.set(p.id, g);
}
function majElec() {
  const s = elec();
  for (const g of s.groupe.children) {
    const p = g.userData.point;
    const phaseOk = p.etat === 'existant' || (p.etat === 'nouveau' ? phase === 'apres' : phase === 'avant');
    g.visible = phaseOk && niveauMontre(p.niv ? 1 : 0);
    const choisi = s.choisi === p;
    g.scale.setScalar(choisi ? 1.6 : 1);
    g.children[0].material.emissive?.set(choisi ? '#7a5c00' : '#000');
  }
  majPanneauElec();
}
function sauverElec() {
  clearTimeout(sauverElec.t);
  sauverElec.t = setTimeout(async () => {
    const d = { points: elec().points };
    try {
      if (window.MAISON_SAUVER_ELEC) await window.MAISON_SAUVER_ELEC(d);
      else localStorage.setItem('maquette-elec', JSON.stringify(d));
    } catch (err) { console.warn('Électricité non enregistrée', err); }
  }, 400);
}
const pieceDuPoint = p => {
  const nx = Math.sin(p.a), ny = -Math.cos(p.a); // direction vers la pièce, en coordonnées du plan
  const x = p.x + nx * 15, y = p.y + ny * 15;
  return (p.niv ? piecesEtage : pieces).find(q => (!q.phase || q.phase === phase) && dans(q.poly, x, y))?.nom || 'Hors pièce';
};
function panneauElec() {
  if (panneauElec.el) return panneauElec.el;
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;right:12px;top:var(--haut-reserve,110px);z-index:6;display:none;width:min(330px,calc(100vw - 24px));max-height:70vh;overflow:auto;background:#1e2429;color:#fff;border-radius:14px;padding:10px;font:14px system-ui;box-shadow:0 8px 24px rgb(0 0 0 / .4)';
  document.body.append(el);
  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const s = elec();
    if (b.dataset.type) s.type = b.dataset.type;
    if (b.dataset.etat) {
      if (s.choisi) { s.choisi.etat = b.dataset.etat; recreerPoint(s.choisi); sauverElec(); }
      else s.etat = b.dataset.etat;
    }
    if (b.dataset.act === 'supprimer' && s.choisi) {
      s.points.splice(s.points.indexOf(s.choisi), 1);
      s.groupe.remove(s.meshes.get(s.choisi.id));
      s.meshes.delete(s.choisi.id);
      s.choisi = null;
      sauverElec();
    }
    if (b.dataset.act === 'lacher') s.choisi = null;
    if (b.dataset.act === 'recap') panneauElec.recap = !panneauElec.recap;
    majElec();
  });
  return (panneauElec.el = el);
}
function recreerPoint(p) {
  const s = elec();
  s.groupe.remove(s.meshes.get(p.id));
  dessinerPoint(p);
}
function majPanneauElec() {
  const s = elec(), el = panneauElec();
  el.style.display = s.actif ? 'block' : 'none';
  if (!s.actif) return;
  const barre = document.querySelector('.barre');
  if (barre) document.body.style.setProperty('--haut-reserve', `${Math.round(barre.getBoundingClientRect().bottom) + 8}px`);
  const etat = s.etat || (phase === 'apres' ? 'nouveau' : 'existant');
  const bouton = (attr, val, lib, actif, couleur) => `<button data-${attr}="${val}" style="font:600 13px system-ui;border:0;border-radius:999px;padding:6px 10px;margin:3px 3px 0 0;cursor:pointer;background:${actif ? (couleur || '#f5b800') : '#38424a'};color:${actif && !couleur ? '#1e2429' : '#fff'}">${lib}</button>`;
  let html = '<b>⚡ Électricité</b>';
  if (s.choisi) {
    const p = s.choisi;
    html += `<p style="margin:8px 0 4px">${esc(TYPES_ELEC[p.type].lib)} · ${esc(pieceDuPoint(p))} · ${p.z} cm</p>` +
      Object.entries(ETATS_ELEC).map(([k, v]) => bouton('etat', k, v, p.etat === k, COULEURS_ELEC[k] === '#f6f4ef' ? '#6e7781' : COULEURS_ELEC[k])).join('') +
      `<div>${bouton('act', 'supprimer', 'Effacer de la maquette')}${bouton('act', 'lacher', 'OK', true)}</div>`;
  } else {
    html += '<div style="margin-top:6px">' + Object.entries(TYPES_ELEC).map(([k, t]) => bouton('type', k, t.lib, s.type === k)).join('') + '</div>' +
      '<div>' + Object.entries(ETATS_ELEC).filter(([k]) => k !== 'retirer').map(([k, v]) => bouton('etat', k, v, etat === k, k === 'nouveau' ? '#2ea043' : '#6e7781')).join('') + '</div>' +
      '<p style="margin:8px 0 0;color:#aab;font-size:12px">Touche un mur pour poser. Touche une prise pour la modifier ou la marquer « à retirer ».</p>';
  }
  // Récapitulatif par pièce (phase affichée) : ce qu'il faudra dire à l'électricien.
  const vus = s.points.filter(p => p.etat === 'existant' || (p.etat === 'nouveau' ? phase === 'apres' : phase === 'avant'));
  html += `<div>${bouton('act', 'recap', `Récapitulatif (${vus.length})`, panneauElec.recap)}</div>`;
  if (panneauElec.recap) {
    const parPiece = {};
    for (const p of vus) {
      const r = (parPiece[pieceDuPoint(p)] ||= {});
      const cle = `${TYPES_ELEC[p.type].lib}${p.etat === 'existant' ? '' : ` (${ETATS_ELEC[p.etat].toLowerCase()})`}`;
      r[cle] = (r[cle] || 0) + 1;
    }
    html += Object.keys(parPiece).length ? Object.entries(parPiece).sort().map(([piece, r]) =>
      `<p style="margin:8px 0 0"><b>${esc(piece)}</b><br><span style="color:#cdd">${Object.entries(r).map(([k, n]) => `${n} × ${esc(k)}`).join(' · ')}</span></p>`).join('')
      : '<p style="color:#aab;margin:8px 0 0">Rien de posé pour l\'instant.</p>';
  }
  el.innerHTML = html;
}
// Bouton ⚡ à côté de Meubles ; les deux modes s'excluent.
const boutonElec = document.createElement('button');
boutonElec.id = 'elec';
boutonElec.setAttribute('aria-pressed', 'false');
boutonElec.textContent = '⚡ Électricité';
document.getElementById('meubles')?.after(boutonElec);
boutonElec.addEventListener('click', () => {
  const s = elec();
  s.actif = !s.actif;
  boutonElec.setAttribute('aria-pressed', String(s.actif));
  if (s.actif && modeMeubles) document.getElementById('meubles').click();
  if (!s.actif) s.choisi = null;
  majElec();
});
document.getElementById('meubles')?.addEventListener('click', () => {
  if (modeMeubles && elec().actif) boutonElec.click();
});
// Un toucher sans glisser (pour ne pas gêner la rotation de la vue ni le regard en visite).
let departElec = null;
rendu.domElement.addEventListener('pointerdown', e => { departElec = { x: e.clientX, y: e.clientY }; });
rendu.domElement.addEventListener('pointerup', e => {
  const s = elec();
  if (!s.actif || !departElec || Math.hypot(e.clientX - departElec.x, e.clientY - departElec.y) > 6) return;
  const r = rendu.domElement.getBoundingClientRect();
  pointeur.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  rayonMeuble.setFromCamera(pointeur, mode === 'visite' ? camVisite : camEnsemble);
  const prise = rayonMeuble.intersectObjects(s.groupe.children.filter(g => g.visible), true)[0];
  if (prise) {
    let g = prise.object;
    while (!g.userData.point) g = g.parent;
    s.choisi = s.choisi === g.userData.point ? null : g.userData.point;
    majElec();
    return;
  }
  const mur = rayonMeuble.intersectObjects(piecesDeMur.filter(m => m.visible), false)[0];
  if (!mur?.face) { if (s.choisi) { s.choisi = null; majElec(); } return; }
  const n = mur.face.normal.clone().transformDirection(mur.object.matrixWorld);
  if (Math.abs(n.y) > 0.3) return; // dessus d'un mur coupé : pas une face verticale
  n.y = 0; n.normalize();
  const t = TYPES_ELEC[s.type], niv = mur.object.userData.niveau === 1 ? 1 : 0;
  const p = {
    id: 'e' + Date.now().toString(36), type: s.type, etat: s.etat || (phase === 'apres' ? 'nouveau' : 'existant'),
    x: Math.round((mur.point.x + n.x * 0.006) * 1000) / 10, y: Math.round(-(mur.point.z + n.z * 0.006) * 1000) / 10,
    z: t.z, a: Math.round(Math.atan2(n.x, n.z) * 1000) / 1000, niv,
  };
  s.points.push(p);
  dessinerPoint(p);
  s.choisi = null;
  sauverElec();
  majElec();
});

const versSol = e => {
  const r = rendu.domElement.getBoundingClientRect();
  pointeur.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  rayonMeuble.setFromCamera(pointeur, camEnsemble);
};
// Phase capture : on passe avant les commandes de la caméra quand on attrape un meuble.
rendu.domElement.addEventListener('pointerdown', e => {
  if (!modeMeubles || mode !== 'ensemble') return;
  versSol(e);
  // Les meubles fixes (poêle) ne s'attrapent pas.
  const touche = rayonMeuble.intersectObjects(meubles.filter(g => g.visible && !g.userData.meuble.fixe), true)[0];
  if (!touche) { choisirMeuble(null); return; }
  let g = touche.object;
  while (!meubles.includes(g)) g = g.parent;
  choisirMeuble(g);
  solPlan.constant = -g.position.y; // glisse au niveau du meuble (RDC ou étage)
  rayonMeuble.ray.intersectPlane(solPlan, surSol);
  glisse = { id: e.pointerId, dx: g.position.x - surSol.x, dz: g.position.z - surSol.z };
  orbite.enabled = false;
  rendu.domElement.setPointerCapture(e.pointerId);
  e.stopImmediatePropagation();
}, true);
rendu.domElement.addEventListener('pointermove', e => {
  if (!glisse || e.pointerId !== glisse.id) return;
  versSol(e);
  if (!rayonMeuble.ray.intersectPlane(solPlan, surSol)) return;
  bougerMeuble(meubleChoisi, (surSol.x + glisse.dx) * 100, -(surSol.z + glisse.dz) * 100, meubleChoisi.userData.angle);
  cadre.setFromObject(meubleChoisi);
  e.stopImmediatePropagation();
}, true);
const finGlisse = e => {
  if (!glisse || e.pointerId !== glisse.id) return;
  glisse = null;
  orbite.enabled = mode === 'ensemble';
  sauverMeubles();
};
rendu.domElement.addEventListener('pointerup', finGlisse, true);
rendu.domElement.addEventListener('pointercancel', finGlisse, true);document.getElementById('etage')?.addEventListener('click', () => {
  voirEtage = !voirEtage;
  document.getElementById('etage').setAttribute('aria-pressed', String(voirEtage));
  appliquerPhase();
});
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => changerMode(b.dataset.mode));
document.querySelectorAll('[data-phase]').forEach(b => b.onclick = () => {
  phase = b.dataset.phase;
  choisirMeuble(null); // le meuble choisi n'est plus au même endroit dans l'autre phase
  document.querySelectorAll('[data-phase]').forEach(x => x.setAttribute('aria-pressed', x === b));
  appliquerPhase();
});

function changerMode(m) {
  mode = m;
  choisirMeuble(null);
  document.querySelectorAll('[data-mode]').forEach(x => x.setAttribute('aria-pressed', x.dataset.mode === m));
  document.body.classList.toggle('visite', m === 'visite');
  orbite.enabled = m === 'ensemble';
  document.getElementById('piece').hidden = m !== 'visite';
  document.getElementById('aide').textContent = m === 'visite'
    ? (tactile ? 'Joystick pour marcher, glisser ailleurs pour regarder.' : 'ZQSD ou flèches pour marcher, glisser pour regarder.')
    : 'Glisser pour tourner, molette ou pincer pour zoomer.';
  appliquerPhase();
}

const yeux = document.getElementById('yeux');
yeux.oninput = () => {
  joueur.yeux = yeux.value / 100;
  document.getElementById('yeux-val').textContent = joueur.yeux.toFixed(2).replace('.', ',') + ' m';
};

// ---------- Commandes de la visite ----------

const touches = new Set();
addEventListener('keydown', e => touches.add(e.key.toLowerCase()));
addEventListener('keyup', e => touches.delete(e.key.toLowerCase()));

// Regard : glisser sur la scène (hors joystick).
let regard = null;
rendu.domElement.addEventListener('pointerdown', e => {
  if (mode !== 'visite') return;
  regard = { id: e.pointerId, x: e.clientX, y: e.clientY };
  rendu.domElement.setPointerCapture(e.pointerId);
});
rendu.domElement.addEventListener('pointermove', e => {
  if (!regard || e.pointerId !== regard.id) return;
  joueur.lacet -= (e.clientX - regard.x) * 0.005;
  joueur.tangage = Math.max(-1.2, Math.min(1.2, joueur.tangage - (e.clientY - regard.y) * 0.005));
  regard.x = e.clientX;
  regard.y = e.clientY;
});
const finRegard = e => { if (regard && e.pointerId === regard.id) regard = null; };
rendu.domElement.addEventListener('pointerup', finRegard);
rendu.domElement.addEventListener('pointercancel', finRegard);

// Joystick : vecteur de marche entre -1 et 1.
const joy = document.getElementById('joystick');
const bouton = joy.querySelector('i');
const marche = { x: 0, y: 0 };
let joyId = null;
const majJoy = e => {
  const r = joy.getBoundingClientRect();
  let dx = (e.clientX - r.left - r.width / 2) / (r.width / 2);
  let dy = (e.clientY - r.top - r.height / 2) / (r.height / 2);
  const n = Math.hypot(dx, dy);
  if (n > 1) { dx /= n; dy /= n; }
  marche.x = dx;
  marche.y = dy;
  bouton.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
};
joy.addEventListener('pointerdown', e => { joyId = e.pointerId; joy.setPointerCapture(e.pointerId); majJoy(e); });
joy.addEventListener('pointermove', e => { if (e.pointerId === joyId) majJoy(e); });
const finJoy = e => {
  if (e.pointerId !== joyId) return;
  joyId = null;
  marche.x = marche.y = 0;
  bouton.style.transform = '';
};
joy.addEventListener('pointerup', finJoy);
joy.addEventListener('pointercancel', finJoy);

// Collisions : le joueur est un cercle qu'on repousse hors des murs.
const RAYON = 0.22;
function collisions() {
  for (let passe = 0; passe < 3; passe++) {
    for (const o of obstacles) {
      if (o.range || !visible(o.phase) || (o.niveau || 0) !== joueur.niveau) continue;
      // Repère local de l'obstacle (axe du mur : angle autour de Y, Z inversé).
      const dx = joueur.x - o.cx, dz = joueur.z - o.cz;
      const c = Math.cos(o.angle), s = Math.sin(o.angle);
      const lu = dx * c - dz * s, ln = -dx * s - dz * c;
      const pu = Math.max(-o.hl, Math.min(o.hl, lu)), pn = Math.max(-o.he, Math.min(o.he, ln));
      const du = lu - pu, dn = ln - pn;
      const d = Math.hypot(du, dn);
      if (d >= RAYON) continue;
      let nu, nn, pousse;
      if (d > 1e-6) { nu = du / d; nn = dn / d; pousse = RAYON - d; } else {
        // Centre à l'intérieur : sortir par le côté le plus proche.
        const fu = o.hl - Math.abs(lu), fn = o.he - Math.abs(ln);
        if (fu < fn) { nu = Math.sign(lu) || 1; nn = 0; pousse = fu + RAYON; } else { nu = 0; nn = Math.sign(ln) || 1; pousse = fn + RAYON; }
      }
      joueur.x += (nu * c - nn * s) * pousse;
      joueur.z += (-nu * s - nn * c) * pousse;
    }
  }
}

function dans(poly, x, y) {
  let ok = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ok = !ok;
  }
  return ok;
}

// Pièce où se trouve le joueur, au niveau où il est.
function pieceDuJoueur() {
  const liste = joueur.niveau === 1 ? piecesEtage : pieces;
  return liste.find(p => visible(p.phase) && dans(p.poly, joueur.x * 100, -joueur.z * 100));
}

const affichePiece = document.getElementById('piece');
let pieceCourante = '';
function majVisite(dt) {
  let av = 0, cote = 0;
  if (touches.has('z') || touches.has('w') || touches.has('arrowup')) av += 1;
  if (touches.has('s') || touches.has('arrowdown')) av -= 1;
  if (touches.has('q') || touches.has('a')) cote -= 1;
  if (touches.has('d')) cote += 1;
  if (touches.has('arrowleft')) joueur.lacet += 1.8 * dt;
  if (touches.has('arrowright')) joueur.lacet -= 1.8 * dt;
  av -= marche.y;
  cote += marche.x;
  const vitesse = 1.4 * dt;
  const fx = -Math.sin(joueur.lacet), fz = -Math.cos(joueur.lacet);
  const ancien = { x: joueur.x, z: joueur.z };
  joueur.x += (fx * av - fz * cote) * vitesse;
  joueur.z += (fz * av + fx * cote) * vitesse;
  collisions();
  // Hauteur du sol sous les pieds : marches dans la cage d'escalier, plancher de
  // l'étage une fois en haut, sol du RDC sinon. Une marche de plus de 45 cm (bord de
  // la trémie, côté de l'escalier) arrête le pas.
  const px = joueur.x * 100, py = -joueur.z * 100, marcheSous = hauteurEscalier(px, py);
  let sol = marcheSous ?? (joueur.alt > 1.35 ? (piecesEtage.some(p => dans(p.poly, px, py)) ? BASE_ETAGE : null) : 0);
  if (sol === null || Math.abs(sol - joueur.alt) > 0.45) { joueur.x = ancien.x; joueur.z = ancien.z; sol = joueur.alt; }
  joueur.alt += (sol - joueur.alt) * Math.min(1, dt * 12); // montée douce
  joueur.niveau = joueur.alt > 1.35 ? 1 : 0;
  camVisite.position.set(joueur.x, joueur.alt + joueur.yeux, joueur.z);
  camVisite.rotation.set(joueur.tangage, joueur.lacet, 0, 'YXZ');
  lumiereInterieure.position.set(joueur.x, joueur.alt + H - 0.1, joueur.z);
  const ici = pieceDuJoueur();
  const nom = ici ? ici.nom : hauteurEscalier(joueur.x * 100, -joueur.z * 100) !== null ? 'Escalier' : 'Dehors';
  if (nom !== pieceCourante) { pieceCourante = nom; affichePiece.textContent = nom; }
}

// ---------- Boucle ----------

const v = new THREE.Vector3();
const rayon = new THREE.Raycaster();
let imageVisite = 0;
let avant = performance.now();
function boucle(t) {
  const dt = Math.min(0.05, (t - avant) / 1000);
  avant = t;
  let cam;
  if (mode === 'visite') {
    majVisite(dt);
    lumiereInterieure.intensity = 6;
    cam = camVisite;
  } else {
    orbite.update();
    lumiereInterieure.intensity = 0;
    cam = camEnsemble;
    // Cotes : une étiquette qui en chevaucherait une autre (ou le nom d'une pièce) est
    // masquée ; en zoomant, la place se libère et elle réapparaît.
    const placees = [];
    for (const e of etiquettes) {
      const montre = visible(e.p.phase) && niveauMontre(e.p.niveau);
      v.copy(e.pos).project(cam);
      e.el.style.display = montre && v.z < 1 ? '' : 'none';
      const x = (v.x * 0.5 + 0.5) * innerWidth, y = (-v.y * 0.5 + 0.5) * innerHeight;
      e.el.style.left = `${x}px`;
      e.el.style.top = `${y}px`;
      if (montre) placees.push([x, y, e.p.nom.length * 3.8 + 8]);
    }
    for (const c of cotes) {
      if (!cotesVisibles || !visible(c.phase) || !niveauMontre(c.niveau)) { c.el.style.display = 'none'; continue; }
      v.copy(c.pos).project(cam);
      const x = (v.x * 0.5 + 0.5) * innerWidth, y = (-v.y * 0.5 + 0.5) * innerHeight;
      const dl = c.el.textContent.length * 3.3 + 5, dh = 8;
      const libre = v.z < 1 && !placees.some(([px, py, pl]) => Math.abs(px - x) < dl + pl && Math.abs(py - y) < dh * 2);
      c.el.style.display = libre ? '' : 'none';
      if (!libre) continue;
      placees.push([x, y, dl]);
      c.el.style.left = `${x}px`;
      c.el.style.top = `${y}px`;
    }
  }
  if (mode === 'visite') {
    // En visite : les cotes de la pièce où l'on est et des pièces ouvertes dessus,
    // à moins de 7 m et devant soi.
    const ici = pieceDuJoueur();
    const zone = new Set([ici]);
    for (const l of liens) if (visible(l.phase) && (l.a === ici || l.b === ici)) zone.add(l.a).add(l.b);
    const placees = [];
    // Test « caché par un mur » refait toutes les 8 images seulement (téléphones).
    const tester = (imageVisite = (imageVisite + 1) % 8) === 0;
    for (const c of cotes) {
      const p = c.posVisite || c.pos;
      const proche = ici && c.lieux.some(q => zone.has(q)) && p.distanceTo(cam.position) < 7;
      if (!cotesVisibles || !visible(c.phase) || !proche) { c.el.style.display = 'none'; continue; }
      if (tester || c.cachee === undefined) {
        const dir = p.clone().sub(cam.position), dist = dir.length();
        rayon.set(cam.position, dir.normalize());
        rayon.far = dist - 0.12;
        c.cachee = rayon.intersectObjects(piecesDeMur, false).some(h => h.object.visible);
      }
      if (c.cachee) { c.el.style.display = 'none'; continue; }
      v.copy(p).project(cam);
      const x = (v.x * 0.5 + 0.5) * innerWidth, y = (-v.y * 0.5 + 0.5) * innerHeight;
      const dl = c.el.textContent.length * 3.3 + 5, dh = 8;
      const libre = v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1 &&
        !placees.some(([px, py, pl]) => Math.abs(px - x) < dl + pl && Math.abs(py - y) < dh * 2);
      c.el.style.display = libre ? '' : 'none';
      if (!libre) continue;
      placees.push([x, y, dl]);
      c.el.style.left = `${x}px`;
      c.el.style.top = `${y}px`;
    }
  }
  if (rendu.xr.isPresenting) {
    // Une erreur en casque ne doit pas figer l'affichage : on la montre sur l'écran du PC.
    try { cam = majVR(dt); } catch (err) { erreurVR(err); cam = camVisite; }
    etatVR.images++;
  }
  try { rendu.render(scene, cam); } catch (err) { erreurVR(err); }
}
// Suivi VR affiché sur l'écran du PC (diagnostic : le casque ne montre pas les erreurs).
const suiviVR = document.createElement('div');
suiviVR.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9;background:#000c;color:#0f0;font:13px monospace;padding:6px 8px;border-radius:6px;display:none;white-space:pre';
document.body.append(suiviVR);
const etatVR = { images: 0, etape: '', erreur: '' };
function majSuiviVR() {
  suiviVR.style.display = 'block';
  suiviVR.textContent = `VR : ${etatVR.etape}\nimages envoyées : ${etatVR.images}${etatVR.erreur ? '\nERREUR : ' + etatVR.erreur : ''}`;
}
addEventListener('error', e => { etatVR.erreur = String(e.message || e.error); majSuiviVR(); });
addEventListener('unhandledrejection', e => { etatVR.erreur = String(e.reason?.message || e.reason); majSuiviVR(); });
setInterval(() => { if (etatVR.etape) majSuiviVR(); }, 500);
function erreurVR(err) {
  etatVR.erreur = String(err?.message || err);
  if (erreurVR.vue) return;
  erreurVR.vue = true;
  console.error(err);
  boutonVR.textContent = '🥽 VR : erreur';
  boutonVR.title = String(err?.stack || err);
}

// ---------- Réalité virtuelle (casque SteamVR, via WebXR dans Chrome ou Edge) ----------
// Bouton 🥽 VR : on entre dans la maison à taille réelle, au point de visite. Joystick gauche :
// marcher (dans la direction du regard), joystick droit : tourner par crans de 30°, gâchette
// latérale (grip) : basculer Avant / Après. Les murs et l'escalier se gèrent comme en visite.
rendu.xr.enabled = true;
rendu.xr.setReferenceSpaceType('local-floor');
// Index : 2 écrans 1440 × 1600 à 90-144 Hz. Images allégées (70 % de la définition demandée par
// SteamVR, rendu fovéal) et sans ombres pendant la visite au casque, sinon le PC ne suit pas.
rendu.xr.setFramebufferScaleFactor(0.7);
rendu.xr.setFoveation(1);
// Ombres figées en casque (calculées une fois, plus à chaque image) : pas de recompilation des
// matériaux comme en les coupant, qui bloquait Chrome au passage en VR.
rendu.xr.addEventListener('sessionstart', () => { rendu.shadowMap.autoUpdate = false; rendu.shadowMap.needsUpdate = true; erreurVR.vue = false; });
rendu.xr.addEventListener('sessionend', () => { rendu.shadowMap.autoUpdate = true; });
const chariot = new THREE.Group();
const camXR = new THREE.PerspectiveCamera(70, 1, 0.05, 120);
chariot.add(camXR);
scene.add(chariot);
let lacetChariot = 0, cranTourne = 0;
const qTete = new THREE.Quaternion(), eTete = new THREE.Euler();
function majVR(dt) {
  // Direction du regard (lacet de la tête dans la maison) : la marche suit le regard.
  camXR.getWorldQuaternion(qTete);
  eTete.setFromQuaternion(qTete, 'YXZ');
  joueur.lacet = eTete.y;
  marche.x = 0; marche.y = 0;
  for (const src of rendu.xr.getSession()?.inputSources || []) {
    const a = src.gamepad?.axes;
    if (!a || a.length < 4) continue;
    const ax = Math.abs(a[2]) > 0.15 ? a[2] : 0, ay = Math.abs(a[3]) > 0.15 ? a[3] : 0;
    if (src.handedness === 'right') {
      // Tourner par crans (plus confortable qu'une rotation continue en casque).
      if (Math.abs(ax) > 0.6 && cranTourne <= 0) { lacetChariot -= Math.sign(ax) * Math.PI / 6; cranTourne = 0.35; }
    } else { marche.x = ax; marche.y = ay; }
  }
  cranTourne -= dt;
  majVisite(dt);
  chariot.position.set(joueur.x, joueur.alt, joueur.z);
  chariot.rotation.y = lacetChariot;
  return camXR;
}
for (const i of [0, 1]) {
  rendu.xr.getController(i).addEventListener('squeezestart', () => {
    document.querySelector(`[data-phase="${phase === 'apres' ? 'avant' : 'apres'}"]`)?.click();
  });
}
const boutonVR = document.createElement('button');
boutonVR.id = 'vr';
boutonVR.setAttribute('aria-pressed', 'false');
boutonVR.textContent = '🥽 VR';
boutonVR.title = 'Visite au casque (SteamVR lancé, maquette ouverte dans Chrome ou Edge sur le PC)';
document.getElementById('plafonds')?.after(boutonVR);
boutonVR.addEventListener('click', async () => {
  const session = rendu.xr.getSession();
  if (session) { await session.end(); return; }
  const ok = await navigator.xr?.isSessionSupported?.('immersive-vr').catch(() => false);
  if (!ok) {
    alert('Casque non détecté. Brancher le casque, lancer SteamVR, puis ouvrir la maquette dans Chrome ou Edge sur ce PC.');
    return;
  }
  etatVR.etape = 'demande de session'; etatVR.images = 0; etatVR.erreur = ''; majSuiviVR();
  const s = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
  etatVR.etape = 'session obtenue'; majSuiviVR();
  if (mode !== 'visite') changerMode('visite');
  lacetChariot = joueur.lacet; // on garde l'orientation de la visite
  try { await rendu.xr.setSession(s); } catch (err) { erreurVR(err); throw err; }
  etatVR.etape = 'en cours'; majSuiviVR();
  s.addEventListener('end', () => { etatVR.etape = 'terminée'; majSuiviVR(); });
  boutonVR.setAttribute('aria-pressed', 'true');
  s.addEventListener('end', () => boutonVR.setAttribute('aria-pressed', 'false'));
});

addEventListener('resize', () => {
  rendu.setSize(innerWidth, innerHeight);
  for (const c of [camEnsemble, camVisite]) { c.aspect = innerWidth / innerHeight; c.updateProjectionMatrix(); }
});

appliquerPhase();
rendu.setAnimationLoop(boucle); // (et non requestAnimationFrame : obligatoire pour le casque)
