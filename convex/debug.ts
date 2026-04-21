import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

/**
 * Debug query: dumps the raw state of Elma Zarin Khan's tasks in the TOI Kolkata brand.
 *
 * Purpose: diagnose why her dashboard shows "2/11 tasks done" while all Content Calendar
 * entries are marked "Published", and why "Amar Parar Alpona" shows "completed" but 0/1.
 *
 * How to run:
 *   From the Convex dashboard, Functions tab, find `debug:dumpElmaTOIKolkata`
 *   and click "Run". Args are optional (empty object).
 *
 * Returns:
 *   - Elma's user record
 *   - TOI Kolkata brand record
 *   - For each brief in the brand:
 *       - Brief metadata + status
 *       - Total tasks, Elma's task count, status breakdown
 *       - Per-task detail for Elma: status, parent, deliverables, timestamps
 *       - Parent/child task tree: for each parent calendar entry, show its
 *         own status vs each child's status. This is where the mismatch
 *         should become obvious.
 */
export const dumpElmaTOIKolkata = internalQuery({
  args: {
    // Override the name match if the assumption is wrong
    userSearch: v.optional(v.string()),
    brandSearch: v.optional(v.string()),
  },
  handler: async (ctx, { userSearch = "elma", brandSearch = "toi" }) => {
    const needle = userSearch.toLowerCase();
    const brandNeedle = brandSearch.toLowerCase();

    const allUsers = await ctx.db.query("users").collect();
    const userById = new Map<Id<"users">, (typeof allUsers)[number]>(
      allUsers.map((u) => [u._id, u])
    );

    const elma = allUsers.find(
      (u) =>
        (u.name ?? "").toLowerCase().includes(needle) ||
        (u.email ?? "").toLowerCase().includes(needle)
    );
    if (!elma) {
      return {
        error: `User matching '${userSearch}' not found`,
        hint: "Try passing userSearch explicitly, e.g. { userSearch: 'zarin' }",
        allUserNames: allUsers.map((u) => u.name ?? u.email ?? u._id),
      };
    }

    const allBrands = await ctx.db.query("brands").collect();
    const brand = allBrands.find((b) =>
      (b.name ?? "").toLowerCase().includes(brandNeedle)
    );
    if (!brand) {
      return {
        error: `Brand matching '${brandSearch}' not found`,
        allBrandNames: allBrands.map((b) => b.name),
      };
    }

    // All briefs in this brand
    const briefs = await ctx.db
      .query("briefs")
      .filter((q) => q.eq(q.field("brandId"), brand._id))
      .collect();

    // Aggregate trackers across the whole brand
    let totalElmaTasks = 0;
    let totalElmaDone = 0;
    const bugs: string[] = [];

    const briefsDetailed = await Promise.all(
      briefs.map(async (brief) => {
        const allTasks = await ctx.db
          .query("tasks")
          .withIndex("by_brief", (q) => q.eq("briefId", brief._id))
          .collect();

        // Deliverables per task (collect once, index by taskId)
        const allDeliverables = await Promise.all(
          allTasks.map((t) =>
            ctx.db
              .query("deliverables")
              .withIndex("by_task", (q) => q.eq("taskId", t._id))
              .collect()
          )
        );
        const deliverablesByTask = new Map<Id<"tasks">, (typeof allDeliverables)[number]>();
        allTasks.forEach((t, i) => deliverablesByTask.set(t._id, allDeliverables[i]));

        // Split parent vs child tasks
        const parentTasks = allTasks.filter((t) => !t.parentTaskId);
        const childrenByParent = new Map<Id<"tasks">, typeof allTasks>();
        for (const t of allTasks) {
          if (t.parentTaskId) {
            const list = childrenByParent.get(t.parentTaskId) ?? [];
            list.push(t);
            childrenByParent.set(t.parentTaskId, list);
          }
        }

        const elmaTasks = allTasks.filter((t) => t.assigneeId === elma._id);
        const elmaDone = elmaTasks.filter((t) => t.status === "done").length;
        totalElmaTasks += elmaTasks.length;
        totalElmaDone += elmaDone;

        // Brief-level sanity checks
        const allTasksDone = allTasks.length > 0 && allTasks.every((t) => t.status === "done");
        if (brief.status === "completed" && !allTasksDone) {
          bugs.push(
            `Brief "${brief.title}" is marked 'completed' in DB but ${
              allTasks.filter((t) => t.status !== "done").length
            } task(s) are NOT done. Not-done task IDs: ${allTasks
              .filter((t) => t.status !== "done")
              .map((t) => `${t._id}(${t.status})`)
              .join(", ")}`
          );
        }

        // Parent vs child status mismatch detection
        const parentChildMismatches: Array<{
          parentId: Id<"tasks">;
          parentTitle: string;
          parentStatus: string;
          parentPostDate?: string;
          children: Array<{
            _id: Id<"tasks">;
            title: string;
            status: string;
            assigneeName: string | null;
            isElma: boolean;
          }>;
        }> = [];

        for (const parent of parentTasks) {
          const children = childrenByParent.get(parent._id) ?? [];
          if (children.length === 0) continue;
          const anyChildNotDone = children.some((c) => c.status !== "done");
          if (parent.status === "done" && anyChildNotDone) {
            parentChildMismatches.push({
              parentId: parent._id,
              parentTitle: parent.title,
              parentStatus: parent.status,
              parentPostDate: parent.postDate,
              children: children.map((c) => ({
                _id: c._id,
                title: c.title,
                status: c.status,
                assigneeName:
                  userById.get(c.assigneeId)?.name ??
                  userById.get(c.assigneeId)?.email ??
                  null,
                isElma: c.assigneeId === elma._id,
              })),
            });
          }
        }

        // Elma's task detail
        const elmaTaskDetail = elmaTasks.map((t) => {
          const parent = t.parentTaskId
            ? allTasks.find((x) => x._id === t.parentTaskId)
            : null;
          const deliverables = deliverablesByTask.get(t._id) ?? [];
          return {
            _id: t._id,
            title: t.title,
            status: t.status,
            parentTaskId: t.parentTaskId,
            parentTitle: parent?.title,
            parentStatus: parent?.status,
            postDate: t.postDate,
            platform: t.platform,
            contentType: t.contentType,
            deadline: t.deadline,
            deadlineISO: t.deadline ? new Date(t.deadline).toISOString() : null,
            completedAt: t.completedAt,
            submittedForReviewAt: t.submittedForReviewAt,
            handoffTargetTeamId: t.handoffTargetTeamId,
            clientFacing: t.clientFacing,
            deliverableCount: deliverables.length,
            deliverables: deliverables.map((d) => ({
              _id: d._id,
              status: d.status,
              teamLeadStatus: d.teamLeadStatus,
              mainAssigneeStatus: d.mainAssigneeStatus,
              clientStatus: d.clientStatus,
              submittedAt: d._creationTime,
            })),
          };
        });

        // Full status breakdowns for quick-glance summary
        const elmaStatusCounts: Record<string, number> = {};
        elmaTasks.forEach((t) => {
          elmaStatusCounts[t.status] = (elmaStatusCounts[t.status] ?? 0) + 1;
        });
        const allStatusCounts: Record<string, number> = {};
        allTasks.forEach((t) => {
          allStatusCounts[t.status] = (allStatusCounts[t.status] ?? 0) + 1;
        });

        return {
          brief: {
            _id: brief._id,
            title: brief.title,
            status: brief.status,
            briefType: brief.briefType,
            deadline: brief.deadline,
            deadlineISO: brief.deadline ? new Date(brief.deadline).toISOString() : null,
            assignedManagerId: brief.assignedManagerId,
            managerName: brief.assignedManagerId
              ? userById.get(brief.assignedManagerId)?.name ?? null
              : null,
          },
          counts: {
            totalTasks: allTasks.length,
            parentTasks: parentTasks.length,
            childTasks: allTasks.length - parentTasks.length,
            elmaTaskCount: elmaTasks.length,
            elmaTasksDone: elmaDone,
          },
          statusBreakdown: {
            elma: elmaStatusCounts,
            allTasks: allStatusCounts,
          },
          briefLevelFlags: {
            briefStatusSaysCompleted: brief.status === "completed",
            everyTaskIsDone: allTasksDone,
            missingDoneCount: allTasks.filter((t) => t.status !== "done").length,
          },
          parentChildMismatches,
          elmaTasks: elmaTaskDetail,
        };
      })
    );

    return {
      runAt: new Date().toISOString(),
      elma: {
        _id: elma._id,
        name: elma.name,
        email: elma.email,
        role: elma.role,
        isSuperAdmin: elma.isSuperAdmin,
      },
      brand: { _id: brand._id, name: brand.name },
      aggregate: {
        totalBriefsInBrand: briefs.length,
        totalElmaTasks,
        totalElmaDone,
        expectedDashboardDisplay: `${totalElmaDone}/${totalElmaTasks}`,
      },
      suspectedBugs: bugs,
      briefs: briefsDetailed,
    };
  },
});

