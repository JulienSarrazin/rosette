// Parcours de l'arbre PDFObject d'une page pour :
//  - lister les encres directes (Separation/DeviceN) déclarées dans les
//    ColorSpace de la page et de ses XObjects Form,
//  - retrouver les octets bruts des polices embarquées (FontFile2/FontFile3)
//    pour le rendu de texte fidèle du Tier B (voir glyph-outline.js).
//
// Le parcours des annotations (apparences /AP, qui ont leurs propres
// /Resources) n'est pas couvert ici : limitation connue, documentée dans le
// README. L'essentiel de la couverture d'encre d'un PDF print vient du
// contenu de page, pas des annotations.

const MAX_RESOURCE_DEPTH = 8;

function isUsableName(name) {
	return name && name !== "All" && name !== "None";
}

// Fonction de transfert constante (0 quel que soit le tenant) : neutralise la
// conversion d'une encre directe vers son équivalent CMJN "alternate space".
// Sert à empêcher le Tier A (rendu CMJN natif de MuPDF) de compter deux fois
// une même zone d'encre : sans ça, MuPDF évalue la vraie fonction de
// transfert de la Separation/DeviceN pour produire un aperçu CMJN composite,
// et cette même zone se retrouve comptée à la fois en CMJN (Tier A) et dans
// son encre directe (Tier B). La mutation ne touche que notre copie en
// mémoire du PDFDocument (jamais le fichier d'origine, jamais exportée).
function zeroTintTransform(nComponents) {
	return {
		FunctionType: 2,
		Domain: Array.from({ length: nComponents }, () => [0, 1]).flat(),
		C0: [0, 0, 0, 0],
		C1: [0, 0, 0, 0],
		N: 1,
	};
}

// Lit la fonction de transfert d'origine (avant neutralisation) à teinte
// pleine (1.0) pour en tirer une couleur de swatch approximative. Seules les
// fonctions Type 2 (exponentielles, de très loin les plus courantes pour les
// Separation/DeviceN en pratique) sont gérées : à t=1, une fonction Type 2
// vaut simplement C1 (C0 + 1^N*(C1-C0) = C1) — pas besoin d'un interpréteur
// de fonction PDF complet pour ce seul besoin d'affichage approximatif.
// Retourne un tableau CMJN [c,m,j,n] normalisé (converti depuis RGB/Gray si
// l'espace alternatif n'est pas déjà du CMJN), ou null si indisponible.
function approxCmykFromTintTransform(csObj) {
	const fn = csObj.get(3);
	if (!fn || fn.isNull() || !fn.isDictionary())
		return null;
	const typeObj = fn.get("FunctionType");
	if (!typeObj.isNumber() || typeObj.asNumber() !== 2)
		return null;
	const c1 = fn.get("C1");
	if (!c1.isArray() || c1.length === 0)
		return null;
	const values = [];
	c1.forEach((v) => values.push(v.isNumber() ? v.asNumber() : 0));

	if (values.length === 4)
		return values;
	if (values.length === 3) {
		const [r, g, b] = values;
		const k = 1 - Math.max(r, g, b);
		const denom = 1 - k;
		return denom > 0 ? [(denom - r + k) / denom, (denom - g + k) / denom, (denom - b + k) / denom, k] : [0, 0, 0, 1];
	}
	if (values.length === 1)
		return [0, 0, 0, 1 - values[0]];
	return null;
}

function collectColorSpaceGroups(csObj, groups, seenKeys, neutralize) {
	if (!csObj || csObj.isNull() || !csObj.isArray() || csObj.length < 4)
		return;
	const family = csObj.get(0);
	if (!family.isName())
		return;
	const familyName = family.asName();
	let names = null;
	if (familyName === "Separation") {
		const name = csObj.get(1);
		if (name.isName() && isUsableName(name.asName()))
			names = [name.asName()];
	} else if (familyName === "DeviceN") {
		const namesObj = csObj.get(1);
		if (namesObj.isArray()) {
			const collected = [];
			namesObj.forEach((n) => {
				if (n.isName() && isUsableName(n.asName()))
					collected.push(n.asName());
			});
			if (collected.length > 0)
				names = collected;
		}
	}
	if (!names)
		return;

	// Doit être lu AVANT neutralize : une fois la fonction remplacée par
	// zeroTintTransform, C1 vaudrait toujours [0,0,0,0] (noir/vide).
	const approxCmyk = approxCmykFromTintTransform(csObj);

	if (neutralize)
		csObj.put(3, zeroTintTransform(names.length));

	const key = `${familyName === "Separation" ? "S" : "N"}:${names.join(" ")}`;
	if (!seenKeys.has(key)) {
		seenKeys.add(key);
		groups.push({ kind: familyName, names, approxCmyk });
	}
}

