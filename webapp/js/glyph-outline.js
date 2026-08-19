// Décodeur minimal de contours de glyphes, pour reconstruire un rendu texte
// fidèle dans le Tier B (mesure des tons directs) sans passer par MuPDF, qui
// n'expose pas de méthode "glyphe -> chemin vectoriel" côté WASM.
//
// Volontairement réduit au strict nécessaire : on reçoit déjà l'ID de glyphe
// résolu depuis MuPDF (TextWalker.showGlyph), donc pas de cmap, pas de
// hinting, pas de kerning. Seuls deux formats de contour sont couverts,
// ceux des polices embarquées modernes :
//   - TrueType (tables glyf/loca), simple et composite
//   - CFF Type2 charstrings (y compris CID-keyed via FDArray/FDSelect)
// Logique de décodage écrite d'après la spec Adobe/Apple et vérifiée contre
// le comportement de pdf.js (Mozilla, Apache-2.0) — implémentation propre et
// indépendante, pas une copie, scopée à l'extraction de contour uniquement.
//
// parseFont(bytes, format) -> { unitsPerEm, getGlyphPath(gid) } | null
//   format: "truetype" | "opentype" | "cff" (voir pdf-resources.js)
//   getGlyphPath(gid) -> [{op:"M"|"L"|"Z", x, y} | {op:"Q", x1,y1,x,y} | {op:"C", x1,y1,x2,y2,x,y}] | null

class Reader {
	constructor(bytes, offset = 0) {
		this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		this.bytes = bytes;
		this.pos = offset;
	}
	seek(pos) { this.pos = pos; return this; }
	u8() { return this.bytes[this.pos++]; }
	i8() { const v = this.view.getInt8(this.pos); this.pos += 1; return v; }
	u16() { const v = this.view.getUint16(this.pos); this.pos += 2; return v; }
	i16() { const v = this.view.getInt16(this.pos); this.pos += 2; return v; }
	u24() { const v = (this.u8() << 16) | (this.u8() << 8) | this.u8(); return v >>> 0; }
	u32() { const v = this.view.getUint32(this.pos); this.pos += 4; return v; }
	bytesAt(offset, length) { return this.bytes.subarray(offset, offset + length); }
}

// ---------------------------------------------------------------- TrueType

function parseSfntDirectory(bytes) {
	const r = new Reader(bytes);
	const tag = r.u32();
	let base = 0;
	if (tag === 0x74746366) { // 'ttcf' font collection: use the first font
		r.u32(); // version
		r.u32(); // numFonts (ignored, we use font 0)
		base = r.u32();
		r.seek(base);
		r.u32(); // sfnt version of the first font
	}
	const numTables = r.u16();
	r.pos += 6; // searchRange, entrySelector, rangeShift
	const tables = {};
	for (let i = 0; i < numTables; i++) {
		const tagBytes = r.bytesAt(r.pos, 4);
		const name = String.fromCharCode(...tagBytes);
		r.pos += 4;
		r.u32(); // checksum
		const offset = r.u32();
		const length = r.u32();
		tables[name] = { offset, length };
	}
	return tables;
}

