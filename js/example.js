// A fictional worked example used by "Load the worked example".
import { blankAnalysis, newHypothesis, newEvidence, newMilestone } from "./model.js";

export function workedExample() {
  const a = blankAnalysis("Example: Riverside substation outage");
  a.question = "What caused the overnight outage at the (fictional) Riverside substation?";
  a.analyst = "Example analyst";
  const H = ["Equipment failure in an aging transformer", "Cyberattack on the control system", "Deliberate physical sabotage", "Lightning or storm damage"].map(newHypothesis);
  a.hypotheses = H;
  // [text, type, source, credibility, relevance, ratings for H1..H4]
  const rows = [
    ["Outage began at 2:14 a.m. during a storm with 60 mph gusts", "Report", "Utility dispatch log", "H", "M", ["C", "N", "N", "CC"]],
    ["The failed transformer was 46 years old, past its rated service life", "Fact", "Asset register", "H", "M", ["CC", "N", "N", "C"]],
    ["Control-system logs show no unusual logins in the 30 days before", "Fact", "IT security review", "M", "H", ["C", "I", "C", "C"]],
    ["Fence on the north side of the substation was found cut", "Report", "Site crew", "M", "H", ["N", "N", "CC", "N"]],
    ["The same fence damage was noted in an inspection three weeks earlier", "Fact", "Inspection report", "H", "H", ["C", "N", "I", "C"]],
    ["No group has claimed responsibility", "Absence of evidence", "Media monitoring", "M", "L", ["C", "C", "C", "C"]],
    ["Oil residue and scorch marks match an internal transformer fault", "Report", "Utility engineer", "M", "H", ["CC", "C", "I", "C"]],
    ["A lightning strike was detected within 2 km at 2:13 a.m.", "Fact", "Lightning detection network", "H", "H", ["C", "N", "N", "CC"]],
    ["Surge arresters at the substation recorded no lightning surge", "Fact", "Substation telemetry", "M", "H", ["C", "N", "N", "I"]],
    ["Causing a transformer fault remotely would require insider knowledge", "Assumption", "Analyst judgment", "L", "M", ["N", "I", "N", "N"]],
    ["Two other substations on the same control network were unaffected", "Fact", "Grid operator", "H", "M", ["C", "I", "C", "C"]]
  ];
  for (const [text, type, source, credibility, relevance, rs] of rows) {
    const e = newEvidence(text, { type, source, credibility, relevance });
    a.evidence.push(e);
    rs.forEach((r, i) => { a.ratings[`${e.id}|${H[i].id}`] = r; });
  }
  a.conclusion = "Equipment failure is the least inconsistent hypothesis: no evidence argues against it. Storm damage is close behind, and the case against it rests mainly on the surge-arrester data. If that telemetry is wrong, the two hypotheses tie, and a lightning-triggered failure of an old transformer becomes likely. A cyberattack and sabotage each conflict with several reliable items and are unlikely.";
  a.milestones = [
    "Lab analysis of the transformer oil shows external surge damage (would support storm damage)",
    "A forensic review finds tampering in the control-system logs (would reopen the cyberattack hypothesis)",
    "Similar faults appear in other transformers of the same age and model (would support equipment failure)"
  ].map(newMilestone);
  return a;
}
