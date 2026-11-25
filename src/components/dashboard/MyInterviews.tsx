"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, Panel, useToast } from "@/components/ui";
import { fieldBaseClass, fieldClass } from "@/components/ui/classes";
import { fmtDate } from "@/components/recruitment/hrShared";
import { todayIST } from "@/lib/hrHealth";
import { VERDICTS } from "@/lib/recruitStages";

const DECISIONS = ["Proceed", "Hold", "Reject"] as const;

/**
 * Interviews this person is taking: the ones coming up, and the ones done that
 * still need their written feedback. Shown to any staff member HR names as an
 * interviewer, whether or not they can open Recruitment. Hidden when there are none.
 */
export function MyInterviews() {
  const interviews = useQuery(api.hrOps.myInterviews, {});
  const giveFeedback = useMutation(api.hrOps.giveFeedback);
  const { toast } = useToast();
  const [openId, setOpenId] = useState<string | null>(null);
  const [decision, setDecision] = useState<(typeof DECISIONS)[number]>("Proceed");
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);

  if (!interviews || interviews.length === 0) return null;
  const today = todayIST();

  async function submit(id: Id<"hrRecords">) {
    setSaving(true);
    try {
      await giveFeedback({ id, recommendation: decision, feedback });
      toast("success", "Feedback sent to HR");
      setOpenId(null);
      setFeedback("");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not save your feedback");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="Your interviews" count={interviews.length}>
      <ul className="divide-y divide-[var(--border-subtle)]">
        {interviews.map((it) => {
          // Feedback is asked for once the interview's day has come.
          const due = it.status === "Completed" || (it.date !== "" && it.date <= today);
          const late = it.feedbackDue !== "" && it.feedbackDue < today;
          return (
            <li key={it._id} className="px-4 py-2.5">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-[var(--text-primary)]">
                    {it.candidate}
                    {it.role && <span className="font-normal text-[var(--text-muted)]"> · {it.role}</span>}
                  </p>
                  <p className="text-[12px] tabular-nums text-[var(--text-muted)]">
                    {[it.date && fmtDate(it.date, today), it.time, it.round, it.mode].filter(Boolean).join(" · ")}
                    {due && (
                      <span className={late ? "font-medium text-[var(--danger)]" : ""}>
                        {" · "}
                        {late ? "feedback overdue" : "feedback due"}
                      </span>
                    )}
                  </p>
                </div>
                {it.resume && (
                  <a
                    href={it.resume}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-[13px] font-medium text-[var(--accent-admin-text)] underline-offset-2 hover:underline"
                  >
                    Resume
                  </a>
                )}
                {due && openId !== it._id && (
                  <Button
                    size="sm"
                    variant={late ? "primary" : "secondary"}
                    onClick={() => {
                      setOpenId(it._id);
                      setFeedback("");
                      setDecision("Proceed");
                    }}
                  >
                    Give feedback
                  </Button>
                )}
              </div>
              {openId === it._id && (
                <form
                  className="mt-2.5 flex flex-col gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit(it._id);
                  }}
                >
                  <label className="text-[12px] font-medium text-[var(--text-secondary)]">
                    Your recommendation
                    <select
                      value={decision}
                      onChange={(e) => setDecision(e.target.value as (typeof DECISIONS)[number])}
                      className={`${fieldClass} mt-1 block w-full sm:w-48`}
                    >
                      {DECISIONS.map((d) => (
                        <option key={d} value={d}>
                          {VERDICTS[d].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[12px] font-medium text-[var(--text-secondary)]">
                    Feedback
                    <textarea
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      required
                      rows={3}
                      maxLength={5000}
                      placeholder="What stood out, any concerns, and why you recommend this"
                      className={`${fieldBaseClass} mt-1 block w-full py-2`}
                    />
                  </label>
                  <div className="flex justify-end gap-2">
                    <Button type="button" size="sm" variant="secondary" onClick={() => setOpenId(null)}>
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" loading={saving}>
                      Send to HR
                    </Button>
                  </div>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
