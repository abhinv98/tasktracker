// Which position a hiring round is for. Run: npx tsx scripts/recruitTeams.check.ts
import assert from "node:assert";
import { guessPosition } from "../src/lib/recruitTeams";

// The real rounds against the real positions. Anything unclear is left for HR to pick.
const positions = [
  "Account Manager", "Video Editors", "Copywriter", "HR", "Creative team", "visual designer", "Full Stack Developer", "Content Writing Intern", "Content Creator Intern",
  "Executive Brand Solutions Sr", "Executive Brand Solutions Jr", "Social Media Intern", "Accountant", "Social Media Executive", "Jr. AI Video Editor", "AI Visualiser", "Business Development Executive",
].map((name) => ({ name }));
for (const [role, want] of [
  ["Accountant", "Accountant"], ["Jr - AI Editor", "Jr. AI Video Editor"], ["Social Media Executive - Intern", "Social Media Intern"], ["Social Media Executive", "Social Media Executive"],
  ["BDE", "Business Development Executive"], ["Copywriter (Jr, Sr)", "Copywriter"], ["Visual Designer", "visual designer"], ["Editors", "Video Editors"], ["Account Manager", "Account Manager"],
  ["AI Designer", undefined], ["Al Tech", undefined], ["Stratergist & Copywriter - Intern", undefined], ["", undefined], ["—", undefined],
] as const) assert.equal(guessPosition(role, positions)?.name, want, role);
console.log("recruitTeams: ok");
