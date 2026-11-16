"use client";

import { useEffect, useState } from "react";
import { isOlderVersion } from "./echo";

/** What the Echo extension's content script (link.js) reports on a tracker page. */
export type EchoExtension = {
  /** False until the extension has answered or enough time has passed to say it is not there. */
  ready: boolean;
  installed: boolean;
  version: string | null;
  /** The account this browser's Echo is linked to, if any. */
  linkedEmail: string | null;
  /** The newest version on offer (public/echo/version.json), once known. */
  latest: string | null;
  updateAvailable: boolean;
};

/**
 * Whether Echo is in this browser, which account it is linked to, and whether
 * a newer version is out. The page and the extension talk through
 * window.postMessage, so nothing depends on the extension's id.
 */
export function useEchoExtension(): EchoExtension {
  const [hello, setHello] = useState<{ version: string; linkedEmail: string | null } | null>(null);
  const [waited, setWaited] = useState(false);
  const [latest, setLatest] = useState<string | null>(null);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== window.location.origin) return;
      if (e.data?.source !== "echo-extension" || e.data.type !== "hello") return;
      setHello({ version: String(e.data.version), linkedEmail: e.data.linkedEmail ?? null });
    };
    window.addEventListener("message", onMessage);
    window.postMessage({ source: "tasktracker", type: "ping" }, window.location.origin);
    // The extension's script is added once the page has finished loading and then answers within
    // milliseconds. Only after that, plus a margin, is it fair to say Echo is not there.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startWaiting = () => {
      window.postMessage({ source: "tasktracker", type: "ping" }, window.location.origin);
      timer = setTimeout(() => setWaited(true), 2500);
    };
    if (document.readyState === "complete") startWaiting();
    else window.addEventListener("load", startWaiting, { once: true });
    fetch("/echo/version.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => typeof j?.version === "string" && setLatest(j.version))
      .catch(() => {});
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("load", startWaiting);
      clearTimeout(timer);
    };
  }, []);

  return {
    ready: !!hello || waited,
    installed: !!hello,
    version: hello?.version ?? null,
    linkedEmail: hello?.linkedEmail ?? null,
    latest,
    updateAvailable: !!hello && !!latest && isOlderVersion(hello.version, latest),
  };
}
