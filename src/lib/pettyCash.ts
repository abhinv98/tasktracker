/**
 * Petty cash: shared types, money/date formatting, and the client-side
 * aggregation the page renders from. Totals are derived from the one records
 * list — there are no aggregate queries, same as the standalone app.
 *
 * The access rule lives here AND in convex/pettyCash.ts. Convex functions are
 * bundled separately and can't import from src/, so the two copies have to be
 * kept in step by hand.
 * ponytail: duplicated predicate, collapse into a shared convex/lib module if
 * a third caller appears.
 */

/** Not on a role flag because it's one person, not a job function. */
export const PETTY_CASH_EMAILS = ["dhriti@ecultify.com"];

export function canAccessPettyCash(user: {
  email?: string;
  isSuperAdmin?: boolean;
  isAccountant?: boolean;
  isHR?: boolean;
} | null | undefined): boolean {
  if (!user) return false;
  return (
    user.isSuperAdmin === true ||
    user.isAccountant === true ||
    user.isHR === true ||
    PETTY_CASH_EMAILS.includes((user.email ?? "").toLowerCase())
  );
}

export type Disbursement = {
  _id: string;
  allocator: string;
  giver: string;
  recipient: string;
  amountAllocated: number;
  amountGiven: number;
  amountSpent: number;
  givenDate: string; // "YYYY-MM-DD"
  remainderReturned: boolean;
  returnedAt?: number;
  notes?: string;
  createdByName?: string;
  updatedAt?: number;
};

export type DisbursementStatus = "returned" | "outstanding" | "spent";

export function statusOf(d: Disbursement): DisbursementStatus {
  if (d.remainderReturned) return "returned";
  if (d.amountGiven - d.amountSpent > 0) return "outstanding";
  return "spent";
}

export const STATUS_META: Record<
  DisbursementStatus,
  { label: string; color: string }
> = {
  outstanding: { label: "Outstanding", color: "#d97757" },
  spent: { label: "Fully spent", color: "#6a9bcc" },
  returned: { label: "Returned", color: "#788c5d" },
};

/** What this record still has out in the world. Zero once returned. */
export function outstandingOf(d: Disbursement): number {
  if (d.remainderReturned) return 0;
  return Math.max(0, d.amountGiven - d.amountSpent);
}

export function remainderOf(d: Disbursement): number {
  return d.amountGiven - d.amountSpent;
}

export type Totals = {
  allocated: number;
  handedOff: number;
  spent: number;
  outstanding: number;
};

export function computeTotals(items: Disbursement[]): Totals {
  return items.reduce<Totals>(
    (t, d) => ({
      allocated: t.allocated + d.amountAllocated,
      handedOff: t.handedOff + d.amountGiven,
      spent: t.spent + d.amountSpent,
      outstanding: t.outstanding + outstandingOf(d),
    }),
    { allocated: 0, handedOff: 0, spent: 0, outstanding: 0 }
  );
}

export type AllocatorSummary = {
  name: string;
  totals: Totals;
  count: number;
};

/** One row per allocator, biggest book first. */
export function groupByAllocator(items: Disbursement[]): AllocatorSummary[] {
  const map = new Map<string, Disbursement[]>();
  for (const d of items) {
    const key = d.allocator.trim() || "Unknown";
    const arr = map.get(key);
    if (arr) arr.push(d);
    else map.set(key, [d]);
  }
  return [...map.entries()]
    .map(([name, list]) => ({
      name,
      totals: computeTotals(list),
      count: list.length,
    }))
    .sort((a, b) => b.totals.allocated - a.totals.allocated);
}

export function monthKey(givenDate: string): string {
  return givenDate.slice(0, 7); // "YYYY-MM"
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export type MonthGroup = {
  key: string;
  label: string;
  items: Disbursement[];
  totals: Totals;
};

/** Newest month first, newest record first inside it. */
export function groupByMonth(items: Disbursement[]): MonthGroup[] {
  const map = new Map<string, Disbursement[]>();
  for (const d of items) {
    const key = monthKey(d.givenDate);
    const arr = map.get(key);
    if (arr) arr.push(d);
    else map.set(key, [d]);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, list]) => ({
      key,
      label: monthLabel(key),
      items: [...list].sort((a, b) => b.givenDate.localeCompare(a.givenDate)),
      totals: computeTotals(list),
    }));
}

/** Existing names, for the add-form suggestions. */
export function distinctNames(
  items: Disbursement[],
  field: "allocator" | "giver" | "recipient"
): string[] {
  const set = new Set<string>();
  for (const d of items) {
    const v = d[field]?.trim();
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Indian Rupees, no decimals — petty cash is never counted in paise. */
export function money(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function formatGivenDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return d;
  return new Date(y, m - 1, day).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Today as "YYYY-MM-DD" in the viewer's own timezone. */
export function todayISO(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
