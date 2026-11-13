import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { sameText, unseal } from "./lib/echoKey";
import { googleToken } from "./lib/google";

const http = httpRouter();

auth.addHttpRoutes(http);

// ─── Echo (the meeting note-taker) ────────────────────────────────────────────
// Its server calls these with no user session: they are authenticated by the
// secret the two servers share.

const fromEcho = (request: Request) =>
  !!process.env.ECHO_LINK_SECRET &&
  sameText(`Bearer ${process.env.ECHO_LINK_SECRET}`, request.headers.get("Authorization") ?? "");

// Finished notes for one meeting.
http.route({
  path: "/echo/meeting",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!fromEcho(request)) return new Response("unauthorized", { status: 401 });
    try {
      await ctx.runMutation(internal.echo.ingest, await request.json());
    } catch (e) {
      return new Response((e as Error).message.slice(0, 300), { status: 400 });
    }
    return new Response("ok");
  }),
});

// Google sends the person back here after they allow (or refuse) calendar access.
// Nothing is trusted or exchanged here: this request carries no session, so the
// code goes on to the profile page, where the signed-in person finishes it
// (echo.finishGoogleConnect). That way a consent link passed to someone else
// cannot attach their calendar to the account that made the link.
http.route({
  path: "/echo/google/callback",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const params = code && state ? new URLSearchParams({ gcal_code: code, gcal_state: state }) : "calendar=failed";
    return Response.redirect(`${process.env.SITE_URL}/profile?${params}`, 302);
  }),
});

type GoogleEvent = {
  summary?: string;
  attendees?: {
    email?: string;
    displayName?: string;
    self?: boolean;
    organizer?: boolean;
    responseStatus?: string;
  }[];
};

// Echo asks who was invited to a meeting, on the calendar of the person who
// recorded it. Answers in the shape Echo's calendar code already reads.
http.route({
  path: "/echo/calendar",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!fromEcho(request)) return new Response("unauthorized", { status: 401 });
    const { ownerId, code } = (await request.json().catch(() => ({}))) as {
      ownerId?: unknown;
      code?: unknown;
    };
    const none = Response.json({ ok: true, found: false });
    if (typeof ownerId !== "string" || typeof code !== "string" || !/^[a-z0-9-]{6,20}$/.test(code)) {
      return new Response("bad request", { status: 400 });
    }
    const sealed = await ctx.runQuery(internal.echo.calendarToken, { ownerId });
    if (!sealed) return none;
    const { access_token } = await googleToken({
      refresh_token: await unseal(sealed, process.env.ECHO_LINK_SECRET!),
      grant_type: "refresh_token",
    });
    if (!access_token) return none; // access was withdrawn at Google; the person can connect again
    const day = 86_400_000;
    const params = new URLSearchParams({
      timeMin: new Date(Date.now() - day).toISOString(),
      timeMax: new Date(Date.now() + day).toISOString(),
      singleEvents: "true",
      maxResults: "250",
    });
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );
    if (!res.ok) return none;
    const { items = [] } = (await res.json()) as { items?: GoogleEvent[] };
    // The meeting link sits in hangoutLink, conferenceData, location or the description.
    const event = items.find((e) => JSON.stringify(e).includes(code));
    if (!event) return none;
    return Response.json({
      ok: true,
      found: true,
      title: event.summary,
      attendees: (event.attendees ?? []).map((a) => ({
        email: a.email,
        name: a.displayName,
        self: a.self,
        organizer: a.organizer,
        response: a.responseStatus,
      })),
    });
  }),
});

export default http;
