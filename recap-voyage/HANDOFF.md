# Récap voyage : passation pour Claude Code

Ce dossier transforme des activités Strava (marches, courses) en un récap de voyage :

- les GPX chaînés, avec les trajets en voiture entre les activités reconstitués ;
- une page web 3D animée, façon retransmission cycliste ;
- une vidéo MP4, en 16:9 ou en Reel vertical 9:16.

Premier voyage traité : **Vacances à Majorque, du 2 au 5 novembre 2026** (`data/palma-2026-11/`).

Objectif suivant : **faire de ce traitement une application**. Voir la section 8.

---

## 1. Ce qui existe déjà

| Livrable | Où | État |
|---|---|---|
| GPX continu et GPX détaillé (une piste par étape) | `../voyages/palma-2026-11/*.gpx`, régénérés dans `work/<voyage>/` | fait |
| Page 3D publiée (artefact claude.ai, privé) | https://claude.ai/artifact/QoJfpQRTsxnsyq1MYDmLaA | fait |
| Ancienne page 2D (vue carte) | https://claude.ai/artifact/DtA5fxQq4Q1dvVAZhWk3sy | fait, non maintenue |
| Reel 1080×1920, 75 s, 30 i/s | généré par `pipeline/render.sh palma-2026-11 reel` | fait (81 Mo) |
| Version 16:9 1920×1080, environ 3 min 15 | `pipeline/render.sh palma-2026-11 16x9` | script prêt |
| Photos placées sur le parcours | à faire | les photos n'ont pas encore été fournies |

Les vidéos ne sont pas versionnées : elles sont trop lourdes, il faut les régénérer.

## 2. Arborescence

```
recap-voyage/
  HANDOFF.md                  ce document
  data/palma-2026-11/
    activities.json           12 activités Strava : polyligne réduite, départ, durée, météo, D+
    transfers.json            liaisons en voiture : points de passage tracés à la main sur les routes principales
    trip.json                 titres, noms des tronçons, étapes (jours), lieux, angle de caméra, zone de carte, produits Sentinel-2
    coast.json                trait de côte de Majorque (OSM simplifié à 100 m)
  pipeline/
    common.py, polyline.py    utilitaires
    01_build_route.py         chaînage + horodatage + GPX + work/<voyage>/route_data.json
    02_fetch_dem.py           relief (Terrain Tiles AWS, z13, environ 15 m)
    03_fetch_sentinel.py      mosaïque satellite Sentinel-2 10 m (bucket public AWS)
    04_bake_texture.py        étalonnage, mer synthétique, découpe en 4×4 morceaux JPEG + grille de hauteurs
    05_assemble.py            pages HTML : recap3d.html (publiable) + capture*.html (rendu vidéo)
    render.js / render.sh     rendu image par image (Playwright) + encodage ffmpeg
  templates/recap3d.html      moteur 3D (three.js r128) + habillage TV, paramétré par trip.json
  work/                       sorties générées (ignoré par git)
```

## 3. Lancer le pipeline

Les commandes se lancent depuis `recap-voyage/`.

**Prérequis :**
- Python 3 avec `numpy scipy pillow rasterio` ;
- Node avec `playwright` (Chromium) ;
- `ffmpeg` ;
- `npm`, pour récupérer three.js et les polices Barlow.

```bash
pip install numpy scipy pillow rasterio
python3 pipeline/01_build_route.py   data/palma-2026-11   # quelques secondes
python3 pipeline/02_fetch_dem.py     data/palma-2026-11   # environ 1 min, 1 000 tuiles
python3 pipeline/03_fetch_sentinel.py data/palma-2026-11  # environ 1 à 2 min, lecture de COG à distance
python3 pipeline/04_bake_texture.py  data/palma-2026-11   # environ 1 min
python3 pipeline/05_assemble.py      data/palma-2026-11   # produit work/palma-2026-11/recap3d.html (environ 8 Mo)
pipeline/render.sh palma-2026-11 reel                     # Reel 9:16
pipeline/render.sh palma-2026-11 16x9                     # version 16:9
```

**Durée du rendu :** il passe par SwiftShader (WebGL sans carte graphique). Comptez environ 1 à 2 s par image et par processus. Avec 3 processus (`JOBS=3`), le Reel prend environ 40 min et la version 16:9 environ 1 h. Le script reprend où il s'est arrêté : les images déjà calculées sont conservées. Avec une carte graphique, le même rendu tourne en temps réel.

**Contrôle :** `work/<voyage>/texture_apercu.jpg` montre la mosaïque satellite finale.

## 4. Sources de données et mentions obligatoires

| Donnée | Source | Accès | Mention |
|---|---|---|---|
| Traces | Strava (connecteur MCP Strava, `search_activities` avec `include_polyline`) | compte de l'utilisateur | « Traces : Strava » |
| Relief | AWS Terrain Tiles `s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` | public | Mapzen / SRTM et autres sources, voir la doc du jeu de données |
| Satellite | Sentinel-2 L2A TCI, `sentinel-cogs.s3.us-west-2.amazonaws.com` | public | « Contient des données Copernicus Sentinel-2 modifiées (2025) » |
| Trait de côte | npm `@geo-maps/earth-lands-100m` (OSM) | public | « © contributeurs OpenStreetMap (ODbL) » |
| Météo, D+ | champs Strava de chaque activité | compte de l'utilisateur | |

