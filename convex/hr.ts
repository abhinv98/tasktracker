import { getAuthUserId } from "./lib/internalAuth";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";

// ── HR REQUESTS ────────────────────────────────────────────────
// Anyone on staff raises a request; only HR (users.isHR) triages it.

const categoryValidator = v.union(
  v.literal("appointment_letter"),
  v.literal("appraisal_letter"),
  v.literal("reimbursement_comp_off"),
  v.literal("attendance_regularization")
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
