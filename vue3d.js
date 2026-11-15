// Visualiseur 3D, copié depuis le prototype maison-3d (outils/exporter.mjs).
// Les données de la maison ne sont pas ici : maquette.html les lit dans Supabase.
// Maison 3D : vue d'ensemble (orbite) et visite à hauteur d'homme.
// Plan (x est, y nord, cm) → scène (X = x, Z = -y, en mètres).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
const { HAUTEUR, murs, pieces, objets } = window.MAISON;

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
const obstacles = []; // rectangles au sol : { cx, cz, angle, hl, he, phase }

function ajouter(mesh, phase, ombre = true) {
  mesh.castShadow = ombre;
  mesh.receiveShadow = true;
  mesh.userData.phase = phase;
  scene.add(mesh);
  elements.push(mesh);
  return mesh;
}

// ---------- Murs ----------

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

const formeDe = poly => new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(M(x), M(y))));

// Carrelage actuel (photos) : carreaux beiges mouchetés, joints gris, posés droit.
// Dessiné une fois sur 4 × 4 carreaux, un peu différents les uns des autres.
function texteCarrelage(cote) {
  const px = 128, n = 4, c = document.createElement('canvas');
  c.width = c.height = px * n;
  const g = c.getContext('2d');
  g.fillStyle = '#9c968c';
  g.fillRect(0, 0, c.width, c.height);
  let graine = 7;
  const hasard = () => (graine = (graine * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = Math.round(hasard() * 10 - 5);
    g.fillStyle = `rgb(${242 + v}, ${232 + v}, ${212 + v})`;
    g.fillRect(i * px + 3, j * px + 3, px - 6, px - 6);
    for (let k = 0; k < 140; k++) {
      g.fillStyle = hasard() < 0.5 ? 'rgba(150,135,110,0.35)' : 'rgba(255,250,240,0.4)';
      g.fillRect(i * px + 4 + hasard() * (px - 8), j * px + 4 + hasard() * (px - 8), 2, 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = rendu.capabilities.getMaxAnisotropy();
  // Les UV d'une ShapeGeometry sont les coordonnées du plan, en mètres.
  t.repeat.set(1 / (n * M(cote)), 1 / (n * M(cote)));
  return t;
}
const matCarrelage = {};
function materiauSol(p, ph) {
  if (ph === 'avant' && p.carrelageAvant) {
    const cote = p.carrelageAvant;
    matCarrelage[cote] ??= new THREE.MeshStandardMaterial({ map: texteCarrelage(cote), roughness: 0.5 });
    return matCarrelage[cote];
  }
  return new THREE.MeshStandardMaterial({ color: p.sol, roughness: 0.85 });
}

const plafonds = [];
for (const p of pieces) {
  const geo = new THREE.ShapeGeometry(formeDe(p.poly));
  geo.rotateX(-Math.PI / 2); // (x, y) du plan → (X, -Z)
  // Une pièce carrelée aujourd'hui a deux sols : le carrelage en « avant », sa couleur en « après ».
  for (const ph of p.carrelageAvant && !p.phase ? ['avant', 'apres'] : [p.phase]) {
    const solPiece = new THREE.Mesh(geo, materiauSol(p, ph));
    solPiece.position.y = 0.001;
    ajouter(solPiece, ph, false);
  }
  const plafond = new THREE.Mesh(geo, matPlafond);
  plafond.position.y = H;
  // Le plafond fait de l'ombre : le soleil n'entre que par les fenêtres.
  ajouter(plafond, p.phase, true);
  plafonds.push(plafond);
}

for (const o of objets) {
  if (o.type === 'escalier') escalier(o);
  else {
    const h = M(o.h);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(M(o.l), h, M(o.p)), new THREE.MeshStandardMaterial({ color: o.couleur, roughness: 0.7 }));
    mesh.position.set(M(o.x + o.l / 2), M(o.z || 0) + h / 2, -M(o.y + o.p / 2));
    ajouter(mesh, o.phase);
    if (!o.z) obstacles.push({ cx: mesh.position.x, cz: mesh.position.z, angle: 0, hl: M(o.l) / 2, he: M(o.p) / 2, phase: o.phase });
  }
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
  // Noyau central et poteau de départ.
  for (const [x, y, h] of [[cx, cy, hFin], [x0 + 4, y0 + w - 4, 1]]) {
    const poteau = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, 0.08), mat);
    poteau.position.set(M(x), h / 2, -M(y));
    ajouter(poteau);
  }
  obstacles.push({ cx: M(o.x + o.l / 2), cz: -M(o.y + o.p / 2), angle: 0, hl: M(o.l) / 2, he: M(o.p) / 2 });
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

// ---------- Modes ----------

let phase = 'apres';
let mode = 'ensemble';
const tactile = matchMedia('(pointer: coarse)').matches;
if (tactile) document.body.classList.add('tactile');

function visible(ph) { return !ph || ph === phase; }
function appliquerPhase() {
  for (const e of elements) e.visible = visible(e.userData.phase) && (mode === 'visite' || !plafonds.includes(e));
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
const joueur = { x: M(740), z: -M(220), lacet: 0.8, tangage: 0, yeux: 1.70 };
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
      if (!visible(o.phase)) continue;
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
  joueur.x += (fx * av - fz * cote) * vitesse;
  joueur.z += (fz * av + fx * cote) * vitesse;
  collisions();
  camVisite.position.set(joueur.x, joueur.yeux, joueur.z);
  camVisite.rotation.set(joueur.tangage, joueur.lacet, 0, 'YXZ');
  lumiereInterieure.position.set(joueur.x, H - 0.1, joueur.z);
  const ici = pieces.find(p => visible(p.phase) && dans(p.poly, joueur.x * 100, -joueur.z * 100));
  const nom = ici ? ici.nom : 'Dehors';
  if (nom !== pieceCourante) { pieceCourante = nom; affichePiece.textContent = nom; }
}

// ---------- Boucle ----------

const v = new THREE.Vector3();
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
    for (const e of etiquettes) {
      const montre = visible(e.p.phase);
      v.copy(e.pos).project(cam);
      e.el.style.display = montre && v.z < 1 ? '' : 'none';
      e.el.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`;
      e.el.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
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