function parseTrueTypeOutlines(bytes, tables) {
	if (!tables.glyf || !tables.loca || !tables.head || !tables.maxp)
		return null;

	const head = new Reader(bytes, tables.head.offset);
	head.pos += 18;
	const unitsPerEm = head.u16();
	head.pos += 30;
	const indexToLocFormat = head.i16();

	const maxp = new Reader(bytes, tables.maxp.offset);
	maxp.pos += 4;
	const numGlyphs = maxp.u16();

	const locaR = new Reader(bytes, tables.loca.offset);
	const loca = new Uint32Array(numGlyphs + 1);
	for (let i = 0; i <= numGlyphs; i++)
		loca[i] = indexToLocFormat === 0 ? locaR.u16() * 2 : locaR.u32();

	const glyfOffset = tables.glyf.offset;

	function readSimpleGlyph(r, numContours) {
		const endPts = [];
		for (let i = 0; i < numContours; i++)
			endPts.push(r.u16());
		const numPoints = numContours > 0 ? endPts[endPts.length - 1] + 1 : 0;
		const instructionLength = r.u16();
		r.pos += instructionLength;

		const flags = new Uint8Array(numPoints);
		for (let i = 0; i < numPoints;) {
			const f = r.u8();
			flags[i++] = f;
			if (f & 0x08) { // REPEAT_FLAG
				let repeat = r.u8();
				while (repeat-- > 0 && i < numPoints)
					flags[i++] = f;
			}
		}

		const xs = new Int32Array(numPoints);
		let x = 0;
		for (let i = 0; i < numPoints; i++) {
			const f = flags[i];
			if (f & 0x02) { // X_SHORT
				const dx = r.u8();
				x += (f & 0x10) ? dx : -dx;
			} else if (!(f & 0x10)) { // not X_SAME_OR_POSITIVE -> signed delta
				x += r.i16();
			}
			xs[i] = x;
		}

		const ys = new Int32Array(numPoints);
		let y = 0;
		for (let i = 0; i < numPoints; i++) {
			const f = flags[i];
			if (f & 0x04) { // Y_SHORT
				const dy = r.u8();
				y += (f & 0x20) ? dy : -dy;
			} else if (!(f & 0x20)) {
				y += r.i16();
			}
			ys[i] = y;
		}

		const path = [];
		let start = 0;
		for (const endPt of endPts) {
			emitContour(path, flags, xs, ys, start, endPt);
			start = endPt + 1;
		}
		return path;
	}

	// Convertit un contour quadratique TrueType (points on/off-curve, avec
	// milieux implicites entre deux points off-curve consécutifs) en une
	// séquence M/Q/L/Z.
	function emitContour(path, flags, xs, ys, start, end) {
		const n = end - start + 1;
		if (n <= 0) return;
		const onCurve = (i) => !!(flags[start + (((i % n) + n) % n)] & 0x01);
		const px = (i) => xs[start + (((i % n) + n) % n)];
		const py = (i) => ys[start + (((i % n) + n) % n)];

		let startIndex = 0;
		let startX, startY;
		if (onCurve(0)) {
			startX = px(0); startY = py(0);
		} else if (onCurve(n - 1)) {
			startX = px(n - 1); startY = py(n - 1);
			startIndex = -1;
		} else {
			startX = (px(0) + px(n - 1)) / 2;
			startY = (py(0) + py(n - 1)) / 2;
		}

		path.push({ op: "M", x: startX, y: startY });
		let curX = startX, curY = startY;
		let i = startIndex + 1;
		const iEnd = startIndex + n;
		while (i <= iEnd) {
			if (onCurve(i)) {
				path.push({ op: "L", x: px(i), y: py(i) });
				curX = px(i); curY = py(i);
				i++;
			} else {
				const cx = px(i), cy = py(i);
				let endX, endY;
				if (onCurve(i + 1)) {
					endX = px(i + 1); endY = py(i + 1);
					i += 2;
				} else {
					endX = (cx + px(i + 1)) / 2;
					endY = (cy + py(i + 1)) / 2;
					i += 1;
				}
				path.push({ op: "Q", x1: cx, y1: cy, x: endX, y: endY });
				curX = endX; curY = endY;
			}
		}
		path.push({ op: "Z" });
	}

	function readGlyph(gid, depth) {
		if (gid < 0 || gid >= numGlyphs || depth > 8)
			return [];
		const off = glyfOffset + loca[gid];
		const len = loca[gid + 1] - loca[gid];
		if (len <= 0)
			return [];
		const r = new Reader(bytes, off);
		const numContours = r.i16();
		r.pos += 8; // xMin,yMin,xMax,yMax

		if (numContours >= 0)
			return readSimpleGlyph(r, numContours);

		// Composite glyph: chaque composant référence un autre gid + transform.
		const path = [];
		for (;;) {
			const flags = r.u16();
			const compGid = r.u16();
			let dx = 0, dy = 0;
			if (flags & 0x0001) { // ARG_1_AND_2_ARE_WORDS
				if (flags & 0x0002) { dx = r.i16(); dy = r.i16(); }
				else { r.i16(); r.i16(); }
			} else {
				if (flags & 0x0002) { dx = r.i8(); dy = r.i8(); }
				else { r.i8(); r.i8(); }
			}
			let a = 1, b = 0, c = 0, d = 1;
			if (flags & 0x0008) { // WE_HAVE_A_SCALE
				a = d = r.i16() / 16384;
			} else if (flags & 0x0040) { // X_AND_Y_SCALE
				a = r.i16() / 16384;
				d = r.i16() / 16384;
			} else if (flags & 0x0080) { // 2x2
				a = r.i16() / 16384;
				b = r.i16() / 16384;
				c = r.i16() / 16384;
				d = r.i16() / 16384;
			}
			const sub = readGlyph(compGid, depth + 1);
			for (const cmd of sub) {
				path.push(transformCommand(cmd, a, b, c, d, dx, dy));
			}
			if (!(flags & 0x0020)) // MORE_COMPONENTS
				break;
		}
		return path;
	}

	return {
		unitsPerEm: unitsPerEm || 1000,
		getGlyphPath(gid) {
			try { return readGlyph(gid, 0); }
			catch { return null; }
		},
	};
}

