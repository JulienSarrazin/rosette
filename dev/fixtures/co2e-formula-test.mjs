// Test de non-régression pur JS (pas de navigateur nécessaire) : vérifie que
// js/co2e-dashboard.js reproduit l'exemple chiffré du Guide de l'éco-encrage
// Citeo (p.34) : emballage 0,148 m², taux d'encrage 16,8 % puis 95,7 %,
// offset/couché brillant, tirage 90 000 ex.
//   -> 2,92 kg puis 16,57 kg d'encre, diff. 13,65 kg, 42,72 kg éq. CO2,
//      382,2 km évités.
// Lancer : node dev/fixtures/co2e-formula-test.mjs

import { computeEcoEncrage } from "../../webapp/js/co2e-dashboard.js";

function approx(actual, expected, tolerancePct, label) {
	const diffPct = Math.abs(actual - expected) / expected * 100;
	const ok = diffPct <= tolerancePct;
	console.log(`${ok ? "OK  " : "FAIL"} ${label} = ${actual.toFixed(2)} (attendu ${expected}, écart ${diffPct.toFixed(2)}%)`);
	return ok;
}

const a = computeEcoEncrage({ surfaceM2: 0.148, tauxEncragePct: 16.8, process: "offset", paper: "couche-brillant", tirage: 90000 });
const b = computeEcoEncrage({ surfaceM2: 0.148, tauxEncragePct: 95.7, process: "offset", paper: "couche-brillant", tirage: 90000 });
const diffKg = b.poidsTotalKg - a.poidsTotalKg;

let ok = true;
ok = approx(a.poidsTotalKg, 2.92, 2, "poids A (16,8%)") && ok;
ok = approx(b.poidsTotalKg, 16.57, 1, "poids B (95,7%)") && ok;
ok = approx(diffKg, 13.65, 1, "différence de poids") && ok;
ok = approx(diffKg * 3.13, 42.72, 1, "CO2e évité") && ok;
ok = approx(diffKg * 28, 382.2, 1, "km voiture évités") && ok;

if (!ok) {
	console.error("\nÉCHEC : la formule co2e-dashboard.js ne reproduit plus l'exemple du guide Citeo.");
	process.exit(1);
}
console.log("\nOK : formule éco-encrage conforme à l'exemple du guide Citeo.");
