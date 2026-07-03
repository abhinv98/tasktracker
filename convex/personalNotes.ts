import { getAuthUserId } from "./lib/internalAuth";
import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// ── Personal Notes ─────────────────────────────────────────────
// Strictly private notepad / task manager for admins & super-admins.
// Every function is scoped to the calling user — admins only ever see
// their own notes. Employees are blocked entirely.

async function requireAdmin(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const user = await ctx.db.get(userId);
  if (!user || user.role !== "admin")
    throw new Error("Only admins can use the personal notebook");
  return { userId: userId as Id<"users">, user };
}

const checklistValidator = v.array(
  v.object({ text: v.string(), done: v.boolean() })
);

export const listMine = query({
  args: {
    date: v.optional(v.string()),
    brandId: v.optional(v.id("brands")),
    search: v.optional(v.string()),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, { date, brandId, search, includeArchived }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") return [];

    let notes = await ctx.db
      .query("personalNotes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    if (!includeArchived) notes = notes.filter((n) => !n.archived);
    if (date) notes = notes.filter((n) => n.date === date);
    if (brandId) notes = notes.filter((n) => n.brandId === brandId);
    if (search && search.trim()) {
      const s = search.trim().toLowerCase();
      notes = notes.filter(
        (n) =>
          n.title.toLowerCase().includes(s) ||
          n.content.toLowerCase().includes(s) ||
          (n.tags ?? []).some((t) => t.toLowerCase().includes(s))
      );
    }

    const brands = await ctx.db.query("brands").collect();
    const withBrand = notes.map((n) => ({
      ...n,
      brandName: n.brandId
        ? brands.find((b) => b._id === n.brandId)?.name ?? null
        : null,
    }));

    // Pinned first, then most recently updated.
    return withBrand.sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
  },
});

export const dueReminders = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") return [];

    const now = Date.now();
    const notes = await ctx.db
      .query("personalNotes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return notes
      .filter(
        (n) => !n.archived && n.remindAt !== undefined && n.remindAt <= now
      )
      .sort((a, b) => (a.remindAt ?? 0) - (b.remindAt ?? 0));
  },
});

