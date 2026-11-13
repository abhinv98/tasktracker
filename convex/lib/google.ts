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