**Choix des images satellite :** les produits Sentinel-2 sont listés à la main dans `trip.json > map.sentinel`, avec une date sans nuages (11 août 2025) et 4 tuiles MGRS : 31SDD, 31TDE, 31SED, 31TEE. Pour trouver des dates, lire les fichiers `<produit>.json` (STAC) du bucket. Les champs utiles sont `eo:cloud_cover` et `s2:nodata_pixel_percentage`.

## 5. Décisions techniques et pièges connus

- **Polylignes réduites :** Strava les renvoie simplifiées (90 à 475 points par activité). C'est suffisant pour le récap. Pour plus de précision, ou pour l'altitude, utiliser `get_activity_streams` (time, location, altitude).
- **Horaires :** les points d'une activité sont horodatés linéairement à la distance, entre le départ et le départ + temps écoulé. Les liaisons en voiture sont horodatées à 45 km/h, en repartant de la fin de l'activité précédente.
- **Liaisons en voiture :** elles sont tracées à la main (`transfers.json`), aucun service de calcul d'itinéraire n'étant joignable depuis l'environnement cloud. C'est approximatif (virages coupés). À remplacer par OSRM, Valhalla ou GraphHopper dans l'application.
- **Animation déterministe :** tout est fonction du temps `t` (`window.__seek(t)`, `window.__duration`), caméra comprise. C'est ce qui permet le rendu image par image. Le mode court du Reel s'active avec `window.__REEL=true` et la classe `reel` sur `body`.
- **Moteur 3D :** three.js r128, chargé en UMD depuis cdnjs, car les artefacts claude.ai n'autorisent que quelques CDN. Le terrain est découpé en 4×4 maillages de 256×224 segments. Les normales sont calculées à partir de la grille globale, pour éviter les raccords d'éclairage entre morceaux. L'exagération verticale `VE` vaut 1,5.
- **Mer :** au-delà de 130 m de la côte, l'image satellite est remplacée par un dégradé synthétique. Les tuiles Sentinel-2 ont des teintes de mer différentes, et les raccords se voyaient. Le plan « mer lointaine » est texturé avec la même couleur (`meta.deep`) pour éviter tout bord visible.
- **Plan d'eau transparent retiré :** il provoquait du z-fighting à grande distance. Le plan de mer lointaine est à -60 m, et le plan proche de la caméra à 150 m.
- **Page publiée :** les artefacts claude.ai bloquent toute ressource externe sauf les CDN de scripts. Les textures sont donc intégrées en base64, d'où une page d'environ 8 Mo. Une application hébergée ailleurs n'a pas cette limite.
- **Réseau de l'environnement cloud :** seuls quelques hôtes sont joignables via le proxy (S3 public, npm, PyPI). OSRM, IGN, Esri, MapTiler, etc. sont bloqués, à ajouter si besoin. Les polices Google Fonts ne sont pas joignables pour le rendu : `05_assemble.py` intègre les fichiers de `@fontsource`.
- **Limites visuelles :** environ 15 m par pixel, donc la ville est floue de près. Les images sont d'août, donc la campagne est sèche et orangée. Il n'y a pas de bâtiments 3D. Pour mieux faire, il faudrait l'orthophoto PNOA de l'IGN espagnol (25 cm), MapTiler Satellite ou Google Photorealistic 3D Tiles.

## 6. Reste à faire sur le récap actuel

