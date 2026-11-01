// Automated checks for the planner engine. Runs many answer combinations and, after each run,
// checks every rule the plans are meant to follow. Usage: node tests/run-tests.js [runs] [seed]
const fs = require("fs"), path = require("path");
const site = path.join(__dirname, "..", "site");
const load = (f) => { const s = fs.readFileSync(path.join(site, f), "utf8"); return JSON.parse(s.slice(s.indexOf("=") + 1, s.lastIndexOf(";"))); };
const DATA = load("data.js"), RATINGS = load("ratings.js");
const P = require(path.join(site, "planner.js"));
const db = P.build(DATA);
const { CLASSES, COURSES } = db;

const RUNS = Number(process.argv[2] || 150);
let seed = Number(process.argv[3] || 12345);
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

const BASE = ["BAPHY105", "BAHUM101", "BACSE103", "BACSE104", "BACSE105", "BACSE106", "BAMAT205"];
const COURSE_SETS = [
  BASE, BASE.concat("BAESP101"), BASE.concat("BAFRE101"), BASE.filter((c) => c !== "BAHUM101"),
  ["BAPHY105", "BACSE103", "BACSE104", "BACSE105", "BACSE106", "BAMAT101"],
  ["BACHY105", "BAEEE101", "BAENG101", "BAMAT101", "BACSE101"],
  ["BACHY105", "BAEEE101", "BAENG101", "BAMAT101", "BACSE101", "BASTS102"],
  ["BACHY105", "BAEEE101", "BAENG101", "BAMAT101", "BACSE101", "BASTS102", "BAESP101"],
  ["BACHY105", "BAMAT101", "BAENG101", "BACLE105", "BACLE301"],
];
const ALL_FAC = [...new Set(BASE.flatMap((c) => COURSES[c].ids.map((i) => CLASSES[i].faculty)))];

const failures = [];
const layoutStats = [];
const topicStats = {};
const warnings = [];
let checks = 0;
const fail = (ctx, msg) => failures.push(`${ctx}: ${msg}`);
const ok = (cond, ctx, msg) => { checks++; if (!cond) fail(ctx, msg); };

function checkTimetable(ids, codes, prefs, res, ctx, facPrefs) {
  const ks = ids.map((i) => CLASSES[i]);
  ok(ks.every(Boolean), ctx, "unknown class id");
  // every course present, with the right parts
  codes.forEach((code) => {
    const c = COURSES[code];
    const mine = ks.filter((k) => k.code === code);
    if (c.embedded) {
      ok(mine.filter((k) => k.group === "th").length === 1 && mine.filter((k) => k.group === "lab").length === 1, ctx, `${code} should have one theory and one lab, has ${mine.map((k) => k.slots).join(",")}`);
      ok(new Set(mine.map((k) => k.faculty)).size === 1, ctx, `${code} theory and lab have different teachers`);
    } else ok(mine.length === 1, ctx, `${code} should have exactly one class, has ${mine.length}`);
  });
  ok(ks.every((k) => codes.includes(k.code)), ctx, "class from a course you didn't pick");
  // no clashes
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++)
    ok(!P.timesClash(ks[i].times, ks[j].times), ctx, `clash ${ks[i].code} ${ks[i].slots} x ${ks[j].code} ${ks[j].slots}`);
  const m = P.metrics(ks.flatMap((k) => k.times));
  const relaxed = res.relaxed.join(" | ");
  // hard rules (unless the planner said it had to drop them)
  if (prefs.prp === "all") ks.filter((k) => k.times.length && !k.prp).forEach((k) =>
    ok(res.noPRP.includes(k.code), ctx, `${k.code} ${k.slots} is outside PRP (${k.venue}) though PRP classes exist`));
  if (prefs.max8 < 9 && !/8 AM/.test(relaxed)) ok(m.earlyDays <= prefs.max8, ctx, `${m.earlyDays} days with 8 AM > ${prefs.max8}`);
  if (prefs.labs === "am" && !/morning labs/.test(relaxed)) ks.filter((k) => k.times.length && !res.amMiss.includes(k.code)).forEach((k) => {
    const want = k.group === "lab" ? "am" : "pm";
    ok(P.halfOf(k) === want, ctx, `${k.code} ${k.slots} is in the ${P.halfOf(k)} but morning labs means ${k.group === "lab" ? "labs in the morning" : "theory in the afternoon"}`);
  });
  // avoided teachers never used when another teacher was possible
  ks.forEach((k) => { if (facPrefs[k.faculty] && facPrefs[k.faculty].pref < 0) warnings.push(`${ctx}: avoided teacher ${k.faculty} used for ${k.code}`); });
  return m;
}

