import { getAuthUserId } from "@convex-dev/auth/server";
import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// ── Super-admin Oversight (Vivek & Mayur only) ─────────────────
// A simplified, filterable board of every task — who's doing it, for
// which brand, status, and which brand manager assigned it — plus a
// once-a-day rolled-up digest notification.

export const amOversightAdmin = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;
    const user = await ctx.db.get(userId);
    return user?.isOversightAdmin === true;
  },
});

export const getOversightBoard = query({
  args: {
    status: v.optional(v.string()),
    brandId: v.optional(v.id("brands")),
    assigneeId: v.optional(v.id("users")),
    managerId: v.optional(v.id("users")),
    search: v.optional(v.string()),
    /** "YYYY-MM-DD" — match tasks created, due, or completed that day. */
    date: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { status, brandId, assigneeId, managerId, search, date }
  ) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user || user.isOversightAdmin !== true) return null;

    const allTasks = await ctx.db.query("tasks").collect();
    const allBriefs = await ctx.db.query("briefs").collect();
    const allBrands = await ctx.db.query("brands").collect();
    const allUsers = await ctx.db.query("users").collect();

    const briefMap = new Map(allBriefs.map((b) => [b._id, b]));
    const brandMap = new Map(allBrands.map((b) => [b._id, b]));
    const userMap = new Map(allUsers.map((u) => [u._id, u]));

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
      };
    });

    if (date) {
      const dayStart = new Date(date + "T00:00:00").getTime();
      const dayEnd = new Date(date + "T23:59:59.999").getTime();
      const onDay = (ts: number | null) =>
        ts != null && ts >= dayStart && ts <= dayEnd;
      rows = rows.filter(
        (r) =>
          onDay(r.createdAt) || onDay(r.deadline) || onDay(r.completedAt)
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

    const filterOptions = {
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

    return {
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
    const user = await ctx.db.get(userId);
    if (!user || user.isOversightAdmin !== true) return null;

    const task = await ctx.db.get(taskId);
    if (!task) return [];

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
