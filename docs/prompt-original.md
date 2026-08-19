# Mission : Portage 100% Browser d'un outil de mesure de taux d'encrage (éco-conception packaging)

## Contexte
J'ai un outil Python fonctionnel qui analyse le taux d'encrage d'un PDF print (packaging). 
Il utilise Ghostscript (device `tiffsep`) pour rasteriser un PDF en séparations contone 
(une image niveaux de gris par encre CMJN + tons directs), puis calcule la couverture 
moyenne de chaque encre et le TAC (Total Area Coverage) moyen par page.

Je veux une version **100% navigateur**, sans backend, sans installation client, 
sans upload de fichier. Le PDF reste côté client (FileReader). L'objectif est 
de permettre à un graphiste de glisser-déposer son PDF et d'obtenir un tableau 
de couvertures + un CSV exportable, directement dans le navigateur.

## Fonctionnalités à reproduire (équivalence stricte avec le script Python)

### Entrée
- Fichier PDF (PDF/X-4 ou équivalent) via drag & drop ou file picker
- Choix de la résolution de rasterisation (DPI) : 150, 300, 600, 1200 (défaut 600)
- Le fichier ne quitte JAMAIS le navigateur. Zero appel réseau.

### Traitement
Pour chaque page du PDF :
1. **Rasteriser en séparations contone** (ton continu, sans tramage), une couche par encre.
2. **Identifier toutes les encres** : Cyan, Magenta, Yellow, Black + tous les tons directs (Pantone, etc.)
3. **Calculer la couverture moyenne (%)** de chaque séparation :
   - `couverture = (1 - moyenne_normalisée) * 100` car noir = encre, blanc = pas d'encre
   - Si le fond n'est pas parfaitement noir (min > 0), afficher un warning "fond non nul détecté"
4. **Calculer le TAC moyen** par page = somme de toutes les couvertures moyennes
5. **Gérer le multi-page** : produire un résultat par page

### Sortie
- Tableau interactif affichant : Page | Encre | Couverture_%
- Ligne TAC_MOYEN par page
- Bouton "Exporter CSV" avec le format exact suivant :
  ```csv
  Page,Encre,Couverture_%
  1,Cyan,12.34
  1,Magenta,5.67
  ...
  1,TAC_MOYEN,45.23
  ```
- Optionnel mais apprécié : miniatures des séparations (aperçu noir/blanc de chaque couche)

## Stack technique imposée

### Piste principale : MuPDF WASM
MuPDF est le seul moteur WASM connu qui supporte nativement le rendu en séparations 
avec tons directs (spot colors). Il expose une API C qui, en WASM, permet :
- `fz_page_separations()` : lister les encres d'une page
- `fz_set_separation_behavior(..., FZ_SEPARATION_SPOT)` : forcer le rendu séparé
- `fz_new_pixmap_from_page_with_separations()` : rendre en pixmap avec toutes les couches
- Les samples de la pixmap sont ordonnés : **[C M Y K Spot0 Spot1 ... Alpha]**
- `pix->n` = nombre total de composantes, `pix->s` = nombre de spots, `pix->a` = alpha

Tu utiliseras **mupdf-wasm** (disponible via CDN/unpkg ou npm) comme moteur de rendu.
Référence technique MuPDF sur les séparations : 
https://medium.com/@pymupdf/rendering-separations-with-mupdf-bdf413b618fe

### Architecture
- **Single Page Application** en vanilla HTML5 + JavaScript (ou TypeScript si tu préfères, 
  mais compilé en JS vanilla, pas de framework lourd type React/Vue/Angular).
- **Pas de build step obligatoire côté client** : un fichier `index.html` qui charge 
  le WASM MuPDF via CDN (unpkg/skypack) est l'idéal. Si tu utilises un bundler 
  (vite/parcel), livre le build statique.
- **Pas de backend, pas de Node.js côté client**, pas d'installation requise.

### Si MuPDF WASM bloque
Alternative acceptable : tout autre moteur WASM capable de rendre des séparations 
CMJN+spots en contone (PDFium WASM, etc.), à condition que ce soit 100% client 
et chargé via CDN. **Ne pas** proposer de solution serveur (pas de Python, pas de Node backend).

## Spécifications UI/UX détaillées

