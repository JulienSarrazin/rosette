// Système de traduction minimal : dictionnaire plat {fr:{...}, en:{...}},
// interpolation de variables ({nom}), persistance du choix en localStorage.
// applyTranslations() gère le texte statique de index.html via des attributs
// data-i18n / data-i18n-placeholder / data-i18n-title. Le contenu généré en
// JS (cards, tableau, dashboard, messages) appelle t() directement au moment
// du rendu — voir app.js.

const STORAGE_KEY = "rosette-lang";

const DICT = {
	fr: {
		// Casse volontairement en minuscules : nom de marque stylisé, voir
		// index.html/README.md.
		"app.title": "rosette",
		"app.tagline": "Taux de couverture d'encre (TAC) — analyse un PDF print (CMJN + tons directs) et calcule la couverture d'encre par page. <strong>Le fichier reste dans votre navigateur</strong> — aucun upload, aucun serveur, ça fonctionne hors-ligne après le premier chargement.",
		"dropzone.title": "Déposez un PDF print ici",
		"dropzone.hint": "(aucun fichier n'est uploadé)",
		"dropzone.browse": "Choisir un fichier…",
		"controls.dpiLabel": "Résolution de rasterisation",
		"controls.dpi150": "150 DPI",
		"controls.dpi300": "300 DPI",
		"controls.dpi600": "600 DPI (recommandé)",
		"controls.dpi1200": "1200 DPI (lent, forte mémoire)",
		"controls.analyze": "Analyser",
		"inkCards.heading": "Vos encres, en un coup d'œil",
		// "TAC Page", pas "TAC moyen" : le TAC d'une page n'est pas une
		// moyenne entre plusieurs pages, juste la somme des couvertures de
		// cette page-là — "moyen" prêtait à confusion. Réutilisé tel quel par
		// le CSV exporté (voir csv-export.js/flattenRows) : plus de valeur
		// fixe "TAC_MOYEN", le CSV suit désormais la langue de l'interface.
		"inkCards.tacLabel": "TAC Page",
		"inkCards.pageLabel": "Page {page}",
		"inkCards.approxTitle": "Couleur approximative : ce ton direct n'a pas de correspondance CMJN exploitable dans le PDF, une teinte arbitraire mais stable est utilisée pour le distinguer visuellement.",
		"process.ink.Cyan": "Cyan",
		"process.ink.Magenta": "Magenta",
		"process.ink.Yellow": "Jaune",
		"process.ink.Black": "Noir",
		"results.heading": "Détail par page",
		"results.downloadCsv": "Télécharger CSV",
		"results.exportPdf": "Exporter le rapport en PDF",
		"table.page": "Page",
		"table.ink": "Encre",
		"table.coverage": "Couverture_%",
		"table.include": "Inclure dans TAC",
		"table.includeTitle": "Inclure « {ink} » dans le TAC de chaque page",
		"results.legend": "≈ estimation (encre directe, rendu reconstruit dans le navigateur — voir plus bas « Comprendre les limites de cet outil »)",
		"dashboard.heading": "Impact éco-encrage",
		"dashboard.badge": "estimation",
		"dashboard.introPrefix": "Ce que représente le taux d'encrage ci-dessus en épaisseur de film, en poids d'encre et en équivalent CO2, d'après les moyennes du",
		"dashboard.pageLabel": "Page analysée",
		"dashboard.processLabel": "Procédé d'impression",
		"dashboard.paperLabel": "Support (offset)",
		"dashboard.surfaceLabel": "Surface du support (m²)",
		"dashboard.tirageLabel": "Tirage (exemplaires, optionnel)",
		"dashboard.tiragePlaceholder": "ex. 90000",
		"dashboard.legendPrefix": "Estimation basée sur des",
		"dashboard.legendAverages": "moyennes sectorielles",
		"dashboard.legendMiddle": "(pas une mesure de votre encre ou de votre imprimeur réels) — d'après le",
		"dashboard.legendCo2Factor": "Facteur CO2e (1 kg d'encre = 3,13 kg éq. CO2) issu du même guide, basé sur l'outil BEE de Citeo.",
		"dashboard.pageOption": "Page {page}",
		"process.offset": "Offset",
		"process.flexographie": "Flexographie",
		"process.heliogravure": "Héliogravure",
		"process.typographie": "Typographie",
		"process.serigraphie": "Sérigraphie",
		"paper.papier-offset": "Papier offset",
		"paper.couche-mat": "Couché mat",
		"paper.papier-satine": "Papier satiné",
		"paper.couche-brillant": "Couché brillant",
		"dashboard.stat.thickness": "Épaisseur du film d'encre",
		"dashboard.stat.thicknessSub": "Selon le procédé choisi",
		"dashboard.stat.surface": "Surface d'encre imprimée",
		"dashboard.stat.weightUnit": "Poids d'encre (1 unité)",
		"dashboard.stat.weightTirage": "Poids d'encre ({n} ex.)",
		"dashboard.stat.loadSub": "{load} g/m² (fourchette guide : {min} à {max} g/m²)",
		"dashboard.stat.co2e": "Empreinte carbone",
		"dashboard.stat.co2eSub": "≈ {km} km en voiture",
		"pedagogy.summary": "Comprendre les limites de cet outil",
		"footer.mupdf": "100% navigateur, aucune donnée envoyée sur un serveur. Moteur de rendu :",
		"footer.mupdfLicense": "(AGPL-3.0).",
		"lang.fr": "FR",
		"lang.en": "EN",
		"messages.notPdf": "Ce fichier ne semble pas être un PDF.",
		"messages.readFailed": "Impossible de lire le fichier sélectionné.",
		"messages.workerError": "Erreur du worker : {msg}",
		"progress.loadingWasm": "Chargement du moteur WASM…",
		"progress.analyzingPage": "Analyse des séparations page {page}/{total}…",
		"progress.detailPage": "{detail} page {page}/{total}…",
		"progress.detailSeparations": "Analyse des séparations",
		"progress.done": "Calcul des couvertures terminé.",
		"warnings.pagePrefix": "Page {page} :",
		// Espace avant ":" = convention typographique française ; l'anglais n'en a pas.
		"ink.spotDirectLabel": "Ton direct : {name}",
		"error.passwordProtected": "Ce PDF est protégé par mot de passe : non pris en charge.",
		"error.notValidPdf": "Ce fichier ne semble pas être un PDF valide.",
		"error.noPages": "Aucune page trouvée dans ce PDF.",
		"error.dpiTooHigh": "Résolution non supportée : {dpi} DPI dépasse le maximum de {max} DPI.",
		"error.memoryInsufficient": "Mémoire insuffisante pour cette résolution (page {page} : {w}×{h}px, {n} encre(s) directe(s)). Réduisez le DPI.",
		"error.pageAnalysisFailed": "Échec de l'analyse de la page {page}",
		"error.unexpected": "Erreur inattendue lors de l'analyse",
		"warning.nonZeroBackground": "Fond non nul détecté sur l'encre « {ink} » (page {page}).",
		"report.title": "Rapport de couverture d'encre",
		"report.generatedOn": "Généré le {date}",
		"report.file": "Fichier :",
		"report.dpi": "Résolution :",
		"report.thumbnailAlt": "Aperçu de la page {page}",
		"report.ecoSectionTitle": "Impact éco-encrage (page {page})",
		"report.footerNote": "Rapport généré par rosette — 100% navigateur, aucune donnée envoyée sur un serveur.",
	},
	en: {
		// Lowercase on purpose: stylized brand name, see index.html/README.md.
		"app.title": "rosette",
		"app.tagline": "Ink coverage rate (TAC) — analyzes a print PDF (CMYK + spot colors) and calculates ink coverage per page. <strong>The file stays in your browser</strong> — no upload, no server, works offline after the first load.",
		"dropzone.title": "Drop a print PDF here",
		"dropzone.hint": "(no file is uploaded)",
		"dropzone.browse": "Choose a file…",
		"controls.dpiLabel": "Rasterization resolution",
		"controls.dpi150": "150 DPI",
		"controls.dpi300": "300 DPI",
		"controls.dpi600": "600 DPI (recommended)",
		"controls.dpi1200": "1200 DPI (slow, high memory use)",
		"controls.analyze": "Analyze",
		"inkCards.heading": "Your inks, at a glance",
		// "Page TAC", not "Average TAC": a page's TAC isn't an average across
		// pages, just the sum of that page's own ink coverages.
		"inkCards.tacLabel": "Page TAC",
		"inkCards.pageLabel": "Page {page}",
		"inkCards.approxTitle": "Approximate color: this spot color has no usable CMYK match in the PDF, an arbitrary but stable hue is used to tell it apart visually.",
		"process.ink.Cyan": "Cyan",
		"process.ink.Magenta": "Magenta",
		"process.ink.Yellow": "Yellow",
		"process.ink.Black": "Black",
		"results.heading": "Detail by page",
		"results.downloadCsv": "Download CSV",
		"results.exportPdf": "Export report as PDF",
		"table.page": "Page",
		"table.ink": "Ink",
		"table.coverage": "Coverage_%",
		"table.include": "Include in TAC",
		"table.includeTitle": "Include \"{ink}\" in each page's TAC",
		"results.legend": "≈ estimate (spot color, rendering reconstructed in the browser — see \"Understand this tool's limitations\" below)",
		"dashboard.heading": "Eco-inking impact",
		"dashboard.badge": "estimate",
		"dashboard.introPrefix": "What the ink coverage rate above represents in film thickness, ink weight, and CO2 equivalent, based on the averages from the",
		"dashboard.pageLabel": "Page analyzed",
		"dashboard.processLabel": "Printing process",
		"dashboard.paperLabel": "Paper (offset)",
		"dashboard.surfaceLabel": "Substrate area (m²)",
		"dashboard.tirageLabel": "Print run (copies, optional)",
		"dashboard.tiragePlaceholder": "e.g. 90000",
		"dashboard.legendPrefix": "Estimate based on",
		"dashboard.legendAverages": "sector averages",
		"dashboard.legendMiddle": "(not a measurement of your actual ink or printer) — based on the",
		"dashboard.legendCo2Factor": "CO2e factor (1 kg of ink = 3.13 kg CO2 eq.) from the same guide, based on Citeo's BEE tool.",
		"dashboard.pageOption": "Page {page}",
		"process.offset": "Offset",
		"process.flexographie": "Flexography",
		"process.heliogravure": "Gravure",
		"process.typographie": "Letterpress",
		"process.serigraphie": "Screen printing",
		"paper.papier-offset": "Offset paper",
		"paper.couche-mat": "Matte coated",
		"paper.papier-satine": "Satin paper",
		"paper.couche-brillant": "Gloss coated",
		"dashboard.stat.thickness": "Ink film thickness",
		"dashboard.stat.thicknessSub": "Depends on the process chosen",
		"dashboard.stat.surface": "Printed ink area",
		"dashboard.stat.weightUnit": "Ink weight (1 unit)",
		"dashboard.stat.weightTirage": "Ink weight ({n} copies)",
		"dashboard.stat.loadSub": "{load} g/m² (guide range: {min} to {max} g/m²)",
		"dashboard.stat.co2e": "Carbon footprint",
		"dashboard.stat.co2eSub": "≈ {km} km driven by car",
		"pedagogy.summary": "Understand this tool's limitations",
		"footer.mupdf": "100% browser-based, no data sent to a server. Rendering engine:",
		"footer.mupdfLicense": "(AGPL-3.0).",
		"lang.fr": "FR",
		"lang.en": "EN",
		"messages.notPdf": "This file doesn't look like a PDF.",
		"messages.readFailed": "Couldn't read the selected file.",
		"messages.workerError": "Worker error: {msg}",
		"progress.loadingWasm": "Loading the WASM engine…",
		"progress.analyzingPage": "Analyzing separations, page {page}/{total}…",
		"progress.detailPage": "{detail} page {page}/{total}…",
		"progress.detailSeparations": "Analyzing separations",
		"progress.done": "Coverage calculation complete.",
		"warnings.pagePrefix": "Page {page}:",
		"ink.spotDirectLabel": "Spot color: {name}",
		"error.passwordProtected": "This PDF is password-protected: not supported.",
		"error.notValidPdf": "This file doesn't look like a valid PDF.",
		"error.noPages": "No pages found in this PDF.",
		"error.dpiTooHigh": "Unsupported resolution: {dpi} DPI exceeds the {max} DPI maximum.",
		"error.memoryInsufficient": "Not enough memory for this resolution (page {page}: {w}×{h}px, {n} spot color(s)). Lower the DPI.",
		"error.pageAnalysisFailed": "Failed to analyze page {page}",
		"error.unexpected": "Unexpected error during analysis",
		"warning.nonZeroBackground": "Non-zero background detected on ink \"{ink}\" (page {page}).",
		"report.title": "Ink coverage report",
		"report.generatedOn": "Generated on {date}",
		"report.file": "File:",
		"report.dpi": "Resolution:",
		"report.thumbnailAlt": "Preview of page {page}",
		"report.ecoSectionTitle": "Eco-inking impact (page {page})",
		"report.footerNote": "Report generated by rosette — 100% browser-based, no data sent to a server.",
	},
};

let currentLang = (typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY)) || "fr";

export function getLanguage() {
	return currentLang;
}

export function setLanguage(lang) {
	if (!DICT[lang])
		return;
	currentLang = lang;
	try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* stockage indisponible : pas bloquant */ }
}

export function t(key, vars) {
	let str = DICT[currentLang]?.[key] ?? DICT.fr[key] ?? key;
	if (vars)
		for (const [k, v] of Object.entries(vars))
			str = str.replaceAll(`{${k}}`, String(v));
	return str;
}

// Parcourt le DOM statique et applique les traductions courantes :
// data-i18n (textContent, ou innerHTML si data-i18n-html est présent),
// data-i18n-placeholder, data-i18n-title.
export function applyTranslations(root = document) {
	root.querySelectorAll("[data-i18n]").forEach((el) => {
		const value = t(el.dataset.i18n);
		if ("i18nHtml" in el.dataset)
			el.innerHTML = value;
		else
			el.textContent = value;
	});
	root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
		el.placeholder = t(el.dataset.i18nPlaceholder);
	});
	root.querySelectorAll("[data-i18n-title]").forEach((el) => {
		el.title = t(el.dataset.i18nTitle);
	});
	document.documentElement.lang = currentLang;
}
