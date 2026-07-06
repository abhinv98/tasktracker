"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Card,
  ConfirmModal,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToast,
} from "@/components/ui";
import {
  Banknote,
  FileText,
  IndianRupee,
  Loader2,
  Plus,
  Printer,
  Receipt,
  Settings,
  Trash2,
  Upload,
  X,
  ExternalLink,
  AlertCircle,
} from "lucide-react";

/* ─── helpers ─── */

function fmtINR(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function fmtDate(ts?: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function toDateInput(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fromDateInput(val: string): number | undefined {
  if (!val) return undefined;
  return new Date(val + "T12:00:00").getTime();
}

const todayInput = () => toDateInput(Date.now());

type LineItem = { description: string; qty: number; rate: number; amount: number };

const QUOTE_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "Draft", color: "#57534e", bg: "#f5f5f4" },
  sent: { label: "Sent", color: "#1d4ed8", bg: "#eff6ff" },
  approved: { label: "Approved", color: "#047857", bg: "#ecfdf5" },
  rejected: { label: "Rejected", color: "#b91c1c", bg: "#fef2f2" },
  invoiced: { label: "Invoiced", color: "#7c3aed", bg: "#f5f3ff" },
};

const INVOICE_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "Draft", color: "#57534e", bg: "#f5f5f4" },
  unpaid: { label: "Unpaid", color: "#b45309", bg: "#fffbeb" },
  partially_paid: { label: "Partially Paid", color: "#1d4ed8", bg: "#eff6ff" },
  paid: { label: "Paid", color: "#047857", bg: "#ecfdf5" },
  overdue: { label: "Overdue", color: "#b91c1c", bg: "#fef2f2" },
};

function StatusChip({
  meta,
}: {
  meta: { label: string; color: string; bg: string };
}) {
  return (
    <span
      className="inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ color: meta.color, backgroundColor: meta.bg }}
    >
      {meta.label}
    </span>
  );
}

const inputCls =
  "w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-md text-[13px] text-[var(--text-primary)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]";
const labelCls =
  "block font-medium text-[11px] uppercase tracking-wide text-[var(--text-secondary)] mb-1.5";

/* ─── Line item editor (shared by quotation + generated invoice) ─── */

function LineItemEditor({
  items,
  onChange,
  gstPercent,
  onGstChange,
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  gstPercent: number;
  onGstChange: (v: number) => void;
}) {
  const subtotal = items.reduce((s, li) => s + li.qty * li.rate, 0);
  const tax = (subtotal * gstPercent) / 100;

  function patch(i: number, changes: Partial<LineItem>) {
    const next = items.map((li, idx) => (idx === i ? { ...li, ...changes } : li));
    onChange(next);
  }

  return (
    <div>
      <div className="grid grid-cols-[1fr_64px_110px_100px_28px] gap-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        <span>Description</span>
        <span>Qty</span>
        <span>Rate (₹)</span>
        <span className="text-right">Amount</span>
        <span />
      </div>
      <div className="space-y-1.5">
        {items.map((li, i) => (
          <div key={i} className="grid grid-cols-[1fr_64px_110px_100px_28px] gap-2 items-center">
            <input
              value={li.description}
              onChange={(e) => patch(i, { description: e.target.value })}
              placeholder="Service / deliverable"
              className={inputCls}
            />
            <input
              type="number"
              min={0}
              value={li.qty}
              onChange={(e) => patch(i, { qty: Number(e.target.value) })}
              className={inputCls}
            />
            <input
              type="number"
              min={0}
              value={li.rate}
              onChange={(e) => patch(i, { rate: Number(e.target.value) })}
              className={inputCls}
            />
            <span className="text-right text-[13px] tabular-nums text-[var(--text-primary)]">
              {fmtINR(li.qty * li.rate)}
            </span>
            <button
              type="button"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              disabled={items.length === 1}
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--danger)] disabled:opacity-30"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() =>
          onChange([...items, { description: "", qty: 1, rate: 0, amount: 0 }])
        }
        className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--accent-admin)] hover:underline"
      >
        <Plus className="h-3.5 w-3.5" /> Add line
      </button>

      <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] flex flex-col items-end gap-1 text-[13px]">
        <div className="flex items-center gap-6">
          <span className="text-[var(--text-secondary)]">Subtotal</span>
          <span className="tabular-nums w-28 text-right">{fmtINR(subtotal)}</span>
        </div>
        <div className="flex items-center gap-6">
          <span className="text-[var(--text-secondary)] inline-flex items-center gap-1.5">
            GST
            <input
              type="number"
              min={0}
              max={100}
              value={gstPercent}
              onChange={(e) => onGstChange(Number(e.target.value))}
              className="w-16 bg-[var(--bg-input)] border border-[var(--border)] rounded-md text-[12px] px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
            />
            %
          </span>
          <span className="tabular-nums w-28 text-right">{fmtINR(tax)}</span>
        </div>
        <div className="flex items-center gap-6 font-semibold text-[14px]">
          <span>Total</span>
          <span className="tabular-nums w-28 text-right">{fmtINR(subtotal + tax)}</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Page ─── */

