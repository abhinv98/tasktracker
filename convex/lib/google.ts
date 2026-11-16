/** Google's OAuth token endpoint, for both the first exchange and every refresh. */
export async function googleToken(params: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      ...params,
    }),
  });
  return (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
    error?: string;
  };
}

/**
 * Events on a person's primary calendar between two moments, using their
 * stored (already unsealed) refresh token. Three outcomes, because callers
 * must tell them apart: the events; `reconnect` when Google no longer accepts
 * the token (access withdrawn there); `failed` for anything passing.
 */
export async function calendarEvents<E>(
  refreshToken: string,
  range: { timeMin: number; timeMax: number },
  extra: Record<string, string> = {}
): Promise<{ status: "ok"; items: E[] } | { status: "reconnect" } | { status: "failed" }> {
  const token = await googleToken({ refresh_token: refreshToken, grant_type: "refresh_token" }).catch(() => null);
  if (!token) return { status: "failed" };
  if (!token.access_token) return { status: token.error === "invalid_grant" ? "reconnect" : "failed" };
  const params = new URLSearchParams({
    timeMin: new Date(range.timeMin).toISOString(),
    timeMax: new Date(range.timeMax).toISOString(),
    singleEvents: "true",
    ...extra,
  });
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  }).catch(() => null);
  if (!res?.ok) return { status: "failed" };
  const { items = [] } = (await res.json()) as { items?: E[] };
  return { status: "ok", items };
}
