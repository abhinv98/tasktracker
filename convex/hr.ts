import { getAuthUserId } from "./lib/internalAuth";
import { internalMutation, mutation, query } from "./_generated/server";
import { HR_STALE_AFTER_DAYS, isHrRequestStale } from "../src/lib/hrRequests";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";

// ── HR REQUESTS ────────────────────────────────────────────────
// Anyone on staff raises a request; only HR (users.isHR) triages it.

const categoryValidator = v.union(
  v.literal("appointment_letter"),
  v.literal("appraisal_letter"),
  v.literal("reimbursement_comp_off"),
  v.literal("attendance_regularization"),
  v.literal("other")
);

const statusValidator = v.union(
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("declined")
);

const documentValidator = v.object({
  fileId: v.id("_storage"),
  fileName: v.string(),
  fileType: v.optional(v.string()),
  uploadedAt: v.number(),
});

async function requireHR(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const user = await ctx.db.get(userId);
  if (!user || user.isHR !== true) throw new Error("HR only");
  return userId as Id<"users">;
}

async function withDocUrls(ctx: any, req: Doc<"hrRequests">) {
  const docs = await Promise.all(
    (req.documents ?? []).map(async (d) => ({
      ...d,
      url: await ctx.storage.getUrl(d.fileId),
    }))
  );
  return { ...req, documents: docs };
}

/** Requests raised by the signed-in user (their "My Requests" page). */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("hrRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return await Promise.all(rows.map((r) => withDocUrls(ctx, r)));
  },
});

/** Every request, for HR's triage board. */
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const me = await ctx.db.get(userId);
    if (!me || me.isHR !== true) return [];

    const rows = await ctx.db.query("hrRequests").collect();
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return await Promise.all(
      rows.map(async (r) => {
        const requester = await ctx.db.get(r.userId);
        return {
          ...(await withDocUrls(ctx, r)),
          requesterName: requester?.name ?? requester?.email ?? "Unknown",
          requesterDesignation: requester?.designation ?? null,
        };
      })
    );
  },
});

/** Sidebar badge — pending requests waiting on HR. */
export const countPending = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return 0;
    const me = await ctx.db.get(userId);
    if (!me || me.isHR !== true) return 0;
    const pending = await ctx.db
      .query("hrRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    return pending.length;
  },
});

export const createRequest = mutation({
  args: {
    category: categoryValidator,
    subject: v.string(),
    details: v.optional(v.string()),
  },
  handler: async (ctx, { category, subject, details }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    if (!subject.trim()) throw new Error("Subject is required");

    const now = Date.now();
    return await ctx.db.insert("hrRequests", {
      userId,
      category,
      subject: subject.trim(),
      details: details?.trim() || undefined,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Accept / decline / move a request along, with an optional note for the requester. */
export const setStatus = mutation({
  args: {
    requestId: v.id("hrRequests"),
    status: statusValidator,
    statusNote: v.optional(v.string()),
  },
  handler: async (ctx, { requestId, status, statusNote }) => {
    await requireHR(ctx);
    const req = await ctx.db.get(requestId);
    if (!req) throw new Error("Request not found");
    await ctx.db.patch(requestId, {
      status,
      statusNote: statusNote?.trim() || req.statusNote,
      updatedAt: Date.now(),
    });
  },
});

/** Triage a whole selection in one round-trip — Monday-morning batches were
 *  one click and one toast per request. */
export const setStatusBulk = mutation({
  args: {
    requestIds: v.array(v.id("hrRequests")),
    status: statusValidator,
    statusNote: v.optional(v.string()),
  },
  handler: async (ctx, { requestIds, status, statusNote }) => {
    await requireHR(ctx);
    const now = Date.now();
    let updated = 0;
    for (const requestId of requestIds) {
      const req = await ctx.db.get(requestId);
      if (!req) continue;
      await ctx.db.patch(requestId, {
        status,
        statusNote: statusNote?.trim() || req.statusNote,
        updatedAt: now,
      });
      updated++;
    }
    return { updated };
  },
});

export const addDocument = mutation({
  args: { requestId: v.id("hrRequests"), document: documentValidator },
  handler: async (ctx, { requestId, document }) => {
    await requireHR(ctx);
    const req = await ctx.db.get(requestId);
    if (!req) throw new Error("Request not found");
    await ctx.db.patch(requestId, {
      documents: [...(req.documents ?? []), document],
      updatedAt: Date.now(),
    });
  },
});

export const removeDocument = mutation({
  args: { requestId: v.id("hrRequests"), fileId: v.id("_storage") },
  handler: async (ctx, { requestId, fileId }) => {
    await requireHR(ctx);
    const req = await ctx.db.get(requestId);
    if (!req) throw new Error("Request not found");
    if (!(req.documents ?? []).some((d) => d.fileId === fileId))
      throw new Error("Document not on this request");
    await ctx.storage.delete(fileId);
    await ctx.db.patch(requestId, {
      documents: (req.documents ?? []).filter((d) => d.fileId !== fileId),
      updatedAt: Date.now(),
    });
  },
});

/** The requester (or HR) can delete a request outright, documents included. */
export const deleteRequest = mutation({
  args: { requestId: v.id("hrRequests") },
  handler: async (ctx, { requestId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const me = await ctx.db.get(userId);
    const req = await ctx.db.get(requestId);
    if (!req) throw new Error("Request not found");
    if (req.userId !== userId && me?.isHR !== true)
      throw new Error("Not authorized");

    for (const doc of req.documents ?? []) {
      await ctx.storage.delete(doc.fileId);
    }
    await ctx.db.delete(requestId);
  },
});

/**
 * Daily nudge (convex/crons.ts): if any request has been open for more than
 * HR_STALE_AFTER_DAYS days, everyone in HR gets one notification with the
 * count. One a day while any are still open, none when the board is clear.
 */
const STALE_TITLE_END = `open for more than ${HR_STALE_AFTER_DAYS} days`;

export const remindStaleRequests = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const stale = (await ctx.db.query("hrRequests").collect()).filter((r) => isHrRequestStale(r, now));
    if (stale.length === 0) return { stale: 0, notified: 0 };
    const hr = (await ctx.db.query("users").collect()).filter((u) => u.isHR === true);
    const n = stale.length;
    const title = `${n} request${n !== 1 ? "s" : ""} open for more than ${HR_STALE_AFTER_DAYS} days`;
    const message = `Please close ${n !== 1 ? "them" : "it"} out, or update ${n !== 1 ? "their" : "its"} status, on the Requests page.`;
    for (const person of hr) {
      // One reminder at a time: yesterday's unread one is brought up to date
      // instead of a new one being stacked on top of it every morning.
      const unread = await ctx.db
        .query("notifications")
        .withIndex("by_recipient_read", (q) => q.eq("recipientId", person._id).eq("read", false))
        .collect();
      const earlier = unread.find((x) => x.type === "deadline_reminder" && x.title.endsWith(STALE_TITLE_END));
      if (earlier) {
        await ctx.db.patch(earlier._id, { title, message, createdAt: now });
        continue;
      }
      await ctx.db.insert("notifications", {
        recipientId: person._id,
        type: "deadline_reminder",
        title,
        message,
        // A system reminder has no sender; the schema wants one, so it is the person themselves.
        triggeredBy: person._id,
        read: false,
        createdAt: now,
      });
    }
    return { stale: n, notified: hr.length };
  },
});
