/**
 * An outside reviewer's account (users.isReviewer, e.g. Google's app review)
 * reaches only these pages. The backend is what keeps the data out
 * (lib/internalAuth treats the account as signed out everywhere else); this
 * list just keeps the interface to the pages that work for them.
 */
export const REVIEWER_ROUTES = ["/dashboard", "/meetings", "/profile"];

export const isReviewerRoute = (pathname: string) =>
  REVIEWER_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
