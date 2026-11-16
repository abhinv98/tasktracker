// Self-check for the pure Echo helpers (src/lib/echo.ts):
//   node scripts/echoHelpers.check.ts
import assert from "node:assert/strict";
import { isOlderVersion, joinLinkOf } from "../src/lib/echo.ts";

// "Please update" only when the installed extension really is behind.
assert.equal(isOlderVersion("0.2.1", "0.3.0"), true);
assert.equal(isOlderVersion("0.3.0", "0.3.0"), false);
assert.equal(isOlderVersion("0.10.0", "0.9.9"), false); // numbers, not text: 10 is newer than 9
assert.equal(isOlderVersion("0.3", "0.3.1"), true);
assert.equal(isOlderVersion("1.0.0", "0.9.0"), false);
assert.equal(isOlderVersion("", "0.3.0"), false); // unreadable: say nothing
assert.equal(isOlderVersion("0.2.1", "latest"), false);

// The Join button: Meet's own link first, then a video entry point, then a link typed into the location.
assert.equal(joinLinkOf({ hangoutLink: "https://meet.google.com/abc-defg-hij" }), "https://meet.google.com/abc-defg-hij");
assert.equal(
  joinLinkOf({ conferenceData: { entryPoints: [{ entryPointType: "phone", uri: "tel:+91" }, { entryPointType: "video", uri: "https://us02web.zoom.us/j/123456789" }] } }),
  "https://us02web.zoom.us/j/123456789"
);
assert.equal(joinLinkOf({ location: "Board room / https://teams.microsoft.com/l/meetup-join/abc" }), "https://teams.microsoft.com/l/meetup-join/abc");
// A look-alike host is not Zoom, and punctuation after a pasted link is not part of it.
assert.equal(joinLinkOf({ location: "https://evilzoom.us/j/123456789" }), null);
assert.equal(joinLinkOf({ location: "Zoom: https://zoom.us/j/123456789, passcode 4411" }), "https://zoom.us/j/123456789");
assert.equal(joinLinkOf({ location: "(https://meet.google.com/abc-defg-hij)" }), "https://meet.google.com/abc-defg-hij");
// Never a link that is not https, and nothing for an event without a call.
assert.equal(joinLinkOf({ hangoutLink: "javascript:alert(1)" }), null);
assert.equal(joinLinkOf({ location: "Cafe, Bandra" }), null);
assert.equal(joinLinkOf({}), null);

console.log("echoHelpers: ok");
