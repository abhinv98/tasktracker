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
        v.literal("employee"),
        v.literal("client")
      )
    ),
    avatarUrl: v.optional(v.string()),
    designation: v.optional(v.string()),
    isSuperAdmin: v.optional(v.boolean()),
    /** Oversight admins (Vivek & Mayur) — get the silent task tag, oversight board & daily digest */
    isOversightAdmin: v.optional(v.boolean()),
    /** Freelancers keep role "employee" (same login & views) — this flag scopes them onto the admin Freelancers page */
    isFreelancer: v.optional(v.boolean()),
    /** HR keeps role "admin" (same permissions) — this flag swaps their nav to the HR view & unlocks the HR Requests page */
    isHR: v.optional(v.boolean()),
    /** Finance/accounts. Rides on role "admin" like isHR, but is a label only for now — the nav is still the brand-manager view. */
    isAccountant: v.optional(v.boolean()),
    /** For role "client": the single brand this portal login belongs to. */
    clientBrandId: v.optional(v.id("brands")),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_role", ["role"])
    .index("by_client_brand", ["clientBrandId"]),

  // ─── PETTY CASH ───────────────────────────────
  // Cash moving through three people: an allocator hands money to a giver,
  // the giver hands it to a recipient, the recipient spends some and returns
  // the remainder. Names are free text, mirroring the standalone app — the
  // people involved are often not tasktracker users (drivers, vendors, office
  // staff), so an Id<"users"> reference would lock out half the ledger.
  disbursements: defineTable({
    allocator: v.string(),
    giver: v.string(),
    recipient: v.string(),
    /** What the allocator released. Optional in practice — stored as 0. */
    amountAllocated: v.number(),
    amountGiven: v.number(),
    amountSpent: v.number(),
    /** "YYYY-MM-DD" — a calendar day, not an instant; no timezone to get wrong. */
    givenDate: v.string(),
    remainderReturned: v.boolean(),
    returnedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    createdBy: v.id("users"),
    updatedAt: v.optional(v.number()),
  }).index("by_given_date", ["givenDate"]),

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
    /** Set when a manager edits the brief deadline directly. While true, the
     *  task-deadline rollup (recomputeBriefDeadline) leaves it alone. */
    deadlineIsManual: v.optional(v.boolean()),
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
    /** Which handle on the source node this edge leaves from (React Flow). */
    sourceHandle: v.optional(v.union(v.literal("bottom"), v.literal("right"))),
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
      v.literal("done"),
      v.literal("on-hold")
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
    /** Freeform category tag (e.g. "Social", "Blog") — segregates tasks on the internal JSR and client portal. */
    tag: v.optional(v.string()),
    deadlineExtended: v.optional(v.boolean()),
    originalDeadline: v.optional(v.number()),
    overdueAcknowledged: v.optional(v.boolean()),
    overdueContacted: v.optional(v.boolean()),
    overdueContactDenied: v.optional(v.boolean()),
    haltLocked: v.optional(v.boolean()),
    creativeCopy: v.optional(v.string()),
    caption: v.optional(v.string()),
    /** Client-facing display title/description for content-calendar entries.
     *  The portal shows these instead of the raw internal title when set. */
    postTitle: v.optional(v.string()),
    postDescription: v.optional(v.string()),
    /** Pre-configured: which team should receive handoff when this task's deliverable is approved */
    handoffTargetTeamId: v.optional(v.id("teams")),
    /** If this task was created via handoff, the source deliverable */
    sourceDeliverableId: v.optional(v.id("deliverables")),
    /** If this task was created via handoff, the source task it was handed off from */
    handoffSourceTaskId: v.optional(v.id("tasks")),
    /** Number of times changes were requested on deliverables for this task */
    changesCount: v.optional(v.number()),
    /** Daily auto-roll counter for worklog-linked tasks. Incremented each
     *  day a non-done worklog task's deadline rolls forward. Powers the
     *  "Carried over by N days" chip in the oversight view. */
    carryOverDays: v.optional(v.number()),
    /** Per-task override of how many creative deliverables are expected.
     *  Used by content-calendar entries (design assignee can have a
     *  per-entry count, e.g. 4 creatives) and any task the design team
     *  works on. Falls back to brief.creativesRequired when unset. */
    creativesRequired: v.optional(v.number()),
    /** Flow canvas position (X coordinate) */
    flowX: v.optional(v.number()),
    /** Flow canvas position (Y coordinate) */
    flowY: v.optional(v.number()),
    /** Content-calendar staging shelf: set while the entry is parked off the
     *  grid. postDate is preserved so un-staging restores the original day. */
    stagedAt: v.optional(v.number()),
    stagedBy: v.optional(v.id("users")),
  })
    .index("by_brief", ["briefId"])
    .index("by_assignee", ["assigneeId"])
    .index("by_assignee_sort", ["assigneeId", "sortOrder"])
    .index("by_brief_assignee", ["briefId", "assigneeId"])
    .index("by_parent", ["parentTaskId"])
    .index("by_assigned_by", ["assignedBy"]),

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
    /** R2 object keys for files stored in Cloudflare R2 (new uploads use this instead of fileIds) */
    r2FileKeys: v.optional(v.array(v.string())),
    r2FileNames: v.optional(v.array(v.string())),
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
      v.literal("deadline_extended"),
      v.literal("note_reminder"),
      v.literal("oversight_digest"),
      v.literal("deck_approved"),
      v.literal("deck_changes_requested"),
      v.literal("client_feedback")
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
    isFreelancer: v.optional(v.boolean()),
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
    startTime: v.optional(v.string()),   // e.g. "10:00"
    endTime: v.optional(v.string()),     // e.g. "11:30"
    attendees: v.optional(v.array(v.string())),
    content: v.string(),
    transcriptFileId: v.optional(v.id("_storage")),
    transcriptFileName: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_brand", ["brandId"])
    .index("by_brand_date", ["brandId", "meetingDate"])
    .index("by_creator", ["createdBy"]),

  // ─── JSR LINKS ────────────────────────
  jsrLinks: defineTable({
    brandId: v.id("brands"),
    token: v.string(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    isActive: v.boolean(),
    label: v.optional(v.string()),
    /** Sections hidden from the client-facing JSR page */
    hiddenSections: v.optional(v.array(v.string())),
    /** Which month to show on the client calendar (YYYY-MM format). Empty/unset = all months. */
    calendarMonth: v.optional(v.string()),
    /** "jsr" (full status report, default) or "intake" (client task-request page). */
    linkType: v.optional(v.union(v.literal("jsr"), v.literal("intake"))),
  })
    .index("by_token", ["token"])
    .index("by_brand", ["brandId"]),

  // ─── JSR CLIENT TASKS ─────────────────
  jsrClientTasks: defineTable({
    brandId: v.id("brands"),
    /** Set for legacy intake-link submissions; portal submissions use portalId instead. */
    jsrLinkId: v.optional(v.id("jsrLinks")),
    /** Set when submitted through the authenticated client portal. */
    portalId: v.optional(v.id("clientPortals")),
    /** Real identity of the portal client who submitted the request. */
    submittedByClientId: v.optional(v.id("users")),
    title: v.string(),
    description: v.optional(v.string()),
    proposedDeadline: v.optional(v.number()),
    finalDeadline: v.optional(v.number()),
    cumulativeDeadline: v.optional(v.number()),
    status: v.union(
      v.literal("pending_review"),
      v.literal("on_hold"),
      v.literal("accepted"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("declined")
    ),
    /** Where the request was routed when accepted. */
    acceptedDestination: v.optional(
      v.union(
        v.literal("campaign_brief"),
        v.literal("individual_task"),
        v.literal("calendar")
      )
    ),
    heldAt: v.optional(v.number()),
    heldBy: v.optional(v.id("users")),
    internalNotes: v.optional(v.string()),
    clientName: v.optional(v.string()),
    /** Client-supplied references: uploaded files (fileKey) or external links (url). */
    references: v.optional(
      v.array(
        v.object({
          kind: v.union(
            v.literal("image"),
            v.literal("document"),
            v.literal("video"),
            v.literal("link")
          ),
          name: v.optional(v.string()),
          url: v.optional(v.string()),
          fileKey: v.optional(v.string()),
          contentType: v.optional(v.string()),
        })
      )
    ),
    linkedTaskId: v.optional(v.id("tasks")),
    linkedBriefId: v.optional(v.id("briefs")),
    /** The user the accepted task has been assigned to (via Client Requests). */
    assignedTo: v.optional(v.id("users")),
    /** Snapshot of the linked task's status that the CLIENT sees. Internal
     *  status changes stay invisible on the portal until an admin publishes
     *  them (jsr.publishClientTaskStatus copies live status into this).
     *  Unset = legacy row → portal falls back to live status. */
    publishedTaskStatus: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_brand", ["brandId"])
    .index("by_jsr_link", ["jsrLinkId"]),

  // ─── JSR MESSAGES (brand manager <-> client) ──
  jsrMessages: defineTable({
    brandId: v.id("brands"),
    /** Set for legacy JSR-link threads; portal messages set portalId instead. */
    jsrLinkId: v.optional(v.id("jsrLinks")),
    /** Set when sent through the authenticated client portal. */
    portalId: v.optional(v.id("clientPortals")),
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

  // ─── SUGGESTIONS (Suggestion Box on Profile) ──
  suggestions: defineTable({
    userId: v.id("users"),
    title: v.optional(v.string()),
    content: v.string(),
    status: v.union(
      v.literal("new"),
      v.literal("reviewing"),
      v.literal("planned"),
      v.literal("done"),
      v.literal("declined")
    ),
    adminNote: v.optional(v.string()),
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_createdAt", ["createdAt"])
    .index("by_status", ["status"]),

  // ─── JSR REMARKS (client comments on deliverables or tasks) ──
  jsrRemarks: defineTable({
    /** Set for deliverable-level threads; task-level threads set taskId instead. */
    deliverableId: v.optional(v.id("deliverables")),
    /** Set for task-level comment threads (portal). */
    taskId: v.optional(v.id("tasks")),
    /** Set for Client Deck item comment threads (portal). */
    deckItemId: v.optional(v.id("clientDeckItems")),
    brandId: v.id("brands"),
    senderType: v.union(v.literal("client"), v.literal("manager")),
    senderName: v.optional(v.string()),
    senderId: v.optional(v.id("users")),
    content: v.string(),
    createdAt: v.number(),
  })
    .index("by_deliverable", ["deliverableId"])
    .index("by_task", ["taskId"])
    .index("by_deck_item", ["deckItemId"])
    .index("by_brand", ["brandId"]),

  // ─── CLIENT PORTALS (one active authenticated portal link per brand) ──
  clientPortals: defineTable({
    brandId: v.id("brands"),
    token: v.string(),
    isActive: v.boolean(),
    /** Portal tabs hidden from clients: "calendar" | "deck" | "new-task" | "monthly-log" | "pending-client" | "pending-agency" | "feedback" */
    hiddenTabs: v.optional(v.array(v.string())),
    /** Restrict Content Calendar to one month ("YYYY-MM"); unset = all months. */
    calendarMonth: v.optional(v.string()),
    /** Months ("YYYY-MM") the client may see on the Content Calendar.
     *  Unset = every month; empty array = none. */
    visibleCalendarMonths: v.optional(v.array(v.string())),
    createdBy: v.id("users"),
    createdAt: v.number(),
    deactivatedAt: v.optional(v.number()),
  })
    .index("by_token", ["token"])
    .index("by_brand", ["brandId"])
    .index("by_brand_active", ["brandId", "isActive"]),

  // ─── CLIENT DECK ITEMS (shared links/files, optional client approval) ──
  clientDeckItems: defineTable({
    brandId: v.id("brands"),
    title: v.string(),
    /** External link. Client-uploaded files use fileKey instead. */
    url: v.optional(v.string()),
    /** R2 file key for client-uploaded documents (served via /api/r2-file). */
    fileKey: v.optional(v.string()),
    fileName: v.optional(v.string()),
    /** Set when a portal client added this item. */
    addedByClientId: v.optional(v.id("users")),
    description: v.optional(v.string()),
    /** "deck" | "gantt" | "doc" | freeform */
    category: v.optional(v.string()),
    requiresApproval: v.boolean(),
    approvalStatus: v.optional(
      v.union(
        v.literal("pending_client"),
        v.literal("client_approved"),
        v.literal("client_changes_requested")
      )
    ),
    approvalNote: v.optional(v.string()),
    reviewedByClientId: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    isVisible: v.boolean(),
    sortOrder: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_brand", ["brandId"]),

  // ─── CLIENT ACTIVITY (portal "who did what" audit trail) ──
  clientActivity: defineTable({
    brandId: v.id("brands"),
    clientUserId: v.id("users"),
    /** "login" | "view_tab" | "approve_deliverable" | "request_changes" | "deny_deliverable" |
     *  "add_remark" | "submit_request" | "approve_deck" | "request_deck_changes" | "submit_feedback" */
    action: v.string(),
    /** JSON payload: tab name, note excerpt, titles */
    details: v.optional(v.string()),
    taskId: v.optional(v.id("tasks")),
    deliverableId: v.optional(v.id("deliverables")),
    deckItemId: v.optional(v.id("clientDeckItems")),
    clientTaskId: v.optional(v.id("jsrClientTasks")),
    createdAt: v.number(),
  })
    .index("by_brand_time", ["brandId", "createdAt"])
    .index("by_user", ["clientUserId"]),

  // ─── CLIENT FEEDBACK (portal Feedback Log entries) ──
  clientFeedback: defineTable({
    brandId: v.id("brands"),
    clientUserId: v.id("users"),
    content: v.string(),
    taskId: v.optional(v.id("tasks")),
    createdAt: v.number(),
  }).index("by_brand", ["brandId"]),

  // ─── PERSONAL NOTES (private notepad / task manager) ──
  // Strictly private: only the author (an admin/super-admin) can ever read/write.
  personalNotes: defineTable({
    userId: v.id("users"),
    title: v.string(),
    content: v.string(),
    date: v.string(), // "YYYY-MM-DD" — day-wise bucket
    brandId: v.optional(v.id("brands")), // brand-wise (optional)
    tags: v.optional(v.array(v.string())),
    color: v.optional(v.string()),
    pinned: v.optional(v.boolean()),
    checklist: v.optional(
      v.array(v.object({ text: v.string(), done: v.boolean() }))
    ),
    remindAt: v.optional(v.number()), // "revisit later" timestamp
    reminderSentAt: v.optional(v.number()), // dedupe guard for note_reminder
    archived: v.optional(v.boolean()),
    convertedTo: v.optional(
      v.object({
        kind: v.union(
          v.literal("task"),
          v.literal("calendar"),
          v.literal("brief"),
          v.literal("mom")
        ),
        refId: v.string(),
        at: v.number(),
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_date", ["userId", "date"])
    .index("by_user_brand", ["userId", "brandId"])
    .index("by_user_remind", ["userId", "remindAt"]),

  // ─── MANAGER WORKLOG (brand-wise daily self-log, supervised) ──
  // Self-authored by a brand/account manager; readable by their team lead
  // (teams.leadId) and super-admins.
  managerWorklog: defineTable({
    userId: v.id("users"),
    brandId: v.id("brands"),
    date: v.string(), // "YYYY-MM-DD"
    content: v.string(),
    hoursSpent: v.optional(v.number()),
    taskRefs: v.optional(v.array(v.id("tasks"))),
    /** Whether the manager has checked this worklog item off as done. */
    done: v.optional(v.boolean()),
    /** Set when a plain line item was explicitly converted to a self task
     *  (convertEntryToTask). Legacy rows have it from the old auto-create. */
    linkedTaskId: v.optional(v.id("tasks")),
    /** Days this unticked line item has rolled forward to the next day.
     *  Only used for plain (non-task) items; task-backed items track
     *  carry-over on the task itself. */
    carriedOverDays: v.optional(v.number()),
    /** Deadline picked by the manager when adding the worklog item. The
     *  mirror task uses this as its deadline; if it's not completed by
     *  end-of-day, a daily cron rolls it forward and increments
     *  carryOverDays on the task. */
    deadline: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_date", ["userId", "date"])
    .index("by_user_brand", ["userId", "brandId"])
    .index("by_brand_date", ["brandId", "date"]),

  // ─── TASK OVERSIGHT TAG (silent, super-admin-only) ──
  // One row per created task; powers the oversight board + daily digest.
  taskOversight: defineTable({
    taskId: v.id("tasks"),
    briefId: v.id("briefs"),
    brandId: v.optional(v.id("brands")),
    assigneeId: v.id("users"),
    assignedBy: v.id("users"),
    source: v.union(
      v.literal("individual_task"),
      v.literal("master_brief"),
      v.literal("content_calendar"),
      v.literal("sub_task"),
      v.literal("employee_task")
    ),
    createdAt: v.number(),
    digestedAt: v.optional(v.number()),
  })
    .index("by_digested", ["digestedAt"])
    .index("by_task", ["taskId"])
    .index("by_created", ["createdAt"]),

  // ─── FINANCE (super-admin only) ────────────────
  // Agency identity + document numbering. Singleton — first row wins.
  agencyProfile: defineTable({
    name: v.string(),
    addressLines: v.array(v.string()),
    gstin: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    bankName: v.optional(v.string()),
    accountName: v.optional(v.string()),
    accountNumber: v.optional(v.string()),
    ifsc: v.optional(v.string()),
    upiId: v.optional(v.string()),
    logoId: v.optional(v.id("_storage")),
    invoicePrefix: v.string(),
    nextInvoiceNumber: v.number(),
    quotePrefix: v.string(),
    nextQuoteNumber: v.number(),
    defaultGstPercent: v.number(),
    termsNote: v.optional(v.string()),
    updatedBy: v.id("users"),
    updatedAt: v.number(),
  }),

  // One quotation per project pitched to a brand (ongoing clients get many).
  quotations: defineTable({
    brandId: v.id("brands"),
    projectName: v.string(),
    quoteNumber: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("sent"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("invoiced")
    ),
    lineItems: v.array(
      v.object({
        description: v.string(),
        qty: v.number(),
        rate: v.number(),
        amount: v.number(),
      })
    ),
    gstPercent: v.number(),
    subtotal: v.number(),
    taxAmount: v.number(),
    total: v.number(),
    notes: v.optional(v.string()),
    validUntil: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    approvedAt: v.optional(v.number()),
    rejectedAt: v.optional(v.number()),
    invoiceId: v.optional(v.id("invoices")),
    /** Set when this quotation was cloned from another via "Revise". */
    revisionOf: v.optional(v.id("quotations")),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_brand", ["brandId"])
    .index("by_status", ["status"]),

  // Generated in-app (line items + GST) or tracked external (PDF attach).
  // "overdue" is DERIVED at read time from dueDate — never stored.
  invoices: defineTable({
    brandId: v.id("brands"),
    quotationId: v.optional(v.id("quotations")),
    briefIds: v.optional(v.array(v.id("briefs"))),
    invoiceNumber: v.string(),
    source: v.union(v.literal("generated"), v.literal("external")),
    status: v.union(
      v.literal("draft"),
      v.literal("unpaid"),
      v.literal("partially_paid"),
      v.literal("paid")
    ),
    lineItems: v.optional(
      v.array(
        v.object({
          description: v.string(),
          qty: v.number(),
          rate: v.number(),
          amount: v.number(),
        })
      )
    ),
    gstPercent: v.optional(v.number()),
    subtotal: v.optional(v.number()),
    taxAmount: v.optional(v.number()),
    total: v.number(),
    /** Denormalized sum of invoicePayments — recomputed on every change. */
    amountPaid: v.number(),
    issueDate: v.number(),
    dueDate: v.optional(v.number()),
    pdfStorageId: v.optional(v.id("_storage")),
    notes: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_brand", ["brandId"])
    .index("by_status", ["status"])
    .index("by_quotation", ["quotationId"]),

  invoicePayments: defineTable({
    invoiceId: v.id("invoices"),
    amount: v.number(),
    paidOn: v.number(),
    method: v.optional(v.string()),
    reference: v.optional(v.string()),
    note: v.optional(v.string()),
    recordedBy: v.id("users"),
    createdAt: v.number(),
  }).index("by_invoice", ["invoiceId"]),

  // ─── RECRUITMENT ───────────────────────────────
  // Imported from the cultform MySQL app (u601050392_cf_jobdata). Rows keep
  // their original MySQL primary key as `sourceId` and reference each other by
  // it rather than by Convex Id — that's what lets the import run as flat
  // JSONL, and what lets the public form later dual-write into both systems
  // and still be reconcilable.
  recruitJobs: defineTable({
    sourceId: v.number(),
    name: v.string(),
    description: v.string(),
    formUrl: v.string(),
    /** Set when this is a sub-position; candidates file under the parent. */
    parentSourceId: v.optional(v.union(v.number(), v.null())),
    createdAt: v.number(),
  }).index("by_source", ["sourceId"]),

  recruitCandidates: defineTable({
    sourceId: v.optional(v.number()),
    jobSourceId: v.number(),
    name: v.string(),
    number: v.string(),
    email: v.string(),
    age: v.optional(v.union(v.number(), v.null())),
    experience: v.string(),
    /** Absolute URL — WordPress media, Google Drive, Behance, etc. */
    resume: v.string(),
    portfolioLink: v.string(),
    /** The specific sub-position label chosen; blank on legacy rows. */
    position: v.string(),
    currentCtc: v.string(),
    expectedCtc: v.string(),
    noticePeriod: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("non_active"),
      v.literal("rejected"),
      v.literal("on_hold")
    ),
    statusUpdatedAt: v.optional(v.union(v.number(), v.null())),
    /** Where the candidate sits in the funnel. Optional only so the backfill
     *  could run against imported rows; treat a missing stage as "applied". */
    stage: v.optional(
      v.union(
        v.literal("applied"),
        v.literal("screened"),
        v.literal("interview"),
        v.literal("offer"),
        v.literal("hired"),
        v.literal("rejected"),
        v.literal("on_hold")
      )
    ),
    stageUpdatedAt: v.optional(v.number()),
    /** Null for ~1,100 legacy rows imported before the column existed. */
    createdAt: v.optional(v.union(v.number(), v.null())),
  })
    .index("by_job", ["jobSourceId"])
    .index("by_source", ["sourceId"])
    .index("by_email", ["email"])
    .index("by_status", ["status"])
    .index("by_stage", ["stage"]),

  recruitTemplates: defineTable({
    sourceId: v.optional(v.number()),
    jobSourceId: v.number(),
    name: v.string(),
    subject: v.string(),
    body: v.string(),
    createdAt: v.number(),
  }).index("by_job", ["jobSourceId"]),

  recruitCampaigns: defineTable({
    sourceId: v.optional(v.number()),
    jobSourceId: v.number(),
    name: v.string(),
    startDate: v.number(),
    endDate: v.optional(v.union(v.number(), v.null())),
    createdAt: v.number(),
    source: v.union(v.literal("auto"), v.literal("manual")),
    /** Members, as Convex ids. Campaigns are tens of people, not thousands —
     *  an array beats a join table at this size and keeps the reads to one doc. */
    candidateIds: v.optional(v.array(v.id("recruitCandidates"))),
    /** Free-text note on what this round is for. */
    notes: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
  }).index("by_job", ["jobSourceId"]),

  recruitEmailLogs: defineTable({
    sourceId: v.optional(v.number()),
    jobSourceId: v.number(),
    jobName: v.string(),
    contactEmail: v.string(),
    contactName: v.string(),
    templateName: v.string(),
    smtpFrom: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed")),
    error: v.string(),
    sentAt: v.number(),
    campaignSourceId: v.optional(v.union(v.number(), v.null())),
  })
    .index("by_job", ["jobSourceId"])
    .index("by_email", ["contactEmail"])
    .index("by_sent", ["sentAt"]),

  /** One timeline per candidate: notes HR writes, and every stage move.
   *  Sent emails live in recruitEmailLogs and get merged in at read time —
   *  duplicating them here would let the two disagree. */
  recruitActivity: defineTable({
    candidateId: v.id("recruitCandidates"),
    kind: v.union(v.literal("note"), v.literal("stage")),
    body: v.string(),
    fromStage: v.optional(v.string()),
    toStage: v.optional(v.string()),
    authorId: v.optional(v.id("users")),
    authorName: v.string(),
    createdAt: v.number(),
  }).index("by_candidate", ["candidateId", "createdAt"]),

  // ─── HR REQUESTS ───────────────────────────────
  // Staff → HR asks (appraisal, reimbursement, …). HR accepts/declines, moves
  // the status along and attaches documents the requester can then download.
  hrRequests: defineTable({
    userId: v.id("users"),
    category: v.union(
      v.literal("appointment_letter"),
      v.literal("appraisal_letter"),
      v.literal("reimbursement_comp_off"),
      v.literal("attendance_regularization")
    ),
    subject: v.string(),
    details: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("declined")
    ),
    /** HR's free-text note on the current status — what the requester sees. */
    statusNote: v.optional(v.string()),
    documents: v.optional(
      v.array(
        v.object({
          fileId: v.id("_storage"),
          fileName: v.string(),
          fileType: v.optional(v.string()),
          uploadedAt: v.number(),
        })
      )
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),
});
