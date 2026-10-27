/* Runs the planner off the main thread so the page stays smooth while it checks every timetable. */
self.window = self; // data.js and ratings.js write to window.*
const v = self.location.search || "";
importScripts("data.js" + v, "ratings.js" + v, "planner.js" + v);
const db = self.FFCSPlanner.build(self.FFCS_DATA);
self.onmessage = (e) => {
  const { codes, prefs, fac } = e.data;
  let last = 0;
  const res = self.FFCSPlanner.plan(db, {
    codes, prefs, fac, comm: (self.FFCS_RATINGS && self.FFCS_RATINGS.faculty) || {}, board: (self.FFCS_RATINGS && self.FFCS_RATINGS.board) || {},
    onProgress: (msg, pct) => { const now = Date.now(); if (now - last > 120 || pct >= 100) { last = now; self.postMessage({ type: "progress", msg, pct }); } },
  });
  self.postMessage({ type: "done", res });
};
