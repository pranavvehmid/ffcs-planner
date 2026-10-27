  /* ---------- exhaustive planner ----------
     1. List every clash-free timetable that keeps your hard rules: all classes in PRP
        (for courses that have PRP classes) and at most N days with an 8 AM class.
     2. Score every one of them for each plan style. Softer answers (lunch, end time,
        9-10 AM starts, lab timing) cost points instead of ruling a timetable out.
     3. Pick each plan's best timetable that differs from the plans already picked.     */
  const tick = () => new Promise((r) => setTimeout(r, 0));
  function setProgress(msg, pct) {
    const el = $("#gen-progress");
    if (!el) return;
    el.querySelector(".gp-msg").textContent = msg;
    el.querySelector(".gp-bar i").style.width = Math.max(2, Math.min(100, pct)) + "%";
  }
  const optRank = (o) => optClasses(o).reduce((a, k) => a + facPref(k.faculty) * 10 + (effRating(k.faculty) - 2.5) * 3 + (k.prp ? 1 : 0), 0);
  const isPRPopt = (o) => optClasses(o).every((k) => k.prp || !k.times.length);

  function hardGroups(code, prefs, excl, notes) {
    let gs = timingGroups(code, prefs, false, excl);
    if (prefs.prp === "all") {
      const only = gs.map((g) => Object.assign({}, g, { opts: g.opts.filter(isPRPopt) })).filter((g) => g.opts.length);
      if (only.length) gs = only;
      else if (gs.length) notes.noPRP.push(code);
    }
    const noAvoid = gs.map((g) => Object.assign({}, g, { opts: g.opts.filter((o) => !optClasses(o).some((k) => facPref(k.faculty) < 0)) })).filter((g) => g.opts.length);
    if (noAvoid.length) gs = noAvoid;
    return gs;
  }

  async function enumerateAll(codes, prefs, onProgress) {
    const notes = { noPRP: [] };
    const courses = codes.map((code) => ({ code, groups: hardGroups(code, prefs, null, notes) }));
    const missing = courses.filter((c) => !c.groups.length).map((c) => c.code);
    if (missing.length) return { missing };
    const timed = courses.filter((c) => c.groups.some((g) => g.times.length));
    const untimed = courses.filter((c) => !c.groups.some((g) => g.times.length));
    timed.sort((a, b) => a.groups.length - b.groups.length);
    const all = [];
    timed.forEach((c) => c.groups.forEach((g) => { g.n = all.length; all.push(g); }));
    const ok = all.map((a) => all.map((b) => !timesClash(a.times, b.times)));
    const max8 = prefs.max8 < 9 ? prefs.max8 : 99;
    const CAP = 800000;
    const raw = [];
    const pick = [];
    (function dfs(i, m8) {
      if (raw.length >= CAP || bits(m8) > max8) return;
      if (i === timed.length) { raw.push(pick.slice()); return; }
      for (const g of timed[i].groups) {
        let fits = true;
        for (const h of pick) if (!ok[h.n][g.n]) { fits = false; break; }
        if (!fits) continue;
        pick.push(g);
        dfs(i + 1, m8 | g.m8);
        pick.pop();
      }
    })(0, 0);
    const sols = new Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      const gs = raw[i];
      sols[i] = { groups: gs, m: metrics(gs.flatMap((g) => g.times)), sig: gs.map((g) => g.n).join("/") };
      if (i % 2500 === 0) { onProgress(i / raw.length); await tick(); }
    }
    return { sols, untimed, notes, count: raw.length, capped: raw.length >= CAP };
  }

  function softCost(s, prefs) {
    if (s._soft !== undefined) return s._soft;
    const m = s.m;
    let p = 0;
    if (prefs.endBy < 99) p += (prefs.endBy === 18 ? m.after6 : m.after7) * 900;
    if (prefs.max9 < 9) p += Math.max(0, m.nineDays - prefs.max9) * 700;
    if (prefs.lunchSkip < 99) p += Math.max(0, m.lunchDays - prefs.lunchSkip) * 1200;
    let liked = 0, rate = 0;
    s.groups.forEach((g) => {
      if (prefs.labs !== "any" && g.labHalf && g.labHalf !== prefs.labs) p += 500;
      if (g.liked) liked++;
      rate += (g.rating || 2.5) - 2.5;
    });
    s._liked = liked; s._rate = rate;
    return (s._soft = p);
  }
  function scoreFor(p, s, prefs) {
    const soft = softCost(s, prefs);
    const relax = p.id === "labdays" || p.id === "heavy" ? 0.12 : 1;
    let v = p.score(s.m) + soft * relax - s._liked * 200 - s._rate * 40;
    if (p.id === "rated") v += -s._rate * 260 - s._liked * 160;
    return v;
  }
  const labShare = (s, half) => { const gs = s.groups.filter((g) => g.labHalf); return gs.length ? gs.filter((g) => g.labHalf === half).length / gs.length : 0; };

  // same timings, but a teacher outside `excl` for every course (best-ranked first)
  function assignAvoiding(s, untimed, excl) {
    const ids = [], alt = {};
    const best = (opts) => opts.filter((o) => !optClasses(o).some((k) => excl.has(k.faculty))).sort((a, b) => optRank(b) - optRank(a));
    for (const g of s.groups) {
      const os = best(g.opts);
      if (!os.length) return null;
      ids.push(...os[0]);
      alt[g.code] = os.slice(1).map((o) => titleCase(CLASSES[o[0]].faculty));
    }
    for (const c of untimed) {
      const os = best(c.groups.flatMap((g) => g.opts));
      if (!os.length) return null;
      ids.push(...os[0]);
      alt[c.code] = [];
    }
    return Object.assign({}, s, { ids, alt });
  }

  async function buildScenario(codes, prefs, label) {
    setProgress(`Listing every clash-free timetable${label}…`, 4);
    await tick();
    let res = await enumerateAll(codes, prefs, (f) => setProgress(`Scoring every timetable${label}…`, 5 + f * 55));
    if (res.missing) return { error: `No options left for ${res.missing.map((c) => COURSES[c].title).join(", ")}.` };
    let relaxed8 = false;
    if (!res.sols.length && prefs.max8 < 9) {
      res = await enumerateAll(codes, Object.assign({}, prefs, { max8: 9 }), (f) => setProgress(`Nothing fits your 8 AM limit${label}, so trying without it…`, 5 + f * 55));
      relaxed8 = true;
    }
    if (!res.sols.length) return { error: "These courses can't all fit without a clash. Try removing one." };
    const n = res.sols.length;
    const mains = [];
    const plans = [];
    for (let pi = 0; pi < PROF.length; pi++) {
      const p = PROF[pi];
      setProgress(`Choosing plan ${pi + 1} of ${PROF.length}: ${p.name}${label}…`, 62 + (pi / PROF.length) * 36);
      await tick();
      const sc = new Float64Array(n);
      for (let i = 0; i < n; i++) sc[i] = scoreFor(p, res.sols[i], prefs);
      const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => sc[a] - sc[b]);
      const ranked = (fn) => { for (const i of order) { const s = res.sols[i]; if (fn(s)) return s; } return null; };
      // each plan must differ from the plans before it (by 3+ courses where possible)
      let main = null, apart = 0;
      for (const need of [3, 2, 1, 0]) {
        main = ranked((s) => mains.every((o) => diffCount(s, o) >= need) && !mains.some((o) => o.sig === s.sig));
        if (main) { apart = need; break; }
      }
      if (!main) main = res.sols[order[0]];
      mains.push(main);
      const used = new Set([main.sig]);
      const mainOpt = Object.assign(materialize(main, res.untimed), { label: "Main" });
      const opts = [mainOpt];
      const v2 = ranked((s) => !used.has(s.sig) && diffCount(s, main) >= 1 && diffCount(s, main) <= 2);
      if (v2) { used.add(v2.sig); opts.push(Object.assign(materialize(v2, res.untimed), { label: "Variation 2" })); }
      const missingLab = [];
      [["am", "Morning labs"], ["pm", "Evening labs"]].forEach(([half, lab]) => {
        let s = ranked((x) => !used.has(x.sig) && labShare(x, half) === 1);
        let star = "";
        if (!s) { s = ranked((x) => !used.has(x.sig) && labShare(x, half) >= 0.6); star = "*"; }
        if (!s) { missingLab.push(half === "am" ? "morning" : "evening"); return; }
        used.add(s.sig);
        opts.push(Object.assign(materialize(s, res.untimed), { label: lab + star }));
      });
      // backups: whole new set of teachers, same plan style
      const backups = [];
      const excl = new Set(mainOpt.ids.map((id) => CLASSES[id].faculty));
      for (let b = 0; b < 2; b++) {
        let got = null;
        for (const i of order) { got = assignAvoiding(res.sols[i], res.untimed, excl); if (got) break; }
        if (!got) { backups.push({ missing: ["clash"] }); break; }
        got.label = "Backup " + "BC"[b];
        got.fit = true;
        backups.push(got);
        got.ids.forEach((id) => excl.add(CLASSES[id].faculty));
      }
      plans.push({ profile: p, options: opts, missingLab, backups, apart });
    }
    const broken = [];
    if (relaxed8) broken.push(`your 8 AM limit (nothing fits with ${prefs.max8})`);
    return { plans, count: res.count, capped: res.capped, relaxed: relaxed8, broken, noPRP: res.notes.noPRP, credits: codes.reduce((a, c) => a + credits(c), 0) };
  }

