"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Check, Plus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, EmptyState, useToast } from "@/components/ui";
import { fieldClass } from "@/components/ui/classes";
import type { Row } from "@/lib/hrHealth";
import { guessPosition } from "@/lib/recruitTeams";
import { OpenRoundModal, roundsFor } from "./OpenRound";
import { boardValue, type HrData } from "./hrShared";

const str = (row: Row, key: string) => String(row.fields[key] ?? "");
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Hiring rounds still running that are tied to no position. */
export const looseRounds = (data: HrData) =>
  data.book.rounds.filter((r) => !r.fields.job && !str(r, "hiringStatus").startsWith("Closed")).sort((a, b) => a.code.localeCompare(b.code));

const CLOSED = ["Joined", "Rejected", "Withdrawn", "On Hold"];

/**
 * Live candidates a round for this position would take in: in no round yet, and
 * nearest to it. Their role's round comes before their position's, and that one
 * before the one above (as placeInRound does). `taking` is what has a round.
 */
function waiting(data: HrData, id: string, taking: ReadonlySet<string>) {
  return data.book.pipeline.filter((r) => {
    const at = boardValue(r);
    if (r.fields.reqId || !r.fields.job || at === null || CLOSED.includes(at)) return false;
    const job = str(r, "job");
    const role = data.jobs.find((j) => j.parent === job && same(j.name, str(r, "roleOriginal")))?.id;
    const above = data.jobs.find((j) => j.id === job)?.parent;
    return [role, job, above].find((x) => !!x && (x === id || taking.has(x))) === id;
  }).length;
}

