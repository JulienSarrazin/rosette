import { buildCSV, csvFileName } from "./csv-export.js";
import { loadTheme } from "./theme-loader.js";
import { processInkColor, spotInkColor } from "./ink-color.js";
import { computeEcoEncrage, PROCESSES, OFFSET_PAPERS } from "./co2e-dashboard.js";
import { PEDAGOGY_HTML } from "./pedagogy-content.js";
import { t, getLanguage, setLanguage, applyTranslations } from "./i18n.js";
import { formatSpotInkLabel } from "./ink-naming.js";

const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const browseBtn = document.getElementById("browse-btn");
const fileNameEl = document.getElementById("file-name");
const dpiSelect = document.getElementById("dpi-select");
const analyzeBtn = document.getElementById("analyze-btn");
const progressSection = document.getElementById("progress");
const progressText = document.getElementById("progress-text");
const progressBar = document.getElementById("progress-bar");
const messagesSection = document.getElementById("messages");
const resultsSection = document.getElementById("results");
const resultsBody = document.getElementById("results-body");
const downloadCsvBtn = document.getElementById("download-csv-btn");
const exportPdfBtn = document.getElementById("export-pdf-btn");
const table = document.getElementById("results-table");
const printReportEl = document.getElementById("print-report");
const langFrBtn = document.getElementById("lang-fr");
const langEnBtn = document.getElementById("lang-en");

const inkCardsSection = document.getElementById("ink-cards-section");
const inkCardsEl = document.getElementById("ink-cards");
const dashboardSection = document.getElementById("dashboard");
const dashboardPageSelect = document.getElementById("dashboard-page");
const dashboardProcessSelect = document.getElementById("dashboard-process");
const dashboardPaperLabel = document.getElementById("dashboard-paper-label");
const dashboardPaperSelect = document.getElementById("dashboard-paper");
const dashboardSurfaceInput = document.getElementById("dashboard-surface");
const dashboardTirageInput = document.getElementById("dashboard-tirage");
const dashboardResultsEl = document.getElementById("dashboard-results");
const pedagogyContentEl = document.querySelector(".pedagogy-content");
const footerCreditsEl = document.getElementById("footer-credits");

const PROCESS_ORDER = ["Cyan", "Magenta", "Yellow", "Black"];

let selectedFile = null;
/** @type {Map<number, Array<{encre:string, couverturePct:number, fondNonNul:boolean, tier:string, estime?:boolean, approxCmyk?:number[]}>>} */
let pagesData = new Map();
/** @type {Map<number, number>} page -> surface du MediaBox en m² */
let pageSurfaceM2 = new Map();
/** @type {Map<number, string>} page -> miniature (data URL PNG) */
let pageThumbnails = new Map();
let totalPages = 0;
let excludedInks = new Set();
let sortState = { key: "page", dir: 1 };
let appConfig = {};
let dashboardSurfaceEdited = false;

applyTranslations();
updateLangButtons();
pedagogyContentEl.innerHTML = PEDAGOGY_HTML[getLanguage()];

loadTheme().then((config) => {
	appConfig = config || {};
	applyConfigDefaults();
});

function updateLangButtons() {
	const lang = getLanguage();
	langFrBtn.classList.toggle("active", lang === "fr");
	langEnBtn.classList.toggle("active", lang === "en");
}

function refreshAllUI() {
	applyTranslations();
	updateLangButtons();
	pedagogyContentEl.innerHTML = PEDAGOGY_HTML[getLanguage()];
	if (pagesData.size > 0) {
		renderResults();
		renderInkCards();
		updateDashboardPageOptions();
	}
}

langFrBtn.addEventListener("click", () => { setLanguage("fr"); refreshAllUI(); });
langEnBtn.addEventListener("click", () => { setLanguage("en"); refreshAllUI(); });

