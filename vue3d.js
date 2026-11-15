// Visualiseur 3D, copié depuis le prototype maison-3d (outils/exporter.mjs).
// Les données de la maison ne sont pas ici : maquette.html les lit dans Supabase.
// Maison 3D : vue d'ensemble (orbite) et visite à hauteur d'homme.
// Plan (x est, y nord, cm) → scène (X = x, Z = -y, en mètres).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
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
sol.position.set(CENTRE.x, -0.02, CENTRE.z);
sol.receiveShadow = true;
scene.add(sol);

const matMur = new THREE.MeshStandardMaterial({ color: '#f1ede6', roughness: 0.92 });
const matPlafond = new THREE.MeshStandardMaterial({ color: '#fbfaf7', roughness: 1, side: THREE.DoubleSide });
const matVitre = new THREE.MeshStandardMaterial({ color: '#a9cbe0', transparent: true, opacity: 0.28, roughness: 0.1, metalness: 0.1 });

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

// ---------- Murs ----------

const piecesDeMur = [];

function construireMur(m) {
  const [ax, ay] = m.a, [bx, by] = m.b;
  const longueur = Math.hypot(bx - ax, by - ay);
  const angle = Math.atan2(by - ay, bx - ax);
  const ux = (bx - ax) / longueur, uy = (by - ay) / longueur;
  const ep = M(m.ep);
  const ouvertures = (m.ouvertures || []).slice().sort((a, b) => a.pos - b.pos);

  // Un pavé du mur entre s et e (cm, le long du mur), de z0 à z1 (m).
  const pave = (s, e, z0, z1, materiau = matMur, bloque = true) => {
    if (e - s < 0.5 || z1 - z0 < 0.005) return;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(M(e - s), z1 - z0, materiau === matVitre ? 0.02 : ep), materiau);
    const milieu = (s + e) / 2;
    mesh.position.set(M(ax + ux * milieu), (z0 + z1) / 2, -M(ay + uy * milieu));
    mesh.rotation.y = angle;
    ajouter(mesh, m.phase, materiau !== matVitre);
    if (materiau !== matVitre) piecesDeMur.push(mesh); // pour cacher les cotes derrière un mur
    // Bloque la marche s'il occupe la hauteur d'une personne.
    if (bloque && z0 < 1.2 && z1 > 0.3) obstacles.push({ cx: mesh.position.x, cz: mesh.position.z, angle, hl: M(e - s) / 2, he: Math.max(ep, 0.06) / 2, phase: m.phase });
  };

  let curseur = 0;
  for (const o of ouvertures) {
    pave(curseur, o.pos, 0, H);
    const s = o.pos, e = o.pos + o.largeur;
    if (o.allege > 0) pave(s, e, 0, M(o.allege));
    if (o.type === 'fenetre' || o.type === 'baie') pave(s, e, M(o.allege), M(o.haut), matVitre, true);
    if (o.type === 'arche') arche(m, o, angle, ux, uy, ep);
    else pave(s, e, M(o.haut), H, matMur, false);
    curseur = e;
  }
  pave(curseur, longueur, 0, H);
}

// Linteau en arc : un rectangle percé d'un demi-cercle, extrudé dans l'épaisseur.
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
  carre: { cases: 4, rects: Array.from({ length: 16 }, (_, k) => [k % 4, Math.floor(k / 4), 1, 1]),
    couleur: [242, 232, 212], joint: '#9c968c', mouchetis: 140 },
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
};

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
    // Usure : taches plus claires ou foncées, et creux dans le relief.
    if (m.relief) for (let k = 0; k < 3 * l * h; k++) {
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
    if (MOTIFS[motif].centre !== false) {
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
  for (const l of lampes) l.intensity = lumiere && visite ? 5 : 0;
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
  else {
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
  groupe.add(assise, dossier);
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
  let h = Math.min(toit.plafond, toit.hSud + toit.pente * (y - toit.ySud), toit.hNord + toit.pente * (toit.yNord - y));
  const l = toit.lucarne;
  if (l && x >= l.x0 - 4 && x <= l.x1 + 4 && y >= toit.yNord - (l.h - toit.hNord) / toit.pente) h = Math.max(h, l.h);
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
    const yl = yn - (l.h - hNord) / pente;
    surfaceToit([[l.x0, yl, l.h], [l.x1, yl, l.h], [l.x1, yn2, hp], [l.x0, yn2, hp]]);
    surfaceToit([[l.x0, l.yFond, l.h], [l.x1, l.yFond, l.h], [l.x1, yl, l.h], [l.x0, yl, l.h]]);
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
    const arrivee = e.y1 - (e.y1 - e.y0) * 0.45; // début de la volée du haut
    garde([t0, t1], [t2, t1]);
    garde([t0, t3], [t2, t3]);
    garde([t0, t1], [t0, arrivee]);
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
  for (const e of elements) {
    e.visible = visible(e.userData.phase) && (mode === 'visite' || !plafonds.includes(e)) &&
      (e.userData.niveau !== 1 || mode === 'visite' || voirEtage);
  }
  reglerLampes(mode === 'visite');
  reglerCotes();
}

const camEnsemble = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 200);
camEnsemble.position.set(CENTRE.x + 9, 17, CENTRE.z + 15);
const orbite = new OrbitControls(camEnsemble, rendu.domElement);
orbite.target.copy(CENTRE);
orbite.enableDamping = true;
orbite.maxPolarAngle = Math.PI * 0.48;
orbite.minDistance = 4;
orbite.maxDistance = 45;

const camVisite = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 120);
const joueur = { x: M(740), z: -M(220), lacet: 0.8, tangage: 0, yeux: 1.70, alt: 0, niveau: 0 };document.getElementById('etage')?.addEventListener('click', () => {
  voirEtage = !voirEtage;
  document.getElementById('etage').setAttribute('aria-pressed', String(voirEtage));
  appliquerPhase();
});
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => changerMode(b.dataset.mode));
document.querySelectorAll('[data-phase]').forEach(b => b.onclick = () => {
  phase = b.dataset.phase;
  document.querySelectorAll('[data-phase]').forEach(x => x.setAttribute('aria-pressed', x === b));
  appliquerPhase();
});

function changerMode(m) {
  mode = m;
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
      if (!visible(o.phase) || (o.niveau || 0) !== joueur.niveau) continue;
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
  rendu.render(scene, cam);
  requestAnimationFrame(boucle);
}

addEventListener('resize', () => {
  rendu.setSize(innerWidth, innerHeight);
  for (const c of [camEnsemble, camVisite]) { c.aspect = innerWidth / innerHeight; c.updateProjectionMatrix(); }
});

appliquerPhase();
requestAnimationFrame(boucle);
