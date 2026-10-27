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

