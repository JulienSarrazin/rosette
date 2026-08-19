// Génère un CSV strictement au même format que le script Python d'origine :
// colonnes Page,Encre,Couverture_% ; une ligne TAC_MOYEN par page.

function csvField(value) {
	const s = String(value);
	if (/[",\n]/.test(s))
		return `"${s.replace(/"/g, '""')}"`;
	return s;
}

// rows: [{ page, encre, couverturePct }], déjà dans l'ordre d'affichage voulu
// (y compris les lignes TAC_MOYEN).
export function buildCSV(rows) {
	const lines = ["Page,Encre,Couverture_%"];
	for (const row of rows)
		lines.push([row.page, csvField(row.encre), row.couverturePct.toFixed(2)].join(","));
	return lines.join("\r\n") + "\r\n";
}

export function csvFileName(pdfFileName) {
	const stem = pdfFileName.replace(/\.pdf$/i, "");
	return `couverture_encres_${stem}.csv`;
}
