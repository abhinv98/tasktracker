"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { useEchoExtension } from "@/lib/useEchoExtension";
import { api } from "@/convex/_generated/api";
import { Button, Card, useToast } from "@/components/ui";

// Echo's Chrome Web Store page. Empty until the listing is published; until then
// the card hands out the zip to load by hand.
const STORE_URL = "";

/**
 * Profile card for Echo, the meeting note-taker: add the extension to this
 * browser and link it to the signed-in account. The page and the extension talk
 * through window.postMessage, so nothing depends on the extension's id.
 */
export function EchoCard({ email }: { email?: string }) {
  const createLinkKey = useAction(api.echo.createLinkKey);
  const { toast } = useToast();
  const ext = useEchoExtension();
  const echo = ext.installed ? { version: ext.version ?? "", linkedEmail: ext.linkedEmail } : null;
  const [showSteps, setShowSteps] = useState(false);
  const calendar = useQuery(api.echo.calendarStatus, {});
  const googleAuthUrl = useAction(api.echo.googleAuthUrl);
  const disconnectCalendar = useMutation(api.echo.disconnectCalendar);

  const finishGoogleConnect = useAction(api.echo.finishGoogleConnect);

  // Back from Google: finish the connection as the signed-in person, then tidy the address.
  // The code works once, so this must not run twice (React re-runs effects in development).
  const finishing = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("gcal_code");
    const state = params.get("gcal_state");
    if (finishing.current || (!params.get("calendar") && !(code && state))) return;
    finishing.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    if (!(code && state)) return toast("error", "Google Calendar was not connected. Try again.");
    finishGoogleConnect({ code, state }).then(
      (account) => toast("success", `Google Calendar connected as ${account}`),
      (e) => toast("error", e instanceof Error ? e.message : "Google Calendar was not connected")
    );
  }, [toast, finishGoogleConnect]);

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
    <Card>
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
        {!ext.ready ? null : echo ? (
          <Button variant={linked ? "secondary" : "primary"} onClick={link}>
            {linked ? "Link again" : "Link this browser"}
          </Button>
        ) : (
          <a
            href={STORE_URL || "/echo/echo-extension.zip"}
            {...(STORE_URL ? { target: "_blank", rel: "noreferrer" } : { download: true })}
            onClick={() => setShowSteps(true)}
            className="inline-flex shrink-0 items-center rounded-control h-control px-3 text-[13px] font-medium bg-[var(--text-primary)] text-white hover:opacity-90 transition-opacity"
          >
            Add Echo to your browser
          </a>
        )}
      </div>

      {ext.updateAvailable && (
        <div className="mt-3 rounded-md bg-[var(--warning-dim)] px-3 py-2.5">
          <p className="text-[13px] font-medium text-[var(--warning)]">
            A newer Echo is out (version {ext.latest}). This browser has {ext.version}.
          </p>
          <ol className="mt-1.5 list-decimal pl-5 text-[13px] text-[var(--text-secondary)] flex flex-col gap-1">
            <li>
              <a
                href={STORE_URL || "/echo/echo-extension.zip"}
                {...(STORE_URL ? { target: "_blank", rel: "noreferrer" } : { download: true })}
                className="font-medium text-[var(--accent-admin-text)] hover:underline underline-offset-2"
              >
                Download the new version
              </a>{" "}
              and unzip it over the folder you loaded Echo from, replacing the old files.
            </li>
            <li>
              Open <span className="font-mono">chrome://extensions</span> and press the reload arrow on Echo.
            </li>
            <li>Reload this page. Your link to this account is kept.</li>
          </ol>
        </div>
      )}

      {echo && !linked && echo.linkedEmail && (
        <p className="text-[13px] text-[var(--warning)] mt-3">
          This browser is linked to {echo.linkedEmail}. Linking moves it to your account.
        </p>
      )}

      {ext.ready && !echo && STORE_URL && showSteps && (
        <p className="text-[13px] text-[var(--text-secondary)] mt-3">
          Press Add to Chrome on the page that opened, then come back here and reload.
        </p>
      )}

      {ext.ready && !echo && !STORE_URL && (
        <div className="mt-3">
          {!showSteps ? (
            <button
              type="button"
              onClick={() => setShowSteps(true)}
              className="text-[13px] text-[var(--accent-admin-text)] hover:underline underline-offset-2"
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

      {calendar?.available && (
        <div className="mt-4 pt-4 border-t border-[var(--border-subtle)] flex items-start justify-between gap-4">
          <div>
            <h3 className="font-medium text-[14px] text-[var(--text-primary)]">Google Calendar</h3>
            <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">
              {calendar.email
                ? `Connected as ${calendar.email}. Echo only reads your invites, to fill in who was in each meeting.`
                : "Connect it so Echo knows who was invited to each meeting, with their emails. Read-only."}
            </p>
          </div>
          {calendar.email ? (
            <Button variant="secondary" onClick={() => disconnectCalendar({})}>
              Disconnect
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  window.location.href = await googleAuthUrl({});
                } catch (e) {
                  toast("error", e instanceof Error ? e.message : "Could not start the connection");
                }
              }}
            >
              Connect Google Calendar
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
