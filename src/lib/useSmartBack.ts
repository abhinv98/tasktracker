"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

const NAV_DEPTH_KEY = "tt:navDepth";

/**
 * Back buttons should return the user to where they actually came from, not to
 * a fixed landing page that discards their filters and scroll position. But
 * router.back() is only safe when there IS an in-app page behind us — on a cold
 * deep link it would eject the user out of the app entirely.
 *
 * The layout counts client-side route changes for the current tab session;
 * a depth above zero means at least one in-app navigation happened, so browser
 * history holds one of our own pages.
 */
export function readNavDepth(): number {
  try {
    return Number(sessionStorage.getItem(NAV_DEPTH_KEY) ?? "0");
  } catch {
    return 0;
  }
}

export function resetNavDepth() {
  try {
    sessionStorage.setItem(NAV_DEPTH_KEY, "0");
  } catch {
    /* sessionStorage unavailable (private mode) — back falls back to the href */
  }
}

export function bumpNavDepth() {
  try {
    sessionStorage.setItem(NAV_DEPTH_KEY, String(readNavDepth() + 1));
  } catch {
    /* ignore */
  }
}

/**
 * Returns a handler that goes back through history when possible and otherwise
 * navigates to `fallbackHref` (the old hardcoded destination).
 */
export function useSmartBack(fallbackHref: string) {
  const router = useRouter();

  // Read the depth at click time, not render time: the handler only ever runs
  // in the browser, so there is no SSR/hydration concern and no state to sync.
  return useCallback(() => {
    if (readNavDepth() > 0) router.back();
    else router.push(fallbackHref);
  }, [fallbackHref, router]);
}
