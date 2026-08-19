// Contenu pédagogique "grand public" des limites de l'outil, affiché dans
// l'app (section <details>). Écrit pour un graphiste ou un éco-concepteur
// packaging, pas pour un développeur — voir README.md pour la version
// technique détaillée (utile si vous contribuez au code).

export const PEDAGOGY_HTML = {
	fr: `
<h3>Le texte est lu lettre par lettre — sauf cas rare</h3>
<p>
	Pour les encres directes (Pantone, tons personnalisés...), l'outil lit la
	vraie forme des lettres de votre PDF, comme le ferait une imprimante.
	Ça ne marche que si la police de caractères est <strong>intégrée dans le
	PDF</strong> — ce qui est quasi toujours le cas pour un fichier
	d'impression professionnelle. Dans le cas contraire (rare), le texte est
	remplacé par un simple rectangle pour l'estimation, ce qui peut légèrement
	surestimer ou sous-estimer la couverture de cette encre.
</p>

<h3>Quelques cas très rares ne sont pas comptés</h3>
<p>
	Une image ou un dégradé colorié directement dans une encre directe (plutôt
	qu'en CMJN) n'est, pour l'instant, pas comptabilisé dans le total de cette
	encre. En packaging, l'immense majorité des usages d'encre directe sont
	des aplats de couleur ou du texte — ce cas de figure reste marginal.
</p>

<h3>La précision est d'environ ±0,5 % par encre</h3>
<p>
	Comme tout outil qui mesure une couverture sur une image plutôt que sur
	l'encre réellement déposée par une presse, il y a une petite marge
	d'imprécision — de l'ordre d'un demi-point de pourcentage par encre. C'est
	la même limite qu'aurait n'importe quel logiciel professionnel travaillant
	à partir d'un fichier PDF.
</p>

<h3>Le dashboard "impact éco-encrage" est une estimation</h3>
<p>
	Le poids d'encre, l'épaisseur de film et l'équivalent CO2 affichés sont
	calculés à partir de <strong>moyennes sectorielles</strong> (le Guide de
	l'éco-encrage de Citeo) — pas d'une mesure de votre encre, de votre presse
	ou de votre imprimeur réels, qui peuvent varier. C'est un ordre de
	grandeur utile pour comparer des choix graphiques entre eux, pas un
	résultat certifié.
</p>
`,
	en: `
<h3>Text is read letter by letter — except in rare cases</h3>
<p>
	For spot colors (Pantone, custom inks...), the tool reads the actual shape
	of the letters in your PDF, the way a printing press would. This only
	works if the font is <strong>embedded in the PDF</strong> — which is
	almost always the case for a professional print file. Otherwise (rare),
	the text is replaced by a simple rectangle for the estimate, which can
	slightly over- or under-estimate that ink's coverage.
</p>

<h3>A few very rare cases aren't counted</h3>
<p>
	An image or gradient colored directly in a spot color (rather than CMYK)
	isn't, for now, included in that ink's total. In packaging, the vast
	majority of spot-color use is solid fills or text — this case stays
	marginal.
</p>

<h3>Precision is about ±0.5% per ink</h3>
<p>
	Like any tool measuring coverage from an image rather than the ink
	actually laid down by a press, there's a small margin of error — around
	half a percentage point per ink. This is the same limit any professional
	software working from a PDF file would have.
</p>

<h3>The "eco-inking impact" dashboard is an estimate</h3>
<p>
	The ink weight, film thickness, and CO2 equivalent shown are calculated from
	<strong>sector averages</strong> (Citeo's eco-inking guide) — not a
	measurement of your actual ink, press, or printer, which can vary. It's a
	useful order of magnitude for comparing design choices, not a certified
	result.
</p>
`,
};
