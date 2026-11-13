import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { fileMeeting } from "./lib/echoFiling";
import { hmac, sameText, seal, signEchoKey } from "./lib/echoKey";
import { googleToken } from "./lib/google";
import { requireInternalUser } from "./lib/guards";

// Echo is the meeting note-taker (a Chrome extension plus its own server). The
// task tracker owns the accounts: it signs a personal key for each person, the
// extension records with that key, and Echo posts the finished notes back to
// POST /echo/meeting (convex/http.ts). ECHO_LINK_SECRET is shared by the two.

const echoUrl = () =>
  (process.env.ECHO_URL ?? "https://echo-production-64df.up.railway.app").replace(/\/$/, "");

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
    hasRecording: v.optional(v.boolean()),
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
    let meetingId: Id<"echoMeetings">;
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
      meetingId = existing._id;
    } else {
      meetingId = await ctx.db.insert("echoMeetings", {
        ...meeting,
        ownerId,
        createdAt: now,
        updatedAt: now,
      });
    }
    await fileMeeting(ctx, meetingId);
    return meetingId;
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
    return await Promise.all(
      rows.map(async (m) => {
        const { transcript, ...rest } = m;
        void transcript; // the list stays light; `get` returns the full row
        return { ...rest, brandName: m.brandId ? (await ctx.db.get(m.brandId))?.name : undefined };
      })
    );
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

/** Brands a meeting can be filed under. */
export const brandOptions = query({
  args: {},
  handler: async (ctx) => {
    await requireInternalUser(ctx);
    const brands = await ctx.db.query("brands").collect();
    return brands
      .filter((b) => !b.onHold)
      .map((b) => ({ _id: b._id, name: b.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** The owner files a meeting under a brand (or none). Echo remembers the people in it. */
export const setBrand = mutation({
  args: { meetingId: v.id("echoMeetings"), brandId: v.union(v.id("brands"), v.null()) },
  handler: async (ctx, { meetingId, brandId }) => {
    const me = await requireInternalUser(ctx);
    const meeting = await ctx.db.get(meetingId);
    if (!meeting || meeting.ownerId !== me._id) throw new Error("Not authorized");
    const brand = brandId ? await ctx.db.get(brandId) : null;
    if (brandId && (!brand || brand.onHold)) throw new Error("That brand is not available");
    await fileMeeting(ctx, meetingId, { brandId });
  },
});

/** Action items from meetings that were given to me and that I have not answered yet. */
export const myActionItems = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireInternalUser(ctx);
    const rows = await ctx.db
      .query("echoActionItems")
      .withIndex("by_assignee_status", (q) => q.eq("assigneeId", me._id).eq("status", "suggested"))
      .take(20);
    return await Promise.all(
      rows.map(async (row) => {
        const meeting = await ctx.db.get(row.meetingId);
        return {
          _id: row._id,
          task: row.task,
          dueDate: row.dueDate,
          meetingTitle: meeting?.title ?? "A meeting",
          meetingAt: meeting?.startedAt,
          brandId: meeting?.brandId,
        };
      })
    );
  },
});

/** Accepted (the dashboard then makes the task) or dismissed: either way it stops being offered. */
export const resolveActionItem = mutation({
  args: {
    itemId: v.id("echoActionItems"),
    status: v.union(v.literal("accepted"), v.literal("dismissed")),
  },
  handler: async (ctx, { itemId, status }) => {
    const me = await requireInternalUser(ctx);
    const item = await ctx.db.get(itemId);
    if (!item || item.assigneeId !== me._id) throw new Error("Not authorized");
    await ctx.db.patch(itemId, { status });
  },
});

/** A link, good for six hours, that plays one of my meetings' recordings from Echo's server. */
export const recordingUrl = action({
  args: { meetingId: v.id("echoMeetings") },
  handler: async (ctx, { meetingId }): Promise<string | null> => {
    const secret = process.env.ECHO_LINK_SECRET;
    const meeting = await ctx.runQuery(api.echo.get, { meetingId });
    if (!secret || !meeting?.hasRecording) return null;
    const exp = Date.now() + 6 * 3_600_000;
    const sig = await hmac(`rec.${meeting.sessionId}.${exp}`, secret);
    return `${echoUrl()}/rec/${meeting.sessionId}?exp=${exp}&sig=${sig}`;
  },
});

/* ---------- Google Calendar (read-only), connected from the profile page ---------- */

// SITE_URL is where Google's answer is sent on to (the profile page); without it the row stays hidden.
const googleReady = () =>
  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET && !!process.env.SITE_URL;
const GOOGLE_REDIRECT = () => `${process.env.CONVEX_SITE_URL}/echo/google/callback`;

export const calendarStatus = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireInternalUser(ctx);
    const row = await ctx.db
      .query("echoCalendars")
      .withIndex("by_user", (q) => q.eq("userId", me._id))
      .first();
    return { available: googleReady(), email: row?.googleEmail ?? null };
  },
});

