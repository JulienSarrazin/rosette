import argparse
import subprocess
import tempfile
import os
import re
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image


def trouverGhostscript():
    """
    Retourne le nom du binaire Ghostscript selon l'OS.
    - Windows : gswin64c.exe
    - Linux/Mac : gs
    """
    if os.name == "nt":
        return "gswin64c"
    return "gs"


def executerGhostscript(cheminPdf, resolutionDpi, dossierSortie):
    """
    Lance Ghostscript pour générer les séparations contone.

    Paramètres :
    - cheminPdf : PDF d'entrée
    - resolutionDpi : résolution de rasterisation
    - dossierSortie : dossier temporaire de sortie
    """
    gs = trouverGhostscript()

    # Pattern de sortie :
    # %d = numéro de page
    # Ghostscript ajoutera (NomEncre) automatiquement
    sortie = str(dossierSortie / "separations_%d.tif")

    commande = [
        gs,

        # Sécurité : empêche l'exécution de code dangereux dans le PDF
        "-dSAFER",

        # Mode batch : quitte automatiquement après traitement
        "-dBATCH",

        # Pas de pause entre les pages
        "-dNOPAUSE",

        # Device spécial : génère une image par séparation couleur
        "-sDEVICE=tiffsep",

        # Résolution de travail (DPI)
        # Plus c'est élevé, plus la mesure est précise (au prix du temps)
        f"-r{resolutionDpi}",

        # Fichier de sortie (pattern)
        f"-sOutputFile={sortie}",

        # PDF source
        str(cheminPdf)
    ]

    subprocess.run(commande, check=True)


def calculerCouverture(cheminTiff, noInvert):
    """
    Calcule la couverture moyenne (%) d'une séparation.

    Par défaut (logique Ghostscript) :
    - noir = encre
    - blanc = pas d'encre

    Donc :
    couverture = (1 - moyenne_normalisée) * 100
    """
    image = Image.open(cheminTiff).convert("L")
    pixels = np.array(image)

    # Valeur maximale théorique du format (255 en 8 bits, 65535 en 16 bits)
    maxTheorique = np.iinfo(pixels.dtype).max

    # Moyenne normalisée entre 0 et 1
    moyenne = pixels.mean() / maxTheorique

    # Contrôle qualité : fond non nul (séparation polluée)
    if pixels.min() > 0:
        print("⚠️ Attention : fond non nul détecté dans", cheminTiff.name)

    # Par défaut : inversion (noir = encre)
    if noInvert:
        # Mode debug : blanc = encre
        couverture = moyenne * 100.0
    else:
        # Mode normal : noir = encre
        couverture = (1.0 - moyenne) * 100.0

    return float(couverture)


def analyserSeparations(dossier, noInvert):
    """
    Analyse toutes les séparations générées par Ghostscript.
    Retourne un DataFrame pandas.
    """
    # Regex pour extraire :
    # separations_1(Cyan).tif → page=1, encre=Cyan
    motif = re.compile(r"separations_(\d+)\((.+)\)\.tif")
    resultats = {}

    for fichier in dossier.glob("separations_*.tif"):
        match = motif.match(fichier.name)
        if not match:
            continue

        page = int(match.group(1))
        encre = match.group(2)

        couverture = calculerCouverture(fichier, noInvert)

        if page not in resultats:
            resultats[page] = {}

        resultats[page][encre] = couverture

    # Construction du tableau final
    lignes = []

    for page, encres in sorted(resultats.items()):
        for encre, valeur in sorted(encres.items()):
            lignes.append({
                "Page": page,
                "Encre": encre,
                "Couverture_%": round(valeur, 2)
            })

        # TAC moyen = somme de toutes les encres
        tac = sum(encres.values())
        lignes.append({
            "Page": page,
            "Encre": "TAC_MOYEN",
            "Couverture_%": round(tac, 2)
        })

    return pd.DataFrame(lignes)


def main():
    """
    Point d'entrée CLI.
    """
    parser = argparse.ArgumentParser(
        description="Analyse du taux d'encrage contone depuis un PDF (CMJN + tons directs)"
    )

    # PDF source
    parser.add_argument(
        "-f", "--fichier",
        required=True,
        help="PDF à analyser"
    )

    # Résolution de rasterisation
    parser.add_argument(
        "-r", "--resolution",
        type=int,
        default=600,
        help="Résolution DPI (défaut 600)"
    )

    # Option debug : désactive l'inversion
    parser.add_argument(
        "--no-invert",
        action="store_true",
        help="Désactive l'inversion (rarement utile, debug seulement)"
    )

    args = parser.parse_args()

    cheminPdf = Path(args.fichier).resolve()
    if not cheminPdf.exists():
        raise FileNotFoundError("PDF introuvable")

    # Dossier temporaire auto-nettoyé
    with tempfile.TemporaryDirectory() as tmp:
        dossierTmp = Path(tmp)

        print("Rasterisation via Ghostscript...")
        executerGhostscript(cheminPdf, args.resolution, dossierTmp)

        print("Analyse des séparations...")
        df = analyserSeparations(dossierTmp, noInvert=args.no_invert)

        # Nom du CSV basé sur le PDF
        nomCsv = f"couverture_encres_{cheminPdf.stem}.csv"
        df.to_csv(nomCsv, index=False)

        print("\nRésultats :")
        print(df)
        print(f"\nCSV généré : {nomCsv}")


if __name__ == "__main__":
    main()