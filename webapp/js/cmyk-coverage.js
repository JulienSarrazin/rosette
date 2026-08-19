// Tier A — couverture des encres process (CMJN).
//
// page.toPixmap(matrix, DeviceCMYK) est le rasteriseur natif de MuPDF (code C
// compilé, pas notre reconstruction JS) : rendu rapide et fidèle, y compris
// pour le texte. Une pixmap CMJN encode directement la quantité d'encre par
// canal (0 = pas d'encre, 255 = encre pleine) : contrairement aux séparations
// niveaux de gris de Ghostscript (0 = blanc = pas d'encre), aucune inversion
// n'est nécessaire ici.

const PROCESS_NAMES = ["Cyan", "Magenta", "Yellow", "Black"];

export function computeCMYKCoverage(pdfPage, matrix, mupdf) {
	const pixmap = pdfPage.toPixmap(matrix, mupdf.ColorSpace.DeviceCMYK, false, true);
	try {
		const n = pixmap.getNumberOfComponents();
		const width = pixmap.getWidth();
		const height = pixmap.getHeight();
		const stride = pixmap.getStride();
		const pixels = pixmap.getPixels();

		const sums = new Float64Array(n);
		const mins = new Uint8Array(n).fill(255);

		for (let row = 0; row < height; row++) {
			const rowStart = row * stride;
			for (let col = 0; col < width; col++) {
				const base = rowStart + col * n;
				for (let c = 0; c < n; c++) {
					const v = pixels[base + c];
					sums[c] += v;
					if (v < mins[c]) mins[c] = v;
				}
			}
		}

		const pixelCount = width * height;
		const results = [];
		for (let c = 0; c < n && c < PROCESS_NAMES.length; c++) {
			results.push({
				encre: PROCESS_NAMES[c],
				couverturePct: pixelCount > 0 ? (sums[c] / pixelCount / 255) * 100 : 0,
				fondNonNul: mins[c] > 0,
			});
		}
		return results;
	} finally {
		pixmap.destroy();
	}
}
