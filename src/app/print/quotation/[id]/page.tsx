"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { DocumentPrintView } from "@/components/finance/DocumentPrintView";
import { Loader2 } from "lucide-react";

export default function PrintQuotationPage() {
  const params = useParams<{ id: string }>();
  const quotation = useQuery(api.quotations.getQuotation, {
    quotationId: params.id as Id<"quotations">,
  });
  const agency = useQuery(api.agencyProfile.getAgencyProfile);

  if (quotation === undefined || agency === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#a8a29e]" />
      </div>
    );
  }
  if (!quotation || !agency) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[13px] text-[#57534e]">
        {!agency ? "Set up the agency profile first." : "Quotation not found."}
      </div>
    );
  }

  return (
    <DocumentPrintView
      agency={agency}
      doc={{
        kind: "QUOTATION",
        number: quotation.quoteNumber,
        date: quotation.createdAt,
        dueOrValidLabel: "Valid until",
        dueOrValidDate: quotation.validUntil,
        projectName: quotation.projectName,
        brandName: quotation.brandName,
        lineItems: quotation.lineItems,
        gstPercent: quotation.gstPercent,
        subtotal: quotation.subtotal,
        taxAmount: quotation.taxAmount,
        total: quotation.total,
        notes: quotation.notes,
      }}
    />
  );
}
