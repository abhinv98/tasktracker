import { getAuthUserId } from "@convex-dev/auth/server";
import { query, internalMutation, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// ── Oversight access ───────────────────────────────────────────
// Oversight is a filterable board of tasks — who's doing them, for which
// brand, status, and which brand manager assigned them.
//
// Access tiers:
//   • "admin" — oversight admins (Vivek/Mayur) and super-admins see everything.
//   • "scoped" — brand managers see tasks for the brands they manage; team
//     leads see tasks owned by anyone on the teams they lead. A user who is
//     both gets the union of those two scopes.
//   • null    — no oversight access.

type OversightScope =
  | { kind: "admin" }
  | {
      kind: "scoped";
      brandIds: Set<string>;
      employeeIds: Set<string>;
    };

async function resolveOversightScope(
  ctx: QueryCtx,
  userId: Id<"users">
): Promise<OversightScope | null> {
  const user = await ctx.db.get(userId);
  if (!user) return null;

  if (user.isOversightAdmin === true || user.isSuperAdmin === true) {
    return { kind: "admin" };
  }

  const managedBrands = await ctx.db
    .query("brandManagers")
    .withIndex("by_manager", (q) => q.eq("managerId", userId))
    .collect();
  const brandIds = new Set<string>(
    managedBrands.map((m) => m.brandId as unknown as string)
  );

  const ledTeams = await ctx.db
    .query("teams")
    .withIndex("by_lead", (q) => q.eq("leadId", userId))
    .collect();
  const ledTeamIds = new Set<string>(
    ledTeams.map((t) => t._id as unknown as string)
  );

  const employeeIds = new Set<string>();
  if (ledTeamIds.size > 0) {
    const memberships = await ctx.db.query("userTeams").collect();
    for (const m of memberships) {
      if (ledTeamIds.has(m.teamId as unknown as string)) {
        employeeIds.add(m.userId as unknown as string);
      }
    }
    employeeIds.add(userId as unknown as string);
  }

  if (brandIds.size === 0 && employeeIds.size === 0) return null;
  return { kind: "scoped", brandIds, employeeIds };
}

export const amOversightAdmin = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;
    const user = await ctx.db.get(userId);
    return user?.isOversightAdmin === true;
  },
});

/**
 * Lightweight access check for UI gating. Returns the viewer's scope so the
 * sidebar / worklog tab / page chrome can decide whether to show Oversight
 * without fetching the whole board.
 */
export const getOversightAccess = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const scope = await resolveOversightScope(ctx, userId);
    if (!scope) return null;
    if (scope.kind === "admin") return { kind: "admin" as const };
    return {
      kind: "scoped" as const,
      brandCount: scope.brandIds.size,
      teamMemberCount: scope.employeeIds.size,
    };
  },
});