function applyConfigDefaults() {
	const dash = appConfig.dashboard || {};
	if (dash.default_process && PROCESSES[dash.default_process])
		dashboardProcessSelect.value = dash.default_process;
	if (dash.default_paper && OFFSET_PAPERS[dash.default_paper])
		dashboardPaperSelect.value = dash.default_paper;
	updatePaperVisibility();

	const credits = appConfig.credits || {};
	const citeoUrl = credits.citeo_guide_url || "#";
	const citeoLabel = credits.citeo_guide_label || "Guide de l'éco-encrage, Citeo";
	for (const id of ["citeo-link", "citeo-link-2"]) {
		const el = document.getElementById(id);
		el.href = citeoUrl;
		el.textContent = citeoLabel;
	}

	const articleUrl = credits.article_url || "#";
	const articleLabel = credits.article_label || "Lire l'article";
	const githubUrl = credits.github_url || "#";
	const githubLabel = credits.github_label || "Code source sur GitHub";
	const aiText = credits.ai_disclosure_text || "";
	footerCreditsEl.innerHTML = "";

	const articleLink = document.createElement("a");
	articleLink.href = articleUrl;
	articleLink.rel = "noopener";
	articleLink.target = "_blank";
	articleLink.textContent = articleLabel;
	footerCreditsEl.appendChild(articleLink);

	footerCreditsEl.appendChild(document.createTextNode(" — "));
	const githubLink = document.createElement("a");
	githubLink.href = githubUrl;
	githubLink.rel = "noopener";
	githubLink.target = "_blank";
	githubLink.textContent = githubLabel;
	footerCreditsEl.appendChild(githubLink);

	if (aiText) {
		footerCreditsEl.appendChild(document.createTextNode(" — "));
		footerCreditsEl.appendChild(document.createTextNode(aiText));
	}
}

function showMessage(text, kind = "error") {
	const p = document.createElement("p");
	p.className = `message message-${kind}`;
	p.textContent = text;
	messagesSection.hidden = false;
	messagesSection.appendChild(p);
}

function clearMessages() {
	messagesSection.hidden = true;
	messagesSection.innerHTML = "";
}

function setFile(file) {
	if (!file)
		return;
	if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
		showMessage(t("messages.notPdf"));
		return;
	}
	selectedFile = file;
	fileNameEl.hidden = false;
	fileNameEl.textContent = file.name;
	analyzeBtn.disabled = false;
	clearMessages();
}

browseBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => setFile(fileInput.files[0]));

["dragenter", "dragover"].forEach((evt) =>
	dropZone.addEventListener(evt, (e) => {
		e.preventDefault();
		dropZone.classList.add("drag-active");
	})
);
["dragleave", "dragend"].forEach((evt) =>
	dropZone.addEventListener(evt, () => dropZone.classList.remove("drag-active"))
);
dropZone.addEventListener("drop", (e) => {
	e.preventDefault();
	dropZone.classList.remove("drag-active");
	setFile(e.dataTransfer.files[0]);
});
dropZone.addEventListener("keydown", (e) => {
	if (e.key === "Enter" || e.key === " ")
		fileInput.click();
});

analyzeBtn.addEventListener("click", startAnalysis);

function startAnalysis() {
	if (!selectedFile)
		return;

	pagesData = new Map();
	pageSurfaceM2 = new Map();
	pageThumbnails = new Map();
	excludedInks = new Set();
	totalPages = 0;
	dashboardSurfaceEdited = false;
	clearMessages();
	resultsSection.hidden = true;
	resultsBody.innerHTML = "";
	inkCardsSection.hidden = true;
	dashboardSection.hidden = true;
	analyzeBtn.disabled = true;
	progressSection.hidden = false;
	progressText.textContent = t("progress.loadingWasm");
	progressBar.value = 0;

	const dpi = parseInt(dpiSelect.value, 10);
	const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
	worker.onerror = (e) => {
		showMessage(t("messages.workerError", { msg: e.message }));
		finishAnalysis();
		worker.terminate();
	};

	// Un module Worker charge son graphe d'imports (dont MuPDF/WASM) de façon
	// asynchrone : un postMessage envoyé avant que le worker ait attaché son
	// propre onmessage serait perdu. On attend son signal "ready" — quel que
	// soit l'ordre d'arrivée entre ce signal et la fin de lecture du fichier.
	let workerReady = false;
	let pendingBuffer = null;
	function sendAnalyzeIfReady() {
		if (workerReady && pendingBuffer)
			worker.postMessage({ type: "analyze", fileBuffer: pendingBuffer, fileName: selectedFile.name, dpi }, [pendingBuffer]);
	}

	worker.onmessage = (ev) => {
		if (ev.data?.type === "ready") {
			workerReady = true;
			sendAnalyzeIfReady();
			return;
		}
		handleWorkerMessage(ev.data, worker);
	};

	const reader = new FileReader();
	reader.onload = () => {
		pendingBuffer = reader.result;
		sendAnalyzeIfReady();
	};
	reader.onerror = () => {
		showMessage(t("messages.readFailed"));
		finishAnalysis();
		worker.terminate();
	};
	reader.readAsArrayBuffer(selectedFile);
}

