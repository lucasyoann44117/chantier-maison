# Chantier maison

Application de suivi de l'extension et de la cuisine : devis, factures, postes,
planning et relances. Le cadrage est dans `projet-chantier/CADRAGE.md`.

Sans configuration, l'application démarre en **mode démo** : les données restent
dans le navigateur. Pour l'essayer sur le PC :

```
python -m http.server 8790
```

puis ouvrir http://localhost:8790.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `styles.css`, `app.js` | Interface |
| `db.js` | Accès aux données (Supabase ou mode démo) |
| `seed.js` | Postes, devis et tâches du cadrage, chargés une fois depuis le Bilan. Gardé hors du dépôt public (`.gitignore`) ; pour un nouveau chargement, remettre `<script src="seed.js">` dans `index.html` le temps de l'opération |
| `config.js` | URL et clé publique Supabase |
| `supabase/schema.sql` | Tables, règles d'accès, historique des montants de devis |
| `sw.js`, `manifest.webmanifest`, `icones/` | Installation sur l'écran d'accueil |

## Mise en route de Supabase

1. Créer un projet gratuit sur supabase.com (région Europe).
2. **SQL Editor** : coller tout `supabase/schema.sql` et l'exécuter.
3. Toujours dans SQL Editor, déclarer les deux comptes du foyer :
   ```sql
   insert into foyer (email) values ('premiere@adresse.fr'), ('seconde@adresse.fr');
   ```
4. **Authentication > Sign In / Providers > Email** : désactiver
   « Allow new users to sign up ». Personne ne peut plus s'inscrire seul.
5. **Authentication > Users > Add user** : créer les deux comptes (mêmes
   adresses qu'à l'étape 3, cocher « Auto Confirm User »).
6. **Project Settings > API** : copier « Project URL » et la clé **anon public**
   dans `config.js`. Ne jamais y mettre la clé `service_role`.
7. Ouvrir l'application, se connecter, puis sur le Bilan cliquer
   « Charger les données du chantier ».

Les règles d'accès refusent toute lecture ou écriture à quelqu'un qui n'est pas
connecté avec l'une des deux adresses de la table `foyer`.

## Mise en ligne sur GitHub Pages

1. Créer un dépôt sur github.com et y pousser ce dossier.
2. **Settings > Pages** : Source « Deploy from a branch », branche `main`,
   dossier `/ (root)`.
3. L'adresse est `https://<compte>.github.io/<depot>/`.

La clé anon est publique par conception : la protection vient des règles
d'accès de la base, pas du secret de la clé.

## Installer sur téléphone

- Android (Chrome) : menu ⋮ > Ajouter à l'écran d'accueil.
- iPhone (Safari) : bouton Partager > Sur l'écran d'accueil.
- PC (Edge ou Chrome) : icône d'installation dans la barre d'adresse.

## Mise à jour

Après une modification, changer `CACHE` dans `sw.js` (par exemple
`chantier-v2`) pour que les téléphones récupèrent la nouvelle version.

Supabase met en pause un projet gratuit après une semaine sans activité ; il se
relance depuis son tableau de bord.