function transformCommand(cmd, a, b, c, d, dx, dy) {
	const tx = (x, y) => a * x + c * y + dx;
	const ty = (x, y) => b * x + d * y + dy;
	switch (cmd.op) {
		case "M":
		case "L":
			return { op: cmd.op, x: tx(cmd.x, cmd.y), y: ty(cmd.x, cmd.y) };
		case "Q":
			return {
				op: "Q",
				x1: tx(cmd.x1, cmd.y1), y1: ty(cmd.x1, cmd.y1),
				x: tx(cmd.x, cmd.y), y: ty(cmd.x, cmd.y),
			};
		case "C":
			return {
				op: "C",
				x1: tx(cmd.x1, cmd.y1), y1: ty(cmd.x1, cmd.y1),
				x2: tx(cmd.x2, cmd.y2), y2: ty(cmd.x2, cmd.y2),
				x: tx(cmd.x, cmd.y), y: ty(cmd.x, cmd.y),
			};
		default:
			return cmd;
	}
}

// -------------------------------------------------------------------- CFF

function parseCFFIndex(r) {
	const count = r.u16();
	if (count === 0)
		return { items: [], end: r.pos };
	const offSize = r.u8();
	const readOff = () => {
		let v = 0;
		for (let i = 0; i < offSize; i++) v = (v << 8) | r.u8();
		return v;
	};
	const offsets = new Array(count + 1);
	for (let i = 0; i <= count; i++)
		offsets[i] = readOff();
	const dataStart = r.pos - 1;
	const items = [];
	for (let i = 0; i < count; i++)
		items.push(r.bytesAt(dataStart + offsets[i], offsets[i + 1] - offsets[i]));
	r.pos = dataStart + offsets[count];
	return { items, end: r.pos };
}

function parseCFFDict(bytes) {
	const dict = {};
	const operands = [];
	let i = 0;
	while (i < bytes.length) {
		const b0 = bytes[i];
		if (b0 <= 21) {
			let op = b0;
			i += 1;
			if (b0 === 12) { op = 1200 + bytes[i]; i += 1; }
			dict[op] = operands.slice();
			operands.length = 0;
		} else if (b0 === 28) {
			operands.push(((bytes[i + 1] << 8) | bytes[i + 2]) << 16 >> 16);
			i += 3;
		} else if (b0 === 29) {
			operands.push((bytes[i + 1] << 24) | (bytes[i + 2] << 16) | (bytes[i + 3] << 8) | bytes[i + 4]);
			i += 5;
		} else if (b0 === 30) { // real number
			i += 1;
			let s = "";
			const nibbles = "0123456789.EE?-?";
			outer: for (;;) {
				const byte = bytes[i++];
				for (const nib of [byte >> 4, byte & 0xf]) {
					if (nib === 0xf) break outer;
					if (nib === 0xc) s += "E-";
					else s += nibbles[nib];
				}
			}
			operands.push(parseFloat(s) || 0);
		} else if (b0 >= 32 && b0 <= 246) {
			operands.push(b0 - 139);
			i += 1;
		} else if (b0 >= 247 && b0 <= 250) {
			operands.push((b0 - 247) * 256 + bytes[i + 1] + 108);
			i += 2;
		} else if (b0 >= 251 && b0 <= 254) {
			operands.push(-(b0 - 251) * 256 - bytes[i + 1] - 108);
			i += 2;
		} else {
			i += 1; // unknown byte, skip defensively
		}
	}
	return dict;
}

