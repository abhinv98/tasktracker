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
        v.literal("employee")
      )
    ),
    avatarUrl: v.optional(v.string()),
    designation: v.optional(v.string()),
    isSuperAdmin: v.optional(v.boolean()),
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
      v.literal("archived"),
      v.literal("rejected"),
      v.literal("on_hold"),
      v.literal("sent_to_client")
    ),
    briefType: v.optional(
      v.union(
        v.literal("developmental"),
        v.literal("designing"),
        v.literal("video_editing"),
        v.literal("content_calendar"),
        v.literal("copywriting"),
        v.literal("single_task")
      )
    ),
    createdBy: v.id("users"),
    assignedManagerId: v.optional(v.id("users")),
    globalPriority: v.number(),
    deadline: v.optional(v.number()),
    archivedAt: v.optional(v.number()),
    archivedBy: v.optional(v.id("users")),
    brandId: v.optional(v.id("brands")),
    /** Expected number of creative deliverables (e.g. 4 static posts). Default UI treats missing as 1. */
    creativesRequired: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_manager", ["assignedManagerId"])
    .index("by_priority", ["globalPriority"]),

  // ─── BRIEF ↔ TEAM (Many-to-Many) ─────────────
  briefTeams: defineTable({
    briefId: v.id("briefs"),
    teamId: v.id("teams"),
    /** Order of this team in the sequential flowchart (0-based) */
    order: v.optional(v.number()),
  })
    .index("by_brief", ["briefId"])
    .index("by_team", ["teamId"]),

  // ─── TASK CONNECTIONS (sequential flow between tasks) ──
  taskConnections: defineTable({
    briefId: v.id("briefs"),
    sourceTaskId: v.id("tasks"),
    targetTaskId: v.id("tasks"),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_brief", ["briefId"])
    .index("by_source", ["sourceTaskId"])
    .index("by_target", ["targetTaskId"]),

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
    duration: v.optional(v.string()),
    durationMinutes: v.optional(v.number()),
    deadline: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    submittedForReviewAt: v.optional(v.number()),
    blockedBy: v.optional(v.array(v.id("tasks"))),
    platform: v.optional(v.string()),
    contentType: v.optional(v.string()),
    postDate: v.optional(v.string()),
    assignedAt: v.optional(v.number()),
    parentTaskId: v.optional(v.id("tasks")),
    referenceLinks: v.optional(v.array(v.string())),
    clientFacing: v.optional(v.boolean()),
    needsClientInput: v.optional(v.boolean()),
    clientInputMessage: v.optional(v.string()),
    deadlineExtended: v.optional(v.boolean()),
    originalDeadline: v.optional(v.number()),
    overdueAcknowledged: v.optional(v.boolean()),
    overdueContacted: v.optional(v.boolean()),
    overdueContactDenied: v.optional(v.boolean()),
    haltLocked: v.optional(v.boolean()),
    creativeCopy: v.optional(v.string()),
    caption: v.optional(v.string()),
    /** Pre-configured: which team should receive handoff when this task's deliverable is approved */
    handoffTargetTeamId: v.optional(v.id("teams")),
    /** If this task was created via handoff, the source deliverable */
    sourceDeliverableId: v.optional(v.id("deliverables")),
    /** If this task was created via handoff, the source task it was handed off from */
    handoffSourceTaskId: v.optional(v.id("tasks")),
    /** Flow canvas position (X coordinate) */
    flowX: v.optional(v.number()),
    /** Flow canvas position (Y coordinate) */
    flowY: v.optional(v.number()),
  })
    .index("by_brief", ["briefId"])
    .index("by_assignee", ["assigneeId"])
    .index("by_assignee_sort", ["assigneeId", "sortOrder"])
    .index("by_brief_assignee", ["briefId", "assigneeId"])
    .index("by_parent", ["parentTaskId"]),

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
    fileIds: v.optional(v.array(v.id("_storage"))),
    fileNames: v.optional(v.array(v.string())),
    teamLeadStatus: v.optional(v.union(v.literal("pending"), v.literal("approved"), v.literal("changes_requested"), v.literal("rejected"))),
    teamLeadReviewedBy: v.optional(v.id("users")),
    teamLeadReviewNote: v.optional(v.string()),
    teamLeadReviewedAt: v.optional(v.number()),
    passedToManagerBy: v.optional(v.id("users")),
    passedToManagerAt: v.optional(v.number()),
    // Sub-task deliverable review by main (parent) task assignee
    mainAssigneeStatus: v.optional(v.union(v.literal("pending"), v.literal("approved"), v.literal("changes_requested"))),
    mainAssigneeReviewedBy: v.optional(v.id("users")),
    mainAssigneeReviewNote: v.optional(v.string()),
    mainAssigneeReviewedAt: v.optional(v.number()),
    clientStatus: v.optional(v.union(v.literal("pending_client"), v.literal("client_approved"), v.literal("client_changes_requested"), v.literal("client_denied"))),
    clientNote: v.optional(v.string()),
    clientReviewedAt: v.optional(v.number()),
    sentToClientAt: v.optional(v.number()),
    sentToClientBy: v.optional(v.id("users")),
  })
    .index("by_task", ["taskId"])
    .index("by_submittedBy", ["submittedBy"]),

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

  // ─── TASK DAILY SUMMARIES ─────────────────────
  taskDailySummaries: defineTable({
    taskId: v.id("tasks"),
    userId: v.id("users"),
    date: v.string(),
    summary: v.string(),
    createdAt: v.number(),
  })
    .index("by_task", ["taskId"])
    .index("by_task_date", ["taskId", "date"]),

  // ─── BRIEF TEMPLATES ──────────────────────────
  briefTemplates: defineTable({
    name: v.string(),
    description: v.string(),
    tasks: v.array(
      v.object({
        title: v.string(),
        description: v.optional(v.string()),
        duration: v.optional(v.string()),
        durationMinutes: v.optional(v.number()),
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
      v.literal("deliverable_rejected"),
      v.literal("direct_message"),
      v.literal("jsr_task_added"),
      v.literal("client_approved"),
      v.literal("client_changes_requested"),
      v.literal("client_denied"),
      v.literal("client_input_requested"),
      v.literal("overdue_contact"),
      v.literal("deadline_extended")
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
    logoId: v.optional(v.id("_storage")),
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
    createdBy: v.optional(v.id("users")),
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

  // ─── DIRECT MESSAGES ────────────────────
  directMessages: defineTable({
    senderId: v.id("users"),
    recipientId: v.id("users"),
    content: v.string(),
    readAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_participants", ["senderId", "recipientId", "createdAt"])
    .index("by_recipient", ["recipientId", "createdAt"])
    .index("by_sender_recipient", ["senderId", "recipientId"]),

  // ─── BRAND DOCUMENTS ──────────────────
  brandDocuments: defineTable({
    brandId: v.id("brands"),
    fileId: v.id("_storage"),
    fileName: v.string(),
    fileType: v.optional(v.string()),
    visibility: v.union(v.literal("all"), v.literal("admin_only")),
    category: v.optional(v.string()),
    uploadedBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_brand", ["brandId"])
    .index("by_brand_visibility", ["brandId", "visibility"]),

  // ─── BRAND CREDENTIALS ────────────────
  brandCredentials: defineTable({
    brandId: v.id("brands"),
    platform: v.string(),
    label: v.optional(v.string()),
    username: v.optional(v.string()),
    password: v.optional(v.string()),
    url: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_brand", ["brandId"]),

  // ─── BRAND IMPORTANT LINKS ─────────────
  brandLinks: defineTable({
    brandId: v.id("brands"),
    url: v.string(),
    label: v.string(),
    description: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
  }).index("by_brand", ["brandId"]),

  // ─── CONTENT CALENDAR BREAK DAYS ──────────────
  contentCalendarBreakDays: defineTable({
    briefId: v.id("briefs"),
    date: v.string(), // "YYYY-MM-DD"
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_brief", ["briefId"])
    .index("by_brief_date", ["briefId", "date"]),

  // ─── CONTENT CALENDAR SHEETS (month tabs) ───
  contentCalendarSheets: defineTable({
    briefId: v.id("briefs"),
    month: v.string(),
    label: v.optional(v.string()),
    sortOrder: v.number(),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_brief", ["briefId"]),

  // ─── MEETING MINUTES (MOM) ──────────────
  meetingMinutes: defineTable({
    brandId: v.id("brands"),
    title: v.string(),
    meetingDate: v.number(),
    attendees: v.optional(v.array(v.string())),
    content: v.string(),
    transcriptFileId: v.optional(v.id("_storage")),
    transcriptFileName: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_brand", ["brandId"])
    .index("by_brand_date", ["brandId", "meetingDate"]),

  // ─── JSR LINKS ────────────────────────
  jsrLinks: defineTable({
    brandId: v.id("brands"),
    token: v.string(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    isActive: v.boolean(),
    label: v.optional(v.string()),
  })
    .index("by_token", ["token"])
    .index("by_brand", ["brandId"]),

  // ─── JSR CLIENT TASKS ─────────────────
  jsrClientTasks: defineTable({
    brandId: v.id("brands"),
    jsrLinkId: v.id("jsrLinks"),
    title: v.string(),
    description: v.optional(v.string()),
    proposedDeadline: v.optional(v.number()),
    finalDeadline: v.optional(v.number()),
    cumulativeDeadline: v.optional(v.number()),
    status: v.union(
      v.literal("pending_review"),
      v.literal("accepted"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("declined")
    ),
    internalNotes: v.optional(v.string()),
    clientName: v.optional(v.string()),
    linkedTaskId: v.optional(v.id("tasks")),
    linkedBriefId: v.optional(v.id("briefs")),
    createdAt: v.number(),
  })
    .index("by_brand", ["brandId"])
    .index("by_jsr_link", ["jsrLinkId"]),

  // ─── JSR MESSAGES (brand manager <-> client) ──
  jsrMessages: defineTable({
    brandId: v.id("brands"),
    jsrLinkId: v.id("jsrLinks"),
    senderType: v.union(v.literal("client"), v.literal("manager")),
    senderName: v.optional(v.string()),
    senderId: v.optional(v.id("users")),
    content: v.string(),
    createdAt: v.number(),
  })
    .index("by_brand", ["brandId"])
    .index("by_jsr_link", ["jsrLinkId"]),

  // ─── DELIVERABLE HANDOFFS (cross-team pipeline) ──
  deliverableHandoffs: defineTable({
    sourceDeliverableId: v.id("deliverables"),
    sourceTaskId: v.id("tasks"),
    sourceBriefId: v.id("briefs"),
    targetTaskId: v.id("tasks"),
    targetBriefId: v.id("briefs"),
    targetTeamId: v.id("teams"),
    handedOffBy: v.id("users"),
    handedOffAt: v.number(),
    note: v.optional(v.string()),
  })
    .index("by_source_deliverable", ["sourceDeliverableId"])
    .index("by_target_task", ["targetTaskId"])
    .index("by_source_task", ["sourceTaskId"]),

  // ─── JSR REMARKS (client comments on deliverables) ──
  jsrRemarks: defineTable({
    deliverableId: v.id("deliverables"),
    brandId: v.id("brands"),
    senderType: v.union(v.literal("client"), v.literal("manager")),
    senderName: v.optional(v.string()),
    senderId: v.optional(v.id("users")),
    content: v.string(),
    createdAt: v.number(),
  })
    .index("by_deliverable", ["deliverableId"])
    .index("by_brand", ["brandId"]),
});
