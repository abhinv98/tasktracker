// Pure and dependency-free, so Echo's own tests can check they accept what this signs.
const base64url = (bytes: Uint8Array) => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** Echo's server checks the signature and refuses a key past `exp` (ms since epoch). */
export async function signEchoKey(
  who: { id: string; email: string; name: string; exp: number },
  secret: string
): Promise<string> {
  const enc = new TextEncoder();
  const payload = base64url(enc.encode(JSON.stringify(who)));
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`ek1.${payload}`));
  return `ek1.${payload}.${base64url(new Uint8Array(sig))}`;
}
