// Filing a meeting: which brand it belongs to, the outside people it met, the
// brand's Meeting Minutes copy and the action items offered to staff. It only
// touches ctx.db and imports types alone, so scripts/echo.check.ts can run it
// against an in-memory stand-in.
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

const nameKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const domainOf = (email: string) => email.split("@")[1] ?? "";
// Sharing one of these says nothing about which company someone is from.
const PUBLIC_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.in", "yahoo.co.in", "yahoo.co.uk", "ymail.com",
  "rocketmail.com", "outlook.com", "outlook.in", "hotmail.com", "hotmail.co.uk", "live.com", "live.in",
  "msn.com", "icloud.com", "me.com", "mac.com", "aol.com", "rediffmail.com", "rediff.com", "proton.me",
  "protonmail.com", "pm.me", "zoho.com", "zohomail.in", "zohomail.com", "mail.com", "gmx.com", "gmx.net",
  "yandex.com", "tutanota.com", "fastmail.com", "sify.com", "in.com",
]);

/**
 * Could these be the same person's name? "Ravi" or "Ravi S" on a call is the
 * tracker's "Ravi Shah"; "Rahul Gupta" is not "Rahul Verma". Leans towards yes:
 * taking an outsider for staff only costs a remembered contact, while taking
 * staff for an outsider could file an internal meeting under a brand.
 */
function sameName(a: string, b: string): boolean {
  const [short, long] = [nameKey(a).split(" "), nameKey(b).split(" ")].sort((x, y) => x.length - y.length);
  return short.every((t) => long.some((u) => u.startsWith(t) || t.startsWith(u)));
}
/** Wall-clock time in India, the way Meeting Minutes stores start and end. */
const hhmm = (ms: number) => new Date(ms + 330 * 60_000).toISOString().slice(11, 16);

function momText(m: Doc<"echoMeetings">): string {
  const list = (title: string, lines: string[]) =>
    lines.length ? `${title}\n${lines.map((l) => `- ${l}`).join("\n")}\n\n` : "";
  return (
    list("Summary", m.summary) +
    list(
      "Action items",
      m.actionItems.map((a) => {
        const due = a.dueDate ?? a.dueText;
        return `${a.task} (${a.ownerName ?? "no owner yet"}${due ? `, due ${due}` : ""})`;
      })
    ) +
    list("Decisions", m.decisions.map((d) => d.text)) +
    list("Open questions", m.openQuestions) +
    (m.nextMeeting ? `Next meeting\n${m.nextMeeting}\n\n` : "") +
    "Recorded and written up by Echo."
  );
}

/**
 * Works out which brand a meeting belongs to from who was in it, remembers the
 * outside people it met, keeps the brand's Meeting Minutes copy in step and
 * offers each action item to the staff member it was given to. Safe to repeat.
 * `manual` is the owner's own choice of brand (null: not a brand meeting).
 */
