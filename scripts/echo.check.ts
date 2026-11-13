// Self-check for how Echo meetings are filed (convex/lib/echoFiling.ts), run against an in-memory
// stand-in for ctx.db:  node scripts/echo.check.ts
import assert from "node:assert/strict";
import { fileMeeting } from "../convex/lib/echoFiling.ts";

type Row = Record<string, unknown> & { _id: string };

function fakeDb(tables: Record<string, Row[]>) {
  let n = 0;
  const find = (id: string) => Object.values(tables).flat().find((r) => r._id === id) ?? null;
  return {
    tables,
    get: async (id: string) => find(id),
    insert: async (table: string, doc: Record<string, unknown>) => {
      const _id = `${table}:${++n}`;
      const row: Row = { _id };
      for (const [k, v] of Object.entries(doc)) if (v !== undefined) row[k] = v;
      (tables[table] ??= []).push(row);
      return _id;
    },
    patch: async (id: string, fields: Record<string, unknown>) => {
      const row = find(id)!;
      for (const [k, v] of Object.entries(fields)) {
        if (v === undefined) delete row[k];
        else row[k] = v;
      }
    },
    delete: async (id: string) => {
      for (const rows of Object.values(tables)) {
        const i = rows.findIndex((r) => r._id === id);
        if (i >= 0) rows.splice(i, 1);
      }
    },
    query: (table: string) => {
      let rows = [...(tables[table] ?? [])];
      const q = {
        withIndex(_name: string, where: (b: { eq: (f: string, v: unknown) => unknown }) => unknown) {
          const conds: [string, unknown][] = [];
          const b = { eq: (f: string, v: unknown) => (conds.push([f, v]), b) };
          where(b);
          rows = rows.filter((r) => conds.every(([f, v]) => r[f] === v));
          return q;
        },
        first: async () => rows[0] ?? null,
        collect: async () => rows,
      };
      return q;
    },
  };
}

