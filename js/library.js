// Case library: renders data/*.json into searchable sections. Routing by hash: #timeline, #theories, ...
// A section can carry a search in the hash: #timeline/q=Ruby
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const norm = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const terms = q => norm(q).split(/\s+/).filter(Boolean);
const matches = (text, ts) => { const t = norm(text); return ts.every(w => t.includes(w)); };
// Highlight search terms inside already-escaped text (accent-insensitive by matching on a normalized copy)
function mark(html, ts) {
  if (!ts.length) return html;
  const n = norm(html), hits = [];
  for (const w of ts) for (let i = n.indexOf(w); i >= 0; i = n.indexOf(w, i + w.length)) hits.push([i, i + w.length]);
  if (!hits.length) return html;
  hits.sort((a, b) => a[0] - b[0]);
  let out = "", at = 0;
  for (const [s, e] of hits) {
    if (s < at) continue;
    // don't highlight inside an entity such as &amp;
    const before = html.slice(Math.max(0, s - 6), s);
    if (/&[a-z#0-9]*$/i.test(before)) continue;
    out += html.slice(at, s) + "<mark>" + html.slice(s, e) + "</mark>"; at = e;
  }
  return out + html.slice(at);
}

const SECTIONS = [["timeline", "Timeline"], ["theories", "Theories"], ["people", "People"], ["questions", "20 Key Questions"], ["readings", "Readings"], ["glossary", "Cryptonyms & documents"], ["books", "Books"]];
const MONTHS = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];
const fmtDate = d => { const [y, m, day] = d.split("-").map(Number); return `${MONTHS[m - 1]} ${day}, ${y}`; };
const load = f => fetch("data/" + f, { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(f); return r.json(); });

let D = {}, hyp = {};
const rendered = new Set();

async function start() {
  try {
    const [timeline, theories, people, questions, readings, glossary, books, a, b] = await Promise.all([
      load("timeline.json"), load("theories.json"), load("people.json"), load("questions.json"), load("readings.json"), load("glossary.json"), load("books.json"),
      fetch("analyses/a-who-fired.json").then(r => r.json()).catch(() => null), fetch("analyses/b-who-was-behind-it.json").then(r => r.json()).catch(() => null)
    ]);
    D = { timeline, theories, people, questions, readings, glossary, books };
    for (const an of [a, b]) for (const h of an?.hypotheses || []) hyp[h.id] = h.text;
    $("status").textContent = "";
  } catch (err) {
    $("status").textContent = "Couldn't load the library data. Try reloading.";
    return;
  }
  $("tabs").innerHTML = SECTIONS.map(([k, l]) => `<a href="#${k}" data-sec="${k}">${l}</a>`).join(" / ");
  addEventListener("hashchange", route);
  route();
}

function route() {
  const [sec, arg] = (location.hash.slice(1) || "timeline").split("/");
  const s = SECTIONS.some(x => x[0] === sec) ? sec : "timeline";
  for (const [k] of SECTIONS) $("sec-" + k).hidden = k !== s;
  for (const a of $("tabs").querySelectorAll("a")) a.classList.toggle("on", a.dataset.sec === s);
  if (!rendered.has(s)) { RENDER[s](); rendered.add(s); }
  const q = new URLSearchParams(arg || "").get("q");
  const box = { timeline: "t-q", theories: "th-q", people: "p-q", glossary: "g-q", books: "b-q" }[s];
  if (q != null && box) { $(box).value = q; $(box).dispatchEvent(new Event("input")); }
  if (q != null) scrollTo(0, 0);
}
const hypLabel = id => `<span class="hyp" title="${esc(hyp[id] || "")}">${esc(id.startsWith("ha") ? "A" : "B")}: ${esc(hyp[id] || id)}</span>`;

// ---- Timeline -------------------------------------------------------------------------------
const PAGE = 150;
let tShown = PAGE;
const PEOPLE_CHIPS = ["Oswald", "Ruby", "Veciana", "Bishop", "Phillips", "Morales", "Hunt", "Sturgis", "de Mohrenschildt", "Ferrie", "Banister", "Odio", "Kostikov", "Castro", "Attwood", "Helms", "Hoover", "Garrison", "Roselli", "Trafficante", "Harvey", "FitzGerald", "AM/LASH"];
function renderTimeline() {
  const E = D.timeline.entries;
  const years = [...new Set(E.map(e => e[1].slice(0, 4)))];
  const periods = [["", "All years"], ["1947-1960", "1947–1960"], ["1961-1962", "1961–1962"], ["1963-1963", "1963"], ["1963-11", "November 1963"], ["1964-1969", "1964–1969"], ["1970-1979", "1970s"], ["1980-1999", "1980s"]];
  $("t-period").innerHTML = periods.filter(([v]) => !v || v.length === 7 || years.some(y => y >= v.slice(0, 4) && y <= v.slice(5))).map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
  $("t-people").innerHTML = `<span class="muted">People:</span> ` + PEOPLE_CHIPS.map(p => `<button class="chip" data-q="${esc(p)}">${esc(p)}</button>`).join(" ");
  $("t-people").addEventListener("click", e => { const b = e.target.closest("[data-q]"); if (!b) return; $("t-q").value = $("t-q").value === b.dataset.q ? "" : b.dataset.q; tShown = PAGE; drawTimeline(); });
  for (const id of ["t-q", "t-period", "t-src"]) $(id).addEventListener("input", () => { tShown = PAGE; drawTimeline(); });
  $("t-more").addEventListener("click", () => { tShown += PAGE * 2; drawTimeline(); });
  drawTimeline();
}
function drawTimeline() {
  const ts = terms($("t-q").value), per = $("t-period").value, src = $("t-src").value;
  const inPeriod = d => !per || (per.length === 7 ? d.startsWith(per) : d.slice(0, 4) >= per.slice(0, 4) && d.slice(0, 4) <= per.slice(5));
  const byId = /^[cx]\d{3,4}$/.test($("t-q").value.trim()) ? $("t-q").value.trim() : "";   // a permalink
  const list = byId ? D.timeline.entries.filter(e => e[0] === byId)
    : D.timeline.entries.filter(e => inPeriod(e[1]) && (!src || e[5] === src) && matches(e[4] + " " + e[6], ts));
  for (const b of $("t-people").querySelectorAll("[data-q]")) b.classList.toggle("on", norm($("t-q").value) === norm(b.dataset.q));
  const S = D.timeline.sources;
  $("t-count").textContent = `${list.length} ${list.length === 1 ? "entry" : "entries"}` + (D.timeline.entries.some(e => e[5] === "X") ? "" : " · Extended Chronology (minute-by-minute, Nov. 1963) coming next");
  let lastYear = "";
  $("t-list").innerHTML = list.slice(0, tShown).map(([id, date, time, page, text, s, tag]) => {
    const y = date.slice(0, 4), head = y !== lastYear ? `<li class="year" aria-hidden="true">${y}</li>` : "";
    lastYear = y;
    return head + `<li id="${id}"><div class="when">${fmtDate(date)}${time ? `<br><span class="muted">${esc(time)}</span>` : ""}</div>
      <div class="what">${mark(esc(text), ts)}<div class="cite">${esc(S[s].name)}, p. ${page}${tag ? ` · source tag ${esc(tag)}` : ""} · <a href="#timeline" data-copy="${id}" title="Link to this entry">#</a></div></div></li>`;
  }).join("");
  $("t-more").hidden = list.length <= tShown;
  $("t-more").textContent = `Show more (${list.length - tShown} left)`;
}

// ---- Theories -------------------------------------------------------------------------------
function renderTheories() {
  const T = D.theories;
  $("th-intro").innerHTML = `<p class="lede">${esc(T.intro)}</p><p class="muted">Each theory is linked to the hypotheses it bears on in the two analyses: <b>A</b> = who fired the shots, <b>B</b> = who was behind it.</p>`;
  $("th-theses").innerHTML = T.theses.map(t => `<li><h3>${t.n}. ${esc(t.name)}</h3><p>${esc(t.summary)}</p>
    <p class="small">${t.hypotheses.map(hypLabel).join(" ")} <span class="muted">· syllabus p. ${t.page}</span></p></li>`).join("");
  const hs = [...new Set(T.primer.flatMap(p => p.hypotheses))].sort();
  $("th-h").innerHTML += hs.map(h => `<option value="${h}">${esc((h.startsWith("ha") ? "A: " : "B: ") + (hyp[h] || h))}</option>`).join("") + `<option value="none">No hypothesis (fringe)</option>`;
  const draw = () => {
    const ts = terms($("th-q").value), h = $("th-h").value;
    const list = T.primer.filter(p => (!h || (h === "none" ? !p.hypotheses.length : p.hypotheses.includes(h))) && matches([p.name, p.proponents, p.claim, p.selling, p.drawback].join(" "), ts));
    $("th-count").textContent = `${list.length} of ${T.primer.length}`;
    $("th-primer").innerHTML = list.map(p => `<li><h3>${p.n}. ${mark(esc(p.name), ts)}</h3>
      <p class="muted small">${mark(esc(p.proponents), ts)}</p><p>${mark(esc(p.claim), ts)}</p>
      ${p.selling ? `<p><b>For it:</b> ${mark(esc(p.selling), ts)}</p>` : ""}${p.drawback ? `<p><b>Against it:</b> ${mark(esc(p.drawback), ts)}</p>` : ""}
      <p class="small">${p.hypotheses.map(hypLabel).join(" ") || `<span class="muted">Not tested in the matrices</span>`} <span class="muted">· primer p. ${p.page}</span></p></li>`).join("");
  };
  $("th-q").addEventListener("input", draw); $("th-h").addEventListener("input", draw);
  draw();
}

// ---- People ---------------------------------------------------------------------------------
const surname = n => n.replace(/\s*\(.*?\)|"[^"]*"/g, "").trim().split(/\s+/).filter(w => !/^(Jr\.|Sr\.)$/.test(w)).pop();
function renderPeople() {
  const P = D.people;
  $("p-intro").innerHTML = `<p class="lede">${esc(P.intro)}</p>`;
  const draw = () => {
    const ts = terms($("p-q").value);
    $("p-list").innerHTML = Object.entries(P.groups).map(([g, label]) => {
      const list = P.people.filter(p => p.group === g && matches([p.name, p.role, p.summary].join(" "), ts));
      return list.length ? `<h2>${esc(label)}</h2><dl class="people">${list.map(p => `<dt>${mark(esc(p.name), ts)} <span class="muted">· ${mark(esc(p.role), ts)}</span></dt>
        <dd>${mark(esc(p.summary), ts)} <span class="small"><a href="#timeline/q=${encodeURIComponent(surname(p.name))}">Timeline</a> <span class="muted">· cast p. ${p.page}</span></span></dd>`).join("")}</dl>` : "";
    }).join("") || `<p class="muted">No one matches.</p>`;
  };
  $("p-q").addEventListener("input", draw);
  draw();
}

// ---- Questions ------------------------------------------------------------------------------
function renderQuestions() {
  const Q = D.questions;
  $("q-intro").innerHTML = `<p class="lede">${esc(Q.intro)}</p>`;
  $("q-list").innerHTML = Q.questions.map(q => `<li value="${q.n}"><p>${esc(q.q)}</p>
    ${q.people ? `<p class="small">${q.people.map(p => `<a href="#timeline/q=${encodeURIComponent(surname(p))}">${esc(p)}</a>`).join(", ")}</p>` : ""}
    <p class="small">${q.search ? `<a href="#timeline/q=${encodeURIComponent(q.search)}">Timeline: “${esc(q.search)}”</a> · ` : ""}${q.link ? `<a href="#${q.link}">See the theories</a> · ` : ""}<a href="./">Matrix ${q.matrix === "a" ? "A, who fired" : "B, who was behind it"}</a></p></li>`).join("");
}

// ---- Readings -------------------------------------------------------------------------------
function renderReadings() {
  const R = D.readings;
  $("r-intro").innerHTML = `<p class="lede">${esc(R.intro)}</p>`;
  $("r-list").innerHTML = R.readings.map(r => `<article class="reading col" id="${r.id}"><h2>${esc(r.title)}</h2>
    <p class="muted">${esc(r.author)} · <i>${esc(r.pub)}</i> · ${esc(r.kind)}</p><p>${esc(r.summary)}</p>
    <ul>${r.points.map(p => `<li>${esc(p)}</li>`).join("")}</ul>
    <p class="small"><b>How it's used here:</b> ${esc(r.evidence)}${r.bears_on.length ? " " + r.bears_on.map(hypLabel).join(" ") : ""}</p></article>`).join("");
}

// ---- Glossary -------------------------------------------------------------------------------
function renderGlossary() {
  const G = D.glossary;
  $("g-intro").innerHTML = `<p class="lede">${esc(G.intro)}</p>`;
  $("g-docs-intro").innerHTML = `<p>${esc(G.documents_intro)}</p>`;
  $("g-docs").innerHTML = G.documents.map(d => `<tr><td class="nowrap">${fmtDate(d.date)}</td><td>${esc(d.from)} → ${esc(d.to)}</td><td>${esc(d.summary)} <span class="muted small">p. ${d.page}</span></td></tr>`).join("");
  const draw = () => {
    const ts = terms($("g-q").value);
    const c = G.cryptonyms.filter(x => matches(x.code + " " + x.meaning, ts)), a = G.aliases.filter(x => matches(x.name + " " + x.aliases, ts));
    $("g-codes").innerHTML = c.map(x => `<tr><td class="code">${mark(esc(x.code), ts)}</td><td>${mark(esc(x.meaning), ts)}</td></tr>`).join("") || `<tr><td colspan="2" class="muted">None match.</td></tr>`;
    $("g-aliases").innerHTML = a.map(x => `<tr><td>${mark(esc(x.name), ts)}</td><td>${mark(esc(x.aliases), ts)}</td></tr>`).join("") || `<tr><td colspan="2" class="muted">None match.</td></tr>`;
  };
  $("g-q").addEventListener("input", draw);
  draw();
}

// ---- Books ----------------------------------------------------------------------------------
function renderBooks() {
  const B = D.books;
  $("b-intro").innerHTML = `<p class="lede">${esc(B.intro)}</p>`;
  const draw = () => {
    const ts = terms($("b-q").value);
    const list = B.books.filter(b => matches(b.cite, ts));
    $("b-count").textContent = `${list.length} of ${B.books.length}`;
    $("b-list").innerHTML = list.map(b => `<li>${mark(esc(b.cite), ts)} <span class="muted small">· list ${b.list}</span></li>`).join("");
  };
  $("b-q").addEventListener("input", draw);
  draw();
}

const RENDER = { timeline: renderTimeline, theories: renderTheories, people: renderPeople, questions: renderQuestions, readings: renderReadings, glossary: renderGlossary, books: renderBooks };

// "#" links on timeline entries copy a permalink
document.addEventListener("click", e => {
  const a = e.target.closest("[data-copy]");
  if (!a) return;
  e.preventDefault();
  const url = location.href.split("#")[0] + "#timeline/q=" + encodeURIComponent(a.dataset.copy);
  navigator.clipboard?.writeText(url).then(() => { $("status").textContent = "Link copied."; setTimeout(() => $("status").textContent = "", 2000); }, () => {});
});

start();
