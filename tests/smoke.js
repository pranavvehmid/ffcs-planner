const fs = require("fs"), path = require("path");
const site = path.join(__dirname, "..", "site");
const load = (f) => { const s = fs.readFileSync(path.join(site, f), "utf8"); return JSON.parse(s.slice(s.indexOf("=") + 1, s.lastIndexOf(";"))); };
const DATA = load("data.js"), RATINGS = load("ratings.js");
const P = require(path.join(site, "planner.js"));
const db = P.build(DATA);
const codes = ["BAPHY105","BAHUM101","BACSE103","BACSE104","BACSE105","BACSE106","BAMAT205"];
const prefs = { max8: 1, max9: 9, labs: "am", labFree: 2, maxLabs: 2, labStretch: "prefer", lunchSkip: 1, endBy: 99, prp: "all" };
const t0 = Date.now();
const r = P.plan(db, { codes, prefs, comm: RATINGS.faculty });
console.log("ms", Date.now() - t0, "count", r.count, "relaxed", r.relaxed, "err", r.error, "amMiss", r.amMiss);
(r.plans || []).forEach((p) => {
  const o = p.options[0]; const ks = o.ids.map((i) => db.CLASSES[i]);
  const m = P.metrics(ks.flatMap((k) => k.times));
  console.log(p.profile.name.padEnd(20), "apart", p.apart, "| 8AM days", m.earlyDays, "labs/day", m.labsPerDay.slice(0,5).join(","), "labGap", m.labGap, "lunchless", m.lunchDays, "ends", m.lastEnd, "opts", p.options.map(x=>x.label).join("/"), "bk", p.backups.length);
  console.log("   ", ks.map((k) => `${k.code.slice(2)}:${k.slots}`).join(" "));
});
