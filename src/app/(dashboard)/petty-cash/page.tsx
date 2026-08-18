"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  PageHeader,
  Button,
  Card,
  Input,
  Select,
  Textarea,
  Modal,
  ConfirmModal,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  SkeletonPageHeader,
  SkeletonCards,
  useToast,
} from "@/components/ui";
import {
  Wallet,
  Plus,
  Pencil,
  Trash2,
  Search,
  ChevronDown,
  ChevronRight,
  Undo2,
} from "lucide-react";
import {
  type Disbursement,
  computeTotals,
  distinctNames,
  formatGivenDate,
  groupByAllocator,
  groupByMonth,
  money,
  remainderOf,
  statusOf,
  todayISO,
  STATUS_META,
} from "@/lib/pettyCash";

/** Blank-safe number parse: an empty amount field means zero, not NaN. */
function num(s: string): number {
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

// ── Add / edit form ───────────────────────────────────────────────

type FormState = {
  allocator: string;
  giver: string;
  recipient: string;
  amountAllocated: string;
  amountGiven: string;
  amountSpent: string;
  givenDate: string;
  notes: string;
};

function emptyForm(): FormState {
  return {
    allocator: "",
    giver: "",
    recipient: "",
    amountAllocated: "",
    amountGiven: "",
    amountSpent: "",
    givenDate: todayISO(),
    notes: "",
  };
}

function formFrom(d: Disbursement): FormState {
  return {
    allocator: d.allocator,
    giver: d.giver,
    recipient: d.recipient,
    amountAllocated: d.amountAllocated ? String(d.amountAllocated) : "",
    amountGiven: String(d.amountGiven),
    amountSpent: d.amountSpent ? String(d.amountSpent) : "",
    givenDate: d.givenDate,
    notes: d.notes ?? "",
  };
}

/**
 * A text input with suggestions from names already in the ledger. Free text is
 * the point — half the people in a petty-cash record don't have a login here.
 */
function NameField({
  label,
  value,
  onChange,
  suggestions,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder: string;
}) {
  const listId = `pc-${label.toLowerCase()}`;
  return (
    <>
      <Input
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        list={listId}
        autoComplete="off"
      />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}

function DisbursementForm({
  editing,
  all,
  onClose,
}: {
  editing: Disbursement | null;
  all: Disbursement[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const create = useMutation(api.pettyCash.createDisbursement);
  const update = useMutation(api.pettyCash.updateDisbursement);
  const [form, setForm] = useState<FormState>(
    editing ? formFrom(editing) : emptyForm()
  );
  const [saving, setSaving] = useState(false);

  const set = (k: keyof FormState) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const remainder = num(form.amountGiven) - num(form.amountSpent);
  const valid =
    form.allocator.trim() &&
    form.giver.trim() &&
    form.recipient.trim() &&
    form.givenDate;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      const payload = {
        allocator: form.allocator,
        giver: form.giver,
        recipient: form.recipient,
        amountAllocated: num(form.amountAllocated),
        amountGiven: num(form.amountGiven),
        amountSpent: num(form.amountSpent),
        givenDate: form.givenDate,
        notes: form.notes,
      };
      if (editing) {
        await update({ id: editing._id as Id<"disbursements">, ...payload });
        toast("success", "Disbursement updated");
      } else {
        await create(payload);
        toast("success", "Disbursement recorded");
      }
      onClose();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Edit disbursement" : "Record a disbursement"}
      icon={Wallet}
      size="md"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="petty-cash-form"
            loading={saving}
            disabled={!valid}
          >
            {editing ? "Save changes" : "Record"}
          </Button>
        </>
      }
    >
      <form id="petty-cash-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Ordered the way the cash actually moves, so the form reads as the
            story of one handoff rather than a bag of fields. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NameField
            label="Allocator"
            value={form.allocator}
            onChange={set("allocator")}
            suggestions={distinctNames(all, "allocator")}
            placeholder="Who released the money"
          />
          <Input
            label="Amount allocated (₹)"
            type="number"
            min="0"
            value={form.amountAllocated}
            onChange={(e) => set("amountAllocated")(e.target.value)}
            placeholder="Optional"
          />
          <NameField
            label="Giver"
            value={form.giver}
            onChange={set("giver")}
            suggestions={distinctNames(all, "giver")}
            placeholder="Who handed out the cash"
          />
          <Input
            label="Amount given (₹)"
            type="number"
            min="0"
            value={form.amountGiven}
            onChange={(e) => set("amountGiven")(e.target.value)}
            placeholder="0"
          />
          <NameField
            label="Recipient"
            value={form.recipient}
            onChange={set("recipient")}
            suggestions={distinctNames(all, "recipient")}
            placeholder="Who received it"
          />
          <Input
            label="Amount spent (₹)"
            type="number"
            min="0"
            value={form.amountSpent}
            onChange={(e) => set("amountSpent")(e.target.value)}
            placeholder="0"
          />
          <Input
            label="Given date"
            type="date"
            value={form.givenDate}
            onChange={(e) => set("givenDate")(e.target.value)}
          />
          <div className="flex flex-col justify-end pb-1">
            {/* The number people actually argue about, shown before they save
                rather than discovered on the list afterwards. */}
            <span className="text-[12px] text-[var(--text-muted)]">Remainder</span>
            <span
              className={`text-[15px] font-semibold tabular-nums ${
                remainder > 0
                  ? "text-[var(--accent-admin-text)]"
                  : "text-[var(--text-primary)]"
              }`}
            >
              {money(remainder)}
            </span>
          </div>
        </div>
        <Textarea
          label="Notes"
          value={form.notes}
          onChange={(e) => set("notes")(e.target.value)}
          placeholder="What is this cash for?"
          rows={2}
        />
      </form>
    </Modal>
  );
}

// ── Totals ────────────────────────────────────────────────────────

function TotalsRow({ items }: { items: Disbursement[] }) {
  const t = computeTotals(items);
  const cells: { label: string; value: number; hint: string; strong?: boolean }[] = [
    { label: "Allocated", value: t.allocated, hint: "released by allocators" },
    { label: "Handed off", value: t.handedOff, hint: "given to recipients" },
    { label: "Spent", value: t.spent, hint: "accounted for" },
    {
      label: "Outstanding",
      value: t.outstanding,
      hint: "still to come back",
      strong: true,
    },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cells.map((c) => (
        <Card key={c.label} className="p-4">
          <div className="text-[12px] font-medium text-[var(--text-muted)]">
            {c.label}
          </div>
          <div
            className={`mt-1 text-[22px] font-semibold tabular-nums ${
              c.strong && c.value > 0
                ? "text-[var(--accent-admin-text)]"
                : "text-[var(--text-primary)]"
            }`}
          >
            {money(c.value)}
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">{c.hint}</div>
        </Card>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────

export default function PettyCashPage() {
  const { toast } = useToast();
  const rows = useQuery(api.pettyCash.listDisbursements);
  const update = useMutation(api.pettyCash.updateDisbursement);
  const remove = useMutation(api.pettyCash.deleteDisbursement);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Disbursement | null>(null);
  const [deleting, setDeleting] = useState<Disbursement | null>(null);
  const [allocatorFilter, setAllocatorFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const all = (rows ?? []) as unknown as Disbursement[];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((d) => {
      if (allocatorFilter && d.allocator !== allocatorFilter) return false;
      if (statusFilter && statusOf(d) !== statusFilter) return false;
      if (
        q &&
        ![d.allocator, d.giver, d.recipient, d.notes ?? ""].some((f) =>
          f.toLowerCase().includes(q)
        )
      )
        return false;
      return true;
    });
  }, [all, allocatorFilter, statusFilter, search]);

  const allocators = useMemo(() => groupByAllocator(all), [all]);
  const months = useMemo(() => groupByMonth(filtered), [filtered]);
  const filtersOn = !!(allocatorFilter || statusFilter || search.trim());

  function toggleMonth(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function toggleReturned(d: Disbursement) {
    try {
      await update({
        id: d._id as Id<"disbursements">,
        remainderReturned: !d.remainderReturned,
      });
      toast(
        "success",
        d.remainderReturned ? "Marked as not returned" : "Remainder returned"
      );
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not update");
    }
  }

  if (rows === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <SkeletonPageHeader />
        <SkeletonCards />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Petty Cash"
        subtitle="Cash moving from allocator to giver to recipient, and what's still out"
        icon={Wallet}
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Record disbursement
          </Button>
        }
      />

      <TotalsRow items={filtered} />

      {/* Allocator strip — the first question anyone asks is "whose money",
          so it doubles as the filter rather than sitting as a separate page. */}
      {allocators.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            By allocator
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {allocators.map((a) => {
              const active = allocatorFilter === a.name;
              return (
                <Card
                  key={a.name}
                  hover
                  onClick={() =>
                    setAllocatorFilter(active ? "" : a.name)
                  }
                  className={`p-4 cursor-pointer ${
                    active ? "border-[var(--border-strong)]" : ""
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-[14px] text-[var(--text-primary)] truncate">
                      {a.name}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">
                      {a.count} {a.count === 1 ? "record" : "records"}
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-3 text-[12px] text-[var(--text-muted)]">
                    <span>
                      Allocated{" "}
                      <span className="text-[var(--text-primary)] tabular-nums">
                        {money(a.totals.allocated)}
                      </span>
                    </span>
                    <span>
                      Outstanding{" "}
                      <span
                        className={`tabular-nums ${
                          a.totals.outstanding > 0
                            ? "text-[var(--accent-admin-text)] font-medium"
                            : "text-[var(--text-primary)]"
                        }`}
                      >
                        {money(a.totals.outstanding)}
                      </span>
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people or notes"
            className="pl-9"
          />
        </div>
        {/* Not Select's `placeholder` — it renders a DISABLED option, so
            picking a filter would leave no way back to "all". */}
        <Select
          value={allocatorFilter}
          onChange={(e) => setAllocatorFilter(e.target.value)}
          options={[
            { value: "", label: "All allocators" },
            ...allocators.map((a) => ({ value: a.name, label: a.name })),
          ]}
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "", label: "All statuses" },
            ...Object.entries(STATUS_META).map(([value, m]) => ({
              value,
              label: m.label,
            })),
          ]}
        />
        {filtersOn && (
          <Button
            variant="secondary"
            onClick={() => {
              setAllocatorFilter("");
              setStatusFilter("");
              setSearch("");
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* Month groups */}
      {months.length === 0 ? (
        <Card className="p-10 flex flex-col items-center gap-2 text-center">
          <Wallet className="h-6 w-6 text-[var(--text-muted)]" />
          <div className="font-medium text-[14px] text-[var(--text-primary)]">
            {filtersOn ? "Nothing matches those filters" : "No disbursements yet"}
          </div>
          <div className="text-[13px] text-[var(--text-muted)]">
            {filtersOn
              ? "Clear the filters to see the whole ledger."
              : "Record the first one and the totals above start working."}
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {months.map((m) => {
            const open = !collapsed.has(m.key);
            return (
              <div
                key={m.key}
                className="rounded-lg border border-[var(--border)] bg-white overflow-hidden"
              >
                <div
                  className="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
                  onClick={() => toggleMonth(m.key)}
                >
                  {open ? (
                    <ChevronDown className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                  )}
                  <span className="font-medium text-[13px] text-[var(--text-primary)]">
                    {m.label}
                  </span>
                  <span className="text-[12px] text-[var(--text-muted)] tabular-nums">
                    {m.items.length}{" "}
                    {m.items.length === 1 ? "record" : "records"}
                  </span>
                  <div className="ml-auto flex items-center gap-4 text-[12px] tabular-nums">
                    <span className="text-[var(--text-muted)]">
                      Given{" "}
                      <span className="text-[var(--text-primary)]">
                        {money(m.totals.handedOff)}
                      </span>
                    </span>
                    {m.totals.outstanding > 0 && (
                      <span className="font-medium text-[var(--accent-admin-text)]">
                        {money(m.totals.outstanding)} out
                      </span>
                    )}
                  </div>
                </div>

                {open && (
                  <div className="border-t border-[var(--border)] overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Allocator</TableHead>
                          <TableHead>Giver → Recipient</TableHead>
                          <TableHead className="text-right">Given</TableHead>
                          <TableHead className="text-right">Spent</TableHead>
                          <TableHead className="text-right">Remainder</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {m.items.map((d) => {
                          const s = STATUS_META[statusOf(d)];
                          const rem = remainderOf(d);
                          return (
                            <TableRow key={d._id}>
                              <TableCell>
                                <span className="text-[12px] text-[var(--text-secondary)] whitespace-nowrap">
                                  {formatGivenDate(d.givenDate)}
                                </span>
                              </TableCell>
                              <TableCell>{d.allocator}</TableCell>
                              <TableCell>
                                <span className="text-[13px]">
                                  {d.giver}{" "}
                                  <span className="text-[var(--text-muted)]">→</span>{" "}
                                  {d.recipient}
                                </span>
                                {d.notes && (
                                  <div className="text-[11px] text-[var(--text-muted)] truncate max-w-[280px]">
                                    {d.notes}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {money(d.amountGiven)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {money(d.amountSpent)}
                              </TableCell>
                              <TableCell
                                className={`text-right tabular-nums ${
                                  !d.remainderReturned && rem > 0
                                    ? "text-[var(--accent-admin-text)] font-medium"
                                    : ""
                                }`}
                              >
                                {money(rem)}
                              </TableCell>
                              <TableCell>
                                <StatusBadge color={s.color} label={s.label} />
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1 justify-end">
                                  <button
                                    onClick={() => toggleReturned(d)}
                                    title={
                                      d.remainderReturned
                                        ? "Mark as not returned"
                                        : "Mark remainder returned"
                                    }
                                    className="p-1.5 rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
                                  >
                                    <Undo2 className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditing(d);
                                      setFormOpen(true);
                                    }}
                                    title="Edit"
                                    className="p-1.5 rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setDeleting(d)}
                                    title="Delete"
                                    className="p-1.5 rounded-md text-[var(--text-muted)] hover:bg-[var(--danger-dim)] hover:text-[var(--danger)] transition-colors"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {formOpen && (
        <DisbursementForm
          editing={editing}
          all={all}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
        />
      )}

      <ConfirmModal
        open={!!deleting}
        title="Delete this disbursement?"
        message={
          deleting
            ? `${deleting.giver} → ${deleting.recipient}, ${money(deleting.amountGiven)} on ${formatGivenDate(deleting.givenDate)}. This can't be undone.`
            : ""
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove({ id: deleting._id as Id<"disbursements"> });
            toast("success", "Disbursement deleted");
          } catch (err) {
            toast("error", err instanceof Error ? err.message : "Could not delete");
          } finally {
            setDeleting(null);
          }
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
