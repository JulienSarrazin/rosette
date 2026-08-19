// Libellé bilingue affiché sur les cards pour une encre directe. N'affecte
// QUE l'affichage (cards) : le tableau et le CSV gardent toujours le nom brut
// tel qu'il apparaît dans le PDF, pour rester un format d'échange fiable.

import { t } from "./i18n.js";

// Le nom du PDF est repris tel quel — jamais normalisé/deviné — qu'il
// s'agisse ou non d'une référence Pantone : seul le gabarit (préfixe +
// ponctuation) change de langue, via i18n.js ("ink.spotDirectLabel").
export function formatSpotInkLabel(rawName) {
	return t("ink.spotDirectLabel", { name: rawName });
}