### Écran principal
1. **Zone de drop** centrée, stylisée (border dashed), avec message 
   "Déposez un PDF print ici (aucun fichier n'est uploadé)"
2. **Sélecteur de résolution** : dropdown [150, 300, 600, 1200] ppp, défaut 600
3. **Bouton "Analyser"** (désactivé tant qu'aucun fichier n'est chargé)

### Pendant le traitement
- Barre de progression ou spinner avec texte dynamique :
  - "Chargement du moteur WASM..."
  - "Analyse des séparations page 1/X..."
  - "Calcul des couvertures..."
- Le traitement WASM étant potententiellement lourd sur de gros PDF en haute résolution, 
  utiliser des **Web Workers** pour ne pas bloquer le thread UI si possible.

### Résultats
- Tableau triable (par page, par encre, par couverture)
- Lignes TAC_MOYEN en gras
- Bouton "Télécharger CSV" (nom du fichier : `couverture_encres_<nom_du_pdf>.csv`)
- Option : cases à cocher pour ignorer certaines encres (ex: repères de coupe) 
  du calcul TAC, avec persistance du choix dans le tableau

### Gestion des erreurs
- "Ce fichier ne semble pas être un PDF valide"
- "Aucune séparation détectée"
- "Mémoire insuffisante pour cette résolution" (si le PDF est trop grand en WASM)
- Warning fond non nul par séparation

## Détails techniques critiques à respecter

### 1. Ordre des séparations MuPDF
Dans la pixmap MuPDF avec séparations, les samples sont organisés ainsi :
- Plan 0 : Cyan
- Plan 1 : Magenta  
- Plan 2 : Yellow
- Plan 3 : Black
- Plan 4..(4+s-1) : Spots (dans l'ordre retourné par `fz_page_separations`)
- Dernier(s) plan(s) : Alpha

Tu dois itérer sur chaque plan séparément pour calculer la moyenne.

### 2. Calcul de la couverture
```javascript
// Pour un plan donné (Uint8Array ou Uint16Array des valeurs d'un canal)
const moyenne = pixels.reduce((a, b) => a + b, 0) / pixels.length;
const max = 255; // ou 65535 selon le format interne de MuPDF
const couverture = (1.0 - (moyenne / max)) * 100.0;
```
Logique : 0 = blanc (pas d'encre), 255 = noir (encre pleine) → identique à Ghostscript.

### 3. Noms des encres
- Récupérer les noms via `fz_separation_name()` pour les spots
- Pour les process : forcer les labels "Cyan", "Magenta", "Yellow", "Black" 
  (même si MuPDF retourne des noms techniques)

### 4. Résolution
La résolution DPI est passée à la matrice de transformation MuPDF (`fz_matrix`) 
pour le rendu. Attention à la consommation mémoire : un A4 à 1200 DPI = ~130M pixels, 
soit ~500MB en mémoire avec plusieurs séparations. Prévoir un garde-fou 
(max 1200 DPI, warning si >600).

### 5. Multi-page
Boucler sur toutes les pages du PDF. Afficher une progression par page.

## Livrables attendus
1. `index.html` (ou build statique) fonctionnel en ouvrant directement dans un navigateur moderne
2. `README.md` avec :
   - Comment lancer (juste ouvrir le fichier HTML, ou `npx serve` si besoin d'un local server pour le WASM)
   - Limitations connues (taille de PDF max, résolution max, support des spots complexes)
   - Crédits (MuPDF WASM)
3. Code commenté, notamment la partie extraction des séparations MuPDF

## Contraintes non négociables
- [ ] Zero fichier envoyé sur un serveur
- [ ] Zero installation requise par l'utilisateur final
- [ ] Zero backend à déployer
- [ ] Fonctionne offline après chargement initial (Service Worker optionnel mais apprécié)
- [ ] Compatible Chrome/Firefox/Safari récents
- [ ] Le CSV de sortie doit être strictement identique en structure à celui du script Python

## Contexte fourni
Voici le code Python original à partir duquel tu dois faire l'équivalence fonctionnelle :
[insérer ici le code Python de l'article si besoin, ou référencer le fichier article.txt]

Commence par créer la structure HTML/JS, puis intègre MuPDF WASM. 
Si tu bloques sur l'intégration WASM de MuPDF, explique précisément où et propose 
une piste alternative documentée avant de changer de stack.
