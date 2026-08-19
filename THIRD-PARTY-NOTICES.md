# Notices tierces

Ce dépôt est distribué sous licence **AGPL-3.0-or-later** (voir [LICENSE](LICENSE)),
notamment parce qu'il embarque MuPDF, lui-même sous AGPL — voir le détail
ci-dessous. Cette page liste les composants tiers inclus dans ce dépôt et
leurs licences respectives.

## MuPDF (WebAssembly)

- **Où** : `webapp/vendor/mupdf/`
- **Version** : 1.28.0 (package npm `mupdf`, vendorisé via `dev/fetch-mupdf.sh`)
- **Éditeur** : [Artifex Software, Inc.](https://artifex.com/)
- **Licence** : GNU Affero General Public License v3.0 or later. Une licence
  commerciale alternative est disponible auprès d'Artifex pour qui souhaite
  distribuer MuPDF sans les obligations de l'AGPL.
- **Texte complet** : `webapp/vendor/mupdf/LICENSE-mupdf.txt` (copie extraite
  du fichier source) et [gnu.org/licenses/agpl-3.0](https://www.gnu.org/licenses/agpl-3.0.en.html)

C'est cette dépendance qui détermine la licence de l'ensemble du dépôt :
en intégrant MuPDF WASM côté client, l'usage classique de l'AGPL implique de
distribuer le code source complet de l'outil sous licence compatible — d'où
le choix de l'AGPL-3.0-or-later pour ce dépôt dans son ensemble.

## Polices — thème "juliensarrazin"

- **Où** : `webapp/themes/juliensarrazin/fonts/`
- **Manrope** — par Mikhail Sharanda. Licence : SIL Open Font License 1.1.
- **Fira Code** — par Nikita Prokopov, basée sur Fira Mono (Mozilla / Carrois
  Type Design). Licence : SIL Open Font License 1.1.
- **Texte complet** : `webapp/themes/juliensarrazin/fonts/LICENSE.txt` et
  [openfontlicense.org](https://openfontlicense.org/open-font-license-official-text/)

Fichiers récupérés depuis juliensarrazin.fr, qui les auto-héberge déjà
lui-même (pas de dépendance à Google Fonts), pour reproduire la même
typographie ici.

## Police — fixture de test

- **Où** : `dev/fixtures/DejaVuSans.ttf`
- **DejaVu Sans** — dérivée de Bitstream Vera Sans. Licence : Bitstream Vera
  License / DejaVu fonts license (libre, sans redevance).
- Utilisée uniquement pour tester `js/glyph-outline.js` (décodeur de contours
  de glyphes) en conditions réelles avec une police TrueType — ne fait pas
  partie de l'application livrée (`webapp/`).

## Guide de l'éco-encrage (Citeo)

Les coefficients utilisés par `webapp/js/co2e-dashboard.js` (charge d'encre
par procédé, facteur CO2e) sont des **données factuelles extraites** du Guide
de l'éco-encrage, Citeo (2019) — transcrites en commentaires dans le code
avec leur source précise. Le document original (probablement soumis à droit
d'auteur en tant qu'œuvre éditoriale) n'est pas redistribué dans ce dépôt :
voir le lien officiel dans `webapp/config.yml` (`credits.citeo_guide_url`).