export default function InvoicesPage() {
  const { toast } = useToast();
  const user = useQuery(api.users.getCurrentUser);
  const isSuperAdmin = user?.isSuperAdmin === true;

  const [tab, setTab] = useState<"overview" | "quotations" | "invoices">("overview");
  const [showSettings, setShowSettings] = useState(false);
  const [brandFilter, setBrandFilter] = useState<string>("");

  const brands = useQuery(api.brands.listBrands, isSuperAdmin ? {} : "skip");
  const overview = useQuery(api.invoices.financeOverview, isSuperAdmin ? {} : "skip");
  const profile = useQuery(api.agencyProfile.getAgencyProfile, isSuperAdmin ? {} : "skip");
  const quotations = useQuery(
    api.quotations.listQuotations,
    isSuperAdmin
      ? brandFilter
        ? { brandId: brandFilter as Id<"brands"> }
        : {}
      : "skip"
  );
  const invoices = useQuery(
    api.invoices.listInvoices,
    isSuperAdmin
      ? brandFilter
        ? { brandId: brandFilter as Id<"brands"> }
        : {}
      : "skip"
  );

  // Quotation modal state
  const [quoteModal, setQuoteModal] = useState<null | { editId?: string }>(null);
  // Invoice create modal
  const [invoiceModal, setInvoiceModal] = useState<null | { source: "generated" | "external" }>(null);
  const [showNewInvoiceMenu, setShowNewInvoiceMenu] = useState(false);
  // Invoice detail
  const [detailInvoiceId, setDetailInvoiceId] = useState<string | null>(null);

  if (user && !isSuperAdmin) {
    return (
      <div className="p-8 text-center text-[13px] text-[var(--text-muted)]">
        This area is restricted to super admins.
      </div>
    );
  }

  const needsProfile = profile === null;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-start justify-between gap-3">
        <PageHeader
          title="Invoices & Quotations"
          subtitle="Quote projects, raise or track invoices, and record payments — end to end."
        />
        <button
          onClick={() => setShowSettings(true)}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-[var(--border)] text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <Settings className="h-3.5 w-3.5" /> Agency profile
        </button>
      </div>

      {needsProfile && (
        <div className="mb-4 px-4 py-3 rounded-lg border border-amber-200 bg-amber-50 flex items-center gap-2.5">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-[12px] text-amber-800">
            Set up your <strong>agency profile</strong> (name, GSTIN, bank details,
            numbering) before creating quotations or invoices.
          </p>
          <button
            onClick={() => setShowSettings(true)}
            className="ml-auto text-[12px] font-semibold text-amber-800 underline"
          >
            Set up now
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1.5 mb-5">
        {(
          [
            { key: "overview", label: "Overview" },
            { key: "quotations", label: "Quotations" },
            { key: "invoices", label: "Invoices" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
              tab === t.key
                ? "bg-[var(--text-primary)] text-white"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            }`}
          >
            {t.label}
          </button>
        ))}
        {(tab === "quotations" || tab === "invoices") && (
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="ml-auto bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[13px] text-[var(--text-primary)] px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)] min-w-[160px]"
          >
            <option value="">All brands</option>
            {(brands ?? []).map((b: any) => (
              <option key={b._id} value={b._id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        {tab === "quotations" && (
          <button
            onClick={() => setQuoteModal({})}
            disabled={needsProfile}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent-admin)] text-white text-[13px] font-semibold disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> New Quotation
          </button>
        )}
        {tab === "invoices" && (
          <div className="relative">
            <button
              onClick={() => setShowNewInvoiceMenu((v) => !v)}
              disabled={needsProfile}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent-admin)] text-white text-[13px] font-semibold disabled:opacity-40"
            >
              <Plus className="h-4 w-4" /> New Invoice
            </button>
            {showNewInvoiceMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowNewInvoiceMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-40 w-[240px] rounded-lg border border-[var(--border)] bg-white shadow-lg py-1 text-[12px]">
                  <button
                    onClick={() => {
                      setInvoiceModal({ source: "generated" });
                      setShowNewInvoiceMenu(false);
                    }}
                    className="flex items-start gap-2 px-3 py-2 w-full hover:bg-[var(--bg-hover)] text-left"
                  >
                    <FileText className="h-4 w-4 text-[var(--accent-admin)] shrink-0 mt-0.5" />
                    <span>
                      <span className="block font-semibold text-[var(--text-primary)]">Generate invoice</span>
                      <span className="block text-[11px] text-[var(--text-muted)]">Line items + GST, printable</span>
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      setInvoiceModal({ source: "external" });
                      setShowNewInvoiceMenu(false);
                    }}
                    className="flex items-start gap-2 px-3 py-2 w-full hover:bg-[var(--bg-hover)] text-left"
                  >
                    <Upload className="h-4 w-4 text-[var(--accent-admin)] shrink-0 mt-0.5" />
                    <span>
                      <span className="block font-semibold text-[var(--text-primary)]">Track external invoice</span>
                      <span className="block text-[11px] text-[var(--text-muted)]">Made elsewhere — attach the PDF</span>
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {tab === "overview" && <OverviewTab overview={overview} />}
      {tab === "quotations" && (
        <QuotationsTab
          quotations={quotations}
          onEditDraft={(id) => setQuoteModal({ editId: id })}
          onOpenInvoice={(id) => {
            setTab("invoices");
            setDetailInvoiceId(id);
          }}
          toast={toast}
        />
      )}
      {tab === "invoices" && (
        <InvoicesTab invoices={invoices} onOpen={(id) => setDetailInvoiceId(id)} />
      )}

      {quoteModal && (
        <QuotationModal
          editId={quoteModal.editId}
          brands={brands ?? []}
          defaultGst={profile?.defaultGstPercent ?? 18}
          onClose={() => setQuoteModal(null)}
          toast={toast}
        />
      )}
      {invoiceModal && (
        <NewInvoiceModal
          source={invoiceModal.source}
          brands={brands ?? []}
          defaultGst={profile?.defaultGstPercent ?? 18}
          onClose={() => setInvoiceModal(null)}
          toast={toast}
        />
      )}
      {detailInvoiceId && (
        <InvoiceDetailModal
          invoiceId={detailInvoiceId}
          onClose={() => setDetailInvoiceId(null)}
          toast={toast}
        />
      )}
      {showSettings && (
        <AgencyProfileModal
          profile={profile ?? null}
          onClose={() => setShowSettings(false)}
          toast={toast}
        />
      )}
    </div>
  );
}

/* ─── Overview tab ─── */

function OverviewTab({ overview }: { overview: any }) {
  if (overview === undefined)
    return <p className="text-[13px] text-[var(--text-muted)] py-8">Loading…</p>;

  const tiles = [
    {
      label: "Outstanding",
      value: fmtINR(overview.outstanding),
      hint: "Invoiced, not yet collected",
      icon: IndianRupee,
      accent: "admin" as const,
    },
    {
      label: "Overdue",
      value: fmtINR(overview.overdueTotal),
      hint: `${overview.overdueCount} invoice${overview.overdueCount === 1 ? "" : "s"} past due`,
      icon: AlertCircle,
      accent: "none" as const,
      danger: overview.overdueCount > 0,
    },
    {
      label: "Collected this month",
      value: fmtINR(overview.collectedThisMonth),
      hint: "Payments received",
      icon: Banknote,
      accent: "employee" as const,
    },
    {
      label: "Quotes awaiting reply",
      value: String(overview.quotesAwaiting),
      hint: `${overview.draftCount} draft invoice${overview.draftCount === 1 ? "" : "s"}`,
      icon: FileText,
      accent: "manager" as const,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {tiles.map((t) => (
          <Card key={t.label} accent={t.accent}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                {t.label}
              </span>
              <t.icon
                className={`h-4 w-4 ${t.danger ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`}
              />
            </div>
            <p
              className={`text-[22px] font-semibold tabular-nums leading-none ${
                t.danger ? "text-[var(--danger)]" : "text-[var(--text-primary)]"
              }`}
            >
              {t.value}
            </p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1.5">{t.hint}</p>
          </Card>
        ))}
      </div>

      <section>
        <h2 className="font-semibold text-[14px] text-[var(--text-primary)] mb-3">
          Recent payments
        </h2>
        {overview.recentPayments.length === 0 ? (
          <p className="text-[13px] text-[var(--text-muted)]">
            No payments recorded yet. Record one from an invoice&apos;s detail view.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableHead>Date</TableHead>
              <TableHead>Invoice</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Method</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableHeader>
            <TableBody>
              {overview.recentPayments.map((p: any) => (
                <TableRow key={p._id}>
                  <TableCell>{fmtDate(p.paidOn)}</TableCell>
                  <TableCell>{p.invoiceNumber}</TableCell>
                  <TableCell>{p.brandName}</TableCell>
                  <TableCell>{p.method ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {fmtINR(p.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

/* ─── Quotations tab ─── */

function QuotationsTab({
  quotations,
  onEditDraft,
  onOpenInvoice,
  toast,
}: {
  quotations: any[] | undefined;
  onEditDraft: (id: string) => void;
  onOpenInvoice: (id: string) => void;
  toast: (t: any, m: string) => void;
}) {
  const setStatus = useMutation(api.quotations.setQuotationStatus);
  const revise = useMutation(api.quotations.reviseQuotation);
  const convert = useMutation(api.quotations.convertQuotationToInvoice);
  const remove = useMutation(api.quotations.deleteQuotation);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [convertId, setConvertId] = useState<string | null>(null);
  const [convertDue, setConvertDue] = useState("");

  async function act(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast("success", ok);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed");
    }
  }

  if (quotations === undefined)
    return <p className="text-[13px] text-[var(--text-muted)] py-8">Loading…</p>;
  if (quotations.length === 0)
    return (
      <div className="text-center py-16">
        <FileText className="h-10 w-10 text-[var(--text-muted)] mx-auto mb-3" />
        <p className="text-[14px] font-medium text-[var(--text-secondary)]">No quotations yet</p>
        <p className="text-[12px] text-[var(--text-muted)] mt-1">
          Create one per project you pitch — approve it, then convert it to an invoice.
        </p>
      </div>
    );

  return (
    <>
      <Table>
        <TableHeader>
          <TableHead>Number</TableHead>
          <TableHead>Brand</TableHead>
          <TableHead>Project</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableHeader>
        <TableBody>
          {quotations.map((q) => {
            const meta = QUOTE_STATUS[q.status] ?? QUOTE_STATUS.draft;
            return (
              <TableRow key={q._id}>
                <TableCell className="font-medium">{q.quoteNumber}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: q.brandColor }} />
                    {q.brandName}
                  </span>
                </TableCell>
                <TableCell>{q.projectName}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">{fmtINR(q.total)}</TableCell>
                <TableCell><StatusChip meta={meta} /></TableCell>
                <TableCell className="text-[var(--text-muted)]">{fmtDate(q.createdAt)}</TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-1 flex-wrap justify-end">
                    {q.status === "draft" && (
                      <>
                        <RowBtn onClick={() => onEditDraft(q._id)}>Edit</RowBtn>
                        <RowBtn onClick={() => act(() => setStatus({ quotationId: q._id, status: "sent" }), "Marked as sent")}>
                          Send
                        </RowBtn>
                      </>
                    )}
                    {q.status === "sent" && (
                      <>
                        <RowBtn onClick={() => act(() => setStatus({ quotationId: q._id, status: "approved" }), "Approved")}>
                          Approve
                        </RowBtn>
                        <RowBtn onClick={() => act(() => setStatus({ quotationId: q._id, status: "rejected" }), "Rejected")}>
                          Reject
                        </RowBtn>
                      </>
                    )}
                    {q.status === "approved" && !q.invoiceId && (
                      <RowBtn primary onClick={() => { setConvertId(q._id); setConvertDue(""); }}>
                        Convert to Invoice
                      </RowBtn>
                    )}
                    {q.status === "invoiced" && q.invoiceId && (
                      <RowBtn onClick={() => onOpenInvoice(q.invoiceId)}>View invoice</RowBtn>
                    )}
                    {(q.status === "sent" || q.status === "approved" || q.status === "rejected") && (
                      <RowBtn
                        onClick={() =>
                          act(async () => {
                            await revise({ quotationId: q._id });
                          }, "Revision draft created")
                        }
                      >
                        Revise
                      </RowBtn>
                    )}
                    <a
                      href={`/print/quotation/${q._id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                      title="Print / Save as PDF"
                    >
                      <Printer className="h-3.5 w-3.5" />
                    </a>
                    {!q.invoiceId && (
                      <button
                        onClick={() => setConfirmDelete(q._id)}
                        className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-red-50"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <ConfirmModal
        open={confirmDelete !== null}
        title="Delete quotation?"
        message="This permanently removes the quotation. This cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          await act(() => remove({ quotationId: confirmDelete as Id<"quotations"> }), "Quotation deleted");
          setConfirmDelete(null);
        }}
      />

      {convertId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm">
            <h3 className="font-semibold text-[15px] text-[var(--text-primary)] mb-3">
              Convert to invoice
            </h3>
            <label className={labelCls}>Due date (optional)</label>
            <input
              type="date"
              value={convertDue}
              onChange={(e) => setConvertDue(e.target.value)}
              className={inputCls}
            />
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={() => setConvertId(null)}
                className="flex-1 py-2 rounded-md border border-[var(--border)] text-[13px] font-medium text-[var(--text-secondary)]"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await act(
                    () =>
                      convert({
                        quotationId: convertId as Id<"quotations">,
                        issueDate: Date.now(),
                        dueDate: fromDateInput(convertDue),
                      }),
                    "Invoice draft created — finalize it from the Invoices tab"
                  );
                  setConvertId(null);
                }}
                className="flex-1 py-2 rounded-md bg-[var(--accent-admin)] text-white text-[13px] font-semibold"
              >
                Create invoice
              </button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

function RowBtn({
  children,
  onClick,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
        primary
          ? "bg-[var(--accent-admin)] text-white"
          : "border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
      }`}
    >
      {children}
    </button>
  );
}

/* ─── Invoices tab ─── */

function InvoicesTab({
  invoices,
  onOpen,
}: {
  invoices: any[] | undefined;
  onOpen: (id: string) => void;
}) {
  if (invoices === undefined)
    return <p className="text-[13px] text-[var(--text-muted)] py-8">Loading…</p>;
  if (invoices.length === 0)
    return (
      <div className="text-center py-16">
        <Receipt className="h-10 w-10 text-[var(--text-muted)] mx-auto mb-3" />
        <p className="text-[14px] font-medium text-[var(--text-secondary)]">No invoices yet</p>
        <p className="text-[12px] text-[var(--text-muted)] mt-1">
          Generate one in-app, track an external one, or convert an approved quotation.
        </p>
      </div>
    );

  return (
    <Table>
      <TableHeader>
        <TableHead>Number</TableHead>
        <TableHead>Brand</TableHead>
        <TableHead>Source</TableHead>
        <TableHead className="text-right">Total</TableHead>
        <TableHead className="text-right">Paid</TableHead>
        <TableHead className="text-right">Balance</TableHead>
        <TableHead>Due</TableHead>
        <TableHead>Status</TableHead>
      </TableHeader>
      <TableBody>
        {invoices.map((inv) => {
          const meta = INVOICE_STATUS[inv.effectiveStatus] ?? INVOICE_STATUS.unpaid;
          return (
            <TableRow key={inv._id} onClick={() => onOpen(inv._id)}>
              <TableCell className="font-medium">{inv.invoiceNumber}</TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: inv.brandColor }} />
                  {inv.brandName}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-[11px] text-[var(--text-muted)]">
                  {inv.source === "generated" ? "Generated" : "External"}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">{fmtINR(inv.total)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtINR(inv.amountPaid)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {inv.balance < 0 ? (
                  <span className="text-emerald-700">Overpaid {fmtINR(Math.abs(inv.balance))}</span>
                ) : (
                  fmtINR(inv.balance)
                )}
              </TableCell>
              <TableCell className="text-[var(--text-muted)]">{fmtDate(inv.dueDate)}</TableCell>
              <TableCell><StatusChip meta={meta} /></TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/* ─── Quotation create/edit modal ─── */

function QuotationModal({
  editId,
  brands,
  defaultGst,
  onClose,
  toast,
}: {
  editId?: string;
  brands: any[];
  defaultGst: number;
  onClose: () => void;
  toast: (t: any, m: string) => void;
}) {
  const existing = useQuery(
    api.quotations.getQuotation,
    editId ? { quotationId: editId as Id<"quotations"> } : "skip"
  );
  const create = useMutation(api.quotations.createQuotation);
  const update = useMutation(api.quotations.updateQuotation);

  const [brandId, setBrandId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [items, setItems] = useState<LineItem[]>([
    { description: "", qty: 1, rate: 0, amount: 0 },
  ]);
  const [gst, setGst] = useState(defaultGst);
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadedFromExisting, setLoadedFromExisting] = useState(false);

  useEffect(() => {
    if (existing && !loadedFromExisting) {
      setBrandId(existing.brandId);
      setProjectName(existing.projectName);
      setItems(existing.lineItems);
      setGst(existing.gstPercent);
      setNotes(existing.notes ?? "");
      setValidUntil(toDateInput(existing.validUntil));
      setLoadedFromExisting(true);
    }
  }, [existing, loadedFromExisting]);

  const valid =
    brandId &&
    projectName.trim() &&
    items.length > 0 &&
    items.every((li) => li.description.trim() && li.qty > 0 && li.rate >= 0);

  async function handleSave() {
    if (!valid) return;
    setSaving(true);
    try {
      if (editId) {
        await update({
          quotationId: editId as Id<"quotations">,
          projectName: projectName.trim(),
          lineItems: items.map((li) => ({ ...li, amount: li.qty * li.rate })),
          gstPercent: gst,
          notes: notes.trim() || undefined,
          validUntil: fromDateInput(validUntil),
        });
        toast("success", "Quotation updated");
      } else {
        await create({
          brandId: brandId as Id<"brands">,
          projectName: projectName.trim(),
          lineItems: items.map((li) => ({ ...li, amount: li.qty * li.rate })),
          gstPercent: gst,
          notes: notes.trim() || undefined,
          validUntil: fromDateInput(validUntil),
        });
        toast("success", "Quotation created as draft");
      }
      onClose();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to save");
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-[16px] text-[var(--text-primary)]">
            {editId ? "Edit quotation (draft)" : "New quotation"}
          </h3>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelCls}>Brand (client)</label>
            <select
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              disabled={!!editId}
              className={inputCls + " appearance-none cursor-pointer disabled:opacity-60"}
            >
              <option value="">Choose brand…</option>
              {brands.map((b: any) => (
                <option key={b._id} value={b._id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Project name</label>
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. Diwali Campaign 2026"
              className={inputCls}
            />
          </div>
        </div>

        <LineItemEditor items={items} onChange={setItems} gstPercent={gst} onGstChange={setGst} />

        <div className="grid grid-cols-2 gap-3 mt-4">
          <div>
            <label className={labelCls}>Valid until (optional)</label>
            <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Notes (optional)</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Payment terms, scope notes…"
              className={inputCls}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md border border-[var(--border)] text-[13px] font-medium text-[var(--text-secondary)]"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!valid || saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[var(--accent-admin)] text-white text-[13px] font-semibold disabled:opacity-40"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {editId ? "Save changes" : "Create draft"}
          </button>
        </div>
      </Card>
    </div>
  );
}

/* ─── New invoice modal (generated | external) ─── */

function NewInvoiceModal({
  source,
  brands,
  defaultGst,
  onClose,
  toast,
}: {
  source: "generated" | "external";
  brands: any[];
  defaultGst: number;
  onClose: () => void;
  toast: (t: any, m: string) => void;
}) {
  const create = useMutation(api.invoices.createInvoice);
  const genUploadUrl = useMutation(api.invoices.generateInvoicePdfUploadUrl);

  const [brandId, setBrandId] = useState("");
  const [issueDate, setIssueDate] = useState(todayInput());
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  // generated
  const [items, setItems] = useState<LineItem[]>([
    { description: "", qty: 1, rate: 0, amount: 0 },
  ]);
  const [gst, setGst] = useState(defaultGst);
  // external
  const [number, setNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const valid =
    brandId &&
    issueDate &&
    (source === "generated"
      ? items.every((li) => li.description.trim() && li.qty > 0)
      : number.trim() && Number(amount) > 0);

  async function handleSave() {
    if (!valid) return;
    setSaving(true);
    try {
      let pdfStorageId: string | undefined;
      if (source === "external" && pdfFile) {
        const uploadUrl = await genUploadUrl({});
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": pdfFile.type || "application/pdf" },
          body: pdfFile,
        });
        if (!res.ok) throw new Error("PDF upload failed");
        const { storageId } = await res.json();
        pdfStorageId = storageId;
      }
      await create({
        brandId: brandId as Id<"brands">,
        source,
        issueDate: fromDateInput(issueDate)!,
        dueDate: fromDateInput(dueDate),
        notes: notes.trim() || undefined,
        ...(source === "generated"
          ? {
              lineItems: items.map((li) => ({ ...li, amount: li.qty * li.rate })),
              gstPercent: gst,
            }
          : {
              invoiceNumber: number.trim(),
              total: Number(amount),
              ...(pdfStorageId ? { pdfStorageId: pdfStorageId as Id<"_storage"> } : {}),
            }),
      });
      toast(
        "success",
        source === "generated"
          ? "Invoice created as draft — finalize to start tracking payment"
          : "External invoice tracked"
      );
      onClose();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to create invoice");
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-[16px] text-[var(--text-primary)]">
            {source === "generated" ? "Generate invoice" : "Track external invoice"}
          </h3>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <label className={labelCls}>Brand (client)</label>
            <select
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              className={inputCls + " appearance-none cursor-pointer"}
            >
              <option value="">Choose brand…</option>
              {brands.map((b: any) => (
                <option key={b._id} value={b._id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Issue date</label>
            <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Due date (optional)</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
          </div>
        </div>

        {source === "generated" ? (
          <LineItemEditor items={items} onChange={setItems} gstPercent={gst} onGstChange={setGst} />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Invoice number</label>
              <input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="As it appears on the invoice"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Total amount (₹, incl. tax)</label>
              <input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Invoice PDF (optional)</label>
              <label className="flex items-center gap-2 px-3 py-2.5 rounded-md border border-dashed border-[var(--border-strong)] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors">
                <Upload className="h-4 w-4 text-[var(--text-muted)]" />
                <span className="text-[12px] text-[var(--text-secondary)] truncate">
                  {pdfFile ? pdfFile.name : "Attach the invoice PDF"}
                </span>
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          </div>
        )}

        <div className="mt-4">
          <label className={labelCls}>Notes (optional)</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Internal note about this invoice"
            className={inputCls}
          />
        </div>

        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md border border-[var(--border)] text-[13px] font-medium text-[var(--text-secondary)]"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!valid || saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[var(--accent-admin)] text-white text-[13px] font-semibold disabled:opacity-40"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {source === "generated" ? "Create draft" : "Track invoice"}
          </button>
        </div>
      </Card>
    </div>
  );
}

/* ─── Invoice detail modal ─── */

function InvoiceDetailModal({
  invoiceId,
  onClose,
  toast,
}: {
  invoiceId: string;
  onClose: () => void;
  toast: (t: any, m: string) => void;
}) {
  const invoice = useQuery(api.invoices.getInvoice, {
    invoiceId: invoiceId as Id<"invoices">,
  });
  const finalize = useMutation(api.invoices.finalizeInvoice);
  const recordPayment = useMutation(api.invoices.recordPayment);
  const deletePayment = useMutation(api.invoices.deletePayment);
  const deleteInvoice = useMutation(api.invoices.deleteInvoice);

  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(todayInput());
  const [payMethod, setPayMethod] = useState("Bank transfer");
  const [payRef, setPayRef] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast("success", ok);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed");
    }
    setBusy(false);
  }

  if (invoice === undefined)
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <Loader2 className="h-6 w-6 animate-spin text-white" />
      </div>
    );
  if (invoice === null) return null;

  const meta = INVOICE_STATUS[invoice.effectiveStatus] ?? INVOICE_STATUS.unpaid;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <h3 className="font-semibold text-[16px] text-[var(--text-primary)] truncate">
              {invoice.invoiceNumber}
            </h3>
            <StatusChip meta={meta} />
            <span className="text-[11px] text-[var(--text-muted)]">
              {invoice.source === "generated" ? "Generated" : "External"}
            </span>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-[12px] text-[var(--text-muted)] mb-4">
          <span className="inline-flex items-center gap-1.5 mr-3">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: invoice.brandColor }} />
            {invoice.brandName}
          </span>
          Issued {fmtDate(invoice.issueDate)} · Due {fmtDate(invoice.dueDate)}
          {invoice.quotation && (
            <> · From quote {invoice.quotation.quoteNumber} ({invoice.quotation.projectName})</>
          )}
        </p>

        {/* Amounts */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: "Total", value: fmtINR(invoice.total) },
            { label: "Paid", value: fmtINR(invoice.amountPaid) },
            {
              label: invoice.balance < 0 ? "Overpaid" : "Balance",
              value: fmtINR(Math.abs(invoice.balance)),
              danger: invoice.balance > 0 && invoice.effectiveStatus === "overdue",
            },
          ].map((t) => (
            <div key={t.label} className="rounded-lg border border-[var(--border-subtle)] px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{t.label}</p>
              <p className={`text-[16px] font-semibold tabular-nums ${t.danger ? "text-[var(--danger)]" : "text-[var(--text-primary)]"}`}>
                {t.value}
              </p>
            </div>
          ))}
        </div>

        {/* Line items (generated) */}
        {invoice.source === "generated" && invoice.lineItems && (
          <div className="mb-4 rounded-lg border border-[var(--border-subtle)] overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-[var(--bg-hover)] text-left text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
                  <th className="px-3 py-1.5">Item</th>
                  <th className="px-3 py-1.5 text-right">Qty</th>
                  <th className="px-3 py-1.5 text-right">Rate</th>
                  <th className="px-3 py-1.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map((li: LineItem, i: number) => (
                  <tr key={i} className="border-t border-[var(--border-subtle)]">
                    <td className="px-3 py-1.5">{li.description}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{li.qty}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmtINR(li.rate)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmtINR(li.amount)}</td>
                  </tr>
                ))}
                <tr className="border-t border-[var(--border-subtle)] text-[var(--text-secondary)]">
                  <td colSpan={3} className="px-3 py-1.5 text-right">GST {invoice.gstPercent}%</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtINR(invoice.taxAmount ?? 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Actions row */}
        <div className="flex items-center gap-2 mb-5">
          {invoice.status === "draft" && (
            <button
              onClick={() => act(() => finalize({ invoiceId: invoice._id }), "Invoice finalized — now unpaid")}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-[var(--accent-admin)] text-white text-[12px] font-semibold disabled:opacity-40"
            >
              Finalize invoice
            </button>
          )}
          {invoice.source === "generated" && (
            <a
              href={`/print/invoice/${invoice._id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-[var(--border)] text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            >
              <Printer className="h-3.5 w-3.5" /> Print / PDF
            </a>
          )}
          {invoice.pdfUrl && (
            <a
              href={invoice.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-[var(--border)] text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            >
              <ExternalLink className="h-3.5 w-3.5" /> View PDF
            </a>
          )}
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-red-50 text-red-600 text-[12px] font-semibold hover:bg-red-100 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>

        {/* Payments */}
        <h4 className="font-medium text-[12px] uppercase tracking-wide text-[var(--text-secondary)] mb-2">
          Payments ({invoice.payments.length})
        </h4>
        {invoice.payments.length > 0 && (
          <div className="mb-3 space-y-1.5">
            {invoice.payments.map((p: any) => (
              <div
                key={p._id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--bg-hover)] text-[12px]"
              >
                <Banknote className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span className="font-semibold tabular-nums">{fmtINR(p.amount)}</span>
                <span className="text-[var(--text-muted)]">{fmtDate(p.paidOn)}</span>
                {p.method && <span className="text-[var(--text-muted)]">{p.method}</span>}
                {p.reference && <span className="text-[var(--text-muted)] truncate">Ref: {p.reference}</span>}
                <button
                  onClick={() => act(() => deletePayment({ paymentId: p._id }), "Payment removed")}
                  disabled={busy}
                  className="ml-auto p-1 rounded text-[var(--text-muted)] hover:text-[var(--danger)]"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {invoice.status !== "draft" ? (
          <div className="grid grid-cols-[110px_1fr_1fr_1fr_auto] gap-2 items-end">
            <div>
              <label className={labelCls}>Amount (₹)</label>
              <input type="number" min={0} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Date</label>
              <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Method</label>
              <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className={inputCls + " appearance-none cursor-pointer"}>
                {["Bank transfer", "UPI", "Cheque", "Cash", "Other"].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Reference (optional)</label>
              <input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="UTR / cheque no." className={inputCls} />
            </div>
            <button
              onClick={async () => {
                const amt = Number(payAmount);
                if (!amt || amt <= 0) {
                  toast("error", "Enter a payment amount");
                  return;
                }
                await act(
                  () =>
                    recordPayment({
                      invoiceId: invoice._id,
                      amount: amt,
                      paidOn: fromDateInput(payDate) ?? Date.now(),
                      method: payMethod,
                      reference: payRef.trim() || undefined,
                    }),
                  "Payment recorded"
                );
                setPayAmount("");
                setPayRef("");
              }}
              disabled={busy}
              className="px-3 py-2 rounded-md bg-[var(--accent-admin)] text-white text-[12px] font-semibold disabled:opacity-40 whitespace-nowrap"
            >
              Record
            </button>
          </div>
        ) : (
          <p className="text-[12px] text-[var(--text-muted)]">
            Finalize the invoice to start recording payments.
          </p>
        )}

        <ConfirmModal
          open={confirmDelete}
          title="Delete invoice?"
          message={
            invoice.payments.length > 0
              ? `This also deletes ${invoice.payments.length} recorded payment${invoice.payments.length === 1 ? "" : "s"} totalling ${fmtINR(invoice.amountPaid)}.${invoice.quotation ? " The linked quotation reverts to approved." : ""}`
              : invoice.quotation
                ? "The linked quotation reverts to approved so it can be re-invoiced."
                : "This permanently removes the invoice."
          }
          variant="danger"
          confirmLabel="Delete"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await act(() => deleteInvoice({ invoiceId: invoice._id }), "Invoice deleted");
            setConfirmDelete(false);
            onClose();
          }}
        />
      </Card>
    </div>
  );
}

/* ─── Agency profile modal ─── */

function AgencyProfileModal({
  profile,
  onClose,
  toast,
}: {
  profile: any;
  onClose: () => void;
  toast: (t: any, m: string) => void;
}) {
  const save = useMutation(api.agencyProfile.saveAgencyProfile);
  const [form, setForm] = useState({
    name: profile?.name ?? "",
    address: (profile?.addressLines ?? []).join("\n"),
    gstin: profile?.gstin ?? "",
    email: profile?.email ?? "",
    phone: profile?.phone ?? "",
    bankName: profile?.bankName ?? "",
    accountName: profile?.accountName ?? "",
    accountNumber: profile?.accountNumber ?? "",
    ifsc: profile?.ifsc ?? "",
    upiId: profile?.upiId ?? "",
    invoicePrefix: profile?.invoicePrefix ?? "INV-",
    nextInvoiceNumber: profile?.nextInvoiceNumber ?? 1,
    quotePrefix: profile?.quotePrefix ?? "QTN-",
    nextQuoteNumber: profile?.nextQuoteNumber ?? 1,
    defaultGstPercent: profile?.defaultGstPercent ?? 18,
    termsNote: profile?.termsNote ?? "",
  });
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast("error", "Agency name is required");
      return;
    }
    setSaving(true);
    try {
      await save({
        name: form.name.trim(),
        addressLines: form.address
          .split("\n")
          .map((l: string) => l.trim())
          .filter(Boolean),
        gstin: form.gstin.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        bankName: form.bankName.trim() || undefined,
        accountName: form.accountName.trim() || undefined,
        accountNumber: form.accountNumber.trim() || undefined,
        ifsc: form.ifsc.trim() || undefined,
        upiId: form.upiId.trim() || undefined,
        invoicePrefix: form.invoicePrefix,
        nextInvoiceNumber: Number(form.nextInvoiceNumber) || 1,
        quotePrefix: form.quotePrefix,
        nextQuoteNumber: Number(form.nextQuoteNumber) || 1,
        defaultGstPercent: Number(form.defaultGstPercent) || 0,
        termsNote: form.termsNote.trim() || undefined,
      });
      toast("success", "Agency profile saved");
      onClose();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to save");
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-[16px] text-[var(--text-primary)]">Agency profile</h3>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>Agency name</label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Address (one line per row)</label>
            <textarea
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              rows={2}
              className={inputCls + " resize-none"}
            />
          </div>
          <div>
            <label className={labelCls}>GSTIN</label>
            <input value={form.gstin} onChange={(e) => set("gstin", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Default GST %</label>
            <input
              type="number"
              value={form.defaultGstPercent}
              onChange={(e) => set("defaultGstPercent", Number(e.target.value))}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} />
          </div>

          <div className="col-span-2 border-t border-[var(--border-subtle)] pt-3 mt-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">
              Bank details (shown on generated documents)
            </p>
          </div>
          <div>
            <label className={labelCls}>Bank name</label>
            <input value={form.bankName} onChange={(e) => set("bankName", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Account name</label>
            <input value={form.accountName} onChange={(e) => set("accountName", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Account number</label>
            <input value={form.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>IFSC</label>
            <input value={form.ifsc} onChange={(e) => set("ifsc", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>UPI ID</label>
            <input value={form.upiId} onChange={(e) => set("upiId", e.target.value)} className={inputCls} />
          </div>

          <div className="col-span-2 border-t border-[var(--border-subtle)] pt-3 mt-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">
              Document numbering
            </p>
          </div>
          <div>
            <label className={labelCls}>Invoice prefix</label>
            <input value={form.invoicePrefix} onChange={(e) => set("invoicePrefix", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Next invoice #</label>
            <input
              type="number"
              value={form.nextInvoiceNumber}
              onChange={(e) => set("nextInvoiceNumber", Number(e.target.value))}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Quotation prefix</label>
            <input value={form.quotePrefix} onChange={(e) => set("quotePrefix", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Next quotation #</label>
            <input
              type="number"
              value={form.nextQuoteNumber}
              onChange={(e) => set("nextQuoteNumber", Number(e.target.value))}
              className={inputCls}
            />
          </div>
          {profile && (
            <p className="col-span-2 text-[11px] text-amber-700">
              Changing counters can create duplicate document numbers — only lower them if you know why.
            </p>
          )}

          <div className="col-span-2">
            <label className={labelCls}>Terms note (printed at the bottom of documents)</label>
            <textarea
              value={form.termsNote}
              onChange={(e) => set("termsNote", e.target.value)}
              rows={2}
              className={inputCls + " resize-none"}
              placeholder="e.g. 50% advance, balance on delivery. Payment within 15 days."
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md border border-[var(--border)] text-[13px] font-medium text-[var(--text-secondary)]"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[var(--accent-admin)] text-white text-[13px] font-semibold disabled:opacity-40"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save profile
          </button>
        </div>
      </Card>
    </div>
  );
}