function walkResourcesForColorants(resources, groups, seenKeys, depth, neutralize) {
	if (!resources || resources.isNull() || depth > MAX_RESOURCE_DEPTH)
		return;

	const csDict = resources.get("ColorSpace");
	if (csDict && !csDict.isNull())
		csDict.forEach((csObj) => collectColorSpaceGroups(csObj, groups, seenKeys, neutralize));

	// Les patterns (tramés, dégradés) peuvent eux-mêmes référencer des
	// ColorSpace directes non listées ailleurs.
	const patDict = resources.get("Pattern");
	if (patDict && !patDict.isNull()) {
		patDict.forEach((patObj) => {
			const patRes = patObj.get("Resources");
			if (patRes && !patRes.isNull())
				walkResourcesForColorants(patRes, groups, seenKeys, depth + 1, neutralize);
		});
	}

	const xobjDict = resources.get("XObject");
	if (xobjDict && !xobjDict.isNull()) {
		xobjDict.forEach((xobj) => {
			const subtype = xobj.get("Subtype");
			if (subtype && subtype.isName() && subtype.asName() === "Form") {
				const childRes = xobj.get("Resources");
				walkResourcesForColorants(childRes.isNull() ? resources : childRes, groups, seenKeys, depth + 1, neutralize);
			}
		});
	}
}

// Retourne les groupes d'encres directes déclarées sur la page :
// [{ kind: "Separation"|"DeviceN", names: [...] }], dédupliqués.
// Sert (a) à peupler la liste des encres détectées, (b) à résoudre les noms
// individuels d'un DeviceN multi-colorants rencontré pendant le rendu du
// Tier B (spot-coverage.js), MuPDF n'exposant pas ces noms par composante.
//
// neutralizeTintTransforms=true (à utiliser avant le rendu du Tier A, voir
// worker.js) mute en plus, dans notre copie en mémoire du document, la
// fonction de transfert de chaque encre directe trouvée pour qu'elle ne
// produise plus aucune encre CMJN équivalente — évite un double comptage
// avec le Tier B (voir commentaire de zeroTintTransform ci-dessus).
export function scanSpotColorantGroups(pdfPage, { neutralizeTintTransforms = false } = {}) {
	const groups = [];
	const seenKeys = new Set();
	const resources = pdfPage.getObject().get("Resources");
	walkResourcesForColorants(resources, groups, seenKeys, 0, neutralizeTintTransforms);
	return groups;
}

function fontFormatFromDescriptor(descriptor) {
	const ff2 = descriptor.get("FontFile2");
	if (ff2 && !ff2.isNull() && ff2.isStream())
		return { stream: ff2, format: "truetype" };

	const ff3 = descriptor.get("FontFile3");
	if (ff3 && !ff3.isNull() && ff3.isStream()) {
		const subtype = ff3.get("Subtype");
		const isOpenType = subtype && subtype.isName() && subtype.asName() === "OpenType";
		return { stream: ff3, format: isOpenType ? "opentype" : "cff" };
	}

	// FontFile (Type1 brut) : hors scope du décodeur de contours pour l'instant,
	// on le signale mais sans octets exploitables -> repli bbox pour ces polices.
	return null;
}

function extractFontEntry(fontDict) {
	const subtype = fontDict.get("Subtype");
	let descriptorSource = fontDict;

	if (subtype && subtype.isName() && subtype.asName() === "Type0") {
		const descendants = fontDict.get("DescendantFonts");
		if (descendants && descendants.isArray() && descendants.length > 0)
			descriptorSource = descendants.get(0);
	}

	const descriptor = descriptorSource.get("FontDescriptor");
	if (!descriptor || descriptor.isNull())
		return null;

	const found = fontFormatFromDescriptor(descriptor);
	if (!found)
		return null;

	const names = new Set();
	for (const src of [fontDict, descriptorSource]) {
		const baseFont = src.get("BaseFont");
		if (baseFont && baseFont.isName())
			names.add(baseFont.asName());
	}
	if (names.size === 0)
		return null;

	// Copie immédiate : la vue renvoyée par asUint8Array() pointe dans le tas
	// WASM et devient invalide si le mupdf.Buffer sous-jacent est libéré.
	const bytes = Uint8Array.from(found.stream.readStream().asUint8Array());

	return { names: Array.from(names), bytes, format: found.format };
}

function walkResourcesForFonts(resources, into, depth) {
	if (!resources || resources.isNull() || depth > MAX_RESOURCE_DEPTH)
		return;

	const fontDict = resources.get("Font");
	if (fontDict && !fontDict.isNull()) {
		fontDict.forEach((fontObj) => {
			const entry = extractFontEntry(fontObj);
			if (entry) {
				for (const name of entry.names)
					if (!into.has(name))
						into.set(name, entry);
			}
		});
	}

	const xobjDict = resources.get("XObject");
	if (xobjDict && !xobjDict.isNull()) {
		xobjDict.forEach((xobj) => {
			const subtype = xobj.get("Subtype");
			if (subtype && subtype.isName() && subtype.asName() === "Form") {
				const childRes = xobj.get("Resources");
				walkResourcesForFonts(childRes.isNull() ? resources : childRes, into, depth + 1);
			}
		});
	}
}

// Retourne une Map nom-de-police (BaseFont, avec préfixe de sous-ensemble
// éventuel type "ABCDEF+Calibri") -> { bytes, format }, pour toutes les
// polices embarquées utilisables par glyph-outline.js.
export function scanEmbeddedFonts(pdfPage) {
	const fonts = new Map();
	const resources = pdfPage.getObject().get("Resources");
	walkResourcesForFonts(resources, fonts, 0);
	return fonts;
}