export const getOversightBoard = query({
  args: {
    status: v.optional(v.string()),
    brandId: v.optional(v.id("brands")),
    assigneeId: v.optional(v.id("users")),
    managerId: v.optional(v.id("users")),
    search: v.optional(v.string()),
    /**
     * "YYYY-MM-DD" range — match tasks whose created/deadline/completed date
     * intersects the range. Either bound is optional: an open-ended range
     * (only `startDate` or only `endDate`) is allowed.
     */
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { status, brandId, assigneeId, managerId, search, startDate, endDate }
  ) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const scope = await resolveOversightScope(ctx, userId);
    if (!scope) return null;

    const allTasks = await ctx.db.query("tasks").collect();
    const allBriefs = await ctx.db.query("briefs").collect();
    const allBrands = await ctx.db.query("brands").collect();
    const allUsers = await ctx.db.query("users").collect();
    const allDeliverables = await ctx.db.query("deliverables").collect();

    const briefMap = new Map(allBriefs.map((b) => [b._id, b]));
    const brandMap = new Map(allBrands.map((b) => [b._id, b]));
    const userMap = new Map(allUsers.map((u) => [u._id, u]));

    // Latest deliverable submission per task — what the employee "submitted".
    // A task with multiple revisions reports the most recent submission.
    const lastSubmissionByTask = new Map<string, number>();
    for (const d of allDeliverables) {
      const key = d.taskId as unknown as string;
      const prev = lastSubmissionByTask.get(key) ?? 0;
      if (d.submittedAt > prev) lastSubmissionByTask.set(key, d.submittedAt);
    }

    let rows = allTasks.map((t) => {
      const brief = briefMap.get(t.briefId);
      const brand = brief?.brandId ? brandMap.get(brief.brandId) : null;
      const assignee = userMap.get(t.assigneeId);
      const manager = userMap.get(t.assignedBy);
      return {
        _id: t._id,
        title: t.title,
        status: t.status,
        deadline: t.deadline ?? null,
        completedAt: t.completedAt ?? null,
        lastSubmittedAt:
          lastSubmissionByTask.get(t._id as unknown as string) ?? null,
        createdAt: (t as any)._creationTime as number,
        briefId: t.briefId,
        briefTitle: brief?.title ?? "Unknown",
        briefType: (brief as any)?.briefType ?? null,
        brandId: brief?.brandId ?? null,
        brandName: brand?.name ?? "No Brand",
        brandColor: brand?.color ?? "#6b7280",
        assigneeId: t.assigneeId,
        assigneeName: assignee?.name ?? assignee?.email ?? "Unknown",
        assigneeAvatar: assignee?.avatarUrl ?? null,
        managerId: t.assignedBy,
        managerName: manager?.name ?? manager?.email ?? "Unknown",
        carryOverDays: t.carryOverDays ?? 0,
      };
    });

    // Scope: brand managers see tasks on their brands; team leads see tasks
    // owned by their team members; a user with both roles gets the union.
    if (scope.kind === "scoped") {
      rows = rows.filter(
        (r) =>
          (r.brandId != null &&
            scope.brandIds.has(r.brandId as unknown as string)) ||
          scope.employeeIds.has(r.assigneeId as unknown as string)
      );
    }

    if (startDate || endDate) {
      const lo = startDate
        ? new Date(startDate + "T00:00:00").getTime()
        : -Infinity;
      const hi = endDate
        ? new Date(endDate + "T23:59:59.999").getTime()
        : Infinity;
      const inRange = (ts: number | null) =>
        ts != null && ts >= lo && ts <= hi;
      rows = rows.filter(
        (r) =>
          inRange(r.createdAt) ||
          inRange(r.deadline) ||
          inRange(r.completedAt)
      );
    }
    if (status) rows = rows.filter((r) => r.status === status);
    if (brandId) rows = rows.filter((r) => r.brandId === brandId);
    if (assigneeId) rows = rows.filter((r) => r.assigneeId === assigneeId);
    if (managerId) rows = rows.filter((r) => r.managerId === managerId);
    if (search && search.trim()) {
      const s = search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.title.toLowerCase().includes(s) ||
          r.brandName.toLowerCase().includes(s) ||
          r.assigneeName.toLowerCase().includes(s) ||
          r.managerName.toLowerCase().includes(s)
      );
    }

    rows.sort((a, b) => b.createdAt - a.createdAt);

    // Filter dropdowns: admins see every option; scoped users only see the
    // brands / managers / employees that appear in their visible rows so the
    // dropdowns can't reveal anything outside their scope.
    let filterOptions: {
      brands: { _id: any; name: string }[];
      managers: { _id: any; name: string }[];
      assignees: { _id: any; name: string }[];
    };

    if (scope.kind === "admin") {
      filterOptions = {
        brands: allBrands
          .map((b) => ({ _id: b._id, name: b.name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        managers: allUsers
          .filter((u) => u.role === "admin")
          .map((u) => ({ _id: u._id, name: u.name ?? u.email ?? "Unknown" }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        assignees: allUsers
          .map((u) => ({ _id: u._id, name: u.name ?? u.email ?? "Unknown" }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    } else {
      const scopedBrandIds = new Set<string>();
      const scopedManagerIds = new Set<string>();
      const scopedAssigneeIds = new Set<string>();
      for (const r of rows) {
        if (r.brandId) scopedBrandIds.add(r.brandId as unknown as string);
        if (r.managerId)
          scopedManagerIds.add(r.managerId as unknown as string);
        if (r.assigneeId)
          scopedAssigneeIds.add(r.assigneeId as unknown as string);
      }
      filterOptions = {
        brands: allBrands
          .filter((b) => scopedBrandIds.has(b._id as unknown as string))
          .map((b) => ({ _id: b._id, name: b.name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        managers: allUsers
          .filter((u) => scopedManagerIds.has(u._id as unknown as string))
          .map((u) => ({ _id: u._id, name: u.name ?? u.email ?? "Unknown" }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        assignees: allUsers
          .filter((u) => scopedAssigneeIds.has(u._id as unknown as string))
          .map((u) => ({ _id: u._id, name: u.name ?? u.email ?? "Unknown" }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    }

    return {
      access:
        scope.kind === "admin"
          ? { kind: "admin" as const }
          : {
              kind: "scoped" as const,
              brandCount: scope.brandIds.size,
              teamMemberCount: scope.employeeIds.size,
            },
      rows: rows.slice(0, 1000),
      total: rows.length,
      summary: {
        total: rows.length,
        pending: rows.filter((r) => r.status === "pending").length,
        inProgress: rows.filter((r) => r.status === "in-progress").length,
        review: rows.filter((r) => r.status === "review").length,
        done: rows.filter((r) => r.status === "done").length,
        onHold: rows.filter((r) => r.status === "on-hold").length,
      },
      filterOptions,
    };
  },
});

// Approved work (approved deliverables) for one task — powers the
// expandable row on the oversight board. Oversight-admin gated.
// Resolves both legacy Convex-storage and R2 files.
export const getApprovedWorkForTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const scope = await resolveOversightScope(ctx, userId);
    if (!scope) return null;

    const task = await ctx.db.get(taskId);
    if (!task) return [];

    if (scope.kind === "scoped") {
      const brief = await ctx.db.get(task.briefId);
      const taskBrandId = brief?.brandId
        ? (brief.brandId as unknown as string)
        : null;
      const taskAssigneeId = task.assigneeId as unknown as string;
      const inScope =
        (taskBrandId && scope.brandIds.has(taskBrandId)) ||
        scope.employeeIds.has(taskAssigneeId);
      if (!inScope) return null;
    }

    const deliverables = await ctx.db
      .query("deliverables")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();

    const approved = deliverables.filter((d) => {
      if (d.clientStatus === "client_approved") return true;
      if (d.status !== "approved") return false;
      if (task.clientFacing) return false;
      return true;
    });
    if (approved.length === 0) return [];

    const users = await ctx.db.query("users").collect();
    const userMap = new Map(users.map((u) => [u._id, u]));

    return await Promise.all(
      approved
        .sort(
          (a, b) =>
            (b.clientReviewedAt ?? b.reviewedAt ?? b.submittedAt) -
            (a.clientReviewedAt ?? a.reviewedAt ?? a.submittedAt)
        )
        .map(async (d) => {
          let files: { name: string; url: string }[] = [];
          if (d.fileIds && d.fileIds.length > 0) {
            files = (
              await Promise.all(
                d.fileIds.map(async (fileId, idx) => {
                  const url = await ctx.storage.getUrl(fileId);
                  return {
                    name: d.fileNames?.[idx] ?? "file",
                    url: url ?? "",
                  };
                })
              )
            ).filter((f) => f.url);
          }
          if (d.r2FileKeys && d.r2FileKeys.length > 0) {
            files = [
              ...files,
              ...d.r2FileKeys.map((key, idx) => ({
                name: d.r2FileNames?.[idx] ?? "file",
                url: `/api/r2-file?key=${encodeURIComponent(key)}`,
              })),
            ];
          }
          const submitter = userMap.get(d.submittedBy);
          return {
            _id: d._id,
            message: d.message,
            link: d.link ?? null,
            submitterName:
              submitter?.name ?? submitter?.email ?? "Unknown",
            submittedAt: d.submittedAt,
            approvedAt:
              d.clientReviewedAt ?? d.reviewedAt ?? d.submittedAt,
            approvalSource:
              d.clientStatus === "client_approved"
                ? ("client" as const)
                : ("internal" as const),
            clientNote: d.clientNote ?? null,
            reviewNote: d.reviewNote ?? null,
            files,
          };
        })
    );
  },
});

// Daily rolled-up digest: one notification per oversight admin summarising
// every task tagged since the last digest. Run by a daily cron.
export const sendOversightDigest = internalMutation({
  args: {},
  handler: async (ctx) => {
    const oversightAdmins = (await ctx.db.query("users").collect()).filter(
      (u) => u.isOversightAdmin === true
    );
    if (oversightAdmins.length === 0) return { sent: 0 };

    const pending = await ctx.db
      .query("taskOversight")
      .withIndex("by_digested", (q) => q.eq("digestedAt", undefined))
      .collect();

    if (pending.length === 0) return { sent: 0 };

    const allBrands = await ctx.db.query("brands").collect();
    const brandMap = new Map(allBrands.map((b) => [b._id, b]));

    const brandCounts = new Map<string, number>();
    for (const row of pending) {
      const name = row.brandId
        ? brandMap.get(row.brandId)?.name ?? "Unknown brand"
        : "No brand";
      brandCounts.set(name, (brandCounts.get(name) ?? 0) + 1);
    }
    const topBrands = [...brandCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, n]) => `${name} (${n})`)
      .join(", ");

    const now = Date.now();
    const message =
      `${pending.length} new task${pending.length === 1 ? "" : "s"} created ` +
      `across ${brandCounts.size} brand${brandCounts.size === 1 ? "" : "s"}` +
      (topBrands ? ` — ${topBrands}` : "") +
      `. Open Oversight for the full breakdown.`;

    let sent = 0;
    for (const admin of oversightAdmins) {
      await ctx.db.insert("notifications", {
        recipientId: admin._id,
        type: "oversight_digest",
        title: "Daily task oversight digest",
        message,
        triggeredBy: admin._id,
        read: false,
        createdAt: now,
      });
      sent++;
    }

    for (const row of pending) {
      await ctx.db.patch(row._id, { digestedAt: now });
    }

    return { sent, tasks: pending.length };
  },
});
