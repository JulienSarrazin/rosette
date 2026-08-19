// Tier B — estimation de la couverture des tons directs (Separation/DeviceN).
//
// MuPDF n'expose pas de rendu "toutes séparations" côté JS : on reconstruit
// nous-mêmes, via un Device personnalisé (page.run(device, matrix)), un
// accumulateur par encre directe sur un canvas hors-écran. Chaque opération
// de remplissage/trait/texte redessine sur le(s) canvas des colorants
// concernés, avec la teinte (composante couleur 0-1) comme alpha — le canal
// rouge du canvas (initialisé noir opaque) porte alors directement la
// quantité d'encre 0-255, même convention que cmyk-coverage.js.
//
// Approximations assumées (voir README "limites connues") :
//  - les images et dégradés en ton direct ne sont pas comptabilisés (rare en
//    pratique : la quasi-totalité des usages ton direct en packaging sont
//    des aplats vectoriels et du texte) ;
//  - les groupes de transparence, masques et motifs tramés ne sont pas isolés
//    (le contenu qu'ils contiennent est tout de même dessiné, juste sans la
//    composition fine que ferait un vrai moteur de rendu) ;
//  - le clip par une forme de texte n'est pas appliqué (cas rare).
// Le texte, lui, est rendu avec de vrais contours de glyphes (glyph-outline.js)
// quand la police est embarquée — pas une approximation par boîte englobante.

import { parseFont } from "./glyph-outline.js";

