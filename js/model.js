// Analysis model and the math behind it. No DOM code here.

export const RATINGS = [
  { key: "CC", label: "Very consistent", value: 2 },
  { key: "C", label: "Consistent", value: 1 },
  { key: "N", label: "Neutral", value: 0 },
  { key: "NA", label: "Not applicable", value: null },
  { key: "I", label: "Inconsistent", value: -1 },
  { key: "II", label: "Very inconsistent", value: -2 }
];
export const RATING = Object.fromEntries(RATINGS.map(r => [r.key, r]));
export const LEVELS = ["L", "M", "H"];
export const LEVEL_LABEL = { L: "Low", M: "Medium", H: "High" };
export const LEVEL_WEIGHT = { L: 0.5, M: 1, H: 1.5 };
export const EVIDENCE_TYPES = ["Fact", "Report", "Assumption", "Absence of evidence", "Argument"];
export const FORMAT = "open-ach/1";

const uid = () => Math.random().toString(36).slice(2, 10);

export function blankAnalysis(title = "Untitled analysis") {
  const now = new Date().toISOString();
  return {
    format: FORMAT, id: uid(), title, question: "", analyst: "",
    created: now, updated: now,
    hypotheses: [], evidence: [], ratings: {}, conclusion: "", milestones: []
  };
}
export const newHypothesis = text => ({ id: uid(), text, notes: "" });
export const newEvidence = (text, extra = {}) => ({ id: uid(), text, source: "", type: "Fact", date: "", credibility: "M", relevance: "M", notes: "", excluded: false, ...extra });
export const newMilestone = text => ({ id: uid(), text });

export const cellKey = (e, h) => `${e.id}|${h.id}`;
export const ratingOf = (a, e, h) => a.ratings[cellKey(e, h)] || "";
export const weightOf = e => LEVEL_WEIGHT[e.credibility] * LEVEL_WEIGHT[e.relevance];

// Weighted inconsistency: I counts 1, II counts 2, times the evidence weight. Lower is better.
export function scores(a, { skip } = {}) {
  return a.hypotheses.map(h => {
    let inconsistency = 0, consistent = 0, inconsistent = 0, rated = 0;
    for (const e of a.evidence) {
      if (e.excluded || e.id === skip) continue;
      const r = ratingOf(a, e, h);
      if (!r) continue;
      rated++;
      if (r === "I" || r === "II") { inconsistency += (r === "II" ? 2 : 1) * weightOf(e); inconsistent++; }
      if (r === "C" || r === "CC") consistent++;
    }
    return { h, inconsistency: round(inconsistency), consistent, inconsistent, rated };
  });
}
export const round = x => Math.round(x * 100) / 100;

// Hypotheses ranked from least to most inconsistent; ties share a rank
export function ranking(a, opts) {
  const s = scores(a, opts).sort((x, y) => x.inconsistency - y.inconsistency);
  let rank = 0, prev = null;
  s.forEach((x, i) => { if (x.inconsistency !== prev) { rank = i + 1; prev = x.inconsistency; } x.rank = rank; });
  return s;
}
const leaders = r => r.filter(x => x.rank === 1).map(x => x.h.id).sort().join(",");

// Diagnosticity: spread of an item's ratings across hypotheses (CC=+2 … II=−2). 0 = tells nothing apart.
export function diagnosticity(a, e) {
  const vals = a.hypotheses.map(h => RATING[ratingOf(a, e, h)]?.value).filter(v => v !== null && v !== undefined);
  if (vals.length < 2) return { spread: null, level: "unrated" };
  const spread = Math.max(...vals) - Math.min(...vals);
  return { spread, level: spread === 0 ? "none" : spread === 1 ? "low" : spread === 2 ? "medium" : "high" };
}
export const DIAG_LABEL = { unrated: "Not yet rated", none: "Not diagnostic", low: "Low", medium: "Medium", high: "High" };

// Sensitivity: evidence whose removal changes which hypothesis is least inconsistent
export function sensitivity(a) {
  const base = ranking(a);
  if (a.hypotheses.length < 2) return { base, critical: [], margin: null };
  const baseLead = leaders(base);
  const critical = [];
  for (const e of a.evidence) {
    if (e.excluded) continue;
    const r = ranking(a, { skip: e.id });
    if (leaders(r) !== baseLead) critical.push({ e, newLeaders: r.filter(x => x.rank === 1).map(x => x.h) });
  }
  const distinct = [...new Set(base.map(x => x.inconsistency))];
  const margin = distinct.length > 1 ? round(distinct[1] - distinct[0]) : 0;
  return { base, critical, margin };
}

// Checks that map to Heuer's steps; shown as prompts, never as blockers
export function checks(a) {
  const out = [];
  const H = a.hypotheses.length, E = a.evidence.filter(e => !e.excluded).length;
  if (H < 2) out.push({ step: 1, text: "Add at least two hypotheses. ACH works by comparing them, so include ones you think are unlikely." });
  if (E < 3) out.push({ step: 2, text: "List more evidence, including assumptions and things you'd expect to see but don't." });
  const unrated = a.evidence.filter(e => !e.excluded).reduce((n, e) => n + a.hypotheses.filter(h => !ratingOf(a, e, h)).length, 0);
  if (H && E && unrated) out.push({ step: 3, text: `${unrated} cell${unrated === 1 ? " is" : "s are"} not rated yet. Work across each row, rating one item against every hypothesis.` });
  const nondiag = a.evidence.filter(e => !e.excluded && diagnosticity(a, e).level === "none");
  if (nondiag.length) out.push({ step: 4, text: `${nondiag.length} item${nondiag.length === 1 ? " doesn't" : "s don't"} help tell the hypotheses apart. Consider setting ${nondiag.length === 1 ? "it" : "them"} aside.` });
  if (H >= 2 && E >= 3 && !unrated) {
    const { critical } = sensitivity(a);
    if (critical.length) out.push({ step: 6, text: `Your leading hypothesis depends on ${critical.length} item${critical.length === 1 ? "" : "s"} of evidence. Check ${critical.length === 1 ? "its" : "their"} sources and whether ${critical.length === 1 ? "it" : "they"} could be wrong or deceptive.` });
  }
  if (H >= 2 && E >= 3 && !a.conclusion.trim()) out.push({ step: 7, text: "Write a conclusion that addresses every hypothesis, not just the leader." });
  if (H >= 2 && !a.milestones.length) out.push({ step: 8, text: "Add milestones: future events that would show your conclusion is wrong." });
  return out;
}

// Accepts files from this app; tolerates missing fields
export function normalize(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.hypotheses) || !Array.isArray(raw.evidence)) throw new Error("This file isn't an ACH analysis.");
  const a = { ...blankAnalysis(), ...raw };
  a.hypotheses = raw.hypotheses.map(h => ({ ...newHypothesis(""), ...h }));
  a.evidence = raw.evidence.map(e => ({ ...newEvidence(""), ...e }));
  a.ratings = Object.fromEntries(Object.entries(raw.ratings || {}).filter(([, v]) => RATING[v]));
  a.milestones = (raw.milestones || []).map(m => ({ ...newMilestone(""), ...m }));
  a.format = FORMAT;
  return a;
}
