// Calcul poids d'encre / épaisseur / empreinte carbone à partir du taux de
// couverture (TAC), d'après le Guide de l'éco-encrage, Citeo (mai 2019),
// pages 32 à 34 — voir docs/references/citeo-guide-eco-encrage-2019.pdf
// (à la racine du dépôt) pour le document source complet.
//
// Formule (3 étapes, telle que décrite dans le guide) :
//   1. Surface d'encre imprimée (m²) = Surface support (m²) × (TAC% / 100)
//   2. Poids d'encre (g)             = Surface d'encre imprimée × Consommation (g/m²)
//   3. Équivalent CO2 (kg)     = Poids d'encre (kg) × 3,13
//      Équivalent km voiture   = Poids d'encre (kg) × 28
//
// Important — ce que représente ce nombre : dans le guide, ce facteur sert à
// chiffrer un CO2 "évité" parce que leur exemple compare deux versions d'un
// même emballage (avant/après une refonte éco-conçue) et calcule la
// DIFFÉRENCE de poids d'encre entre les deux. Ici, on n'a qu'un seul PDF
// analysé, pas de comparaison avant/après : ce calcul donne donc l'empreinte
// carbone (équivalent CO2) de l'encre utilisée sur CE fichier, pas un CO2
// "évité" — même formule, même coefficient, mais interprété comme un
// résultat de mesure et non comme une économie. Ne jamais réintroduire le
// mot "évité" dans les libellés qui en découlent (voir i18n.js).
//
// Vérifié contre l'exemple chiffré du guide (p.34) : emballage 0,148 m²,
// taux d'encrage 16,8 % puis 95,7 %, offset/couché brillant 1,3 g/m²,
// tirage 90 000 ex. -> 2,92 kg puis 16,57 kg d'encre, différence 13,65 kg,
// soit 42,72 kg éq. CO2 et 382,2 km voiture d'écart entre les deux scénarios
// du guide (leur propre exemple est bien un avant/après, contrairement à
// l'usage qu'on en fait ici).
//
// Ce ne sont que des MOYENNES sectorielles (le guide ne couvre que 5 procédés
// traditionnels — pas d'impression numérique, on n'en invente pas ici) : à
// afficher comme une estimation, jamais comme une mesure de l'encre ou de
// l'imprimeur réels de l'utilisateur.

const CO2E_PER_KG_INK = 3.13;
const KM_PER_KG_INK = 28;

export const PROCESSES = {
	offset: { label: "Offset", thicknessLabel: "2 µm" },
	flexographie: { label: "Flexographie", thicknessLabel: "3 µm", gPerM2Range: [2, 3] },
	heliogravure: { label: "Héliogravure", thicknessLabel: "7 µm", gPerM2Range: [8, 10] },
	typographie: { label: "Typographie", thicknessLabel: "3 µm", gPerM2Range: [5, 5] },
	serigraphie: { label: "Sérigraphie", thicknessLabel: "8 à 30 µm", gPerM2Range: [30, 30] },
};

// Pour l'offset, la consommation dépend du support (voir "zoom offset" du
// guide) plutôt que du procédé seul.
export const OFFSET_PAPERS = {
	"papier-offset": { label: "Papier offset", gPerM2Range: [1.6, 2.4] },
	"couche-mat": { label: "Couché mat", gPerM2Range: [2, 2.2] },
	"papier-satine": { label: "Papier satiné", gPerM2Range: [1.3, 2] },
	// 1,3 g/m² : valeur utilisée telle quelle dans l'exemple chiffré du guide
	// (p.34), pas le milieu de la fourchette (1,25) — on reprend leur propre
	// valeur de référence plutôt qu'une moyenne abstraite.
	"couche-brillant": { label: "Couché brillant", gPerM2Range: [1, 1.5], reference: 1.3 },
};

function midpoint([a, b]) {
	return (a + b) / 2;
}

export function inkLoadGPerM2(process, paper) {
	if (process === "offset") {
		const p = OFFSET_PAPERS[paper] || OFFSET_PAPERS["couche-brillant"];
		return { value: p.reference ?? midpoint(p.gPerM2Range), range: p.gPerM2Range };
	}
	const proc = PROCESSES[process];
	if (!proc) return { value: 0, range: [0, 0] };
	return { value: midpoint(proc.gPerM2Range), range: proc.gPerM2Range };
}

// { surfaceM2, tauxEncragePct, process, paper, tirage } -> résultats détaillés.
// tirage : nombre d'exemplaires ; absent/0 => poidsTotal = poids d'une seule unité.
export function computeEcoEncrage({ surfaceM2, tauxEncragePct, process, paper, tirage }) {
	const load = inkLoadGPerM2(process, paper);
	const surfaceEncreM2 = surfaceM2 * (tauxEncragePct / 100);
	const poidsParUniteG = surfaceEncreM2 * load.value;
	const n = tirage && tirage > 0 ? tirage : 1;
	const poidsTotalG = poidsParUniteG * n;
	const poidsTotalKg = poidsTotalG / 1000;

	return {
		surfaceEncreM2,
		poidsParUniteG,
		poidsTotalG,
		poidsTotalKg,
		co2eKg: poidsTotalKg * CO2E_PER_KG_INK,
		kmVoiture: poidsTotalKg * KM_PER_KG_INK,
		loadGPerM2: load.value,
		loadRangeGPerM2: load.range,
		thicknessLabel: PROCESSES[process]?.thicknessLabel ?? "2 µm",
	};
}