function handleWorkerMessage(msg, worker) {
	switch (msg.type) {
		case "progress":
			if (msg.stage === "start") {
				totalPages = msg.totalPages;
				progressText.textContent = t("progress.analyzingPage", { page: 1, total: totalPages });
			} else if (msg.stage === "page") {
				progressText.textContent = t("progress.detailPage", { detail: t(msg.detailCode), page: msg.page, total: msg.totalPages });
				progressBar.value = Math.round(((msg.page - 1) / msg.totalPages) * 100);
			}
			break;
		case "page-result":
			pagesData.set(msg.page, msg.inks);
			pageSurfaceM2.set(msg.page, msg.surfaceM2 || 0);
			if (msg.thumbnailDataUrl)
				pageThumbnails.set(msg.page, msg.thumbnailDataUrl);
			progressBar.value = totalPages ? Math.round((msg.page / totalPages) * 100) : 100;
			renderResults();
			renderInkCards();
			updateDashboardPageOptions();
			resultsSection.hidden = false;
			inkCardsSection.hidden = false;
			dashboardSection.hidden = false;
			break;
		case "done":
			progressText.textContent = t("progress.done");
			progressBar.value = 100;
			for (const w of msg.warnings || []) {
				const body = w.code ? t(w.code, w.params) : w.message;
				const text = w.page ? `${t("warnings.pagePrefix", { page: w.page })} ${body}` : body;
				showMessage(text, "warning");
			}
			finishAnalysis();
			worker.terminate();
			break;
		case "error":
			showMessage(msg.code ? t(msg.code, msg.params) : msg.message);
			finishAnalysis();
			worker.terminate();
			break;
	}
}

function finishAnalysis() {
	analyzeBtn.disabled = false;
	progressSection.hidden = true;
}

function inkSortIndex(encre) {
	const idx = PROCESS_ORDER.indexOf(encre);
	return idx === -1 ? PROCESS_ORDER.length : idx;
}

function flattenRows() {
	const rows = [];
	const pages = Array.from(pagesData.keys()).sort((a, b) => a - b);
	for (const page of pages) {
		const inks = pagesData.get(page);
		const sortedInks = [...inks].sort((a, b) => inkSortIndex(a.encre) - inkSortIndex(b.encre) || a.encre.localeCompare(b.encre));
		let tac = 0;
		for (const ink of sortedInks) {
			rows.push({ page, encre: ink.encre, couverturePct: ink.couverturePct, estime: !!ink.estime, isTac: false });
			if (!excludedInks.has(ink.encre))
				tac += ink.couverturePct;
		}
		rows.push({ page, encre: "TAC_MOYEN", couverturePct: tac, estime: false, isTac: true });
	}
	return rows;
}

function sortRows(rows) {
	const { key, dir } = sortState;
	return [...rows].sort((a, b) => {
		let diff = 0;
		if (key === "page") diff = a.page - b.page;
		else if (key === "encre") diff = a.encre.localeCompare(b.encre);
		else if (key === "couverture") diff = a.couverturePct - b.couverturePct;
		return diff * dir;
	});
}

function renderResults() {
	const rows = sortRows(flattenRows());
	resultsBody.innerHTML = "";

	for (const row of rows) {
		const tr = document.createElement("tr");
		if (row.isTac)
			tr.className = "tac-row";

		const pageTd = document.createElement("td");
		pageTd.textContent = row.page;
		tr.appendChild(pageTd);

		// Tableau et CSV gardent toujours le nom brut du PDF pour les encres
		// (format d'échange) : pas de préfixe bilingue "Ton direct :"/"Spot
		// color:" ici, contrairement aux cards (voir buildInkCard/
		// formatSpotInkLabel). La ligne TAC, elle, n'est pas une donnée issue
		// du PDF : on peut donc l'afficher traduite à l'écran sans rien
		// changer à l'export CSV (row.encre reste "TAC_MOYEN" côté CSV, voir
		// flattenRows() — format imposé par le script d'origine).
		const encreTd = document.createElement("td");
		encreTd.textContent = row.isTac ? t("inkCards.tacLabel") : row.encre;
		tr.appendChild(encreTd);

		const covTd = document.createElement("td");
		covTd.textContent = row.couverturePct.toFixed(2) + (row.estime ? " % ≈" : " %");
		tr.appendChild(covTd);

		const includeTd = document.createElement("td");
		includeTd.className = "col-include";
		if (!row.isTac) {
			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.checked = !excludedInks.has(row.encre);
			checkbox.title = t("table.includeTitle", { ink: row.encre });
			checkbox.addEventListener("change", () => {
				if (checkbox.checked)
					excludedInks.delete(row.encre);
				else
					excludedInks.add(row.encre);
				renderResults();
				renderInkCards();
				recomputeDashboard();
			});
			includeTd.appendChild(checkbox);
		}
		tr.appendChild(includeTd);

		resultsBody.appendChild(tr);
	}
}

