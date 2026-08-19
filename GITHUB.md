# Publier ce dépôt sur GitHub

Le dépôt Git est déjà initialisé localement avec un premier commit. Il ne
reste qu'à créer le dépôt distant sur GitHub et à y pousser l'historique.

## 1. Créer le dépôt sur GitHub

Sur [github.com/new](https://github.com/new) :
- Nom suggéré : `tac-calc` (ou ce que vous préférez — pas besoin qu'il
  corresponde au nom du dossier local).
- Visibilité : public ou privé, comme vous le souhaitez.
- **Ne cochez rien** ("Add a README", "Add .gitignore", "Add a license") —
  le dépôt local a déjà tout ça, cocher une case ici créerait un commit
  distant en conflit avec l'historique local dès le premier push.

## 2. Relier le dépôt local et pousser

GitHub affiche les commandes exactes juste après la création (bouton
"…or push an existing repository from the command line"), mais en résumé,
depuis le dossier `tac-calc/` :

```bash
git remote add origin https://github.com/<votre-compte>/<nom-du-repo>.git
git branch -M main
git push -u origin main
```

(remplacez `<votre-compte>/<nom-du-repo>` par les vraies valeurs affichées
par GitHub). Une authentification vous sera demandée — GitHub n'accepte
plus les mots de passe pour `git push` en HTTPS, il faut un
[personal access token](https://github.com/settings/tokens) (ou passer en
SSH avec une clé déjà configurée).

## 3. Après publication

- **Lien GitHub dans l'app** : une fois le dépôt en ligne, copiez son URL
  dans `webapp/config.yml` → `credits.github_url` (remplace le `"#"`
  actuel), puis re-déployez. Le pied de page de l'outil pointera dessus.
- **Lien de l'article** : même chose pour `credits.article_url` — l'URL
  exacte est sur juliensarrazin.fr (l'export PDF local avait l'adresse
  tronquée, impossible à reconstituer avec certitude depuis ce dépôt).
- **Description/topics GitHub** : suggestion de description courte —
  "Mesure du taux de couverture d'encre (TAC) d'un PDF print, 100% dans le
  navigateur — MuPDF WASM, zéro backend." Topics suggérés : `pdf`,
  `webassembly`, `print`, `packaging`, `eco-design`, `mupdf`.
- **Réglages du dépôt** : si vous le passez en public, pensez à vérifier
  dans Settings → General qu'"Issues" et "Discussions" sont activés ou non
  selon ce que vous voulez ouvrir aux retours.

## Ce qui n'est volontairement pas dans le dépôt

Voir `.gitignore` à la racine : le CSV ADEME déposé pendant les recherches
(sans rapport avec le sujet), les copies PDF du guide Citeo et de votre
article (déjà accessibles via leurs liens officiels dans
`webapp/config.yml`), et les fichiers `*.txt:Zone.Identifier` (métadonnées
Windows sans intérêt). Rien n'a été supprimé de votre dossier de travail —
seulement exclu du suivi Git.
