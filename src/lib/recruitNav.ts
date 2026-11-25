// Recruitment's places. The sidebar shows one line per section; a section with
// several screens shows them as tabs across the top (recruitment/layout.tsx).
// `fullOnly` is HR and super admins; the backend checks the same.

type Tab = { label: string; href: string; fullOnly?: boolean };
export type Section = Tab & { tabs?: Tab[]; also?: RegExp };

export const RECRUIT_SECTIONS: Section[] = [
  { label: "Overview", href: "/recruitment/overview", fullOnly: true, also: /^\/recruitment(\/today)?$/ },
  {
    label: "Positions",
    href: "/recruitment/applicants",
    tabs: [
      { label: "By position", href: "/recruitment/applicants" },
      { label: "All applicants", href: "/recruitment/candidates", fullOnly: true },
      { label: "Setup", href: "/recruitment/setup", fullOnly: true },
    ],
    also: /^\/recruitment\/\d+$/,
  },
  {
    // Hiring rounds and the candidates in them, on one screen.
    label: "Candidates",
    href: "/recruitment/t/pipeline",
    fullOnly: true,
    tabs: [
      { label: "Candidates", href: "/recruitment/t/pipeline" },
      { label: "Interviews", href: "/recruitment/t/interviews" },
      { label: "Assignments", href: "/recruitment/t/assignments" },
      { label: "Offers", href: "/recruitment/t/offers" },
      { label: "Onboarding", href: "/recruitment/t/onboarding", fullOnly: true },
      { label: "Meetings", href: "/recruitment/meetings" },
    ],
  },
  {
    label: "Outreach",
    href: "/recruitment/templates",
    fullOnly: true,
    tabs: [
      { label: "Templates", href: "/recruitment/templates" },
      { label: "Email activity", href: "/recruitment/activity" },
    ],
  },
  {
    label: "HR Office",
    href: "/recruitment/t/projects",
    fullOnly: true,
    tabs: [
      { label: "HR tasks", href: "/recruitment/t/projects" },
      { label: "Daily log", href: "/recruitment/t/log" },
      { label: "Interns", href: "/recruitment/t/interns" },
      { label: "Campus connect", href: "/recruitment/t/campus" },
      { label: "Access", href: "/recruitment/access" },
    ],
  },
];

const under = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

export const inSection = (s: Section, path: string) =>
  under(path, s.href) || !!s.tabs?.some((t) => under(path, t.href)) || !!s.also?.test(path);

/** All that someone given a few positions has in Recruitment: the list of them, and each one's applicants. */
export const forEveryone = (path: string) => /^\/recruitment\/(applicants|\d+)$/.test(path);

/** The tabs to show on this page: its section's, when it is one of them. */
export function tabsFor(path: string, full: boolean): Tab[] {
  const section = RECRUIT_SECTIONS.find((s) => s.tabs?.some((t) => path === t.href));
  return (section?.tabs ?? []).filter((t) => full || !t.fullOnly);
}