/**
 * Follow-up mutation: re-run brief-status sync for every brief in a brand.
 * Use ONLY after inspecting the dump above and confirming a brief is stuck
 * in an incorrect status. This will re-apply the sync helper rules.
 *
 * NOT scheduled, run manually from Convex dashboard.
 */
export const resyncBrandBriefStatuses = internalQuery({
  args: { brandSearch: v.optional(v.string()) },
  handler: async (ctx, { brandSearch = "toi" }) => {
    // Read-only preview: shows what statuses WOULD be if the sync helpers
    // were called. Does not mutate. If you want to mutate, convert this to
    // internalMutation and swap `preview` for actual `ctx.db.patch`.
    const brandNeedle = brandSearch.toLowerCase();
    const allBrands = await ctx.db.query("brands").collect();
    const brand = allBrands.find((b) =>
      (b.name ?? "").toLowerCase().includes(brandNeedle)
    );
    if (!brand) return { error: "Brand not found" };

    const briefs = await ctx.db
      .query("briefs")
      .filter((q) => q.eq(q.field("brandId"), brand._id))
      .collect();

    const preview = await Promise.all(
      briefs.map(async (brief) => {
        const tasks = await ctx.db
          .query("tasks")
          .withIndex("by_brief", (q) => q.eq("briefId", brief._id))
          .collect();
        const allDone = tasks.length > 0 && tasks.every((t) => t.status === "done");
        let proposedStatus: string | null = null;
        if (brief.briefType === "single_task" && tasks[0]) {
          const map: Record<string, string> = {
            pending: "active",
            "in-progress": "in-progress",
            review: "review",
            done: "completed",
          };
          proposedStatus = map[tasks[0].status] ?? null;
        } else if (allDone) {
          proposedStatus = "completed";
        }
        return {
          briefId: brief._id,
          title: brief.title,
          currentStatus: brief.status,
          proposedStatus,
          wouldChange: proposedStatus && brief.status !== proposedStatus,
          taskStatusCounts: tasks.reduce((acc, t) => {
            acc[t.status] = (acc[t.status] ?? 0) + 1;
            return acc;
          }, {} as Record<string, number>),
        };
      })
    );

    return { brand: brand.name, preview };
  },
});
