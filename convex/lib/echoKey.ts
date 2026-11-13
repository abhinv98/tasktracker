// Pure and dependency-free, so Echo's own tests can check they accept what this signs.
const enc = new TextEncoder();

const base64url = (bytes: Uint8Array) => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

/** Compared in full, so the time taken says nothing about where two strings differ. */
export function sameText(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** HMAC-SHA256 of `text`, base64url: the one signature Echo and the task tracker share. */
export async function hmac(text: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(text))));
}

/** Echo's server checks the signature and refuses a key past `exp` (ms since epoch). */
export async function signEchoKey(
  who: { id: string; email: string; name: string; exp: number },
  secret: string
): Promise<string> {
  const payload = base64url(enc.encode(JSON.stringify(who)));
  return `ek1.${payload}.${await hmac(`ek1.${payload}`, secret)}`;
}

const sealKey = async (secret: string) =>
  crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest("SHA-256", enc.encode(`${secret}:calendar`)),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"]
  );

/** AES-GCM, so a Google refresh token is never readable in the database. */
export async function seal(text: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const box = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await sealKey(secret), enc.encode(text));
  return `${base64url(iv)}.${base64url(new Uint8Array(box))}`;
}

export async function unseal(sealed: string, secret: string): Promise<string> {
  const [iv, box] = sealed.split(".");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64url(iv) },
    await sealKey(secret),
    fromBase64url(box)
  );
  return new TextDecoder().decode(plain);
}
