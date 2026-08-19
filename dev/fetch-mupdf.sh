#!/usr/bin/env bash
# Vendorise le package npm "mupdf" (mupdf.js) sans passer par npm/node :
# récupère le tarball publié sur le registre npm, extrait dist/*.js + *.wasm
# et la licence AGPL, et les copie dans webapp/vendor/mupdf/.
#
# Rejouable pour mettre à jour la version vendorisée : bump MUPDF_VERSION.
set -euo pipefail

MUPDF_VERSION="${1:-1.28.0}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST_DIR="$SCRIPT_DIR/../webapp/vendor/mupdf"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

TARBALL_URL="https://registry.npmjs.org/mupdf/-/mupdf-${MUPDF_VERSION}.tgz"
echo "Téléchargement de mupdf ${MUPDF_VERSION}..."
curl -sSL -o "$TMP_DIR/mupdf.tgz" "$TARBALL_URL"

echo "Extraction..."
tar xzf "$TMP_DIR/mupdf.tgz" -C "$TMP_DIR"

mkdir -p "$DEST_DIR"
cp "$TMP_DIR/package/dist/mupdf.js" "$DEST_DIR/mupdf.js"
cp "$TMP_DIR/package/dist/mupdf-wasm.js" "$DEST_DIR/mupdf-wasm.js"
cp "$TMP_DIR/package/dist/mupdf-wasm.wasm" "$DEST_DIR/mupdf-wasm.wasm"

# Extrait le texte de licence AGPL présent en en-tête du fichier source.
{
  echo "mupdf.js ${MUPDF_VERSION} — vendorisé depuis ${TARBALL_URL}"
  echo "Licence : GNU Affero General Public License v3.0 or later"
  echo "(licence commerciale alternative disponible auprès d'Artifex Software, Inc. : https://artifex.com/)"
  echo
  echo "Texte complet : https://www.gnu.org/licenses/agpl-3.0.en.html"
  echo
  echo "--- En-tête de licence extraite de mupdf.js ---"
  head -n 20 "$TMP_DIR/package/dist/mupdf.js" | sed 's/^\/\/ \?//'
} > "$DEST_DIR/LICENSE-mupdf.txt"

echo "mupdf ${MUPDF_VERSION} vendorisé dans $DEST_DIR :"
ls -lh "$DEST_DIR"