function subrBias(count) {
	if (count < 1240) return 107;
	if (count < 33900) return 1131;
	return 32768;
}

function parseCFF(bytes) {
	const r = new Reader(bytes);
	const major = r.u8(); r.u8();
	const hdrSize = r.u8();
	r.u8(); // offSize
	r.seek(hdrSize);
	if (major !== 1) return null;

	parseCFFIndex(r); // Name INDEX (unused)
	const topDictIndex = parseCFFIndex(r);
	const stringIndex = parseCFFIndex(r);
	const globalSubrIndex = parseCFFIndex(r);

	if (topDictIndex.items.length === 0) return null;
	const topDict = parseCFFDict(topDictIndex.items[0]);

	const CFF_OP = { CharStrings: 17, Private: 18, ROS: 1230, FDArray: 1236, FDSelect: 1237, FontMatrix: 1207, CharstringType: 1206 };

	let unitsPerEm = 1000;
	if (topDict[CFF_OP.FontMatrix] && topDict[CFF_OP.FontMatrix][0])
		unitsPerEm = Math.round(1 / topDict[CFF_OP.FontMatrix][0]) || 1000;

	if (!topDict[CFF_OP.CharStrings]) return null;
	const charStringsR = new Reader(bytes, topDict[CFF_OP.CharStrings][0]);
	const charStrings = parseCFFIndex(charStringsR).items;

	function parsePrivateAndSubrs(privateEntry) {
		if (!privateEntry) return { localSubrIndex: { items: [] }, nominalWidthX: 0, defaultWidthX: 0 };
		const [size, offset] = privateEntry;
		const privDict = parseCFFDict(bytes.subarray(offset, offset + size));
		let localSubrIndex = { items: [] };
		if (privDict[19]) { // Subrs (local), offset relative to Private dict start
			const localR = new Reader(bytes, offset + privDict[19][0]);
			localSubrIndex = parseCFFIndex(localR);
		}
		return {
			localSubrIndex,
			nominalWidthX: privDict[21] ? privDict[21][0] : 0,
			defaultWidthX: privDict[20] ? privDict[20][0] : 0,
		};
	}

	// CID-keyed CFF (CIDFontType0C) : subrs locaux par glyphe via FDArray/FDSelect.
	let fdArrayPrivates = null;
	let fdSelect = null;
	if (topDict[CFF_OP.ROS]) {
		if (topDict[CFF_OP.FDArray]) {
			const fdArrayR = new Reader(bytes, topDict[CFF_OP.FDArray][0]);
			const fdIndex = parseCFFIndex(fdArrayR);
			fdArrayPrivates = fdIndex.items.map((fdBytes) => {
				const fdDict = parseCFFDict(fdBytes);
				return parsePrivateAndSubrs(fdDict[CFF_OP.Private]);
			});
		}
		if (topDict[CFF_OP.FDSelect]) {
			fdSelect = parseFDSelect(new Reader(bytes, topDict[CFF_OP.FDSelect][0]), charStrings.length);
		}
	}

	const defaultPrivate = parsePrivateAndSubrs(topDict[CFF_OP.Private]);

	function privateForGlyph(gid) {
		if (fdArrayPrivates && fdSelect) {
			const fd = fdSelect[gid] ?? 0;
			return fdArrayPrivates[fd] || defaultPrivate;
		}
		return defaultPrivate;
	}

	function getGlyphPath(gid) {
		if (gid < 0 || gid >= charStrings.length)
			return null;
		try {
			const priv = privateForGlyph(gid);
			return runType2Charstring(charStrings[gid], globalSubrIndex.items, priv.localSubrIndex.items);
		} catch {
			return null;
		}
	}

	return { unitsPerEm, getGlyphPath };
}

