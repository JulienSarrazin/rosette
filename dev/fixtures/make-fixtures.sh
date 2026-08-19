#!/usr/bin/env bash
# Génère deux PDF de test minimalistes à la main (pas de lib PDF disponible
# dans cet environnement) pour valider le calcul de couverture de façon
# reproductible :
#   fixture-cmyk.pdf  : page 200x200pt remplie d'un aplat CMJN connu
#                        (C=25% M=50% Y=75% K=10%) -> Tier A
#   fixture-spot.pdf  : page 200x200pt, moitié gauche remplie à teinte 100%
#                        dans une encre directe "Spot1" -> Tier B (~50%)
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

write_pdf() {
	local out="$1"; shift
	local -a obj_offsets=(0) # index 0 inutilisé (objet 0 = tête de xref libre)
	: > "$out"
	printf '%%PDF-1.7\n' >> "$out"

	local n=1
	while (( "$#" )); do
		obj_offsets[n]=$(wc -c < "$out")
		# $(...) dans les appels a strippé le \n final de chaque objet : on le
		# rajoute pour ne pas coller "endobj" au numéro de l'objet suivant.
		printf '%s\n' "$1" >> "$out"
		n=$((n + 1))
		shift
	done

	local xref_offset
	xref_offset=$(wc -c < "$out")
	local count=$n
	{
		printf 'xref\n0 %d\n' "$count"
		printf '0000000000 65535 f \n'
		for ((i = 1; i < count; i++)); do
			printf '%010d 00000 n \n' "${obj_offsets[i]}"
		done
		printf 'trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n' "$count" "$xref_offset"
	} >> "$out"
}

obj() { # obj <num> <body>
	printf '%s 0 obj\n%s\nendobj\n' "$1" "$2"
}

stream_obj() { # stream_obj <num> <dict-without-length> <content>
	local num="$1" dict="$2" content="$3"
	local len=${#content}
	printf '%s 0 obj\n%s /Length %d >>\nstream\n%s\nendstream\nendobj\n' "$num" "$dict" "$len" "$content"
}

# ---- fixture-cmyk.pdf --------------------------------------------------
cmyk_content='0.25 0.5 0.75 0.1 k
0 0 200 200 re
f'

write_pdf "$DIR/fixture-cmyk.pdf" \
	"$(obj 1 '<< /Type /Catalog /Pages 2 0 R >>')" \
	"$(obj 2 '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')" \
	"$(obj 3 '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R >>')" \
	"$(stream_obj 4 '<<' "$cmyk_content")"

# ---- fixture-spot.pdf ---------------------------------------------------
# Moitié gauche (100 x 200 sur une page 200x200) en encre directe "Spot1" à
# teinte pleine -> couverture attendue ~= 50% pour Spot1, 0% CMJN.
spot_content='/CS0 cs
1 scn
0 0 100 200 re
f'

write_pdf "$DIR/fixture-spot.pdf" \
	"$(obj 1 '<< /Type /Catalog /Pages 2 0 R >>')" \
	"$(obj 2 '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')" \
	"$(obj 3 '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /ColorSpace << /CS0 5 0 R >> >> /Contents 4 0 R >>')" \
	"$(stream_obj 4 '<<' "$spot_content")" \
	"$(obj 5 '[/Separation /Spot1 /DeviceCMYK 6 0 R]')" \
	"$(obj 6 '<< /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [0 0 0 1] /N 1 >>')"

echo "Générés :"
ls -la "$DIR"/fixture-*.pdf
