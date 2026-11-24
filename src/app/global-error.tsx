"use client";

import { useEffect } from "react";

/** The page's own code could not be fetched: a deploy replaced it, or is replacing it right now. */
const isStale = (error: Error) =>
  error.name === "ChunkLoadError" || /load(ing)? chunk|dynamically imported module|importing a module script/i.test(error.message);

/**
 * The last resort, when nothing else caught an error. After a deploy it reloads
 * by itself as soon as the server answers; for anything else it offers to.
 */
export default function GlobalError({ error }: { error: Error }) {
  const stale = isStale(error);
  useEffect(() => {
    if (!stale) return;
    // Once a minute at most, so a page that is really broken does not loop.
    const last = Number(sessionStorage.getItem("reloadedAt") ?? 0);
    if (Date.now() - last < 60_000) return;
    const timer = setInterval(async () => {
      const ok = await fetch("/sign-in", { cache: "no-store" }).then((r) => r.ok, () => false);
      if (!ok) return;
      clearInterval(timer);
      sessionStorage.setItem("reloadedAt", String(Date.now()));
      window.location.reload();
    }, 3000);
    return () => clearInterval(timer);
  }, [stale]);

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#f6f6f5", color: "#171717", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
        <div style={{ textAlign: "center", padding: 24, maxWidth: 420 }}>
          <h1 style={{ fontSize: 18, margin: "0 0 8px" }}>{stale ? "A new version is going live" : "Something went wrong"}</h1>
          <p style={{ fontSize: 14, margin: "0 0 18px", color: "#4e4e4b" }}>
            {stale ? "This page reloads by itself in a moment." : "Reload the page. If it keeps happening, tell the team what you were doing."}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ height: 34, padding: "0 16px", border: 0, borderRadius: 8, background: "#171717", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
