/**
 * Petty cash as a float.
 *
 * HR and the accountant hold cash. They hand chunks of it out for errands;
 * the money comes back as a remainder plus an account of what was bought.
 * Nothing counts as spent until that settlement happens — before it, the cash
 * is out of the drawer but still the company's.
 *
 *   in hand = allocated − handed out + returned
 *           = allocated − spent − outstanding
 *
 * The access rule lives here AND in convex/pettyCash.ts. Convex functions are
 * bundled separately and can't import from src/, so the two copies have to be
 * kept in step by hand.
 * ponytail: duplicated predicate, collapse into a shared module if a third
 * caller appears.
 */

/** Not a role flag because it's one person, not a job function. */
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

export type Allocation = {
  _id: string;
  holderId: string;
  holderName: string;
  amount: number;
  date: string; // "YYYY-MM-DD"
  note?: string;
};

export type Handout = {
  _id: string;
  holderId: string;
  holderName: string;
  recipient: string;
  purpose: string;
  amountGiven: number;
  givenDate: string; // "YYYY-MM-DD"
  settled: boolean;
  amountReturned?: number;
  spentOn?: string;
  settledAt?: number;
};

export type Holder = { _id: string; name: string };

/** Spent is only real once the remainder is back and accounted for. */
export function spentOf(h: Handout): number {
  if (!h.settled) return 0;
  return Math.max(0, h.amountGiven - (h.amountReturned ?? 0));
}

/** Cash still out with someone. The full handout until it's settled. */
export function outstandingOf(h: Handout): number {
  return h.settled ? 0 : h.amountGiven;
}

export function returnedOf(h: Handout): number {
  return h.settled ? h.amountReturned ?? 0 : 0;
}

export type Totals = {
  allocated: number;
  handedOut: number;
  returned: number;
  spent: number;
  outstanding: number;
  /** What should physically be in the drawer right now. */
  inHand: number;
};

export function computeTotals(
  allocations: Allocation[],
  handouts: Handout[]
): Totals {
  const allocated = allocations.reduce((n, a) => n + a.amount, 0);
  let handedOut = 0;
  let returned = 0;
  let spent = 0;
  let outstanding = 0;
  for (const h of handouts) {
    handedOut += h.amountGiven;
    returned += returnedOf(h);
    spent += spentOf(h);
    outstanding += outstandingOf(h);
  }
  return {
    allocated,
    handedOut,
    returned,
    spent,
    outstanding,
    inHand: allocated - handedOut + returned,
  };
}

export type HolderSummary = {
  holderId: string;
  name: string;
  totals: Totals;
  openCount: number;
};

/** One balance per person holding a float, biggest float first. */
export function groupByHolder(
  allocations: Allocation[],
  handouts: Handout[],
  holders: Holder[]
): HolderSummary[] {
  const ids = new Set<string>([
    ...allocations.map((a) => a.holderId),
    ...handouts.map((h) => h.holderId),
  ]);
  return [...ids]
    .map((id) => {
      const mine = handouts.filter((h) => h.holderId === id);
      const name =
        holders.find((h) => h._id === id)?.name ??
        allocations.find((a) => a.holderId === id)?.holderName ??
        handouts.find((h) => h.holderId === id)?.holderName ??
        "Unknown";
      return {
        holderId: id,
        name,
        totals: computeTotals(
          allocations.filter((a) => a.holderId === id),
          mine
        ),
        openCount: mine.filter((h) => !h.settled).length,
      };
    })
    .sort((a, b) => b.totals.allocated - a.totals.allocated);
}

export type MonthGroup = {
  key: string;
  label: string;
  items: Handout[];
  given: number;
  spent: number;
};

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

/** Newest month first, newest handout first inside it. */
export function groupByMonth(handouts: Handout[]): MonthGroup[] {
  const map = new Map<string, Handout[]>();
  for (const h of handouts) {
    const key = h.givenDate.slice(0, 7);
    const arr = map.get(key);
    if (arr) arr.push(h);
    else map.set(key, [h]);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, items]) => ({
      key,
      label: monthLabel(key),
      items: [...items].sort((a, b) => b.givenDate.localeCompare(a.givenDate)),
      given: items.reduce((n, h) => n + h.amountGiven, 0),
      spent: items.reduce((n, h) => n + spentOf(h), 0),
    }));
}

/** Names already in the ledger, for the handout form's suggestions. */
export function distinctRecipients(handouts: Handout[]): string[] {
  const set = new Set<string>();
  for (const h of handouts) {
    const v = h.recipient?.trim();
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Indian Rupees, no decimals — petty cash is never counted in paise. */
export function money(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}₹${Math.abs(Math.round(n)).toLocaleString("en-IN")}`;
}

export function formatDay(d: string): string {
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
