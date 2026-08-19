// Web Worker : tout le travail MuPDF (WASM) se fait ici, hors du thread UI.
// Le PDF ne quitte jamais le navigateur : il arrive par postMessage depuis
// app.js (FileReader côté page), jamais par le réseau.

import * as mupdf from "../vendor/mupdf/mupdf.js";
import { scanSpotColorantGroups, scanEmbeddedFonts } from "./pdf-resources.js";
import { computeCMYKCoverage } from "./cmyk-coverage.js";
import { computeSpotCoverage } from "./spot-coverage.js";
import { t } from "./i18n.js";

// MuPDF applique par défaut une gestion des couleurs via profils ICC, y
// compris pour un rendu vers DeviceCMYK : cela déplace légèrement les valeurs
// CMJN mesurées par rapport aux valeurs brutes spécifiées dans le PDF. Le
// script Python d'origine (Ghostscript tiffsep) mesure lui les valeurs brutes,
// sans conversion colorimétrique — on désactive donc l'ICC pour rester
// fonctionnellement équivalent.
mupdf.disableICC();

const MAX_DPI = 1200;
const WARN_DPI = 600;
// Seuil au-delà duquel on refuse plutôt que de risquer un crash du tab :
// pixels * (4 octets CMJN + 2x4 octets par encre directe pour le canvas RGBA
// et sa relecture) — volontairement conservateur.
const MAX_ESTIMATED_BYTES = 1.2e9;
// Miniature de page pour le rapport PDF imprimable : juste assez grande pour
// être lisible sur un rapport, pas pour l'analyse (qui utilise son propre DPI).
const THUMBNAIL_MAX_WIDTH_PX = 320;

function post(message) {
	self.postMessage(message);
}

// code/params -> message français de repli (via i18n.js, même dictionnaire
// que l'UI) : app.js traduit par "code" avec sa langue courante quand il la
// reconnaît, et retombe sur "message" sinon (erreur non cataloguée).
function post_i18n(base, code, params) {
	post({ ...base, code, params, message: t(code, params) });
}

// Signal explicite de disponibilité : un module Worker évalue son graphe
// d'imports (dont le chargement du WASM MuPDF) de façon asynchrone. Un
// postMessage envoyé par la page juste après `new Worker(...)` peut arriver
// avant que ce script ait fini de charger et attaché son propre onmessage —
// dans ce cas le message est perdu silencieusement (pas d'erreur, pas de
// résultat). app.js attend ce signal avant d'envoyer la commande "analyze".
post({ type: "ready" });

function classifyError(err) {
	const msg = err && err.message ? err.message : String(err);
	if (/password|encrypt/i.test(msg))
		return { code: "error.passwordProtected", params: {} };
	if (/not a pdf|cannot recognize|unknown magic|format error|syntax error/i.test(msg))
		return { code: "error.notValidPdf", params: {} };
	return null;
}

function humanizeError(err, fallbackCode, fallbackParams) {
	const known = classifyError(err);
	if (known)
		return { code: known.code, params: known.params, detail: err?.message };
	return { code: fallbackCode, params: fallbackParams, detail: err?.message };
}

self.onmessage = async (ev) => {
	if (ev.data?.type !== "analyze")
		return;
	try {
		await analyze(ev.data);
	} catch (err) {
		const { code, params, detail } = humanizeError(err, "error.unexpected", {});
		post_i18n({ type: "error", detail }, code, params);
	}
};

async function analyze({ fileBuffer, fileName, dpi }) {
	if (dpi > MAX_DPI) {
		post_i18n({ type: "error" }, "error.dpiTooHigh", { dpi, max: MAX_DPI });
		return;
	}

	let doc;
	try {
		doc = new mupdf.PDFDocument(fileBuffer);
	} catch (err) {
		const { code, params, detail } = humanizeError(err, "error.notValidPdf", {});
		post_i18n({ type: "error", detail }, code, params);
		return;
	}

	if (doc.needsPassword()) {
		post_i18n({ type: "error" }, "error.passwordProtected", {});
		doc.destroy();
		return;
	}

	const pageCount = doc.countPages();
	if (pageCount <= 0) {
		post_i18n({ type: "error" }, "error.noPages", {});
		doc.destroy();
		return;
	}

	post({ type: "progress", stage: "start", totalPages: pageCount });

	const warnings = [];
	if (dpi > WARN_DPI)
		warnings.push({ page: null, code: "warning.highDpi", params: { dpi }, message: t("warning.highDpi", { dpi }) });

	for (let i = 0; i < pageCount; i++) {
		post({ type: "progress", stage: "page", page: i + 1, totalPages: pageCount, detailCode: "progress.detailSeparations" });

		let page;
		try {
			page = doc.loadPage(i);
			const pageResult = analyzePage(page, dpi, i + 1, warnings);
			post({ type: "page-result", page: i + 1, inks: pageResult.inks, surfaceM2: pageResult.surfaceM2, thumbnailDataUrl: pageResult.thumbnailDataUrl });
		} catch (err) {
			const { code, params, detail } = humanizeError(err, "error.pageAnalysisFailed", { page: i + 1 });
			warnings.push({ page: i + 1, code, params, detail, message: t(code, params) });
			post({ type: "page-result", page: i + 1, inks: [], failed: true });
		} finally {
			page?.destroy();
		}
	}

	post({ type: "done", warnings, fileName });
	doc.destroy();
}

