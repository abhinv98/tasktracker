// Import the cultform JobData tables into the recruitment tables.
//
//   node scripts/import-cultform.mjs <folder holding jd_*.json> [--dry-run]
//
// The folder holds one JSON array per MySQL table (jd_jobs.json, jd_contacts.json,
// jd_email_templates.json, jd_campaigns.json, jd_campaign_contacts.json,
// jd_email_logs.json). Rows are matched on their MySQL id, so running it again
// is safe. It talks to whichever deployment `npx convex` is pointed at.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const [dir, flag] = process.argv.slice(2);
if (!dir) throw new Error("usage: node scripts/import-cultform.mjs <folder> [--dry-run]");
const dryRun = flag === "--dry-run";
const load = (t) => JSON.parse(readFileSync(join(dir, `${t}.json`), "utf8"));
const str = (v) => (v == null ? "" : String(v));

const jobs = load("jd_jobs").map((j) => ({
  sourceId: j.id,
  name: j.name,
  description: str(j.description),
  parentSourceId: j.parent_job_id ?? null,
  createdAt: Number(j.created_at),
}));
const candidates = load("jd_contacts").map((c) => ({
  sourceId: c.id,
  jobSourceId: c.job_id,
  name: c.name,
  number: str(c.number),
  email: c.email,
  age: c.age ?? null,
  experience: str(c.experience),
  resume: str(c.resume),
  portfolioLink: str(c.portfolio_link),
  position: str(c.position),
  currentCtc: str(c.current_ctc),
  expectedCtc: str(c.expected_ctc),
  noticePeriod: str(c.notice_period),
  status: c.status,
  statusUpdatedAt: c.status_updated_at == null ? null : Number(c.status_updated_at),
  createdAt: c.created_at == null ? null : Number(c.created_at),
}));
const templates = load("jd_email_templates").map((t) => ({
  sourceId: t.id,
  jobSourceId: t.job_id,
  name: t.name,
  subject: t.subject,
  body: str(t.body),
  createdAt: Number(t.created_at),
}));
const members = load("jd_campaign_contacts");
const campaigns = load("jd_campaigns").map((c) => ({
  sourceId: c.id,
  jobSourceId: c.job_id,
  name: c.name,
  startDate: Number(c.start_date),
  endDate: c.end_date == null ? null : Number(c.end_date),
  createdAt: Number(c.created_at),
  source: c.source === "manual" ? "manual" : "auto",
  memberSourceIds: members.filter((m) => m.campaign_id === c.id).map((m) => m.contact_id),
}));
const emailLogs = load("jd_email_logs").map((l) => ({
  sourceId: l.id,
  jobSourceId: l.job_id,
  jobName: str(l.job_name),
  contactEmail: str(l.contact_email),
  contactName: str(l.contact_name),
  templateName: str(l.template_name),
  smtpFrom: str(l.smtp_from),
  status: l.status === "failed" ? "failed" : "sent",
  error: str(l.error),
  sentAt: Number(l.sent_at),
  campaignSourceId: l.campaign_id ?? null,
}));

// Candidates before campaigns, so a campaign can find its members.
const steps = [
  ["jobs", jobs, 50],
  ["candidates", candidates, 150],
  ["templates", templates, 50],
  ["campaigns", campaigns, 20],
  ["emailLogs", emailLogs, 200],
];
for (const [key, rows, size] of steps) {
  const total = { added: 0, updated: 0, unchanged: 0 };
  if (!dryRun) {
    for (let i = 0; i < rows.length; i += size) {
      const out = execFileSync(
        "npx",
        ["convex", "run", "recruitment:importFromCultform", JSON.stringify({ [key]: rows.slice(i, i + size) })],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
      );
      const res = JSON.parse(out.slice(out.indexOf("{")));
      for (const k of Object.keys(total)) total[k] += res[k];
    }
  }
  console.log(`${key}: ${rows.length} rows${dryRun ? " (dry run)" : ` → ${JSON.stringify(total)}`}`);
}
