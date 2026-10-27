# FFCS Planner (VIT Vellore, Winter Semester 2026-27)

Plan your FFCS timetable: pick theory and lab slots for each course, catch clashes, compare with friends, and keep backup plans.

Live site: https://ffcs-planner-psi.vercel.app

- `site/` is the static website (no build step). Plans are stored in the browser's localStorage.
- `data/` holds the course list scraped from VTOP (Course Allocation Details).
- `tools/build_data.py` turns `data/ffcs_winter_2026_27.json` into `site/data.js`.

Deploy: `npx vercel deploy --prod` from `site/`.
