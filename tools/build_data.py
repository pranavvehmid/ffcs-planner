"""Turn the scraped VTOP JSON into the compact site/data.js the planner loads."""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = json.loads((root / "data" / "ffcs_winter_2026_27.json").read_text(encoding="utf-8"))
courses = []
for cat in src["categories"]:
    for c in cat["courses"]:
        courses.append({
            "code": c["courseCode"], "title": c["title"], "cat": cat["code"],
            "classes": [[k["slots"], k["venue"], k["faculty"], k["courseType"]] for k in c["classes"]],
        })
out = {"semester": src["semester"], "scrapedAt": src["scrapedAt"], "courses": courses}
(root / "site" / "data.js").write_text("window.FFCS_DATA=" + json.dumps(out, separators=(",", ":")) + ";\n", encoding="utf-8")
print(len(courses), "courses", sum(len(c["classes"]) for c in courses), "classes")
