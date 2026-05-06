// Injects extracted amounts as ground truth so Claude never overrides them with its own estimates.
export function buildInlineAmountsPreamble(text: string): string {
  const re =
    /^[ \t]*(\d+(?:[.,]\d+)?)\s*(ml|l\b|g\b|kg\b|EL\b|TL\b|Prise\b)\s+(.+)$/gim;
  const lines: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const rawAmt = parseFloat(m[1].replace(",", "."));
    const rawUnit = m[2];
    const ingredient = m[3].trim();
    if (isNaN(rawAmt) || rawAmt <= 0) continue;

    let amount = rawAmt;
    let unit = rawUnit;
    if (rawUnit === "EL") { amount = rawAmt * 15; unit = "ml"; }
    else if (rawUnit === "TL") { amount = rawAmt * 5; unit = "ml"; }
    else if (rawUnit === "Prise") { amount = rawAmt * 0.5; unit = "g"; }
    else if (rawUnit === "l") { amount = rawAmt * 1000; unit = "ml"; }

    lines.push(`- ${amount} ${unit}  (ingredient: "${ingredient}")`);
  }
  if (lines.length === 0) return "";
  return (
    "KNOWN INGREDIENT AMOUNTS — use these exact values; " +
    "ignore any conflicting amounts in the transcript:\n" +
    lines.join("\n") +
    "\n\n"
  );
}

export const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125,
};

// Injects parenthetical metric amounts as ground truth so Claude doesn't re-derive them from imperial measurements.
// Allows leading qualifier words inside the parens (heaping/scant/about/...) and includes
// the post-paren context so Claude can map each metric value to its ingredient unambiguously.
export function buildKnownAmountsPreamble(text: string): string {
  const re =
    /\((?:(?:heaping|scant|about|approximately|approx\.?|ca\.?|roughly|generous)\s+)?([½¼¾⅓⅔⅛]|\d+(?:\.\d+)?)\s*(grams?|g\b|ml\b|millilitres?|litres?|l\b|kg\b)\)/gi;
  const lines: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const rawAmt = m[1];
    const rawUnit = m[2].toLowerCase();
    const unit = /^g/.test(rawUnit) ? "g" : /^ml|^mill/.test(rawUnit) ? "ml" : /^kg/.test(rawUnit) ? "kg" : "l";
    const amount = UNICODE_FRACTIONS[rawAmt] ?? parseFloat(rawAmt);
    if (!isNaN(amount) && amount > 0) {
      const ctxStart = Math.max(0, m.index - 80);
      const before = text.slice(ctxStart, m.index).replace(/\s+/g, " ").trim();
      const afterEnd = Math.min(text.length, m.index + m[0].length + 80);
      const after = text.slice(m.index + m[0].length, afterEnd).replace(/\s+/g, " ").trim();
      lines.push(`- ${amount} ${unit}  (source line: "${before} <PAREN> ${after}")`);
    }
  }
  if (lines.length === 0) return "";
  return (
    "KNOWN METRIC AMOUNTS — use these exact values for ingredient amounts; " +
    "do NOT re-derive them from cup/tsp/oz measurements:\n" +
    lines.join("\n") +
    "\n\n"
  );
}
