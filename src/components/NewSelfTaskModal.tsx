"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button, DatePicker, Input, Modal, Select, Textarea, useToast } from "@/components/ui";

/**
 * "New task" for the signed-in person: they are the assignee, and they attach
 * the brand manager who will review and close it. They can take it as far as
 * Review by submitting a deliverable; closing is the manager's.
 */
export function NewSelfTaskModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const brands = useQuery(api.briefs.listBrandsForSelfTask, open ? {} : "skip");
  const createSelfTask = useMutation(api.briefs.createSelfTask);
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [brandId, setBrandId] = useState("");
  const [managerId, setManagerId] = useState("");
  const [deadline, setDeadline] = useState<number | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  const brand = brands?.find((b) => b._id === brandId);
  // A brand with one manager needs no second choice.
  const chosenManager = brand?.managers.length === 1 ? brand.managers[0]._id : managerId;

  function reset() {
    setTitle("");
    setDescription("");
    setBrandId("");
    setManagerId("");
    setDeadline(undefined);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !brandId || !chosenManager || submitting) return;
    setSubmitting(true);
    try {
      await createSelfTask({
        title: title.trim(),
        description: description.trim() || undefined,
        brandId: brandId as Id<"brands">,
        managerId: chosenManager as Id<"users">,
        deadline,
      });
      toast("success", "Task created. Submit a deliverable when it's ready for review.");
      reset();
      onClose();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Couldn't create the task");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New task for myself"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="new-self-task"
            disabled={!title.trim() || !brandId || !chosenManager || submitting}
          >
            {submitting ? "Creating…" : "Create task"}
          </Button>
        </>
      }
    >
      <form id="new-self-task" onSubmit={submit} className="flex flex-col gap-4">
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What are you working on?"
          autoFocus
          required
        />
        <Textarea
          label="Details"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional"
          rows={3}
        />
        <Select
          label="Brand"
          value={brandId}
          onChange={(e) => {
            setBrandId(e.target.value);
            setManagerId("");
          }}
          placeholder={brands === undefined ? "Loading brands…" : "Choose a brand"}
          options={(brands ?? []).map((b) => ({ value: b._id, label: b.name }))}
          required
        />
        {brand && (
          brand.managers.length === 1 ? (
            <p className="text-[13px] text-[var(--text-secondary)]">
              Brand manager: <span className="text-[var(--text-primary)] font-medium">{brand.managers[0].name}</span>
            </p>
          ) : (
            <Select
              label="Brand manager"
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              placeholder="Who reviews and closes it?"
              options={brand.managers.map((m) => ({ value: m._id, label: m.name }))}
              required
            />
          )
        )}
        <div className="flex flex-col gap-1.5">
          <span className="font-medium text-[13px] text-[var(--text-secondary)]">Deadline</span>
          <DatePicker value={deadline} onChange={setDeadline} placeholder="Optional" />
        </div>
        <p className="text-[12px] text-[var(--text-muted)]">
          You can take it to Review by submitting a deliverable. The brand manager reviews and closes it.
        </p>
      </form>
    </Modal>
  );
}
