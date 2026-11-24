"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { ListTodo } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, Modal, useToast } from "@/components/ui";
import { fieldBaseClass, fieldClass } from "@/components/ui/classes";
import { boardValue, rowTitle, type HrData } from "./hrShared";

const COMMON = ["Review portfolio", "Review assignment", "Call to confirm availability", "Check references"];
const LABEL = "mb-1 block text-[12px] font-medium text-[var(--text-secondary)]";

/**
 * Give someone on the team a task about a candidate. It becomes an ordinary
 * task, in the recruitment brief of the candidate's open position (or the brief
 * given), and shows on the candidate too.
 */
export function AssignTask({
  data,
  candidateId,
  briefId,
  onDone,
}: {
  data: HrData;
  /** Fixed, when opened from the candidate. Otherwise there is a box to pick one. */
  candidateId?: string;
  briefId?: Id<"briefs">;
  onDone: () => void;
}) {
  const assign = useMutation(api.recruitTasks.assign);
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [who, setWho] = useState("");
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");
  const [about, setAbout] = useState("");
  const [saving, setSaving] = useState(false);

  // The native list box searches by typing. The code keeps two people with one name apart.
  const live = candidateId ? [] : data.book.pipeline.filter((r) => boardValue(r) !== null);
  const named = new Map(live.map((r) => [`${rowTitle(r, data)} (${r.code})`, r._id]));
  const picked = candidateId ?? named.get(about);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (about.trim() && !picked) return toast("error", "Pick the candidate from the list, or leave it empty");
    setSaving(true);
    try {
      await assign({
        title,
        assigneeId: who as Id<"users">,
        ...(picked ? { candidateId: picked as Id<"hrRecords"> } : {}),
        ...(briefId ? { briefId } : {}),
        // The end of that day in India, wherever it is typed from.
        ...(due ? { deadline: Date.parse(`${due}T00:00:00+05:30`) } : {}),
        ...(note.trim() ? { note } : {}),
      });
      toast("success", `${data.personName(who)} has it, and has been told`);
      onDone();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not assign it");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3">
      <label className="block">
        <span className={LABEL}>
          What needs doing <span className="text-[var(--danger)]">*</span>
        </span>
        <input
          value={title}
          required
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Review portfolio"
          className={`${fieldClass} w-full`}
        />
      </label>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {COMMON.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setTitle(c)}
            className="h-6 rounded-full border border-[var(--border)] bg-white px-2 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            {c}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {!candidateId && (
          <label className="block sm:col-span-2">
            <span className={LABEL}>About which candidate</span>
            <input
              list="assign-candidates"
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              placeholder="Type a name, or leave empty"
              className={`${fieldClass} w-full`}
            />
            <datalist id="assign-candidates">
              {[...named.keys()].map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </label>
        )}
        <label className="block">
          <span className={LABEL}>
            Who <span className="text-[var(--danger)]">*</span>
          </span>
          <select value={who} required onChange={(e) => setWho(e.target.value)} className={`${fieldClass} w-full`}>
            <option value="">Select…</option>
            {data.people.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={LABEL}>By when</span>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={`${fieldClass} w-full`} />
        </label>
        <label className="block sm:col-span-2">
          <span className={LABEL}>Anything they should know</span>
          <textarea value={note} rows={2} maxLength={5000} onChange={(e) => setNote(e.target.value)} className={`${fieldBaseClass} w-full py-2`} />
        </label>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          Assign
        </Button>
      </div>
    </form>
  );
}

export function AssignTaskModal({ data, onClose }: { data: HrData; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title="Assign a recruitment task" icon={ListTodo} size="lg">
      <AssignTask data={data} onDone={onClose} />
    </Modal>
  );
}
