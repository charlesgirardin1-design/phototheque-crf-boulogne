# Photothèque CRF Boulogne

Photothèque interne : import, tri, consultation et téléchargement de photos et vidéos,
avec deux profils d'accès (Utilisateur / Administrateur).

| Élément | Choix |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Hébergement | Vercel (fonctions serverless, région `fra1`) |
| Base de données | PostgreSQL (Neon recommandé), driver `postgres`, migrations SQL |
| Stockage des fichiers | Vercel Blob privé (en production), ou bucket compatible S3 (R2, AWS…) |
| Authentification | Mots de passe partagés en variables d'environnement, session signée (cookie HttpOnly) |

## Fonctionnement

- **Profils** : l'**Utilisateur** n'a accès qu'à la page « Importer » ; la consultation, le tri, le
  téléchargement et la suppression sont réservés à l'**Administrateur** (contrôlé côté serveur).
- **Import** (Utilisateur et Administrateur) : sélection multiple ou glisser-déposer, barre de progression,
  annulation. Le navigateur envoie le fichier **original directement au stockage** grâce à une URL
  signée : les gros fichiers ne passent jamais par une fonction Vercel (limitée à 4,5 Mo par requête).
  Le serveur vérifie ensuite que le fichier a bien été reçu, que sa taille est correcte et que son
  contenu correspond à son format.
- **Originaux intacts** : aucun redimensionnement, conversion ni compression. Le fichier téléchargé est
  identique octet pour octet au fichier importé, avec son nom d'origine. Seules des miniatures JPEG
  (et un aperçu pour HEIC/TIFF) sont générées dans le navigateur, pour l'affichage.
- **Métadonnées** : nom, type, taille, date d'import, date de prise de vue (EXIF pour les photos, y compris
  HEIC ; métadonnées MP4/MOV pour les vidéos ; à défaut, date du fichier, signalée comme telle),
  photographe, catégorie, activité, statut, identifiant unique. Le formulaire d'import propose un
  calendrier « Date de la prise de vue » : si une date est choisie, elle s'applique à tous les
  fichiers de l'import (sinon la date est lue automatiquement dans chaque fichier).
- **Statut** : tout nouvel import est « À TRIER ». L'administrateur le passe à « TRIÉE » (ou l'inverse),
  individuellement ou en lot.
- **Catégories et activités** en base de données, gérées par l'administrateur (ajout, renommage,
  désactivation, suppression si inutilisées). Données initiales : US, AS, Activité de transfert,
  Autre (avec l'activité Formation).
- **Administration** : tableau de bord, recherche, filtres (catégorie, activité, type, statut, dates),
  tri, aperçu photo/vidéo, sélection multiple, changement de statut, correction des informations,
  téléchargement, suppression définitive avec confirmation.
- **Téléchargement multiple** : archive ZIP assemblée **dans le navigateur** à partir des originaux
  (sans compression). Sur Chrome/Edge, l'archive est écrite directement sur le disque (pas de limite de
  taille) ; sur les autres navigateurs elle est construite en mémoire (préférer des lots de quelques Go).
  Aucune limite Vercel (durée, mémoire, taille de réponse) n'est sollicitée.
- **Espace de stockage** : le tableau de bord affiche l'espace disponible (jauge, alerte à 80 %).
  Un import est refusé s'il ferait dépasser 95 % du quota : sur l'offre Vercel Hobby (1 Go), un
  dépassement bloquerait le stockage pendant 30 jours.
- **Suppression** : les fichiers (original, miniature, aperçu) sont supprimés du stockage, puis
  l'enregistrement en base. Un import abandonné est nettoyé automatiquement chaque nuit (Vercel Cron).

## Sécurité

- Le rôle est déterminé **côté serveur** à partir du mot de passe ; les mots de passe ne sont jamais
  envoyés au navigateur, journalisés ou renvoyés par l'API.
- Session : jeton signé HMAC-SHA256 (`AUTH_SECRET`) dans un cookie `HttpOnly`, `Secure`, `SameSite=Lax`,
  valable 12 h. Changer `AUTH_SECRET` déconnecte tout le monde.
