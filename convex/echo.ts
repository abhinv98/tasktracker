import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { fileMeeting } from "./lib/echoFiling";
import { joinLinkOf, type CalendarEvent } from "../src/lib/echo";
import { hmac, sameText, seal, signEchoKey, unseal } from "./lib/echoKey";
import { calendarEvents, googleToken } from "./lib/google";
import { mayRecruitFor, recruitAccess, requireEchoUser } from "./lib/guards";

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
    // An outside reviewer's key lasts 30 days, since a key cannot be taken back, and is marked
    // so Echo never joins their recordings with staff ones (~/echo/server/src/sharing.ts).
    const who = {
      id: me._id as string,
      email: me.email,
      name: me.name?.trim() || me.email,
      exp: Date.now() + (me.isReviewer ? 30 : 180) * 86_400_000,
      ...(me.isReviewer ? { outside: true as const } : {}),
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
    /** Teammates whose Echo was in the call without recording it (one recording per meeting). */
    sharedWith: v.optional(v.array(v.string())),
    continuesSessionId: v.optional(v.string()),
  },
  handler: async (ctx, { ownerId: rawOwner, sharedWith, ...meeting }) => {
    // Staff accounts only. Echo's keys are good for 180 days, so the recorder's
    // account may have been removed or made a client since. The meeting then goes
    // to the first teammate who was attached to it instead of being refused,
    // because their Echo stayed quiet on the strength of that recording.
    const staff = async (raw: string) => {
      const id = ctx.db.normalizeId("users", raw);
      const user = id ? await ctx.db.get(id) : null;
      return id && user && user.role !== "client" ? id : null;
    };
    const isReviewer = async (id: Id<"users">) => (await ctx.db.get(id))?.isReviewer === true;
    let ownerId = await staff(rawOwner);
    for (const raw of sharedWith ?? []) {
      if (ownerId) break;
      const candidate = await staff(raw);
      if (candidate && !(await isReviewer(candidate))) ownerId = candidate;
    }
    if (!ownerId) throw new Error("Unknown owner");
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
        continuesSessionId: meeting.continuesSessionId,
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
    // Everyone else who was in the call sees the same notes. Only ever added to:
    // a re-run of the notes must not take a meeting away from someone.
    const already = new Set(
      (
        await ctx.db
          .query("echoMeetingViewers")
          .withIndex("by_meeting_user", (q) => q.eq("meetingId", meetingId))
          .collect()
      ).map((row) => row.userId as string)
    );
    // An outside reviewer's recording is theirs alone: nobody is added to it
    // and it is not filed or turned into tasks. Nor is a reviewer ever added
    // to a staff recording. (Echo does not share across the two either.)
    const reviewerOwned = await isReviewer(ownerId);
    for (const raw of reviewerOwned ? [] : new Set(sharedWith ?? [])) {
      const userId = ctx.db.normalizeId("users", raw);
      if (!userId || userId === ownerId || already.has(userId)) continue;
      const user = await ctx.db.get(userId);
      if (!user || user.role === "client" || user.isReviewer === true) continue;
      await ctx.db.insert("echoMeetingViewers", { meetingId, userId });
    }
    if (!reviewerOwned) await fileMeeting(ctx, meetingId);
    return meetingId;
  },
});

/** Whether `userId` may read a meeting: they recorded it, or their Echo was in the call. */
async function canSeeMeeting(ctx: QueryCtx, meeting: Doc<"echoMeetings">, userId: Id<"users">) {
  if (meeting.ownerId === userId) return true;
  const row = await ctx.db
    .query("echoMeetingViewers")
    .withIndex("by_meeting_user", (q) => q.eq("meetingId", meeting._id).eq("userId", userId))
    .first();
  if (row !== null) return true;
  // Filed under a recruitment position: HR and the people hiring for it.
  if (meeting.recruitJobSourceId === undefined) return false;
  const access = await recruitAccess(ctx);
  return !!access && mayRecruitFor(access, meeting.recruitJobSourceId);
}

