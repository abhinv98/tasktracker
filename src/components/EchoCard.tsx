"use client";

import { useAction } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Button, Card, useToast } from "@/components/ui";

/** What the Echo extension's content script (link.js) reports on this page. */
type EchoHello = { version: string; linkedEmail: string | null };

/**
 * Profile card for Echo, the meeting note-taker: add the extension to this
 * browser and link it to the signed-in account. The page and the extension talk
 * through window.postMessage, so nothing depends on the extension's id.
 */
export function EchoCard({ email }: { email?: string }) {
  const createLinkKey = useAction(api.echo.createLinkKey);
  const { toast } = useToast();
  const [echo, setEcho] = useState<EchoHello | null>(null);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== window.location.origin) return;
      if (e.data?.source !== "echo-extension" || e.data.type !== "hello") return;
      setEcho({ version: String(e.data.version), linkedEmail: e.data.linkedEmail ?? null });
    };
    window.addEventListener("message", onMessage);
    window.postMessage({ source: "tasktracker", type: "ping" }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const linked = !!echo?.linkedEmail && echo.linkedEmail === email;

  const link = async () => {
    try {
      const { key, name, email: keyEmail } = await createLinkKey({});
      window.postMessage(
        { source: "tasktracker", type: "link", key, name, email: keyEmail },
        window.location.origin
      );
      toast("success", "Echo is linked to your account in this browser");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Could not link Echo");
    }
  };

  return (
    <Card className="mt-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-[15px] text-[var(--text-primary)]">
            Echo meeting notes
          </h2>
          <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">
            {linked
              ? "Linked in this browser. Echo records your Google Meet calls by itself and the notes arrive under Meetings."
              : echo
                ? "Echo is in this browser. Link it so your meetings are saved to your account."
                : "Echo records your Google Meet calls by itself and writes the notes and action items."}
          </p>
        </div>
        {echo ? (
          <Button variant={linked ? "secondary" : "primary"} onClick={link}>
            {linked ? "Link again" : "Link this browser"}
          </Button>
        ) : (
          <a
            href="/echo/echo-extension.zip"
            download
            onClick={() => setShowSteps(true)}
            className="inline-flex shrink-0 items-center rounded-md h-8 px-3 text-[13px] font-medium bg-[var(--text-primary)] text-white"
          >
            Add Echo to your browser
          </a>
        )}
      </div>

      {echo && !linked && echo.linkedEmail && (
        <p className="text-[13px] text-[var(--warning)] mt-3">
          This browser is linked to {echo.linkedEmail}. Linking moves it to your account.
        </p>
      )}

      {!echo && (
        <div className="mt-3">
          {!showSteps ? (
            <button
              type="button"
              onClick={() => setShowSteps(true)}
              className="text-[13px] text-[var(--accent-admin-text)] underline"
            >
              How to add it
            </button>
          ) : (
            <ol className="list-decimal pl-5 text-[13px] text-[var(--text-secondary)] flex flex-col gap-1">
              <li>Unzip the file that was just downloaded.</li>
              <li>
                Open <span className="font-mono">chrome://extensions</span> in Chrome (Edge, Brave and
                Opera work the same way) and turn on Developer mode.
              </li>
              <li>Press Load unpacked and pick the unzipped folder.</li>
              <li>Reload this page and press Link this browser.</li>
            </ol>
          )}
        </div>
      )}
    </Card>
  );
}
