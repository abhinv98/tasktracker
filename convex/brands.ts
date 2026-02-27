import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// List all brands (admin sees all, managers see their assigned brands)
export const listBrands = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user) return [];

    let brands = await ctx.db.query("brands").collect();

    // Managers only see their assigned brands
    if (user.role === "manager") {
      const assignments = await ctx.db
        .query("brandManagers")
        .withIndex("by_manager", (q) => q.eq("managerId", userId))
        .collect();
      const brandIds = assignments.map((a) => a.brandId);
      brands = brands.filter((b) => brandIds.includes(b._id));
    } else if (user.role === "employee") {
      return []; // Employees don't see brands
    }

    const brandManagers = await ctx.db.query("brandManagers").collect();
    const briefs = await ctx.db.query("briefs").collect();
    const users = await ctx.db.query("users").collect();

    return brands.map((brand) => {
      const managers = brandManagers
        .filter((bm) => bm.brandId === brand._id)
        .map((bm) => users.find((u) => u._id === bm.managerId))
        .filter(Boolean);
      const brandBriefs = briefs.filter((b) => b.brandId === brand._id);
      return {
        ...brand,
        managerCount: managers.length,
        managerNames: managers.map(
          (m) => m!.name ?? m!.email ?? "Unknown"
        ),
        briefCount: brandBriefs.length,
        activeBriefCount: brandBriefs.filter(
          (b) => !["archived", "completed"].includes(b.status)
        ).length,
      };
    });
  },
});

// Get single brand with details
export const getBrand = query({
  args: { brandId: v.id("brands") },
  handler: async (ctx, { brandId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const brand = await ctx.db.get(brandId);
    if (!brand) return null;

    const brandManagers = await ctx.db
      .query("brandManagers")
      .withIndex("by_brand", (q) => q.eq("brandId", brandId))
      .collect();
    const users = await ctx.db.query("users").collect();
    const managers = brandManagers
      .map((bm) => users.find((u) => u._id === bm.managerId))
      .filter(Boolean);

    const briefs = await ctx.db.query("briefs").collect();
    const brandBriefs = briefs.filter((b) => b.brandId === brandId);

    const tasks = await ctx.db.query("tasks").collect();
    const brandTasks = tasks.filter((t) =>
      brandBriefs.some((b) => b._id === t.briefId)
    );
    const assigneeIds = [...new Set(brandTasks.map((t) => t.assigneeId))];
    const employees = assigneeIds
      .map((id) => users.find((u) => u._id === id))
      .filter(Boolean);

    const taskStatusCounts = {
      pending: brandTasks.filter((t) => t.status === "pending").length,
      "in-progress": brandTasks.filter((t) => t.status === "in-progress")
        .length,
      review: brandTasks.filter((t) => t.status === "review").length,
      done: brandTasks.filter((t) => t.status === "done").length,
    };

    const creator = users.find((u) => u._id === brand.createdBy);

    return {
      ...brand,
      creatorName: creator?.name ?? creator?.email ?? "Unknown",
      managers,
      briefs: brandBriefs.map((b) => {
        const briefTasks = tasks.filter((t) => t.briefId === b._id);
        const doneCount = briefTasks.filter(
          (t) => t.status === "done"
        ).length;
        return {
          ...b,
          taskCount: briefTasks.length,
          doneCount,
          progress:
            briefTasks.length > 0
              ? (doneCount / briefTasks.length) * 100
              : 0,
        };
      }),
      employees,
      employeeCount: employees.length,
      totalTasks: brandTasks.length,
      taskStatusCounts,
    };
  },
});

// Brand overview for admin dashboard
export const getBrandOverview = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "admin" && user.role !== "manager")) return [];

    const brands = await ctx.db.query("brands").collect();
    const brandManagers = await ctx.db.query("brandManagers").collect();
    const users = await ctx.db.query("users").collect();
    const briefs = await ctx.db.query("briefs").collect();
    const tasks = await ctx.db.query("tasks").collect();

    return brands.map((brand) => {
      const managers = brandManagers
        .filter((bm) => bm.brandId === brand._id)
        .map((bm) => users.find((u) => u._id === bm.managerId))
        .filter(Boolean);

      const brandBriefs = briefs.filter((b) => b.brandId === brand._id);
      const brandTasks = tasks.filter((t) =>
        brandBriefs.some((b) => b._id === t.briefId)
      );
      const assigneeIds = [...new Set(brandTasks.map((t) => t.assigneeId))];
      const employees = assigneeIds
        .map((id) => users.find((u) => u._id === id))
        .filter(Boolean);

      return {
        ...brand,
        managers: managers.map((m) => ({
          _id: m!._id,
          name: m!.name,
          email: m!.email,
        })),
        employeeCount: employees.length,
        briefCount: brandBriefs.length,
        activeBriefCount: brandBriefs.filter(
          (b) => !["archived", "completed"].includes(b.status)
        ).length,
        totalTasks: brandTasks.length,
        taskStatusCounts: {
          pending: brandTasks.filter((t) => t.status === "pending").length,
          "in-progress": brandTasks.filter(
            (t) => t.status === "in-progress"
          ).length,
          review: brandTasks.filter((t) => t.status === "review").length,
          done: brandTasks.filter((t) => t.status === "done").length,
        },
        progress:
          brandTasks.length > 0
            ? (brandTasks.filter((t) => t.status === "done").length /
                brandTasks.length) *
              100
            : 0,
      };
    });
  },
});

