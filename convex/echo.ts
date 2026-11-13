import { v } from "convex/values";
import { action, internalMutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { signEchoKey } from "./lib/echoKey";
import { requireInternalUser } from "./lib/guards";

// Echo is the meeting note-taker (a Chrome extension plus its own server). The
// task tracker owns the accounts: it signs a personal key for each person, the
// extension records with that key, and Echo posts the finished notes back to
// POST /echo/meeting (convex/http.ts). ECHO_LINK_SECRET is shared by the two.

/** The signed-in person's Echo key, handed to the extension by the profile page. */
export const createLinkKey = action({
  args: {},
  handler: async (ctx): Promise<{ key: string; name: string; email: string }> => {
    const secret = process.env.ECHO_LINK_SECRET;
    if (!secret) throw new Error("Echo is not set up on the server yet");
    const me = await ctx.runQuery(api.users.getCurrentUser, {});
    if (!me || me.role === "client") throw new Error("Not authorized");
    if (!me.email) throw new Error("Your account has no email address");
    // Good for 180 days, so a key left behind stops working by itself; linking again renews it.
    const who = {
      id: me._id as string,
      email: me.email,
      name: me.name?.trim() || me.email,
      exp: Date.now() + 180 * 86_400_000,
    };
    return { key: await signEchoKey(who, secret), name: who.name, email: who.email };
  },
});

/** What Echo posts when a meeting's notes are ready (or redone). */
export const ingest = internalMutation({
  args: {
    sessionId: v.string(),
    ownerId: v.string(),
    title: v.string(),
    startedAt: v.number(),
    durationMs: v.number(),
    meetingUrl: v.optional(v.string()),
    attendees: v.array(v.object({ name: v.string(), email: v.optional(v.string()) })),
    seenNames: v.array(v.string()),
    summary: v.array(v.string()),
    actionItems: v.array(
      v.object({
        task: v.string(),
        ownerName: v.optional(v.string()),
        ownerEmail: v.optional(v.string()),
        dueDate: v.optional(v.string()),
        dueText: v.optional(v.string()),
        timestamp: v.optional(v.string()),
      })
    ),
    decisions: v.array(
      v.object({
        text: v.string(),
        by: v.optional(v.string()),
        timestamp: v.optional(v.string()),
      })
    ),
    openQuestions: v.array(v.string()),
    nextMeeting: v.optional(v.string()),
    transcript: v.string(),
  },
  handler: async (ctx, { ownerId: rawOwner, ...meeting }) => {
    const ownerId = ctx.db.normalizeId("users", rawOwner);
    const owner = ownerId ? await ctx.db.get(ownerId) : null;
    if (!ownerId || !owner || owner.role === "client") throw new Error("Unknown owner");
    const now = Date.now();
    const existing = await ctx.db
      .query("echoMeetings")
      .withIndex("by_session", (q) => q.eq("sessionId", meeting.sessionId))
      .unique();
    if (existing) {
      // A meeting never changes hands: a re-run only refreshes its own row.
      if (existing.ownerId !== ownerId) throw new Error("Meeting belongs to someone else");
      await ctx.db.patch(existing._id, {
        ...meeting,
        // Named so a re-run that no longer has them clears the old values.
        meetingUrl: meeting.meetingUrl,
        nextMeeting: meeting.nextMeeting,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("echoMeetings", {
      ...meeting,
      ownerId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** My meetings, newest first, without the transcripts. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireInternalUser(ctx);
    const rows = await ctx.db
      .query("echoMeetings")
      .withIndex("by_owner_time", (q) => q.eq("ownerId", me._id))
      .order("desc")
      // ponytail: reads whole rows (transcripts included) to list 50; split the
      // transcript into its own table if people pile up long meetings.
      .take(50);
    return rows.map((m) => {
      const { transcript, ...rest } = m;
      void transcript; // the list stays light; `get` returns the full row
      return rest;
    });
  },
});

/** One of my meetings in full. */
export const get = query({
  args: { meetingId: v.id("echoMeetings") },
  handler: async (ctx, { meetingId }) => {
    const me = await requireInternalUser(ctx);
    const meeting = await ctx.db.get(meetingId);
    if (!meeting || meeting.ownerId !== me._id) return null;
    return meeting;
  },
});
