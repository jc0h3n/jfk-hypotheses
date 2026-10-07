import {
  RATINGS, RATING, LEVELS, LEVEL_LABEL, EVIDENCE_TYPES, blankAnalysis, newHypothesis, newEvidence, newMilestone,
  cellKey, ratingOf, ranking, diagnosticity, DIAG_LABEL, sensitivity, checks, normalize, weightOf, round
} from "./model.js";
import { workedExample } from "./example.js";
import { toMarkdown, toCSV, toJSON, download, fileBase } from "./export.js";

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const RATING_HELP = {
  CC: "You'd strongly expect to see this if the hypothesis were true.",
  C: "This fits the hypothesis.",
  N: "Neither supports nor argues against the hypothesis.",
  NA: "Doesn't bear on this hypothesis.",
  I: "You wouldn't expect to see this if the hypothesis were true.",
  II: "Very hard to reconcile with the hypothesis."
};

// ---- Storage (this browser only) ------------------------------------------------------------
// Its own storage, so this site and Open ACH (both on jc0h3n.github.io) never mix saved analyses
const KEY = "jfk-hypotheses:";
const store = {
  get(k) { try { const v = localStorage.getItem(KEY + k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set(k, v) { try { localStorage.setItem(KEY + k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(KEY + k); } catch {} }
};
const index = () => store.get("index") || [];
function listSaved() { return index().map(id => store.get("a:" + id)).filter(Boolean).sort((x, y) => y.updated.localeCompare(x.updated)); }

let A = null;                 // the open analysis
let view = "analyses";
let order = "entered";
const open = new Set();       // evidence rows with details expanded
let saveTimer = null;

function save(now = false) {
  if (!A) return;
  clearTimeout(saveTimer);
  const run = () => {
    A.updated = new Date().toISOString();
    const ok = store.set("a:" + A.id, A);
    if (ok) {
      const ids = index(); if (!ids.includes(A.id)) store.set("index", [A.id, ...ids]);
      store.set("last", A.id);
      status(`Saved in this browser at ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`);
    } else status("This browser isn't letting the app save. Use Export → Analysis file to keep your work.", true);
  };
  now ? run() : (saveTimer = setTimeout(run, 400));
}
const status = (text, warn) => { $("status").textContent = text; $("status").style.color = warn ? "var(--warn)" : ""; };

let toastTimer;
function toast(text, undo) {
  const t = $("toast");
  t.innerHTML = `<span>${esc(text)}</span>${undo ? `<button class="link" id="undo">Undo</button>` : ""}`;
  t.hidden = false;
  if (undo) $("undo").onclick = () => { undo(); t.hidden = true; };
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 6000);
}
// Snapshot for undoing deletions
const snapshot = () => JSON.stringify(A);
const restore = s => { A = JSON.parse(s); save(true); render(); };

// ---- Navigation -----------------------------------------------------------------------------
function setView(v) {
  if ((v === "matrix" || v === "report") && !A) v = "analyses";
  view = v;
  for (const s of ["analyses", "matrix", "report", "guide"]) $("view-" + s).hidden = s !== v;
  render();
  history.replaceState(null, "", v === "analyses" ? location.pathname : "#" + v);
}
function renderNav() {
  const items = [["analyses", "Analyses"], ...(A ? [["matrix", "Matrix"], ["report", "Report"]] : []), ["guide", "Guide"]];
  $("nav").innerHTML = items.map(([k, l]) => `<button class="link${view === k ? " on" : ""}" data-view="${k}">${l}</button>`).join(" / ") + ` / <a href="library.html">Library</a>`;
}

// ---- Analyses list ----------------------------------------------------------------------------
function renderAnalyses() {
  const list = listSaved();
  $("saved").innerHTML = list.length ? list.map(a => `
    <li data-id="${esc(a.id)}">
      <div><button class="link" data-act="open">${esc(a.title || "Untitled analysis")}</button>
        <div class="meta">${a.hypotheses.length} hypotheses · ${a.evidence.length} items of evidence · updated ${new Date(a.updated).toLocaleDateString()}</div></div>
      <div class="ops"><button class="link" data-act="dup">Duplicate</button><button class="link" data-act="del">Delete</button></div>
    </li>`).join("") : `<li class="muted">Nothing yet. Start a new analysis or load the worked example.</li>`;
}
function openAnalysis(a, msg) {
  A = a; open.clear(); save(true); setView("matrix");
  if (msg) toast(msg);
}

// ---- Matrix ---------------------------------------------------------------------------------------
function orderedEvidence() {
  if (order !== "diag") return A.evidence;
  return [...A.evidence].sort((x, y) => (diagnosticity(A, y).spread ?? -1) - (diagnosticity(A, x).spread ?? -1));
}
const opt = (v, label, sel) => `<option value="${esc(v)}"${v === sel ? " selected" : ""}>${esc(label)}</option>`;

function renderMatrix() {
  $("a-title").value = A.title; $("a-question").value = A.question; $("a-analyst").value = A.analyst;
  document.querySelectorAll("[data-order]").forEach(b => b.classList.toggle("on", b.dataset.order === order));
  $("legend").innerHTML = RATINGS.map(r => `<span title="${esc(r.label)}"><i style="background:var(--r-${r.key.toLowerCase()})"></i>${r.key}</span>`).join("");
  const H = A.hypotheses;
  if (!H.length && !A.evidence.length) {
    $("matrix").innerHTML = `<p class="empty">Add at least two hypotheses and a few items of evidence above. Then rate each item against every hypothesis.</p>`;
    return;
  }
  const rank = Object.fromEntries(ranking(A).map(r => [r.h.id, r]));
  const head = `<tr><th class="ev">Evidence</th><th>Weight</th><th>Diagnostic</th>${H.map((h, i) => `
    <th class="hyp"><div class="hyp-head"><span>H${i + 1}</span><button class="link" data-act="del-h" data-id="${h.id}" aria-label="Delete hypothesis H${i + 1}">Delete</button></div>
    <textarea id="h-${h.id}" rows="2" aria-label="Hypothesis H${i + 1}">${esc(h.text)}</textarea></th>`).join("")}</tr>`;
  const rows = orderedEvidence().map(e => {
    const d = diagnosticity(A, e), n = A.evidence.indexOf(e) + 1;
    const more = open.has(e.id) ? `<div class="more">
      <label>Type<select id="ty-${e.id}">${EVIDENCE_TYPES.map(t => opt(t, t, e.type)).join("")}</select></label>
      <label>Source<input id="so-${e.id}" value="${esc(e.source)}"></label>
      <label>Date<input id="da-${e.id}" value="${esc(e.date)}" placeholder="e.g. 2026-03-14"></label>
      <label class="full">Notes<textarea id="no-${e.id}" rows="2">${esc(e.notes)}</textarea></label></div>` : "";
    return `<tr class="${e.excluded ? "excluded" : ""}">
      <td class="ev"><textarea id="e-${e.id}" rows="2" aria-label="Evidence ${n}">${esc(e.text)}</textarea>
        <div class="rowtools"><span class="muted">#${n} · ${esc(e.type)}${sourceHtml(e)}</span>
          <button class="link" data-act="more" data-id="${e.id}">${open.has(e.id) ? "Hide details" : "Details"}</button>
          <label><input type="checkbox" id="ex-${e.id}"${e.excluded ? "" : " checked"}> Use in scores</label>
          <button class="link" data-act="del-e" data-id="${e.id}">Delete</button></div>${more}</td>
      <td class="meta-cell">
        <label>Credibility<select id="cr-${e.id}" aria-label="Credibility of evidence ${n}">${LEVELS.map(l => opt(l, LEVEL_LABEL[l], e.credibility)).join("")}</select></label>
        <label>Relevance<select id="rl-${e.id}" aria-label="Relevance of evidence ${n}">${LEVELS.map(l => opt(l, LEVEL_LABEL[l], e.relevance)).join("")}</select></label>
        <span class="muted" title="Credibility × relevance">× ${round(weightOf(e))}</span></td>
      <td><span class="diag ${d.level}" title="Spread of ratings across hypotheses: ${d.spread ?? "n/a"}">${DIAG_LABEL[d.level]}</span></td>
      ${H.map((h, i) => { const r = ratingOf(A, e, h); return `<td class="cell r-${r}"><select id="c-${e.id}-${h.id}" title="${esc(r ? RATING[r].label : "Not rated")}" aria-label="Evidence ${n} against H${i + 1}">${opt("", "–", r)}${RATINGS.map(x => opt(x.key, x.key, r)).join("")}</select></td>`; }).join("")}
    </tr>`;
  }).join("");
  const foot = `<tr><th colspan="3">Weighted inconsistency <span class="muted">(lower is better)</span></th>${H.map(h => {
    const r = rank[h.id]; return `<td class="cell"><span class="score${r.rank === 1 && A.evidence.length ? " rank1" : ""}">${r.inconsistency}</span><div class="muted" style="font-size:.8em">rank ${r.rank}</div></td>`;
  }).join("")}</tr>`;
  $("matrix").innerHTML = `<table class="matrix"><thead>${head}</thead><tbody>${rows || `<tr><td colspan="${3 + H.length}" class="empty">No evidence yet.</td></tr>`}</tbody><tfoot>${foot}</tfoot></table>`;
}

function renderResults() {
  const el = $("results");
  if (A.hypotheses.length < 1) { el.innerHTML = `<p class="muted">Results appear here once you add hypotheses and rate evidence.</p>`; return; }
  const { base, critical, margin } = sensitivity(A);
  const max = Math.max(...base.map(r => r.inconsistency), 1);
  const nondiag = A.evidence.filter(e => !e.excluded && diagnosticity(A, e).level === "none");
  const label = h => `H${A.hypotheses.indexOf(h) + 1}: ${h.text || "(untitled)"}`;
  el.innerHTML = `
    <h3>Least to most inconsistent</h3>
    <ol class="rank-list">${base.map(r => `<li><div class="name"><span class="num">${r.rank}</span><span>${esc(label(r.h))}</span></div>
      <div class="bar-row"><div class="bar-track"><div class="bar" style="width:${(100 * r.inconsistency / max).toFixed(1)}%"></div></div><span class="bar-val">${r.inconsistency}</span></div></li>`).join("")}</ol>
    ${A.hypotheses.length > 1 ? `<h3>Sensitivity</h3>
      <p style="font-size:.88em">${margin ? `The leader is ahead by <b>${margin}</b> point${margin === 1 ? "" : "s"}.` : "The top hypotheses are tied."}
      ${critical.length ? ` If any of these items were removed, a different hypothesis would lead:` : ` No single item changes which hypothesis leads.`}</p>
      ${critical.length ? `<ul class="plain">${critical.map(c => `<li>${esc(c.e.text)} <span class="muted">→ ${c.newLeaders.length > 1 ? `${c.newLeaders.map(h => "H" + (A.hypotheses.indexOf(h) + 1)).join(" and ")} would tie` : `H${A.hypotheses.indexOf(c.newLeaders[0]) + 1} would lead`}</span></li>`).join("")}</ul>` : ""}` : ""}
    ${nondiag.length ? `<h3>Not diagnostic</h3><p style="font-size:.85em" class="muted">Rated the same against every hypothesis, so it can't help you choose:</p><ul class="plain">${nondiag.map(e => `<li>${esc(e.text)}</li>`).join("")}</ul>` : ""}
    <p class="note">Each Inconsistent rating counts 1 and each Very inconsistent rating counts 2, times credibility × relevance (Low 0.5, Medium 1, High 1.5). See the Guide.</p>`;
}

function renderChecks() {
  const list = checks(A);
  const left = list.filter(c => !c.done).length;
  $("checks").querySelector("summary").textContent = left ? `Next steps (${8 - left} of 8 done)` : "All eight steps done";
  $("checks-list").innerHTML = list.map(c => `<li class="${c.done ? "done" : ""}"><span class="stepno">${c.done ? "✓" : ""} Step ${c.step}</span><span><b>${esc(c.title)}</b>${c.done ? "" : `<br>${esc(c.text)}`}</span></li>`).join("");
}

// Public sources as links when the item has them (published analyses do); otherwise the typed source text
function sourceHtml(e) {
  const links = (e.links || []).filter(l => Array.isArray(l) && String(l[1]).startsWith("https://"));
  if (links.length) return " · " + links.map(([label, url]) => `<a href="${esc(url)}" target="_blank" rel="noopener" title="Check this source">${esc(label.replace(/^Wikipedia: /, "Wikipedia, "))}</a>`).join("; ")
    + (e.source.split(/;\s*/).filter(s => !links.some(l => l[0].replace(/^Wikipedia: /, "Wikipedia, ") === s)).map(s => "; " + esc(s)).join(""));
  return e.source ? " · " + esc(e.source) : "";
}

// ---- Report -----------------------------------------------------------------------------------------
function mdToHtml(md) {
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\\\|/g, "|");
  const out = []; const lines = md.split("\n"); let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^# /.test(l)) { out.push(`<h1>${inline(l.slice(2))}</h1>`); i++; }
    else if (/^## /.test(l)) { out.push(`<h2>${inline(l.slice(3))}</h2>`); i++; }
    else if (/^\|/.test(l)) {
      const rows = []; while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = r => r.replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map(c => c.trim());
      out.push(`<table><thead><tr>${cells(rows[0]).map(c => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.slice(2).map(r => `<tr>${cells(r).map(c => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
    } else if (/^- /.test(l)) {
      const items = []; while (i < lines.length && /^- /.test(lines[i])) items.push(lines[i++].slice(2));
      out.push(`<ul>${items.map(x => `<li>${inline(x)}</li>`).join("")}</ul>`);
    } else if (l === "---") { out.push("<hr>"); i++; }
    else if (!l.trim()) i++;
    else { const p = []; while (i < lines.length && lines[i].trim() && !/^(#|\||- |---)/.test(lines[i])) p.push(lines[i++]); out.push(`<p>${p.map(inline).join("<br>")}</p>`); }
  }
  return out.join("\n");
}
function renderReport() {
  $("a-conclusion").value = A.conclusion;
  $("milestones").innerHTML = A.milestones.map(m => `<li><span>${esc(m.text)}</span><button class="link" data-act="del-m" data-id="${m.id}">Remove</button></li>`).join("") || `<li class="muted">None yet.</li>`;
  $("report").innerHTML = mdToHtml(toMarkdown(A));
}

// ---- Render with focus kept -----------------------------------------------------------------------
function render() {
  renderNav();
  const active = document.activeElement, id = active && active.id, pos = active && "selectionStart" in active ? [active.selectionStart, active.selectionEnd] : null;
  if (view === "analyses") renderAnalyses();
  if (view === "matrix" && A) { renderMatrix(); renderResults(); renderChecks(); }
  if (view === "report" && A) renderReport();
  if (id && $(id) && $(id) !== active) { $(id).focus(); if (pos && $(id).setSelectionRange) try { $(id).setSelectionRange(...pos); } catch {} }
}
const refreshScores = () => { renderResults(); renderChecks(); };

// ---- Events ---------------------------------------------------------------------------------------------
document.addEventListener("click", e => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.view) return setView(t.dataset.view);
  if (t.dataset.order) { order = t.dataset.order; return render(); }
  if (t.dataset.export) {
    const base = fileBase(A);
    if (t.dataset.export === "md") download(toMarkdown(A), `${base}.md`, "text/markdown");
    if (t.dataset.export === "csv") download(toCSV(A), `${base}.csv`, "text/csv");
    if (t.dataset.export === "json") download(toJSON(A), `${base}.ach.json`, "application/json");
    return;
  }
  const act = t.dataset.act; if (!act) return;
  const li = t.closest("li[data-id]");
  if (act === "open") { const a = store.get("a:" + li.dataset.id); if (a) openAnalysis(normalize(a)); }
  if (act === "dup") { const a = normalize(store.get("a:" + li.dataset.id)); const copy = { ...a, id: blankAnalysis().id, title: a.title + " (copy)" }; store.set("a:" + copy.id, copy); store.set("index", [copy.id, ...index()]); renderAnalyses(); toast("Duplicated."); }
  if (act === "del") {
    const id = li.dataset.id, a = store.get("a:" + id);
    store.del("a:" + id); store.set("index", index().filter(x => x !== id));
    if (A && A.id === id) A = null;
    renderAnalyses(); renderNav();
    toast(`Deleted “${a?.title || "analysis"}”.`, () => { store.set("a:" + id, a); store.set("index", [id, ...index()]); renderAnalyses(); });
  }
  if (act === "del-h") { const s = snapshot(), h = A.hypotheses.find(x => x.id === t.dataset.id); A.hypotheses = A.hypotheses.filter(x => x !== h); for (const k of Object.keys(A.ratings)) if (k.endsWith("|" + h.id)) delete A.ratings[k]; save(); render(); toast("Hypothesis deleted.", () => restore(s)); }
  if (act === "del-e") { const s = snapshot(); A.evidence = A.evidence.filter(x => x.id !== t.dataset.id); for (const k of Object.keys(A.ratings)) if (k.startsWith(t.dataset.id + "|")) delete A.ratings[k]; save(); render(); toast("Evidence deleted.", () => restore(s)); }
  if (act === "more") { open.has(t.dataset.id) ? open.delete(t.dataset.id) : open.add(t.dataset.id); render(); }
  if (act === "del-m") { A.milestones = A.milestones.filter(m => m.id !== t.dataset.id); save(); render(); }
});

$("new").onclick = () => openAnalysis(blankAnalysis());
$("example").onclick = () => openAnalysis(workedExample(), "Loaded the worked example. It's fictional, so edit freely.");
$("open-file").onchange = async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    const a = normalize(JSON.parse(await f.text()));
    if (store.get("a:" + a.id)) { a.id = blankAnalysis().id; a.title += " (opened copy)"; }
    $("open-error").hidden = true; openAnalysis(a, `Opened ${f.name}.`);
  } catch (err) { $("open-error").textContent = `Couldn't open ${f.name}: ${err.message.includes("JSON") ? "it isn't a valid analysis file." : err.message}`; $("open-error").hidden = false; }
};

$("add-h").onsubmit = e => {
  e.preventDefault(); const v = $("h-text").value.trim(); if (!v) return;
  A.hypotheses.push(newHypothesis(v)); $("h-text").value = ""; save(); render(); $("h-text").focus();
};
$("add-e").onsubmit = e => {
  e.preventDefault(); const lines = $("e-text").value.split("\n").map(s => s.trim()).filter(Boolean); if (!lines.length) return;
  for (const l of lines) A.evidence.push(newEvidence(l)); $("e-text").value = ""; save(); render(); $("e-text").focus();
  if (lines.length > 1) toast(`Added ${lines.length} items of evidence.`);
};
$("e-text").addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) $("add-e").requestSubmit(); });
$("add-m").onsubmit = e => { e.preventDefault(); const v = $("m-text").value.trim(); if (!v) return; A.milestones.push(newMilestone(v)); $("m-text").value = ""; save(); render(); $("m-text").focus(); };

for (const [id, key] of [["a-title", "title"], ["a-question", "question"], ["a-analyst", "analyst"], ["a-conclusion", "conclusion"]])
  $(id).addEventListener("input", e => { A[key] = e.target.value; save(); if (key === "conclusion") refreshScores(); });
$("a-conclusion").addEventListener("change", () => renderReport());

// Matrix edits: text updates the model quietly; selects re-render so scores and colors follow
$("matrix").addEventListener("input", e => {
  const [kind, id] = e.target.id.split(/-(.+)/);
  if (kind === "h") { A.hypotheses.find(h => h.id === id).text = e.target.value; save(); renderResults(); }
  else if (kind === "e") { A.evidence.find(x => x.id === id).text = e.target.value; save(); }
  else if (["so", "da", "no"].includes(kind)) { A.evidence.find(x => x.id === id)[{ so: "source", da: "date", no: "notes" }[kind]] = e.target.value; save(); }
});
$("matrix").addEventListener("change", e => {
  const el = e.target, [kind, rest] = el.id.split(/-(.+)/);
  if (kind === "c") { const [eid, hid] = [rest.slice(0, rest.indexOf("-")), rest.slice(rest.indexOf("-") + 1)]; const k = `${eid}|${hid}`; el.value ? (A.ratings[k] = el.value) : delete A.ratings[k]; }
  else if (kind === "cr") A.evidence.find(x => x.id === rest).credibility = el.value;
  else if (kind === "rl") A.evidence.find(x => x.id === rest).relevance = el.value;
  else if (kind === "ty") A.evidence.find(x => x.id === rest).type = el.value;
  else if (kind === "ex") A.evidence.find(x => x.id === rest).excluded = !el.checked;
  else return;
  save(); render();
});

// Guide: rating definitions
$("rating-defs").innerHTML = RATINGS.map(r => `<dt><span style="background:var(--r-${r.key.toLowerCase()})">${r.key}</span> ${esc(r.label)}</dt><dd>${esc(RATING_HELP[r.key])}</dd>`).join("");

// ---- Published analyses ----------------------------------------------------------------------------------
// The site's own analyses live in analyses/ (listed in manifest.json). A visitor gets the latest published version;
// if they had edited their copy since, their edits are kept as a separate analysis rather than overwritten.
// Content without timestamps: opening an analysis re-saves it, so timestamps alone can't tell real edits apart
const fingerprint = a => JSON.stringify({ ...normalize(a), updated: "", created: "" });
async function loadPublished() {
  let files = [];
  try { files = await (await fetch("analyses/manifest.json", { cache: "no-cache" })).json(); } catch { return; }
  const seen = store.get("published") || {};          // id → { updated, fp } of the published version last loaded
  for (const file of files) {
    let a;
    try { a = normalize(await (await fetch("analyses/" + file, { cache: "no-cache" })).json()); } catch { continue; }
    const local = store.get("a:" + a.id), was = seen[a.id];
    if (local && was?.updated === a.updated) continue;  // already have this version
    if (local && was && fingerprint(local) !== was.fp) {      // the visitor changed it: keep their version as a copy
      const copy = { ...local, id: blankAnalysis().id, title: local.title + " (your edits)" };
      store.set("a:" + copy.id, copy); store.set("index", [copy.id, ...index()]);
    }
    store.set("a:" + a.id, a);
    if (!index().includes(a.id)) store.set("index", [...index(), a.id]);
    seen[a.id] = { updated: a.updated, fp: fingerprint(a) };
  }
  store.set("published", seen);
}
await loadPublished();

// ---- Start ---------------------------------------------------------------------------------------------
const last = store.get("last"), saved = last && store.get("a:" + last);
if (saved) { try { A = normalize(saved); } catch { A = null; } }
const start = location.hash.slice(1);
setView(["matrix", "report", "guide"].includes(start) ? start : A ? "matrix" : "analyses");
if (A) status("Your last analysis was reopened. Saved in this browser.");