function runOne(r) {
  const codes = r < 6 ? COURSE_SETS[0] : pick(COURSE_SETS);
  const prefs = {
    max8: pick([0, 1, 1, 2, 9]), max9: pick([9, 9, 2, 3]), labs: pick(["am", "am", "any"]), labFree: pick([0, 1, 2, 2, 3]),
    maxLabs: pick([2, 2, 3, 9, 1]), labStretch: pick(["prefer", "any"]), lunchSkip: pick([0, 1, 1, 2, 99]),
    endBy: pick([99, 19, 18]), prp: pick(["all", "all", "hybrid"]),
  };
  if (r === 0) Object.assign(prefs, { max8: 1, max9: 9, labs: "am", labFree: 2, maxLabs: 2, labStretch: "prefer", lunchSkip: 1, endBy: 99, prp: "all" });
  const fac = {};
  if (rnd() < 0.5) for (let i = 0; i < 6; i++) fac[pick(ALL_FAC)] = { pref: pick([1, -1, 0]), rating: pick([0, 2, 4, 5]) };
  const ctx = `run ${r} ${JSON.stringify(prefs)} courses=${codes.join(",")}`;
  const t0 = Date.now();
  const res = P.plan(db, { codes, prefs, fac, comm: RATINGS.faculty, board: RATINGS.board, debug: true });
  const ms = Date.now() - t0;
  if (res.error) { warnings.push(`${ctx}: planner says "${res.error}"`); return { ms, error: true }; }
  ok(res.plans.length === P.PROFILES.length, ctx, `expected ${P.PROFILES.length} plans, got ${res.plans.length}`);
  const sigs = new Set();
  const mains = [];
  res.plans.forEach((p) => {
    const pc = `${ctx} [${p.profile.name}]`;
    p.options.forEach((o) => {
      checkTimetable(o.ids, codes, prefs, res, `${pc} ${o.label}`, fac);
      if (!p.sameTiming || o.label !== "Main") ok(!sigs.has(o.sig), pc, `${o.label} repeats a timetable shown elsewhere`);
      else warnings.push(`${pc}: only ${res.count} timetables exist, so this plan reuses a timing with other teachers`);
      sigs.add(o.sig);
    });
    mains.push(p.options[0]);
    const mainFac = new Set(p.options[0].ids.map((i) => CLASSES[i].faculty));
    const seen = new Set(mainFac);
    p.backups.forEach((b) => {
      if (b.missing) { warnings.push(`${pc}: ${b.label} not possible (teachers ran out)`); return; }
      checkTimetable(b.ids, codes, prefs, res, `${pc} ${b.label}`, fac);
      const bf = b.ids.map((i) => CLASSES[i].faculty);
      const reused = b.ids.map((i) => CLASSES[i]).filter((k) => seen.has(k.faculty) && !(b.kept || []).includes(k.code));
      ok(!reused.length, pc, `${b.label} reuses a teacher from an earlier plan: ${reused.map((k) => k.faculty).join(", ")}`);
      (b.kept || []).forEach((c) => ok(COURSES[c].options.every((o) => o.some((i) => seen.has(CLASSES[i].faculty))), pc, `${b.label} kept ${c}'s teacher though another was free`));
      bf.forEach((f) => seen.add(f));
    });
    const v2 = p.options.find((o) => o.label === "Variation 2");
    if (v2) ok(v2.changed.length >= 1 && v2.changed.length <= 2, pc, `Variation 2 changes ${v2.changed.length} courses`);
    ok(!p.options.some((o) => /Evening/.test(o.label)), pc, "evening-labs variation should be gone");
    if (prefs.labs === "am") ok(!p.options.some((o) => o.label === "Morning labs"), pc, "morning-labs variation is redundant when you already chose morning labs");
  });
  // the six plans must differ
  const D = res.debug;
  const solOf = new Map(D.sols.map((s) => [s.sig, s]));
  const mainSols = res.plans.map((p) => solOf.get(p.options[0].sig.split("~")[0]));
  let minApart = 99;
  for (let i = 0; i < mainSols.length; i++) for (let j = i + 1; j < mainSols.length; j++)
    if (!res.plans[i].sameTiming && !res.plans[j].sameTiming) minApart = Math.min(minApart, D.diffCount(mainSols[i], mainSols[j]));
  ok(minApart >= 1 || D.sols.length < res.plans.length, ctx, "two plans are the same timetable");
  if (minApart < 2 && D.sols.length > 50) warnings.push(`${ctx}: two plans differ in only ${minApart} course(s) though ${D.sols.length} timetables exist`);
  // plans 1-4 must keep your lab split whenever some timetable can
  const bestSplit = D.sols.reduce((a, s) => Math.min(a, s.split), Infinity);
  mainSols.slice(0, 4).forEach((s, i) => ok(!(bestSplit === 0 && s.split > 0), ctx, `plan ${i + 1} breaks your lab split/lab-free days (${s.layout}) though it was possible`));
  // every plan should have its own lab layout when enough layouts exist
  const layouts = new Set(D.sols.map((s) => s.layout));
  const mainLayouts = new Set(mainSols.map((s) => s.layout));
  if (layouts.size >= mainSols.length && mainLayouts.size < mainSols.length) warnings.push(`${ctx}: only ${mainLayouts.size} distinct lab layouts among the 6 plans though ${layouts.size} exist`);
  layoutStats.push(mainLayouts.size);
  // judge: does each plan win (or nearly win) its own topic?
  res.plans.forEach((p) => { topicStats[p.profile.id] = topicStats[p.profile.id] || { n: 0, exact: 0, worst: 0 }; const st = topicStats[p.profile.id]; st.n++; if (p.topicGap === 0) st.exact++; st.worst = Math.max(st.worst, p.topicGap || 0); });
  // plan goals: compare with the best possible over every timetable (first plan is unconstrained by diversity)
  const best = (f) => D.sols.reduce((a, s) => Math.min(a, f(s)), Infinity);
  // "Two heavy days" picks first, so it must reach the lightest possible light days
  const heavyIdx = P.PROFILES.findIndex((p) => p.id === "heavy");
  ok(res.plans[heavyIdx].topicGap === 0, ctx, `Two heavy days is ${res.plans[heavyIdx].topicGap} min off the lightest possible week`);
  const labPlan = mainSols[4], heavyPlan = mainSols[5];
  const minLabDays = best((s) => s.m.labDays);
  if (labPlan.m.labDays > minLabDays) warnings.push(`${ctx}: Most lab-free days has ${labPlan.m.labDays} lab days, best possible ${minLabDays}`);
  const minLight = best((s) => s.m.lightMins);
  if (heavyPlan.m.lightMins > minLight + 240) warnings.push(`${ctx}: Two heavy days leaves ${heavyPlan.m.lightMins} min on light days, best possible ${minLight}`);
  if (prefs.lunchSkip < 99 && !res.relaxed.length) {
    const can = best((s) => (s.split === bestSplit ? s.m.lunchDays : 99));
    mainSols.slice(0, 4).forEach((s, i) => { if (s.m.lunchDays > prefs.lunchSkip && can <= prefs.lunchSkip) warnings.push(`${ctx}: plan ${i + 1} skips lunch ${s.m.lunchDays} days though ${can} was possible`); });
  }
  return { ms, count: res.count, minApart };
}

