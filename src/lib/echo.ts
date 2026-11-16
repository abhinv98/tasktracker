// Small pure helpers for Echo, shared by the dashboard and the backend.
// Check: node scripts/echoHelpers.check.ts

/** The parts of a Google Calendar event the dashboard's "Today's meetings" reads. */
export type CalendarEvent = {
  id?: string;
  status?: string;
  summary?: string;
  hangoutLink?: string;
  location?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  attendees?: { self?: boolean; responseStatus?: string }[];
};

/** The link to join an event's call, if it has one we recognise. Only ever https. */
export function joinLinkOf(e: CalendarEvent): string | null {
  const candidates = [
    e.hangoutLink,
    e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri,
    // People also paste the link into the location. The host must BE one of these or a subdomain of
    // zoom.us ("evilzoom.us" is not), and punctuation after the link is not part of it.
    e.location
      ?.match(/https:\/\/(?:meet\.google\.com|(?:[\w-]+\.)*zoom\.us|teams\.microsoft\.com|teams\.live\.com)\/[^\s<>"]+/)?.[0]
      .replace(/[.,;:!?)\]]+$/, ""),
  ];
  return candidates.find((u): u is string => typeof u === "string" && u.startsWith("https://")) ?? null;
}

/** True when version `have` (as "1.2.3") is older than `latest`. Anything unreadable is not "older":
 *  a wrong "please update" is worse than a missing one. */
export function isOlderVersion(have: string, latest: string): boolean {
  const parse = (v: string) => (/^\d+(\.\d+)*$/.test(v) ? v.split(".").map(Number) : null);
  const a = parse(have);
  const b = parse(latest);
  if (!a || !b) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d < 0;
  }
  return false;
}
