# rosette — taux de couverture d'encre (TAC), 100% navigateur

Portage 100% client, sans backend, du script Python d'origine (`docs/original-python-script.py`
à la racine du dépôt) qui mesurait la couverture d'encre CMJN + tons directs d'un
PDF print via Ghostscript (`tiffsep`). Le PDF ne quitte jamais le navigateur :
aucun upload, aucun appel réseau après le chargement initial de la page.
Voir le [README racine](../README.md) pour la présentation du projet.

## Lancer en local

Aucune installation requise côté client — c'est un dossier statique. Pour le
tester en local, servez-le avec n'importe quel serveur HTTP :

```bash
cd dev
docker compose up --build
# puis ouvrir http://localhost:8080
```

(Le conteneur, c'est juste nginx qui sert `webapp/` avec le bon type MIME pour
le `.wasm` — voir `dev/nginx.conf`.)

Sans Docker, un simple serveur statique suffit aussi, par exemple `npx serve`
ou `python -m http.server` **si vous avez Node/Python sur votre machine** —
cet environnement de développement n'en a pas, d'où le choix de Docker comme
méthode de test principale ici.

Ouvrir directement `index.html` en `file://` ne fonctionne **pas** : les
modules ES et le chargement du WASM ont besoin d'un vrai serveur HTTP.

## Comment ça marche

Moteur de rendu : [MuPDF](https://mupdf.com/) compilé en WebAssembly (package
npm `mupdf`, vendorisé dans `vendor/mupdf/` — voir `dev/fetch-mupdf.sh`).
Tout le travail de rendu se fait dans un Web Worker (`js/worker.js`), hors du
thread UI.

La mesure se fait en deux temps par page :

- **Encres process (Cyan/Magenta/Jaune/Noir)** — `js/cmyk-coverage.js` :
  rendu natif MuPDF vers une pixmap DeviceCMYK. Rapide, fiable, fidélité texte
  parfaite (c'est le vrai rasteriseur C de MuPDF, pas une reconstruction JS).
- **Tons directs (Pantone, DeviceN...)** — `js/spot-coverage.js` : l'API JS de
  MuPDF n'expose pas de rendu "toutes séparations" équivalent à `tiffsep`
  (pas de `fz_new_pixmap_from_page_with_separations` côté JS). On reconstruit
  donc nous-mêmes un accumulateur par encre directe via un `Device`
  personnalisé (`page.run(device, matrix)`) qui redessine chaque tracé/texte
  sur un canvas hors-écran par encre. Le texte utilise de vrais contours de
  glyphes (`js/glyph-outline.js`, décodeur TrueType `glyf`/`loca` et CFF Type2
  écrit pour ce projet) à partir des octets de police extraits du PDF — pas
  une approximation par boîte englobante, sauf pour les polices non embarquées
  (voir limites plus bas).

Avant le rendu CMJN, `js/pdf-resources.js` neutralise dans notre copie en
mémoire du PDF la fonction de transfert de chaque encre directe vers son
équivalent CMJN : sans ça, le rendu CMJN natif de MuPDF évaluerait cette
fonction et compterait deux fois une même zone (une fois en CMJN "fantôme",
une fois comme encre directe). Cette mutation ne touche que la copie en
mémoire du document dans l'onglet — jamais le fichier d'origine.

Au-delà de la mesure brute, l'app affiche :
- des **cards colorées par encre** (`js/ink-color.js`) — teintes de référence
  fixes pour le CMJN, couleur approximative extraite de la fonction de
  transfert d'origine pour les tons directs (repli sur une teinte dérivée du
  nom si aucune donnée exploitable) ;
- un **dashboard éco-encrage** (`js/co2e-dashboard.js`) traduisant le TAC en
  épaisseur de film, poids d'encre et empreinte carbone (équivalent CO2) du
  PDF analysé — pas un "CO2 évité" : la formule et le coefficient du guide
  sont réutilisés tels quels, mais leur exemple compare deux versions d'un
  emballage (avant/après refonte), alors qu'ici on mesure un seul fichier, à
  un instant T, sans comparaison — selon la méthodologie du
  [Guide de l'éco-encrage, Citeo](https://bo.citeo.com/sites/default/files/2019-07/20190524_Citeo_Guide%20%C3%A9co-encrage_WEB.pdf)
  (copie dans `docs/references/`) — vérifié contre l'exemple chiffré du guide,
  voir `dev/fixtures/co2e-formula-test.mjs` ;
- une section **"Comprendre les limites de cet outil"**, dans l'app, en
  langage non technique (voir plus bas pour la version détaillée) ;
- un **bouton FR/EN** (`js/i18n.js`) qui traduit toute l'interface (dictionnaire
  plat, sans dépendance externe) — le tableau et le CSV gardent en revanche
  toujours le nom brut des encres tel qu'il apparaît dans le PDF, quelle que
  soit la langue, pour rester un format d'échange fiable ; seules les cards
  affichent un libellé bilingue ("Ton direct : X" / "Spot color: X",
  `js/ink-naming.js`) ;
