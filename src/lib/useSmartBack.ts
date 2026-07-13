"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

const NAV_DEPTH_KEY = "tt:navDepth";

/**
 * Back buttons should return the user to where they actually came from, not to
 * a fixed landing page that discards their filters and scroll position. But
 * router.back() is only safe when there IS an in-app page behind us — on a cold
 * deep link it would eject the user out of the app entirely.
 *
 * The layout tracks how many in-app pages sit behind the current one via
 * useNavDepthTracker: forward navigations increment the count, history
 * traversals (back/forward, detected via popstate) decrement it, and a full
 * page load resets it. A depth above zero means browser history holds one of
 * our own pages.
 */
export function readNavDepth(): number {
  try {
    return Number(sessionStorage.getItem(NAV_DEPTH_KEY) ?? "0");
  } catch {
    return 0;
  }
}

function writeNavDepth(depth: number) {
  try {
    sessionStorage.setItem(NAV_DEPTH_KEY, String(Math.max(0, depth)));
  } catch {
    /* sessionStorage unavailable (private mode) — back falls back to the href */
  }
}

/**
 * Mount once in the dashboard layout with the current pathname. Counts in-app
 * route changes so useSmartBack knows whether history holds one of our pages.
 */
export function useNavDepthTracker(pathname: string) {
  const isFirstRoute = useRef(true);
  // Set by popstate (which fires on back/forward BEFORE React re-renders), so
  // the pathname effect below can tell a traversal from a forward navigation.
  const traversed = useRef(false);

  useEffect(() => {
    const onPop = () => {
      traversed.current = true;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (isFirstRoute.current) {
      // Full page load: whatever history exists belongs to before the app.
      isFirstRoute.current = false;
      writeNavDepth(0);
      return;
    }
    if (traversed.current) {
      // Back (or forward) consumed a history entry rather than adding one.
      traversed.current = false;
      writeNavDepth(readNavDepth() - 1);
      return;
    }
    writeNavDepth(readNavDepth() + 1);
  }, [pathname]);
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
