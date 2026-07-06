"use client";

import { Printer } from "lucide-react";

type LineItem = { description: string; qty: number; rate: number; amount: number };

export type PrintDocument = {
  kind: "INVOICE" | "QUOTATION";
  number: string;
  date: number;
  dueOrValidLabel?: string;
  dueOrValidDate?: number | null;
  projectName?: string;
  brandName: string;
  lineItems: LineItem[];
  gstPercent: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  amountPaid?: number;
  notes?: string | null;
};

export type AgencyInfo = {
  name: string;
  addressLines: string[];
  gstin?: string | null;
  email?: string | null;
  phone?: string | null;
  bankName?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  ifsc?: string | null;
  upiId?: string | null;
  logoUrl?: string | null;
  termsNote?: string | null;
};

function inr(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function fmtDate(ts?: number | null): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function DocumentPrintView({
  doc,
  agency,
}: {
  doc: PrintDocument;
  agency: AgencyInfo;
}) {
  const balance =
    doc.amountPaid !== undefined ? doc.total - doc.amountPaid : undefined;

  return (
    <div className="min-h-screen bg-[#f5f5f4] print:bg-white py-8 print:py-0">
      {/* On-screen toolbar — hidden in print */}
      <div className="max-w-[210mm] mx-auto mb-4 flex justify-end print:hidden px-4">
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#141413] text-white text-[13px] font-semibold"
        >
          <Printer className="h-4 w-4" /> Print / Save as PDF
        </button>
      </div>

      {/* A4 sheet */}
      <div className="max-w-[210mm] mx-auto bg-white shadow-sm print:shadow-none px-[18mm] py-[16mm] text-[#1c1917]">
        {/* Header */}
        <div className="flex items-start justify-between pb-6 border-b-2 border-[#1c1917]">
          <div className="flex items-start gap-4">
            {agency.logoUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={agency.logoUrl}
                alt=""
                className="w-14 h-14 rounded object-contain"
              />
            )}
            <div>
              <h1 className="text-[20px] font-bold leading-tight">{agency.name}</h1>
              {agency.addressLines.map((l, i) => (
                <p key={i} className="text-[11px] text-[#57534e] leading-snug">
                  {l}
                </p>
              ))}
              <p className="text-[11px] text-[#57534e] leading-snug">
                {[agency.email, agency.phone].filter(Boolean).join(" · ")}
              </p>
              {agency.gstin && (
                <p className="text-[11px] text-[#57534e] leading-snug">
                  GSTIN: {agency.gstin}
                </p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-[22px] font-bold tracking-wide">{doc.kind}</p>
            <p className="text-[13px] font-semibold mt-1">{doc.number}</p>
            <p className="text-[11px] text-[#57534e] mt-1">
              Date: {fmtDate(doc.date)}
            </p>
            {doc.dueOrValidLabel && (
              <p className="text-[11px] text-[#57534e]">
                {doc.dueOrValidLabel}: {fmtDate(doc.dueOrValidDate)}
              </p>
            )}
          </div>
        </div>

        {/* Bill to */}
        <div className="flex items-start justify-between py-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e] mb-1">
              {doc.kind === "INVOICE" ? "Billed to" : "Prepared for"}
            </p>
            <p className="text-[14px] font-semibold">{doc.brandName}</p>
            {doc.projectName && (
              <p className="text-[12px] text-[#57534e]">Project: {doc.projectName}</p>
            )}
          </div>
        </div>

        {/* Line items */}
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y border-[#d6d3d1] text-[10px] font-bold uppercase tracking-widest text-[#57534e]">
              <th className="py-2 text-left">Description</th>
              <th className="py-2 text-right w-16">Qty</th>
              <th className="py-2 text-right w-28">Rate</th>
              <th className="py-2 text-right w-28">Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.lineItems.map((li, i) => (
              <tr key={i} className="border-b border-[#e7e5e4] text-[12px]">
                <td className="py-2.5 pr-3">{li.description}</td>
                <td className="py-2.5 text-right tabular-nums">{li.qty}</td>
                <td className="py-2.5 text-right tabular-nums">{inr(li.rate)}</td>
                <td className="py-2.5 text-right tabular-nums">{inr(li.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mt-4">
          <div className="w-64 space-y-1.5 text-[12px]">
            <div className="flex justify-between">
              <span className="text-[#57534e]">Subtotal</span>
              <span className="tabular-nums">{inr(doc.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#57534e]">GST ({doc.gstPercent}%)</span>
              <span className="tabular-nums">{inr(doc.taxAmount)}</span>
            </div>
            <div className="flex justify-between pt-1.5 border-t-2 border-[#1c1917] text-[14px] font-bold">
              <span>Total</span>
              <span className="tabular-nums">{inr(doc.total)}</span>
            </div>
            {balance !== undefined && doc.amountPaid !== undefined && doc.amountPaid > 0 && (
              <>
                <div className="flex justify-between text-[#57534e]">
                  <span>Paid</span>
                  <span className="tabular-nums">{inr(doc.amountPaid)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Balance due</span>
                  <span className="tabular-nums">{inr(Math.max(0, balance))}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Bank + terms */}
        <div className="mt-10 pt-5 border-t border-[#d6d3d1] grid grid-cols-2 gap-6">
          {(agency.bankName || agency.upiId) && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e] mb-1.5">
                Payment details
              </p>
              <div className="text-[11px] text-[#57534e] leading-relaxed">
                {agency.bankName && <p>Bank: {agency.bankName}</p>}
                {agency.accountName && <p>Account name: {agency.accountName}</p>}
                {agency.accountNumber && <p>Account no: {agency.accountNumber}</p>}
                {agency.ifsc && <p>IFSC: {agency.ifsc}</p>}
                {agency.upiId && <p>UPI: {agency.upiId}</p>}
              </div>
            </div>
          )}
          <div>
            {doc.notes && (
              <>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e] mb-1.5">
                  Notes
                </p>
                <p className="text-[11px] text-[#57534e] leading-relaxed">{doc.notes}</p>
              </>
            )}
            {agency.termsNote && (
              <>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#a8a29e] mb-1.5 mt-3">
                  Terms
                </p>
                <p className="text-[11px] text-[#57534e] leading-relaxed">
                  {agency.termsNote}
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 0;
          }
          body {
            background: white !important;
          }
        }
      `}</style>
    </div>
  );
}
