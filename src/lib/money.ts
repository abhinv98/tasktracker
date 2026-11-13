/** Rupees as shown on invoices and quotations, always with paise: ₹1,200.50, never ₹1,200.5.
 *  One function for the screen and the printed document, so they cannot disagree. */
export function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