// Conversion Uint8Array -> data URL base64, par blocs (un spread direct sur
// un gros tableau ferait dépasser la pile d'appel de String.fromCharCode).
function pngBytesToDataUrl(bytes) {
	let binary = "";
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize)
		binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
	return `data:image/png;base64,${btoa(binary)}`;
}

function renderThumbnail(pdfPage, bounds) {
	const widthPt = bounds[2] - bounds[0];
	const heightPt = bounds[3] - bounds[1];
	const thumbScale = THUMBNAIL_MAX_WIDTH_PX / widthPt;
	const thumbMatrix = mupdf.Matrix.concat(mupdf.Matrix.translate(-bounds[0], -bounds[1]), mupdf.Matrix.scale(thumbScale, thumbScale));
	const pixmap = pdfPage.toPixmap(thumbMatrix, mupdf.ColorSpace.DeviceRGB, false, true);
	try {
		return pngBytesToDataUrl(pixmap.asPNG());
	} finally {
		pixmap.destroy();
	}
}

function analyzePage(pdfPage, dpi, pageNumber, warnings) {
	const bounds = pdfPage.getBounds("MediaBox");
	const widthPt = bounds[2] - bounds[0];
	const heightPt = bounds[3] - bounds[1];
	const scale = dpi / 72;
	const widthPx = Math.max(1, Math.round(widthPt * scale));
	const heightPx = Math.max(1, Math.round(heightPt * scale));
	// 1 point PDF = 1/72 pouce = 0,0254/72 m. Sert à pré-remplir la surface du
	// dashboard éco-encrage (l'utilisateur peut corriger si sa zone d'impression
	// réelle diffère du MediaBox du PDF).
	const ptToM = 0.0254 / 72;
	const surfaceM2 = widthPt * ptToM * (heightPt * ptToM);

	const thumbnailDataUrl = renderThumbnail(pdfPage, bounds);

	// neutralizeTintTransforms: true -> mute, dans notre copie en mémoire du
	// PDF, la fonction de transfert de chaque encre directe vers son CMJN
	// équivalent. Sans ça, le rendu CMJN natif du Tier A (juste en dessous)
	// évaluerait cette fonction et compterait une même zone à la fois comme
	// CMJN "fantôme" et comme encre directe (Tier B) : double comptage du
	// TAC. Doit donc s'exécuter avant computeCMYKCoverage.
	const declaredGroups = scanSpotColorantGroups(pdfPage, { neutralizeTintTransforms: true });
	const spotColorantCount = declaredGroups.reduce((n, g) => n + g.names.length, 0);

	const estimatedBytes = widthPx * heightPx * (4 + spotColorantCount * 8);
	if (estimatedBytes > MAX_ESTIMATED_BYTES) {
		throw new Error(t("error.memoryInsufficient", { page: pageNumber, w: widthPx, h: heightPx, n: spotColorantCount }));
	}

	const matrix = mupdf.Matrix.concat(mupdf.Matrix.translate(-bounds[0], -bounds[1]), mupdf.Matrix.scale(scale, scale));

	const cmyk = computeCMYKCoverage(pdfPage, matrix, mupdf).map((r) => ({ ...r, tier: "cmyk" }));

	// Couleur de swatch approximative : seulement pour les Separation à un seul
	// nom (un DeviceN multi-colorants a un C1 combiné, pas décomposable par
	// colorant individuel — voir pdf-resources.js).
	const approxColorByName = new Map();
	for (const g of declaredGroups)
		if (g.kind === "Separation" && g.approxCmyk)
			approxColorByName.set(g.names[0], g.approxCmyk);

	let spot = [];
	if (spotColorantCount > 0) {
		const embeddedFonts = scanEmbeddedFonts(pdfPage);
		spot = computeSpotCoverage(pdfPage, matrix, mupdf, { widthPx, heightPx, embeddedFonts, declaredGroups })
			.map((r) => ({ ...r, tier: "spot", approxCmyk: approxColorByName.get(r.encre) || null }));
	}

	const inks = [...cmyk, ...spot];
	for (const ink of inks) {
		if (ink.fondNonNul)
			warnings.push({ page: pageNumber, code: "warning.nonZeroBackground", params: { ink: ink.encre, page: pageNumber }, message: t("warning.nonZeroBackground", { ink: ink.encre, page: pageNumber }) });
	}

	return { inks, surfaceM2, thumbnailDataUrl };
}