/** Puts people into hiring rounds: ties the ones that hang loose to their position, and says where a round is missing. */
export function RoundsMatch({ data }: { data: HrData }) {
  const save = useMutation(api.hrOps.save);
  const place = useMutation(api.hrOps.placeShortlisted);
  const { toast } = useToast();
  // What HR picked. Until then each round shows the likeliest position.
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState<{ sourceId: number; name: string } | null>(null);

  const loose = looseRounds(data);
  const jobOf = (r: Row) => picked[r._id] ?? guessPosition(str(r, "role"), data.jobs)?.id ?? "";
  const isRole = (id: string) => !!data.jobs.find((j) => j.id === id)?.parent;
  // A role's round first: its people are its own before they are the position's.
  const ready = loose.filter((r) => jobOf(r)).sort((a, b) => Number(isRole(jobOf(b))) - Number(isRole(jobOf(a))));
  /** Positions that have a round open, or are about to. */
  const taking = new Set([...data.book.rounds.filter((r) => str(r, "hiringStatus") === "Open").map((r) => str(r, "job")), ...ready.filter((r) => str(r, "hiringStatus") !== "On Hold").map(jobOf)]);
  taking.delete("");
  const missing = data.jobs
    // Not the ones a round above is about to be tied to.
    .filter((j) => !j.parent && roundsFor(data, Number(j.id)).length === 0 && !ready.some((r) => jobOf(r) === j.id))
    .map((j) => ({ ...j, n: waiting(data, j.id, taking) }))
    .filter((j) => j.n > 0)
    .sort((a, b) => b.n - a.n);

  /** A role's round that has to be tied before its position's: until it is, that one would take its people. */
  const before = (id: string) => ready.find((r) => str(r, "hiringStatus") !== "On Hold" && data.jobs.find((j) => j.id === jobOf(r))?.parent === id);

  async function tie(rounds: Row[]) {
    setBusy(true);
    let people = 0;
    let done = 0;
    try {
      for (const r of rounds) {
        const status = str(r, "hiringStatus");
        // A round that was waiting to be confirmed is confirmed by this; one on hold stays on hold.
        await save({
          tracker: "rounds",
          id: r._id as Id<"hrRecords">,
          fields: { job: jobOf(r), ...(status === "On Hold" || status === "Open" ? {} : { hiringStatus: "Open" }) },
        });
        if (status !== "On Hold") people += (await place({ roundId: r._id as Id<"hrRecords"> })).placed;
        done++;
      }
      toast("success", `${done === 1 ? `${rounds[0].code} is tied` : `${done} rounds are tied`}. ${people} ${people === 1 ? "candidate" : "candidates"} went in`);
    } catch (err) {
      toast("error", `${done ? `${done} tied, then: ` : ""}${err instanceof Error ? err.message : "Could not tie it"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Rounds tied to no position</h2>
            <p className="mt-0.5 max-w-[640px] text-[12px] text-[var(--text-muted)]">
              Nobody goes into these. Check the position and tie it: everyone already shortlisted for it goes in, and from then on whoever is
              shortlisted goes in by itself. A round that is still to be confirmed is opened by it.
            </p>
          </div>
          {ready.length > 1 && (
            <Button loading={busy} onClick={() => void tie(ready)}>
              <Check size={14} />
              Tie all {ready.length}
            </Button>
          )}
        </div>
        {loose.length === 0 ? (
          <EmptyState title="Every round has its position" description="Shortlisted people go into the open round of their position by themselves." />
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border)] bg-white">
            {loose.map((r) => {
              const job = jobOf(r);
              const first = ready.find((x) => jobOf(x) === job && str(x, "hiringStatus") !== "On Hold");
              const n = job ? waiting(data, job, taking) : 0;
              const wait = before(job);
              const takes = !job
                ? ""
                : wait
                  ? `tie ${wait.code} first`
                : str(r, "hiringStatus") === "On Hold"
                  ? "on hold, nobody goes in"
                  : first && first._id !== r._id
                    ? `they go into ${first.code}`
                    : n
                      ? `${n} would go in`
                      : "nobody waiting";
              return (
                <li key={r._id} className="grid items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:grid-cols-[1fr_240px_150px_auto]">
                  <span className="min-w-0 truncate text-[13px] text-[var(--text-primary)]">
                    <span className="tabular-nums text-[var(--text-muted)]">{r.code}</span> {str(r, "role")}
                    <span className="block text-[12px] text-[var(--text-muted)]">
                      {[str(r, "hiringStatus"), r.fields.openings && `${r.fields.openings} to hire`].filter(Boolean).join(", ")}
                    </span>
                  </span>
                  <select
                    value={job}
                    disabled={busy}
                    onChange={(e) => setPicked((p) => ({ ...p, [r._id]: e.target.value }))}
                    aria-label={`Position for ${r.code}`}
                    className={`${fieldClass} w-full`}
                  >
                    <option value="">Choose a position</option>
                    {data.jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-[12px] tabular-nums text-[var(--text-secondary)]">{takes}</span>
                  <Button variant="secondary" disabled={!job || !!wait || busy} aria-label={`Tie ${r.code}`} onClick={() => void tie([r])}>
                    Tie
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {missing.length > 0 && (
        <section>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Shortlisted, with no round open</h2>
          <p className="mb-2 mt-0.5 text-[12px] text-[var(--text-muted)]">Open a round for a position and these people can go straight in.</p>
          <ul className="divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border)] bg-white">
            {missing.map((j) => (
              <li key={j.id} className="flex items-center gap-3 px-4 py-2">
                <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-primary)] first-letter:uppercase">{j.name}</span>
                <span className="text-[12px] tabular-nums text-[var(--text-secondary)]">{before(j.id) ? `${j.n} waiting, tie ${before(j.id)!.code} first` : `${j.n} waiting`}</span>
                <Button variant="secondary" disabled={!!before(j.id)} aria-label={`Open a round for ${j.name}`} onClick={() => setOpening({ sourceId: Number(j.id), name: j.name })}>
                  <Plus size={14} />
                  Open a round
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {opening && <OpenRoundModal data={data} job={opening} onClose={() => setOpening(null)} />}
    </div>
  );
}