const db = fakeDb({
  users: [
    { _id: "u:asha", name: "Asha Rao", email: "asha@ecultify.com", role: "admin" },
    { _id: "u:ravi", name: "Ravi Shah", email: "ravi.personal@gmail.com", role: "employee" },
    { _id: "u:meera", name: "Meera", email: "meera@ecultify.com", role: "employee" },
    { _id: "u:rahul", name: "Rahul Verma", email: "rahul.v@ecultify.com", role: "employee" },
    { _id: "u:portal", name: "Lane Client", email: "priya@masalalane.com", role: "client", clientBrandId: "b:lane" },
  ],
  brands: [
    { _id: "b:lane", name: "Masala Lane" },
    { _id: "b:orbit", name: "Orbit" },
  ],
  echoMeetings: [],
  echoPeople: [],
  echoActionItems: [],
  meetingMinutes: [],
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = { db } as any;
const t = db.tables;

let sessions = 0;
async function meeting(fields: Record<string, unknown>) {
  return db.insert("echoMeetings", {
    ownerId: "u:asha",
    sessionId: `s${++sessions}`,
    title: "Sync",
    startedAt: Date.parse("2026-11-13T05:00:00Z"), // 10:30 in India
    durationMs: 45 * 60_000,
    attendees: [],
    seenNames: [],
    summary: ["Budget fixed at 4 lakh."],
    actionItems: [],
    decisions: [],
    openQuestions: [],
    transcript: "",
    ...fields,
  });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const get = (id: string) => db.get(id) as Promise<any>;
const person = (key: string) => t.echoPeople.find((p) => p.nameKey === key);

// 1. First meeting with someone new: nothing to go on, so it is not filed. Staff on the call
//    (by full name or a lone first name) never become outside contacts.
const m1 = await meeting({
  seenNames: ["Rohan Mehta", "Asha", "Ravi Shah"],
  actionItems: [
    { task: "Send the deck", ownerName: "Asha" },
    { task: "Share the brief", ownerName: "Rohan Mehta" },
    { task: "Book the studio", ownerName: "Ravi Shah", dueDate: "2026-11-20" },
  ],
});
await fileMeeting(ctx, m1);
assert.equal((await get(m1)).brandId, undefined);
assert.deepEqual(t.echoPeople.map((p) => p.nameKey), ["rohan mehta"]);
assert.equal(t.meetingMinutes.length, 0);
// Action items go to the staff they were given to, never to outsiders.
assert.deepEqual(
  t.echoActionItems.map((a) => [a.assigneeId, a.task, a.status]),
  [["u:asha", "Send the deck", "suggested"], ["u:ravi", "Book the studio", "suggested"]]
);

// 2. The owner files it under a brand: the notes land in that brand's Meeting Minutes and Echo
//    learns where Rohan belongs.
await fileMeeting(ctx, m1, { brandId: "b:lane" });
assert.equal((await get(m1)).brandId, "b:lane");
assert.equal((await get(m1)).brandSource, "manual");
assert.equal(person("rohan mehta")!.brandId, "b:lane");
assert.equal(t.meetingMinutes.length, 1);
const mom = t.meetingMinutes[0];
assert.equal(mom.brandId, "b:lane");
assert.equal(mom.createdBy, "u:asha");
assert.equal(mom.startTime, "10:30");
assert.equal(mom.endTime, "11:15");
assert.match(mom.content as string, /Summary\n- Budget fixed at 4 lakh\./);
assert.match(mom.content as string, /Book the studio \(Ravi Shah, due 2026-11-20\)/);
assert.equal((await get(m1)).momId, mom._id);
assert.equal(t.echoActionItems.length, 2, "filing again must not duplicate action items");

// 3. The next meeting with Rohan files itself.
const m2 = await meeting({ seenNames: ["Rohan Mehta"] });
await fileMeeting(ctx, m2);
assert.equal((await get(m2)).brandId, "b:lane");
assert.equal((await get(m2)).brandSource, "auto");
assert.equal(t.meetingMinutes.length, 2);

// 4. A new person from a known company domain, and a client portal login, both point at the brand.
//    A stranger on Gmail says nothing either way.
await db.insert("echoPeople", { name: "Old Contact", nameKey: "old contact", email: "old@orbit.in", domain: "orbit.in", brandId: "b:orbit" });
const m3 = await meeting({ attendees: [{ name: "New Person", email: "New@Orbit.in" }, { name: "Stranger", email: "stranger@gmail.com" }] });
await fileMeeting(ctx, m3);
assert.equal((await get(m3)).brandId, "b:orbit");
assert.equal(person("new person")!.brandId, "b:orbit");
assert.equal(person("new person")!.email, "new@orbit.in");
assert.equal(person("stranger")!.brandId, undefined, "an automatic match must not teach a brand to someone it knows nothing about");
const m4 = await meeting({ attendees: [{ name: "Priya", email: "priya@masalalane.com" }] });
await fileMeeting(ctx, m4);
assert.equal((await get(m4)).brandId, "b:lane");

// 5. People from two brands in one call: Echo does not guess.
const m5 = await meeting({ seenNames: ["Rohan Mehta", "Old Contact"] });
await fileMeeting(ctx, m5);
assert.equal((await get(m5)).brandId, undefined);

// 6. Staff only (an @ecultify.com address that has no account still counts as staff): internal, no people saved.
const before = t.echoPeople.length;
const m6 = await meeting({ attendees: [{ name: "Intern", email: "intern@ecultify.com" }], seenNames: ["Ravi Shah"] });
await fileMeeting(ctx, m6);
assert.equal((await get(m6)).brandId, undefined);
assert.equal(t.echoPeople.length, before);

// 7. A re-run of the notes keeps the owner's choice, refreshes the minutes and does not bring back
//    an action item that was dismissed.
t.echoActionItems.find((a) => a.task === "Send the deck")!.status = "dismissed";
await db.patch(m1, { summary: ["Budget revised to 5 lakh."] });
await fileMeeting(ctx, m1);
assert.equal((await get(m1)).brandId, "b:lane");
assert.match(t.meetingMinutes.find((r) => r._id === mom._id)!.content as string, /5 lakh/);
assert.deepEqual(
  t.echoActionItems.filter((a) => a.meetingId === m1).map((a) => [a.task, a.status]).sort(),
  [["Book the studio", "suggested"], ["Send the deck", "dismissed"]]
);

// 8. "Not a brand meeting": the minutes copy goes, the people keep what Echo learnt, and a re-run leaves it alone.
await fileMeeting(ctx, m1, { brandId: null });
assert.equal((await get(m1)).brandId, undefined);
assert.equal((await get(m1)).momId, undefined);
assert.equal(t.meetingMinutes.some((r) => r._id === mom._id), false);
assert.equal(person("rohan mehta")!.brandId, "b:lane");
await fileMeeting(ctx, m1);
assert.equal((await get(m1)).brandId, undefined, "a re-run must not override the owner's choice");

// 9. Staff whose name on the call is not exactly their tracker name ("Meera" shown as "Meera Nair",
//    or invited on a personal Gmail) are still staff: a brand picked by hand is never taught to them,
//    so their internal meetings cannot file themselves under it.
const m9 = await meeting({ seenNames: ["Meera Nair", "Kabir Sen"], attendees: [{ name: "Ravi Shah", email: "ravi.other@gmail.com" }] });
await fileMeeting(ctx, m9, { brandId: "b:orbit" });
assert.equal(person("kabir sen")!.brandId, "b:orbit");
assert.equal(person("meera nair"), undefined);
assert.equal(person("ravi shah"), undefined);
const m10 = await meeting({ title: "Appraisal discussion", seenNames: ["Meera Nair"] });
await fileMeeting(ctx, m10);
assert.equal((await get(m10)).brandId, undefined, "an internal meeting was filed under a brand");

// 10. A company address settles it the other way: a client who happens to share a staff name is an outsider.
const m11 = await meeting({ attendees: [{ name: "Asha Rao", email: "asha@clientco.com" }] });
await fileMeeting(ctx, m11);
assert.equal(person("asha rao")!.email, "asha@clientco.com");

// 11. Action items reach only the staff member who was meant: not a namesake of an outsider, and not
//     on a first name alone when the full name says someone else.
const m12 = await meeting({
  actionItems: [
    { task: "Approve artwork", ownerName: "Rahul Gupta", ownerEmail: "rahul@masalalane.com" },
    { task: "Ship files", ownerName: "Rahul Gupta" },
    { task: "Send invoice", ownerName: "Rahul" },
    { task: "Fix the form", ownerName: "Ravi S" },
  ],
});
await fileMeeting(ctx, m12);
assert.deepEqual(
  t.echoActionItems.filter((a) => a.meetingId === m12).map((a) => [a.assigneeId, a.task]),
  [["u:rahul", "Send invoice"], ["u:ravi", "Fix the form"]]
);

console.log("echo filing: all checks passed");
