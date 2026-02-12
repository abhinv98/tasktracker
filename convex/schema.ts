import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  // ─── USERS (extends auth users with app fields) ──
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(
      v.union(
        v.literal("admin"),
        v.literal("manager"),
        v.literal("employee")
      )
    ),
    avatarUrl: v.optional(v.string()),
    designation: v.optional(v.string()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_role", ["role"]),

  // ─── TEAMS ────────────────────────────────────
  teams: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    leadId: v.id("users"),
    color: v.string(),
    createdBy: v.id("users"),
  }).index("by_lead", ["leadId"]),

  // ─── USER ↔ TEAM (Many-to-Many) ──────────────
  userTeams: defineTable({
    userId: v.id("users"),
    teamId: v.id("teams"),
    joinedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_team", ["teamId"])
    .index("by_user_team", ["userId", "teamId"]),

  // ─── BRIEFS ───────────────────────────────────
  briefs: defineTable({
    title: v.string(),
    description: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("active"),
      v.literal("in-progress"),
      v.literal("review"),
      v.literal("completed"),
      v.literal("archived")
    ),
    createdBy: v.id("users"),
    assignedManagerId: v.optional(v.id("users")),
    globalPriority: v.number(),
    deadline: v.optional(v.number()),
    archivedAt: v.optional(v.number()),
    archivedBy: v.optional(v.id("users")),
    brandId: v.optional(v.id("brands")),
  })
    .index("by_status", ["status"])
    .index("by_manager", ["assignedManagerId"])
    .index("by_priority", ["globalPriority"]),

  // ─── BRIEF ↔ TEAM (Many-to-Many) ─────────────
  briefTeams: defineTable({
    briefId: v.id("briefs"),
    teamId: v.id("teams"),
  })
    .index("by_brief", ["briefId"])
    .index("by_team", ["teamId"]),

  // ─── TASKS ────────────────────────────────────
  tasks: defineTable({
    briefId: v.id("briefs"),
    title: v.string(),
    description: v.optional(v.string()),
    assigneeId: v.id("users"),
    assignedBy: v.id("users"),
    status: v.union(
      v.literal("pending"),
      v.literal("in-progress"),
      v.literal("review"),
      v.literal("done")
    ),
    sortOrder: v.number(),
    duration: v.string(),
    durationMinutes: v.number(),
    deadline: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    blockedBy: v.optional(v.array(v.id("tasks"))),
  })
    .index("by_brief", ["briefId"])
    .index("by_assignee", ["assigneeId"])
    .index("by_assignee_sort", ["assigneeId", "sortOrder"])
    .index("by_brief_assignee", ["briefId", "assigneeId"]),

  // ─── DELIVERABLES ────────────────────────────
  deliverables: defineTable({
    taskId: v.id("tasks"),
    submittedBy: v.id("users"),
    link: v.optional(v.string()),
    message: v.string(),
    submittedAt: v.number(),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected")
      )
    ),
    reviewedBy: v.optional(v.id("users")),
    reviewNote: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
  }).index("by_task", ["taskId"]),

  // ─── COMMENTS ──────────────────────────────────
  comments: defineTable({
    parentType: v.union(v.literal("brief"), v.literal("task")),
    parentId: v.string(),
    userId: v.id("users"),
    content: v.string(),
    createdAt: v.number(),
    pinned: v.optional(v.boolean()),
    pinnedBy: v.optional(v.id("users")),
    attachmentId: v.optional(v.id("_storage")),
    attachmentName: v.optional(v.string()),
  })
    .index("by_parent", ["parentType", "parentId", "createdAt"]),

  // ─── ATTACHMENTS ───────────────────────────────
  attachments: defineTable({
    parentType: v.union(v.literal("brief"), v.literal("task")),
    parentId: v.string(),
    fileId: v.id("_storage"),
    fileName: v.string(),
    fileType: v.optional(v.string()),
    uploadedBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_parent", ["parentType", "parentId"]),

  // ─── TIME ENTRIES ──────────────────────────────
  timeEntries: defineTable({
    taskId: v.id("tasks"),
    userId: v.id("users"),
    startedAt: v.number(),
    stoppedAt: v.optional(v.number()),
    durationMinutes: v.optional(v.number()),
    manual: v.boolean(),
  })
    .index("by_task", ["taskId"])
    .index("by_user", ["userId"]),

  // ─── BRIEF TEMPLATES ──────────────────────────
  briefTemplates: defineTable({
    name: v.string(),
    description: v.string(),
    tasks: v.array(
      v.object({
        title: v.string(),
        description: v.optional(v.string()),
        duration: v.string(),
        durationMinutes: v.number(),
      })
    ),
    createdBy: v.id("users"),
    createdAt: v.number(),
  }),

  // ─── NOTIFICATIONS ────────────────────────────
  notifications: defineTable({
    recipientId: v.id("users"),
    type: v.union(
      v.literal("task_assigned"),
      v.literal("task_status_changed"),
      v.literal("brief_assigned"),
      v.literal("deliverable_submitted"),
      v.literal("priority_changed"),
      v.literal("brief_completed"),
      v.literal("team_added"),
      v.literal("comment"),
      v.literal("deadline_reminder"),
      v.literal("deliverable_approved"),
      v.literal("deliverable_rejected")
    ),
    title: v.string(),
    message: v.string(),
    briefId: v.optional(v.id("briefs")),
    taskId: v.optional(v.id("tasks")),
    triggeredBy: v.id("users"),
    read: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_recipient", ["recipientId"])
    .index("by_recipient_read", ["recipientId", "read"])
    .index("by_recipient_time", ["recipientId", "createdAt"]),

  // ─── ACTIVITY LOG ────────────────────────────
  activityLog: defineTable({
    briefId: v.id("briefs"),
    taskId: v.optional(v.id("tasks")),
    userId: v.id("users"),
    action: v.string(),
    details: v.optional(v.string()),
    timestamp: v.number(),
  })
    .index("by_brief", ["briefId"])
    .index("by_brief_time", ["briefId", "timestamp"]),

  // ─── INVITES ─────────────────────────────────
  invites: defineTable({
    email: v.string(),
    name: v.string(),
    designation: v.optional(v.string()),
    role: v.union(
      v.literal("admin"),
      v.literal("manager"),
      v.literal("employee")
    ),
    teamId: v.optional(v.id("teams")),
    token: v.string(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    used: v.boolean(),
  })
    .index("by_token", ["token"])
    .index("by_email", ["email"]),

  // ─── BRANDS ──────────────────────────────────
  brands: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    color: v.string(),
    createdBy: v.id("users"),
    createdAt: v.number(),
  }),

  // ─── BRAND ↔ MANAGER (Many-to-Many) ─────────
  brandManagers: defineTable({
    brandId: v.id("brands"),
    managerId: v.id("users"),
  })
    .index("by_brand", ["brandId"])
    .index("by_manager", ["managerId"]),

  // ─── CHAT CONVERSATIONS ────────────────────
  chatConversations: defineTable({
    userId: v.id("users"),
    title: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId", "updatedAt"]),

  // ─── CHAT MESSAGES ─────────────────────────
  chatMessages: defineTable({
    userId: v.id("users"),
    conversationId: v.optional(v.id("chatConversations")),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    fileId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    toolSteps: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_conversation", ["conversationId", "createdAt"]),

  // ─── SCHEDULE BLOCKS (Calendar Planner) ───
  scheduleBlocks: defineTable({
    userId: v.id("users"),
    date: v.string(),
    startTime: v.number(),
    endTime: v.number(),
    type: v.union(v.literal("brief_task"), v.literal("personal")),
    taskId: v.optional(v.id("tasks")),
    briefId: v.optional(v.id("briefs")),
    title: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    completed: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_user_date", ["userId", "date"])
    .index("by_task", ["taskId"]),

  // ─── DAILY NOTES (Calendar Planner) ───────
  dailyNotes: defineTable({
    userId: v.id("users"),
    date: v.string(),
    content: v.string(),
    updatedAt: v.number(),
  })
    .index("by_user_date", ["userId", "date"]),

  // ─── COMMENT READ RECEIPTS ────────────────
  commentReadReceipts: defineTable({
    userId: v.id("users"),
    briefId: v.id("briefs"),
    lastReadAt: v.number(),
  })
    .index("by_user_brief", ["userId", "briefId"])
    .index("by_user", ["userId"]),

  // ─── COMMENT REACTIONS ────────────────────
  commentReactions: defineTable({
    commentId: v.id("comments"),
    userId: v.id("users"),
    emoji: v.string(),
  })
    .index("by_comment", ["commentId"])
    .index("by_user_comment", ["userId", "commentId"]),

  // ─── TYPING INDICATORS ────────────────────
  typingIndicators: defineTable({
    userId: v.id("users"),
    briefId: v.id("briefs"),
    lastTypedAt: v.number(),
  })
    .index("by_brief", ["briefId"])
    .index("by_user_brief", ["userId", "briefId"]),
});
