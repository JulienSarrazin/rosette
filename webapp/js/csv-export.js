// Génère un CSV avec les mêmes colonnes que le script Python d'origine :
// Page,Encre,Couverture_% ; une ligne de synthèse par page ("TAC Page" /
// "Page TAC" selon la langue de l'interface — voir js/i18n.js, ce n'est plus
// la valeur fixe "TAC_MOYEN" du script d'origine, changement demandé
// explicitement).

function csvField(value) {
	const s = String(value);
	if (/[",\n]/.test(s))
		return `"${s.replace(/"/g, '""')}"`;
	return s;
}

// rows: [{ page, encre, couverturePct }], déjà dans l'ordre d'affichage voulu
// (y compris les lignes de synthèse par page).
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