// TAC de la page courante, en respectant les encres exclues (case à cocher
// du tableau) — même logique que flattenRows(), réutilisée par les cards, le
// dashboard et le rapport imprimable pour rester cohérente à tout moment.
function pageTac(page) {
	const inks = pagesData.get(page) || [];
	return inks.reduce((sum, ink) => (excludedInks.has(ink.encre) ? sum : sum + ink.couverturePct), 0);
}

// Nom d'affichage + couleur de swatch d'une encre pour les cards/rapport —
// jamais utilisé pour le tableau/CSV (voir renderResults ci-dessus).
function inkDisplay(ink) {
	if (PROCESS_ORDER.includes(ink.encre))
		return { name: t(`process.ink.${ink.encre}`), color: processInkColor(ink.encre), approximate: false };
	const resolved = spotInkColor(ink.encre, ink.approxCmyk);
	return { name: formatSpotInkLabel(ink.encre), color: resolved.css, approximate: resolved.approximate };
}

// En-tête partagé "miniature + titre de page" : cards à l'écran ET rapport imprimable.
function buildPageGroupHeader(page) {
	const header = document.createElement("div");
	header.className = "ink-page-header";
	const thumb = pageThumbnails.get(page);
	if (thumb) {
		const img = document.createElement("img");
		img.className = "page-thumb";
		img.src = thumb;
		img.alt = t("report.thumbnailAlt", { page });
		header.appendChild(img);
	}
	const h3 = document.createElement("h3");
	h3.textContent = t("inkCards.pageLabel", { page });
	header.appendChild(h3);
	return header;
}

function renderInkCards() {
	inkCardsEl.innerHTML = "";
	const pages = Array.from(pagesData.keys()).sort((a, b) => a - b);

	for (const page of pages) {
		const group = document.createElement("div");
		group.className = "ink-page-group";
		group.appendChild(buildPageGroupHeader(page));

		const grid = document.createElement("div");
		grid.className = "ink-cards-grid";
		const inks = pagesData.get(page) || [];
		const sortedInks = [...inks].sort((a, b) => inkSortIndex(a.encre) - inkSortIndex(b.encre) || a.encre.localeCompare(b.encre));
		for (const ink of sortedInks)
			grid.appendChild(buildInkCard(ink));
		grid.appendChild(buildInkCard({ encre: "TAC_MOYEN", couverturePct: pageTac(page) }, true));
		group.appendChild(grid);

		inkCardsEl.appendChild(group);
	}
}

function buildInkCard(ink, isTac = false) {
	const card = document.createElement("div");
	card.className = "ink-card" + (isTac ? " tac-card" : "");

	const display = isTac ? { name: t("inkCards.tacLabel"), color: "var(--accent)", approximate: false } : inkDisplay(ink);
	card.style.setProperty("--swatch", display.color);

	const swatch = document.createElement("div");
	swatch.className = "swatch";
	card.appendChild(swatch);

	const name = document.createElement("div");
	name.className = "ink-name";
	name.textContent = display.name;
	if (display.approximate) {
		const flag = document.createElement("span");
		flag.className = "approx-flag";
		flag.title = t("inkCards.approxTitle");
		flag.textContent = "≈";
		name.appendChild(flag);
	}
	card.appendChild(name);

	const pct = document.createElement("div");
	pct.className = "ink-pct";
	pct.textContent = ink.couverturePct.toFixed(1) + " %";
	card.appendChild(pct);

	return card;
}

// ---- Dashboard éco-encrage ------------------------------------------

function updatePaperVisibility() {
	const isOffset = dashboardProcessSelect.value === "offset";
	dashboardPaperLabel.style.display = isOffset ? "" : "none";
}

