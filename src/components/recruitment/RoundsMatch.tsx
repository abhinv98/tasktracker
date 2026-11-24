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
import { openRound, takes, type TeamRule } from "@/convex/lib/rounds";
import { OpenRoundModal } from "./OpenRound";
import { boardValue, type HrData } from "./hrShared";

const str = (row: Row, key: string) => String(row.fields[key] ?? "");
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Hiring rounds still running that are tied to no position. */
export const looseRounds = (data: HrData) =>
  data.book.rounds.filter((r) => !r.fields.job && !str(r, "hiringStatus").startsWith("Closed")).sort((a, b) => a.code.localeCompare(b.code));

const CLOSED = ["Joined", "Rejected", "Withdrawn", "On Hold"];

/** Live candidates in no round yet, each with the positions whose rounds could take them, nearest first. */
function loosePeople(data: HrData) {
  return data.book.pipeline.flatMap((r) => {
    const at = boardValue(r);
    if (r.fields.reqId || !r.fields.job || at === null || CLOSED.includes(at)) return [];
    const job = str(r, "job");
    const role = data.jobs.find((j) => j.parent === job && same(j.name, str(r, "roleOriginal")))?.id;
    const order = [role, job, data.jobs.find((j) => j.id === job)?.parent].map((x) => (x ? Number(x) : null));
    return [{ row: r, order, team: r.team || undefined }];
  });
}

/** The server's rule (convex/lib/rounds.ts), over what this screen knows. */
const ruleOf = (data: HrData): TeamRule => ({
  isTeam: (id) => data.teams.some((t) => t._id === id),
  teamsOf: (job) => ({ teams: data.jobs.find((j) => j.id === String(job))?.teams ?? [] }),
});

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
  // A role's round first, then a team's: their people are theirs before they are everyone's.
  const rule = ruleOf(data);
  /** Whose round it would be there. In a position that does not hire into its team, or says nothing about teams, everyone's. */
  const teamThere = (r: Row) => (data.jobs.find((j) => j.id === jobOf(r))?.teams?.includes(str(r, "team")) ? str(r, "team") : "");
  const rank = (r: Row) => Number(isRole(jobOf(r))) * 2 + Number(!!teamThere(r));
  const ready = loose.filter((r) => jobOf(r)).sort((a, b) => rank(b) - rank(a));
  // Tied in this order, who goes where: each person is taken once.
  const left = loosePeople(data);
  const open: [string, { fields: Record<string, unknown> }][] = data.book.rounds.filter((r) => str(r, "hiringStatus") === "Open" && r.fields.job).map((r) => [r._id, r]);
  const into = new Map<string, number>();
  for (const r of ready) {
    if (str(r, "hiringStatus") === "On Hold") continue;
    const tied: [string, { fields: Record<string, unknown> }] = [r._id, { fields: { ...r.fields, job: jobOf(r), hiringStatus: "Open" } }];
    const before = left.length;
    for (let i = left.length - 1; i >= 0; i--) if (takes(tied, open, left[i].order, left[i].team, rule)) left.splice(i, 1);
    into.set(r._id, before - left.length);
    open.push(tied);
  }
  // Whoever is still left has no round that would take them.
  const missing = data.jobs
    .filter((j) => !j.parent)
    .map((j) => ({ ...j, n: left.filter((p) => takes(["new", { fields: { job: j.id } }], open, p.order, p.team, rule) && !openRound(open, p.order, p.team, rule)).length }))
    .filter((j) => j.n > 0)
    .sort((a, b) => b.n - a.n);

  /** A round that has to be tied first (a role's, or a team's): until it is, this position's would take its people. */
  const before = (id: string, own?: Row) =>
    ready.find(
      (r) =>
        r !== own && str(r, "hiringStatus") !== "On Hold" &&
        (data.jobs.find((j) => j.id === jobOf(r))?.parent === id || (jobOf(r) === id && !!teamThere(r) && !(own && teamThere(own))))
    );

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
              const first = ready.find((x) => jobOf(x) === job && teamThere(x) === teamThere(r) && str(x, "hiringStatus") !== "On Hold");
              const n = into.get(r._id) ?? 0;
              const wait = job ? before(job, r) : undefined;
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
