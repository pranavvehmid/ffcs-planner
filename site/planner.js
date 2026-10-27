/* FFCS Planner engine: lists every clash-free timetable for a set of courses, scores each
   one for several plan styles, and picks clearly different plans. No DOM, so it runs in the
   browser (inside a Web Worker) and in Node for the automated tests. */
(function (root) {
  "use strict";

  /* ---------------- slot grid (VTOP, Vellore) ---------------- */
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const t = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
  const TH_TIMES = [["08:00","08:50"],["09:00","09:50"],["10:00","10:50"],["11:00","11:50"],["12:00","12:50"],
    ["14:00","14:50"],["15:00","15:50"],["16:00","16:50"],["17:00","17:50"],["18:00","18:50"],["19:01","19:50"]];
  const LAB_TIMES = [["08:00","08:50"],["08:51","09:40"],["09:51","10:40"],["10:41","11:30"],["11:40","12:30"],["12:31","13:20"],
    ["14:00","14:50"],["14:51","15:40"],["15:51","16:40"],["16:41","17:30"],["17:40","18:30"],["18:31","19:20"]];
  const TH_GRID = [
    "A1 F1 D1 TB1 TG1 A2 F2 D2 TB2 TG2 V3",
    "B1 G1 E1 TC1 TAA1 B2 G2 E2 TC2 TAA2 V4",
    "C1 A1 F1 V1 V2 C2 A2 F2 TD2 TBB2 V5",
    "D1 B1 G1 TE1 TCC1 D2 B2 G2 TE2 TCC2 V6",
    "E1 C1 TA1 TF1 TD1 E2 C2 TA2 TF2 TDD2 V7",
    "V8 X11 X12 Y11 Y12 X21 Z21 Y21 W21 W22 V9",
    "V10 Y11 Y12 X11 X12 Y21 Z21 X21 W21 W22 V11",
  ].map((r) => r.split(" "));
  const LAB_START = [[1, 31], [7, 37], [13, 43], [19, 49], [25, 55], [71, 77], [83, 89]];
  const LAB_GRID = LAB_START.map(([m, a]) => [0,1,2,3,4,5].map((i) => "L" + (m + i)).concat([0,1,2,3,4,5].map((i) => "L" + (a + i))));
  const SLOT_TIMES = {};
  TH_GRID.forEach((row, d) => row.forEach((s, c) => (SLOT_TIMES[s] = SLOT_TIMES[s] || []).push({ d, s: t(TH_TIMES[c][0]), e: t(TH_TIMES[c][1]), kind: "th", col: c })));
  LAB_GRID.forEach((row, d) => row.forEach((s, c) => (SLOT_TIMES[s] = SLOT_TIMES[s] || []).push({ d, s: t(LAB_TIMES[c][0]), e: t(LAB_TIMES[c][1]), kind: "lab", col: c })));
  const LUNCH_END = t("13:20"), AFTERNOON = t("14:00");

  const typeGroup = (ty) => (ty === "ELA" || ty === "LO" ? "lab" : ty === "ETH" || ty === "TH" ? "th" : "other");
  const isPRP = (v) => /^PRP/i.test(v);
  // morning ("am") or afternoon ("pm") half of the day a class sits in
  function halfOf(k) {
    const s = k.slotList[0] || "";
    if (/^L\d+$/.test(s)) { const n = +s.slice(1); return n <= 30 || (n >= 71 && n <= 76) || (n >= 83 && n <= 88) ? "am" : "pm"; }
    return /1$/.test(s) ? "am" : "pm";
  }

  /* ---------------- course data ---------------- */
  function build(DATA) {
    const CLASSES = [], COURSES = {};
    DATA.courses.forEach((c0) => {
      const c = { code: c0.code, title: c0.title, cat: c0.cat, ids: [] };
      c0.classes.forEach(([slots, venue, faculty, type]) => {
        const slotList = slots === "NIL" ? [] : slots.split("+").map((s) => s.trim()).filter(Boolean);
        const times = [];
        slotList.forEach((s) => (SLOT_TIMES[s] || []).forEach((x) => times.push(x)));
        const id = CLASSES.length;
        CLASSES.push({ id, code: c.code, title: c.title, slots, slotList, venue, faculty, type, group: typeGroup(type), times, prp: isPRP(venue) });
        c.ids.push(id);
      });
      c.types = [...new Set(c0.classes.map((k) => k[3]))];
      c.groups = [...new Set(c.types.map(typeGroup))];
      c.embedded = c.groups.includes("th") && c.groups.includes("lab");
      // An embedded course is picked as one faculty: their theory plus their lab in the other half of the day.
      c.options = [];
      if (c.embedded) {
        const byFac = {};
        c.ids.forEach((i) => { const k = CLASSES[i]; (byFac[k.faculty] = byFac[k.faculty] || []).push(k); });
        Object.values(byFac).forEach((list) => {
          const ths = list.filter((k) => k.group === "th"), labs = list.filter((k) => k.group === "lab");
          ths.forEach((th) => {
            let pair = labs.filter((l) => halfOf(l) !== halfOf(th));
            if (!pair.length) pair = labs;
            pair.forEach((l) => c.options.push([th.id, l.id]));
          });
        });
      } else c.ids.forEach((i) => c.options.push([i]));
      COURSES[c.code] = c;
    });
    return { CLASSES, COURSES };
  }

  /* ---------------- time helpers ---------------- */
  const overlaps = (a, b) => a.d === b.d && a.s < b.e && b.s < a.e;
  const timesClash = (A, B) => { for (const a of A) for (const b of B) if (overlaps(a, b)) return true; return false; };
  function blocksOf(times) {
    const out = [];
    times.slice().sort((a, b) => a.d - b.d || a.s - b.s).forEach((x) => {
      const last = out[out.length - 1];
      if (last && last.d === x.d && x.s - last.e <= 15) last.e = Math.max(last.e, x.e); else out.push({ d: x.d, s: x.s, e: x.e });
    });
    return out;
  }
  const bits = (x) => { let n = 0; while (x) { n += x & 1; x >>= 1; } return n; };

  // Everything the plan styles and your limits look at, for one week of classes.
  function metrics(times) {
    const blocks = blocksOf(times);
    let gaps = 0, early = 0, late = 0;
    const days = new Set(), earlyDays = new Set(), first = {}, last = {}, ends1320 = new Set(), starts14 = new Set();
    blocks.forEach((b, i) => {
      days.add(b.d);
      if (first[b.d] === undefined) first[b.d] = b.s;
      last[b.d] = Math.max(last[b.d] || 0, b.e);
      if (b.s <= 480) { early++; earlyDays.add(b.d); }
      if (b.e > 17 * 60) late++;
      if (b.e >= t("12:30") && b.e <= LUNCH_END) ends1320.add(b.d);
      if (b.s >= AFTERNOON && b.s < t("14:10")) starts14.add(b.d);
      const prev = blocks[i - 1];
      if (prev && prev.d === b.d) {
        let g = b.s - prev.e;
        if (prev.e <= LUNCH_END && b.s >= AFTERNOON) g -= 40; // lunch is not a gap
        gaps += Math.max(0, g);
      }
    });
    const nineDays = Object.values(first).filter((s) => s >= t("09:00") && s <= t("10:00")).length;
    const lunchDays = [...ends1320].filter((d) => starts14.has(d)).length;
    const hours = Math.round(blocks.reduce((a, b) => a + b.e - b.s, 0) / 60);
    const lastEnd = blocks.reduce((a, b) => Math.max(a, b.e), 0);
    const after = (h) => blocks.filter((b) => b.e > h * 60).length;
    // labs: count 2-period sessions per day, and idle time between lab blocks on the same day
    const labTimes = times.filter((x) => x.kind === "lab");
    const labsPerDay = [0, 0, 0, 0, 0, 0, 0];
    labTimes.forEach((x) => { labsPerDay[x.d] += 0.5; });
    const labDaySet = new Set(labTimes.map((x) => x.d));
    const labBlocks = blocksOf(labTimes);
    let labGap = 0;
    labBlocks.forEach((b, i) => { const p = labBlocks[i - 1]; if (p && p.d === b.d) labGap += b.s - p.e; });
    const perDay = [0, 1, 2, 3, 4, 5, 6].map((d) => blocks.filter((b) => b.d === d).reduce((a, b) => a + b.e - b.s, 0));
    const sorted = perDay.slice().sort((a, b) => b - a);
    let startLate = 0, endLate = 0;
    Object.keys(first).forEach((d) => { startLate += Math.max(0, t("10:00") - first[d]); endLate += Math.max(0, last[d] - t("15:00")); });
    return {
      gaps, early, late, days: days.size, earlyDays: earlyDays.size, nineDays, lunchDays, hours, lastEnd,
      after6: after(18), after7: after(19), labDays: labDaySet.size,
      noLabDays: [0, 1, 2, 3, 4].filter((d) => !labDaySet.has(d)).length,
      labsPerDay, maxLabsDay: Math.max(...labsPerDay), labGap,
      perDay, lightMins: sorted.slice(2).reduce((a, b) => a + b, 0), heavy2: sorted[0] + sorted[1], startLate, endLate,
    };
  }

  /* ---------------- plan styles ---------------- */
  const PROFILES = [
    { id: "compact", name: "Compact days", color: "var(--lime)",
      blurb: "Fewest gaps between classes and fewest days on campus, so you're not waiting around.",
      score: (m) => m.gaps * 1.0 + m.days * 25 + m.early * 10 + m.late * 10 },
    { id: "mornings", name: "Late starts", color: "var(--mint)",
      blurb: "Starts each day as late as it can, so most mornings are slow.",
      score: (m) => m.startLate * 1.0 + m.gaps * 0.3 + m.endLate * 0.1 },
    { id: "evenings", name: "Done early", color: "var(--cyan)",
      blurb: "Finishes each day as early as it can, keeping your evenings free.",
      score: (m) => m.endLate * 1.0 + m.gaps * 0.3 + m.startLate * 0.1 },
    { id: "rated", name: "Top-rated teachers", color: "var(--pink)",
      blurb: "Picks the best-reviewed teachers (your stars first, then the review site and FFCS Board picks), then keeps the days tidy.",
      score: (m) => m.gaps * 0.3 + m.early * 5 + m.late * 5 },
    { id: "labdays", name: "Most lab-free days", color: "var(--lavender)",
      blurb: "Squeezes labs into as few days as your lab answers allow and keeps each day's labs back-to-back. Softer answers can bend.",
      score: (m) => m.labDays * 1500 + m.labGap * 2 + m.gaps * 0.3 },
    { id: "heavy", name: "Two heavy days", color: "var(--peach)",
      blurb: "Crowds two days so the rest of the week is light. Softer answers can bend.",
      score: (m) => m.lightMins * 1.2 - m.heavy2 * 0.2 + m.gaps * 0.15 },
  ];

  /* ---------------- the planner ---------------- */
  // prefs: max8 (9 = any), max9, labs ("am" | "any"), labFree (min lab-free weekdays, 0 = no rule),
  //        maxLabs (max lab sessions on one day, 9 = any), labStretch ("prefer" | "any"),
  //        lunchSkip (99 = any), endBy (18 | 19 | 99), prp ("all" | "hybrid")
  function plan(db, input) {
    const { CLASSES, COURSES } = db;
    const prefs = input.prefs;
    const fac = input.fac || {};
    const comm = input.comm || {};
    const progress = input.onProgress || (() => {});
    const codes = input.codes.filter((c) => COURSES[c]);
    const facPref = (n) => (fac[n] && fac[n].pref) || 0;
    const board = input.board || {};
    const BOARD_BONUS = { star: 1.0, ok: 0.3, avoid: -1.0 };
    // your own stars win; otherwise the review site score, nudged by the FFCS Board marks
    const effRating = (n) => {
      const mine = fac[n] && fac[n].rating;
      if (mine) return Number(mine);
      const c = comm[n];
      let r = 2.5;
      if (c) r += (c[0] - 5) * 1.6 * Math.min(1, c[1] / 4);
      if (board[n]) r += BOARD_BONUS[board[n][0]] || 0;
      return Math.max(1, Math.min(5, r));
    };
    const optClasses = (o) => o.map((i) => CLASSES[i]);
    const optRank = (o) => optClasses(o).reduce((a, k) => a + facPref(k.faculty) * 10 + (effRating(k.faculty) - 2.5) * 3 + (k.prp ? 1 : 0), 0);
    const notes = { noPRP: [], relaxed: [] };

    // timing groups: options with exactly the same slots, so the search only sees distinct timings
    function groupsFor(code, rules, excl) {
      const c = COURSES[code];
      let opts = c.options.filter((o) => !(excl && optClasses(o).some((k) => excl.has(k.faculty))));
      if (prefs.prp === "all") {
        const p = opts.filter((o) => optClasses(o).every((k) => k.prp || !k.times.length));
        if (p.length) opts = p; else if (opts.length && !notes.noPRP.includes(code)) notes.noPRP.push(code);
      }
      const noAvoid = opts.filter((o) => !optClasses(o).some((k) => facPref(k.faculty) < 0));
      if (noAvoid.length) opts = noAvoid;
      if (rules.amLabs) {
        // morning labs: labs before lunch, so theory (including theory-only courses like Maths) after lunch
        const f = opts.filter((o) => optClasses(o).every((k) => !k.times.length || (k.group === "lab" ? halfOf(k) === "am" : halfOf(k) === "pm")));
        if (f.length) opts = f; else if (opts.length) rules.amMiss.add(code);
      }
      const groups = {};
      opts.forEach((o) => {
        const ks = optClasses(o);
        const key = ks.map((k) => k.slots).join("|");
        const g = groups[key] || (groups[key] = { key, code, times: ks.flatMap((k) => k.times), opts: [], liked: false, rating: 0 });
        g.opts.push(o);
        if (ks.some((k) => facPref(k.faculty) > 0)) g.liked = true;
        g.rating = Math.max(g.rating, effRating(ks[0].faculty));
      });
      return Object.values(groups).map((g) => {
        let m8 = 0, labMask = 0;
        const lab = [0, 0, 0, 0, 0, 0, 0];
        g.times.forEach((x) => { if (x.s <= 480) m8 |= 1 << x.d; if (x.kind === "lab") { lab[x.d] += 0.5; labMask |= 1 << x.d; } });
        return Object.assign(g, { m8, labMask, lab });
      });
    }

    function enumerate(rules, excl) {
      rules.amMiss = new Set();
      const courses = codes.map((code) => ({ code, groups: groupsFor(code, rules, excl) }));
      const missing = courses.filter((c) => !c.groups.length).map((c) => c.code);
      if (missing.length) return { missing };
      const timed = courses.filter((c) => c.groups.some((g) => g.times.length));
      const untimed = courses.filter((c) => !c.groups.some((g) => g.times.length));
      timed.sort((a, b) => a.groups.length - b.groups.length);
      const all = [];
      timed.forEach((c) => c.groups.forEach((g) => { g.n = all.length; all.push(g); }));
      const ok = all.map((a) => all.map((b) => !timesClash(a.times, b.times)));
      const max8 = rules.max8 < 9 ? rules.max8 : 99;
      const maxLabs = rules.maxLabs < 9 ? rules.maxLabs : 99;
      const maxLabDays = rules.labFree > 0 ? 5 - rules.labFree : 99;
      const CAP = 700000; // memory guard for phones; the page says when this kicks in
      const raw = [];
      const pick = [];
      const lab = [0, 0, 0, 0, 0, 0, 0];
      (function dfs(i, m8, lm) {
        if (raw.length >= CAP) return;
        if (bits(m8) > max8 || bits(lm & 31) > maxLabDays) return;
        for (let d = 0; d < 7; d++) if (lab[d] > maxLabs) return;
        if (i === timed.length) { raw.push(pick.slice()); return; }
        for (const g of timed[i].groups) {
          let fits = true;
          for (const h of pick) if (!ok[h.n][g.n]) { fits = false; break; }
          if (!fits) continue;
          pick.push(g);
          for (let d = 0; d < 7; d++) lab[d] += g.lab[d];
          dfs(i + 1, m8 | g.m8, lm | g.labMask);
          for (let d = 0; d < 7; d++) lab[d] -= g.lab[d];
          pick.pop();
        }
      })(0, 0, 0);
      return { raw, untimed, capped: raw.length >= CAP, amMiss: [...rules.amMiss] };
    }

    // Hard rules, then step back one rule at a time if nothing fits. All-PRP is never dropped.
    const wantAm = prefs.labs === "am";
    // Lab-free days and the lab split are wishes, not rules: plans 1-4 follow them closely,
    // while Plan 5 and Plan 6 may reshape the labs to reach their own goal.
    const steps = [{ rules: { max8: prefs.max8, labFree: 0, maxLabs: 9, amLabs: wantAm }, drop: null }];
    const stepDown = (change, drop) => steps.push({ rules: Object.assign({}, steps[steps.length - 1].rules, change), drop });
    if (wantAm) stepDown({ amLabs: false }, "morning labs with afternoon theory");
    if (prefs.max8 < 9) stepDown({ max8: 9 }, `at most ${prefs.max8} day${prefs.max8 === 1 ? "" : "s"} with 8 AM`);
    progress("Listing every clash-free timetable…", 3);
    let res = null, level = 0;
    for (; level < steps.length; level++) {
      res = enumerate(Object.assign({}, steps[level].rules));
      if (res.missing) return { error: `No classes left for ${res.missing.map((c) => COURSES[c].title).join(", ")}.` };
      if (res.raw.length) break;
    }
    if (!res || !res.raw.length) return { error: "These courses can't all fit without a clash. Try removing one." };
    notes.relaxed = steps.slice(1, level + 1).map((s) => s.drop);
    const rulesUsed = steps[level].rules;
    if (res.amMiss.length) notes.amMiss = res.amMiss;

    // score every timetable once
    const n = res.raw.length;
    const sols = new Array(n);
    for (let i = 0; i < n; i++) {
      const gs = res.raw[i];
      const m = metrics(gs.flatMap((g) => g.times));
      let soft = 0, liked = 0, rate = 0;
      if (prefs.endBy < 99) soft += (prefs.endBy === 18 ? m.after6 : m.after7) * 900;
      if (prefs.max9 < 9) soft += Math.max(0, m.nineDays - prefs.max9) * 700;
      if (prefs.lunchSkip < 99) soft += Math.max(0, m.lunchDays - prefs.lunchSkip) * 1200;
      const stretch = prefs.labStretch === "prefer" ? m.labGap * 4 : 0;
      let split = 0;
      if (prefs.labFree > 0) split += Math.max(0, prefs.labFree - m.noLabDays) * 6000;
      if (prefs.maxLabs < 9) split += m.labsPerDay.reduce((a, x) => a + Math.max(0, x - prefs.maxLabs), 0) * 6000;
      const layout = m.labsPerDay.slice(0, 5).join(",");
      gs.forEach((g) => { if (g.liked) liked++; rate += g.rating - 2.5; });
      // keep only the numbers the plan styles need: there can be close to a million timetables
      const mm = { gaps: m.gaps, early: m.early, late: m.late, days: m.days, earlyDays: m.earlyDays, nineDays: m.nineDays, lunchDays: m.lunchDays,
        hours: m.hours, lastEnd: m.lastEnd, after6: m.after6, after7: m.after7, labDays: m.labDays, noLabDays: m.noLabDays, maxLabsDay: m.maxLabsDay,
        labGap: m.labGap, lightMins: m.lightMins, heavy2: m.heavy2, startLate: m.startLate, endLate: m.endLate };
      res.raw[i] = null;
      sols[i] = { idx: i, groups: gs, m: mm, sig: gs.map((g) => g.n).join("/"), soft, stretch, split, layout, liked, rate };
      if (i % 4000 === 0) progress(`Scoring ${n.toLocaleString("en-IN")} timetables…`, 5 + (i / n) * 55);
    }
    let minSplit = Infinity;
    for (const s2 of sols) if (s2.split < minSplit) minSplit = s2.split;
    // every timetable lists its courses in the same order, so compare position by position
    const diffCount = (a, b) => { let d = 0; for (let i = 0; i < a.groups.length; i++) if (a.groups[i] !== b.groups[i]) d++; return d; };
    function scoreFor(p, s) {
      const relax = p.id === "labdays" || p.id === "heavy" ? 0.15 : 1;
      const splitW = p.id === "labdays" ? 0.05 : p.id === "heavy" ? 0.1 : 1;
      let v = p.score(s.m) + s.soft * relax + s.split * splitW + s.stretch * (p.id === "heavy" ? 0.3 : 1) - s.liked * 200 - s.rate * 40;
      if (p.id === "rated") v += -s.rate * 260 - s.liked * 160;
      return v;
    }
    // concrete classes for a timetable: best-ranked teacher per course, steering away from teachers already used
    function materialize(s, avoid, excl) {
      const ids = [], alt = {}, fac = {};
      const adj = (o) => optRank(o) - (avoid && optClasses(o).some((k) => avoid.has(k.faculty)) ? 4 : 0);
      const kept = [];
      const pickOpt = (opts, code) => {
        let os = opts.filter((o) => !(excl && optClasses(o).some((k) => excl.has(k.faculty))));
        if (!os.length && excl && !COURSES[code].options.some((o) => !optClasses(o).some((k) => excl.has(k.faculty)))) {
          os = opts.slice(); // this course has no other teacher at all, so the backup keeps this one
          kept.push(code);
        }
        os.sort((a, b) => adj(b) - adj(a));
        if (!os.length) return false;
        ids.push(...os[0]);
        fac[code] = CLASSES[os[0][0]].faculty;
        alt[code] = os.slice(1).map((o) => CLASSES[o[0]].faculty);
        return true;
      };
      for (const g of s.groups) if (!pickOpt(g.opts, g.code)) return null;
      for (const c of res.untimed) if (!pickOpt(c.groups.flatMap((g) => g.opts), c.code)) return null;
      return { ids, alt, sig: s.sig, fac, kept };
    }
    const labHalfShare = (s) => {
      const labs = s.groups.flatMap((g) => optClasses(g.opts[0]).filter((k) => k.group === "lab"));
      return labs.length ? labs.filter((k) => halfOf(k) === "am").length / labs.length : 1;
    };

    // Pass 1: pick each plan's main timetable. The two goal plans pick first so they get their
    // true best; every later plan must differ from all earlier ones by 3+ courses where possible.
    const PICK_ORDER = ["heavy", "labdays", "compact", "mornings", "evenings", "rated"];
    const byId = {};
    PROFILES.forEach((p) => { byId[p.id] = p; });
    const orders = {};
    const mains = {};
    const mainList = [];
    const usedSigs = new Set();
    PICK_ORDER.forEach((id, k) => {
      const p = byId[id];
      progress(`Choosing plan ${k + 1} of ${PROFILES.length}: ${p.name}…`, 62 + (k / PROFILES.length) * 30);
      const sc = new Float64Array(n);
      for (let i = 0; i < n; i++) sc[i] = scoreFor(p, sols[i]);
      const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => sc[a] - sc[b]);
      orders[id] = order;
      const first = (fn) => { for (const i of order) if (fn(sols[i])) return sols[i]; return null; };
      // each plan gets its own lab layout (which days hold labs and how many) and differs in courses
      let main = null, apart = 0, sameTiming = false;
      const needs = id === "labdays" ? [2, 1] : [3, 2, 1];
      const usedLayouts = new Set(mainList.map((o) => o.layout));
      const bestScore = sc[order[0]];
      // plans 1-4 keep your lab split whenever any timetable can; Plan 5 and 6 may reshape it
      const goal = id === "labdays" || id === "heavy";
      const splitOk = (s) => goal || s.split <= minSplit;
      search:
      for (const keep of goal ? [false] : [true, false]) {
        for (const fresh of [true, false]) {
          for (const need of needs) {
            main = first((s) => !usedSigs.has(s.sig) && (!keep || splitOk(s)) && (!fresh || !usedLayouts.has(s.layout)) && mainList.every((o) => diffCount(s, o) >= need));
            // don't take a new layout that wrecks the plan's own goal
            if (main && fresh && sc[main.idx] - bestScore > 1500) main = null;
            if (main) { apart = mainList.length ? need : 0; break search; }
          }
        }
      }
      // if the only new timetables break your lab split, reuse a split-keeping timing with other teachers
      if (main && !goal && main.split > minSplit) { const k = first((s) => s.split <= minSplit); if (k) { main = k; sameTiming = usedSigs.has(k.sig); } }
      if (!main) { main = sols[order[0]]; sameTiming = true; } // fewer timetables than plans
      usedSigs.add(main.sig);
      mainList.push(main);
      mains[id] = { main, apart, sameTiming };
    });

    // Pass 2: teachers, variations and backups for each plan, in display order.
    const plans = [];
    const usedFac = new Set();
    PROFILES.forEach((p, pi) => {
      progress(`Variations and backups for ${p.name}…`, 92 + (pi / PROFILES.length) * 7);
      const order = orders[p.id];
      const first = (fn, limit) => { let c = 0; for (const i of order) { if (limit && ++c > limit) break; if (fn(sols[i])) return sols[i]; } return null; };
      const { main, apart, sameTiming } = mains[p.id];
      const mo = materialize(main, usedFac);
      mo.label = "Main";
      if (sameTiming) mo.sig = main.sig + "~" + pi;
      Object.values(mo.fac).forEach((f) => usedFac.add(f));
      const options = [mo];
      const v2 = first((s) => !usedSigs.has(s.sig) && diffCount(s, main) >= 1 && diffCount(s, main) <= 2, 30000);
      if (v2) {
        usedSigs.add(v2.sig);
        const vo = materialize(v2);
        vo.label = "Variation 2";
        vo.changed = v2.groups.filter((g, gi) => main.groups[gi] !== g).map((g) => [g.code, g.key]);
        options.push(vo);
      }
      if (prefs.labs !== "am") {
        const am = first((s) => !usedSigs.has(s.sig) && labHalfShare(s) === 1);
        if (am) {
          usedSigs.add(am.sig);
          const ao = materialize(am);
          ao.label = "Morning labs";
          ao.changed = am.groups.filter((g, gi) => main.groups[gi] !== g).map((g) => [g.code, g.key]);
          options.push(ao);
        }
      }
      // Backups B and C: same style, none of the earlier plan's teachers
      const backups = [];
      const excl = new Set(Object.values(mo.fac));
      for (let b = 0; b < 2; b++) {
        let got = null;
        for (const i of order) { got = materialize(sols[i], null, excl); if (got) break; }
        if (!got) { backups.push({ missing: true, label: "Backup " + "BC"[b] }); break; }
        got.label = "Backup " + "BC"[b];
        backups.push(got);
        Object.values(got.fac).forEach((f) => excl.add(f));
      }
      plans.push({ profile: { id: p.id, name: p.name, blurb: p.blurb, color: p.color }, options, backups, apart, sameTiming });
    });
    // the best any timetable can do on each softer answer, so the page can say when a bend is unavoidable
    const limits = { lunchDays: Infinity, nineDays: Infinity, lastEnd: Infinity, labGap: Infinity };
    for (const s2 of sols) for (const k in limits) if (s2.m[k] < limits[k]) limits[k] = s2.m[k];
    limits.noLabDays = sols.reduce((a, x) => Math.max(a, x.m.noLabDays), 0);
    limits.maxLabsDay = sols.reduce((a, x) => Math.min(a, x.m.maxLabsDay), Infinity);
    const limitsKeep = { lunchDays: Infinity, nineDays: Infinity, lastEnd: Infinity, labGap: Infinity };
    for (const s2 of sols) if (s2.split <= minSplit) for (const k in limitsKeep) if (s2.m[k] < limitsKeep[k]) limitsKeep[k] = s2.m[k];
    progress("Done", 100);
    const debug = input.debug ? { sols, scoreFor, diffCount } : undefined;
    return { debug, plans, limits, limitsKeep, minSplit, count: n, capped: res.capped, relaxed: notes.relaxed, noPRP: notes.noPRP, amMiss: notes.amMiss || [], rules: rulesUsed };
  }

  const api = { build, plan, metrics, blocksOf, timesClash, halfOf, PROFILES, SLOT_TIMES, DAYS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FFCSPlanner = api;
})(typeof self !== "undefined" ? self : this);
