// One rule for finding an applicant, used by the server's search and by the lists in the browser.

/** Every word typed has to appear somewhere: name, email or role. A run of digits also
 *  looks in the phone number, however either of them is spaced. */
export function matches(a: { name: string; email: string; number: string; position: string; jobName?: string }, search: string): boolean {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = `${a.name} ${a.email} ${a.position} ${a.jobName ?? ""}`.toLowerCase();
  if (words.every((w) => text.includes(w))) return true;
  const typed = search.replace(/[\s+()-]/g, "");
  return /^\d{3,}$/.test(typed) && a.number.replace(/\D/g, "").includes(typed);
}