- **Chaque route API vérifie le rôle** ; le proxy (`src/proxy.ts`) et les layouts serveur protègent
  en plus les pages. Un utilisateur ne peut ni voir l'espace admin, ni appeler les API admin, ni
  consulter ou télécharger des médias.
- Bucket **privé** : les fichiers ne sont accessibles que par des URL signées temporaires (1 h pour
  l'affichage, 5 min pour un téléchargement), générées après contrôle du rôle.
- Limitation : 10 mots de passe erronés par IP et par 15 minutes.
- Contrôle d'origine (CSRF) sur toutes les requêtes de modification, requêtes SQL paramétrées,
  validation des identifiants, des formats (extension + signature binaire) et des tailles.
- En-têtes de sécurité (HSTS, `X-Frame-Options`, `nosniff`…) et `noindex`.

> ⚠️ Un mot de passe de 4 chiffres reste devinable malgré la limitation par IP. Il est fortement
> recommandé d'utiliser des mots de passe plus longs pour `USER_PASSWORD` et `ADMIN_PASSWORD`.

## Installation locale

Prérequis : Node.js 20.9+ (22 ou 24 recommandé), une base PostgreSQL et un bucket compatible S3.

```bash
npm install
cp .env.example .env.local   # puis renseigner les valeurs
npm run db:migrate           # crée les tables et les catégories initiales
npm run storage:cors         # autorise le navigateur à envoyer/lire les fichiers (une seule fois)
```

## Variables d'environnement

| Variable | Obligatoire | Rôle |
| --- | --- | --- |
| `DATABASE_URL` | oui | URL PostgreSQL (version *pooled* : Neon `-pooler`, Supabase port 6543) |
| `AUTH_SECRET` | oui | Secret de signature des sessions, ≥ 32 caractères (`openssl rand -base64 48`) |
| `USER_PASSWORD` | oui | Mot de passe du profil Utilisateur |
| `ADMIN_PASSWORD` | oui | Mot de passe du profil Administrateur |
| `ADMIN_PASSWORD_2`, `_3`… / `USER_PASSWORD_2`, `_3`… | non | Mots de passe supplémentaires pour chaque profil |
| `S3_BUCKET` | oui | Nom du bucket (privé) |
| `S3_ACCESS_KEY_ID` | oui | Clé d'accès au bucket (lecture/écriture sur ce bucket uniquement) |
| `S3_SECRET_ACCESS_KEY` | oui | Secret de la clé d'accès |
| `S3_ENDPOINT` | R2 : oui | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` (vide pour AWS S3) |
| `S3_REGION` | non | `auto` pour R2 (défaut), ex. `eu-west-3` pour AWS |
| `S3_FORCE_PATH_STYLE` | non | `true` uniquement pour MinIO et assimilés |
| `CRON_SECRET` | recommandé | Protège la tâche de nettoyage nocturne (`/api/cron/cleanup`) |
| `STORAGE_QUOTA_GB` | non | Espace de stockage total affiché et contrôlé (défaut 1 Go, offre Vercel Hobby) |
| `MAX_UPLOAD_SIZE_MB` | non | Taille max. d'un fichier (défaut 5000, max. 5120) |
| `APP_ORIGINS` | script CORS | Origines autorisées, utilisée seulement par `npm run storage:cors` |

Toutes ces variables sont lues **uniquement côté serveur** (aucune n'est préfixée `NEXT_PUBLIC_`).
Ne committez jamais `.env.local` (ignoré par `.gitignore`).

## Développement

```bash
npm run dev        # http://localhost:3000
npm run lint
npm run typecheck
npm test           # tests unitaires
```

Tests d'intégration (créent puis suppriment des données, **jamais en production**) :

```bash
npm run build && npm start
BASE_URL=http://localhost:3000 npm run test:integration   # avec USER_PASSWORD, ADMIN_PASSWORD, CRON_SECRET
```

## Build

```bash
npm run build
```

Sur Vercel, `vercel.json` lance `npm run vercel-build` : ce script applique les migrations de base
de données (`scripts/migrate.mjs`, idempotent) puis lance `next build`.

## Déploiement sur Vercel

### 1. Créer les services externes

**Base de données — Neon (offre gratuite suffisante)**
- Dans Vercel : *Storage* → *Create Database* → **Neon**, région **Frankfurt (eu-central-1)**, puis
  la connecter au projet : `DATABASE_URL` est ajoutée automatiquement.
- (Ou créer la base sur neon.tech et copier l'URL *pooled* dans `DATABASE_URL`.)

**Stockage — Vercel Blob privé (utilisé en production)**
- Vercel → projet → *Storage* → *Create* → **Blob**, accès **Private**, puis *Connect* au projet
  (Production + Preview). `BLOB_STORE_ID` est ajouté automatiquement et l'authentification
  se fait par OIDC : aucune clé à gérer, aucun réglage CORS.

**Alternative — Cloudflare R2 (si aucun Blob n'est relié)**
1. Cloudflare → *R2* → *Create bucket* (ex. `phototheque-crf`). Laisser l'accès public **désactivé**.
2. *R2* → *Manage API tokens* → *Create API token* : permission **Object Read & Write**, limitée à ce
   bucket. Noter l'Access Key ID, le Secret et l'endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
3. Configurer le CORS du bucket (depuis votre poste, une fois l'URL de production connue) :
   ```bash
   APP_ORIGINS=https://<votre-projet>.vercel.app,http://localhost:3000 \
   S3_ENDPOINT=... S3_BUCKET=... S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... \
   npm run storage:cors
   ```
   (Ou dans le tableau de bord R2 → bucket → *Settings* → *CORS policy* : origines de l'application,
   méthodes `GET`, `PUT`, `HEAD`, en-tête autorisé `content-type`.)

### 2. Connecter GitHub et importer le projet

1. Pousser le code sur GitHub (`charlesgirardin1-design/phototheque-crf-boulogne`).
2. Vercel → *Add New…* → *Project* → importer le dépôt GitHub. Si le projet Vercel
   `phototheque-crf-boulogne` existe déjà : *Settings* → *Git* → *Connect Git Repository*.
3. **Framework Preset : Next.js** (détecté automatiquement). Laisser *Build Command*, *Output Directory*
   et *Install Command* par défaut. Node.js : 22.x ou 24.x.

### 3. Configurer les variables d'environnement

*Settings* → *Environment Variables* : ajouter toutes les variables obligatoires du tableau ci-dessus
pour **Production** (et **Preview** si vous utilisez les déploiements de prévisualisation ; attention,
ils utiliseront la même base sauf si vous en configurez une autre). Générer `AUTH_SECRET` et
`CRON_SECRET` avec `openssl rand -base64 48`.

### 4. Déployer et vérifier

1. *Deployments* → *Redeploy* (ou pousser un commit sur `main`).
2. Dans les logs de build, vérifier `[migrate] base de données à jour` puis la réussite de `next build`.
3. **Deployment Protection** : si l'ouverture de l'URL demande une connexion Vercel, aller dans
   *Settings* → *Deployment Protection* et désactiver *Vercel Authentication* pour la production
   (ou ajouter un domaine personnalisé).
4. Tester en production : connexion utilisateur et administrateur, import d'une photo et d'une vidéo,
   passage en « TRIÉE », visibilité côté utilisateur, téléchargement, ZIP, suppression.
5. *Settings* → *Cron Jobs* : la tâche `/api/cron/cleanup` (3 h UTC) doit apparaître.

### Changer un mot de passe

Modifier `USER_PASSWORD` ou `ADMIN_PASSWORD` dans Vercel puis redéployer. Pour déconnecter
immédiatement toutes les sessions ouvertes, changer aussi `AUTH_SECRET`.

## Structure

```
db/migrations/          Schéma SQL et données initiales
scripts/                Migrations et configuration CORS du bucket
src/proxy.ts            Redirections des pages selon la session (ex-middleware)
src/app/                Pages (connexion, photothèque, import, administration) et routes API
src/lib/server/         Code serveur uniquement : env, base, stockage, session, accès aux données
src/lib/client/         Navigateur : appels API, EXIF/miniatures, ZIP
src/components/         Interface React
tests/                  Tests unitaires et d'intégration
```