export const get = query({
  args: { noteId: v.id("personalNotes") },
  handler: async (ctx, { noteId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const note = await ctx.db.get(noteId);
    if (!note || note.userId !== userId) return null;
    return note;
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    content: v.string(),
    date: v.string(),
    brandId: v.optional(v.id("brands")),
    tags: v.optional(v.array(v.string())),
    color: v.optional(v.string()),
    pinned: v.optional(v.boolean()),
    checklist: v.optional(checklistValidator),
    remindAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const now = Date.now();
    return await ctx.db.insert("personalNotes", {
      ...args,
      userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    noteId: v.id("personalNotes"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    date: v.optional(v.string()),
    brandId: v.optional(v.id("brands")),
    tags: v.optional(v.array(v.string())),
    color: v.optional(v.string()),
    pinned: v.optional(v.boolean()),
    checklist: v.optional(checklistValidator),
    remindAt: v.optional(v.number()),
    archived: v.optional(v.boolean()),
    /** Pass true to explicitly clear the reminder. */
    clearReminder: v.optional(v.boolean()),
  },
  handler: async (ctx, { noteId, clearReminder, ...fields }) => {
    const { userId } = await requireAdmin(ctx);
    const note = await ctx.db.get(noteId);
    if (!note || note.userId !== userId)
      throw new Error("Note not found");

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (fields.title !== undefined) updates.title = fields.title;
    if (fields.content !== undefined) updates.content = fields.content;
    if (fields.date !== undefined) updates.date = fields.date;
    if (fields.brandId !== undefined) updates.brandId = fields.brandId;
    if (fields.tags !== undefined) updates.tags = fields.tags;
    if (fields.color !== undefined) updates.color = fields.color;
    if (fields.pinned !== undefined) updates.pinned = fields.pinned;
    if (fields.checklist !== undefined) updates.checklist = fields.checklist;
    if (fields.archived !== undefined) updates.archived = fields.archived;
    if (clearReminder) {
      updates.remindAt = undefined;
      updates.reminderSentAt = undefined;
    } else if (fields.remindAt !== undefined) {
      updates.remindAt = fields.remindAt;
      updates.reminderSentAt = undefined; // re-arm reminder
    }

    await ctx.db.patch(noteId, updates);
  },
});

export const remove = mutation({
  args: { noteId: v.id("personalNotes") },
  handler: async (ctx, { noteId }) => {
    const { userId } = await requireAdmin(ctx);
    const note = await ctx.db.get(noteId);
    if (!note || note.userId !== userId)
      throw new Error("Note not found");
    await ctx.db.delete(noteId);
  },
});

export const togglePin = mutation({
  args: { noteId: v.id("personalNotes") },
  handler: async (ctx, { noteId }) => {
    const { userId } = await requireAdmin(ctx);
    const note = await ctx.db.get(noteId);
    if (!note || note.userId !== userId)
      throw new Error("Note not found");
    await ctx.db.patch(noteId, {
      pinned: !note.pinned,
      updatedAt: Date.now(),
    });
  },
});

export const toggleChecklistItem = mutation({
  args: { noteId: v.id("personalNotes"), index: v.number() },
  handler: async (ctx, { noteId, index }) => {
    const { userId } = await requireAdmin(ctx);
    const note = await ctx.db.get(noteId);
    if (!note || note.userId !== userId)
      throw new Error("Note not found");
    const checklist = [...(note.checklist ?? [])];
    if (index < 0 || index >= checklist.length) return;
    checklist[index] = {
      ...checklist[index],
      done: !checklist[index].done,
    };
    await ctx.db.patch(noteId, { checklist, updatedAt: Date.now() });
  },
});

export const setReminder = mutation({
  args: {
    noteId: v.id("personalNotes"),
    remindAt: v.optional(v.number()),
  },
  handler: async (ctx, { noteId, remindAt }) => {
    const { userId } = await requireAdmin(ctx);
    const note = await ctx.db.get(noteId);
    if (!note || note.userId !== userId)
      throw new Error("Note not found");
    await ctx.db.patch(noteId, {
      remindAt,
      reminderSentAt: undefined,
      updatedAt: Date.now(),
    });
  },
});

// Called by the frontend after it creates a task/calendar/brief/mom from a
// note via the existing public mutations — stamps the link back on the note
// so the manager can trace what a note turned into.
export const markConverted = mutation({
  args: {
    noteId: v.id("personalNotes"),
    kind: v.union(
      v.literal("task"),
      v.literal("calendar"),
      v.literal("brief"),
      v.literal("mom")
    ),
    refId: v.string(),
  },
  handler: async (ctx, { noteId, kind, refId }) => {
    const { userId } = await requireAdmin(ctx);
    const note = await ctx.db.get(noteId);
    if (!note || note.userId !== userId)
      throw new Error("Note not found");
    await ctx.db.patch(noteId, {
      convertedTo: { kind, refId, at: Date.now() },
      updatedAt: Date.now(),
    });
  },
});

// Hourly cron: notify note owners when a "revisit later" reminder is due.
// reminderSentAt dedupes so each reminder fires once until re-armed.
export const checkNoteReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query("personalNotes")
      .filter((q) =>
        q.and(
          q.neq(q.field("remindAt"), undefined),
          q.lte(q.field("remindAt"), now),
          q.eq(q.field("reminderSentAt"), undefined)
        )
      )
      .collect();

    let sent = 0;
    for (const note of due) {
      if (note.archived) {
        await ctx.db.patch(note._id, { reminderSentAt: now });
        continue;
      }
      await ctx.db.insert("notifications", {
        recipientId: note.userId,
        type: "note_reminder",
        title: "Note reminder",
        message: `Revisit your note: "${note.title || "Untitled note"}"`,
        triggeredBy: note.userId,
        read: false,
        createdAt: now,
      });
      await ctx.db.patch(note._id, { reminderSentAt: now });
      sent++;
    }
    return { sent };
  },
});