/** Where to send the browser so the signed-in person can let Echo read their calendar. */
export const googleAuthUrl = action({
  args: {},
  handler: async (ctx): Promise<string> => {
    const secret = process.env.ECHO_LINK_SECRET;
    if (!secret || !googleReady()) throw new Error("Google Calendar is not set up on the server yet");
    const me = await ctx.runQuery(api.users.getCurrentUser, {});
    if (!me || me.role === "client") throw new Error("Not authorized");
    // Signed and good for ten minutes; finishGoogleConnect only accepts it from the same person.
    const exp = Date.now() + 10 * 60_000;
    const state = `${me._id}.${exp}.${await hmac(`gcal.${me._id}.${exp}`, secret)}`;
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: GOOGLE_REDIRECT(),
      response_type: "code",
      scope: "openid email https://www.googleapis.com/auth/calendar.events.readonly",
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  },
});

/** Second half of the connect, run by the profile page with what Google sent back. */
export const finishGoogleConnect = action({
  args: { code: v.string(), state: v.string() },
  handler: async (ctx, { code, state }): Promise<string> => {
    const secret = process.env.ECHO_LINK_SECRET;
    if (!secret || !googleReady()) throw new Error("Google Calendar is not set up on the server yet");
    const me = await ctx.runQuery(api.users.getCurrentUser, {});
    if (!me || me.role === "client") throw new Error("Not authorized");
    const [userId, exp, sig] = state.split(".");
    // Whoever is signed in here must be the person who started the connect.
    if (userId !== me._id || !(Number(exp) > Date.now()) || !sameText(await hmac(`gcal.${userId}.${exp}`, secret), sig ?? "")) {
      throw new Error("This connection link has expired. Start again from your profile.");
    }
    const tokens = await googleToken({ code, grant_type: "authorization_code", redirect_uri: GOOGLE_REDIRECT() });
    if (!tokens.refresh_token || !tokens.id_token) throw new Error("Google did not grant calendar access");
    // The id token came straight from Google over TLS; its payload names the account.
    const claims = JSON.parse(
      atob(tokens.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))
    ) as { email?: string };
    const googleEmail = claims.email ?? "Google Calendar";
    await ctx.runMutation(internal.echo.saveCalendar, {
      userId: me._id,
      googleEmail,
      refreshTokenEnc: await seal(tokens.refresh_token, secret),
    });
    return googleEmail;
  },
});

export const saveCalendar = internalMutation({
  args: { userId: v.string(), googleEmail: v.string(), refreshTokenEnc: v.string() },
  handler: async (ctx, { userId: rawUser, googleEmail, refreshTokenEnc }) => {
    const userId = ctx.db.normalizeId("users", rawUser);
    const user = userId ? await ctx.db.get(userId) : null;
    if (!userId || !user || user.role === "client") throw new Error("Unknown user");
    const old = await ctx.db
      .query("echoCalendars")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const row of old) await ctx.db.delete(row._id);
    await ctx.db.insert("echoCalendars", { userId, googleEmail, refreshTokenEnc, connectedAt: Date.now() });
  },
});

export const calendarToken = internalQuery({
  args: { ownerId: v.string() },
  handler: async (ctx, { ownerId }) => {
    const userId = ctx.db.normalizeId("users", ownerId);
    const user = userId ? await ctx.db.get(userId) : null;
    if (!userId || !user || user.role === "client") return null;
    const row = await ctx.db
      .query("echoCalendars")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    return row?.refreshTokenEnc ?? null;
  },
});

export const disconnectCalendar = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireInternalUser(ctx);
    const rows = await ctx.db
      .query("echoCalendars")
      .withIndex("by_user", (q) => q.eq("userId", me._id))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
  },
});
