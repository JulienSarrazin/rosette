// Parseur YAML minimal : sous-ensemble suffisant pour config.yml et
// themes/*/theme.yml (mappings imbriqués par indentation constante,
// listes "- item", scalaires simples, commentaires #). Pas d'ancres, pas de
// style "flow" ([...]/{...}), pas de chaînes multi-lignes. Écrit pour éviter
// une dépendance externe (CDN/npm) juste pour lire deux petits fichiers de
// config sur un projet qui vise justement à en réduire la dépendance.

function parseScalar(raw) {
	const s = raw.trim();
	if (s === "" || s === "~" || s === "null") return null;
	if (s === "true") return true;
	if (s === "false") return false;
	if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
	if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
		return s.slice(1, -1);
	return s;
}

function stripComment(line) {
	let inSingle = false, inDouble = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (c === "'" && !inDouble) inSingle = !inSingle;
		else if (c === '"' && !inSingle) inDouble = !inDouble;
		else if (c === "#" && !inSingle && !inDouble) return line.slice(0, i);
	}
	return line;
}

function findColon(s) {
	let inSingle = false, inDouble = false;
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (c === "'" && !inDouble) inSingle = !inSingle;
		else if (c === '"' && !inSingle) inDouble = !inDouble;
		else if (c === ":" && !inSingle && !inDouble && (i + 1 === s.length || s[i + 1] === " "))
			return i;
	}
	return -1;
}

export function parseYAML(text) {
	const lines = [];
	for (const raw of text.split("\n")) {
		const stripped = stripComment(raw).replace(/\s+$/, "");
		if (stripped.trim() === "")
			continue;
		lines.push({ indent: stripped.match(/^ */)[0].length, content: stripped.trim() });
	}

	let pos = 0;

	function parseBlock(indent) {
		if (pos >= lines.length || lines[pos].indent < indent)
			return {};
		return lines[pos].content.startsWith("- ") ? parseList(indent) : parseMapping(indent);
	}

	function parseList(indent) {
		const arr = [];
		while (pos < lines.length && lines[pos].indent === indent && lines[pos].content.startsWith("- ")) {
			const rest = lines[pos].content.slice(2);
			// Colonne du contenu après "- " : les lignes de continuation d'un
			// item multi-clés ("- family: X" puis "  url: Y" sur les lignes
			// suivantes) s'alignent sur cette colonne, pas sur celle du "-".
			const itemIndent = indent + 2;
			pos++;
			const colonIdx = findColon(rest);
			if (colonIdx === -1) {
				arr.push(parseScalar(rest));
				continue;
			}
			const key = rest.slice(0, colonIdx).trim();
			const val = rest.slice(colonIdx + 1).trim();
			const obj = {};
			obj[key] = val === "" ? parseBlock(itemIndent) : parseScalar(val);
			while (pos < lines.length && lines[pos].indent === itemIndent && !lines[pos].content.startsWith("- ")) {
				const line = lines[pos].content;
				const cIdx = findColon(line);
				if (cIdx === -1) { pos++; continue; }
				const k2 = line.slice(0, cIdx).trim();
				const v2 = line.slice(cIdx + 1).trim();
				pos++;
				obj[k2] = v2 === "" ? parseBlock(itemIndent + 2) : parseScalar(v2);
			}
			arr.push(obj);
		}
		return arr;
	}

	function parseMapping(indent) {
		const obj = {};
		while (pos < lines.length && lines[pos].indent === indent) {
			const { content } = lines[pos];
			const colonIdx = findColon(content);
			if (colonIdx === -1) { pos++; continue; }
			const key = content.slice(0, colonIdx).trim();
			const valuePart = content.slice(colonIdx + 1).trim();
			pos++;
			if (valuePart === "")
				obj[key] = pos < lines.length && lines[pos].indent > indent ? parseBlock(lines[pos].indent) : null;
			else
				obj[key] = parseScalar(valuePart);
		}
		return obj;
	}

	return parseBlock(0);
}
