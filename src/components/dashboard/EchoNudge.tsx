"use client";

import Link from "next/link";
import { useState } from "react";
import { X } from "lucide-react";
import { useEchoExtension } from "@/lib/useEchoExtension";
import { iconButtonClass } from "@/components/ui/classes";

const WEEK = 7 * 86_400_000;

/**
 * One quiet line on the dashboard when Echo needs something from this person:
 * add it to the browser, link it to their account, or update it. Says nothing
 * once all three are fine. Hiding it lasts a week (an update notice stays
 * hidden until the next version).
 */
export function EchoNudge({ email }: { email?: string }) {
  const ext = useEchoExtension();
  const [hiddenNow, setHiddenNow] = useState(false);
  const [openedAt] = useState(() => Date.now());

  // Not before the account is known: "linked to someone else" must not flash while it loads.
  if (!ext.ready || hiddenNow || !email) return null;
  // Echo is a Chrome extension: do not ask for it on a phone or in a browser that cannot have it.
  const canHaveEcho = "chrome" in window && !/Mobi|Android/i.test(navigator.userAgent);
  const kind = !ext.installed
    ? canHaveEcho
      ? "install"
      : null
    : ext.linkedEmail?.toLowerCase() !== email.toLowerCase()
      ? "link"
      : ext.updateAvailable
        ? "update"
        : null;
  if (!kind) return null;

  const key = `echoNudge:${kind}${kind === "update" ? `:${ext.latest}` : ""}`;
  try {
    const hiddenAt = Number(localStorage.getItem(key));
    if (hiddenAt && (kind === "update" || openedAt - hiddenAt < WEEK)) return null;
  } catch {
    // No storage (private window): just show it.
  }

  const text = {
    install: "Echo is not in this browser yet. Add it once and your Google Meet calls write their own notes.",
    link: "Echo is in this browser but not linked to your account, so your meetings are not being saved.",
    update: `A newer Echo is out (version ${ext.latest}). Please update it to keep your meeting notes working.`,
  }[kind];
  const action = { install: "Set up Echo", link: "Link it", update: "How to update" }[kind];

  return (
    <div
      role="status"
      className={`mb-4 flex items-center gap-3 rounded-lg px-4 py-2 ${
        kind === "install" ? "border border-[var(--border)] bg-white" : "bg-[var(--warning-dim)]"
      }`}
    >
      <p className={`flex-1 min-w-0 text-[13px] ${kind === "install" ? "text-[var(--text-secondary)]" : "font-medium text-[var(--warning)]"}`}>
        {text}{" "}
        <Link href="/profile" className="font-medium text-[var(--accent-admin-text)] hover:underline underline-offset-2 whitespace-nowrap">
          {action} →
        </Link>
      </p>
      <button
        type="button"
        aria-label={kind === "update" ? "Hide until the next version" : "Hide for a week"}
        title={kind === "update" ? "Hide until the next version" : "Hide for a week"}
        onClick={() => {
          try {
            localStorage.setItem(key, String(Date.now()));
          } catch {}
          setHiddenNow(true);
        }}
        className={iconButtonClass}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