function clamp01(v) {
	return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function computeSpotCoverage(pdfPage, matrix, mupdf, { widthPx, heightPx, embeddedFonts, declaredGroups }) {
	const canvases = new Map(); // label -> { ctx }
	const fontDecoders = new Map(); // nom de police -> decoder | null
	const colorspaceLabelCache = new Map(); // colorspace.pointer -> [labels]
	const clipStack = []; // { path2d (espace device, déjà transformé), evenOdd }

	function getFontDecoder(fontName) {
		if (fontDecoders.has(fontName))
			return fontDecoders.get(fontName);
		const entry = embeddedFonts.get(fontName);
		const decoder = entry ? parseFont(entry.bytes, entry.format) : null;
		fontDecoders.set(fontName, decoder);
		return decoder;
	}

	function labelsFor(colorspace) {
		const key = colorspace.pointer;
		if (colorspaceLabelCache.has(key))
			return colorspaceLabelCache.get(key);
		const n = colorspace.getNumberOfComponents();
		let labels;
		if (n <= 1) {
			// colorspace.getName() renvoie un nom composite type
			// "Separation(DeviceCMYK,Spot1)" (constaté empiriquement, non
			// documenté) : on en extrait le nom réel de l'encre.
			const raw = colorspace.getName() || "";
			const match = raw.match(/^Separation\(.*,([^,()]+)\)$/);
			labels = [match ? match[1] : raw || "Encre directe"];
		} else {
			const match = declaredGroups.find((g) => g.kind === "DeviceN" && g.names.length === n);
			labels = match ? match.names.slice() : Array.from({ length: n }, (_, i) => `${colorspace.getName() || "DeviceN"}[${i + 1}]`);
		}
		colorspaceLabelCache.set(key, labels);
		return labels;
	}

	function canvasFor(label) {
		let entry = canvases.get(label);
		if (!entry) {
			const canvas = new OffscreenCanvas(widthPx, heightPx);
			const ctx = canvas.getContext("2d", { willReadFrequently: true });
			ctx.fillStyle = "black";
			ctx.fillRect(0, 0, widthPx, heightPx);
			entry = { canvas, ctx };
			canvases.set(label, entry);
		}
		return entry;
	}

	function path2DFromMupdfPath(path) {
		const p2d = new Path2D();
		path.walk({
			moveTo: (x, y) => p2d.moveTo(x, y),
			lineTo: (x, y) => p2d.lineTo(x, y),
			curveTo: (x1, y1, x2, y2, x3, y3) => p2d.bezierCurveTo(x1, y1, x2, y2, x3, y3),
			closePath: () => p2d.closePath(),
		});
		return p2d;
	}

	function applyClipStack(ctx) {
		for (const clip of clipStack)
			ctx.clip(clip.path2d, clip.evenOdd ? "evenodd" : "nonzero");
	}

	function pushClip(p2dUserSpace, evenOdd, ctm) {
		const baked = new Path2D();
		baked.addPath(p2dUserSpace, new DOMMatrix(ctm));
		clipStack.push({ path2d: baked, evenOdd });
	}

	function forEachTintedColorant(colorspace, color, alpha, fn) {
		if (colorspace.getType() !== "Separation")
			return;
		const labels = labelsFor(colorspace);
		for (let i = 0; i < labels.length; i++) {
			const tint = clamp01(color[i] ?? 0) * clamp01(alpha ?? 1);
			if (tint > 0)
				fn(labels[i], tint);
		}
	}

	function withPreparedContext(label, ctm, fn) {
		const { ctx } = canvasFor(label);
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		applyClipStack(ctx);
		ctx.setTransform(new DOMMatrix(ctm));
		fn(ctx);
		ctx.restore();
	}

	function paintPath(p2d, evenOdd, ctm, colorspace, color, alpha) {
		forEachTintedColorant(colorspace, color, alpha, (label, tint) => {
			withPreparedContext(label, ctm, (ctx) => {
				ctx.fillStyle = `rgba(255,255,255,${tint})`;
				ctx.fill(p2d, evenOdd ? "evenodd" : "nonzero");
			});
		});
	}

	function paintStroke(p2d, stroke, ctm, colorspace, color, alpha) {
		const lineWidth = Math.max(stroke.getLineWidth() || 1, 0.1);
		forEachTintedColorant(colorspace, color, alpha, (label, tint) => {
			withPreparedContext(label, ctm, (ctx) => {
				ctx.lineWidth = lineWidth;
				ctx.lineJoin = "round";
				ctx.lineCap = "round";
				ctx.strokeStyle = `rgba(255,255,255,${tint})`;
				ctx.stroke(p2d);
			});
		});
	}

	function emitGlyphCommands(ctx, commands) {
		ctx.beginPath();
		for (const cmd of commands) {
			switch (cmd.op) {
				case "M": ctx.moveTo(cmd.x, cmd.y); break;
				case "L": ctx.lineTo(cmd.x, cmd.y); break;
				case "Q": ctx.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y); break;
				case "C": ctx.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y); break;
				case "Z": ctx.closePath(); break;
			}
		}
	}

	function paintText(text, ctm, colorspace, color, alpha) {
		const labels = labelsFor(colorspace);
		const tints = labels.map((_, i) => clamp01(color[i] ?? 0) * clamp01(alpha ?? 1));
		if (!tints.some((t) => t > 0))
			return;
		const domCtm = new DOMMatrix(ctm);

		text.walk({
			showGlyph(font, trm, glyph, unicode, wmode) {
				const decoder = getFontDecoder(font.getName());
				const combined = domCtm.multiply(new DOMMatrix(trm));
				const commands = decoder ? decoder.getGlyphPath(glyph) : null;

				for (let i = 0; i < labels.length; i++) {
					if (tints[i] <= 0) continue;
					const { ctx } = canvasFor(labels[i]);
					ctx.save();
					ctx.setTransform(1, 0, 0, 1, 0, 0);
					applyClipStack(ctx);
					ctx.setTransform(combined);
					ctx.fillStyle = `rgba(255,255,255,${tints[i]})`;
					// `commands === null` : décodeur indisponible/en échec -> repli bbox.
					// `commands` vide ([]) est un résultat VALIDE (glyphe sans contour,
					// typiquement l'espace) -> ne rien dessiner, surtout pas de repli :
					// un tableau vide est faux en JS, d'où la vérification explicite.
					if (commands !== null) {
						if (commands.length) {
							// trm (donc `combined`) attend des coordonnées en "1 unité = 1 em" ;
							// les contours sont en unités de police (unitsPerEm), d'où le scale.
							ctx.scale(1 / decoder.unitsPerEm, 1 / decoder.unitsPerEm);
							emitGlyphCommands(ctx, commands);
							ctx.fill();
						}
					} else {
						// Repli : police non embarquée (ou non supportée) -> boîte
						// englobante approximative à partir de l'avance du glyphe.
						// font.advanceGlyph() est déjà en unités "1 = 1 em", comme trm.
						const advance = font.advanceGlyph(glyph, wmode) || 0.5;
						ctx.fillRect(0, -0.2, advance, 0.9);
					}
					ctx.restore();
				}
			},
		});
	}

	const device = new mupdf.Device({
		fillPath(path, evenOdd, ctm, colorspace, color, alpha) {
			paintPath(path2DFromMupdfPath(path), evenOdd, ctm, colorspace, color, alpha);
		},
		strokePath(path, stroke, ctm, colorspace, color, alpha) {
			if (colorspace.getType() !== "Separation") return;
			paintStroke(path2DFromMupdfPath(path), stroke, ctm, colorspace, color, alpha);
		},
		clipPath(path, evenOdd, ctm) {
			pushClip(path2DFromMupdfPath(path), evenOdd, ctm);
		},
		clipStrokePath(path, stroke, ctm) {
			// Approximation : clip sur le contour du tracé, pas sur la forme
			// tramée réelle du trait (cas rare en pratique).
			pushClip(path2DFromMupdfPath(path), false, ctm);
		},
		popClip() {
			clipStack.pop();
		},
		fillText(text, ctm, colorspace, color, alpha) {
			if (colorspace.getType() !== "Separation") return;
			paintText(text, ctm, colorspace, color, alpha);
		},
		strokeText(text, stroke, ctm, colorspace, color, alpha) {
			if (colorspace.getType() !== "Separation") return;
			paintText(text, ctm, colorspace, color, alpha);
		},
		clipText() {},
		clipStrokeText() {},
		ignoreText() {},
		fillShade() {},
		fillImage() {},
		fillImageMask() {},
		clipImageMask() {},
		beginMask() {},
		endMask() {},
		beginGroup() {},
		endGroup() {},
		beginTile() { return 0; },
		endTile() {},
		beginLayer() {},
		endLayer() {},
	});

	try {
		pdfPage.run(device, matrix);
	} finally {
		device.close();
		device.destroy();
	}

	const results = [];
	for (const [label, { canvas, ctx }] of canvases) {
		const { data } = ctx.getImageData(0, 0, widthPx, heightPx);
		let sum = 0, min = 255;
		const pixelCount = widthPx * heightPx;
		for (let p = 0; p < data.length; p += 4) {
			const v = data[p];
			sum += v;
			if (v < min) min = v;
		}
		results.push({
			encre: label,
			couverturePct: pixelCount > 0 ? (sum / pixelCount / 255) * 100 : 0,
			fondNonNul: min > 0,
			estime: true,
		});
		canvas.width = 0; // libère le buffer offscreen sans attendre le GC
	}
	return results;
}
