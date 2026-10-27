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

  const SLOT_TIMES = {}; // slot -> [{d,s,e,kind}]
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
  DATA.courses.forEach((c) => {
    c.ids = [];
    c.classes.forEach(([slots, venue, faculty, type]) => {
      const slotList = slots === "NIL" ? [] : slots.split("+").map((s) => s.trim()).filter(Boolean);
      const times = [];
      slotList.forEach((s) => (SLOT_TIMES[s] || []).forEach((x) => times.push(x)));
      const id = CLASSES.length;
      CLASSES.push({ id, code: c.code, title: c.title, cat: c.cat, slots, slotList, venue, faculty, type, group: typeGroup(type), times });
      c.ids.push(id);
    });
    c.types = [...new Set(c.classes.map((k) => k[3]))];
    c.groups = [...new Set(c.types.map(typeGroup))];
    COURSES[c.code] = c;
  });

  /* ======================= state ======================= */
  const KEY = "ffcs-planner-w26";
  const FRIEND_COLORS = ["#FFD4E4", "#E0D0FF", "#A0E0FF", "#FFE0B0", "#70FFC0", "#FFA0A0"];
  const uid = () => Math.random().toString(36).slice(2, 9);
  let state = load();
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.plans) && s.plans.length) return s;
    } catch (e) { /* storage blocked or empty */ }
    const id = uid();
    return { plans: [{ id, name: "Plan A", sel: [] }], active: id, friends: [], showMine: true };
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
  function clashesOf(cls, pool) {
    const out = [];
    pool.forEach((o) => {
      if (o.id === cls.id) return;
      if (o.code === cls.code && o.group === cls.group) return; // would be replaced
      if (cls.times.some((a) => o.times.some((b) => overlaps(a, b)))) out.push(o);
    });
    return out;
  }
  function allClashes(pool) {
    const pairs = [];
    for (let i = 0; i < pool.length; i++)
      for (let j = i + 1; j < pool.length; j++)
        if (pool[i].times.some((a) => pool[j].times.some((b) => overlaps(a, b)))) pairs.push([pool[i], pool[j]]);
    return pairs;
  }

  function addClass(id) {
    const c = CLASSES[id];
    const p = plan();
    const replaced = p.sel.filter((i) => CLASSES[i].code === c.code && CLASSES[i].group === c.group);
    p.sel = p.sel.filter((i) => !replaced.includes(i)).concat(id);
    save();
    toast(replaced.length ? `Swapped to ${c.slots}` : `Added ${c.code} · ${c.slots}`);
  }
  function removeClass(id) {
    const p = plan();
    p.sel = p.sel.filter((i) => i !== id);
    save();
    toast(`Removed ${CLASSES[id].code} · ${CLASSES[id].slots}`);
  }

  /* ======================= helpers ======================= */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const titleCase = (s) => s.toLowerCase().replace(/\b([a-z])/g, (x) => x.toUpperCase());
  const $ = (sel, root = document) => root.querySelector(sel);
  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1900);
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
    palette: '<circle cx="12" cy="12" r="8"/><circle cx="9" cy="10" r="1.2"/><circle cx="14" cy="9" r="1.2"/><circle cx="15.5" cy="13.5" r="1.2"/>',
  };
  const icon = (n, size = 20, sw = 2.4) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;
  const sparkle = (x, y, s = 30) =>
    `<svg class="sparkle" style="left:${x};top:${y};width:${s}px;height:${s}px" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1c.6 5.6 2.4 8.4 11 11-8.6 2.6-10.4 5.4-11 11-.6-5.6-2.4-8.4-11-11 8.6-2.6 10.4-5.4 11-11z" fill="#000"/></svg>`;

  const topbar = (title, back) =>
    `<div class="topbar">${back ? `<button class="back" data-act="back" aria-label="Back">${icon("back", 20, 3)}</button>` : "<span></span>"}<h1 class="page-title">${esc(title)}</h1><span></span></div>`;

  /* ======================= pages ======================= */
  function courseProgress(code) {
    const c = COURSES[code];
    const sel = selected().filter((k) => k.code === code);
    const need = c.groups.filter((g) => g !== "other").length || 1;
    const have = new Set(sel.map((k) => k.group)).size;
    return { sel, need, have: Math.min(have, need) };
  }

  function pageHome() {
    const sel = selected();
    const codes = [...new Set(sel.map((k) => k.code))];
    const mins = sel.reduce((a, k) => a + k.times.reduce((x, y) => x + (y.e - y.s), 0), 0);
    const clashes = allClashes(sel);
    const incomplete = codes.filter((c) => { const p = courseProgress(c); return p.have < p.need; });
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
        <div><div class="stat-num">${sel.length}</div><div class="stat-label">Classes</div></div>
        <div><div class="stat-num">${Math.round(mins / 60)}</div><div class="stat-label">Hours / week</div></div>
      </section>
      <div class="chips" style="margin:14px 2px 0;justify-content:center">
        ${clashes.length ? `<span class="chip salmon big">${clashes.length} clash${clashes.length > 1 ? "es" : ""} in this plan</span>` : `<span class="chip mint big">No clashes</span>`}
        ${incomplete.length ? `<span class="chip peach big">${incomplete.length} course${incomplete.length > 1 ? "s" : ""} missing a theory or lab</span>` : ""}
      </div>
      <hr class="rule">
      <div class="two-col">
        <section>
          <h2 class="section-title">My Courses <a class="btn sm lime" href="#/courses">${icon("plus", 14, 3)} Add</a></h2>
          ${codes.length ? codes.map((code) => myCourseCard(code, clashes)).join("") : `
            <div class="card empty"><div class="big">Nothing yet</div><div class="muted">Pick courses and slots to start building your timetable.</div>
            <a class="btn lime" style="margin-top:14px" href="#/courses">Browse courses</a></div>`}
        </section>
        <hr class="rule">
        <section>
          <h2 class="section-title">Actions</h2>
          <div class="grid2 actions wide2">
            <a class="action-tile" style="background:var(--lavender)" href="#/courses">Courses</a>
            <a class="action-tile" style="background:var(--mint)" href="#/timetable">Timetable</a>
            <a class="action-tile" style="background:var(--cyan)" href="#/schedule">Friends</a>
            <a class="action-tile" style="background:var(--peach)" href="#/plans">Plans</a>
          </div>
          ${clashes.length ? `<div class="card tight" style="margin-top:16px;background:#fff3f3">
            <h3 class="section-title" style="font-size:15px">Clashes</h3>
            ${clashes.map(([a, b]) => `<div class="small" style="font-weight:700;margin:4px 0">${esc(a.code)} ${esc(a.slots)} ✕ ${esc(b.code)} ${esc(b.slots)}</div>`).join("")}
          </div>` : ""}
          <p class="footer-note">Course list from VTOP, updated ${lastScrape.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.<br>Your plans are saved in this browser only.</p>
        </section>
      </div>`;
  }

  function myCourseCard(code, clashes) {
    const c = COURSES[code];
    const { sel, need, have } = courseProgress(code);
    const clashIds = new Set(clashes.flat().map((k) => k.id));
    const anyClash = sel.some((k) => clashIds.has(k.id));
    return `
      <div class="card mc" data-mc="${esc(code)}">
        <div class="mc-head">
          <div>
            <h3>${esc(c.title)}</h3>
            <div class="chips"><span class="chip cyan">${esc(code)}</span>
              ${sel.map((k) => `<span class="chip ${k.group === "lab" ? "cyan" : "mint"}">${esc(k.slots)}</span>`).join("")}
              ${have < need ? `<span class="chip peach">${c.groups.includes("lab") && !sel.some((k) => k.group === "lab") ? "Needs lab" : "Needs theory"}</span>` : ""}
              ${anyClash ? `<span class="chip salmon">Clash</span>` : ""}
            </div>
          </div>
          <button class="mc-toggle" data-act="toggle" aria-label="Show details">${icon("chev", 22, 3)}</button>
        </div>
        <div class="mc-body">
          ${sel.map((k) => `<div class="mc-row">
            <div><div style="font-weight:800">${esc(k.slots)} ${typeChip(k.type)}</div>
            <div class="small muted">${esc(titleCase(k.faculty))} · ${esc(k.venue)}</div></div>
            <button class="icon-btn salmon" data-act="remove" data-id="${k.id}" aria-label="Remove">${icon("trash", 16)}</button>
          </div>`).join("")}
          <a class="btn sm lav" style="margin-top:8px" href="#/course/${encodeURIComponent(code)}">Change slots</a>
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
      return `<a class="course-card" href="#/course/${encodeURIComponent(c.code)}">
        <div class="bar"><i class="${pct >= 100 ? "full" : ""}" style="width:${pct}%;${pct === 0 ? "border:0" : ""}"></i></div>
        <h3>${esc(c.title)}</h3>
        <div class="code">${esc(c.code)} · ${c.ids.length} class${c.ids.length > 1 ? "es" : ""}</div>
        <div class="chips">${c.groups.map((g) => `<span class="chip ${g === "lab" ? "cyan" : g === "th" ? "mint" : "peach"}">${g === "lab" ? "Lab" : g === "th" ? "Theory" : TYPE_NAMES[c.types.find((x) => typeGroup(x) === "other")] || "Other"}</span>`).join("")}
          ${pct >= 100 ? `<span class="chip lime">Added</span>` : pct > 0 ? `<span class="chip peach">Half</span>` : ""}</div>
      </a>`;
    }).join("") : `<div class="card empty" style="grid-column:1/-1"><div class="big">No match</div><div class="muted">Try a different search.</div></div>`;
  }

  let detailGroup = {};
  let detailFaculty = "";
  let hideClash = false;
  function pageCourse(code) {
    const c = COURSES[code];
    if (!c) return `${topbar("Details", true)}<div class="card empty"><div class="big">Course not found</div></div>`;
    const groups = c.groups;
    const g = groups.includes(detailGroup[code]) ? detailGroup[code] : groups[0];
    detailGroup[code] = g;
    const sel = selected();
    const mine = sel.filter((k) => k.code === code);
    const myTheory = mine.find((k) => k.group === "th");
    const others = sel;
    const q = detailFaculty.trim().toLowerCase();
    let opts = c.ids.map((i) => CLASSES[i]).filter((k) => k.group === g)
      .filter((k) => !q || k.faculty.toLowerCase().includes(q) || k.slots.toLowerCase().includes(q) || k.venue.toLowerCase().includes(q));
    const info = opts.map((k) => ({ k, clash: clashesOf(k, others), on: mine.some((m) => m.id === k.id) }));
    if (hideClash) for (let i = info.length - 1; i >= 0; i--) if (info[i].clash.length && !info[i].on) info.splice(i, 1);
    info.sort((a, b) =>
      (b.on - a.on) ||
      ((g === "lab" && myTheory) ? ((b.k.faculty === myTheory.faculty) - (a.k.faculty === myTheory.faculty)) : 0) ||
      ((a.clash.length > 0) - (b.clash.length > 0)) ||
      a.k.slots.localeCompare(b.k.slots, undefined, { numeric: true }) || a.k.faculty.localeCompare(b.k.faculty));
    const free = info.filter((x) => !x.clash.length).length;
    return `
      ${topbar("Details", true)}
      <div class="card" style="text-align:center">
        <h2 style="margin:0 0 10px;font-size:19px;font-weight:800">${esc(c.title)}</h2>
        <div class="chips" style="justify-content:center">
          <span class="chip cyan big">${esc(code)}</span>
          <span class="chip lav big">${esc(CAT_NAMES[c.cat] || c.cat)}</span>
          ${c.types.map((ty) => typeChip(ty)).join("")}
        </div>
        ${mine.length ? `<hr class="rule" style="margin:14px 0"><div class="chips" style="justify-content:center">${mine.map((k) =>
          `<span class="chip lime big">${esc(k.slots)} · ${esc(titleCase(k.faculty))}</span>`).join("")}</div>` : ""}
      </div>
      <hr class="rule">
      ${groups.length > 1 ? `<div class="seg">${groups.map((x) => `<button class="tab ${x === g ? "active" : ""}" data-act="group" data-g="${x}">${x === "lab" ? "Lab" : x === "th" ? "Theory" : "Other"}</button>`).join("")}</div>` : ""}
      <div class="toolbar">
        <input class="input" id="fq" type="search" placeholder="Filter by faculty, slot or venue" value="${esc(detailFaculty)}" autocomplete="off">
        <button class="btn sm ${hideClash ? "lime" : ""}" data-act="hideclash">${hideClash ? icon("check", 14, 3) : ""} Hide clashes</button>
      </div>
      <p class="small" style="font-weight:700;margin:-4px 2px 12px">${info.length} option${info.length !== 1 ? "s" : ""} · ${free} fit your plan${g === "lab" && myTheory ? ` · same-faculty labs first` : ""}</p>
      <div class="grid2 wide2">
        ${info.map(({ k, clash, on }) => `
          <div class="opt ${on ? "sel" : clash.length ? "clash" : ""}">
            <div>
              <div class="slot">${esc(k.slots)}</div>
              <div class="chips">
                <span class="chip lav">${esc(titleCase(k.faculty))}</span>
                <span class="chip peach">${esc(k.venue)}</span>
                ${g === "lab" && myTheory && k.faculty === myTheory.faculty ? `<span class="chip mint">Same faculty</span>` : ""}
              </div>
              ${clash.length && !on ? `<div class="why">Clashes with ${clash.map((o) => `${esc(o.code)} ${esc(o.slots)}`).join(", ")}</div>` : ""}
              ${k.times.length ? "" : `<div class="why muted">No fixed slot</div>`}
            </div>
            ${on ? `<button class="btn sm salmon" data-act="remove" data-id="${k.id}">Remove</button>`
              : `<button class="btn sm ${clash.length ? "" : "lime"}" data-act="add" data-id="${k.id}">${mine.some((m) => m.group === g) ? "Swap" : "Add"}</button>`}
          </div>`).join("") || `<div class="card empty" style="grid-column:1/-1"><div class="big">No options</div></div>`}
      </div>`;
  }

  let ttDay = null;
  function activeDays(pools) {
    const used = new Set();
    pools.forEach((pool) => pool.forEach((k) => k.times.forEach((x) => used.add(x.d))));
    return [0, 1, 2, 3, 4].concat([5, 6].filter((d) => used.has(d)));
  }
  function pageTimetable() {
    const sel = selected();
    const days = activeDays([sel]);
    if (ttDay === null) { const today = (new Date().getDay() + 6) % 7; ttDay = days.includes(today) ? today : 0; }
    if (ttDay !== "W" && !days.includes(ttDay)) ttDay = 0;
    const tabs = `<div class="tabs">${days.map((d) => `<button class="tab ${ttDay === d ? "active" : ""}" data-act="day" data-d="${d}">${DAYS[d]}</button>`).join("")}
      <button class="tab ${ttDay === "W" ? "active" : ""}" data-act="day" data-d="W">Weekly</button></div>`;
    if (!sel.length) return `${topbar("Timetable")}${tabs}<div class="card empty"><div class="big">Empty week</div><div class="muted">Add courses to see your timetable.</div><a class="btn lime" style="margin-top:14px" href="#/courses">Browse courses</a></div>`;
    return `${topbar("Timetable")}${tabs}${ttDay === "W" ? weeklyGrid(sel, days) : dayView(sel, ttDay)}`;
  }

  function dayView(sel, d) {
    const blocks = [];
    sel.forEach((k) => {
      const today = k.times.filter((x) => x.d === d).sort((a, b) => a.s - b.s);
      // merge back-to-back periods of the same class (lab pairs)
      const merged = [];
      today.forEach((x) => {
        const last = merged[merged.length - 1];
        if (last && x.s - last.e <= 15) last.e = x.e; else merged.push({ s: x.s, e: x.e });
      });
      merged.forEach((m) => blocks.push({ k, s: m.s, e: m.e }));
    });
    blocks.sort((a, b) => a.s - b.s);
    if (!blocks.length) return `<div class="card empty"><div class="big">Free day</div><div class="muted">No classes on ${DAYS[d]}.</div></div>`;
    const clashIds = new Set(allClashes(sel).flat().map((k) => k.id));
    let out = '<div class="timeline">';
    blocks.forEach((b, i) => {
      if (i > 0) {
        const gap = b.s - blocks[i - 1].e;
        if (gap >= 30) out += `<div class="tl-gap">${gap >= 60 ? Math.floor(gap / 60) + " h " : ""}${gap % 60 ? (gap % 60) + " min" : ""} free</div>`;
      }
      const perWeek = b.k.times.length;
      const isLab = b.k.group === "lab";
      out += `<div class="tl-row"><div class="tl-time">${fmt(b.s)}<span>${fmt(b.e)}</span></div>
        <div class="card tl-card ${isLab ? "lab" : "th"}" ${clashIds.has(b.k.id) ? 'style="background:#fff3f3"' : ""}>
          <div><h3>${esc(b.k.title)}</h3><div class="code">${esc(b.k.code)}</div>
            <div class="chips"><span class="chip lav">${esc(b.k.slots)}</span>${typeChip(b.k.type)}<span class="chip peach">${esc(b.k.venue)}</span>
            ${clashIds.has(b.k.id) ? '<span class="chip salmon">Clash</span>' : ""}</div>
            <div class="small muted" style="margin-top:8px">${esc(titleCase(b.k.faculty))}</div></div>
          <div class="tl-big"><b>${isLab ? perWeek / 2 : perWeek}</b><small>${isLab ? "Lab sessions" : "Classes"}<br>per week</small></div>
        </div></div>`;
    });
    return out + "</div>";
  }

  function weeklyGrid(sel, days) {
    const cell = {}; // "th|d|col" -> [classes]
    sel.forEach((k) => k.times.forEach((x) => { const key = `${x.kind}|${x.d}|${x.col}`; (cell[key] = cell[key] || []).push(k); }));
    const clashIds = new Set(allClashes(sel).flat().map((k) => k.id));
    const thHead = (i) => `${TH_TIMES[i][0]}<br>${TH_TIMES[i][1]}`;
    const labHead = (i) => `${LAB_TIMES[i][0]}<br>${LAB_TIMES[i][1]}`;
    // columns: 6 morning (theory has 5 + blank), lunch, 6 afternoon (theory 5 + blank + V) -> afternoon theory has 6 visible incl V; lab 6
    const thCols = [0, 1, 2, 3, 4, null, "L", 5, 6, 7, 8, 9, 10];
    const labCols = [0, 1, 2, 3, 4, 5, "L", 6, 7, 8, 9, 10, 11];
    const td = (kind, d, col) => {
      if (col === "L") return "";
      if (col === null) return `<td>–</td>`;
      const slot = (kind === "th" ? TH_GRID : LAB_GRID)[d][col];
      const hits = cell[`${kind}|${d}|${col}`] || [];
      if (!hits.length) return `<td>${slot}</td>`;
      const cls = hits.some((k) => clashIds.has(k.id)) || hits.length > 1 ? "clash" : kind;
      return `<td class="on ${cls}">${slot}<br>${hits.map((k) => `${esc(k.code)}<br>${esc(k.venue)}`).join("<br>")}</td>`;
    };
    let rows = "";
    days.forEach((d) => {
      rows += `<tr><th class="day" rowspan="2">${DAYS[d].toUpperCase()}</th><th class="kind">Theory</th>${thCols.map((c) => c === "L" ? (d === days[0] ? `<td class="lunch" rowspan="${days.length * 2}">LUNCH</td>` : "") : td("th", d, c)).join("")}</tr>`;
      rows += `<tr><th class="kind day-sep">Lab</th>${labCols.map((c) => td("lab", d, c)).join("").replace(/<td/g, '<td class="day-sep"').replace(/class="day-sep" class="/g, 'class="day-sep ')}</tr>`;
    });
    // theory row header times have V-slot at end; lab row has 6 afternoon cols
    const head = `<tr><th colspan="2">Theory</th>${thCols.map((c) => c === "L" ? `<th rowspan="2">Lunch</th>` : c === null ? "<th>–</th>" : `<th>${thHead(c)}</th>`).join("")}</tr>
      <tr><th colspan="2">Lab</th>${labCols.filter((c) => c !== "L").map((c) => `<th>${labHead(c)}</th>`).join("")}</tr>`;
    return `<div class="card" style="padding:0;overflow:hidden"><div class="scroll-x"><table class="slotgrid"><thead>${head}</thead><tbody>${rows}</tbody></table></div></div>
      <div class="chips" style="margin-top:12px;justify-content:center"><span class="chip mint">Theory</span><span class="chip cyan">Lab</span><span class="chip salmon">Clash</span></div>
      <p class="footer-note">Scroll sideways on a phone to see the whole week.</p>`;
  }

  function pageSchedule() {
    const sel = selected();
    const friends = state.friends;
    const pools = [state.showMine ? sel : []].concat(friends.filter((f) => f.show).map((f) => f.sel.map((i) => CLASSES[i]).filter(Boolean)));
    const days = activeDays([sel].concat(friends.map((f) => f.sel.map((i) => CLASSES[i]).filter(Boolean))));
    const START = 8 * 60, END = 20 * 60;
    const pct = (m) => ((m - START) / (END - START)) * 100;
    const hours = []; for (let h = 8; h <= 20; h += 1) hours.push(h);
    const lanes = [];
    if (state.showMine) lanes.push({ color: "#D0FF00", pool: sel, name: "You" });
    friends.forEach((f) => { if (f.show) lanes.push({ color: f.color, pool: f.sel.map((i) => CLASSES[i]).filter(Boolean), name: f.name }); });
    const gantt = `<div class="card gantt">
      <div class="g-head"><span></span><div class="g-hours">${hours.filter((h) => h % 2 === 0).map((h) => `<span style="left:${pct(h * 60)}%">${h > 12 ? h - 12 : h}${h >= 12 ? "p" : "a"}</span>`).join("")}</div></div>
      ${days.map((d) => `<div class="g-row"><div class="g-day">${DAYS[d][0]}${d >= 5 ? DAYS[d][1] : ""}</div><div class="g-lanes">
        <div class="g-lines">${hours.map((h) => `<i style="left:${pct(h * 60)}%"></i>`).join("")}</div>
        ${(lanes.length ? lanes : [{ pool: [], color: "" }]).map((l) => `<div class="g-lane">${l.pool.flatMap((k) => k.times.filter((x) => x.d === d).map((x) =>
          `<span class="g-bar" title="${esc(l.name || "")}: ${esc(k.code)} ${esc(k.slots)} ${fmt(x.s)}–${fmt(x.e)}" style="left:${pct(x.s)}%;width:${pct(x.e) - pct(x.s)}%;background:${l.color}"></span>`)).join("")}</div>`).join("")}
      </div></div>`).join("")}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;gap:8px;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:8px;font-weight:700"><button class="check ${state.showMine ? "on" : ""}" data-act="showmine" aria-label="Show my schedule">${state.showMine ? icon("check", 14, 3.4) : ""}</button> Show my schedule</label>
        ${commonFree(lanes, days)}
      </div>
    </div>`;

    const myCode = encode(plan().sel);
    return `
      ${topbar("Schedule")}
      ${gantt}
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
    // count weekday hours (8-19) where every shown person is free
    let free = 0;
    for (const d of days) for (let h = 8; h < 19; h++) {
      if (h === 13) continue;
      const s = h * 60, e = s + 50;
      if (lanes.every((l) => !l.pool.some((k) => k.times.some((x) => x.d === d && x.s < e && s < x.e)))) free++;
    }
    return `<span class="chip mint big">${free} common free hours</span>`;
  }

  function pagePlans() {
    return `
      ${topbar("Plans")}
      <p class="page-sub">Keep a few backup timetables in case slots fill up.</p>
      <div class="stack">
        ${state.plans.map((p) => {
          const sel = p.sel.map((i) => CLASSES[i]).filter(Boolean);
          const n = new Set(sel.map((k) => k.code)).size;
          const cl = allClashes(sel).length;
          const on = p.id === state.active;
          return `<div class="card plan ${on ? "active" : ""}">
            <div><h3>${esc(p.name)}</h3><div class="chips">
              <span class="chip lav">${n} courses</span><span class="chip cyan">${sel.length} classes</span>
              ${cl ? `<span class="chip salmon">${cl} clash${cl > 1 ? "es" : ""}</span>` : ""}${on ? `<span class="chip lime">Active</span>` : ""}</div></div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
              ${on ? "" : `<button class="btn sm lime" data-act="pactive" data-p="${p.id}">Use</button>`}
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
      <hr class="rule">
      <div class="card tight">
        <h2 class="section-title" style="font-size:15px">How FFCS slots work here</h2>
        <p class="small" style="margin:0">Theory and lab times come from the VTOP slot grid. A clash means two classes overlap in time, even when their slot names differ (for example TAA1 and L11). Embedded courses need one theory and one lab class.</p>
      </div>`;
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
      default: html = pageHome();
    }
    app.innerHTML = html;
    if (r === "courses") renderCourseList();
    const navKey = r === "course" ? "courses" : NAV.some((n) => n[0] === r) ? r : "home";
    $("#nav").innerHTML = NAV.map(([k, label, ic]) =>
      `<a class="nav-item ${k === navKey ? "active" : ""}" href="#/${k}" ${k === navKey ? 'aria-current="page"' : ""}><span class="pill">${icon(ic, 19, k === navKey ? 2.8 : 2.2)}</span>${label}</a>`).join("");
    document.title = `${NAV.find((n) => n[0] === navKey)[1]} · FFCS Planner`;
    if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
    lastRoute = routeKey;
  }

  /* ======================= events ======================= */
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act;
    if (act === "mclose") { if (e.target === el || el.tagName === "BUTTON") closeModal(); return; }
    const id = el.dataset.id !== undefined ? Number(el.dataset.id) : null;
    const fr = el.dataset.f ? state.friends.find((f) => f.id === el.dataset.f) : null;
    const pl = el.dataset.p ? state.plans.find((p) => p.id === el.dataset.p) : null;
    switch (act) {
      case "back": if (history.length > 1) history.back(); else location.hash = "#/courses"; return;
      case "toggle": el.closest(".mc").classList.toggle("open"); return;
      case "cat": courseCat = el.dataset.cat; render(); return;
      case "group": detailGroup[decodeURIComponent(route()[1])] = el.dataset.g; render(); return;
      case "hideclash": hideClash = !hideClash; render(); return;
      case "add": addClass(id); render(); return;
      case "remove": {
        const open = [...document.querySelectorAll(".mc.open")].map((x) => x.dataset.mc);
        removeClass(id); render();
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
      case "pactive": state.active = pl.id; save(); render(); toast(`Now using ${pl.name}`); return;
      case "pcopy": { const id2 = uid(); state.plans.push({ id: id2, name: (pl.name + " copy").slice(0, 30), sel: pl.sel.slice() }); save(); render(); toast("Duplicated"); return; }
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

  document.addEventListener("input", (e) => {
    if (e.target.id === "q") { courseQuery = e.target.value; renderCourseList(); }
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

  // first load (a shared link may open straight into the import dialog)
  const [r0, a0] = route();
  if (r0 === "import") { history.replaceState(null, "", "#/plans"); render(); importModal(decodeURIComponent(a0 || "")); }
  else render();
})();