function updateDashboardPageOptions() {
	const previousValue = dashboardPageSelect.value;
	const pages = Array.from(pagesData.keys()).sort((a, b) => a - b);
	dashboardPageSelect.innerHTML = "";
	for (const page of pages) {
		const opt = document.createElement("option");
		opt.value = String(page);
		opt.textContent = t("dashboard.pageOption", { page });
		dashboardPageSelect.appendChild(opt);
	}
	if (pages.map(String).includes(previousValue))
		dashboardPageSelect.value = previousValue;
	else
		dashboardSurfaceEdited = false;

	if (!dashboardSurfaceEdited) {
		const page = Number(dashboardPageSelect.value);
		const surface = pageSurfaceM2.get(page);
		if (surface)
			dashboardSurfaceInput.value = surface.toFixed(4);
	}
	recomputeDashboard();
}

// Calcule les stats éco-encrage pour la page/config actuellement affichées
// dans le dashboard — factorisé pour être réutilisé tel quel par le rapport
// imprimable (buildPrintEcoSection), sans dupliquer la logique de calcul.
function buildDashboardStats() {
	const page = Number(dashboardPageSelect.value);
	if (!page || !pagesData.has(page))
		return null;

	const surfaceM2 = parseFloat(dashboardSurfaceInput.value) || 0;
	const tirage = parseInt(dashboardTirageInput.value, 10) || 0;
	const process = dashboardProcessSelect.value;
	const paper = dashboardPaperSelect.value;
	const tauxEncragePct = pageTac(page);

	const result = computeEcoEncrage({ surfaceM2, tauxEncragePct, process, paper, tirage });
	const lang = getLanguage();

	return [
		{ label: t("dashboard.stat.thickness"), value: result.thicknessLabel, sub: t("dashboard.stat.thicknessSub") },
		{
			label: t("dashboard.stat.surface"),
			value: `${result.surfaceEncreM2.toFixed(4)} m²`,
			sub: `${surfaceM2.toFixed(4)} m² × ${tauxEncragePct.toFixed(1)} %`,
		},
		{
			label: tirage > 0 ? t("dashboard.stat.weightTirage", { n: tirage.toLocaleString(lang === "en" ? "en-US" : "fr-FR") }) : t("dashboard.stat.weightUnit"),
			value: tirage > 0 ? `${result.poidsTotalKg.toFixed(2)} kg` : `${result.poidsParUniteG.toFixed(4)} g`,
			sub: t("dashboard.stat.loadSub", { load: result.loadGPerM2, min: result.loadRangeGPerM2[0], max: result.loadRangeGPerM2[1] }),
		},
		{
			label: t("dashboard.stat.co2e"),
			value: `${result.co2eKg.toFixed(tirage > 0 ? 2 : 5)} kg éq. CO2`,
			sub: t("dashboard.stat.co2eSub", { km: result.kmVoiture.toFixed(tirage > 0 ? 1 : 4) }),
		},
	];
}

function recomputeDashboard() {
	const stats = buildDashboardStats();
	dashboardResultsEl.innerHTML = "";
	if (!stats)
		return;
	for (const stat of stats)
		dashboardResultsEl.appendChild(buildStatEl(stat));
}

function buildStatEl(stat) {
	const el = document.createElement("div");
	el.className = "dash-stat";
	const label = document.createElement("div");
	label.className = "dash-label";
	label.textContent = stat.label;
	const value = document.createElement("div");
	value.className = "dash-value";
	value.textContent = stat.value;
	const sub = document.createElement("div");
	sub.className = "dash-sub";
	sub.textContent = stat.sub;
	el.append(label, value, sub);
	return el;
}

dashboardProcessSelect.addEventListener("change", () => {
	updatePaperVisibility();
	recomputeDashboard();
});
dashboardPaperSelect.addEventListener("change", recomputeDashboard);
dashboardTirageInput.addEventListener("input", recomputeDashboard);
dashboardPageSelect.addEventListener("change", () => {
	dashboardSurfaceEdited = false;
	const page = Number(dashboardPageSelect.value);
	const surface = pageSurfaceM2.get(page);
	if (surface)
		dashboardSurfaceInput.value = surface.toFixed(4);
	recomputeDashboard();
});
dashboardSurfaceInput.addEventListener("input", () => {
	dashboardSurfaceEdited = true;
	recomputeDashboard();
});

table.querySelectorAll("th[data-sort]").forEach((th) => {
	th.addEventListener("click", () => {
		const key = th.dataset.sort;
		if (sortState.key === key)
			sortState.dir *= -1;
		else
			sortState = { key, dir: 1 };
		table.querySelectorAll("th[data-sort] .sort-arrow").forEach((s) => (s.textContent = ""));
		th.querySelector(".sort-arrow").textContent = sortState.dir === 1 ? "▲" : "▼";
		renderResults();
	});
});