- un **export du rapport en PDF** (en plus du CSV) : mise en page HTML/CSS
  dédiée (`#print-report` dans `index.html`, styles `@media print` dans
  `css/styles.css`) avec miniature de chaque page (rendue par le worker,
  `js/worker.js`), tableau d'encres coloré et résumé éco-encrage, déclenchée
  par `window.print()` — l'utilisateur choisit "Enregistrer en PDF" comme
  destination d'impression. Toujours 100% client-side, aucun envoi de fichier.

## Personnalisation (thème, config.yml)

Rien à recompiler : `config.yml` (à la racine de `webapp/`) et
`themes/<nom>/theme.yml` sont lus au chargement de la page (parseur YAML
minimal, `js/yaml-lite.js` — pas de dépendance externe).

- **`config.yml`** : thème actif, mode d'affichage (`appearance.mode` :
  `clear` clair forcé, `dark` sombre forcé, `auto` suit le système du
  visiteur — défaut), politique CDN (`cdn.enabled`, désactivée par défaut —
  tout reste auto-hébergé), présélections du dashboard, liens de crédit
  (guide Citeo, votre article, mention IA) — tout est éditable sans toucher
  au code. Volontairement, aucune référence à l'ADEME/Base Empreinte
  n'est citée : seul le Guide de l'éco-encrage Citeo (et les sources qu'il
  cite lui-même) sert de base au dashboard.
- **`themes/default/theme.yml`** : couleurs (clair/sombre), rayons d'angle,
  typographie. Pour créer un second thème : copiez un dossier existant vers
  `themes/mon-theme/`, ajustez les valeurs, puis `theme: mon-theme` dans
  `config.yml`. Pas de sélecteur dans l'interface — un seul thème actif à la
  fois, choisi côté fichier.
- **Police CDN optionnelle** : `theme.yml -> typography.google_font_url`
  n'est chargé que si `config.yml -> cdn.enabled: true` ; sinon repli
  automatique sur la pile système locale (`font_family`) — zéro requête
  externe par défaut.
- **Police auto-hébergée** : `theme.yml -> typography.font_files` (liste de
  `{family, url, weight, style}`, chemin relatif au dossier du thème) génère
  des `@font-face` et se charge **toujours**, indépendamment de `cdn.enabled`
  — ce sont des fichiers locaux, pas une dépendance externe. Voir
  `themes/juliensarrazin/` ci-dessous pour un exemple complet.

### Thèmes livrés

