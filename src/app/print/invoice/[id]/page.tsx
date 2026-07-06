"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { DocumentPrintView } from "@/components/finance/DocumentPrintView";
import { Loader2 } from "lucide-react";

export default function PrintInvoicePage() {
  const params = useParams<{ id: string }>();
  const invoice = useQuery(api.invoices.getInvoice, {
    invoiceId: params.id as Id<"invoices">,
  });
  const agency = useQuery(api.agencyProfile.getAgencyProfile);

  if (invoice === undefined || agency === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#a8a29e]" />
      </div>
    );
  }
  if (!invoice || !agency) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[13px] text-[#57534e]">
        {!agency ? "Set up the agency profile first." : "Invoice not found."}
      </div>
    );
  }
  if (invoice.source !== "generated" || !invoice.lineItems) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[13px] text-[#57534e]">
        External invoices don&apos;t have a printable version. Open the attached PDF instead.
      </div>
    );
  }

  return (
    <DocumentPrintView
      agency={agency}
      doc={{
        kind: "INVOICE",
        number: invoice.invoiceNumber,
        date: invoice.issueDate,
        dueOrValidLabel: "Due",
        dueOrValidDate: invoice.dueDate,
        projectName: invoice.quotation?.projectName,
        brandName: invoice.brandName,
        lineItems: invoice.lineItems,
        gstPercent: invoice.gstPercent ?? 0,
        subtotal: invoice.subtotal ?? 0,
        taxAmount: invoice.taxAmount ?? 0,
        total: invoice.total,
        amountPaid: invoice.amountPaid,
        notes: invoice.notes,
      }}
    />
  );
}
