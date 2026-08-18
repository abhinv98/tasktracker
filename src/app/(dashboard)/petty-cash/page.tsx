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
  ArrowDownLeft,
  HandCoins,
  Pencil,
  Trash2,
  Search,
  ChevronDown,
  ChevronRight,
  Undo2,
  CircleAlert,
} from "lucide-react";
import {
  type Allocation,
  type Handout,
  type Holder,
  computeTotals,
  distinctRecipients,
  formatDay,
  groupByHolder,
  groupByMonth,
  money,
  outstandingOf,
  returnedOf,
  spentOf,
  todayISO,
} from "@/lib/pettyCash";

/** Blank-safe parse: an empty amount field means zero, not NaN. */
function num(s: string): number {
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

// ── Allocation (float top-up) ─────────────────────────────────────

function AllocationModal({
  holders,
  onClose,
}: {
  holders: Holder[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const create = useMutation(api.pettyCash.createAllocation);
  const [holderId, setHolderId] = useState(holders[0]?._id ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const valid = holderId && num(amount) > 0 && date;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      await create({
        holderId: holderId as Id<"users">,
        amount: num(amount),
        date,
        note,
      });
      toast("success", "Float topped up");
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
      title="Allocate cash to a float"
      icon={ArrowDownLeft}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="pc-alloc" loading={saving} disabled={!valid}>
            Allocate
          </Button>
        </>
      }
    >
      <form id="pc-alloc" onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-[13px] text-[var(--text-secondary)]">
          Money going into someone&apos;s drawer. Handouts are drawn from this,
          and remainders come back into it.
        </p>
        <Select
          label="Held by"
          value={holderId}
          onChange={(e) => setHolderId(e.target.value)}
          options={holders.map((h) => ({ value: h._id, label: h.name }))}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Amount (₹)"
            type="number"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="14900"
          />
          <Input
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <Input
          label="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional — where this cash came from"
        />
      </form>
    </Modal>
  );
}

// ── Handout ───────────────────────────────────────────────────────

function HandoutModal({
  editing,
  holders,
  handouts,
  defaultHolderId,
  onClose,
}: {
  editing: Handout | null;
  holders: Holder[];
  handouts: Handout[];
  defaultHolderId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const create = useMutation(api.pettyCash.createDisbursement);
  const update = useMutation(api.pettyCash.updateDisbursement);
  const [holderId, setHolderId] = useState(
    editing?.holderId ?? defaultHolderId ?? holders[0]?._id ?? ""
  );
  const [recipient, setRecipient] = useState(editing?.recipient ?? "");
  const [purpose, setPurpose] = useState(editing?.purpose ?? "");
  const [amountGiven, setAmountGiven] = useState(
    editing ? String(editing.amountGiven) : ""
  );
  const [givenDate, setGivenDate] = useState(editing?.givenDate ?? todayISO());
  const [saving, setSaving] = useState(false);

  const valid =
    holderId && recipient.trim() && purpose.trim() && num(amountGiven) > 0 && givenDate;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      const payload = {
        holderId: holderId as Id<"users">,
        recipient,
        purpose,
        amountGiven: num(amountGiven),
        givenDate,
      };
      if (editing) {
        await update({ id: editing._id as Id<"disbursements">, ...payload });
        toast("success", "Handout updated");
      } else {
        await create(payload);
        toast("success", "Cash handed out");
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
      title={editing ? "Edit handout" : "Hand out cash"}
      icon={HandCoins}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="pc-handout" loading={saving} disabled={!valid}>
            {editing ? "Save changes" : "Hand out"}
          </Button>
        </>
      }
    >
      <form id="pc-handout" onSubmit={submit} className="flex flex-col gap-4">
        <Select
          label="From whose float"
          value={holderId}
          onChange={(e) => setHolderId(e.target.value)}
          options={holders.map((h) => ({ value: h._id, label: h.name }))}
        />
        <div>
          <Input
            label="Given to"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="Gaurav"
            list="pc-recipients"
            autoComplete="off"
          />
          <datalist id="pc-recipients">
            {distinctRecipients(handouts).map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>
        <Input
          label="What for"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder="Weekly ration"
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Amount (₹)"
            type="number"
            min="1"
            value={amountGiven}
            onChange={(e) => setAmountGiven(e.target.value)}
            placeholder="2000"
          />
          <Input
            label="Date"
            type="date"
            value={givenDate}
            onChange={(e) => setGivenDate(e.target.value)}
          />
        </div>
        <p className="text-[12px] text-[var(--text-muted)]">
          None of this counts as spent yet. It&apos;s settled when the remainder
          comes back with an account of what was bought.
        </p>
      </form>
    </Modal>
  );
}

// ── Settlement ────────────────────────────────────────────────────

function SettleModal({
  handout,
  onClose,
}: {
  handout: Handout;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const settle = useMutation(api.pettyCash.settleDisbursement);
  const [returned, setReturned] = useState("");
  const [spentOn, setSpentOn] = useState("");
  const [saving, setSaving] = useState(false);

  const returnedNum = num(returned);
  const spent = handout.amountGiven - returnedNum;
  const overReturn = returnedNum > handout.amountGiven;
  const valid = returned !== "" && !overReturn && spentOn.trim().length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      await settle({
        id: handout._id as Id<"disbursements">,
        amountReturned: returnedNum,
        spentOn,
      });
      toast("success", `${money(spent)} booked as spent`);
      onClose();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not settle");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Settle handout"
      icon={Undo2}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="pc-settle" loading={saving} disabled={!valid}>
            Settle
          </Button>
        </>
      }
    >
      <form id="pc-settle" onSubmit={submit} className="flex flex-col gap-4">
        <div className="rounded-lg bg-[var(--bg-hover)] px-4 py-3">
          <div className="text-[13px] text-[var(--text-secondary)]">
            <span className="font-medium text-[var(--text-primary)]">
              {handout.recipient}
            </span>{" "}
            took{" "}
            <span className="font-medium text-[var(--text-primary)] tabular-nums">
              {money(handout.amountGiven)}
            </span>{" "}
            for {handout.purpose} on {formatDay(handout.givenDate)}.
          </div>
        </div>

        <Input
          label="Remainder returned (₹)"
          type="number"
          min="0"
          max={handout.amountGiven}
          value={returned}
          onChange={(e) => setReturned(e.target.value)}
          placeholder="650"
          error={overReturn ? `Can't be more than ${money(handout.amountGiven)}` : undefined}
        />

        {/* Required, and stated as the reason the step exists. An unexplained
            settlement is the hole this page is here to close. */}
        <Textarea
          label="What was it spent on"
          value={spentOn}
          onChange={(e) => setSpentOn(e.target.value)}
          placeholder="Rice 5kg, atta 10kg, oil 2L, sugar 2kg"
          rows={3}
        />

        {/* The arithmetic, shown before they commit rather than discovered
            afterwards in the ledger. */}
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: "Handed out", value: handout.amountGiven },
            { label: "Returned", value: returnedNum },
            { label: "Spent", value: Math.max(0, spent) },
          ].map((c, i) => (
            <div
              key={c.label}
              className={`rounded-lg px-3 py-2 ${
                i === 2 ? "bg-[var(--accent-admin-dim)]" : "bg-[var(--bg-hover)]"
              }`}
            >
              <div className="text-[11px] text-[var(--text-muted)]">{c.label}</div>
              <div
                className={`text-[15px] font-semibold tabular-nums ${
                  i === 2 ? "text-[var(--accent-admin-text)]" : "text-[var(--text-primary)]"
                }`}
              >
                {money(c.value)}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[12px] text-[var(--text-muted)]">
          {money(returnedNum)} goes back into {handout.holderName}&apos;s float.
        </p>
      </form>
    </Modal>
  );
}

// ── Page ──────────────────────────────────────────────────────────

export default function PettyCashPage() {
  const { toast } = useToast();
  const data = useQuery(api.pettyCash.getLedger);
  const reopen = useMutation(api.pettyCash.reopenDisbursement);
  const removeHandout = useMutation(api.pettyCash.deleteDisbursement);
  const removeAllocation = useMutation(api.pettyCash.deleteAllocation);

  const [allocOpen, setAllocOpen] = useState(false);
  const [handoutOpen, setHandoutOpen] = useState(false);
  const [editing, setEditing] = useState<Handout | null>(null);
  const [settling, setSettling] = useState<Handout | null>(null);
  const [deleting, setDeleting] = useState<Handout | null>(null);
  const [deletingAlloc, setDeletingAlloc] = useState<Allocation | null>(null);
  const [holderFilter, setHolderFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showAllocations, setShowAllocations] = useState(false);

  const allocations = (data?.allocations ?? []) as unknown as Allocation[];
  const handouts = (data?.disbursements ?? []) as unknown as Handout[];
  const holders = (data?.holders ?? []) as unknown as Holder[];

  const totals = useMemo(
    () => computeTotals(allocations, handouts),
    [allocations, handouts]
  );
  const byHolder = useMemo(
    () => groupByHolder(allocations, handouts, holders),
    [allocations, handouts, holders]
  );
  const open = useMemo(
    () => handouts.filter((h) => !h.settled),
    [handouts]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return handouts.filter((h) => {
      if (holderFilter && h.holderId !== holderFilter) return false;
      if (statusFilter === "open" && h.settled) return false;
      if (statusFilter === "settled" && !h.settled) return false;
      if (
        q &&
        ![h.recipient, h.purpose, h.spentOn ?? "", h.holderName].some((f) =>
          f.toLowerCase().includes(q)
        )
      )
        return false;
      return true;
    });
  }, [handouts, holderFilter, statusFilter, search]);

  const months = useMemo(() => groupByMonth(filtered), [filtered]);
  const filtersOn = !!(holderFilter || statusFilter || search.trim());

  function toggleMonth(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  if (data === undefined) {
    return (
      <div className="p-8 flex flex-col gap-4">
        <SkeletonPageHeader />
        <SkeletonCards />
      </div>
    );
  }

  const noHolders = holders.length === 0;

  return (
    <div className="p-8 flex flex-col gap-6">
      <PageHeader
        title="Petty Cash"
        subtitle="Floats held by HR and accounts, what's out with the office boys, and what it went on"
        icon={Wallet}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setAllocOpen(true)}>
              <ArrowDownLeft className="h-4 w-4" />
              Allocate
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setHandoutOpen(true);
              }}
              disabled={noHolders}
            >
              <Plus className="h-4 w-4" />
              Hand out cash
            </Button>
          </div>
        }
      />

      {/* The four numbers, in the order the money moves. "In hand" leads
          because it's the one you can check against the actual drawer. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: "In hand",
            value: totals.inHand,
            hint: "should be in the drawer",
            accent: true,
          },
          {
            label: "Out with office boys",
            value: totals.outstanding,
            hint: `${open.length} open ${open.length === 1 ? "handout" : "handouts"}`,
            warn: totals.outstanding > 0,
          },
          { label: "Spent", value: totals.spent, hint: "settled and explained" },
          {
            label: "Allocated",
            value: totals.allocated,
            hint: "put into floats so far",
          },
        ].map((c) => (
          <Card key={c.label} className="p-4">
            <div className="text-[12px] font-medium text-[var(--text-muted)]">
              {c.label}
            </div>
            <div
              className={`mt-1 text-[24px] font-semibold tabular-nums ${
                c.accent
                  ? "text-[var(--text-primary)]"
                  : c.warn
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

      {/* Awaiting settlement — the live obligation, above the history. */}
      {open.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <CircleAlert className="h-4 w-4 text-[var(--accent-admin-text)]" />
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">
              Awaiting settlement
            </span>
            <span className="text-[12px] text-[var(--text-muted)]">
              {money(totals.outstanding)} out with{" "}
              {new Set(open.map((h) => h.recipient)).size}{" "}
              {new Set(open.map((h) => h.recipient)).size === 1 ? "person" : "people"}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {open.map((h) => (
              <Card
                key={h._id}
                className="p-4 border-[var(--accent-admin)]/40 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-[14px] text-[var(--text-primary)] truncate">
                      {h.recipient}
                    </div>
                    <div className="text-[12px] text-[var(--text-muted)] truncate">
                      {h.purpose}
                    </div>
                  </div>
                  <div className="text-[18px] font-semibold tabular-nums text-[var(--accent-admin-text)] shrink-0">
                    {money(h.amountGiven)}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {formatDay(h.givenDate)} · from {h.holderName}
                  </span>
                  <Button onClick={() => setSettling(h)}>Settle</Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Per-holder balances — doubles as the holder filter. */}
      {byHolder.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Floats
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {byHolder.map((h) => {
              const active = holderFilter === h.holderId;
              return (
                <Card
                  key={h.holderId}
                  hover
                  onClick={() => setHolderFilter(active ? "" : h.holderId)}
                  className={`p-4 cursor-pointer ${
                    active ? "border-[var(--border-strong)]" : ""
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-[14px] text-[var(--text-primary)] truncate">
                      {h.name}
                    </span>
                    <span className="text-[16px] font-semibold tabular-nums text-[var(--text-primary)]">
                      {money(h.totals.inHand)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px] text-[var(--text-muted)]">
                    <span>
                      Allocated{" "}
                      <span className="text-[var(--text-secondary)] tabular-nums">
                        {money(h.totals.allocated)}
                      </span>
                    </span>
                    <span>
                      Spent{" "}
                      <span className="text-[var(--text-secondary)] tabular-nums">
                        {money(h.totals.spent)}
                      </span>
                    </span>
                    {h.totals.outstanding > 0 && (
                      <span className="text-[var(--accent-admin-text)] font-medium tabular-nums">
                        {money(h.totals.outstanding)} out
                      </span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search person, purpose or what it went on"
            className="pl-9"
          />
        </div>
        {/* Not Select's `placeholder` — it renders a DISABLED option, so
            picking a filter would leave no way back to "all". */}
        <div className="w-[180px] shrink-0">
          <Select
            value={holderFilter}
            onChange={(e) => setHolderFilter(e.target.value)}
            options={[
              { value: "", label: "All floats" },
              ...byHolder.map((h) => ({ value: h.holderId, label: h.name })),
            ]}
          />
        </div>
        <div className="w-[170px] shrink-0">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: "", label: "All handouts" },
              { value: "open", label: "Awaiting settlement" },
              { value: "settled", label: "Settled" },
            ]}
          />
        </div>
        {filtersOn && (
          <Button
            variant="secondary"
            onClick={() => {
              setHolderFilter("");
              setStatusFilter("");
              setSearch("");
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* Ledger */}
      {months.length === 0 ? (
        <Card className="p-10 flex flex-col items-center gap-2 text-center">
          <Wallet className="h-6 w-6 text-[var(--text-muted)]" />
          <div className="font-medium text-[14px] text-[var(--text-primary)]">
            {filtersOn
              ? "Nothing matches those filters"
              : allocations.length === 0
                ? "No float allocated yet"
                : "No cash handed out yet"}
          </div>
          <div className="text-[13px] text-[var(--text-muted)] max-w-md">
            {filtersOn
              ? "Clear the filters to see the whole ledger."
              : allocations.length === 0
                ? "Start with Allocate — put an amount into someone's float. Handouts are drawn from it."
                : "Hand out cash and it'll appear here until the remainder is settled."}
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {months.map((m) => {
            const isOpen = !collapsed.has(m.key);
            return (
              <div
                key={m.key}
                className="rounded-lg border border-[var(--border)] bg-white overflow-hidden"
              >
                <div
                  className="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
                  onClick={() => toggleMonth(m.key)}
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                  )}
                  <span className="font-medium text-[13px] text-[var(--text-primary)]">
                    {m.label}
                  </span>
                  <span className="text-[12px] text-[var(--text-muted)] tabular-nums">
                    {m.items.length}{" "}
                    {m.items.length === 1 ? "handout" : "handouts"}
                  </span>
                  <div className="ml-auto flex items-center gap-4 text-[12px] tabular-nums text-[var(--text-muted)]">
                    <span>
                      Given{" "}
                      <span className="text-[var(--text-primary)]">
                        {money(m.given)}
                      </span>
                    </span>
                    <span>
                      Spent{" "}
                      <span className="text-[var(--text-primary)]">
                        {money(m.spent)}
                      </span>
                    </span>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-[var(--border)] overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>To</TableHead>
                          <TableHead>For</TableHead>
                          <TableHead className="text-right">Given</TableHead>
                          <TableHead className="text-right">Returned</TableHead>
                          <TableHead className="text-right">Spent</TableHead>
                          <TableHead>Spent on</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {m.items.map((h) => (
                          <TableRow key={h._id}>
                            <TableCell>
                              <span className="text-[12px] text-[var(--text-secondary)] whitespace-nowrap">
                                {formatDay(h.givenDate)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="text-[13px]">{h.recipient}</div>
                              <div className="text-[11px] text-[var(--text-muted)]">
                                from {h.holderName}
                              </div>
                            </TableCell>
                            <TableCell>{h.purpose}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {money(h.amountGiven)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-[var(--text-secondary)]">
                              {h.settled ? money(returnedOf(h)) : "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {h.settled ? (
                                money(spentOf(h))
                              ) : (
                                <span className="text-[var(--accent-admin-text)] font-medium">
                                  {money(outstandingOf(h))} out
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {h.settled ? (
                                <span className="text-[12px] text-[var(--text-secondary)] line-clamp-2 max-w-[260px]">
                                  {h.spentOn}
                                </span>
                              ) : (
                                <button
                                  onClick={() => setSettling(h)}
                                  className="text-[12px] font-medium text-[var(--accent-admin-text)] hover:underline"
                                >
                                  Settle now
                                </button>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 justify-end">
                                {h.settled && (
                                  <button
                                    onClick={async () => {
                                      try {
                                        await reopen({
                                          id: h._id as Id<"disbursements">,
                                        });
                                        toast("success", "Handout reopened");
                                      } catch (err) {
                                        toast(
                                          "error",
                                          err instanceof Error
                                            ? err.message
                                            : "Could not reopen"
                                        );
                                      }
                                    }}
                                    title="Reopen — puts the cash back out"
                                    className="p-1.5 rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
                                  >
                                    <Undo2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    setEditing(h);
                                    setHandoutOpen(true);
                                  }}
                                  title="Edit"
                                  className="p-1.5 rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => setDeleting(h)}
                                  title="Delete"
                                  className="p-1.5 rounded-md text-[var(--text-muted)] hover:bg-[var(--danger-dim)] hover:text-[var(--danger)] transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Allocations — the other half of the arithmetic, folded away because
          it's consulted rather than worked. */}
      {allocations.length > 0 && (
        <div className="rounded-lg border border-[var(--border)] bg-white overflow-hidden">
          <div
            className="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
            onClick={() => setShowAllocations((v) => !v)}
          >
            {showAllocations ? (
              <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
            ) : (
              <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
            )}
            <span className="font-medium text-[13px] text-[var(--text-primary)]">
              Allocations
            </span>
            <span className="text-[12px] text-[var(--text-muted)] tabular-nums">
              {allocations.length} · {money(totals.allocated)} in total
            </span>
          </div>
          {showAllocations && (
            <div className="border-t border-[var(--border)] overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Held by</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allocations.map((a) => (
                    <TableRow key={a._id}>
                      <TableCell>
                        <span className="text-[12px] text-[var(--text-secondary)] whitespace-nowrap">
                          {formatDay(a.date)}
                        </span>
                      </TableCell>
                      <TableCell>{a.holderName}</TableCell>
                      <TableCell>
                        <span className="text-[12px] text-[var(--text-muted)]">
                          {a.note ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(a.amount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <button
                            onClick={() => setDeletingAlloc(a)}
                            title="Delete"
                            className="p-1.5 rounded-md text-[var(--text-muted)] hover:bg-[var(--danger-dim)] hover:text-[var(--danger)] transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {allocOpen && (
        <AllocationModal holders={holders} onClose={() => setAllocOpen(false)} />
      )}
      {handoutOpen && (
        <HandoutModal
          editing={editing}
          holders={holders}
          handouts={handouts}
          defaultHolderId={holderFilter}
          onClose={() => {
            setHandoutOpen(false);
            setEditing(null);
          }}
        />
      )}
      {settling && (
        <SettleModal handout={settling} onClose={() => setSettling(null)} />
      )}

      <ConfirmModal
        open={!!deleting}
        title="Delete this handout?"
        message={
          deleting
            ? `${money(deleting.amountGiven)} to ${deleting.recipient} for ${deleting.purpose}. The float goes back up by that amount. This can't be undone.`
            : ""
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await removeHandout({ id: deleting._id as Id<"disbursements"> });
            toast("success", "Handout deleted");
          } catch (err) {
            toast("error", err instanceof Error ? err.message : "Could not delete");
          } finally {
            setDeleting(null);
          }
        }}
        onCancel={() => setDeleting(null)}
      />

      <ConfirmModal
        open={!!deletingAlloc}
        title="Delete this allocation?"
        message={
          deletingAlloc
            ? `${money(deletingAlloc.amount)} held by ${deletingAlloc.holderName}. Their float drops by that amount, and can go negative if the cash is already handed out.`
            : ""
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={async () => {
          if (!deletingAlloc) return;
          try {
            await removeAllocation({
              id: deletingAlloc._id as Id<"pettyCashAllocations">,
            });
            toast("success", "Allocation deleted");
          } catch (err) {
            toast("error", err instanceof Error ? err.message : "Could not delete");
          } finally {
            setDeletingAlloc(null);
          }
        }}
        onCancel={() => setDeletingAlloc(null)}
      />
    </div>
  );
}
