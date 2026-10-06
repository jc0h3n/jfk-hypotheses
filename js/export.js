// Markdown report, CSV matrix and JSON file exports.
import { RATING, LEVEL_LABEL, ranking, diagnosticity, DIAG_LABEL, sensitivity, ratingOf, weightOf, round } from "./model.js";

const mdCell = s => String(s ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ");
const slug = s => (s || "analysis").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "analysis";

export function toMarkdown(a) {
  const rank = ranking(a), { critical, margin } = sensitivity(a);
  const used = a.evidence.filter(e => !e.excluded), set = a.evidence.filter(e => e.excluded);
  const L = [];
  L.push(`# ${a.title}`, "");
  if (a.question) L.push(`**Question:** ${a.question}`, "");
  L.push(`${a.analyst ? `Analyst: ${a.analyst} · ` : ""}Updated ${a.updated.slice(0, 10)} · Analysis of Competing Hypotheses`, "");
  L.push("## Hypotheses, least to most inconsistent", "", "| Rank | Hypothesis | Weighted inconsistency | Inconsistent items |", "|---|---|---|---|");
  for (const r of rank) L.push(`| ${r.rank} | ${mdCell(r.h.text)} | ${r.inconsistency} | ${r.inconsistent} |`);
  L.push("");
  if (a.hypotheses.length > 1) {
    L.push("## Sensitivity", "");
    L.push(margin ? `The leading hypothesis is ahead by ${margin} point${margin === 1 ? "" : "s"}.` : "The top hypotheses are tied.");
    L.push(critical.length ? `Removing any one of these items would change which hypothesis leads:\n\n${critical.map(c => `- ${c.e.text}`).join("\n")}` : "No single item of evidence changes which hypothesis leads.", "");
  }
  if (a.conclusion.trim()) L.push("## Conclusion", "", a.conclusion.trim(), "");
  if (a.milestones.length) L.push("## Milestones to watch", "", ...a.milestones.map(m => `- ${m.text}`), "");
  L.push("## Matrix", "", `| Evidence | Credibility | Relevance | Diagnosticity | ${a.hypotheses.map((h, i) => `H${i + 1}`).join(" | ")} |`, `|---|---|---|---|${a.hypotheses.map(() => "---").join("|")}|`);
  for (const e of used) L.push(`| ${mdCell(e.text)} | ${LEVEL_LABEL[e.credibility]} | ${LEVEL_LABEL[e.relevance]} | ${DIAG_LABEL[diagnosticity(a, e).level]} | ${a.hypotheses.map(h => ratingOf(a, e, h) || "–").join(" | ")} |`);
  L.push("", a.hypotheses.map((h, i) => `H${i + 1}: ${h.text}`).join("  \n"), "");
  L.push("Ratings: CC very consistent, C consistent, N neutral, NA not applicable, I inconsistent, II very inconsistent.", "");
  if (set.length) L.push("## Evidence set aside", "", ...set.map(e => `- ${e.text}`), "");
  L.push("## Evidence details", "", "| # | Evidence | Type | Source | Date | Notes |", "|---|---|---|---|---|---|");
  a.evidence.forEach((e, i) => L.push(`| ${i + 1} | ${mdCell(e.text)} | ${e.type} | ${mdCell(e.source)} | ${mdCell(e.date)} | ${mdCell(e.notes)} |`));
  L.push("", "---", "Scoring: each Inconsistent rating counts 1 and each Very inconsistent rating counts 2, multiplied by the evidence's credibility and relevance weights (Low 0.5, Medium 1, High 1.5). Lower scores mean fewer, weaker reasons to reject a hypothesis.");
  return L.join("\n");
}

export function toCSV(a) {
  const q = v => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = [["Evidence", "Type", "Source", "Date", "Credibility", "Relevance", "Weight", "Diagnosticity", "Used in scores", ...a.hypotheses.map(h => h.text)]];
  for (const e of a.evidence) rows.push([e.text, e.type, e.source, e.date, LEVEL_LABEL[e.credibility], LEVEL_LABEL[e.relevance], round(weightOf(e)), DIAG_LABEL[diagnosticity(a, e).level], e.excluded ? "no" : "yes", ...a.hypotheses.map(h => ratingOf(a, e, h))]);
  const s = ranking(a); const by = Object.fromEntries(s.map(x => [x.h.id, x]));
  rows.push(["Weighted inconsistency", "", "", "", "", "", "", "", "", ...a.hypotheses.map(h => by[h.id].inconsistency)]);
  rows.push(["Rank", "", "", "", "", "", "", "", "", ...a.hypotheses.map(h => by[h.id].rank)]);
  return rows.map(r => r.map(q).join(",")).join("\n");
}

export const toJSON = a => JSON.stringify(a, null, 2);

export function download(text, filename, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const fileBase = a => slug(a.title);
export { RATING };
