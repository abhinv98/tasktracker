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

    return {
      ...brand,
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

// Delete brand (admin only, if no active briefs)
export const deleteBrand = mutation({
  args: { brandId: v.id("brands") },
  handler: async (ctx, { brandId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin")
      throw new Error("Only admins can delete brands");

    const briefs = await ctx.db.query("briefs").collect();
    const activeBriefs = briefs.filter(
      (b) =>
        b.brandId === brandId &&
        !["archived", "completed"].includes(b.status)
    );
    if (activeBriefs.length > 0) {
      throw new Error(
        `Cannot delete brand with ${activeBriefs.length} active brief(s). Archive or complete them first.`
      );
    }

    // Remove brand manager assignments
    const managers = await ctx.db
      .query("brandManagers")
      .withIndex("by_brand", (q) => q.eq("brandId", brandId))
      .collect();
    for (const m of managers) {
      await ctx.db.delete(m._id);
    }

    // Unlink briefs
    const brandBriefs = briefs.filter((b) => b.brandId === brandId);
    for (const b of brandBriefs) {
      await ctx.db.patch(b._id, { brandId: undefined });
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
