# Contributing to FFCS Planner ✦

Thanks for helping! Every contribution counts: a typo fix, a test case, new course data or a whole feature.

## Quick start

1. Fork the repo and clone your fork.
2. Serve the site: `cd site && python -m http.server 8000`, then open http://localhost:8000.
3. Make your change on a new branch.
4. Run the engine tests: `node tests/run-tests.js 100`. They must show **0 failures**.
5. Open a pull request and fill in the template.

## Where things live

| File | What it does |
|---|---|
| `site/planner.js` | The planning engine. Pure JavaScript, no DOM. |
| `site/app.js` | The interface: pages, questions, plan cards, full timetable view. |
| `site/styles.css` | The neo-brutalist look: cream canvas, thick black outlines, hard shadows, pastel chips. |
| `data/` | Course allocation data from VTOP. `tools/build_data.py` turns it into `site/data.js`. |
| `tests/run-tests.js` | Randomized checks of every planner rule. |

## Style guide

- Keep the design language: 2–3 px black borders, hard offset shadows (no blur), pill buttons, colours with meaning (mint = theory/good, cyan = labs, salmon = danger, lime = primary).
- No build step and no frameworks, please. Plain HTML, CSS and JS keep the site fast and easy to hack on.
- Write UI text in short, plain sentences.

## Adding course data for another branch or campus

1. Export the course list in the same shape as `data/ffcs_winter_2026_27.json`.
2. Run `python tools/build_data.py`.
3. If the campus uses a different slot grid, add it next to the grid at the top of `site/planner.js`.
4. Add a test course set in `tests/run-tests.js`.

## Reporting bugs

Open an issue with your courses, your answers to the planner questions, and what you expected. A share code (`W26-…`) from the Schedule page helps a lot.
