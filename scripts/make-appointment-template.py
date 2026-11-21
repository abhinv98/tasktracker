#!/usr/bin/env python3
"""Turn a real appointment letter into the template the app fills in.

    python3 scripts/make-appointment-template.py "Appointment Letter.docx" src/assets/appointment-letter-template.docx

Every piece that changes per person becomes a {{placeholder}}; the letterhead,
clauses and layout are untouched. /api/appointment-letter fills the placeholders
from an offer. Run it again whenever HR changes the standard letter.
"""
import sys

import docx

src, out = sys.argv[1], sys.argv[2]
d = docx.Document(src)
P = d.paragraphs


def find(start):
    hits = [p for p in P if p.text.strip().startswith(start)]
    assert len(hits) == 1, (start, len(hits))
    return hits[0]


def runs(start, *texts):
    """Rewrite the paragraph's runs in order, keeping each run's formatting."""
    p = find(start)
    assert len(p.runs) == len(texts), (start, [r.text for r in p.runs])
    for run, text in zip(p.runs, texts):
        if text is not None:
            run.text = text


runs("Subject :", "Subject : Appointment Letter For {{name}}")
runs("Date:", None, " {{letterDate}}")
runs("Dear ", None, "{{name}},")
runs("We are pleased to appoint you", None, " {{designation}} ", None)
runs("Your employment will be effective", None, "{{joiningDate}}.")
runs("Your job title will be", None, "{{designation}}", None, "{{reportsTo}}.")
runs("During your probation period, you will be offered", "{{salaryLead}}", "{{salaryA}}", "{{salaryMid}}", "{{salaryB}}", "{{salaryTail}}")

p = [x for x in P if "You shall be on probation/training for 3 months" in x.text]
assert len(p) == 1
r = [x for x in p[0].runs if "for 3 months" in x.text]
assert len(r) == 1
r[0].text = r[0].text.replace("for 3 months", "for {{probationMonths}} months")

p = find("You will be posted at")
assert len(p.runs) == 1 and "Andheri, Mumbai office" in p.runs[0].text
p.runs[0].text = p.runs[0].text.replace("Andheri, Mumbai office", "{{place}} office")

# The two annexure pay slips: during probation (p_) and after it (c_).
for table, pre in zip(d.tables, ("p", "c")):
    def cell(r, c, text, was):
        runs_ = [run for para in table.rows[r].cells[c].paragraphs for run in para.runs]
        assert runs_ and runs_[0].text.strip(), (r, c)
        assert was is None or runs_[0].text.strip() == was, (r, c, runs_[0].text)
        runs_[0].text = text
        for extra in runs_[1:]:
            extra.text = ""
    cell(2, 1, "{{name}}", None)
    cell(3, 1, "{{designation}}", None)
    cell(6, 2, "{{%s_basic}}" % pre, None)
    cell(7, 2, "{{%s_hra}}" % pre, None)
    cell(8, 2, "{{%s_other}}" % pre, None)
    cell(9, 2, "{{%s_gross}}" % pre, None)
    cell(9, 4, "{{%s_gross}}" % pre, None)

d.save(out)

# Nothing of the person the sample was written for may survive.
check = docx.Document(out)
text = "\n".join(p.text for p in check.paragraphs) + "\n".join(c.text for t in check.tables for row in t.rows for c in row.cells)
for leak in ("Bilosha", "Fernandes", "2,40,000", "3,00,000", "Neha Mehra", "October 2026", "November 2026", "20,000", "25,000"):
    assert leak not in text, "still in the template: " + leak
print("template written:", out, "| placeholders:", sorted(set(__import__("re").findall(r"\{\{(\w+)\}\}", text))))
