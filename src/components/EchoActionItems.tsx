"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button, Card } from "@/components/ui";
import { NewSelfTaskModal } from "@/components/NewSelfTaskModal";

type Item = {
  _id: Id<"echoActionItems">;
  task: string;
  dueDate?: string;
  meetingTitle: string;
  brandId?: Id<"brands">;
};

/**
 * Dashboard card: action items Echo heard being given to you in a meeting.
 * Nothing becomes a task by itself. "Add to my tasks" opens the usual new-task
 * form filled in, so the brand and its manager are still your call.
 */
export function EchoActionItems() {
  const items = useQuery(api.echo.myActionItems, {});
  const resolve = useMutation(api.echo.resolveActionItem);
  const [taking, setTaking] = useState<Item | null>(null);

  if (!items?.length) return null;

  return (
    <Card className="mb-6">
      <h2 className="font-semibold text-[15px] text-[var(--text-primary)]">From your meetings</h2>
      <p className="text-[13px] text-[var(--text-secondary)] mt-0.5 mb-2">
        Action items that were given to you. Add the ones that are real, dismiss the rest.
      </p>
      <ul className="flex flex-col divide-y divide-[var(--border)]">
        {items.map((item) => (
          <li key={item._id} className="py-2 last:pb-0 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[13px] text-[var(--text-primary)]">{item.task}</p>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                {item.meetingTitle}
                {item.dueDate && ` · due ${item.dueDate}`}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" onClick={() => setTaking(item)}>
                Add to my tasks
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => resolve({ itemId: item._id, status: "dismissed" })}
              >
                Dismiss
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {taking && (
        <NewSelfTaskModal
          key={taking._id}
          open
          onClose={() => setTaking(null)}
          initial={{
            title: taking.task,
            brandId: taking.brandId,
            // End of the working day in India on the date that was said.
            deadline: taking.dueDate ? Date.parse(`${taking.dueDate}T18:00:00+05:30`) : undefined,
          }}
          // The task exists by now; if marking the item fails it is simply offered again.
          onCreated={() => void resolve({ itemId: taking._id, status: "accepted" }).catch(() => {})}
        />
      )}
    </Card>
  );
}
