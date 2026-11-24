// The team tree, and which position a hiring round is for. Run: npx tsx scripts/recruitTeams.check.ts
import assert from "node:assert";
import { byTeam, guessPosition } from "../src/lib/recruitTeams";

const teams = [{ _id: "d", name: "Design Team", color: "" }, { _id: "c", name: "Copy Team", color: "" }, { _id: "t", name: "Tech Team", color: "" }];
const P = [{ name: "Visualiser", teams: ["d"] }, { name: "Creative", teams: ["d", "c"] }, { name: "Writer", teams: ["c"] }, { name: "Sales", teams: [] }, { name: "Old", teams: ["deleted"] }];
assert.deepEqual(
  byTeam(P, teams, (p) => p.teams).map((g) => [g.team?.name ?? null, g.positions.map((p) => p.name)]),
  [["Design Team", ["Visualiser", "Creative"]], ["Copy Team", ["Creative", "Writer"]], [null, ["Sales", "Old"]]]
);
assert.deepEqual(byTeam([P[0]], teams, (p) => p.teams).length, 1, "no empty groups");

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
