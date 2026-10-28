/* FFCS Planner — Winter Semester 2026-27. Plain JS, no build step. */
(function () {
  "use strict";

  /* ======================= slot grid (from VTOP) ======================= */
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const t = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
  // Theory columns: 5 morning, 5 afternoon, 1 evening (V slot).
  const TH_TIMES = [["08:00","08:50"],["09:00","09:50"],["10:00","10:50"],["11:00","11:50"],["12:00","12:50"],
    ["14:00","14:50"],["15:00","15:50"],["16:00","16:50"],["17:00","17:50"],["18:00","18:50"],["19:01","19:50"]];
  // Lab columns: 6 morning, 6 afternoon.
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

  const SLOT_TIMES = {}; // slot -> [{d,s,e,kind,col}]
  TH_GRID.forEach((row, d) => row.forEach((s, c) => {
    (SLOT_TIMES[s] = SLOT_TIMES[s] || []).push({ d, s: t(TH_TIMES[c][0]), e: t(TH_TIMES[c][1]), kind: "th", col: c });
  }));
  LAB_GRID.forEach((row, d) => row.forEach((s, c) => {
    (SLOT_TIMES[s] = SLOT_TIMES[s] || []).push({ d, s: t(LAB_TIMES[c][0]), e: t(LAB_TIMES[c][1]), kind: "lab", col: c });
  }));

  const TYPE_NAMES = { ETH: "Theory", TH: "Theory", ELA: "Lab", LO: "Lab", SS: "Soft skill", OC: "Online", EPJ: "Project", PJT: "Project" };
  const typeGroup = (ty) => (ty === "ELA" || ty === "LO" ? "lab" : ty === "ETH" || ty === "TH" ? "th" : "other");
  const typeChip = (ty) => {
    const g = typeGroup(ty);
    return `<span class="chip ${g === "lab" ? "cyan" : g === "th" ? "mint" : "peach"}">${TYPE_NAMES[ty] || ty}</span>`;
  };
  const CAT_NAMES = { UCC: "University Core", PCC: "Programme Core", OEC: "Open Elective", CON: "Contact / Others", NC: "Non Credit" };

  /* ======================= data ======================= */
  const DATA = window.FFCS_DATA;
  const CLASSES = []; // flat list; index is the stable id used in plans and share codes
  const COURSES = {};
  const isPRP = (v) => /^PRP/i.test(v);
  const halfOf = (k) => {
    const s = k.slotList[0] || "";
    if (/^L\d+$/.test(s)) { const n = +s.slice(1); return n <= 30 || (n >= 71 && n <= 76) || (n >= 83 && n <= 88) ? "am" : "pm"; }
    return /1$/.test(s) ? "am" : "pm";
  };
  DATA.courses.forEach((c) => {
    c.ids = [];
    c.classes.forEach(([slots, venue, faculty, type]) => {
      const slotList = slots === "NIL" ? [] : slots.split("+").map((s) => s.trim()).filter(Boolean);
      const times = [];
      slotList.forEach((s) => (SLOT_TIMES[s] || []).forEach((x) => times.push(x)));
      const id = CLASSES.length;
      CLASSES.push({ id, code: c.code, title: c.title, cat: c.cat, slots, slotList, venue, faculty, type, group: typeGroup(type), times, prp: isPRP(venue) });
      c.ids.push(id);
    });
    c.types = [...new Set(c.classes.map((k) => k[3]))];
    c.groups = [...new Set(c.types.map(typeGroup))];
    c.embedded = c.groups.includes("th") && c.groups.includes("lab");
    // Embedded courses: the same faculty teaches the theory and the lab, and a
    // morning theory goes with an afternoon lab (and the other way round).
    c.options = []; // each option = list of class ids picked together
    if (c.embedded) {
      const byFac = {};
      c.ids.forEach((i) => { const k = CLASSES[i]; (byFac[k.faculty] = byFac[k.faculty] || []).push(k); });
      Object.values(byFac).forEach((list) => {
        const ths = list.filter((k) => k.group === "th"), labs = list.filter((k) => k.group === "lab");
        const used = new Set();
        ths.forEach((th) => {
          let pair = labs.filter((l) => halfOf(l) !== halfOf(th));
          if (!pair.length) pair = labs;
          if (!pair.length) c.options.push([th.id]);
          pair.forEach((l) => { used.add(l.id); c.options.push([th.id, l.id]); });
        });
        labs.filter((l) => !used.has(l.id)).forEach((l) => c.options.push([l.id]));
      });
    } else {
      c.ids.forEach((i) => c.options.push([i]));
    }
    COURSES[c.code] = c;
  });
  const optClasses = (o) => o.map((i) => CLASSES[i]);
  const optTimes = (o) => o.flatMap((i) => CLASSES[i].times);

  // Credits are not on VTOP's allocation page, so these are estimates:
  // theory + lab 4, theory only 3, online 2, lab only 2, soft skills 1.
  // Known credits (from Pranav); the rest are estimates.
  const CREDITS = { BAHUM101: 1, BAMAT205: 4, BAPHY105: 4, BACSE103: 4, BACSE104: 4, BACSE105: 4, BACSE106: 4,
    BAESP101: 2, BAFRE101: 2, BAGER101: 2, BAJAP101: 2, BAARB101: 2, BACHI101: 2 };
  function credits(code) {
    const c = COURSES[code];
    if (!c) return 0;
    if (CREDITS[code] !== undefined) return CREDITS[code];
    if (c.embedded) return 4;
    if (c.types.includes("TH") || c.types.includes("ETH")) return 3;
    if (c.types.includes("OC")) return 2;
    if (c.types.includes("LO") || c.types.includes("ELA")) return 2;
    if (c.types.includes("SS")) return 1;
    return 3;
  }

  /* ======================= state ======================= */
  const KEY = "ffcs-planner-w26";
  const FRIEND_COLORS = ["#FFD4E4", "#E0D0FF", "#A0E0FF", "#FFE0B0", "#70FFC0", "#FFA0A0"];
  const uid = () => Math.random().toString(36).slice(2, 9);
  const DEFAULT_PICK = ["BAPHY105", "BAHUM101", "BACSE103", "BACSE104", "BACSE105", "BACSE106", "BAMAT205"];
  let state = load();
  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* storage blocked or empty */ }
    if (!s || !Array.isArray(s.plans) || !s.plans.length) {
      const id = uid();
      s = { plans: [{ id, name: "Plan A", sel: [] }], active: id, friends: [], showMine: true };
    }
    if (!Array.isArray(s.genCourses)) s.genCourses = DEFAULT_PICK.slice();
    if (!s.fac || typeof s.fac !== "object") s.fac = {};
    if (!s.gen || typeof s.gen !== "object") s.gen = {};
    return s;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }
  const plan = () => state.plans.find((p) => p.id === state.active) || state.plans[0];
  const selected = () => plan().sel.map((i) => CLASSES[i]).filter(Boolean);

  /* ======================= share codes ======================= */
  const CODE_PREFIX = "W26-";
  const encode = (ids) => CODE_PREFIX + (ids.length ? ids.slice().sort((a, b) => a - b).map((i) => i.toString(36)).join(".") : "0");
  function decode(str) {
    let s = (str || "").trim();
    const m = s.match(/W26-[0-9a-z.]+/i);
    if (!m) return null;
    s = m[0].slice(CODE_PREFIX.length).toLowerCase();
    if (s === "0") return [];
    const ids = s.split(".").map((x) => parseInt(x, 36)).filter((n) => Number.isInteger(n) && n >= 0 && n < CLASSES.length);
    return [...new Set(ids)];
  }

  /* ======================= clash logic ======================= */
  const overlaps = (a, b) => a.d === b.d && a.s < b.e && b.s < a.e;
  const timesClash = (A, B) => A.some((a) => B.some((b) => overlaps(a, b)));
  // classes in `pool` that clash with class `cls` (ignoring the same course, which would be replaced)
  function clashesOf(cls, pool) {
    return pool.filter((o) => o.id !== cls.id && o.code !== cls.code && timesClash(cls.times, o.times));
  }
  function allClashes(pool) {
    const pairs = [];
    for (let i = 0; i < pool.length; i++)
      for (let j = i + 1; j < pool.length; j++)
        if (timesClash(pool[i].times, pool[j].times)) pairs.push([pool[i], pool[j]]);
    return pairs;
  }

  function addOption(code, ids) {
    const p = plan();
    const groups = new Set(ids.map((i) => CLASSES[i].group));
    const c = COURSES[code];
    // picking a faculty bundle replaces the whole course; a single class replaces its own part
    const drop = p.sel.filter((i) => CLASSES[i].code === code && (c.embedded && ids.length > 1 ? true : groups.has(CLASSES[i].group)));
    p.sel = p.sel.filter((i) => !drop.includes(i)).concat(ids);
    save();
    const k = CLASSES[ids[0]];
    toast(`${drop.length ? "Swapped to" : "Added"} ${titleCase(k.faculty)} · ${ids.map((i) => CLASSES[i].slots).join(" & ")}`);
  }
  function removeIds(ids) {
    const p = plan();
    p.sel = p.sel.filter((i) => !ids.includes(i));
    save();
    toast(`Removed ${CLASSES[ids[0]].code}`);
  }

  /* ======================= helpers ======================= */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const titleCase = (s) => s.toLowerCase().replace(/\b([a-z])/g, (x) => x.toUpperCase());
  const $ = (sel, root = document) => root.querySelector(sel);
  // merge back-to-back periods (lab pairs) into single blocks per day
  function blocksOf(times) {
    const out = [];
    times.slice().sort((a, b) => a.d - b.d || a.s - b.s).forEach((x) => {
      const last = out[out.length - 1];
      if (last && last.d === x.d && x.s - last.e <= 15) last.e = Math.max(last.e, x.e); else out.push({ d: x.d, s: x.s, e: x.e });
    });
    return out;
  }
  const whenText = (times) => blocksOf(times).map((b) => `${DAYS[b.d]} ${fmt(b.s)}–${fmt(b.e)}`).join(" · ") || "No fixed time";
  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2000);
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast("Copied"); }
    catch (e) {
      const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); toast("Copied"); } catch (e2) { toast("Copy failed, select it manually"); }
      ta.remove();
    }
  }

  const ICONS = {
    home: '<path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
    book: '<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/>',
    cap: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/>',
    cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    chev: '<path d="m6 9 6 6 6-6"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    eye: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M8 13h3M13 16h4"/>',
    spark: '<path d="M12 2c.5 4.8 2.2 7 7 8-4.8 1-6.5 3.2-7 8-.5-4.8-2.2-7-7-8 4.8-1 6.5-3.2 7-8z"/>',
  };
  const icon = (n, size = 20, sw = 2.4) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;
  const sparkle = (x, y, s = 30) =>
    `<svg class="sparkle" style="left:${x};top:${y};width:${s}px;height:${s}px" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1c.6 5.6 2.4 8.4 11 11-8.6 2.6-10.4 5.4-11 11-.6-5.6-2.4-8.4-11-11 8.6-2.6 10.4-5.4 11-11z" fill="#000"/></svg>`;

  const topbar = (title, back) =>
    `<div class="topbar">${back ? `<button class="back" data-act="back" aria-label="Back">${icon("back", 20, 3)}</button>` : "<span></span>"}<h1 class="page-title">${esc(title)}</h1><span></span></div>`;

  /* ======================= week chart (used in several places) ======================= */
  // lanes: [{name, color, times:[{d,s,e,label}]}]; highlights overlaps between lanes marked `hot`
  function gantt(lanes, days, opts = {}) {
    const START = 8 * 60, END = 20 * 60;
    const pct = (m) => ((m - START) / (END - START)) * 100;
    const hours = []; for (let h = 8; h <= 20; h += 1) hours.push(h);
    const hot = lanes.filter((l) => l.hot);
    const others = lanes.filter((l) => !l.hot);
    return `<div class="gantt ${opts.compact ? "compact" : ""}">
      <div class="g-head"><span></span><div class="g-hours">${hours.filter((h) => h % 2 === 0).map((h) => `<span style="left:${pct(h * 60)}%">${h > 12 ? h - 12 : h}${h >= 12 ? "p" : "a"}</span>`).join("")}</div></div>
      ${days.map((d) => `<div class="g-row"><div class="g-day">${DAYS[d].slice(0, d >= 5 ? 2 : 1)}</div><div class="g-lanes">
        <div class="g-lines">${hours.map((h) => `<i style="left:${pct(h * 60)}%"></i>`).join("")}</div>
        ${(lanes.length ? lanes : [{ times: [], color: "" }]).map((l) => `<div class="g-lane">${blocksWithLabel(l.times).filter((x) => x.d === d).map((x) => {
          const clash = hot.length && (l.hot ? others : hot).some((o) => o.times.some((y) => overlaps(x, y)));
          return `<span class="g-bar ${clash ? "clash" : ""}" title="${esc((l.name ? l.name + ": " : "") + (x.label || ""))} ${fmt(x.s)}–${fmt(x.e)}" style="left:${pct(x.s)}%;width:${pct(x.e) - pct(x.s)}%;background:${clash ? "var(--salmon)" : l.color}">${opts.labels && x.label ? `<em>${esc(x.label)}</em>` : ""}</span>`;
        }).join("")}</div>`).join("")}
      </div></div>`).join("")}
    </div>`;
  }
  function blocksWithLabel(times) {
    const out = [];
    times.slice().sort((a, b) => a.d - b.d || a.s - b.s).forEach((x) => {
      const last = out[out.length - 1];
      if (last && last.d === x.d && last.label === x.label && x.s - last.e <= 15) last.e = Math.max(last.e, x.e);
      else out.push({ d: x.d, s: x.s, e: x.e, label: x.label });
    });
    return out;
  }
  const labelled = (classes) => classes.flatMap((k) => k.times.map((x) => ({ ...x, label: k.code.replace(/^BA/, "") })));
  function activeDays(timesLists) {
    const used = new Set();
    timesLists.forEach((ts) => ts.forEach((x) => used.add(x.d)));
    return [0, 1, 2, 3, 4].concat([5, 6].filter((d) => used.has(d)));
  }

  /* ======================= pages ======================= */
  function courseProgress(code) {
    const c = COURSES[code];
    const sel = selected().filter((k) => k.code === code);
    const need = c.groups.filter((g) => g !== "other").length || 1;
    const have = c.groups.includes("other") && sel.length ? need : new Set(sel.map((k) => k.group)).size;
    return { sel, need, have: Math.min(have, need) };
  }

  function pageHome() {
    const sel = selected();
    const codes = [...new Set(sel.map((k) => k.code))];
    const cr = codes.reduce((a, c) => a + credits(c), 0);
    const mins = sel.reduce((a, k) => a + k.times.reduce((x, y) => x + (y.e - y.s), 0), 0);
    const clashes = allClashes(sel);
    const incomplete = codes.filter((c) => { const p = courseProgress(c); return p.have < p.need; });
    const outside = sel.filter((k) => k.times.length && !k.prp);
    const lastScrape = new Date(DATA.scrapedAt);
    return `
      <section class="card hero">
        ${sparkle("14px", "18px", 26)}${sparkle("calc(100% - 44px)", "14px", 30)}${sparkle("calc(100% - 38px)", "calc(100% - 46px)", 22)}${sparkle("22px", "calc(100% - 44px)", 20)}
        <span class="chip big">${esc(DATA.semester)}</span>
        <h1>FFCS<br>Planner</h1>
        <p>${esc(plan().name)} · VIT Vellore</p>
      </section>
      <section class="card stats" style="margin-top:14px">
        <div><div class="stat-num">${codes.length}</div><div class="stat-label">Courses</div></div>
        <div><div class="stat-num">${cr}</div><div class="stat-label">Credits*</div></div>
        <div><div class="stat-num">${Math.round(mins / 60)}</div><div class="stat-label">Hours / week</div></div>
      </section>
      <div class="chips" style="margin:14px 2px 0;justify-content:center">
        ${clashes.length ? `<span class="chip salmon big">${clashes.length} clash${clashes.length > 1 ? "es" : ""} in this plan</span>` : `<span class="chip mint big">No clashes</span>`}
        ${incomplete.length ? `<span class="chip peach big">${incomplete.length} course${incomplete.length > 1 ? "s" : ""} missing a theory or lab</span>` : ""}
        ${sel.length ? (outside.length ? `<span class="chip peach big">${outside.length} class${outside.length > 1 ? "es" : ""} outside PRP</span>` : `<span class="chip lav big">All in PRP</span>`) : ""}
      </div>
      <hr class="rule">
      <div class="two-col">
        <section>
          <h2 class="section-title">My Courses <a class="btn sm lime" href="#/courses">${icon("plus", 14, 3)} Add</a></h2>
          ${codes.length ? codes.map((code) => myCourseCard(code, clashes)).join("") : `
            <div class="card empty"><div class="big">Nothing yet</div><div class="muted">Pick courses yourself, or let the planner build three clash-free timetables for you.</div>
            <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:14px"><a class="btn lime" href="#/plans">${icon("spark", 16)} Make plans for me</a><a class="btn" href="#/courses">Browse courses</a></div></div>`}
        </section>
        <hr class="rule">
        <section>
          <h2 class="section-title">Actions</h2>
          <div class="grid2 actions wide2">
            <a class="action-tile" style="background:var(--lime)" href="#/plans">Smart Plans</a>
            <a class="action-tile" style="background:var(--lavender)" href="#/courses">Courses</a>
            <a class="action-tile" style="background:var(--mint)" href="#/timetable">Timetable</a>
            <a class="action-tile" style="background:var(--cyan)" href="#/schedule">Friends</a>
          </div>
          ${clashes.length ? `<div class="card tight" style="margin-top:16px;background:#fff3f3">
            <h3 class="section-title" style="font-size:15px">Clashes</h3>
            ${clashes.map(([a, b]) => `<div class="small" style="font-weight:700;margin:4px 0">${esc(a.code)} ${esc(a.slots)} ✕ ${esc(b.code)} ${esc(b.slots)}</div>`).join("")}
          </div>` : ""}
          <p class="footer-note">*Credits for your courses and Level I languages are set; others are estimates, since VTOP's allocation page doesn't list them.<br>Course list from VTOP, updated ${lastScrape.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}. Your plans are saved in this browser only.</p>
        </section>
      </div>`;
  }

  function myCourseCard(code, clashes) {
    const c = COURSES[code];
    const { sel, need, have } = courseProgress(code);
    const clashIds = new Set(clashes.flat().map((k) => k.id));
    const anyClash = sel.some((k) => clashIds.has(k.id));
    const facs = [...new Set(sel.map((k) => titleCase(k.faculty)))];
    return `
      <div class="card mc" data-mc="${esc(code)}">
        <div class="mc-head">
          <div>
            <h3>${esc(c.title)}</h3>
            <div class="chips"><span class="chip cyan">${esc(code)}</span>
              ${sel.map((k) => `<span class="chip ${k.group === "lab" ? "cyan" : k.group === "th" ? "mint" : "peach"}">${esc(k.slots === "NIL" ? TYPE_NAMES[k.type] || k.type : k.slots)}</span>`).join("")}
              ${have < need ? `<span class="chip peach">${c.groups.includes("lab") && !sel.some((k) => k.group === "lab") ? "Needs lab" : "Needs theory"}</span>` : ""}
              ${anyClash ? `<span class="chip salmon">Clash</span>` : ""}
            </div>
            <div class="small muted" style="margin-top:6px">${esc(facs.join(" & "))}</div>
          </div>
          <button class="mc-toggle" data-act="toggle" aria-label="Show details">${icon("chev", 22, 3)}</button>
        </div>
        <div class="mc-body">
          ${sel.map((k) => `<div class="mc-row">
            <div><div style="font-weight:800">${esc(k.slots)} ${typeChip(k.type)}</div>
            <div class="small" style="font-weight:700">${whenText(k.times)}</div>
            <div class="small muted">${esc(titleCase(k.faculty))} · ${esc(k.venue)}${k.times.length && !k.prp ? " · outside PRP" : ""}</div></div>
            <button class="icon-btn salmon" data-act="remove" data-ids="${k.id}" aria-label="Remove">${icon("trash", 16)}</button>
          </div>`).join("")}
          <a class="btn sm lav" style="margin-top:8px" href="#/course/${encodeURIComponent(code)}">Change faculty or slots</a>
        </div>
      </div>`;
  }

  let courseQuery = "";
  let courseCat = "ALL";
  function pageCourses() {
    const cats = ["ALL", ...new Set(DATA.courses.map((c) => c.cat))];
    return `
      ${topbar("Courses")}
      <p class="page-sub">${DATA.courses.length} courses · ${CLASSES.length} classes</p>
      <div class="toolbar"><input class="input" id="q" type="search" placeholder="Search course, code or faculty" value="${esc(courseQuery)}" autocomplete="off"></div>
      <div class="tabs">${cats.map((c) => `<button class="tab ${c === courseCat ? "active" : ""}" data-act="cat" data-cat="${c}">${c === "ALL" ? "All" : c}</button>`).join("")}</div>
      <div id="course-list" class="grid2"></div>`;
  }
  function renderCourseList() {
    const q = courseQuery.trim().toLowerCase();
    const list = DATA.courses.filter((c) =>
      (courseCat === "ALL" || c.cat === courseCat) &&
      (!q || c.title.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || c.classes.some((k) => k[2].toLowerCase().includes(q))));
    $("#course-list").innerHTML = list.length ? list.map((c) => {
      const { need, have } = courseProgress(c.code);
      const pct = Math.round((have / need) * 100);
      const facs = new Set(c.classes.map((k) => k[2])).size;
      return `<a class="course-card" href="#/course/${encodeURIComponent(c.code)}">
        <div class="bar"><i class="${pct >= 100 ? "full" : ""}" style="width:${pct}%;${pct === 0 ? "border:0" : ""}"></i></div>
        <h3>${esc(c.title)}</h3>
        <div class="code">${esc(c.code)} · ${facs} facult${facs > 1 ? "ies" : "y"} · ${credits(c.code)} cr</div>
        <div class="chips">${c.embedded ? `<span class="chip mint">Theory</span><span class="chip cyan">Lab</span>` : c.groups.map((g) => `<span class="chip ${g === "lab" ? "cyan" : g === "th" ? "mint" : "peach"}">${g === "lab" ? "Lab" : g === "th" ? "Theory" : TYPE_NAMES[c.types.find((x) => typeGroup(x) === "other")] || "Other"}</span>`).join("")}
          ${pct >= 100 ? `<span class="chip lime">Added</span>` : pct > 0 ? `<span class="chip peach">Half</span>` : ""}</div>
      </a>`;
    }).join("") : `<div class="card empty" style="grid-column:1/-1"><div class="big">No match</div><div class="muted">Try a different search.</div></div>`;
  }

  let detailFaculty = "";
  let hideClash = false;
  let prpOnly = false;
  function pageCourse(code) {
    const c = COURSES[code];
    if (!c) return `${topbar("Details", true)}<div class="card empty"><div class="big">Course not found</div></div>`;
    const sel = selected();
    const mine = sel.filter((k) => k.code === code);
    const mineIds = new Set(mine.map((k) => k.id));
    const others = sel.filter((k) => k.code !== code);
    const q = detailFaculty.trim().toLowerCase();
    let info = c.options.map((o) => {
      const ks = optClasses(o);
      const parts = ks.map((k) => ({ k, clash: clashesOf(k, others) }));
      return { o, ks, parts, clashN: parts.reduce((a, p) => a + p.clash.length, 0), on: o.every((i) => mineIds.has(i)), prp: ks.every((k) => k.prp || !k.times.length) };
    }).filter((x) => !q || x.ks.some((k) => k.faculty.toLowerCase().includes(q) || k.slots.toLowerCase().includes(q) || k.venue.toLowerCase().includes(q)));
    const total = info.length;
    if (hideClash) info = info.filter((x) => x.on || !x.clashN);
    if (prpOnly) info = info.filter((x) => x.on || x.prp);
    info.sort((a, b) => (b.on - a.on) || ((a.clashN > 0) - (b.clashN > 0)) || (b.prp - a.prp) ||
      a.ks[0].slots.localeCompare(b.ks[0].slots, undefined, { numeric: true }) || a.ks[0].faculty.localeCompare(b.ks[0].faculty));
    const free = info.filter((x) => !x.clashN).length;
    return `
      ${topbar("Details", true)}
      <div class="card" style="text-align:center">
        <h2 style="margin:0 0 10px;font-size:19px;font-weight:800">${esc(c.title)}</h2>
        <div class="chips" style="justify-content:center">
          <span class="chip cyan big">${esc(code)}</span>
          <span class="chip lav big">${esc(CAT_NAMES[c.cat] || c.cat)}</span>
          <span class="chip lav big">${credits(code)} credits*</span>
          ${c.types.map((ty) => typeChip(ty)).join("")}
        </div>
        ${c.embedded ? `<p class="small" style="margin:12px 0 0;font-weight:600">Theory and lab are taught by the same faculty, so you pick a faculty and get both. A morning theory comes with an afternoon lab, and the other way round.</p>` : ""}
        ${mine.length ? `<hr class="rule" style="margin:14px 0"><div class="chips" style="justify-content:center">${mine.map((k) =>
          `<span class="chip lime big">${esc(k.slots === "NIL" ? TYPE_NAMES[k.type] : k.slots)} · ${esc(titleCase(k.faculty))}</span>`).join("")}</div>` : ""}
      </div>
      <hr class="rule">
      <div class="toolbar">
        <input class="input" id="fq" type="search" placeholder="Filter by faculty, slot or venue" value="${esc(detailFaculty)}" autocomplete="off">
      </div>
      <div class="chips" style="margin:-2px 0 12px">
        <button class="btn sm ${hideClash ? "lime" : ""}" data-act="hideclash">${hideClash ? icon("check", 14, 3) : ""} Hide clashes</button>
        <button class="btn sm ${prpOnly ? "lime" : ""}" data-act="prponly">${prpOnly ? icon("check", 14, 3) : ""} PRP only</button>
      </div>
      <p class="small" style="font-weight:700;margin:0 2px 12px">${info.length} of ${total} ${c.embedded ? "faculty options" : "options"} · ${free} fit your plan</p>
      <div class="grid2 wide2">
        ${info.map((x) => optionCard(code, x)).join("") || `<div class="card empty" style="grid-column:1/-1"><div class="big">No options</div><div class="muted">Try turning off a filter.</div></div>`}
      </div>`;
  }

  function optionCard(code, { o, ks, parts, clashN, on, prp }) {
    const c = COURSES[code];
    const fac = titleCase(ks[0].faculty);
    const notPRP = ks.filter((k) => k.times.length && !k.prp);
    const ids = o.join(",");
    return `<div class="opt ${on ? "sel" : clashN ? "clash" : ""}">
      <div class="opt-head">
        <div class="opt-fac">${facPref(ks[0].faculty) > 0 ? "♥ " : ""}${esc(fac)}${facRating(ks[0].faculty) ? ` <span class="chip lav">You: ${facRating(ks[0].faculty)}/5</span>` : ""}${commChip(ks[0].faculty)}${facPref(ks[0].faculty) < 0 ? ' <span class="chip salmon">Avoid</span>' : ""}</div>
        <button class="icon-btn" data-act="compare" data-code="${esc(code)}" data-ids="${ids}" aria-label="Compare on your week" title="Compare on your week">${icon("eye", 17)}</button>
      </div>
      ${parts.map(({ k, clash }) => `<div class="opt-part">
        <div class="chips"><span class="chip ${k.group === "lab" ? "cyan" : k.group === "th" ? "mint" : "peach"}">${k.group === "lab" ? "Lab" : k.group === "th" ? "Theory" : TYPE_NAMES[k.type] || k.type}</span>
          <span class="chip lav"><b>${esc(k.slots === "NIL" ? "No slot" : k.slots)}</b></span><span class="chip ${k.prp || !k.times.length ? "peach" : "salmon"}">${esc(k.venue === "NIL" ? "Online" : k.venue)}</span></div>
        <div class="when">${whenText(k.times)}${k.group === "lab" && blocksOf(k.times).length > 1 ? ` <span class="chip cyan">${blocksOf(k.times).length} labs a week</span>` : ""}</div>
        ${clash.length && !on ? `<div class="why">✕ Clashes with ${clash.map((o2) => `<b>${esc(o2.title)}</b> (${esc(o2.slots)}, ${esc(whenText(o2.times.filter((y) => k.times.some((z) => overlaps(y, z)))))})`).join("; ")}</div>` : ""}
      </div>`).join("")}
      ${notPRP.length ? `<div class="note">Note: ${notPRP.map((k) => `${k.group === "lab" ? "lab" : "theory"} is in ${esc(k.venue)}`).join(", ")}, outside PRP.</div>` : ""}
      <div class="opt-foot">
        ${on ? `<button class="btn sm salmon" data-act="remove" data-ids="${ids}">Remove</button>`
          : `<button class="btn sm ${clashN ? "" : "lime"}" data-act="add" data-code="${esc(code)}" data-ids="${ids}">${courseProgress(code).sel.length ? "Swap to this" : c.embedded && o.length > 1 ? "Add theory + lab" : "Add"}</button>`}
      </div>
    </div>`;
  }

  function compareModal(code, ids) {
    const cand = ids.map((i) => CLASSES[i]);
    const others = selected().filter((k) => k.code !== code);
    const current = selected().filter((k) => k.code === code);
    const lanes = [
      { name: "Your plan", color: "var(--lime)", times: labelled(others) },
      { name: "This option", color: "var(--cyan)", times: labelled(cand), hot: true },
    ];
    const clash = cand.flatMap((k) => clashesOf(k, others).map((o) => [k, o]));
    modal(`<h2>Compare on your week</h2>
      <p class="small" style="margin:0 0 4px;font-weight:700">${esc(titleCase(cand[0].faculty))} · ${cand.map((k) => esc(k.slots)).join(" + ")}</p>
      ${cand.map((k) => `<div class="small muted">${k.group === "lab" ? "Lab" : "Theory"}: ${whenText(k.times)}</div>`).join("")}
      <div class="card" style="padding:10px 8px;margin-top:12px">${gantt(lanes, activeDays(lanes.map((l) => l.times)), { labels: true })}</div>
      <div class="g-legend"><span class="chip lime">Your plan</span><span class="chip cyan">This option</span><span class="chip salmon">Clash</span>
        ${current.length ? `<span class="chip">Replaces your current ${esc(code)}</span>` : ""}</div>
      ${clash.length ? `<div class="why" style="margin-top:10px">${clash.map(([k, o]) => `✕ ${esc(k.slots)} overlaps ${esc(o.title)} (${esc(o.slots)})`).join("<br>")}</div>`
        : `<p class="small" style="font-weight:800;margin:10px 0 0">Fits your plan with no clashes.</p>`}
      <div class="row"><button class="btn" data-act="mclose">Close</button>
        <button class="btn ${clash.length ? "" : "lime"}" id="cmpadd">${current.length ? "Swap to this" : "Add"}</button></div>`,
    (root) => $("#cmpadd", root).addEventListener("click", () => { addOption(code, ids); closeModal(); render(); }));
  }

  let ttDay = null;
  function pageTimetable() {
    const sel = selected();
    const days = activeDays([sel.flatMap((k) => k.times)]);
    if (ttDay === null) { const today = (new Date().getDay() + 6) % 7; ttDay = days.includes(today) ? today : 0; }
    if (ttDay !== "W" && !days.includes(ttDay)) ttDay = 0;
    const tabs = `<div class="tabs">${days.map((d) => `<button class="tab ${ttDay === d ? "active" : ""}" data-act="day" data-d="${d}">${DAYS[d]}</button>`).join("")}
      <button class="tab ${ttDay === "W" ? "active" : ""}" data-act="day" data-d="W">Weekly</button></div>`;
    if (!sel.length) return `${topbar("Timetable")}${tabs}<div class="card empty"><div class="big">Empty week</div><div class="muted">Add courses to see your timetable.</div><a class="btn lime" style="margin-top:14px" href="#/courses">Browse courses</a></div>`;
    return `${topbar("Timetable")}${tabs}<div style="text-align:center;margin:-6px 0 14px"><a class="btn sm cyan" href="${viewLink(plan().sel, plan().name)}" target="_blank" rel="noopener">${icon("cal", 14)} Open full timetable</a></div>${ttDay === "W" ? weeklyGrid(sel, days) : dayView(sel, ttDay)}`;
  }

  function dayView(sel, d) {
    const blocks = [];
    sel.forEach((k) => blocksOf(k.times.filter((x) => x.d === d)).forEach((m) => blocks.push({ k, s: m.s, e: m.e })));
    blocks.sort((a, b) => a.s - b.s);
    const online = sel.filter((k) => !k.times.length);
    const onlineNote = online.length ? `<p class="footer-note">No fixed slot: ${online.map((k) => esc(k.title)).join(", ")}</p>` : "";
    if (!blocks.length) return `<div class="card empty"><div class="big">Free day</div><div class="muted">No classes on ${DAYS[d]}.</div></div>${onlineNote}`;
    const clashIds = new Set(allClashes(sel).flat().map((k) => k.id));
    let out = '<div class="timeline">';
    blocks.forEach((b, i) => {
      if (i > 0) {
        const gap = b.s - blocks[i - 1].e;
        if (gap >= 30) out += `<div class="tl-gap">${gap >= 60 ? Math.floor(gap / 60) + " h " : ""}${gap % 60 ? (gap % 60) + " min" : ""} free</div>`;
      }
      const perWeek = blocksOf(b.k.times).length;
      const isLab = b.k.group === "lab";
      out += `<div class="tl-row"><div class="tl-time">${fmt(b.s)}<span>${fmt(b.e)}</span></div>
        <div class="card tl-card ${isLab ? "lab" : "th"}" ${clashIds.has(b.k.id) ? 'style="background:#fff3f3"' : ""}>
          <div><h3>${esc(b.k.title)}</h3><div class="code">${esc(b.k.code)}</div>
            <div class="chips"><span class="chip lav">${esc(b.k.slots)}</span>${typeChip(b.k.type)}<span class="chip ${b.k.prp ? "peach" : "salmon"}">${esc(b.k.venue)}</span>
            ${clashIds.has(b.k.id) ? '<span class="chip salmon">Clash</span>' : ""}</div>
            <div class="small muted" style="margin-top:8px">${esc(titleCase(b.k.faculty))}</div></div>
          <div class="tl-big"><b>${perWeek}</b><small>${isLab ? "Labs" : "Classes"}<br>per week</small></div>
        </div></div>`;
    });
    return out + "</div>" + onlineNote;
  }

  function weeklyGrid(sel, days) {
    const cell = {};
    sel.forEach((k) => k.times.forEach((x) => { const key = `${x.kind}|${x.d}|${x.col}`; (cell[key] = cell[key] || []).push(k); }));
    const clashIds = new Set(allClashes(sel).flat().map((k) => k.id));
    const thHead = (i) => `${TH_TIMES[i][0]}<br>${TH_TIMES[i][1]}`;
    const labHead = (i) => `${LAB_TIMES[i][0]}<br>${LAB_TIMES[i][1]}`;
    const thCols = [0, 1, 2, 3, 4, null, "L", 5, 6, 7, 8, 9, 10];
    const labCols = [0, 1, 2, 3, 4, 5, "L", 6, 7, 8, 9, 10, 11];
    const td = (kind, d, col, sep) => {
      if (col === "L") return "";
      const cls = sep ? "day-sep " : "";
      if (col === null) return `<td class="${cls}">–</td>`;
      const slot = (kind === "th" ? TH_GRID : LAB_GRID)[d][col];
      const hits = cell[`${kind}|${d}|${col}`] || [];
      if (!hits.length) return `<td class="${cls}">${slot}</td>`;
      const st = hits.some((k) => clashIds.has(k.id)) || hits.length > 1 ? "clash" : kind;
      return `<td class="${cls}on ${st}">${slot}<br>${hits.map((k) => `${esc(k.code)}<br>${esc(k.venue)}`).join("<br>")}</td>`;
    };
    let rows = "";
    days.forEach((d) => {
      rows += `<tr><th class="day" rowspan="2">${DAYS[d].toUpperCase()}</th><th class="kind">Theory</th>${thCols.map((c) => c === "L" ? (d === days[0] ? `<td class="lunch" rowspan="${days.length * 2}">LUNCH</td>` : "") : td("th", d, c)).join("")}</tr>`;
      rows += `<tr><th class="kind day-sep">Lab</th>${labCols.map((c) => td("lab", d, c, true)).join("")}</tr>`;
    });
    const head = `<tr><th colspan="2">Theory</th>${thCols.map((c) => c === "L" ? `<th rowspan="2">Lunch</th>` : c === null ? "<th>–</th>" : `<th>${thHead(c)}</th>`).join("")}</tr>
      <tr><th colspan="2">Lab</th>${labCols.filter((c) => c !== "L").map((c) => `<th>${labHead(c)}</th>`).join("")}</tr>`;
    return `<div class="card" style="padding:0;overflow:hidden"><div class="scroll-x"><table class="slotgrid"><thead>${head}</thead><tbody>${rows}</tbody></table></div></div>
      <div class="chips" style="margin-top:12px;justify-content:center"><span class="chip mint">Theory</span><span class="chip cyan">Lab</span><span class="chip salmon">Clash</span></div>
      <p class="footer-note">Scroll sideways on a phone to see the whole week.</p>`;
  }

  function pageSchedule() {
    const sel = selected();
    const friends = state.friends;
    const fClasses = (f) => f.sel.map((i) => CLASSES[i]).filter(Boolean);
    const lanes = [];
    if (state.showMine) lanes.push({ name: "You", color: "var(--lime)", times: labelled(sel) });
    friends.forEach((f) => { if (f.show) lanes.push({ name: f.name, color: f.color, times: labelled(fClasses(f)) }); });
    const days = activeDays([labelled(sel)].concat(friends.map((f) => labelled(fClasses(f)))));
    const myCode = encode(plan().sel);
    return `
      ${topbar("Schedule")}
      <div class="card" style="padding:12px 10px 10px">
        ${gantt(lanes, days)}
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;gap:8px;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:8px;font-weight:700"><button class="check ${state.showMine ? "on" : ""}" data-act="showmine" aria-label="Show my schedule">${state.showMine ? icon("check", 14, 3.4) : ""}</button> Show my schedule</label>
          ${commonFree(lanes, days)}
        </div>
      </div>
      <hr class="rule">
      <div class="two-col">
        <section>
          <h2 class="section-title">Friends
            <span style="display:flex;gap:8px">${friends.length ? `<button class="btn sm salmon" data-act="delall">Delete all ${icon("trash", 14)}</button>` : ""}
            <button class="btn sm lime" data-act="addfriend">Add ${icon("plus", 14, 3)}</button></span></h2>
          ${friends.length ? friends.map((f) => `
            <div class="friend">
              <button class="check ${f.show ? "on" : ""}" data-act="ftoggle" data-f="${f.id}" aria-label="Show ${esc(f.name)}">${f.show ? icon("check", 14, 3.4) : ""}</button>
              <div><div class="name"><span class="swatch" style="background:${f.color};vertical-align:-3px;margin-right:6px"></span>${esc(f.name)}</div>
                <div class="small muted">${f.sel.length} classes · ${sharedCount(sel, f)} in common with you</div></div>
              <div class="acts">
                <button class="icon-btn lav" data-act="fedit" data-f="${f.id}" aria-label="Edit">${icon("pen", 16)}</button>
                <button class="icon-btn salmon" data-act="fdel" data-f="${f.id}" aria-label="Delete">${icon("trash", 16)}</button>
              </div>
            </div>`).join("") : `<div class="card empty"><div class="big">No friends yet</div><div class="muted">Ask a friend for their timetable code, then tap Add.</div></div>`}
          <p class="small center" style="font-weight:700;margin-top:10px">${friends.length}/8 added</p>
        </section>
        <hr class="rule">
        <section>
          <div class="card">
            <h2 class="section-title" style="justify-content:center">My Timetable Code</h2>
            <p class="small muted center" style="margin:0">Share this with friends so they can overlay your plan.</p>
            <div class="code-box">${esc(myCode)}</div>
            <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
              <button class="btn lime" data-act="copycode">${icon("copy", 16)} Copy code</button>
              <button class="btn lav" data-act="copylink">Copy link</button>
            </div>
          </div>
        </section>
      </div>`;
  }
  function sharedCount(sel, f) { const mine = new Set(sel.map((k) => k.id)); return f.sel.filter((i) => mine.has(i)).length; }
  function commonFree(lanes, days) {
    if (lanes.length < 2) return "";
    let free = 0;
    for (const d of days) for (let h = 8; h < 19; h++) {
      if (h === 13) continue;
      const s = h * 60, e = s + 50;
      if (lanes.every((l) => !l.times.some((x) => x.d === d && x.s < e && s < x.e))) free++;
    }
    return `<span class="chip mint big">${free} common free hours</span>`;
  }

  /* ======================= smart plans (engine in planner.js, run in a Web Worker) ======================= */
  const GEN_DEFAULTS = { max8: 1, max9: 9, labs: "am", labFree: 2, maxLabs: 2, labStretch: "prefer", lunchSkip: 1, prp: "all", endBy: 99, extra: "BAESP101" };
  const genPrefs = () => {
    const p = Object.assign({}, GEN_DEFAULTS, state.gen || {});
    if (state.gen && state.gen.lunchSkip === undefined && state.gen.lunch !== undefined) p.lunchSkip = state.gen.lunch ? 0 : 99;
    if (p.labs !== "am" && p.labs !== "any") p.labs = "am"; // evening labs are no longer offered
    return p;
  };
  const facPref = (name) => (state.fac && state.fac[name] && state.fac[name].pref) || 0;
  const LUNCH_END = t("13:20"), AFTERNOON = t("14:00");
  const metrics = window.FFCSPlanner.metrics;
  const BOARD_MARKS = (window.FFCS_RATINGS && window.FFCS_RATINGS.board) || {};
  const boardChip = (name) => { const b = BOARD_MARKS[name]; return b ? ` <span class="chip ${b[0] === "star" ? "lime" : b[0] === "avoid" ? "salmon" : "lav"}" title="Mark from FFCS Board (study material, strictness)">${b[0] === "star" ? "★ Board pick" : b[0] === "avoid" ? "Board: avoid" : "Board: okay"}</span>` : ""; };
  const commChip = (name) => { const c = commOf(name); return (c ? ` <span class="chip pink" title="Student review site rating">${c[0]}/10 · ${c[1]} review${c[1] > 1 ? "s" : ""}</span>` : "") + boardChip(name); };
  const facRating = (name) => { const f = state.fac && state.fac[name]; return f && f.rating ? Number(f.rating) : 0; };
  // Community ratings (out of 10) from a student review site; used when you haven't rated someone.
  const COMM = (window.FFCS_RATINGS && window.FFCS_RATINGS.faculty) || {};
  const commOf = (name) => COMM[name] || null;
  const labCount = (codes) => codes.reduce((a, c) => a + (COURSES[c] && COURSES[c].embedded
    ? Math.max(...COURSES[c].ids.map((i) => CLASSES[i]).filter((k) => k.group === "lab").map((k) => k.slotList.length / 2)) : 0), 0);

  // which of your answers a timetable crosses
  function bendsOf(o, prefs) {
    const m = o.m, out = [];
    const ks = o.ids.map((i) => CLASSES[i]);
    if (prefs.max8 < 9 && m.earlyDays > prefs.max8) out.push(`${m.earlyDays} days with 8 AM (you said ${prefs.max8})`);
    if (prefs.labFree > 0 && m.noLabDays < prefs.labFree) out.push(`${m.noLabDays} lab-free days (you wanted ${prefs.labFree})`);
    if (prefs.maxLabs < 9 && m.maxLabsDay > prefs.maxLabs) out.push(`${m.maxLabsDay} labs on one day (you said up to ${prefs.maxLabs})`);
    if (prefs.labs === "am") {
      const wrong = ks.filter((k) => k.times.length && (k.group === "lab" ? halfOf(k) !== "am" : halfOf(k) !== "pm"));
      if (wrong.length) out.push(`${wrong.map((k) => `${k.code} ${k.slots}`).join(", ")} not in the morning-labs pattern`);
    }
    if (prefs.max9 < 9 && m.nineDays > prefs.max9) out.push(`${m.nineDays} days starting 9–10 AM (you said ${prefs.max9})`);
    if (prefs.lunchSkip < 99 && m.lunchDays > prefs.lunchSkip) out.push(`${m.lunchDays} days without lunch (you said ${prefs.lunchSkip})`);
    if (prefs.endBy < 99 && m.lastEnd > prefs.endBy * 60) out.push(`ends at ${fmt(m.lastEnd)} (you said by ${prefs.endBy - 12} PM)`);
    if (prefs.labStretch === "prefer" && m.labGap > 30) out.push(`labs not back-to-back on some days (${Math.round(m.labGap / 60 * 10) / 10} h between labs)`);
    const outPRP = ks.filter((k) => k.times.length && !k.prp).length;
    if (prefs.prp === "all" && outPRP) out.push(`${outPRP} class${outPRP > 1 ? "es" : ""} outside PRP`);
    return out;
  }

  // Plan 7: Plan 3 ("Discrete + Chinese") from ffcs-board.vercel.app with Chinese dropped.
  // Class ids point into data.js; each was matched by course, slots and venue.
  const BOARD = { id: "board", name: "FFCS Board Plan 3, no Chinese", color: "var(--sky)",
    blurb: "The same timetable as Plan 3 on ffcs-board.vercel.app (Discrete, not Calculus), with Chinese taken out and its slots left empty." };
  const BOARD_IDS = [397, 440, 492, 560, 564, 615, 685, 724, 273, 274, 926];
  function boardPlan(codes) {
    const ids = BOARD_IDS.filter((i) => CLASSES[i] && codes.includes(CLASSES[i].code));
    const missing = [];
    codes.filter((c) => !ids.some((i) => CLASSES[i].code === c)).forEach((c) => {
      const taken = ids.flatMap((i) => CLASSES[i].times);
      const o = COURSES[c].options.find((op) => !(COURSES[c].embedded && op.length < 2) && !timesClash(optTimes(op), taken));
      if (o) ids.push(...o); else missing.push(c);
    });
    const ks = ids.map((i) => CLASSES[i]);
    const alt = {};
    [...new Set(ks.map((k) => k.code))].forEach((code) => {
      const key = ks.filter((k) => k.code === code).map((k) => k.slots).join("|");
      alt[code] = COURSES[code].options.filter((o) => optClasses(o).map((k) => k.slots).join("|") === key && !o.some((i) => ids.includes(i)))
        .map((o) => CLASSES[o[0]].faculty);
    });
    return { profile: BOARD, options: [{ ids, m: metrics(ks.flatMap((k) => k.times)), alt, label: "Main", sig: "board" }], backups: [], boardMissing: missing };
  }

  // run the planner in the background so the page stays responsive
  const VER = (document.currentScript && document.currentScript.src.split("?")[1]) || "";
  let worker = null;
  function runPlanner(codes, label) {
    return new Promise((resolve) => {
      if (worker) worker.terminate();
      worker = new Worker("planner-worker.js" + (VER ? "?" + VER : ""));
      worker.onmessage = (e) => {
        const d = e.data;
        if (d.type === "progress") setProgress(d.msg + label, d.pct);
        else { worker.terminate(); worker = null; resolve(d.res); }
      };
      worker.onerror = (err) => { resolve({ error: "The planner hit a problem: " + (err.message || "unknown error") + ". Try again." }); };
      const fac = {};
      Object.entries(state.fac || {}).forEach(([n, v]) => { fac[n] = { pref: v.pref || 0, rating: v.rating || 0 }; });
      worker.postMessage({ codes, prefs: genPrefs(), fac });
    });
  }
  function setProgress(msg, pct) {
    const el = $("#gen-progress");
    if (!el) return;
    el.querySelector(".gp-msg").textContent = msg;
    el.querySelector(".gp-bar i").style.width = Math.max(3, Math.min(100, pct)) + "%";
  }
  // add display details (week metrics) to what the worker sent back
  function dressScenario(res, codes, withBoard) {
    if (res.error) return res;
    const dress = (o) => { if (!o || o.missing) return o; o.m = metrics(o.ids.flatMap((i) => CLASSES[i].times)); return o; };
    res.plans.forEach((p) => { p.options.forEach(dress); p.backups.forEach(dress); });
    if (withBoard) res.plans.push(boardPlan(codes));
    res.credits = codes.reduce((a, c) => a + credits(c), 0);
    return res;
  }
  async function generateAll() {
    const codes = state.genCourses.filter((c) => COURSES[c]);
    const prefs = genPrefs();
    genResult = { loading: true };
    render();
    const out = $("#gen-out"); if (out) out.scrollIntoView({ behavior: "smooth", block: "start" });
    const res = dressScenario(await runPlanner(codes, ""), codes, true);
    genResult = { base: res, extra: null, extraCode: prefs.extra && COURSES[prefs.extra] && !codes.includes(prefs.extra) ? prefs.extra : null, view: "base" };
    for (const k in genSel) delete genSel[k];
    for (const k in genBk) delete genBk[k];
    render();
  }
  async function generateExtra() {
    const codes = state.genCourses.filter((c) => COURSES[c]).concat(genResult.extraCode);
    genResult.view = "extra";
    genResult.extraLoading = true;
    render();
    genResult.extra = dressScenario(await runPlanner(codes, ` (with ${COURSES[genResult.extraCode].title})`), codes, false);
    genResult.extraLoading = false;
    render();
  }

  let genResult = null;
  const genSel = {}; // which variation is shown per plan card
  const seg = (name, value, opts) => `<div class="qseg">${opts.map(([v, label]) =>
    `<button class="tab ${String(value) === String(v) ? "active" : ""}" data-act="gpref" data-k="${name}" data-v="${v}">${label}</button>`).join("")}</div>`;

  function splitText(nLabs, labDays, maxPer) {
    if (!labDays) return "";
    const per = Math.floor(nLabs / labDays), extra = nLabs % labDays;
    const parts = Array.from({ length: labDays }, (_, i) => per + (i < extra ? 1 : 0)).filter((x) => x > 0);
    return parts.join("-");
  }

  function pagePlans() {
    const gc = state.genCourses.filter((c) => COURSES[c]);
    const totalCr = gc.reduce((a, c) => a + credits(c), 0);
    const addable = DATA.courses.filter((c) => !gc.includes(c.code));
    const pr = genPrefs();
    const liked = Object.values(state.fac || {}).filter((f) => f.pref > 0).length;
    const avoided = Object.values(state.fac || {}).filter((f) => f.pref < 0).length;
    const nLabs = labCount(gc);
    const labDays = pr.labFree > 0 ? 5 - pr.labFree : null;
    const fitsSplit = !labDays || pr.maxLabs >= 9 || pr.maxLabs * labDays >= nLabs;
    return `
      ${topbar("Plans")}
      <section class="card" style="background:var(--lime)">
        <h2 class="section-title" style="font-size:19px;justify-content:flex-start;gap:8px">${icon("spark", 22, 2.6)} Smart Plans</h2>
        <p style="margin:0 0 12px;font-weight:600">Pick your courses and answer the questions. The planner checks every possible clash-free timetable, then gives you 6 clearly different plans (plus Plan 7 from FFCS Board), each with a variation and two backups that use completely different teachers.</p>
        <div class="chips" style="margin-bottom:10px">
          ${gc.map((c) => `<span class="chip big" style="background:var(--white)">${esc(COURSES[c].title)} · ${credits(c)} cr <button class="x" data-act="genrm" data-code="${c}" aria-label="Remove ${esc(COURSES[c].title)}">✕</button></span>`).join("")}
        </div>
        <div class="toolbar" style="margin-bottom:6px">
          <select class="input" id="genadd"><option value="">+ Add a course…</option>${addable.map((c) => `<option value="${c.code}">${esc(c.code)} · ${esc(c.title)}</option>`).join("")}</select>
        </div>
        <div style="text-align:right"><span class="chip big ${totalCr === 25 ? "mint" : "peach"}">${totalCr} credits*</span> <span class="chip big">${nLabs} lab sessions a week</span></div>
      </section>

      <section class="card questions" style="margin-top:14px">
        <h2 class="section-title">Must-haves</h2>
        <p class="small muted" style="margin:-4px 0 4px">Every plan keeps these, always. If nothing fits, the planner tells you which one it had to loosen.</p>
        <div class="q"><div class="q-l">All classes in PRP, or hybrid?</div>${seg("prp", pr.prp, [["all", "All PRP"], ["hybrid", "Hybrid is OK"]])}
          <div class="q-h">Courses with no PRP classes at all (like Spanish) are the only exception.</div></div>
        <div class="q"><div class="q-l">How many days can have an 8 AM class?</div>${seg("max8", pr.max8, [[0, "None"], [1, "1 day"], [2, "2 days"], [3, "3 days"], [9, "Any"]])}</div>
        <div class="q"><div class="q-l">Morning labs only?</div>${seg("labs", pr.labs, [["am", "Yes, morning labs"], ["any", "Either is fine"]])}
          <div class="q-h">Morning labs put every lab before lunch and every theory class (including Maths) after lunch.</div></div>
        <h2 class="section-title" style="margin-top:16px">Nice-to-haves</h2>
        <p class="small muted" style="margin:-4px 0 4px">Plans 1–4 follow these closely (the lab split and lab-free days come first). Plan 5 and Plan 6 may reshape them to reach their own goal, and every plan lists anything it bends. Each plan also gets its own lab days, so no two plans look alike.</p>
        <div class="q"><div class="q-l">How many weekdays would you like with no labs at all?</div>${seg("labFree", pr.labFree, [[0, "No rule"], [1, "1 day"], [2, "2 days"], [3, "3 days"]])}
          ${labDays ? `<div class="q-h">That puts your ${nLabs} lab sessions on ${labDays} day${labDays > 1 ? "s" : ""}.</div>` : ""}</div>
        <div class="q"><div class="q-l">How should the labs be split? (most labs on one day)</div>${seg("maxLabs", pr.maxLabs, [[1, "1 a day"], [2, `2 a day${labDays ? ` (${splitText(nLabs, labDays)})` : ""}`], [3, `3 a day${labDays && labDays <= 2 ? ` (${splitText(nLabs, Math.ceil(nLabs / 3))})` : ""}`], [9, "No limit"]])}
          <div class="q-h">${labDays ? `With ${labDays} lab days: 2 a day gives a ${splitText(nLabs, labDays)} split, 3 a day allows ${splitText(nLabs, Math.ceil(nLabs / 3))}.` : "Caps how many lab sessions can land on the same day."}${fitsSplit ? "" : ` <b>${labDays} days × ${pr.maxLabs} = ${labDays * pr.maxLabs} labs can't hold all ${nLabs}, so plans will get as close as they can.</b>`}</div></div>
        <div class="q"><div class="q-l">Keep a day's labs back-to-back?</div>${seg("labStretch", pr.labStretch, [["prefer", "Yes, in one stretch"], ["any", "Gaps are fine"]])}</div>
        <div class="q"><div class="q-l">How many days can you skip lunch?</div>${seg("lunchSkip", pr.lunchSkip, [[0, "None"], [1, "1 day"], [2, "2 days"], [3, "3"], [99, "Any"]])}
          <div class="q-h">Skipping lunch means a lab ending at 1:20 right before a 2 PM class.</div></div>
        <div class="q"><div class="q-l">How many days can start between 9 and 10 AM?</div>${seg("max9", pr.max9, [[0, "None"], [1, "1"], [2, "2"], [3, "3"], [9, "Any"]])}</div>
        <div class="q"><div class="q-l">When should your classes end at the latest?</div>${seg("endBy", pr.endBy, [[18, "By 6 PM"], [19, "By 7 PM"], [99, "Any time"]])}</div>
        <div class="q"><div class="q-l">Also show how it looks with one more course?</div>
          <select class="input" id="genextra"><option value="">No comparison</option>${addable.map((c) => `<option value="${c.code}" ${pr.extra === c.code ? "selected" : ""}>${esc(c.title)} (+${credits(c.code)} cr)</option>`).join("")}</select></div>
        <div class="q" style="border-bottom:0"><div class="q-l">Teachers you want or want to avoid</div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="chip mint">${liked} preferred</span><span class="chip salmon">${avoided} avoided</span>
          <a class="btn sm lav" href="#/teachers">Pick teachers & see reviews</a></div></div>
        <button class="btn block" style="margin-top:6px;background:var(--black);color:var(--lime)" data-act="generate" ${gc.length && !(genResult && genResult.loading) ? "" : "disabled"}>${icon("spark", 16)} ${genResult && genResult.loading ? "Working…" : "Make my plans"}</button>
      </section>
      <div id="gen-out">${genResult ? renderGen(genResult) : ""}</div>
      <hr class="rule">
      <h2 class="section-title">My saved plans</h2>
      <div class="stack">
        ${state.plans.map((p) => {
          const sel = p.sel.map((i) => CLASSES[i]).filter(Boolean);
          const n = new Set(sel.map((k) => k.code)).size;
          const cl = allClashes(sel).length;
          const on = p.id === state.active;
          return `<div class="card plan ${on ? "active" : ""}">
            <div><h3>${esc(p.name)}</h3><div class="chips">
              <span class="chip lav">${n} courses</span><span class="chip cyan">${[...new Set(sel.map((k) => k.code))].reduce((a, c) => a + credits(c), 0)} credits</span>
              ${cl ? `<span class="chip salmon">${cl} clash${cl > 1 ? "es" : ""}</span>` : ""}${on ? `<span class="chip lime">Active</span>` : ""}</div></div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
              ${on ? "" : `<button class="btn sm lime" data-act="pactive" data-p="${p.id}">Use</button>`}
              ${p.sel.length ? `<a class="icon-btn" href="${viewLink(p.sel, p.name)}" target="_blank" rel="noopener" aria-label="Open full timetable">${icon("cal", 16)}</a>` : ""}
              <button class="icon-btn" data-act="pcopy" data-p="${p.id}" aria-label="Duplicate">${icon("copy", 16)}</button>
              <button class="icon-btn lav" data-act="prename" data-p="${p.id}" aria-label="Rename">${icon("pen", 16)}</button>
              ${state.plans.length > 1 ? `<button class="icon-btn salmon" data-act="pdel" data-p="${p.id}" aria-label="Delete">${icon("trash", 16)}</button>` : ""}
            </div>
          </div>`;
        }).join("")}
      </div>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:18px;flex-wrap:wrap">
        <button class="btn lime" data-act="pnew">${icon("plus", 16, 3)} New plan</button>
        <button class="btn lav" data-act="pimport">Import a code</button>
        ${plan().sel.length ? `<button class="btn salmon" data-act="pclear">Clear active plan</button>` : ""}
      </div>
      <p class="footer-note">*Credits for your courses and Level I languages are set; others are estimates (theory + lab 4, theory only 3, online 2).</p>`;
  }

  const progressCard = (msg) => `<div class="card" id="gen-progress" style="margin-top:18px">
    <div class="gp-msg" style="font-weight:800;margin-bottom:10px">${esc(msg)}</div>
    <div class="gp-bar bar" style="height:18px"><i style="width:3%"></i></div>
    <p class="small muted" style="margin:10px 0 0">Every clash-free timetable is being checked, so this can take a little while with many courses.</p></div>`;

  function renderGen(res) {
    if (res.loading) return progressCard("Starting the planner…");
    const xName = res.extraCode ? COURSES[res.extraCode].title : "";
    let html = '<div style="margin-top:18px">';
    if (res.extraCode) {
      const xcr = res.base.credits + credits(res.extraCode);
      html += `<div class="seg" style="margin-bottom:12px">
        <button class="tab ${res.view !== "extra" ? "active" : ""}" data-act="gview" data-v="base">Without ${esc(xName)} · ${res.base.credits || 0} cr</button>
        <button class="tab ${res.view === "extra" ? "active" : ""}" data-act="gview" data-v="extra">With ${esc(xName)} · ${xcr} cr</button></div>`;
      if (res.extraLoading) return html + progressCard(`Planning with ${xName}…`) + "</div>";
      if (res.extra && !res.extra.error && !res.base.error) html += compareTable(res, xName);
    }
    const scen = res.view === "extra" && res.extra ? res.extra : res.base;
    if (scen.error) return html + `<div class="card" style="background:#fff3f3"><b>${esc(scen.error)}</b></div></div>`;
    const notes = [];
    if (scen.relaxed.length) notes.push(`No timetable could keep every must-have, so the planner loosened: <b>${esc(scen.relaxed.join(", then "))}</b>.`);
    if (scen.noPRP.length) notes.push(`${esc(scen.noPRP.map((c) => COURSES[c].title).join(", "))} ${scen.noPRP.length > 1 ? "have" : "has"} no PRP classes, so ${scen.noPRP.length > 1 ? "they sit" : "it sits"} in another block.`);
    const L = scen.limits || {};
    const pr = genPrefs();
    const unavoid = [];
    if (pr.lunchSkip < 99 && L.lunchDays > pr.lunchSkip) unavoid.push(`skipping lunch on ${L.lunchDays} days (you said ${pr.lunchSkip})`);
    if (pr.endBy < 99 && L.lastEnd > pr.endBy * 60) unavoid.push(`finishing after ${pr.endBy - 12} PM (earliest possible ${fmt(L.lastEnd)})`);
    if (pr.labStretch === "prefer" && L.labGap > 30) unavoid.push("a gap between labs on some day");
    if (pr.max9 < 9 && L.nineDays > pr.max9) unavoid.push(`${L.nineDays} days starting between 9 and 10 AM (you said ${pr.max9})`);
    if (pr.labFree > 0 && L.noLabDays < pr.labFree) unavoid.push(`at most ${L.noLabDays} lab-free day${L.noLabDays === 1 ? "" : "s"} (you asked for ${pr.labFree})`);
    if (pr.maxLabs < 9 && L.maxLabsDay > pr.maxLabs) unavoid.push(`at least ${L.maxLabsDay} labs on some day (you said up to ${pr.maxLabs})`);
    if (unavoid.length) notes.push(`With your must-haves, every possible timetable means ${esc(unavoid.join(" and "))}, so no plan can avoid that. Loosening a must-have (for example one more 8 AM day) can fix it.`);
    const K = scen.limitsKeep || {};
    if (!unavoid.length && pr.lunchSkip < 99 && K.lunchDays > pr.lunchSkip && L.lunchDays <= pr.lunchSkip)
      notes.push(`Keeping your lab split (${pr.labFree ? pr.labFree + " lab-free days, " : ""}up to ${pr.maxLabs < 9 ? pr.maxLabs : "any"} labs a day) means skipping lunch on ${K.lunchDays} days. Plans 1–4 keep the split, so they skip lunch ${K.lunchDays} days; only a different split could get it down to ${L.lunchDays}.`);
    if (scen.capped) notes.push(`Your answers allow over ${scen.count.toLocaleString("en-IN")} timetables, so the planner stopped there to keep your phone from running out of memory. Tightening a must-have (like the 8 AM limit or morning labs) gives a complete check.`);
    if (scen.amMiss.length) notes.push(`${esc(scen.amMiss.map((c) => COURSES[c].title).join(", "))} can't follow the morning-labs pattern, so it keeps its other timing.`);
    if (notes.length) html += `<div class="card tight" style="background:var(--peach);margin-bottom:14px"><b>Heads up:</b> ${notes.join(" ")}</div>`;
    html += `<p class="small" style="font-weight:700;margin:0 2px 12px">Checked ${scen.capped ? "" : "all "}${scen.count.toLocaleString("en-IN")} clash-free timetables that keep your must-haves. Each plan below differs from every other plan in at least ${Math.max(1, Math.min(...scen.plans.filter((p) => p.apart).map((p) => p.apart)) || 1)} courses.</p>`;
    whyNotes(scen.plans);
    html += `<div class="gen-grid">${scen.plans.map((p, i) => genCard(p, i, res.view === "extra" ? "x" : "b")).join("")}</div>`;
    return html + "</div>";
  }
  function compareTable(res, xName) {
    const n = Math.min(res.base.plans.length, res.extra.plans.length);
    const cell = (pl) => pl ? `${pl.options[0].m.hours} h/wk · ${pl.options[0].m.earlyDays}× 8 AM · ${pl.options[0].m.noLabDays} lab-free · ends ${fmt(pl.options[0].m.lastEnd)}` : "Doesn't fit";
    let rows = "";
    for (let i = 0; i < n; i++) rows += `<tr><th>${esc(res.base.plans[i].profile.name)}</th><td>${cell(res.base.plans[i])}</td><td>${cell(res.extra.plans[i])}</td></tr>`;
    return `<div class="card tight" style="margin-bottom:14px"><div class="scroll-x"><table class="cmp">
      <thead><tr><th></th><th>Without ${esc(xName)}</th><th>With ${esc(xName)}</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`;
  }
  // "Why this plan": what each plan does better than the others, worked out from the actual weeks
  function whyNotes(plans) {
    const ms = plans.map((p) => p.options[0].m);
    const rateOf = (p) => { const ks = p.options[0].ids.map((i) => CLASSES[i]); const fs = [...new Set(ks.map((k) => k.faculty))];
      return fs.reduce((a, f) => a + (facRating(f) ? facRating(f) * 2 : commOf(f) ? commOf(f)[0] : 5) + (BOARD_MARKS[f] ? (BOARD_MARKS[f][0] === "star" ? 2 : BOARD_MARKS[f][0] === "avoid" ? -2 : 0.5) : 0), 0) / fs.length; };
    const rates = plans.map((p) => (typeof p.rate === "number" ? p.rate / 2 + 0 : rateOf(p) - 999));
    const avgStart = (m) => m.startLate, endL = (m) => m.endLate;
    const facts = [
      { v: (m) => m.gaps, best: "min", text: (m) => `fewest gaps (${Math.round(m.gaps / 6) / 10} h a week)` },
      { v: avgStart, best: "min", text: () => "latest mornings of all plans" },
      { v: endL, best: "min", text: () => "earliest finishes of all plans" },
      { v: (m) => m.noLabDays, best: "max", text: (m) => `most lab-free weekdays (${m.noLabDays})` },
      { v: (m) => m.lightMins, best: "min", text: (m) => `lightest light days (${Math.round(m.lightMins / 6) / 10} h on your 3 easiest days)` },
      { v: (m) => m.lunchDays, best: "min", text: (m) => (m.lunchDays ? `fewest lunch skips (${m.lunchDays})` : "lunch every day") },
      { v: (m) => m.days, best: "min", text: (m) => `fewest days on campus (${m.days})` },
    ];
    plans.forEach((p, i) => {
      const m = ms[i], out = [];
      facts.forEach((f) => {
        const vals = ms.map(f.v);
        const target = f.best === "min" ? Math.min(...vals) : Math.max(...vals);
        const winners = vals.filter((x) => x === target).length;
        if (f.v(m) === target && winners <= 2 && winners < plans.length) out.push(f.text(m));
      });
      if (rates[i] === Math.max(...rates) && rates.filter((x) => x === rates[i]).length === 1) out.push("best-reviewed set of teachers");
      const labDays = [0, 1, 2, 3, 4].filter((d) => m.labsPerDay[d] > 0).map((d) => DAYS[d]);
      const sameLabs = ms.filter((x) => [0, 1, 2, 3, 4].filter((d) => x.labsPerDay[d] > 0).map((d) => DAYS[d]).join() === labDays.join()).length;
      if (sameLabs === 1 && labDays.length) out.push(`the only plan with labs on ${labDays.join(", ")}`);
      p.why = out.slice(0, 3);
    });
  }
  const genBk = {};
  const backupTabs = (p, key, bk) => (p.backups && p.backups.length ? `<div class="seg bk-seg" style="margin-bottom:10px">${["Plan A", ...p.backups.map((b) => b.label || "Backup")].map((lab, j) =>
    `<button class="tab ${j === bk ? "active" : ""}" data-act="gbk" data-key="${key}" data-j="${j}">${esc(lab)}</button>`).join("")}</div>` : "");
  function labSplitChip(m) {
    const days = [0, 1, 2, 3, 4].filter((d) => m.labsPerDay[d] > 0);
    return days.length ? `<span class="chip cyan">Labs ${days.map((d) => `${DAYS[d]} ${m.labsPerDay[d]}`).join(" · ")}</span>` : "";
  }
  function genCard(p, i, scenKey) {
    const key = scenKey + i;
    const bk = Math.min(genBk[key] || 0, (p.backups || []).length);
    const vi = bk ? 0 : Math.min(genSel[key] || 0, p.options.length - 1);
    const bkOpt = bk ? p.backups[bk - 1] : null;
    const head = `<div class="gen-head" style="background:${p.profile.color}">
        <div><div class="gen-k">Plan ${i + 1}</div><h3>${esc(p.profile.name)}</h3></div>`;
    if (bkOpt && bkOpt.missing) {
      return `<div class="card gen">${head}</div>${backupTabs(p, key, bk)}<p class="small" style="font-weight:700">No ${esc(bkOpt.label)}: once the earlier plans' teachers are left out, the remaining teachers' slots can't fit together with your must-haves.</p></div>`;
    }
    const o = bkOpt || p.options[vi];
    const ks = o.ids.map((id) => CLASSES[id]);
    const codes = [...new Set(ks.map((k) => k.code))];
    const cr = codes.reduce((a, c) => a + credits(c), 0);
    const outside = ks.filter((k) => k.times.length && !k.prp);
    const lanes = [{ name: p.profile.name, color: p.profile.color, times: labelled(ks) }];
    const changed = (o.changed || []).map(([c, k]) => `${COURSES[c].title} → ${k.replace("|", " + ")}`);
    const bends = bendsOf(o, genPrefs());
    const likedFac = [...new Set(ks.filter((k) => facPref(k.faculty) > 0).map((k) => k.faculty))];
    const name = `Plan ${i + 1}${bk ? " " + o.label : vi ? " " + o.label : ""}: ${p.profile.name}`;
    return `<div class="card gen">
      ${head}<span class="chip big">${cr} cr</span></div>
      <p class="small" style="margin:10px 0 8px;font-weight:600">${esc(p.profile.blurb)}${p.boardMissing && p.boardMissing.length ? ` Couldn't fit ${esc(p.boardMissing.join(", "))} around it.` : ""}${p.sameTiming ? " (Only a few timetables fit your must-haves, so this one shares a timing with another plan but uses other teachers.)" : ""}</p>
      ${backupTabs(p, key, bk)}
      ${bk ? `<div class="small" style="font-weight:700;margin:-4px 0 8px">Uses none of the teachers in Plan A${bk === 2 ? " or Backup B" : ""}${o.kept && o.kept.length ? ` (except ${esc(o.kept.map((c) => COURSES[c].title).join(", "))}, which has no other teacher)` : ""}, so you can switch to it whole if someone's full.</div>` : ""}
      ${p.options.length > 1 ? `<div class="seg" style="margin-bottom:10px;${bk ? "display:none" : ""}">${p.options.map((x, j) => `<button class="tab ${j === vi ? "active" : ""}" data-act="gvar" data-key="${key}" data-j="${j}">${esc(x.label)}</button>`).join("")}</div>` : ""}
      ${vi ? `<div class="small" style="font-weight:700;margin:-4px 0 8px">${o.label === "Morning labs" ? "Every lab in the morning. " : ""}Changes from main: ${esc(changed.join("; ")) || "different teachers"}</div>` : ""}
      <div class="chips" style="margin-bottom:10px">
        <span class="chip ${o.m.earlyDays ? "peach" : "mint"}">${o.m.earlyDays} day${o.m.earlyDays === 1 ? "" : "s"} with 8 AM</span>
        <span class="chip ${o.m.noLabDays ? "mint" : "lav"}">${o.m.noLabDays} lab-free weekday${o.m.noLabDays === 1 ? "" : "s"}</span>
        ${labSplitChip(o.m)}
        <span class="chip ${o.m.lunchDays > genPrefs().lunchSkip ? "salmon" : o.m.lunchDays ? "peach" : "mint"}">${o.m.lunchDays ? o.m.lunchDays + " day" + (o.m.lunchDays > 1 ? "s" : "") + " no lunch" : "Lunch every day"}</span>
        <span class="chip ${o.m.lastEnd > 18 * 60 ? "peach" : "mint"}">Ends by ${fmt(o.m.lastEnd)}</span>
        <span class="chip lav">${Math.round(o.m.gaps / 60)} h gaps</span>
        ${p.profile.id === "heavy" ? `<span class="chip peach">${o.m.perDay.slice(0, 5).map((x, d) => `${DAYS[d]} ${Math.round(x / 6) / 10}h`).join(" · ")}</span>` : ""}
        <span class="chip ${outside.length ? "salmon" : "lav"}">${outside.length ? outside.length + " outside PRP" : "All PRP"}</span>
        ${likedFac.length ? `<span class="chip mint">♥ ${likedFac.length} preferred teacher${likedFac.length > 1 ? "s" : ""}</span>` : ""}
      </div>
      ${!bk && !vi && p.why && p.why.length ? `<div class="why-box"><b>Why this plan:</b> ${esc(p.why.join("; "))}.</div>` : ""}
      ${bends.length ? `<div class="bend">Bends: ${esc(bends.join("; "))}</div>` : ""}
      <div class="card" style="padding:8px 6px;box-shadow:none">${gantt(lanes, activeDays([lanes[0].times]), { labels: true, compact: true })}</div>
      <a class="btn cyan block" style="margin-top:10px" href="${viewLink(o.ids, name)}" target="_blank" rel="noopener">${icon("cal", 16)} Open full timetable</a>
      <details class="gen-list"><summary>Faculty and slots</summary>
        ${codes.map((code) => {
          const cs = ks.filter((k) => k.code === code);
          const alt = (o.alt && o.alt[code]) || [];
          return `<div class="gen-row"><b>${esc(COURSES[code].title)}</b>
            <div class="small">${commOf(cs[0].faculty) ? `<span class="chip pink" style="font-size:10.5px">${commOf(cs[0].faculty)[0]}/10</span> ` : ""}${facPref(cs[0].faculty) > 0 ? "♥ " : ""}${facRating(cs[0].faculty) ? "(" + facRating(cs[0].faculty) + "/5) " : ""}${esc(titleCase(cs[0].faculty))} · ${cs.map((k) => `${esc(k.slots === "NIL" ? "Online" : k.slots)}${k.times.length ? ` (${esc(k.venue)}${k.prp ? "" : ", outside PRP"})` : ""}`).join(" + ")}</div>
            ${cs.filter((k) => k.times.length).map((k) => `<div class="small muted">${k.group === "lab" ? "Lab" : "Theory"}: ${whenText(k.times)}</div>`).join("")}
            ${alt.length ? `<div class="small muted">Same timing also with ${esc(alt.slice(0, 4).map(titleCase).join(", "))}${alt.length > 4 ? ` +${alt.length - 4} more` : ""}</div>` : ""}</div>`;
        }).join("")}
      </details>
      <button class="btn lime block" style="margin-top:12px" data-act="genuse" data-key="${key}" data-i="${i}" data-s="${scenKey}">Use this ${bk ? "backup" : vi ? "variation" : "plan"}</button>
    </div>`;
  }

  /* ======================= full timetable page ======================= */
  const viewLink = (ids, name) => `#/view/${encode(ids)}/${encodeURIComponent(name || "")}`;
  function pageView(code, name) {
    const ids = decode(code) || [];
    const ks = ids.map((i) => CLASSES[i]).filter(Boolean);
    if (!ks.length) return `${topbar("Timetable", true)}<div class="card empty"><div class="big">Nothing to show</div><div class="muted">This link has no classes in it.</div></div>`;
    const codes = [...new Set(ks.map((k) => k.code))];
    const cr = codes.reduce((a, c) => a + credits(c), 0);
    const m = metrics(ks.flatMap((k) => k.times));
    const clashIds = new Set(allClashes(ks).flat().map((k) => k.id));
    const days = activeDays([ks.flatMap((k) => k.times)]);
    const START = 8 * 60, END = 20 * 60, PX = 1.25; // pixels per minute
    const y = (min) => (min - START) * PX;
    const hours = []; for (let h = 8; h <= 20; h++) hours.push(h);
    // which days lose lunch (a lab ending 13:20 and a class at 14:00)
    const noLunch = new Set();
    days.forEach((d) => {
      const bl = blocksOf(ks.flatMap((k) => k.times.filter((x) => x.d === d)));
      if (bl.some((b) => b.e >= t("12:30") && b.e <= LUNCH_END) && bl.some((b) => b.s >= AFTERNOON && b.s < t("14:10"))) noLunch.add(d);
    });
    const col = (d) => {
      const blocks = [];
      ks.forEach((k) => blocksOf(k.times.filter((x) => x.d === d)).forEach((b) => blocks.push({ k, ...b })));
      return `<div class="tv-day">
        ${hours.map((h) => `<i class="tv-line" style="top:${y(h * 60)}px"></i>`).join("")}
        <div class="tv-lunch ${noLunch.has(d) ? "lost" : ""}" style="top:${y(LUNCH_END)}px;height:${(AFTERNOON - LUNCH_END) * PX}px"><span>${noLunch.has(d) ? "No lunch" : "Lunch"}</span></div>
        ${blocks.map(({ k, s, e }) => `<div class="tv-block ${clashIds.has(k.id) ? "clash" : k.group === "lab" ? "lab" : "th"}" style="top:${y(s)}px;height:${Math.max(30, (e - s) * PX - 3)}px">
          <b>${esc(k.title)}</b>
          <span>${fmt(s)}–${fmt(e)} · ${esc(k.group === "lab" ? "Lab" : "Theory")}</span>
          <span>${esc(k.slots)} · ${esc(k.venue)}</span>
          <span class="tv-fac">${esc(titleCase(k.faculty))}</span>
        </div>`).join("")}
      </div>`;
    };
    const bends = bendsOf({ m, ids }, genPrefs());
    const online = ks.filter((k) => !k.times.length);
    return `
      <div class="tv-top">${topbar(name || "Timetable", true)}</div>
      <div class="chips" style="justify-content:center;margin:-6px 0 14px">
        <span class="chip lav big">${cr} credits</span><span class="chip lav big">${m.hours} h / week</span>
        <span class="chip ${m.earlyDays ? "peach" : "mint"} big">${m.earlyDays} day${m.earlyDays === 1 ? "" : "s"} with 8 AM</span>
        <span class="chip ${m.lunchDays ? "peach" : "mint"} big">${m.lunchDays ? m.lunchDays + " day" + (m.lunchDays > 1 ? "s" : "") + " no lunch" : "Lunch every day"}</span>
        <span class="chip lav big">Ends by ${fmt(m.lastEnd)}</span>
        <span class="chip ${m.noLabDays ? "cyan" : "lav"} big">${m.noLabDays} lab-free weekday${m.noLabDays === 1 ? "" : "s"}</span>
        ${clashIds.size ? `<span class="chip salmon big">Clash</span>` : ""}
      </div>
      ${bends.length ? `<div class="bend" style="max-width:720px;margin:0 auto 14px">Crosses your limits: ${esc(bends.join("; "))}</div>` : ""}
      <div class="card tv-card"><div class="scroll-x"><div class="tv" style="--cols:${days.length}">
        <div class="tv-head"><span></span>${days.map((d) => `<span>${DAYS[d]}<small>${Math.round(m.perDay[d] / 60 * 10) / 10} h</small></span>`).join("")}</div>
        <div class="tv-body" style="height:${(END - START) * PX}px">
          <div class="tv-times">${hours.map((h) => `<span style="top:${y(h * 60)}px">${h > 12 ? h - 12 : h}${h >= 12 ? " PM" : " AM"}</span>`).join("")}</div>
          ${days.map(col).join("")}
        </div>
      </div></div></div>
      <div class="chips" style="justify-content:center;margin:12px 0 4px"><span class="chip mint">Theory</span><span class="chip cyan">Lab</span><span class="chip">Lunch 1:20–2:00</span><span class="chip salmon">No lunch / clash</span></div>
      ${online.length ? `<p class="footer-note" style="margin-top:6px">No fixed slot: ${online.map((k) => `${esc(k.title)} (${esc(titleCase(k.faculty))}, ${esc(TYPE_NAMES[k.type] || k.type)})`).join(", ")}</p>` : ""}
      <hr class="rule">
      <div class="card tight"><h2 class="section-title">Courses, teachers and slots</h2>
        <div class="scroll-x"><table class="cmp tv-table">
          <thead><tr><th>Course</th><th>Teacher</th><th>Theory</th><th>Lab</th><th>Rating</th></tr></thead>
          <tbody>${codes.map((c) => {
            const cs = ks.filter((k) => k.code === c);
            const th = cs.find((k) => k.group !== "lab"), lb = cs.find((k) => k.group === "lab");
            const cell = (k) => k ? `<b>${esc(k.slots === "NIL" ? "Online" : k.slots)}</b> · ${esc(k.venue)}<br><span class="muted">${whenText(k.times)}</span>` : "–";
            const r = commOf(cs[0].faculty);
            return `<tr><td><b>${esc(COURSES[c].title)}</b><br><span class="muted">${esc(c)} · ${credits(c)} cr</span></td><td>${esc(titleCase(cs[0].faculty))}</td><td>${cell(th)}</td><td>${cell(lb)}</td><td>${facRating(cs[0].faculty) ? `You: ${facRating(cs[0].faculty)}/5<br>` : ""}${r ? `${r[0]}/10 (${r[1]})` : "–"}</td></tr>`;
          }).join("")}</tbody></table></div>
      </div>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap">
        <button class="btn lime" data-act="viewuse" data-code="${esc(code)}" data-name="${esc(name || "")}">Use this plan</button>
        <button class="btn lav" data-act="viewcopy">${icon("copy", 16)} Copy share link</button>
        <button class="btn" data-act="print">Print</button>
      </div>`;
  }

  /* ======================= teachers ======================= */
  let teachCourse = null;
  let teachQuery = "";
  function pageTeachers() {
    const gc = state.genCourses.filter((c) => COURSES[c] && COURSES[c].options.length > 1);
    if (!gc.includes(teachCourse)) teachCourse = gc[0] || null;
    const c = teachCourse && COURSES[teachCourse];
    const facs = c ? [...new Set(c.ids.map((i) => CLASSES[i].faculty))].sort() : [];
    const q = teachQuery.trim().toLowerCase();
    const marked = Object.entries(state.fac || {}).filter(([, v]) => v.pref || v.note || v.rating);
    return `
      ${topbar("Teachers", true)}
      <p class="page-sub">Mark teachers you want or want to avoid. Smart Plans uses this right away.</p>
      <div class="card tight" style="background:var(--pink);margin-bottom:14px"><b>Pink chips</b> are ratings out of 10 from <a href="https://faculty-review-vit-vellore-dun.vercel.app/" target="_blank" rel="noopener">a VIT Vellore student review site</a>; <b>Board</b> chips are the picks from FFCS Board (study material first, then less strict) for CS103, CS104 and its Plan 3 teachers (${Object.keys(COMM).length} of your teachers found, fetched ${esc((window.FFCS_RATINGS || {}).fetched || "")}). Most have only 1–5 reviews, so treat them as a hint. Your own stars always win.</div>
      <div class="tabs">${gc.map((code) => `<button class="tab ${code === teachCourse ? "active" : ""}" data-act="tcourse" data-code="${code}">${esc(COURSES[code].title.length > 22 ? code : COURSES[code].title)}</button>`).join("")}</div>
      ${c ? `<div class="toolbar"><input class="input" id="tq" type="search" placeholder="Search ${esc(c.title)} teachers" value="${esc(teachQuery)}" autocomplete="off"></div>
      <div class="stack">${facs.filter((f) => !q || f.toLowerCase().includes(q)).map((f) => {
        const v = (state.fac || {})[f] || {};
        const slots = c.ids.map((i) => CLASSES[i]).filter((k) => k.faculty === f).map((k) => k.slots).join(", ");
        return `<div class="card tight teacher ${v.pref > 0 ? "liked" : v.pref < 0 ? "avoid" : ""}">
          <div class="t-row"><div><b>${esc(titleCase(f))}</b>${commChip(f)}<div class="small muted">${esc(slots)}</div></div>
            <div style="display:flex;gap:6px">
              <button class="btn sm ${v.pref > 0 ? "mint" : ""}" data-act="tpref" data-name="${esc(f)}" data-v="1">♥ Want</button>
              <button class="btn sm ${v.pref < 0 ? "salmon" : ""}" data-act="tpref" data-name="${esc(f)}" data-v="-1">Avoid</button>
            </div></div>
          <div class="t-rate">Rating ${[1, 2, 3, 4, 5].map((n) => `<button class="star ${v.rating >= n ? "on" : ""}" data-act="trate" data-name="${esc(f)}" data-v="${n}" aria-label="${n} stars">★</button>`).join("")}</div>
          <input class="input note-in" data-name="${esc(f)}" placeholder="Review or note (optional)" value="${esc(v.note || "")}" maxlength="200">
        </div>`;
      }).join("") || `<div class="card empty"><div class="big">No match</div></div>`}</div>` : `<div class="card empty"><div class="big">No courses</div><div class="muted">Add courses in Smart Plans first.</div></div>`}
      <hr class="rule">
      <div class="card">
        <h2 class="section-title">Paste a list</h2>
        <p class="small muted" style="margin:0 0 8px">One teacher per line: name | rating out of 5 | review. Start with + to want them or - to avoid them, e.g. "+ Sudha S | 4.5 | explains well". "Name: note" works too.</p>
        <textarea class="input" id="tpaste" rows="5" placeholder="+ Sudha S | 4.5 | explains well&#10;- Some Name | 2 | strict marking"></textarea>
        <div class="row" style="justify-content:flex-start"><button class="btn lime" data-act="tapply">Apply list</button>
          ${marked.length ? `<button class="btn lav" data-act="tcopy">${icon("copy", 16)} Copy my list</button><button class="btn salmon" data-act="tclear">Clear all</button>` : ""}</div>
      </div>
      ${marked.length ? `<div class="card" style="margin-top:14px"><h2 class="section-title">Your list (${marked.length})</h2>
        ${marked.map(([n, v]) => `<div class="small" style="padding:4px 0"><b>${v.pref > 0 ? "♥" : v.pref < 0 ? "✕" : "•"} ${esc(titleCase(n))}</b>${v.rating ? ` · ${v.rating}/5` : ""}${v.note ? ` — ${esc(v.note)}` : ""}</div>`).join("")}</div>` : ""}`;
  }
  const ALL_FACULTY = [...new Set(CLASSES.map((k) => k.faculty))];
  function applyTeacherList(text) {
    let hit = 0; const miss = [];
    text.split(/\n+/).map((l) => l.trim()).filter(Boolean).forEach((line) => {
      let m = line.match(/^([+\-−]?)\s*([^:|]+?)\s*(?::\s*(.*))?$/);
      let rating = 0;
      if (line.includes("|")) {
        const parts = line.split("|").map((x) => x.trim());
        const sign = parts[0].match(/^([+\-−]?)\s*(.*)$/);
        const num = parts.slice(1).find((x) => /^\d(\.\d+)?(\s*\/\s*5)?$/.test(x));
        rating = num ? Math.max(1, Math.min(5, Math.round(parseFloat(num) * 2) / 2)) : 0;
        m = [line, sign[1], sign[2], parts.slice(1).filter((x) => x !== num && x !== "-").join(" · ")];
      }
      if (!m) return;
      const want = m[1] === "+" ? 1 : m[1] ? -1 : 0;
      const name = m[2].toLowerCase().replace(/[.\s]+/g, " ").trim();
      const found = ALL_FACULTY.filter((f) => f.toLowerCase().replace(/[.\s]+/g, " ").includes(name));
      if (!found.length) { miss.push(m[2]); return; }
      found.forEach((f) => {
        const v = (state.fac[f] = state.fac[f] || {});
        if (want || !v.pref) v.pref = want || v.pref || 0;
        if (m[3]) v.note = m[3];
        if (rating) v.rating = rating;
        hit++;
      });
    });
    save();
    toast(`Matched ${hit} teacher${hit === 1 ? "" : "s"}${miss.length ? ` · not found: ${miss.slice(0, 3).join(", ")}` : ""}`);
  }

  /* ======================= modals ======================= */
  function modal(html, onMount) {
    const root = $("#modal-root");
    root.innerHTML = `<div class="modal-bg" data-act="mclose"><div class="card modal" role="dialog" aria-modal="true">${html}</div></div>`;
    const first = root.querySelector("input,textarea");
    if (first) setTimeout(() => first.focus(), 30);
    if (onMount) onMount(root);
  }
  const closeModal = () => { $("#modal-root").innerHTML = ""; };

  function friendModal(f) {
    let color = f ? f.color : FRIEND_COLORS[state.friends.length % FRIEND_COLORS.length];
    modal(`<h2>${f ? "Edit friend" : "Add friend"}</h2>
      <label class="field-label" for="fn">Name</label>
      <input class="input" id="fn" maxlength="30" value="${f ? esc(f.name) : ""}" placeholder="Friend's name">
      <label class="field-label" for="fc">Timetable code</label>
      <textarea class="input" id="fc" placeholder="W26-...">${f ? esc(encode(f.sel)) : ""}</textarea>
      <label class="field-label">Colour</label>
      <div class="colors">${FRIEND_COLORS.map((c) => `<button type="button" data-c="${c}" class="${c === color ? "on" : ""}" style="background:${c}" aria-label="Colour ${c}"></button>`).join("")}</div>
      <div class="row"><button class="btn" data-act="mclose">Cancel</button><button class="btn lime" id="fsave">Save</button></div>`,
    (root) => {
      root.querySelectorAll(".colors button").forEach((b) => b.addEventListener("click", () => {
        color = b.dataset.c; root.querySelectorAll(".colors button").forEach((x) => x.classList.toggle("on", x === b));
      }));
      $("#fsave", root).addEventListener("click", () => {
        const name = $("#fn", root).value.trim() || "Friend";
        const ids = decode($("#fc", root).value);
        if (ids === null) { toast("That code doesn't look right (it starts with W26-)"); return; }
        if (f) Object.assign(f, { name, sel: ids, color });
        else state.friends.push({ id: uid(), name, sel: ids, color, show: true });
        save(); closeModal(); render();
        toast(f ? "Saved" : `Added ${name}`);
      });
    });
  }
  function textModal(title, value, onSave, placeholder = "") {
    modal(`<h2>${esc(title)}</h2><input class="input" id="tm" maxlength="30" value="${esc(value)}" placeholder="${esc(placeholder)}">
      <div class="row"><button class="btn" data-act="mclose">Cancel</button><button class="btn lime" id="tmsave">Save</button></div>`,
    (root) => {
      const go = () => { onSave($("#tm", root).value.trim()); closeModal(); render(); };
      $("#tmsave", root).addEventListener("click", go);
      $("#tm", root).addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    });
  }
  function confirmModal(title, body, yes, onYes) {
    modal(`<h2>${esc(title)}</h2><p style="margin:0;font-weight:600">${body}</p>
      <div class="row"><button class="btn" data-act="mclose">Cancel</button><button class="btn salmon" id="cyes">${esc(yes)}</button></div>`,
    (root) => $("#cyes", root).addEventListener("click", () => { onYes(); closeModal(); render(); }));
  }
  function importModal(prefill) {
    modal(`<h2>Import a timetable</h2>
      <p class="small muted" style="margin:0 0 6px">Paste a code (W26-…) to save it as a new plan.</p>
      <textarea class="input" id="ic" placeholder="W26-...">${esc(prefill || "")}</textarea>
      <label class="field-label" for="iname">Plan name</label>
      <input class="input" id="iname" maxlength="30" value="Imported plan">
      <div class="row"><button class="btn" data-act="mclose">Cancel</button><button class="btn lime" id="isave">Import</button></div>`,
    (root) => $("#isave", root).addEventListener("click", () => {
      const ids = decode($("#ic", root).value);
      if (ids === null) { toast("That code doesn't look right"); return; }
      const id = uid();
      state.plans.push({ id, name: $("#iname", root).value.trim() || "Imported plan", sel: ids });
      state.active = id; save(); closeModal(); render(); toast("Imported and set as active");
    }));
  }

  /* ======================= router ======================= */
  const NAV = [
    ["home", "Home", "home"], ["courses", "Courses", "book"], ["timetable", "Timetable", "cap"],
    ["schedule", "Schedule", "cal"], ["plans", "Plans", "layers"],
  ];
  let lastRoute = "";
  function route() { return (location.hash.replace(/^#\/?/, "") || "home").split("/"); }
  function render() {
    const [r, arg] = route();
    const app = $("#app");
    const routeKey = r + "/" + (arg || "");
    const keepScroll = routeKey === lastRoute;
    const y = window.scrollY;
    let html;
    switch (r) {
      case "courses": html = pageCourses(); break;
      case "course": html = pageCourse(decodeURIComponent(arg || "")); break;
      case "timetable": html = pageTimetable(); break;
      case "schedule": html = pageSchedule(); break;
      case "plans": html = pagePlans(); break;
      case "teachers": html = pageTeachers(); break;
      case "view": html = pageView(decodeURIComponent(arg || ""), decodeURIComponent(route()[2] || "")); break;
      default: html = pageHome();
    }
    app.innerHTML = html;
    if (r === "courses") renderCourseList();
    const navKey = r === "course" ? "courses" : r === "teachers" || r === "view" ? "plans" : NAV.some((n) => n[0] === r) ? r : "home";
    $("#nav").innerHTML = NAV.map(([k, label, ic]) =>
      `<a class="nav-item ${k === navKey ? "active" : ""}" href="#/${k}" ${k === navKey ? 'aria-current="page"' : ""}><span class="pill">${icon(ic, 19, k === navKey ? 2.8 : 2.2)}</span>${label}</a>`).join("");
    document.title = `${NAV.find((n) => n[0] === navKey)[1]} · FFCS Planner`;
    if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
    lastRoute = routeKey;
  }

  /* ======================= events ======================= */
  const idsOf = (el) => (el.dataset.ids || "").split(",").filter(Boolean).map(Number);
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act;
    if (act === "mclose") { if (e.target === el || el.tagName === "BUTTON") closeModal(); return; }
    const fr = el.dataset.f ? state.friends.find((f) => f.id === el.dataset.f) : null;
    const pl = el.dataset.p ? state.plans.find((p) => p.id === el.dataset.p) : null;
    switch (act) {
      case "back": if (history.length > 1) history.back(); else location.hash = "#/courses"; return;
      case "toggle": el.closest(".mc").classList.toggle("open"); return;
      case "cat": courseCat = el.dataset.cat; render(); return;
      case "hideclash": hideClash = !hideClash; render(); return;
      case "prponly": prpOnly = !prpOnly; render(); return;
      case "add": addOption(el.dataset.code, idsOf(el)); render(); return;
      case "compare": compareModal(el.dataset.code, idsOf(el)); return;
      case "remove": {
        const open = [...document.querySelectorAll(".mc.open")].map((x) => x.dataset.mc);
        removeIds(idsOf(el)); render();
        open.forEach((c) => { const n = document.querySelector(`.mc[data-mc="${CSS.escape(c)}"]`); if (n) n.classList.add("open"); });
        return;
      }
      case "day": ttDay = el.dataset.d === "W" ? "W" : Number(el.dataset.d); render(); return;
      case "showmine": state.showMine = !state.showMine; save(); render(); return;
      case "addfriend":
        if (state.friends.length >= 8) { toast("You can add up to 8 friends"); return; }
        friendModal(null); return;
      case "ftoggle": fr.show = !fr.show; save(); render(); return;
      case "fedit": friendModal(fr); return;
      case "fdel": confirmModal("Delete friend?", `Remove ${esc(fr.name)} from your schedule?`, "Delete", () => { state.friends = state.friends.filter((f) => f !== fr); save(); }); return;
      case "delall": confirmModal("Delete all friends?", "This removes every friend overlay.", "Delete all", () => { state.friends = []; save(); }); return;
      case "copycode": copy(encode(plan().sel)); return;
      case "copylink": copy(`${location.origin}${location.pathname}#/import/${encode(plan().sel)}`); return;
      case "genrm": state.genCourses = state.genCourses.filter((c) => c !== el.dataset.code); genResult = null; save(); render(); return;
      case "gpref": {
        const v = el.dataset.v;
        state.gen[el.dataset.k] = v === "true" ? true : v === "false" ? false : /^\d+$/.test(v) ? Number(v) : v;
        genResult = null; save(); render(); return;
      }
      case "generate": generateAll(); return;
      case "gview": {
        if (el.dataset.v === "extra" && !genResult.extra) { generateExtra(); return; }
        genResult.view = el.dataset.v; render(); return;
      }
      case "viewuse": {
        const ids = decode(el.dataset.code) || [];
        const id = uid();
        state.plans.push({ id, name: (el.dataset.name || "Plan from full view").slice(0, 48), sel: ids });
        state.active = id; save(); toast("Saved and set as your active plan"); render(); return;
      }
      case "viewcopy": copy(location.href); return;
      case "print": window.print(); return;
      case "gvar": genSel[el.dataset.key] = Number(el.dataset.j); render(); return;
      case "gbk": genBk[el.dataset.key] = Number(el.dataset.j); render(); return;
      case "genuse": {
        const scen = el.dataset.s === "x" ? genResult.extra : genResult.base;
        const i = Number(el.dataset.i);
        const p = scen.plans[i];
        const bk = Math.min(genBk[el.dataset.key] || 0, (p.backups || []).length);
        const vi = bk ? 0 : Math.min(genSel[el.dataset.key] || 0, p.options.length - 1);
        const chosen = bk ? p.backups[bk - 1] : p.options[vi];
        const id = uid();
        const suffix = el.dataset.s === "x" ? ` + ${COURSES[genResult.extraCode].title.split(" ")[0]}` : "";
        state.plans.push({ id, name: `Plan ${i + 1}${bk ? "BC"[bk - 1] : vi ? "." + (vi + 1) : ""}: ${p.profile.name}${suffix}`.slice(0, 48), sel: chosen.ids.slice() });
        state.active = id; save(); location.hash = "#/timetable"; toast(`Now using ${p.profile.name}`);
        return;
      }
      case "tcourse": teachCourse = el.dataset.code; teachQuery = ""; render(); return;
      case "tpref": {
        const n = el.dataset.name, v = Number(el.dataset.v);
        const f = (state.fac[n] = state.fac[n] || {});
        f.pref = f.pref === v ? 0 : v;
        genResult = null; save(); render(); return;
      }
      case "trate": {
        const n = el.dataset.name, v = Number(el.dataset.v);
        const f = (state.fac[n] = state.fac[n] || {});
        f.rating = f.rating === v ? 0 : v;
        genResult = null; save(); render(); return;
      }
      case "tapply": applyTeacherList($("#tpaste").value); genResult = null; render(); return;
      case "tcopy": copy(Object.entries(state.fac).filter(([, v]) => v.pref || v.note || v.rating).map(([n, v]) => `${v.pref > 0 ? "+" : v.pref < 0 ? "-" : ""} ${titleCase(n)} | ${v.rating || "-"} | ${v.note || ""}`.trim()).join("\n")); return;
      case "tclear": confirmModal("Clear teacher list?", "This removes every want, avoid and note.", "Clear", () => { state.fac = {}; genResult = null; save(); }); return;
      case "pactive": state.active = pl.id; save(); render(); toast(`Now using ${pl.name}`); return;
      case "pcopy": { const id2 = uid(); state.plans.push({ id: id2, name: (pl.name + " copy").slice(0, 40), sel: pl.sel.slice() }); save(); render(); toast("Duplicated"); return; }
      case "prename": textModal("Rename plan", pl.name, (v) => { if (v) { pl.name = v; save(); } }); return;
      case "pdel": confirmModal("Delete plan?", `Delete “${esc(pl.name)}”? This can't be undone.`, "Delete", () => {
        state.plans = state.plans.filter((p) => p !== pl);
        if (state.active === pl.id) state.active = state.plans[0].id;
        save();
      }); return;
      case "pnew": textModal("New plan", "Plan " + String.fromCharCode(65 + (state.plans.length % 26)), (v) => {
        const id2 = uid(); state.plans.push({ id: id2, name: v || "New plan", sel: [] }); state.active = id2; save();
      }); return;
      case "pimport": importModal(""); return;
      case "pclear": confirmModal("Clear plan?", `Remove every class from “${esc(plan().name)}”?`, "Clear", () => { plan().sel = []; save(); }); return;
    }
  });

  document.addEventListener("change", (e) => {
    if (e.target.id === "genextra") { state.gen.extra = e.target.value; genResult = null; save(); render(); return; }
    if (e.target.classList.contains("note-in")) {
      const n = e.target.dataset.name; const f = (state.fac[n] = state.fac[n] || {});
      f.note = e.target.value.trim(); save(); return;
    }
    if (e.target.id === "genadd" && e.target.value) {
      state.genCourses.push(e.target.value); genResult = null; save(); render();
    }
  });
  document.addEventListener("input", (e) => {
    if (e.target.id === "q") { courseQuery = e.target.value; renderCourseList(); }
    if (e.target.id === "tq") {
      teachQuery = e.target.value; const pos = e.target.selectionStart; render();
      const n = $("#tq"); n.focus(); n.setSelectionRange(pos, pos);
    }
    if (e.target.id === "fq") {
      detailFaculty = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const n = $("#fq"); n.focus(); n.setSelectionRange(pos, pos);
    }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  window.addEventListener("hashchange", () => {
    const [r, arg] = route();
    if (r === "import") { history.replaceState(null, "", "#/plans"); render(); importModal(decodeURIComponent(arg || "")); return; }
    if (r === "course") detailFaculty = "";
    closeModal();
    render();
  });

  const [r0, a0] = route();
  if (r0 === "import") { history.replaceState(null, "", "#/plans"); render(); importModal(decodeURIComponent(a0 || "")); }
  else render();
})();
