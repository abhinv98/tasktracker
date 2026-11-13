import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

// Echo (the meeting note-taker) posts finished notes here. There is no user
// session on this call: it is authenticated by the secret the two servers share.
http.route({
  path: "/echo/meeting",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const want = `Bearer ${process.env.ECHO_LINK_SECRET ?? ""}`;
    const got = request.headers.get("Authorization") ?? "";
    // Compared in full, so the time taken says nothing about where they differ.
    let diff = want.length ^ got.length;
    for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
    if (!process.env.ECHO_LINK_SECRET || diff !== 0) {
      return new Response("unauthorized", { status: 401 });
    }
    try {
      await ctx.runMutation(internal.echo.ingest, await request.json());
    } catch (e) {
      return new Response((e as Error).message.slice(0, 300), { status: 400 });
    }
    return new Response("ok");
  }),
});

export default http;
