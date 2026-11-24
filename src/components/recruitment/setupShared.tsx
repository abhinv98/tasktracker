"use client";

import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { Step } from "@/convex/lib/hirePipeline";

export type Setup = NonNullable<FunctionReturnType<typeof api.recruitSetup.overview>>;
export type Position = Setup["positions"][number];

export const LABEL = "mb-1 block text-[12px] font-medium text-[var(--text-secondary)]";

/** People taking the matching step, as the end of a toast. */
export const movedNote = (moved: number) => (moved ? `. ${moved} ${moved === 1 ? "person" : "people"} took the matching step` : "");

/** A pipeline at a glance. */
export function StepTrail({ steps }: { steps: readonly Pick<Step, "id" | "name">[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-[var(--text-secondary)]">
      {steps.map((s, i) => (
        <li key={s.id} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden className="text-[var(--text-disabled)]">→</span>}
          {s.name}
        </li>
      ))}
    </ol>
  );
}