/** My meetings, newest first, without the transcripts: the ones I recorded and
 *  the ones a teammate's Echo recorded while mine was in the same call. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireEchoUser(ctx);
    const mine = await ctx.db
      .query("echoMeetings")
      .withIndex("by_owner_time", (q) => q.eq("ownerId", me._id))
      .order("desc")
      // ponytail: reads whole rows (transcripts included) to list 50; split the
      // transcript into its own table if people pile up long meetings.
      .take(50);
    const sharedIds = (
      await ctx.db
        .query("echoMeetingViewers")
        .withIndex("by_user", (q) => q.eq("userId", me._id))
        .order("desc")
        .take(50)
    ).map((row) => row.meetingId);
    const shared = (await Promise.all(sharedIds.map((id) => ctx.db.get(id)))).filter(
      (m): m is Doc<"echoMeetings"> => !!m
    );
    const rows = [...mine, ...shared].sort((a, b) => b.startedAt - a.startedAt).slice(0, 50);
    return await Promise.all(
      rows.map(async (m) => {
        const { transcript, ...rest } = m;
        void transcript; // the list stays light; `get` returns the full row
        return {
          ...rest,
          brandName: m.brandId ? (await ctx.db.get(m.brandId))?.name : undefined,
          // Whose Echo recorded it, when it was not mine.
          recordedBy: m.ownerId === me._id ? null : ((await ctx.db.get(m.ownerId))?.name ?? "A teammate"),
        };
      })
    );
  },
});

/** One of my meetings in full. Only its recorder files it under a brand (`mine`). */
export const get = query({
  args: { meetingId: v.id("echoMeetings") },
  handler: async (ctx, { meetingId }) => {
    const me = await requireEchoUser(ctx);
    const meeting = await ctx.db.get(meetingId);
    if (!meeting || !(await canSeeMeeting(ctx, meeting, me._id))) return null;
    const mine = meeting.ownerId === me._id;
    // Everyone with access sees who else has it: sharing is never silent.
    const viewerRows = await ctx.db
      .query("echoMeetingViewers")
      .withIndex("by_meeting_user", (q) => q.eq("meetingId", meetingId))
      .collect();
    const sharedWith = await Promise.all(
      viewerRows.map(async (row) => ({
        userId: row.userId,
        name: (await ctx.db.get(row.userId))?.name ?? "A teammate",
      }))
    );
    return {
      ...meeting,
      mine,
      /** Reading it only because it is filed under a recruitment position, not from being in the call. */
      viaRecruitment: !mine && !viewerRows.some((row) => row.userId === me._id),
      /** Brand folders are staff-only; an outside reviewer never sees them. */
      canFile: me.isReviewer !== true,
      sharedWith,
      recordedBy: mine ? null : ((await ctx.db.get(meeting.ownerId))?.name ?? "A teammate"),
      brandName: meeting.brandId ? ((await ctx.db.get(meeting.brandId))?.name ?? null) : null,
      recruitJobName: await recruitJobName(ctx, meeting.recruitJobSourceId),
    };
  },
});

/* ---------- Recruitment folder ---------- */

async function recruitJobName(ctx: QueryCtx, jobSourceId: number | undefined) {
  if (jobSourceId === undefined) return null;
  const job = await ctx.db
    .query("recruitJobs")
    .withIndex("by_source", (q) => q.eq("sourceId", jobSourceId))
    .first();
  return job?.name ?? null;
}