- **`default`** — thème neutre, vert forêt, arrondis moyens (actif par défaut).
- **`juliensarrazin`** — calé sur [juliensarrazin.fr](https://www.juliensarrazin.fr)
  (WordPress, thème "Twenty Twenty-Five" personnalisé) : palette crème/encre
  relevée directement dans les variables `--wp--preset--color--*` du site,
  police **Manrope** (+ Fira Code) auto-hébergée en `.woff2` dans
  `themes/juliensarrazin/fonts/` — exactement comme le site d'origine, qui
  auto-héberge lui-même ses polices plutôt que d'utiliser Google Fonts. Pas
  de correspondance automatique : à ré-ajuster à la main si le site change de
  charte. Licence des polices : SIL OFL 1.1, voir `fonts/LICENSE.txt`.
- **`atelier-encrage`** — look technique à haut contraste, angles nets,
  accent bleu-cyan (écho à l'encre Cyan mesurée par l'outil).
- **`doux`** — palette pastel sauge/lavande, grands rayons d'angle, ambiance
  calme. Sert aussi à vérifier que le mécanisme encaisse des looks opposés.

Pour essayer un thème : éditez `theme:` dans `config.yml`, rechargez la page.

## Limites connues

- **Texte en police non embarquée** (une des 14 polices standard PDF, sans
  `FontFile`/`FontFile2`/`FontFile3`) : approximé par une boîte englobante par
  glyphe pour la mesure en encre directe, faute de contour disponible. En
  pratique ça ne devrait quasiment jamais se produire sur un vrai fichier de
  production : le PDF/X (visé par ce cahier des charges) impose l'embarquement
  de toutes les polices.
- **Polices Type1 brutes** (`FontFile`, rares aujourd'hui) : non décodées,
  même repli boîte englobante que ci-dessus.
- **DeviceN multi-colorants** : MuPDF n'expose pas les noms individuels des
  colorants d'un DeviceN côté JS. On les résout en comparant le nombre de
  composantes à ce qui est déclaré dans les ressources du PDF ; si plusieurs
  DeviceN différents ont le même nombre de composantes sur une page, il peut y
  avoir ambiguïté sur les noms (l'ordre de grandeur de la couverture reste
  correct, l'étiquette peut être approximative).
- **Tier B (tons directs), quelques cas non comptabilisés** : images et
  dégradés en encre directe (rare en pratique, la quasi-totalité des usages
  ton direct en packaging sont des aplats vectoriels et du texte), groupes de
  transparence/masques/motifs tramés non isolés finement (leur contenu est
  quand même dessiné), clip par une forme de texte non appliqué, apparences
  d'annotations (`/AP`) non parcourues pour la détection des encres/polices.
  Toute ligne concernée est marquée `≈` dans le tableau et le résultat reste
  une estimation, pas une valeur garantie identique à un pipeline Ghostscript.
- **Précision 8 bits** : comme tout raster 8 bits/canal (y compris les TIFF
  produits par Ghostscript `tiffsep`), la couverture mesurée a une précision
  d'environ ±0,5 % par encre, indépendante de la résolution choisie.
- **Résolution** : 1200 DPI max, avertissement au-delà de 600 DPI. Un
  garde-fou mémoire refuse l'analyse si l'estimation dépasse ~1,2 Go (message
  "Mémoire insuffisante pour cette résolution").
- **Dashboard éco-encrage** : basé sur des moyennes sectorielles (Guide Citeo),
  pas une mesure de l'encre/l'imprimeur réels de l'utilisateur. Le guide ne
  couvre que 5 procédés traditionnels (offset, flexo, héliogravure,
  typographie, sérigraphie) — pas d'impression numérique, volontairement, pour
  ne pas inventer un coefficient non sourcé.

## Déploiement sur hébergement mutualisé OVH (Apache)

Le dossier `webapp/` se déploie **tel quel** par FTP/SFTP dans le dossier
public (ou un sous-dossier dédié, ex. `/outils/rosette/`). Aucun backend,
aucun Node.js côté serveur.

Le fichier `.htaccess` fourni dans `webapp/` :
- déclare le type MIME `application/wasm` pour le fichier `.wasm` (sans ça,
  la compilation "streaming" du WASM échoue et retombe sur un mode plus lent
  — pas bloquant, mais moins bon) ;
- active la compression gzip sur le JS/WASM/CSS ;
- met en cache longuement les fichiers de `vendor/` (ils ne changent qu'à un
  ré-déploiement).

Vérifiez après déploiement que `.htaccess` est bien pris en compte (certaines
configs OVH nécessitent `AllowOverride All` — à défaut, contactez le support
OVH ou passez ces réglages dans la configuration Apache si vous y avez accès).

## Intégration WordPress (à décider plus tard)

Recommandation : une **`<iframe>`** pointant vers le dossier statique déployé,
plutôt qu'un enqueue de script dans le thème — isole proprement l'app de
jQuery/Elementor/CSP du thème WordPress, et évite tout conflit avec le pipeline
de build de WP. Le JS/CSS de l'outil est écrit sans dépendance globale
(modules ES scopés, pas de pollution de `window`), donc les deux options
restent ouvertes si vous préférez au final une intégration plus poussée.

Pour que l'iframe s'accorde visuellement avec le thème WordPress : le thème
`themes/juliensarrazin/` (voir "Thèmes livrés" plus haut) est déjà calé sur
la charte actuelle de juliensarrazin.fr — passez `theme: juliensarrazin` dans
`config.yml` pour l'activer. Si la charte du site change, dupliquez le
dossier et ajustez couleurs/rayons/typographie à la main — pas d'automatisme,
mais le mécanisme est prêt.

## Mettre à jour MuPDF

```bash
dev/fetch-mupdf.sh [version]   # défaut : 1.28.0
```

Télécharge le tarball npm officiel directement depuis le registre (pas besoin
de Node/npm en local), extrait `mupdf.js`/`mupdf-wasm.js`/`mupdf-wasm.wasm`
dans `webapp/vendor/mupdf/`.

## Licence

MuPDF est distribué sous licence **AGPL-3.0-or-later** (licence commerciale
alternative disponible auprès d'[Artifex Software](https://artifex.com/)).
En intégrant MuPDF WASM côté client, l'usage classique de l'AGPL implique de
mettre à disposition le code source complet de cet outil (y compris ce dépôt)
sous licence compatible si vous le distribuez publiquement — à anticiper avant
une mise en ligne publique définitive. Voir `webapp/vendor/mupdf/LICENSE-mupdf.txt`.

## Tests

`dev/fixtures/` contient des PDF de test générés à la main (pas de lib PDF
disponible dans cet environnement de dev) et un smoke-test navigateur complet
(`browser-smoke-test.mjs`, piloté par Playwright) qui vérifie bout-en-bout :
couverture CMJN exacte (Tier A), couverture ton direct + non double-comptage
CMJN (Tier B), et rendu de texte en police TrueType embarquée (glyph-outline.js).

Rejouer les fixtures : `dev/fixtures/make-fixtures.sh` et
`dev/fixtures/make-font-fixture.sh` (le second a besoin d'une police
TrueType réelle, ex. `DejaVuSans.ttf`, déjà présente dans ce dossier).

`dev/fixtures/co2e-formula-test.mjs` est un test pur JS (pas de navigateur)
qui vérifie que `js/co2e-dashboard.js` reproduit l'exemple chiffré du guide
Citeo : `node dev/fixtures/co2e-formula-test.mjs`.

Vérifié manuellement en plus des tests automatisés : bascule FR/EN (cards,
tableau, dashboard, pédagogie, sans re-déclencher d'analyse), rapport PDF via
`page.emulateMedia({ media: "print" })` (miniatures en data URL présentes,
résumé éco-encrage présent, aucune erreur console).
