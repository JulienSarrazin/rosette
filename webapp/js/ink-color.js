// Couleurs de swatch pour les cards d'encre. Ce ne sont PAS des valeurs
// colorimétriques exactes — aucun outil web ne peut connaître la vraie teinte
// d'un ton direct (Pantone ou autre) sans une bibliothèque de correspondance
// sous licence, qu'on n'a pas — seulement des couleurs représentatives,
// suffisantes pour un repérage visuel intuitif entre les encres d'une page.

const PROCESS_SWATCHES = {
	Cyan: "#00AEEF",
	Magenta: "#EC008C",
	Yellow: "#FFE800",
	Black: "#231F20",
};

export function processInkColor(name) {
	return PROCESS_SWATCHES[name] || "#8a8a86";
}

export function cmykToCss([c, m, y, k]) {
	const r = 255 * (1 - c) * (1 - k);
	const g = 255 * (1 - m) * (1 - k);
	const b = 255 * (1 - y) * (1 - k);
	return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

// Hash déterministe nom -> teinte HSL : repli quand aucune couleur
// approximative n'a pu être extraite de la fonction de transfert du PDF
// (voir pdf-resources.js). Sert juste à distinguer visuellement plusieurs
// tons directs entre eux, pas à représenter une vraie couleur.
function hashColor(name) {
	let hash = 0;
	for (let i = 0; i < name.length; i++)
		hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
	return `hsl(${hash % 360}, 60%, 42%)`;
}

// approxCmyk : tableau [c,m,y,k] (0-1) optionnel, extrait par pdf-resources.js
// de la fonction de transfert d'origine de l'encre directe (avant qu'elle
// soit neutralisée pour la mesure). Retourne { css, approximate } où
// approximate indique si la couleur vient d'une vraie donnée du PDF (false)
// ou d'un simple hash de repli (true, à afficher avec un indicateur "≈").
export function spotInkColor(name, approxCmyk) {
	if (Array.isArray(approxCmyk) && approxCmyk.length === 4)
		return { css: cmykToCss(approxCmyk), approximate: false };
	return { css: hashColor(name), approximate: true };
}
