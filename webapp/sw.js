// Service Worker minimal : met en cache les fichiers de l'app (dont les ~10 Mo
// de wasm MuPDF) après le premier chargement, pour un fonctionnement hors-ligne
// ensuite. Stratégie cache-first + mise à jour en arrière-plan.

const CACHE_NAME = "tac-calc-v3";
const CORE_ASSETS = [
	"./",
	"./index.html",
	"./config.yml",
	"./themes/default/theme.yml",
	"./css/styles.css",
	"./js/app.js",
	"./js/worker.js",
	"./js/cmyk-coverage.js",
	"./js/spot-coverage.js",
	"./js/glyph-outline.js",
	"./js/pdf-resources.js",
	"./js/csv-export.js",
	"./js/yaml-lite.js",
	"./js/theme-loader.js",
	"./js/ink-color.js",
	"./js/ink-naming.js",
	"./js/co2e-dashboard.js",
	"./js/pedagogy-content.js",
	"./js/i18n.js",
	"./vendor/mupdf/mupdf.js",
	"./vendor/mupdf/mupdf-wasm.js",
	"./vendor/mupdf/mupdf-wasm.wasm",
];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener("fetch", (event) => {
	if (event.request.method !== "GET")
		return;
	event.respondWith(
		caches.match(event.request).then((cached) => {
			const network = fetch(event.request)
				.then((response) => {
					if (response && response.ok) {
						const copy = response.clone();
						caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
					}
					return response;
				})
				.catch(() => cached);
			return cached || network;
		})
	);
});