function parseFDSelect(r, numGlyphs) {
	const format = r.u8();
	const fdSelect = new Uint8Array(numGlyphs);
	if (format === 0) {
		for (let i = 0; i < numGlyphs; i++)
			fdSelect[i] = r.u8();
	} else if (format === 3) {
		const nRanges = r.u16();
		let first = r.u16();
		for (let i = 0; i < nRanges; i++) {
			const fd = r.u8();
			const next = r.u16();
			for (let g = first; g < next; g++)
				fdSelect[g] = fd;
			first = next;
		}
	}
	return fdSelect;
}

function runType2Charstring(code, globalSubrs, localSubrs) {
	const path = [];
	const stack = [];
	let x = 0, y = 0;
	let nStems = 0;
	let haveWidth = false;
	let open = false;
	const gBias = subrBias(globalSubrs.length);
	const lBias = subrBias(localSubrs.length);
	const trans = []; // transient array for put/get (rarely used)

	function moveTo(nx, ny) {
		if (open) path.push({ op: "Z" });
		x = nx; y = ny;
		path.push({ op: "M", x, y });
		open = true;
	}
	function lineTo(nx, ny) {
		x = nx; y = ny;
		path.push({ op: "L", x, y });
	}
	function curveTo(x1, y1, x2, y2, nx, ny) {
		path.push({ op: "C", x1, y1, x2, y2, x: nx, y: ny });
		x = nx; y = ny;
	}

	function takeWidthIfPresent(evenArgs) {
		if (!haveWidth) {
			const parity = stack.length % 2;
			if ((evenArgs && parity === 1) || (!evenArgs && stack.length > evenArgs))
				stack.shift();
			haveWidth = true;
		}
	}

	function countHints() {
		if (!haveWidth && stack.length % 2 === 1)
			stack.shift();
		haveWidth = true;
		nStems += stack.length >> 1;
		stack.length = 0;
	}

	function exec(bytes, depth) {
		if (depth > 10) return;
		let i = 0;
		while (i < bytes.length) {
			let b0 = bytes[i++];
			if (b0 === 28) {
				stack.push((((bytes[i] << 8) | bytes[i + 1]) << 16 >> 16));
				i += 2;
				continue;
			}
			if (b0 >= 32 || b0 === 255) {
				let val;
				if (b0 === 255) {
					val = ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) / 65536;
					i += 4;
				} else if (b0 < 247) {
					val = b0 - 139;
				} else if (b0 < 251) {
					val = (b0 - 247) * 256 + bytes[i++] + 108;
				} else {
					val = -(b0 - 251) * 256 - bytes[i++] - 108;
				}
				stack.push(val);
				continue;
			}

			switch (b0) {
				case 1: case 3: case 18: case 23: // h/vstem(hm)
					countHints();
					break;
				case 19: case 20: { // hintmask, cntrmask
					countHints();
					i += (nStems + 7) >> 3;
					break;
				}
				case 21: // rmoveto
					takeWidthIfPresent(2);
					moveTo(x + stack[0], y + stack[1]);
					stack.length = 0;
					break;
				case 22: // hmoveto
					takeWidthIfPresent(1);
					moveTo(x + stack[0], y);
					stack.length = 0;
					break;
				case 4: // vmoveto
					takeWidthIfPresent(1);
					moveTo(x, y + stack[0]);
					stack.length = 0;
					break;
				case 5: // rlineto
					for (let k = 0; k + 1 < stack.length; k += 2)
						lineTo(x + stack[k], y + stack[k + 1]);
					stack.length = 0;
					break;
				case 6: { // hlineto
					let horiz = true;
					for (let k = 0; k < stack.length; k++) {
						if (horiz) lineTo(x + stack[k], y); else lineTo(x, y + stack[k]);
						horiz = !horiz;
					}
					stack.length = 0;
					break;
				}
				case 7: { // vlineto
					let horiz = false;
					for (let k = 0; k < stack.length; k++) {
						if (horiz) lineTo(x + stack[k], y); else lineTo(x, y + stack[k]);
						horiz = !horiz;
					}
					stack.length = 0;
					break;
				}
				case 8: // rrcurveto
					for (let k = 0; k + 5 < stack.length; k += 6) {
						const x1 = x + stack[k], y1 = y + stack[k + 1];
						const x2 = x1 + stack[k + 2], y2 = y1 + stack[k + 3];
						curveTo(x1, y1, x2, y2, x2 + stack[k + 4], y2 + stack[k + 5]);
					}
					stack.length = 0;
					break;
				case 24: { // rcurveline
					let k = 0;
					for (; k + 5 < stack.length - 2; k += 6) {
						const x1 = x + stack[k], y1 = y + stack[k + 1];
						const x2 = x1 + stack[k + 2], y2 = y1 + stack[k + 3];
						curveTo(x1, y1, x2, y2, x2 + stack[k + 4], y2 + stack[k + 5]);
					}
					lineTo(x + stack[k], y + stack[k + 1]);
					stack.length = 0;
					break;
				}
				case 25: { // rlinecurve
					let k = 0;
					for (; k + 1 < stack.length - 6; k += 2)
						lineTo(x + stack[k], y + stack[k + 1]);
					const x1 = x + stack[k], y1 = y + stack[k + 1];
					const x2 = x1 + stack[k + 2], y2 = y1 + stack[k + 3];
					curveTo(x1, y1, x2, y2, x2 + stack[k + 4], y2 + stack[k + 5]);
					stack.length = 0;
					break;
				}
				case 26: { // vvcurveto
					let k = 0;
					let dx1 = 0;
					if (stack.length % 4 === 1) { dx1 = stack[0]; k = 1; }
					for (; k + 3 < stack.length; k += 4) {
						const x1 = x + dx1, y1 = y + stack[k];
						const x2 = x1 + stack[k + 1], y2 = y1 + stack[k + 2];
						curveTo(x1, y1, x2, y2, x2, y2 + stack[k + 3]);
						dx1 = 0;
					}
					stack.length = 0;
					break;
				}
				case 27: { // hhcurveto
					let k = 0;
					let dy1 = 0;
					if (stack.length % 4 === 1) { dy1 = stack[0]; k = 1; }
					for (; k + 3 < stack.length; k += 4) {
						const x1 = x + stack[k], y1 = y + dy1;
						const x2 = x1 + stack[k + 1], y2 = y1 + stack[k + 2];
						curveTo(x1, y1, x2, y2, x2 + stack[k + 3], y2);
						dy1 = 0;
					}
					stack.length = 0;
					break;
				}
				case 30: case 31: { // vhcurveto / hvcurveto
					let horiz = b0 === 31;
					let k = 0;
					while (k + 3 < stack.length) {
						const last = (k + 4 === stack.length - 1);
						if (horiz) {
							const x1 = x + stack[k], y1 = y;
							const x2 = x1 + stack[k + 1], y2 = y1 + stack[k + 2];
							const ny = y2 + stack[k + 3];
							const nx = last ? x2 + stack[k + 4] : x2;
							curveTo(x1, y1, x2, y2, nx, ny);
						} else {
							const x1 = x, y1 = y + stack[k];
							const x2 = x1 + stack[k + 1], y2 = y1 + stack[k + 2];
							const nx = x2 + stack[k + 3];
							const ny = last ? y2 + stack[k + 4] : y2;
							curveTo(x1, y1, x2, y2, nx, ny);
						}
						horiz = !horiz;
						k += 4;
					}
					stack.length = 0;
					break;
				}
				case 10: { // callsubr
					const idx = stack.pop() + lBias;
					if (localSubrs[idx]) exec(localSubrs[idx], depth + 1);
					break;
				}
				case 29: { // callgsubr
					const idx = stack.pop() + gBias;
					if (globalSubrs[idx]) exec(globalSubrs[idx], depth + 1);
					break;
				}
				case 11: // return
					return;
				case 14: // endchar
					takeWidthIfPresent(0);
					if (stack.length >= 4) {
						// composition à la seac (rarement rencontré dans des PDF
						// modernes) : non composé, on ferme simplement le tracé.
					}
					if (open) path.push({ op: "Z" });
					return;
				case 12: { // escape: opérateurs étendus
					const b1 = bytes[i++];
					execEscape(b1);
					break;
				}
				default:
					stack.length = 0;
					break;
			}
		}
	}

	function execEscape(op) {
		switch (op) {
			case 35: { // flex
				const a = stack;
				const x1 = x + a[0], y1 = y + a[1];
				const x2 = x1 + a[2], y2 = y1 + a[3];
				const x3 = x2 + a[4], y3 = y2 + a[5];
				curveTo(x1, y1, x2, y2, x3, y3);
				const x4 = x3 + a[6], y4 = y3 + a[7];
				const x5 = x4 + a[8], y5 = y4 + a[9];
				const x6 = x5 + a[10], y6 = y5 + a[11];
				curveTo(x4, y4, x5, y5, x6, y6);
				stack.length = 0;
				break;
			}
			case 34: { // hflex
				const a = stack;
				const x1 = x + a[0], y1 = y;
				const x2 = x1 + a[1], y2 = y1 + a[2];
				const x3 = x2 + a[3], y3 = y2;
				curveTo(x1, y1, x2, y2, x3, y3);
				const x4 = x3 + a[4], y4 = y3;
				const x5 = x4 + a[5], y5 = y;
				const x6 = x5 + a[6], y6 = y;
				curveTo(x4, y4, x5, y5, x6, y6);
				stack.length = 0;
				break;
			}
			case 36: { // hflex1
				const a = stack;
				const y0 = y;
				const x1 = x + a[0], y1 = y + a[1];
				const x2 = x1 + a[2], y2 = y1 + a[3];
				const x3 = x2 + a[4], y3 = y2;
				curveTo(x1, y1, x2, y2, x3, y3);
				const x4 = x3 + a[5], y4 = y3;
				const x5 = x4 + a[6], y5 = y4 + a[7];
				const x6 = x5 + a[8], y6 = y0;
				curveTo(x4, y4, x5, y5, x6, y6);
				stack.length = 0;
				break;
			}
			case 37: { // flex1
				const a = stack;
				const x0 = x, y0 = y;
				const x1 = x + a[0], y1 = y + a[1];
				const x2 = x1 + a[2], y2 = y1 + a[3];
				const x3 = x2 + a[4], y3 = y2 + a[5];
				curveTo(x1, y1, x2, y2, x3, y3);
				const x4 = x3 + a[6], y4 = y3 + a[7];
				const x5 = x4 + a[8], y5 = y4 + a[9];
				const dx = x5 - x0, dy = y5 - y0;
				let x6, y6;
				if (Math.abs(dx) > Math.abs(dy)) { x6 = x5 + a[10]; y6 = y0; }
				else { x6 = x0; y6 = y5 + a[10]; }
				curveTo(x4, y4, x5, y5, x6, y6);
				stack.length = 0;
				break;
			}
			default:
				stack.length = 0;
				break;
		}
	}

	exec(code, 0);
	return path;
}

// --------------------------------------------------------------- Public API

export function parseFont(bytes, format) {
	try {
		if (format === "cff")
			return parseCFF(bytes);

		// truetype / opentype : conteneur sfnt, on détermine le format réel
		// des contours d'après les tables présentes plutôt que de se fier
		// uniquement au Subtype PDF.
		const tables = parseSfntDirectory(bytes);
		if (tables["CFF "]) {
			const cffBytes = bytes.subarray(tables["CFF "].offset, tables["CFF "].offset + tables["CFF "].length);
			return parseCFF(cffBytes);
		}
		if (tables.glyf && tables.loca)
			return parseTrueTypeOutlines(bytes, tables);
		return null;
	} catch {
		return null;
	}
}
