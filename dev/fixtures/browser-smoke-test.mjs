import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";
const FIXTURES_DIR = process.env.FIXTURES_DIR || "/fixtures";

async function runCase(browser, { file, dpi, expectations, label }) {
	const page = await browser.newPage();
	const consoleErrors = [];
	page.on("console", (msg) => {
		console.log(`  [console:${msg.type()}]`, msg.text());
		if (msg.type() === "error") consoleErrors.push(msg.text());
	});
	page.on("pageerror", (err) => {
		console.log("  [pageerror]", String(err));
		consoleErrors.push(String(err));
	});

	await page.goto(BASE_URL, { waitUntil: "load" });
	await page.setInputFiles("#file-input", `${FIXTURES_DIR}/${file}`);
	await page.selectOption("#dpi-select", String(dpi));
	await page.click("#analyze-btn");

	try {
		// waitForFunction(pageFunction, arg, options) : le 2e paramètre est l'arg
		// passé à la fonction, pas les options -> bien le laisser à null ici.
		await page.waitForFunction(
			() => {
				const section = document.getElementById("results");
				return section && !section.hidden && document.getElementById("results-body").children.length > 0;
			},
			null,
			{ timeout: 60000 }
		);
		await page.waitForFunction(
			() => document.getElementById("progress").hidden === true,
			null,
			{ timeout: 60000 }
		);
	} catch (err) {
		const messagesHtml = await page.locator("#messages").innerHTML().catch(() => "(absent)");
		const progressText = await page.locator("#progress-text").textContent().catch(() => "(absent)");
		console.log(`  TIMEOUT en attendant les résultats. progress-text="${progressText}" messages="${messagesHtml}"`);
		throw err;
	}

	const rows = await page.$$eval("#results-body tr", (trs) =>
		trs.map((tr) => {
			const cells = tr.querySelectorAll("td");
			return { encre: cells[1].textContent.trim(), couverture: cells[2].textContent.trim() };
		})
	);

	console.log(`\n== ${label} ==`);
	for (const r of rows) console.log(`  ${r.encre.padEnd(20)} ${r.couverture}`);
	if (consoleErrors.length) {
		console.log("  Erreurs console :");
		for (const e of consoleErrors) console.log(`    ${e}`);
	}

	let ok = true;
	for (const [encre, expected] of Object.entries(expectations)) {
		const row = rows.find((r) => r.encre === encre);
		if (!row) {
			console.log(`  FAIL: ligne "${encre}" absente`);
			ok = false;
			continue;
		}
		const value = parseFloat(row.couverture);
		const diff = Math.abs(value - expected.value);
		if (diff > expected.tolerance) {
			console.log(`  FAIL: ${encre} = ${value} (attendu ${expected.value} ± ${expected.tolerance})`);
			ok = false;
		} else {
			console.log(`  OK:   ${encre} = ${value} (attendu ${expected.value} ± ${expected.tolerance})`);
		}
	}
	if (consoleErrors.length > 0) ok = false;

	// Le CSV exporté suit désormais la langue de l'interface pour la ligne de
	// synthèse par page ("TAC Page" / "Page TAC", voir js/i18n.js) — ce n'est
	// plus la valeur fixe "TAC_MOYEN" du script Python d'origine (changement
	// demandé explicitement). On vérifie ici que le CSV reflète bien le
	// libellé affiché à l'écran, pas l'ancienne valeur.
	const [download] = await Promise.all([
		page.waitForEvent("download"),
		page.click("#download-csv-btn"),
	]);
	const csvPath = await download.path();
	const csvContent = await import("node:fs").then((fs) => fs.readFileSync(csvPath, "utf8"));
	const csvOk = csvContent.includes("TAC Page") && !csvContent.includes("TAC_MOYEN");
	console.log(csvOk ? "  OK:   CSV contient bien \"TAC Page\" (plus l'ancien TAC_MOYEN)" : "  FAIL: CSV ne contient pas le libellé attendu");
	if (!csvOk) ok = false;

	await page.close();
	return ok;
}

const browser = await chromium.launch();
let allOk = true;

allOk =
	(await runCase(browser, {
		file: "fixture-cmyk.pdf",
		dpi: 150,
		label: "fixture-cmyk.pdf @ 150 DPI (Tier A)",
		expectations: {
			Cyan: { value: 25, tolerance: 0.5 },
			Magenta: { value: 50, tolerance: 0.5 },
			Yellow: { value: 75, tolerance: 0.5 },
			Black: { value: 10, tolerance: 0.5 },
			// Tolérance plus large que les canaux pris individuellement : le TAC
			// cumule la quantification 8 bits (arrondi vers le bas) des 4 canaux,
			// un phénomène attendu (même limite qu'un TIFF 8 bits Ghostscript),
			// pas un bug.
			// Libellé affiché à l'écran comme dans le CSV (voir vérification
			// dédiée plus bas, qui contrôle spécifiquement le contenu du CSV).
			"TAC Page": { value: 160, tolerance: 2 },
		},
	})) && allOk;

allOk =
	(await runCase(browser, {
		file: "fixture-spot.pdf",
		dpi: 150,
		label: "fixture-spot.pdf @ 150 DPI (Tier B)",
		expectations: {
			Spot1: { value: 50, tolerance: 2 },
			Cyan: { value: 0, tolerance: 0.1 },
		},
	})) && allOk;

// Régression pour glyph-outline.js : texte en police TrueType embarquée
// (DejaVuSans) peint en encre directe. La valeur attendue (~5.6%) a été
// établie par comparaison avec un rendu canvas natif du même texte/police/
// taille (~6.0%) puis vérifiée visuellement (contours de glyphes corrects,
// espaces bien vides) ; tolérance large car ce n'est pas un rendu pixel-exact.
allOk =
	(await runCase(browser, {
		file: "fixture-font-spot.pdf",
		dpi: 150,
		label: "fixture-font-spot.pdf @ 150 DPI (Tier B, police embarquée)",
		expectations: {
			Spot1: { value: 5.6, tolerance: 3 },
			Cyan: { value: 0, tolerance: 0.1 },
		},
	})) && allOk;

await browser.close();

if (!allOk) {
	console.error("\nÉCHEC : un ou plusieurs contrôles ont échoué.");
	process.exit(1);
}
console.log("\nOK : tous les contrôles sont passés.");
