# Publier / renommer ce dépôt sur GitHub

Le dépôt distant existe déjà sous le nom **`inkcover`**
(`https://github.com/JulienSarrazin/inkcover`), avec l'historique local déjà
poussé. Comme un autre projet utilise déjà le nom "inkcoverage.app", le projet
est renommé **rosette** — voici comment renommer le dépôt GitHub pour
suivre.

## 1. Renommer le dépôt sur GitHub

Sur la page du dépôt : **Settings** → tout en haut, champ "Repository name"
→ remplacez `inkcover` par `rosette` → **Rename**.

GitHub redirige automatiquement les anciennes URLs (`.../inkcover`) vers la
nouvelle pendant un moment, donc rien ne casse immédiatement si un lien
traîne encore quelque part.

## 2. Mettre à jour le remote local

Depuis le dossier `rosette/` (le dossier local a aussi été renommé, depuis
`tac-calc/`) :

```bash
git remote set-url origin https://github.com/JulienSarrazin/rosette.git
git remote -v   # vérifier que ça pointe bien vers la nouvelle URL
git push origin main
```

## 3. Après le renommage

- **Description/topics GitHub** : suggestion de description courte — "Rosette
  — mesure du taux de couverture d'encre (TAC) d'un PDF print, 100% dans le
  navigateur, zéro backend." Topics suggérés : `pdf`, `webassembly`, `print`,
  `packaging`, `eco-design`, `mupdf`.
- `webapp/config.yml` → `credits.github_url` pointe déjà vers
  `https://github.com/JulienSarrazin/rosette/` (mis à jour par avance) —
  vérifiez juste que le lien fonctionne une fois le renommage fait côté
  GitHub, puis re-déployez si l'outil est déjà en ligne sur OVH.

## Si vous créez un tout nouveau dépôt à la place

Sur [github.com/new](https://github.com/new), nom `rosette`, ne cochez rien
("Add a README/.gitignore/license" — déjà tout présent en local), puis :

```bash
git remote set-url origin https://github.com/<votre-compte>/rosette.git
git push -u origin main
```

## Ce qui n'est volontairement pas dans le dépôt

Voir `.gitignore` à la racine : le CSV ADEME déposé pendant les recherches
(sans rapport avec le sujet), les copies PDF du guide Citeo et de votre
article (déjà accessibles via leurs liens officiels dans
`webapp/config.yml`), et les fichiers `*.txt:Zone.Identifier` (métadonnées
Windows sans intérêt). Rien n'a été supprimé de votre dossier de travail —
seulement exclu du suivi Git.
