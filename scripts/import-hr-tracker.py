#!/usr/bin/env python3
"""Load the founders' recruitment workbook into the HR trackers.

    python3 scripts/import-hr-tracker.py <workbook.xlsx>          # dry run: show what would go in
    python3 scripts/import-hr-tracker.py <workbook.xlsx> --push   # write it (hrOps:importRows)

Brings over the tabs that hold real rows: HIRING ROUNDS, CANDIDATE PIPELINE and
HR PROJECTS. A row is matched on its ID (REQ-26-001, C-26-001, P-26-001), so a
second run adds nothing. Not brought over: the calculated columns (the app works
them out), people named as free text such as "HR" (pick the person in the app),
the placeholder rows that only carry an ID, the daily log and SOURCE ARCHIVE
(the workbook stays the archive).
"""
import datetime
import json
import subprocess
import sys

import openpyxl

# sheet -> (tracker, {column header: field key}); "code" is the row's ID.
SHEETS = {
    "HIRING ROUNDS": ("rounds", {
        "Req ID": "code", "Hiring Cycle": "cycle", "Position / Role": "role", "Department": "department",
        "Employment Type": "employmentType", "Openings": "openings", "Priority": "priority",
        "Request Date": "requestDate", "Target Join Date": "targetJoinDate", "Approval Status": "approvalStatus",
        "Hiring Status": "hiringStatus", "Budget Approved (₹ LPA)": "budgetLpa", "Original Budget / Note": "budgetNote",
        "Last HR Update": "lastUpdate", "Next Action": "nextAction", "Next Action Due": "nextDue",
        "Blocker / Founder Decision": "blocker", "Hiring Notes": "notes",
    }),
    "CANDIDATE PIPELINE": ("pipeline", {
        "Candidate ID": "code", "Req ID": "reqId", "Role (original)": "roleOriginal", "Candidate Name": "name",
        "Contact / Email": "contact", "Source": "source", "First Contact Date": "firstContact",
        "Pipeline Stage": "stage", "Candidate Status": "status", "Next Action": "nextAction",
        "Next Action Due": "nextDue", "Last Update Date": "lastUpdate", "Data Verification": "verification",
        "Origin": "origin", "Latest Outcome": "latestOutcome", "HR Notes": "notes",
    }),
    "HR PROJECTS": ("projects", {
        "Project ID": "code", "Process / Initiative": "name", "Deliverable / Success Criteria": "deliverable",
        "Priority": "priority", "Kickoff Date": "kickoff", "Draft Due": "draftDue", "Project Stage": "stage",
        "Draft Submitted": "draftSubmitted", "Feedback Due": "feedbackDue", "Feedback Received": "feedbackReceived",
        "Approval Date": "approvalDate", "Implementation Due": "implementationDue", "Implemented Date": "implementedDate",
        "Last Update": "lastUpdate", "Next Action": "nextAction", "Next Due": "nextDue",
        "Blocker / Decision": "blocker", "Notes": "notes",
    }),
}
NUMBERS = {"openings", "budgetLpa"}
LONG = {"notes", "deliverable"}


def value(key, cell):
    if cell is None or (isinstance(cell, str) and (not cell.strip() or cell.startswith("="))):
        return None
    if isinstance(cell, (datetime.datetime, datetime.date)):
        return cell.strftime("%Y-%m-%d")
    if key in NUMBERS:
        return float(cell) if isinstance(cell, (int, float)) else None
    if isinstance(cell, float) and cell.is_integer():
        cell = int(cell)  # a phone number typed as a number
    return str(cell).strip()[: 5000 if key in LONG else 300]


def read(path):
    book = openpyxl.load_workbook(path)
    rows = []
    for sheet, (tracker, columns) in SHEETS.items():
        ws = book[sheet]
        heads = [c.value for c in ws[4]]
        legacy = heads.index("Legacy Row") if "Legacy Row" in heads else None
        for line in ws.iter_rows(min_row=5, values_only=True):
            fields = {}
            for head, cell in zip(heads, line):
                key = columns.get(head)
                got = value(key, cell) if key else None
                if got is not None:
                    fields[key] = got
            code = fields.pop("code", None)
            if not code or not fields:
                continue  # an empty row, or a prefilled ID with nothing else
            if legacy is not None and line[legacy] is not None:
                fields["notes"] = (fields.get("notes", "") + f" (Row {int(line[legacy])} of the original log.)").strip()
            rows.append({"tracker": tracker, "code": code, "fields": fields})
    return rows


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    rows = read(sys.argv[1])
    for tracker in ("rounds", "pipeline", "projects"):
        print(f"{tracker}: {sum(r['tracker'] == tracker for r in rows)} rows")
    if "--push" not in sys.argv:
        out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else None
        if out:
            json.dump(rows, open(out, "w"), ensure_ascii=False)
            print("written to", out)
        print("dry run: nothing written. Add --push to load it.")
        return
    # Rounds go first: a candidate points at its round.
    for start in range(0, len(rows), 60):
        batch = rows[start : start + 60]
        result = subprocess.run(
            ["npx", "convex", "run", "hrOps:importRows", json.dumps({"rows": batch}, ensure_ascii=False)],
            capture_output=True, text=True,
        )
        if result.returncode != 0:
            sys.exit(f"batch at row {start} failed:\n{result.stderr[-2000:]}")
        print(f"rows {start + 1}-{start + len(batch)}:", " ".join(result.stdout.split()))


if __name__ == "__main__":
    main()
