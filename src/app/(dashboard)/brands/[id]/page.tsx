"use client";

import { useMutation, useQuery } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card } from "@/components/ui";
import { ArrowLeft, Tag, UserPlus, Trash2, Briefcase } from "lucide-react";

export default function BrandDetailPage() {
  const params = useParams();
  const router = useRouter();
  const brandId = params.id as Id<"brands">;

  const brand = useQuery(api.brands.getBrand, { brandId });
  const user = useQuery(api.users.getCurrentUser);
  const managers = useQuery(api.users.listManagers);
  const assignManager = useMutation(api.brands.assignManagerToBrand);
  const removeManager = useMutation(api.brands.removeManagerFromBrand);
  const deleteBrand = useMutation(api.brands.deleteBrand);

  const [addManagerId, setAddManagerId] = useState<string>("");

  const isAdmin = user?.role === "admin";

  if (brand === undefined) {
    return (
      <div className="p-8">
        <p className="text-[14px] text-[var(--text-secondary)]">Loading...</p>
      </div>
    );
  }

  if (brand === null) {
    return (
      <div className="p-8">
        <p className="text-[14px] text-[var(--text-secondary)]">Brand not found.</p>
      </div>
    );
  }

  const validManagers = brand.managers.filter((m): m is NonNullable<typeof m> => !!m);
  const assignedManagerIds = validManagers.map((m) => m._id);
  const availableManagers = (managers ?? []).filter((m) => !assignedManagerIds.includes(m._id));

  async function handleAssignManager() {
    if (!addManagerId) return;
    try {
      await assignManager({ brandId, managerId: addManagerId as Id<"users"> });
      setAddManagerId("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    }
  }

  async function handleRemoveManager(managerId: Id<"users">) {
    if (!window.confirm("Remove this manager from the brand?")) return;
    try {
      await removeManager({ brandId, managerId });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    }
  }

  async function handleDelete() {
    if (!window.confirm("Are you sure you want to delete this brand? This cannot be undone.")) return;
    try {
      await deleteBrand({ brandId });
      router.push("/brands");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    }
  }

  const STATUS_COLORS: Record<string, string> = {
    draft: "var(--text-secondary)",
    active: "var(--accent-employee)",
    "in-progress": "var(--accent-manager)",
    review: "var(--accent-admin)",
    completed: "var(--accent-employee)",
    archived: "var(--text-disabled)",
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => router.push("/brands")}
          className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: brand.color + "20" }}
        >
          <Tag className="h-5 w-5" style={{ color: brand.color }} />
        </div>
        <div className="flex-1">
          <h1 className="font-bold text-[24px] text-[var(--text-primary)] tracking-tight">
            {brand.name}
          </h1>
          {brand.description && (
            <p className="text-[14px] text-[var(--text-secondary)]">{brand.description}</p>
          )}
        </div>
        {isAdmin && (
          <Button variant="secondary" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 mr-1.5" />
            Delete
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <p className="text-[12px] font-medium text-[var(--text-secondary)]">Managers</p>
          <p className="font-bold text-[28px] text-[var(--text-primary)] mt-1 tabular-nums">
            {brand.managers.length}
          </p>
        </Card>
        <Card>
          <p className="text-[12px] font-medium text-[var(--text-secondary)]">Briefs</p>
          <p className="font-bold text-[28px] text-[var(--text-primary)] mt-1 tabular-nums">
            {brand.briefs.length}
          </p>
        </Card>
        <Card>
          <p className="text-[12px] font-medium text-[var(--text-secondary)]">Employees</p>
          <p className="font-bold text-[28px] text-[var(--text-primary)] mt-1 tabular-nums">
            {brand.employeeCount}
          </p>
        </Card>
        <Card>
          <p className="text-[12px] font-medium text-[var(--text-secondary)]">Tasks</p>
          <p className="font-bold text-[28px] text-[var(--text-primary)] mt-1 tabular-nums">
            {brand.totalTasks}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Managers Section */}
        <div>
          <h2 className="font-semibold text-[16px] text-[var(--text-primary)] mb-4">
            Managers
          </h2>
          <Card>
            {brand.managers.length === 0 && (
              <p className="text-[13px] text-[var(--text-muted)]">No managers assigned yet.</p>
            )}
            <div className="flex flex-col gap-2">
              {validManagers.map((manager) => (
                <div
                  key={manager._id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <div>
                    <p className="font-medium text-[14px] text-[var(--text-primary)]">
                      {manager.name ?? manager.email ?? "Unknown"}
                    </p>
                    {manager.email && manager.name && (
                      <p className="text-[12px] text-[var(--text-secondary)]">{manager.email}</p>
                    )}
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => handleRemoveManager(manager._id as Id<"users">)}
                      className="text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {isAdmin && availableManagers.length > 0 && (
              <div className="flex gap-2 mt-4 pt-4 border-t border-[var(--border)]">
                <select
                  value={addManagerId}
                  onChange={(e) => setAddManagerId(e.target.value)}
                  className="flex-1 bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]"
                >
                  <option value="">Select a manager...</option>
                  {availableManagers.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.name ?? m.email}
                    </option>
                  ))}
                </select>
                <Button variant="primary" onClick={handleAssignManager}>
                  <UserPlus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </Card>
        </div>

        {/* Briefs Section */}
        <div>
          <h2 className="font-semibold text-[16px] text-[var(--text-primary)] mb-4">
            Briefs
          </h2>
          <div className="flex flex-col gap-3">
            {brand.briefs.length === 0 && (
              <p className="text-[13px] text-[var(--text-muted)]">No briefs in this brand yet.</p>
            )}
            {brand.briefs.map((brief) => (
              <Card
                key={brief._id}
                onClick={() => router.push(`/brief/${brief._id}`)}
                hover
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-[14px] text-[var(--text-primary)] truncate flex-1">
                    {brief.title}
                  </h3>
                  <span
                    className="font-medium text-[12px] capitalize ml-2"
                    style={{ color: STATUS_COLORS[brief.status] ?? "var(--text-secondary)" }}
                  >
                    {brief.status}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-hover)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--accent-employee)]"
                      style={{ width: `${brief.progress}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                    {brief.doneCount}/{brief.taskCount}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Task Status Summary */}
      {brand.totalTasks > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold text-[16px] text-[var(--text-primary)] mb-4">
            Task Status
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <p className="text-[12px] font-medium text-[var(--text-secondary)]">Pending</p>
              <p className="font-bold text-[24px] text-[var(--text-primary)] mt-1 tabular-nums">
                {brand.taskStatusCounts.pending}
              </p>
            </Card>
            <Card accent="manager">
              <p className="text-[12px] font-medium text-[var(--text-secondary)]">In Progress</p>
              <p className="font-bold text-[24px] text-[var(--text-primary)] mt-1 tabular-nums">
                {brand.taskStatusCounts["in-progress"]}
              </p>
            </Card>
            <Card accent="admin">
              <p className="text-[12px] font-medium text-[var(--text-secondary)]">Review</p>
              <p className="font-bold text-[24px] text-[var(--text-primary)] mt-1 tabular-nums">
                {brand.taskStatusCounts.review}
              </p>
            </Card>
            <Card accent="employee">
              <p className="text-[12px] font-medium text-[var(--text-secondary)]">Done</p>
              <p className="font-bold text-[24px] text-[var(--text-primary)] mt-1 tabular-nums">
                {brand.taskStatusCounts.done}
              </p>
            </Card>
          </div>
        </div>
      )}

      {/* Employees */}
      {brand.employees.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold text-[16px] text-[var(--text-primary)] mb-4">
            Team Members Working on This Brand
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {brand.employees.filter((e): e is NonNullable<typeof e> => !!e).map((emp) => (
              <Card key={emp._id}>
                <p className="font-medium text-[14px] text-[var(--text-primary)]">
                  {emp.name ?? emp.email ?? "Unknown"}
                </p>
                <p className="text-[12px] text-[var(--text-secondary)]">{emp.email}</p>
                <Badge variant={emp.role === "manager" ? "manager" : "employee"} className="mt-1">
                  {emp.role}
                </Badge>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
