#!/usr/bin/env bash
# Fixture avec police TrueType embarquée (DejaVuSans.ttf), texte peint dans une
# encre directe -> exerce glyph-outline.js (Tier B) avec une vraie police de
# production, pas juste des tracés vectoriels simples.
#
# Construit en binaire-safe : le flux FontFile2 est concaténé tel quel (`cat`),
# jamais capturé dans une variable bash (qui tronquerait sur un octet NUL).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FONT="$DIR/DejaVuSans.ttf"
OUT="$DIR/fixture-font-spot.pdf"

font_len=$(wc -c < "$FONT")

: > "$OUT"
declare -a offsets
printf '%%PDF-1.7\n' >> "$OUT"

add_text_obj() { # add_text_obj <num> <body>
	offsets[$1]=$(wc -c < "$OUT")
	{ printf '%s 0 obj\n' "$1"; printf '%s' "$2"; printf '\nendobj\n'; } >> "$OUT"
}

# 1: Catalog, 2: Pages, 3: Page, 4: Content stream, 5: Font, 6: FontDescriptor,
# 7: FontFile2 (binaire), 8: ColorSpace Separation, 9: tint transform function.
add_text_obj 1 '<< /Type /Catalog /Pages 2 0 R >>'
add_text_obj 2 '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'
add_text_obj 3 '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Resources << /Font << /F1 5 0 R >> /ColorSpace << /CS0 8 0 R >> >> /Contents 4 0 R >>'

content='/CS0 cs
1 scn
BT
/F1 64 Tf
10 70 Td
(TAC Hello 123) Tj
ET'
add_text_obj 4 "<< /Length ${#content} >>
stream
${content}
endstream"

# Widths approximatives (1000 unit/em) pour les codes 32..122 (couvre maj. et
# min.) : suffisant pour la mise en page, sans incidence sur la forme des
# glyphes (uniquement dérivée de FontFile2 + du gid résolu par MuPDF).
widths="$(for i in $(seq 32 122); do printf '556 '; done)"

add_text_obj 5 "<< /Type /Font /Subtype /TrueType /BaseFont /DejaVuSans /FirstChar 32 /LastChar 122 /Widths [ ${widths} ] /Encoding /WinAnsiEncoding /FontDescriptor 6 0 R >>"
add_text_obj 6 '<< /Type /FontDescriptor /FontName /DejaVuSans /Flags 32 /FontBBox [-1021 -463 1793 1232] /ItalicAngle 0 /Ascent 928 /Descent -236 /CapHeight 729 /StemV 80 /FontFile2 7 0 R >>'

# FontFile2 : objet binaire, écrit à part (pas via add_text_obj/printf '%s').
offsets[7]=$(wc -c < "$OUT")
{
	printf '7 0 obj\n<< /Length %d /Length1 %d >>\nstream\n' "$font_len" "$font_len"
} >> "$OUT"
cat "$FONT" >> "$OUT"
printf '\nendstream\nendobj\n' >> "$OUT"

add_text_obj 8 '[/Separation /Spot1 /DeviceCMYK 9 0 R]'
add_text_obj 9 '<< /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [0 0 0 1] /N 1 >>'

xref_offset=$(wc -c < "$OUT")
count=10
{
	printf 'xref\n0 %d\n' "$count"
	printf '0000000000 65535 f \n'
	for ((i = 1; i < count; i++)); do
		printf '%010d 00000 n \n' "${offsets[i]}"
	done
	printf 'trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n' "$count" "$xref_offset"
} >> "$OUT"

echo "Généré : $OUT ($(wc -c < "$OUT") octets)"
