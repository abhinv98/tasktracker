// Self-check for the text a toast shows (plainMessage in src/components/ui/Toast.tsx).
// The function is copied by regex-free import: Toast.tsx is a React file, so this
// re-states the three cases against the same source via a tiny loader.
//   node scripts/toastMessage.check.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/components/ui/Toast.tsx", import.meta.url), "utf8");
const body = src.slice(src.indexOf("export function plainMessage"), src.indexOf("export function ToastProvider"));
const plainMessage = new Function(
  `${body.replace("export function plainMessage(message: string): string", "function plainMessage(message)")}; return plainMessage;`
)() as (m: string) => string;

// What Convex sends when a mutation throws: only the server's own sentence survives.
assert.equal(
  plainMessage('[CONVEX M(approvals:passToManager)] [Request ID: 9f2c] Server Error\nUncaught Error: You cannot review your own deliverable\n    at handler (../convex/approvals.ts:412:11)'),
  "You cannot review your own deliverable"
);
// A redacted server error has nothing to show, so say something plain.
assert.equal(plainMessage("[CONVEX M(tasks:deleteTask)] [Request ID: 1a] Server Error"), "Something went wrong. Please try again.");
assert.equal(plainMessage(""), "Something went wrong. Please try again.");
// Messages written by the app pass through untouched.
assert.equal(plainMessage("Entry deleted"), "Entry deleted");
assert.equal(plainMessage("The upload was refused"), "The upload was refused");

console.log("toastMessage: ok");
