"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button, EmptyState, PageHeader, SkeletonPageHeader, SkeletonTable, useConfirm, useToast } from "@/components/ui";
import { STANDARD } from "@/convex/lib/hirePipeline";
import { PipelineEditor } from "@/components/recruitment/PipelineSetup";
import { PositionEditor } from "@/components/recruitment/PositionSetup";
import { movedNote, type Position } from "@/components/recruitment/setupShared";
import { RoundsMatch, looseRounds } from "@/components/recruitment/RoundsMatch";
import { useHrData } from "@/components/recruitment/hrShared";

/**
 * Positions and pipelines. A position is on the website's application form when
 * it is open here; a pipeline is the steps its people go through, picked for a
 * position or for one hiring round. What is open sits in the address:
 * ?job=7, ?pipeline=standard, ?rounds=1, ?new=position, ?new=pipeline&from=<key>&for=<position>.
 */
export default function SetupPage() {
  return (
    <Suspense>
      <Setup />
    </Suspense>
  );
}

const LEAVE = { title: "Leave without saving?", message: "What you changed here is not saved yet.", confirmLabel: "Leave" };

function Setup() {
  const params = useSearchParams();
  const router = useRouter();
  const setup = useQuery(api.recruitSetup.overview);
  const hr = useHrData();
  const restore = useMutation(api.recruitSetup.restorePosition);
  const setPipeline = useMutation(api.recruitSetup.setPipeline);
  const askConfirm = useConfirm();
  const { toast } = useToast();
  const [dirty, setDirty] = useState(false);
  // Leaving for what is already open still has to drop the draft: a new key does.
  const [visit, setVisit] = useState(0);
  const editor = useRef<HTMLDivElement>(null);
  const at = params.toString();

  // Where the list sits above the editor, opening something brings it into view.
  useEffect(() => {
    if (at && window.innerWidth < 1024) editor.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [at]);

  // Unsaved changes also ask before a link, a reload or a closed tab takes them.
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    const onClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || link.origin !== location.origin) return;
      e.preventDefault();
      e.stopPropagation();
      askConfirm({
        ...LEAVE,
        onConfirm: () => {
          setDirty(false);
          setVisit((n) => n + 1);
          router.push(link.pathname + link.search);
        },
      });
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, askConfirm, router]);

  if (setup === null) {
    return (
      <div className="p-4 sm:p-8">
        <EmptyState title="Setup is for HR" description="HR and super admins set up positions and hiring pipelines." />
      </div>
    );
  }
  if (setup === undefined || !hr) {
    return (
      <div className="p-4 sm:p-8">
        <SkeletonPageHeader />
        <SkeletonTable rows={8} cols={3} what="positions" />
      </div>
    );
  }

  /** Open something else. Unsaved changes ask first. */
  const go = (to: string, force = false) => {
    const open = () => {
      setDirty(false);
      router.push(`/recruitment/setup${to}`);
    };
    if (!dirty || force) return open();
    askConfirm({
      ...LEAVE,
      onConfirm: () => {
        setVisit((n) => n + 1);
        open();
      },
    });
  };

  const live = setup.positions.filter((p) => !p.removed);
  const removed = setup.positions.filter((p) => p.removed);
  const job = live.find((p) => String(p.id) === params.get("job"));
  const making = params.get("new");
  const matching = params.get("rounds") === "1" && !job && !making;
  const loose = looseRounds(hr).length;
  const forPosition = live.find((p) => String(p.id) === params.get("for"));
  const from = setup.pipelines.find((p) => p.key === params.get("from")) ?? setup.pipelines[0];
  const pipeline = job || making || matching ? undefined : (setup.pipelines.find((p) => p.key === params.get("pipeline")) ?? setup.pipelines[0]);
  const gone = params.get("job") && !job ? "position" : params.get("pipeline") && pipeline && pipeline.key !== params.get("pipeline") ? "pipeline" : null;

  // A position, then the roles under it.
  const roots = live.filter((p) => p.parent === null || !live.some((x) => x.id === p.parent));
  const item = (on: boolean) =>
    `flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-admin)] ${
      on ? "bg-[var(--accent-admin-dim)] font-medium text-[var(--accent-admin-text)]" : "text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
    }`;
  const line = (p: Position, nested: boolean) => {
    const closed = !p.open || (p.parent !== null && live.find((x) => x.id === p.parent)?.open === false);
    return (
      <li key={p.id}>
        <button type="button" aria-current={job?.id === p.id ? "true" : undefined} onClick={() => go(`?job=${p.id}`)} className={`${item(job?.id === p.id)} ${nested ? "pl-7" : ""}`}>
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${closed ? "bg-[var(--text-disabled)]" : "bg-[var(--accent-employee)]"}`}
            title={closed ? "Not on the website" : "On the website form"}
          />
          <span className="min-w-0 flex-1 truncate first-letter:uppercase">{p.name}</span>
          <span className="shrink-0 text-[12px] tabular-nums text-[var(--text-muted)]">{p.code}</span>
        </button>
      </li>
    );
  };
  const heading = (title: string, add: string, to: string) => (
    <div className="mb-1 flex items-center justify-between gap-2 px-2">
      <h2 className="text-[12px] font-semibold text-[var(--text-secondary)]">{title}</h2>
      <button type="button" onClick={() => go(to)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
        <Plus size={12} aria-hidden />
        {add}
      </button>
    </div>
  );

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Setup"
        subtitle="The positions people can apply for, the teams they join, and the steps they go through."
        actions={
          <Button onClick={() => go("?new=position")}>
            <Plus size={14} />
            New position
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <nav aria-label="Rounds, pipelines and positions" className="flex flex-col gap-5 lg:max-h-[calc(100dvh-220px)] lg:overflow-y-auto">
          <button type="button" aria-current={matching ? "true" : undefined} onClick={() => go("?rounds=1")} className={item(matching)}>
            <span className="min-w-0 flex-1 font-semibold">Hiring rounds</span>
            {loose > 0 && <span className="text-[12px] tabular-nums text-[var(--danger)]">{loose} not tied</span>}
          </button>
          <section>
            {heading("Pipelines", "New", "?new=pipeline")}
            <ul>
              {setup.pipelines.map((p) => {
                const uses = live.filter((x) => x.uses === p.key).length;
                return (
                  <li key={p.key}>
                    <button type="button" aria-current={pipeline?.key === p.key ? "true" : undefined} onClick={() => go(`?pipeline=${p.key}`)} className={item(pipeline?.key === p.key)}>
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      <span className="shrink-0 text-[12px] font-normal tabular-nums text-[var(--text-muted)]">
                        {p.steps.length} steps{uses ? `, ${uses} ${uses === 1 ? "position" : "positions"}` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
          <section>
            {heading("Positions", "New", "?new=position")}
            <ul>{roots.flatMap((r) => [line(r, false), ...live.filter((p) => p.parent === r.id).map((p) => line(p, true))])}</ul>
          </section>
          {removed.length > 0 && (
            <details>
              <summary className="cursor-pointer select-none px-2 text-[12px] font-semibold text-[var(--text-secondary)]">
                Removed <span className="font-normal tabular-nums">{removed.length}</span>
              </summary>
              <ul className="mt-1">
                {removed.map((p) => {
                  const kept = Object.values(p.counts).reduce((a, b) => a + b, 0);
                  return (
                    <li key={p.id} className="flex items-center gap-2 px-2 py-1 text-[13px] text-[var(--text-secondary)]">
                      <span className="min-w-0 flex-1 truncate" title={kept ? `${kept} applicants kept` : undefined}>
                        {p.name} <span className="text-[12px] tabular-nums text-[var(--text-muted)]">{p.code}</span>
                      </span>
                      <button
                        type="button"
                        className="text-[12px] font-medium text-[var(--accent-admin-text)] hover:underline"
                        onClick={async () => {
                          try {
                            await restore({ id: p.id });
                            toast("success", `${p.name} is back, closed on the website until you open it`);
                          } catch (err) {
                            toast("error", err instanceof Error ? err.message : "Could not restore it");
                          }
                        }}
                      >
                        Restore
                      </button>
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </nav>

        <div ref={editor} className="min-w-0 scroll-mt-4">
          {gone && (
            <p className="mb-3 rounded-lg bg-[var(--warning-dim)] px-3 py-2 text-[13px] text-[var(--text-primary)]">
              {gone === "position" ? "That position was removed. It can be restored from the list." : "That pipeline was deleted."}
            </p>
          )}
          {matching ? (
            <RoundsMatch data={hr} />
          ) : making === "position" ? (
            <PositionEditor
              key={`new-position ${visit}`}
              setup={setup}
              hr={hr}
              onDirty={setDirty}
              onCreated={(id) => go(`?job=${id}`, true)}
            />
          ) : making === "pipeline" ? (
            <PipelineEditor
              key={`new-pipeline ${at} ${visit}`}
              setup={setup}
              hr={hr}
              seed={{ name: forPosition?.name ?? (params.get("from") ? `${from.name} copy` : ""), steps: from.steps }}
              onDirty={setDirty}
              onSaved={async (key) => {
                // It exists either way: show it, also when giving it to the position does not work.
                go(`?pipeline=${key}`, true);
                if (!forPosition) return;
                const { moved } = await setPipeline({ position: forPosition.id, key });
                toast("success", `${forPosition.name} uses it now${movedNote(moved)}`);
              }}
            />
          ) : job ? (
            <PositionEditor
              key={`${job.id} ${visit}`}
              setup={setup}
              hr={hr}
              position={job}
              onDirty={setDirty}
              onRemoved={() => go("", true)}
              onNewPipeline={(p) => go(`?new=pipeline&from=${p.uses}&for=${p.id}`)}
              onOpenPipeline={(key) => go(`?pipeline=${key}`)}
            />
          ) : (
            <PipelineEditor
              key={`${pipeline?.key ?? STANDARD} ${visit}`}
              setup={setup}
              hr={hr}
              saved={pipeline ?? setup.pipelines[0]}
              onDirty={setDirty}
              onCopy={(key) => go(`?new=pipeline&from=${key}`)}
              onGone={() => go("", true)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
