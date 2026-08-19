// Charge config.yml puis themes/<theme>/theme.yml, et applique le résultat
// comme custom properties CSS (:root + @media prefers-color-scheme: dark).
// Échoue silencieusement vers les valeurs par défaut déjà codées en dur dans
// css/styles.css si config.yml/theme.yml sont absents ou malformés — l'app
// doit rester utilisable même sans configuration.
//
// Appelé tôt (voir index.html) : un bref flash du thème par défaut avant que
// le fetch asynchrone résolve est acceptable ici (pas de justification à
// bloquer le rendu pour ça sur un outil pro chargé une fois par session).

import { parseYAML } from "./yaml-lite.js";

const COLOR_KEYS = [
	"bg", "surface", "surface-alt", "text", "text-muted", "border",
	"accent", "accent-strong", "accent-contrast",
	"warning-bg", "warning-text", "error-bg", "error-text",
];

function colorRules(colors) {
	if (!colors) return "";
	return COLOR_KEYS.filter((k) => colors[k]).map((k) => `--${k}: ${colors[k]};`).join(" ");
}

// Polices auto-hébergées déclarées par le thème (theme.yml -> typography.font_files) :
// toujours chargées, jamais gated par cdn.enabled — ce sont des fichiers locaux,
// pas une dépendance externe. `themeBaseUrl` sert à résoudre les chemins
// relatifs (ex. "fonts/Manrope.woff2") depuis le dossier du thème lui-même.
function fontFaceRules(fontFiles, themeBaseUrl) {
	if (!Array.isArray(fontFiles))
		return "";
	return fontFiles
		.filter((f) => f?.family && f?.url)
		.map((f) => {
			const url = new URL(f.url, themeBaseUrl).href;
			const format = f.url.endsWith(".woff2") ? "woff2" : f.url.endsWith(".woff") ? "woff" : f.url.endsWith(".ttf") ? "truetype" : "opentype";
			return `@font-face { font-family: "${f.family}"; src: url("${url}") format("${format}"); font-weight: ${f.weight || "normal"}; font-style: ${f.style || "normal"}; font-display: swap; }`;
		})
		.join("\n");
}

function buildCSS(theme, themeBaseUrl) {
	const radius = theme.radius || {};
	const typography = theme.typography || {};
	const baseRules = [
		colorRules(theme.colors?.light),
		radius.sm ? `--radius-sm: ${radius.sm};` : "",
		radius.md ? `--radius-md: ${radius.md};` : "",
		radius.lg ? `--radius-lg: ${radius.lg};` : "",
		radius.pill ? `--radius-pill: ${radius.pill};` : "",
		typography.font_family ? `--font: ${typography.font_family};` : "",
		`--font-heading: ${typography.font_family_heading || typography.font_family || "inherit"};`,
	].filter(Boolean).join(" ");

	const darkRules = colorRules(theme.colors?.dark);

	let css = fontFaceRules(typography.font_files, themeBaseUrl);
	css += `\n:root { ${baseRules} }`;
	if (darkRules)
		css += `\n@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${darkRules} } }`;
	css += `\n:root[data-theme="dark"] { ${darkRules} }`;
	return css;
}

async function fetchYAML(url) {
	const res = await fetch(url, { cache: "no-cache" });
	if (!res.ok)
		throw new Error(`${url} : HTTP ${res.status}`);
	return parseYAML(await res.text());
}

// index.html (tôt, pour minimiser le flash du thème par défaut) et app.js
// (pour lire credits/dashboard) appellent tous deux loadTheme() : on ne fait
// le travail (fetch + injection du <style>) qu'une fois, les appels suivants
// réutilisent la même promesse.
let themePromise = null;

export function loadTheme() {
	if (!themePromise)
		themePromise = loadThemeOnce();
	return themePromise;
}

async function loadThemeOnce() {
	let config = {};
	try {
		config = await fetchYAML(new URL("../config.yml", import.meta.url));
	} catch {
		// Pas de config.yml (ou invalide) : on reste sur le thème "default"
		// et le repli CSS déjà présent dans styles.css.
	}

	// clear -> data-theme="light" (forcé), dark -> data-theme="dark" (forcé),
	// auto/absent -> aucun attribut, on suit @media (prefers-color-scheme)
	// du système du visiteur (comportement historique, toujours le défaut).
	const mode = config.appearance?.mode;
	if (mode === "clear")
		document.documentElement.dataset.theme = "light";
	else if (mode === "dark")
		document.documentElement.dataset.theme = "dark";

	const themeName = config.theme || "default";
	const themeBaseUrl = new URL(`../themes/${themeName}/`, import.meta.url);
	let theme = null;
	try {
		theme = await fetchYAML(new URL("theme.yml", themeBaseUrl));
	} catch {
		// Thème introuvable/invalide : on garde le style par défaut de styles.css.
	}

	if (theme) {
		const style = document.createElement("style");
		style.id = "theme-vars";
		style.textContent = buildCSS(theme, themeBaseUrl);
		document.head.appendChild(style);

		const cdnEnabled = !!config.cdn?.enabled;
		const fontUrl = theme.typography?.google_font_url;
		if (cdnEnabled && fontUrl) {
			const link = document.createElement("link");
			link.rel = "stylesheet";
			link.href = fontUrl;
			document.head.appendChild(link);
		}
	}

	window.__TAC_CONFIG__ = config;
	return config;
}