downloadCsvBtn.addEventListener("click", () => {
	// Toujours exporter dans l'ordre Page -> Encre -> TAC_MOYEN, indépendamment du tri affiché à l'écran.
	const csv = buildCSV(flattenRows());
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = csvFileName(selectedFile ? selectedFile.name : "document.pdf");
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
});

// ---- Rapport imprimable (export PDF via impression navigateur) ---------

function buildPrintInkTable(page) {
	const printTable = document.createElement("table");
	printTable.className = "print-ink-table";

	const thead = document.createElement("thead");
	const headRow = document.createElement("tr");
	const thInk = document.createElement("th");
	thInk.textContent = t("table.ink");
	const thCov = document.createElement("th");
	thCov.textContent = t("table.coverage");
	headRow.append(thInk, thCov);
	thead.appendChild(headRow);
	printTable.appendChild(thead);

	const tbody = document.createElement("tbody");
	const inks = pagesData.get(page) || [];
	const sortedInks = [...inks].sort((a, b) => inkSortIndex(a.encre) - inkSortIndex(b.encre) || a.encre.localeCompare(b.encre));
	for (const ink of sortedInks) {
		const display = inkDisplay(ink);
		const tr = document.createElement("tr");
		const tdInk = document.createElement("td");
		const dot = document.createElement("span");
		dot.className = "swatch-dot";
		dot.style.background = display.color;
		tdInk.append(dot, document.createTextNode(display.name));
		const tdCov = document.createElement("td");
		tdCov.textContent = ink.couverturePct.toFixed(2) + (ink.estime ? " % ≈" : " %");
		tr.append(tdInk, tdCov);
		tbody.appendChild(tr);
	}
	const tacTr = document.createElement("tr");
	tacTr.className = "tac-row";
	const tacTd1 = document.createElement("td");
	tacTd1.textContent = t("inkCards.tacLabel");
	const tacTd2 = document.createElement("td");
	tacTd2.textContent = pageTac(page).toFixed(2) + " %";
	tacTr.append(tacTd1, tacTd2);
	tbody.appendChild(tacTr);

	printTable.appendChild(tbody);
	return printTable;
}

function buildPrintEcoSection() {
	const stats = buildDashboardStats();
	if (!stats)
		return null;
	const section = document.createElement("div");
	section.className = "print-eco-section";
	const h2 = document.createElement("h2");
	h2.textContent = t("report.ecoSectionTitle", { page: dashboardPageSelect.value });
	section.appendChild(h2);
	const grid = document.createElement("div");
	grid.className = "print-eco-stats";
	for (const stat of stats)
		grid.appendChild(buildStatEl(stat));
	section.appendChild(grid);
	return section;
}

function buildPrintReport() {
	printReportEl.innerHTML = "";

	const header = document.createElement("div");
	header.className = "print-report-header";
	const h1 = document.createElement("h1");
	h1.textContent = t("report.title");
	const pFile = document.createElement("p");
	pFile.textContent = `${t("report.file")} ${selectedFile ? selectedFile.name : ""}`;
	const pDate = document.createElement("p");
	pDate.textContent = t("report.generatedOn", { date: new Date().toLocaleString(getLanguage() === "en" ? "en-US" : "fr-FR") });
	const pDpi = document.createElement("p");
	pDpi.textContent = `${t("report.dpi")} ${dpiSelect.value} DPI`;
	header.append(h1, pFile, pDate, pDpi);
	printReportEl.appendChild(header);

	const pages = Array.from(pagesData.keys()).sort((a, b) => a - b);
	for (const page of pages) {
		const block = document.createElement("div");
		block.className = "print-page-block";
		block.appendChild(buildPageGroupHeader(page));
		block.appendChild(buildPrintInkTable(page));
		printReportEl.appendChild(block);
	}

	const ecoSection = buildPrintEcoSection();
	if (ecoSection)
		printReportEl.appendChild(ecoSection);

	const footer = document.createElement("div");
	footer.className = "print-report-footer";
	footer.textContent = t("report.footerNote");
	printReportEl.appendChild(footer);
}

exportPdfBtn.addEventListener("click", () => {
	buildPrintReport();
	window.print();
});

if ("serviceWorker" in navigator) {
	window.addEventListener("load", () => {
		navigator.serviceWorker.register(new URL("../sw.js", import.meta.url)).catch(() => {
			// L'app reste utilisable sans le cache offline si l'enregistrement échoue
			// (ex : ouverture en file://, ou hébergement sans support des Service Workers).
		});
	});
}
