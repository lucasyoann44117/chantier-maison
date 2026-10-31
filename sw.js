// Garde l'application disponible hors connexion. Réseau d'abord, pour voir
// tout de suite les nouvelles versions ; le cache sert seulement en secours.
// Les données Supabase ne passent pas par ce cache.
const CACHE = 'chantier-v9';
const FICHIERS = [
  './', 'index.html', 'styles.css', 'app.js', 'db.js', 'config.js',
  'manifest.webmanifest', 'icones/icone-180.png', 'icones/icone-192.png', 'icones/icone-512.png',
  'icones/plan-clair.png', 'icones/plan-sombre.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(cles => Promise.all(cles.filter(c => c !== CACHE).map(c => caches.delete(c))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(rep => {
        const copie = rep.clone();
        caches.open(CACHE).then(c => c.put(e.request, copie));
        return rep;
      })
      .catch(() => caches.match(e.request)),
  );
});