// Create brand (admin only)
export const createBrand = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "admin" && user.role !== "manager"))
      throw new Error("Only admins and managers can create brands");

    return await ctx.db.insert("brands", {
      ...args,
      createdBy: userId,
      createdAt: Date.now(),
    });
  },
});

// Update brand (admin only)
export const updateBrand = mutation({
  args: {
    brandId: v.id("brands"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, { brandId, ...fields }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin")
      throw new Error("Only admins can update brands");

    const updates: Record<string, unknown> = {};
    if (fields.name !== undefined) updates.name = fields.name;
    if (fields.description !== undefined)
      updates.description = fields.description;
    if (fields.color !== undefined) updates.color = fields.color;

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(brandId, updates);
    }
  },
});

// Delete brand and all associated data (admin only)
export const deleteBrand = mutation({
  args: { brandId: v.id("brands") },
  handler: async (ctx, { brandId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Not authenticated");

    const managers = await ctx.db
      .query("brandManagers")
      .withIndex("by_brand", (q) => q.eq("brandId", brandId))
      .collect();

    const isAssignedManager =
      user.role === "manager" && managers.some((m) => m.managerId === userId);

    if (user.role !== "admin" && !isAssignedManager)
      throw new Error("Only admins or the assigned manager can delete this brand");

    for (const m of managers) {
      await ctx.db.delete(m._id);
    }

    // Cascade delete all briefs and their associated data
    const briefs = await ctx.db.query("briefs").collect();
    const brandBriefs = briefs.filter((b) => b.brandId === brandId);

    for (const brief of brandBriefs) {
      // Delete tasks and their associated data
      const tasks = await ctx.db
        .query("tasks")
        .withIndex("by_brief", (q) => q.eq("briefId", brief._id))
        .collect();

      for (const task of tasks) {
        // Delete deliverables (and their stored files)
        const deliverables = await ctx.db
          .query("deliverables")
          .withIndex("by_task", (q) => q.eq("taskId", task._id))
          .collect();
        for (const d of deliverables) {
          if (d.fileIds) {
            for (const fid of d.fileIds) {
              await ctx.storage.delete(fid);
            }
          }
          await ctx.db.delete(d._id);
        }

        // Delete time entries
        const timeEntries = await ctx.db
          .query("timeEntries")
          .withIndex("by_task", (q) => q.eq("taskId", task._id))
          .collect();
        for (const te of timeEntries) {
          await ctx.db.delete(te._id);
        }

        // Delete task comments and their reactions
        const taskComments = await ctx.db
          .query("comments")
          .withIndex("by_parent", (q) =>
            q.eq("parentType", "task").eq("parentId", task._id)
          )
          .collect();
        for (const c of taskComments) {
          const reactions = await ctx.db
            .query("commentReactions")
            .withIndex("by_comment", (q) => q.eq("commentId", c._id))
            .collect();
          for (const r of reactions) await ctx.db.delete(r._id);
          if (c.attachmentId) await ctx.storage.delete(c.attachmentId);
          await ctx.db.delete(c._id);
        }

        // Delete task attachments
        const taskAttachments = await ctx.db
          .query("attachments")
          .withIndex("by_parent", (q) =>
            q.eq("parentType", "task").eq("parentId", task._id)
          )
          .collect();
        for (const a of taskAttachments) {
          await ctx.storage.delete(a.fileId);
          await ctx.db.delete(a._id);
        }

        // Delete planner items linked to this task
        const plannerItems = await ctx.db
          .query("plannerItems")
          .withIndex("by_task", (q) => q.eq("taskId", task._id))
          .collect();
        for (const pi of plannerItems) {
          await ctx.db.delete(pi._id);
        }

        await ctx.db.delete(task._id);
      }

      // Delete brief team assignments
      const briefTeams = await ctx.db
        .query("briefTeams")
        .withIndex("by_brief", (q) => q.eq("briefId", brief._id))
        .collect();
      for (const bt of briefTeams) {
        await ctx.db.delete(bt._id);
      }

      // Delete brief comments and their reactions
      const briefComments = await ctx.db
        .query("comments")
        .withIndex("by_parent", (q) =>
          q.eq("parentType", "brief").eq("parentId", brief._id)
        )
        .collect();
      for (const c of briefComments) {
        const reactions = await ctx.db
          .query("commentReactions")
          .withIndex("by_comment", (q) => q.eq("commentId", c._id))
          .collect();
        for (const r of reactions) await ctx.db.delete(r._id);
        if (c.attachmentId) await ctx.storage.delete(c.attachmentId);
        await ctx.db.delete(c._id);
      }

      // Delete brief attachments
      const briefAttachments = await ctx.db
        .query("attachments")
        .withIndex("by_parent", (q) =>
          q.eq("parentType", "brief").eq("parentId", brief._id)
        )
        .collect();
      for (const a of briefAttachments) {
        await ctx.storage.delete(a.fileId);
        await ctx.db.delete(a._id);
      }

      // Delete activity log entries
      const activityLogs = await ctx.db
        .query("activityLog")
        .withIndex("by_brief", (q) => q.eq("briefId", brief._id))
        .collect();
      for (const log of activityLogs) {
        await ctx.db.delete(log._id);
      }

      // Delete notifications linked to this brief
      const notifications = await ctx.db.query("notifications").collect();
      for (const n of notifications) {
        if (n.briefId === brief._id) {
          await ctx.db.delete(n._id);
        }
      }

      // Delete comment read receipts for this brief
      const allReceipts = await ctx.db.query("commentReadReceipts").collect();
      for (const r of allReceipts) {
        if (r.briefId === brief._id) {
          await ctx.db.delete(r._id);
        }
      }

      // Delete typing indicators for this brief
      const typingIndicators = await ctx.db
        .query("typingIndicators")
        .withIndex("by_brief", (q) => q.eq("briefId", brief._id))
        .collect();
      for (const ti of typingIndicators) {
        await ctx.db.delete(ti._id);
      }

      await ctx.db.delete(brief._id);
    }

    await ctx.db.delete(brandId);
  },
});

// Assign manager to brand
export const assignManagerToBrand = mutation({
  args: {
    brandId: v.id("brands"),
    managerId: v.id("users"),
  },
  handler: async (ctx, { brandId, managerId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin")
      throw new Error("Only admins can assign managers");

    // Check if already assigned
    const existing = await ctx.db
      .query("brandManagers")
      .withIndex("by_brand", (q) => q.eq("brandId", brandId))
      .collect();
    if (existing.some((e) => e.managerId === managerId)) return;

    await ctx.db.insert("brandManagers", { brandId, managerId });
  },
});

// Remove manager from brand
export const removeManagerFromBrand = mutation({
  args: {
    brandId: v.id("brands"),
    managerId: v.id("users"),
  },
  handler: async (ctx, { brandId, managerId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin")
      throw new Error("Only admins can remove managers");

    const assignments = await ctx.db
      .query("brandManagers")
      .withIndex("by_brand", (q) => q.eq("brandId", brandId))
      .collect();
    const target = assignments.find((a) => a.managerId === managerId);
    if (target) {
      await ctx.db.delete(target._id);
    }
  },
});