1. **Photos :** 1 ou 2 par sortie, demandées en fichiers originaux. Les placer avec les coordonnées GPS de l'EXIF, ou à défaut avec `DateTimeOriginal` croisé avec les horaires du GPX (heure locale CET). À l'écran : un repère sur la carte, un ralenti du point de tête, une carte postale affichée environ 2 s avec le lieu et l'heure, et une mosaïque dans le carton final.
2. Version 16:9 à rendre au nouveau titre.
3. Vraies routes pour les liaisons, quand un service d'itinéraire sera joignable.
4. Optionnel : musique (la vidéo n'a pas de son, à ajouter dans Instagram), version 4K, profil d'altitude.

## 7. Paramétrage d'un nouveau voyage

Copier `data/palma-2026-11/` puis :

- `activities.json` : exporter les activités (id, nom, type, départ, temps écoulé, polyligne, météo, D+).
- `transfers.json` : décrire les liaisons. La clé est l'index de l'activité qui suit la liaison.
- `trip.json` : renseigner :
  - les textes (title, kicker, dates, intro, clockCode, hudInfo, place, focus) ;
  - `names`, un nom par tronçon, liaisons comprises, dans l'ordre de `route_data.json` ;
  - `stages`, les numéros de tronçons de chaque jour et l'angle de caméra `az` (0 = caméra au sud qui regarde vers le nord) ;
  - `places`, les étiquettes de carte ;
  - `map`, la zone (bbox), le zoom et les produits Sentinel.
- `coast.json` : polygones du trait de côte, utilisés pour le masque terre/mer. Pour une zone sans côte, mettre une liste vide.

L'automatisation de cette étape est le cœur de l'application.

---

## 8. Proposition : en faire une application

### Ce que l'application ferait

1. **Connexion à Strava**, ou import de GPX/FIT. Choix d'un voyage par plage de dates et zone géographique.
2. **Chaînage automatique :** tri chronologique. Chaque trou de plus de 200 m entre deux activités devient une liaison, calculée par un service d'itinéraire. Le mode est déduit de la distance et du temps (à pied, en voiture, en bateau, en avion), et reste modifiable sur la carte.
3. **Découpage en étapes** (une par jour) et noms de lieux proposés automatiquement (géocodage inverse), modifiables.
4. **Photos :** dépôt depuis le téléphone, placement par EXIF ou par l'heure, sélection de 1 ou 2 par sortie.
5. **Prévisualisation 3D en temps réel** dans le navigateur, avec imagerie satellite et relief.
6. **Export vidéo** en 9:16 (Reel ou Story) et en 16:9, choix de musique libre de droits, plus export des GPX.

### Architecture recommandée

| Brique | Choix | Pourquoi |
|---|---|---|
| Interface | Vite + TypeScript + React (ou Svelte), installable sur mobile (PWA) | La saisie et les photos se font sur le téléphone |
| Carte 3D | **MapLibre GL JS** avec relief (`raster-dem`) et fond satellite | Tuiles à la volée, rendu sur la carte graphique, rues nettes de près |
| Fond satellite | MapTiler Satellite (offre gratuite, clé API) ; sinon Esri World Imagery, ou PNOA (IGN) pour l'Espagne | Bien plus fin que Sentinel-2 en ville |
| Relief | MapTiler Terrain RGB ou AWS Terrain Tiles | Compatible avec MapLibre |
| Liaisons | OSRM ou Valhalla auto-hébergé, ou GraphHopper (offre gratuite) | Les serveurs de démo publics ne sont pas faits pour la production |
| Animation | Réutiliser la logique de `templates/recap3d.html` : timeline, caméra déterministe `camAt(t)`, habillage DOM | Déjà au point. Avec MapLibre, la caméra passe par `map.jumpTo` / `FreeCameraOptions` |
| Export vidéo | **Dans le navigateur :** WebCodecs + `mp4-muxer`, image par image via `__seek(t)` | Rapide sur un téléphone ou un PC récent, aucun serveur à payer |
| Repli serveur | Le même `render.js` (Playwright) sur une machine avec carte graphique, avec file d'attente | Pour les appareils sans WebCodecs, et pour la 4K |
| Données et comptes | Supabase (déjà utilisé par `chantier-maison`) : authentification, échange du jeton OAuth Strava (fonction Edge), stockage des voyages et des photos | Réutilise l'existant |
| Hébergement | Vercel, Netlify ou Supabase | Hors de claude.ai : le fond de carte doit pouvoir charger des tuiles externes |

### Étapes proposées

1. **Étape 0 (fait) :** pipeline en ligne de commande, données d'un voyage en JSON.
2. **Étape 1, visionneuse :** application web qui lit `route_data.json` et `trip.json` et rejoue l'animation sur MapLibre avec fond satellite. Critère de réussite : rendu plus net que la version actuelle à Palma.
3. **Étape 2, import :** dépôt de GPX, chaînage automatique, liaisons calculées, étapes par jour, édition des noms et des modes.
4. **Étape 3, Strava et photos :** connexion OAuth, liste des activités par période, photos placées par EXIF ou par l'heure.
5. **Étape 4, export :** MP4 en 9:16 et 16:9 via WebCodecs, musique, choix de modèles d'habillage (sans logo de marque déposée).

### Points de vigilance

- **Clés API :** Strava (enregistrer une application, limite de 100 requêtes par 15 min), MapTiler, service d'itinéraire. Ne jamais les mettre dans le code ; les passer par des variables d'environnement ou des fonctions serveur.
- **Licences :** mentionner Strava, OSM, Copernicus et le fournisseur du fond satellite dans la vidéo et la page.
- **Vie privée :** les traces révèlent l'adresse du logement. Prévoir de flouter un rayon autour du départ et de l'arrivée.
- **Dépôt :** créer un dépôt dédié, par exemple `recap-voyage`, plutôt que de le développer dans `chantier-maison`.

---

## 9. Prompt de démarrage pour Claude Code

> Lis `recap-voyage/HANDOFF.md`. Crée un nouveau projet web (Vite + TypeScript + MapLibre GL JS) qui reproduit l'étape 1 : charger `work/palma-2026-11/route_data.json` et `data/palma-2026-11/trip.json`, afficher Majorque en 3D avec relief et fond satellite (clé MapTiler dans `VITE_MAPTILER_KEY`), et rejouer l'animation avec la même timeline, la même caméra déterministe et le même habillage que `templates/recap3d.html` (fonctions `locate`, `rawCam`, `camAt`, `hud`). Garde `window.__seek(t)` et `window.__duration` pour pouvoir exporter en vidéo. Commence par un plan, puis implémente.