export async function fileMeeting(
  ctx: MutationCtx,
  meetingId: Id<"echoMeetings">,
  manual?: { brandId: Id<"brands"> | null }
) {
  const m = await ctx.db.get(meetingId);
  if (!m) return;
  const now = Date.now();
  const users = await ctx.db.query("users").collect();
  const staff = users.filter((u) => u.role !== "client" && u.isReviewer !== true);
  const staffByEmail = new Map(
    staff.filter((u) => u.email).map((u) => [u.email!.toLowerCase(), u] as const)
  );
  const staffByName = new Map(
    staff.filter((u) => u.name?.trim()).map((u) => [nameKey(u.name!), u] as const)
  );
  const staffNamed = (name: string) => [...staffByName.values()].filter((u) => sameName(name, u.name!));
  const staffDomains = new Set(
    [...staffByEmail.keys()].map(domainOf).filter((d) => d && !PUBLIC_MAIL.has(d))
  );
  const clientBrand = new Map(
    users
      .filter((u) => u.role === "client" && u.email && u.clientBrandId)
      .map((u) => [u.email!.toLowerCase(), u.clientBrandId!] as const)
  );

  // Everyone in the meeting who is not staff: invitees (with emails) and the
  // names read off the call. A company address settles it either way; with no
  // address, or only a webmail one, a name that could be a staff member's
  // counts as staff, so "Asha" on the call never becomes an outside contact.
  const outside = new Map<string, { name: string; email?: string }>();
  const everyone = [...m.attendees, ...m.seenNames.map((name) => ({ name, email: undefined }))];
  for (const p of everyone) {
    const k = nameKey(p.name);
    const email = p.email?.trim().toLowerCase();
    if (!k) continue;
    const companyAddress = !!email && !PUBLIC_MAIL.has(domainOf(email));
    const isStaff =
      (email && (staffByEmail.has(email) || staffDomains.has(domainOf(email)))) ||
      (!companyAddress && staffNamed(p.name).length > 0);
    if (isStaff) continue;
    outside.set(k, { name: p.name.trim(), email: email ?? outside.get(k)?.email });
  }

  // What we already know about each of them.
  const known = new Map<string, { person: Doc<"echoPeople"> | null; brandId?: Id<"brands"> }>();
  for (const [k, p] of outside) {
    const email = p.email;
    let person = email
      ? await ctx.db.query("echoPeople").withIndex("by_email", (q) => q.eq("email", email)).first()
      : null;
    if (!person) {
      const sameName = await ctx.db
        .query("echoPeople")
        .withIndex("by_name", (q) => q.eq("nameKey", k))
        .first();
      // Same name but a different email is a different person.
      if (sameName && !(email && sameName.email && sameName.email !== email)) person = sameName;
    }
    let brandId = (email && clientBrand.get(email)) || person?.brandId;
    const domain = email ? domainOf(email) : "";
    if (!brandId && domain && !PUBLIC_MAIL.has(domain)) {
      const colleagues = await ctx.db
        .query("echoPeople")
        .withIndex("by_domain", (q) => q.eq("domain", domain))
        .collect();
      brandId = colleagues.find((c) => c.brandId)?.brandId;
    }
    known.set(k, { person, brandId });
  }

  // The brand: the owner's choice stands; otherwise file it only when everyone
  // we recognise points at the same brand.
  let brandId = m.brandId;
  let brandSource = m.brandSource;
  if (manual) {
    brandId = manual.brandId ?? undefined;
    brandSource = "manual";
  } else if (m.brandSource !== "manual") {
    const candidates = new Set([...known.values()].map((x) => x.brandId).filter((b) => !!b));
    brandId = candidates.size === 1 ? [...candidates][0] : undefined;
    brandSource = brandId ? "auto" : undefined;
  }
  if (brandId && !(await ctx.db.get(brandId))) brandId = undefined;

  // Remember the outside people. A brand picked by hand teaches Echo where they
  // all belong; an automatic match only fills in what it worked out for each.
  for (const [k, p] of outside) {
    const { person, brandId: theirs } = known.get(k)!;
    const learn = manual ? manual.brandId ?? undefined : person?.brandId ? undefined : theirs;
    const domain = p.email ? domainOf(p.email) : undefined;
    if (!person) {
      await ctx.db.insert("echoPeople", {
        name: p.name,
        nameKey: k,
        email: p.email,
        domain,
        brandId: learn,
        updatedAt: now,
      });
    } else {
      const patch: Partial<Doc<"echoPeople">> = {};
      if (p.email && !person.email) Object.assign(patch, { email: p.email, domain });
      if (learn && person.brandId !== learn) patch.brandId = learn;
      if (Object.keys(patch).length) await ctx.db.patch(person._id, { ...patch, updatedAt: now });
    }
  }

  // The brand folder: one Meeting Minutes row that follows the meeting around.
  let momId = m.momId && (await ctx.db.get(m.momId)) ? m.momId : undefined;
  if (brandId) {
    const owner = await ctx.db.get(m.ownerId);
    const names = new Set([owner?.name ?? "", ...everyone.map((p) => p.name.trim())].filter(Boolean));
    const fields = {
      brandId,
      title: m.title,
      meetingDate: m.startedAt,
      startTime: hhmm(m.startedAt),
      endTime: hhmm(m.startedAt + m.durationMs),
      attendees: [...names],
      content: momText(m),
      updatedAt: now,
    };
    if (momId) await ctx.db.patch(momId, fields);
    else momId = await ctx.db.insert("meetingMinutes", { ...fields, createdBy: m.ownerId, createdAt: now });
  } else if (momId) {
    await ctx.db.delete(momId);
    momId = undefined;
  }
  await ctx.db.patch(meetingId, { brandId, brandSource, momId });

  // Action items: offered afresh on every run, except the ones already answered.
  const before = await ctx.db
    .query("echoActionItems")
    .withIndex("by_meeting", (q) => q.eq("meetingId", meetingId))
    .collect();
  const answered = new Set<string>();
  for (const row of before) {
    if (row.status === "suggested") await ctx.db.delete(row._id);
    else answered.add(`${row.assigneeId}|${row.task}`);
  }
  for (const a of m.actionItems) {
    // By address when there is one; by name only when exactly one staff member
    // could be meant, and never when the address shows the owner is an outsider.
    const ownerEmail = a.ownerEmail?.trim().toLowerCase();
    let assignee = ownerEmail ? staffByEmail.get(ownerEmail) : undefined;
    const outsider =
      !!ownerEmail && !assignee && !PUBLIC_MAIL.has(domainOf(ownerEmail)) && !staffDomains.has(domainOf(ownerEmail));
    if (!assignee && a.ownerName && !outsider) {
      const named = staffNamed(a.ownerName);
      if (named.length === 1) assignee = named[0];
    }
    if (!assignee || answered.has(`${assignee._id}|${a.task}`)) continue;
    answered.add(`${assignee._id}|${a.task}`);
    await ctx.db.insert("echoActionItems", {
      meetingId,
      assigneeId: assignee._id,
      task: a.task,
      dueDate: a.dueDate,
      status: "suggested",
      createdAt: now,
    });
  }
}
