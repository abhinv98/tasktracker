"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, ConfirmModal, DatePicker, Input, PromptModal, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea, useToast } from "@/components/ui";
import { Trash2, Calendar, Copy } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  draft: "var(--text-secondary)",
  active: "var(--accent-employee)",
  "in-progress": "var(--accent-manager)",
  review: "var(--accent-admin)",
  completed: "var(--accent-employee)",
  archived: "var(--text-disabled)",
};

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isOverdue(deadline: number): boolean {
  return deadline < Date.now();
}

function daysUntil(deadline: number): number {
  return Math.ceil((deadline - Date.now()) / (1000 * 60 * 60 * 24));
}

export default function BriefsPage() {
  const router = useRouter();
  const briefs = useQuery(api.briefs.listBriefs, {});
  const brands = useQuery(api.brands.listBrands);
  const user = useQuery(api.users.getCurrentUser);
  const managers = useQuery(api.users.listManagers);
  const createBrief = useMutation(api.briefs.createBrief);
  const deleteBrief = useMutation(api.briefs.deleteBrief);
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [brandId, setBrandId] = useState<string>("");
  const [managerId, setManagerId] = useState<string>("");
  const brandManagerIds = useQuery(
    api.brands.getManagersForBrand,
    brandId ? { brandId: brandId as Id<"brands"> } : "skip"
  );
  const [deadline, setDeadline] = useState<number | undefined>(undefined);
  const [briefType, setBriefType] = useState<string>("");

  const templates = useQuery(api.templates.listTemplates);
  const createFromTemplate = useMutation(api.templates.createFromTemplate);
  const deleteTemplate = useMutation(api.templates.deleteTemplate);
  const [showTemplates, setShowTemplates] = useState(false);
  const [deletingBriefId, setDeletingBriefId] = useState<Id<"briefs"> | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<Id<"briefTemplates"> | null>(null);
  const [templateForBrief, setTemplateForBrief] = useState<Id<"briefTemplates"> | null>(null);
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";
  const isManager = user?.role === "manager";

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createBrief({
        title,
        description,
        ...(brandId ? { brandId: brandId as Id<"brands"> } : {}),
        ...(managerId ? { assignedManagerId: managerId as Id<"users"> } : {}),
        ...(deadline !== undefined ? { deadline } : {}),
        ...(briefType ? { briefType: briefType as "developmental" | "designing" | "video_editing" | "content_calendar" } : {}),
      });
      setShowModal(false);
      setTitle("");
      setDescription("");
      setBrandId("");
      setManagerId("");
      setDeadline(undefined);
      setBriefType("");
      toast("success", "Brief created");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to create brief");
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 sm:mb-8">
        <div>
          <h1 className="font-bold text-[20px] sm:text-[24px] text-[var(--text-primary)] tracking-tight">
            Briefs
          </h1>
          <p className="mt-1 text-[13px] sm:text-[14px] text-[var(--text-secondary)]">
            Manage your briefs and priorities
          </p>
        </div>
        {(isAdmin || isManager) && (
          <div className="flex items-center gap-2">
            {(templates ?? []).length > 0 && (
              <div className="relative">
                <Button variant="secondary" onClick={() => setShowTemplates(!showTemplates)}>
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  From Template
                </Button>
                {showTemplates && (
                  <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-xl border border-[var(--border)] shadow-lg z-20 py-1">
                    {templates?.map((t) => (
                      <div key={t._id} className="flex items-center justify-between px-3 py-2 hover:bg-[var(--bg-hover)]">
                        <button
                          onClick={() => {
                            setTemplateForBrief(t._id);
                            setShowTemplates(false);
                          }}
                          className="flex-1 text-left text-[13px] text-[var(--text-primary)]"
                        >
                          {t.name}
                          <span className="block text-[11px] text-[var(--text-muted)]">
                            {t.tasks.length} tasks
                          </span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingTemplateId(t._id);
                            setShowTemplates(false);
                          }}
                          className="text-[var(--text-muted)] hover:text-[var(--danger)] p-1"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <Button variant="primary" onClick={() => setShowModal(true)}>
              Create Brief
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-white shadow-sm overflow-x-auto">
        <Table>
          <TableHeader>
            <TableHead>Priority</TableHead>
            <TableHead>Title</TableHead>
            <TableHead className="hidden md:table-cell">Manager</TableHead>
            <TableHead className="hidden lg:table-cell">Teams</TableHead>
            <TableHead className="hidden lg:table-cell">Brand</TableHead>
            <TableHead className="hidden xl:table-cell">Type</TableHead>
            <TableHead>Deadline</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden sm:table-cell">Progress</TableHead>
            {isAdmin && <TableHead className="w-10"></TableHead>}
          </TableHeader>
          <TableBody>
            {(briefs ?? [])
              .sort((a, b) => a.globalPriority - b.globalPriority)
              .map((brief) => {
                const dl = brief.deadline;
                const overdue = dl && brief.status !== "completed" && brief.status !== "archived" && isOverdue(dl);
                const daysLeft = dl ? daysUntil(dl) : null;

                return (
                  <TableRow
                    key={brief._id}
                    onClick={() => router.push(`/brief/${brief._id}`)}
                  >
                    <TableCell>
                      {brief.globalPriority}
                    </TableCell>
                    <TableCell className="font-semibold">
                      {brief.title}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {(brief as { managerName?: string }).managerName ? (
                        <Badge variant="manager">
                          {(brief as { managerName?: string }).managerName}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex gap-1 flex-wrap">
                        {((brief as { teamNames?: string[] }).teamNames ?? []).map(
                          (name) => (
                            <Badge key={name} variant="neutral">
                              {name}
                            </Badge>
                          )
                        )}
                        {!((brief as { teamNames?: string[] }).teamNames?.length) && "—"}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {(brief as any).brandId ? (
                        <Badge variant="neutral">
                          {(brands ?? []).find((b: any) => b._id === (brief as any).brandId)?.name ?? "—"}
                        </Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      {(brief as any).briefType ? (
                        <Badge variant="neutral">
                          {(brief as any).briefType === "content_calendar" ? "Content Calendar" :
                           (brief as any).briefType === "video_editing" ? "Video Editing" :
                           (brief as any).briefType === "developmental" ? "Developmental" :
                           (brief as any).briefType === "designing" ? "Designing" : (brief as any).briefType}
                        </Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      {dl ? (
                        <div className="flex items-center gap-1.5">
                          <Calendar className={`h-3.5 w-3.5 ${overdue ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`} />
                          <span className={`text-[12px] font-medium whitespace-nowrap ${overdue ? "text-[var(--danger)]" : "text-[var(--text-secondary)]"}`}>
                            {formatDate(dl)}
                          </span>
                          {daysLeft !== null && brief.status !== "completed" && brief.status !== "archived" && (
                            <span className={`text-[10px] ${overdue ? "text-[var(--danger)]" : daysLeft <= 3 ? "text-[var(--warning)]" : "text-[var(--text-muted)]"}`}>
                              {overdue ? `${Math.abs(daysLeft)}d late` : `${daysLeft}d`}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[var(--text-disabled)] text-[12px]">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className="font-medium text-[12px] capitalize"
                        style={{
                          color: STATUS_COLORS[brief.status] ?? "var(--text-secondary)",
                        }}
                      >
                        {brief.status}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="w-24 h-2 rounded-full bg-[var(--border-subtle)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--accent-employee)]"
                          style={{
                            width: `${(brief as { progress?: number }).progress ?? 0}%`,
                          }}
                        />
                      </div>
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingBriefId(brief._id);
                          }}
                          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-dim)] transition-all"
                          title="Delete brief"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <h2 className="font-semibold text-[18px] text-[var(--text-primary)] mb-4">
              Create Brief
            </h2>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <Input
                label="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Brief title"
                required
              />
              <Textarea
                label="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description"
              />
              <div>
                <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-2">
                  Brief Type (optional)
                </label>
                <select
                  value={briefType}
                  onChange={(e) => setBriefType(e.target.value)}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                >
                  <option value="">No specific type</option>
                  <option value="developmental">Developmental</option>
                  <option value="designing">Designing</option>
                  <option value="video_editing">Video Editing</option>
                  <option value="content_calendar">Content Calendar</option>
                </select>
              </div>
              <div>
                <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-2">
                  Deadline (optional)
                </label>
                <DatePicker
                  value={deadline}
                  onChange={setDeadline}
                  placeholder="Set deadline"
                />
              </div>
              <div>
                <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-2">
                  Brand (optional)
                </label>
                <select
                  value={brandId}
                  onChange={(e) => { setBrandId(e.target.value); setManagerId(""); }}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                >
                  <option value="">No brand</option>
                  {(brands ?? []).map((b: any) => (
                    <option key={b._id} value={b._id}>{b.name}</option>
                  ))}
                </select>
              </div>
              {isAdmin && (
                <div>
                  <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-2">
                    Assign Manager (optional)
                  </label>
                  <select
                    value={managerId}
                    onChange={(e) => setManagerId(e.target.value)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                  >
                    <option value="">No manager</option>
                    {(managers ?? [])
                      .filter((m: any) => !brandId || !brandManagerIds || brandManagerIds.includes(m._id))
                      .map((m: any) => (
                        <option key={m._id} value={m._id}>{m.name ?? m.email}</option>
                      ))}
                  </select>
                  {brandId && brandManagerIds && brandManagerIds.length === 0 && (
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">
                      No managers assigned to this brand yet.
                    </p>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <Button type="submit" variant="primary">
                  Create
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Delete Brief Confirmation */}
      <ConfirmModal
        open={!!deletingBriefId}
        title="Delete Brief"
        message="Are you sure you want to permanently delete this brief? This will also delete all its tasks, deliverables, and logs. This cannot be undone."
        confirmLabel="Delete"
        confirmingLabel="Deleting..."
        variant="danger"
        onConfirm={async () => {
          if (!deletingBriefId) return;
          try {
            await deleteBrief({ briefId: deletingBriefId });
            toast("success", "Brief deleted");
          } catch (err) {
            toast("error", err instanceof Error ? err.message : "Failed to delete brief");
          }
          setDeletingBriefId(null);
        }}
        onCancel={() => setDeletingBriefId(null)}
      />

      {/* Delete Template Confirmation */}
      <ConfirmModal
        open={!!deletingTemplateId}
        title="Delete Template"
        message="Are you sure you want to delete this template?"
        confirmLabel="Delete"
        confirmingLabel="Deleting..."
        variant="danger"
        onConfirm={async () => {
          if (!deletingTemplateId) return;
          await deleteTemplate({ templateId: deletingTemplateId });
          toast("success", "Template deleted");
          setDeletingTemplateId(null);
        }}
        onCancel={() => setDeletingTemplateId(null)}
      />

      {/* Create from Template Prompt */}
      <PromptModal
        open={!!templateForBrief}
        title="Create Brief from Template"
        message="Enter a title for the new brief."
        placeholder="Brief title"
        confirmLabel="Create"
        confirmingLabel="Creating..."
        onConfirm={async (name) => {
          if (!templateForBrief) return;
          try {
            const id = await createFromTemplate({ templateId: templateForBrief, title: name });
            router.push(`/brief/${id}`);
          } catch (err) {
            toast("error", err instanceof Error ? err.message : "Failed");
          }
          setTemplateForBrief(null);
        }}
        onCancel={() => setTemplateForBrief(null)}
      />
    </div>
  );
}