/** Positions I may file a meeting under: mine if I was given some, all for HR, none otherwise. */
export const recruitFolders = query({
  args: {},
  handler: async (ctx) => {
    const access = await recruitAccess(ctx);
    if (!access) return [];
    return (await ctx.db.query("recruitJobs").collect())
      .filter((j) => mayRecruitFor(access, j.sourceId))
      .map((j) => ({ id: j.sourceId, name: j.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** The recorder puts a meeting into Recruitment under a position (or takes it out). */
export const setRecruitFolder = mutation({
  args: { meetingId: v.id("echoMeetings"), jobSourceId: v.union(v.number(), v.null()) },
  handler: async (ctx, { meetingId, jobSourceId }) => {
    const me = await requireEchoUser(ctx);
    const meeting = await ctx.db.get(meetingId);
    if (!meeting || meeting.ownerId !== me._id) throw new Error("Only the person who recorded it can file it");
    if (jobSourceId !== null) {
      const access = await recruitAccess(ctx);
      if (!access || !mayRecruitFor(access, jobSourceId) || !(await recruitJobName(ctx, jobSourceId))) {
        throw new Error("You do not have access to that position");
      }
    }
    await ctx.db.patch(meetingId, { recruitJobSourceId: jobSourceId ?? undefined, updatedAt: Date.now() });
  },
});

/** Meetings filed under the positions I may see, newest first, without transcripts. */
export const listRecruit = query({
  args: {},
  handler: async (ctx) => {
    const access = await recruitAccess(ctx);
    if (!access) return null;
    const jobs = (await ctx.db.query("recruitJobs").collect()).filter((j) => mayRecruitFor(access, j.sourceId));
    const out = [];
    for (const job of jobs) {
      const rows = await ctx.db
        .query("echoMeetings")
        .withIndex("by_recruit_job", (q) => q.eq("recruitJobSourceId", job.sourceId))
        .order("desc")
        // ponytail: the latest 50 per position, whole rows read. Page it if a role piles up interviews.
        .take(50);
      for (const m of rows) {
        out.push({
          _id: m._id,
          title: m.title,
          startedAt: m.startedAt,
          durationMs: m.durationMs,
          firstLine: m.summary[0] ?? "",
          actionItems: m.actionItems.length,
          people: [...m.attendees.map((a) => a.name), ...m.seenNames],
          jobName: job.name,
          recordedBy: (await ctx.db.get(m.ownerId))?.name ?? "A teammate",
        });
      }
    }
    return out.sort((a, b) => b.startedAt - a.startedAt);
  },
});

/** The recorder takes a teammate off a meeting that was shared with them. */
export const removeViewer = mutation({
  args: { meetingId: v.id("echoMeetings"), userId: v.id("users") },
  handler: async (ctx, { meetingId, userId }) => {
    const me = await requireEchoUser(ctx);
    const meeting = await ctx.db.get(meetingId);
    if (!meeting || meeting.ownerId !== me._id) throw new Error("Only the person who recorded it can do that");
    const rows = await ctx.db
      .query("echoMeetingViewers")
      .withIndex("by_meeting_user", (q) => q.eq("meetingId", meetingId).eq("userId", userId))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
  },
});

/** Brands a meeting can be filed under. */
export const brandOptions = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireEchoUser(ctx);
    if (me.isReviewer === true) return [];
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
    const me = await requireEchoUser(ctx);
    if (me.isReviewer === true) throw new Error("Not authorized");
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
    const me = await requireEchoUser(ctx);
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
    const me = await requireEchoUser(ctx);
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

/**
 * The signed-in person's timed meetings between two moments (the dashboard
 * passes the bounds of their own day), from the Google Calendar they connected.
 * Declined and cancelled events are left out. Read-only, nothing is stored.
 */
export const meetingsBetween = action({
  args: { from: v.number(), to: v.number() },
  handler: async (
    ctx,
    { from, to }
  ): Promise<{
    connected: boolean;
    /** Google no longer accepts the stored access: disconnect and connect again on the profile. */
    reconnect?: boolean;
    events: { id: string; title: string; start: number; end: number; joinUrl: string | null; people: number }[];
  }> => {
    const secret = process.env.ECHO_LINK_SECRET;
    const me = await ctx.runQuery(api.users.getCurrentUser, {});
    if (!me || me.role === "client") throw new Error("Not authorized");
    if (!(to > from) || to - from > 3 * 86_400_000) throw new Error("Bad range");
    const sealed = await ctx.runQuery(internal.echo.calendarToken, { ownerId: me._id });
    if (!secret || !sealed) return { connected: false, events: [] };
    const got = await calendarEvents<CalendarEvent>(
      await unseal(sealed, secret),
      { timeMin: from, timeMax: to },
      // eventTypes=default: real events only, not focus time, out of office or working location.
      { orderBy: "startTime", maxResults: "50", eventTypes: "default" }
    );
    // Google no longer accepts the stored access: the profile page can connect again.
    if (got.status === "reconnect") return { connected: false, reconnect: true, events: [] };
    // Anything passing is an error, so the panel says "try again" instead of "connect".
    if (got.status === "failed") throw new Error("Google Calendar did not answer. Try again in a moment.");
    const { items } = got;
    return {
      connected: true,
      events: items
        .filter(
          (e) =>
            e.status !== "cancelled" &&
            !!e.start?.dateTime && // all-day entries are not meetings to join
            !!e.end?.dateTime &&
            e.attendees?.find((a) => a.self)?.responseStatus !== "declined"
        )
        .map((e, i) => ({
          id: e.id ?? String(i),
          title: e.summary?.trim() || "Untitled meeting",
          start: Date.parse(e.start!.dateTime!),
          end: Date.parse(e.end!.dateTime!),
          joinUrl: joinLinkOf(e),
          people: e.attendees?.length ?? 0,
        })),
    };
  },
});

// SITE_URL is where Google's answer is sent on to (the profile page); without it the row stays hidden.
const googleReady = () =>
  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET && !!process.env.SITE_URL;
const GOOGLE_REDIRECT = () => `${process.env.CONVEX_SITE_URL}/echo/google/callback`;

export const calendarStatus = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireEchoUser(ctx);
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
    // Signing in is not the same as granting the calendar: Google shows that as its own tick box.
    if (!(tokens.scope ?? "").split(" ").includes("https://www.googleapis.com/auth/calendar.events.readonly")) {
      throw new Error(
        "Google signed you in, but the calendar box was not ticked. Connect again and tick the box that lets Echo see your calendar events."
      );
    }
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
    const me = await requireEchoUser(ctx);
    const rows = await ctx.db
      .query("echoCalendars")
      .withIndex("by_user", (q) => q.eq("userId", me._id))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
  },
});