// Sensitivity: changing one answer must change the plans whenever that answer matters
function sensitivity() {
  const base = { max8: 1, max9: 9, labs: "am", labFree: 2, maxLabs: 2, labStretch: "prefer", lunchSkip: 1, endBy: 99, prp: "all" };
  const changes = [["labFree", 0], ["labFree", 1], ["labFree", 3], ["maxLabs", 3], ["maxLabs", 1], ["maxLabs", 9], ["max8", 0], ["max8", 2], ["labs", "any"], ["labStretch", "any"], ["lunchSkip", 0], ["lunchSkip", 99], ["endBy", 18], ["max9", 0], ["prp", "hybrid"]];
  const run = (prefs) => P.plan(db, { codes: BASE, prefs, comm: RATINGS.faculty, board: RATINGS.board }).plans.map((p) => p.options[0].sig).join("|");
  const b = run(base);
  const same = [];
  changes.forEach(([k, v]) => { if (run(Object.assign({}, base, { [k]: v })) === b) same.push(`${k}=${v}`); });
  console.log(`Sensitivity: ${changes.length - same.length}/${changes.length} single-answer changes changed the plans${same.length ? "; no change for: " + same.join(", ") : ""}`);
}
sensitivity();
const t0 = Date.now();
let slowest = 0, total = 0, errors = 0;
for (let r = 0; r < RUNS; r++) {
  try {
    const out = runOne(r);
    slowest = Math.max(slowest, out.ms); total += out.ms; if (out.error) errors++;
    if (r % 10 === 0) process.stdout.write(`run ${r}: ${out.ms} ms, ${out.count || 0} timetables, min apart ${out.minApart ?? "-"}\n`);
  } catch (e) { fail(`run ${r}`, "crashed: " + e.stack); }
}
console.log(`\n${RUNS} runs, ${checks} checks, ${failures.length} failures, ${warnings.length} warnings, ${errors} no-fit answers, slowest ${slowest} ms, avg ${Math.round(total / RUNS)} ms, wall ${Math.round((Date.now() - t0) / 1000)} s`);
console.log(`Distinct lab layouts across the 6 plans: avg ${(layoutStats.reduce((a, b) => a + b, 0) / Math.max(1, layoutStats.length)).toFixed(2)}, min ${Math.min(...layoutStats)}`);
Object.entries(topicStats).forEach(([id, st]) => console.log(`Topic ${id.padEnd(9)}: best possible in ${st.exact}/${st.n} runs (${Math.round(100 * st.exact / st.n)}%), worst drift ${Math.round(st.worst * 10) / 10}`));
const uniq = (a) => [...new Set(a)];
if (failures.length) { console.log("\nFAILURES:"); uniq(failures).slice(0, 40).forEach((f) => console.log(" - " + f)); }
if (warnings.length) { console.log("\nWARNINGS (sample):"); uniq(warnings).slice(0, 25).forEach((f) => console.log(" - " + f)); }
process.exitCode = failures.length ? 1 : 0;
