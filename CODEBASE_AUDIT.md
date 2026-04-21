# The Orchestrator, Deep Audit

Generated 2026-04-17 for Abhinav. Purpose: canonical mental model for future queries.
Covers the whole repo: Convex backend, Next.js 16 App Router frontend, Electron shell, R2 storage, JSR client portal, AI action layer.

---

## 0. TL;DR

The Orchestrator is a hierarchical, role-aware task tracker for Ecultify. Its heart is a single `deliverables` doc with a **four-layer review stack** baked in as columns (mainAssignee, teamLead, status, clientStatus) instead of a normalized `reviews` table. Every workflow feature bolts onto that shape.

Relationships flow: **User -> Team -> Brand -> Brief -> Task -> Deliverable**, with m2m joins (userTeams, briefTeams, brandManagers, taskConnections, deliverableHandoffs) threading across layers.

Roles in DB are only `admin | employee`. Everything else (Super Admin, Brand Manager, Team Lead) is computed at the frontend from flags and join tables. The README is stale on this.

The approval flow is well thought out but fragile: status transitions, handoff creation, resource propagation, and brief-status sync are all manual in `approvals.ts`. Any new review state or brief type requires touching several files.

Highest-priority risks: auth gaps on `listEmployees` / `listManagers`, `/api/r2-file` and `/api/r2-upload` lacking explicit auth, AI action role-check placed after OpenAI call (wastes credits + leaks info), weak JSR token entropy, `deleteBrief` cascade leaks comments/attachments, and race-able "first user becomes admin".

---

## 1. Stack

| Layer | Tech |
| --- | --- |
| Backend | Convex 1.32 (queries, mutations, actions, crons, http) |
| Auth | @convex-dev/auth (Password provider only) |
| Frontend | Next.js 16.1.6 App Router, React 19.2.3, Tailwind v4 |
| Desktop | Electron 41 + electron-updater |
| Storage | Dual: Convex `_storage` (legacy) + Cloudflare R2 via AWS SDK v3 |
| AI | OpenAI gpt-4o with 25 tool-calls in `aiAction.ts` |
| Drag-n-drop | @dnd-kit |
| Graph UI | @xyflow/react (react-flow) for brief task DAG |

`package.json` target is an Electron-wrapped Next.js app distributed for mac + win with auto-updates.

---

## 2. Entity Relationship Map

```
users  (role: admin|employee, isSuperAdmin?)
  |
  |--- userTeams (m2m) ---> teams (leadId -> users)
  |
  |--- brandManagers (m2m) ---> brands
  |
  |--- tasks (assigneeId, assignedBy, parentTaskId self-ref)
  |       |
  |       |---> briefs (briefId)
  |       |       |
  |       |       |--- briefTeams (m2m, with order) ---> teams
  |       |       |--- brands (brandId)
  |       |       |--- assignedManagerId -> users (legacy single-manager)
  |       |
  |       |---> deliverables (taskId)   <-- 4-layer review on this doc
  |       |---> taskConnections (source/target, react-flow DAG)
  |       |---> deliverableHandoffs (pipeline between tasks/teams)
  |       |---> subTasks via parentTaskId (from team leads)
  |
  |--- notifications (recipientId)
  |--- activityLog (userId + optional briefId/taskId)
  |--- messages / dm / reactions / attachments / typingIndicators / readReceipts

jsrLinks (token-based, one per brief) ---> briefs
  + clientTaskRequests, jsrRemarks, clientMessages
```

Schema table count is large (approx 30 tables). Key joins:

- **userTeams**: user and team, many-to-many.
- **briefTeams**: brief and team, many-to-many, has `order` field for sequential pipelines.
- **brandManagers**: brand and user, many-to-many (newer model replacing legacy `brief.assignedManagerId`).
- **taskConnections**: taskA to taskB DAG edges for flow arrows.
- **deliverableHandoffs**: cross-team handoff of a deliverable, records source task, target task, target team, creator.

---

## 3. Role and Permission Model

### Schema literals (only two)

`users.role`: `"admin" | "employee"`.

### Computed display roles (`src/lib/roles.ts`)

```
Super Admin   <- isSuperAdmin === true
Brand Manager <- role === "admin" + entry in brandManagers (or assignedManagerId legacy)
Team Lead     <- role === "employee" + exists team where leadId === userId
Employee      <- role === "employee" (default)
```

### Privilege surface

| Capability | Check in code |
| --- | --- |
| Mark task `done` directly | admin only (`tasks.ts` line 313) |
| Create brief | admin only (`briefs.createBrief`) |
| Create task | admin or `brief.assignedManagerId === userId` |
| Reassign task | admin or assigned manager or (assignor + single_task brief) |
| Delete task / brand / brief | admin only |
| Create sub-task | admin or team lead of assignee's team |
| Final-approve deliverable (manager layer) | admin only, at call sites |
| Forward to team member | admin only |
| Update brand logo | admin |
| Invite user | admin |
| View employees list | **any authenticated user** (gap) |
| JSR portal | token-based, no auth |

### Super Admins

Hardcoded substring match in `users.setSuperAdmins` internalMutation on `name.toLowerCase()`:
`"mayur" | "vivek" | "abhinav"`. Anyone renaming to match gets elevated on next call. There is no enforcement preventing `updateUserRole` from demoting a super admin, but the function protects the "last admin" by count.

### First-user race

`auth.ts` promotes the first user by `users.collect().length === 1`. Two signups in the same Convex tick both count themselves as first user. Low practical risk, but worth a lock.

---

## 4. Status State Machines

### `briefs.status` (9 literal states)

```
draft -> active -> in-progress -> review -> completed
                                     |
                                     v
                                 sent_to_client (JSR)
        + archived, rejected, on_hold (terminal/pause)
```

Synced from tasks via two helpers in `convex/lib/syncBriefStatus.ts`:

- `syncSingleTaskBriefStatus`: for `briefType === "single_task"`, maps task status directly (pending->active, review->review, done->completed).
- `syncMultiTaskBriefStatus`: if every task is `done`, brief goes to `completed`. Otherwise no-op.

`tasks.updateTaskStatus` adds a third rule: for multi-task briefs, if every task is `done` but caller is not admin, brief goes to `review` instead of `completed`. Admins push straight to `completed`. Minor duplication with the helper.

### `tasks.status` (5 literal states)

```
pending -> in-progress -> review -> done
                                -> on-hold (pause)
```

Transitions:

- Employees can move between any state **except** `done`. `done` requires admin.
- Employees trigger `review` indirectly by submitting a deliverable; the submit mutation in `approvals.ts` sets task to `review`.
- `done` only happens when ALL deliverables on the task are `approved` (supports multi-creative-slot tasks). Or, for client-facing tasks, state goes to `review` pending client.
- Overdue workflow adds `overdueAcknowledged`, `overdueContacted`, `overdueContactDenied`, `deadlineExtended`, `originalDeadline`.

### `deliverables` has FOUR status fields

This is the single most important piece of domain knowledge in the codebase:

| Field | Owner | Values |
| --- | --- | --- |
| `mainAssigneeStatus` | parent task owner (for sub-tasks from team leads) | pending, approved, rejected, changes_requested |
| `teamLeadStatus` | team lead | pending, approved, rejected, changes_requested |
| `status` | brand manager (final internal) | pending, approved, rejected, changes_requested |
| `clientStatus` | external client via JSR | pending, approved, changes_requested, denied |

Each layer has its own `reviewedBy`, `reviewedAt`, `reviewNote` trio. The chain short-circuits based on `parentTaskId` presence and `briefType === "content_calendar"`.

---

## 5. The Approval Flow (the crown jewel)

`approvals.ts` is 2376 lines. Here is the canonical decision tree.

### On submit (`submitDeliverable`)

```
IF task has parentTaskId (it is a sub-task):
    Deliverable goes to mainAssigneeStatus = "pending"
    Notify the parent task's assignee
ELSE:
    Deliverable goes to teamLeadStatus = "pending"
    Notify the team lead of the assignee's team
Task status -> "review"
Brief status may follow via sync helper
```

Content Calendar bypass: `submitDeliverableDirectToManager` auto-approves TL layer and routes straight to brand manager. Used for Copy/Design entries.

### Main-assignee layer (sub-task chain)

- `mainAssigneeApprove` / `mainAssigneeReject`: parent task owner reviews their helper's work.
- `passSubTaskToTeamLead`: after main assignee approves, they explicitly forward to TL (does not auto-forward).

### Team-lead layer

- `teamLeadApprove`: sets `teamLeadStatus=approved`, notifies brand manager(s). Task stays in `review`.
- `teamLeadReject`: sets `teamLeadStatus=rejected`, nukes all review fields to undefined, task goes back to `in-progress`.
- `teamLeadAndManagerApprove`: used when team lead is also admin (dual-role). Approves both layers atomically.
- `passToManager`: alternate route to hand off after TL approval.

### Manager layer (final internal)

- `managerApproveFromTeamLeadApprove`: sets `status=approved`. This is the pivot point.
  - If `task.clientFacing`: task -> `review` (pending client), deliverable's `clientStatus` stays pending until JSR action.
  - Else: check if all deliverables on task are approved. If yes, task -> `done`.
  - Auto-handoff: if `brief.briefType === "content_calendar"` AND `task.handoffTargetTeamId` AND `!task.clientFacing`, create `[Design] ${task.title}` task assigned to target team lead, propagate deliverable URLs as reference links, record in `deliverableHandoffs`.
  - Propagate resources via `propagateResourcesToDownstreamTasks` along `taskConnections` edges.

### `rejectDeliverable` (manager-level reject)

Clears teamLeadStatus AND mainAssigneeStatus fields back to undefined, task goes to `in-progress`. This forces the full chain to re-review on next submission.

### Client layer (JSR)

- `clientApprove`: sets `clientStatus=approved`, if all deliverables on task are client-approved then task -> `done`.
- `clientRequestChanges`: sets `clientStatus=changes_requested`, task -> `in-progress`, notifies admins.
- `clientDeny`: same as requestChanges but with `clientStatus=denied`.

Admin-only `reassignAfterClientFeedback` can jump the deliverable back to a fresh assignee after a client rejection.

### Handoff (cross-task / cross-brief)

`handoffDeliverable` is admin or brand-manager-gated. Based on source brief type:

- `single_task` source: creates a NEW single_task brief in the same brand, assigns to target team lead.
- Other types: creates a new task in the SAME brief.
- Supports three modes: new task, existing task (re-use handoff), or attach to a chosen task.
- Always propagates deliverable URLs + reference links via `mergeUpstreamResourcesIntoTask`.

### Key rules to remember

1. Task goes to `done` only when every deliverable on it is `approved`. Multi-slot tasks wait for the last one.
2. Client-facing tasks hold at `review` until client approves, then go `done`.
3. Manager-level reject resets the full review chain, not just its own layer.
4. Content calendar parent entries never get deliverables; only the [Copy] and [Design] children do.
5. Auto-handoff from Copy to Design only fires when brief is content_calendar, handoff target set, and task not client-facing.

---

## 6. Brief Types and Their Pipelines

```
developmental   - generic, admin creates tasks manually
designing       - generic, admin creates tasks manually
video_editing   - generic
copywriting     - generic
single_task     - brief is 1:1 with a task; auto-activated on creation;
                  brief status mirrors the task status
content_calendar- auto-creates parent entry + [Copy] child + [Design] child,
                  linked via parentTaskId;
                  Copy deliverable auto-hands off to Design on approval
```

`briefs.createBrief` does all the auto-wiring. Content calendar pipeline uses `handoffTargetTeamId` on the Copy task to know which team to hand the Design work to.

---

## 7. Handoff and Resource Propagation

Two mechanisms coexist.

### `taskConnections` (react-flow DAG)

- Source/target taskIds, directed edge.
- UI renders as arrows between tasks in brief flow view.
- On creation (`briefs.addTaskConnection`), `mergeUpstreamResourcesIntoTask` is called to push upstream's approved deliverable URLs and reference links into downstream's `referenceLinks` array.
- Duplicates are handled by the same merge (idempotent).
- Self-loops are explicitly blocked.

### `deliverableHandoffs` (cross-team pipeline)

- Separate table, records sourceTaskId, targetTaskId, targetTeamId, initiatedBy, timestamp.
- Created by `handoffDeliverable` (manual) or auto-handoff in content calendar flow.
- Different from taskConnections: handoff creates new tasks, connection just arrow-links existing ones.

### `mergeUpstreamResourcesIntoTask` (`convex/lib/taskFlowResources.ts`)

- Collects source.referenceLinks + every approved deliverable's `link`, Convex `fileIds` (via `storage.getUrl`), and R2 keys (as `/api/r2-file?key=...` URLs).
- Dedupes into target.referenceLinks.
- Skips non-approved deliverables.
- Skips cross-brief links (`source.briefId !== target.briefId`).

`propagateResourcesToDownstreamTasks` (in approvals.ts) walks taskConnections outgoing edges and calls this helper for each.

---

## 8. JSR (Client Portal)

`convex/jsr.ts` is 1208 lines. Public, no auth.

- One `jsrLinks` row per brief, token is 24-char alphanumeric (math.random-based, weak).
- Endpoints cover: viewing brief + deliverables, approving/rejecting, messaging team, submitting remarks, proposing new tasks.
- Client task submission: creates a new internal brief via `addClientTask`, admin reviews in-app, can accept which creates a real brief.
- `updateJsrHiddenSections` lets admins hide sub-components from client view.
- `updateJsrCalendarMonth` for content calendar month switching.
- `setCumulativeDeadline` for client-visible aggregate deadlines.
- Messaging: `clientMessages` table, both directions. `sendClientMessage` is authed-only (admin writes), `addJsrRemark` accepts anonymous client posts from the public token.

Security notes:
- 24-char alphanumeric = approx 143 bits. Not bad, but not cryptographically random (Math.random).
- No rate limiting on public endpoints.
- Token revocation via `deactivateJsrLink` (sets `active=false`).

---

## 9. Content Calendar

`convex/contentCalendar.ts` is 863 lines.

- Monthly sheets, each day can be a work day or a break day (`breakDays` table).
- `createCalendarEntryWithCopyTask` creates:
  1. Parent task (the calendar entry itself, visual only, no deliverables)
  2. Copy child task, assigned to copywriter, with `handoffTargetTeamId` pointing at design team
  3. On Copy approval, auto-creates Design child task
- `parentTaskId` threads Copy and Design back to the calendar entry.
- Brief type MUST be `content_calendar` for auto-handoff to fire.
- `toggleBreakDay`, `setCalendarMonth`, and sheet generation for display.

---

## 10. AI Action Layer

`convex/aiAction.ts` is 1318 lines. Invoked via actions (not queries/mutations).

- OpenAI gpt-4o.
- 25 registered tools covering list_briefs, create_brief, create_task, update_task_status, etc.
- 15-iteration tool loop. **No circuit breaker** on infinite tool calls if model loops.
- **Role check happens AFTER the OpenAI call**, so a non-admin user burns OpenAI tokens before getting rejected. Moved check to top saves money and reduces leaked tool metadata.
- File uploads are fed to the model, **no sanitization** against prompt injection from uploaded images or PDFs. If a file contains hidden instructions, the model may follow them.

---

## 11. File Storage Architecture

Two stores run in parallel:

### Legacy: Convex `_storage`

- `deliverables.fileIds: v.array(v.id("_storage"))`
- URLs via `ctx.storage.getUrl(fid)` inside mutations.
- Direct access via Convex SDK, no custom HTTP layer.

### Current: Cloudflare R2

- `deliverables.r2FileKeys: v.array(v.string())`
- Access via `/api/r2-file?key=<key>` and `/api/r2-upload` Next.js route handlers.
- AWS SDK v3 clients + `getSignedUrl` for presigned puts/gets.
- **Gap found**: per sub-agent exploration, the two `/api/r2-*` routes lack explicit auth checks. Anyone with a key string may be able to read. Needs verification by reading `src/app/api/r2-*` directly.
- Keys appear to be UUID-based, so enumeration is hard, but "security through obscurity" is not the plan.

Migration plan is implied but not documented: new deliverables use R2, old ones still reference fileIds. `mergeUpstreamResourcesIntoTask` handles both.

---

## 12. Notifications and Activity Log

### `notifications` table

- `recipientId`, `type`, `title`, `message`, optional `briefId`/`taskId`, `triggeredBy`, `read`, `createdAt`.
- Schema lists ~20 `type` literals.
- `createNotification` mutation in `convex/notifications.ts` has a narrow validator listing only 8 types. Most insertions are inline `ctx.db.insert("notifications", ...)` calls across other files and bypass that validator, making it effectively dead code for the extended types.
- `getNotifications(limit)` returns `{notifications, unreadCount}`. Indexed by `by_recipient_time`.
- `markAsRead` / `markAllAsRead`.

### Desktop notification bridge

- `DesktopNotificationBridge` component polls the above and calls `window.electronAPI.showNotification` on new items.
- Electron main process surfaces native OS notifications.

### `activityLog`

- Immutable audit trail of `action` events (created_task, changed_status, reassigned_task, extended_deadline, resumed_overdue, created_brief, etc.).
- Keyed on `briefId` + optional `taskId` + `userId`.
- `details` is JSON.stringify-ed payload. Not searchable at field level.

---

## 13. Electron Integration

- Thin wrapper. Main process in `electron/main.ts`, preload in `electron/preload.ts`.
- Build via `vite build --config electron/vite.config.ts`.
- Distribution via `electron-builder` for mac + win.
- `electron-updater` for auto-updates.
- IPC bridge exposes `electronAPI` to the renderer for native notifications.
- No other native dependencies.

---

## 14. Overdue Workflow (worth calling out)

A full negotiation loop lives in `tasks.ts` for handling overdue work, not documented anywhere else:

1. `getOverdueHaltStatus` (query): employee dashboard shows a blocking modal when they have overdue tasks not yet acknowledged.
2. `contactManagerForOverdue` (employee): sets `overdueContacted=true`, notifies brand manager that the employee is requesting review.
3. `confirmOverdueContact` (admin): either confirms (clears contacted flag) or denies (sets `overdueContactDenied=true` and tells employee to meet in person).
4. `extendTaskDeadline` (admin): sets new deadline, stores `originalDeadline`, flips `deadlineExtended=true`, also updates brief.deadline for single_task briefs.
5. `resumeOverdueTask` (admin): just sets `overdueAcknowledged=true` without extending, lets work continue.
6. `listOverdueTasksForManager`: admin dashboard list, respects brandManagers scoping + assignedManagerId legacy.

The "halt" language is a UX promise, not a DB constraint. An employee can still submit deliverables while halted. Worth verifying in the frontend if the block is actually enforced or just advisory.

---

## 15. Frontend Structure (from sub-agent exploration)

- **Route groups**: `/app/(auth)`, `/app/(dashboard)`, `/app/jsr/[token]`, `/app/api`.
- **Dashboard layout** handles sidebar, role-gated nav items, session guard.
- **API routes**: `/api/r2-file`, `/api/r2-upload`, AI chat endpoints. R2 routes flagged for auth review.
- **Convex hooks**: Direct `useQuery` / `useMutation` calls, no abstraction layer. This means UI is tightly coupled to backend function names; renames cascade.
- **Approval UI surfaces**: ReviewQueue components per layer (main-assignee, team-lead, manager, client via JSR). Each lives under its own route segment.
- **Brief flow view**: `@xyflow/react` renders taskConnections as edges, drag-drop via `@dnd-kit`.
- **Electron callout**: `DesktopNotificationBridge` is a client component mounted high in the layout tree.

---

## 16. Risks and Tech Debt, Prioritized

### P0 - security

1. **`/api/r2-file` and `/api/r2-upload` may lack auth checks.** Verify. If true, presigned URLs for R2 assets may be fetchable by anonymous callers who guess or harvest keys.
2. **`listEmployees` and `listManagers` in `users.ts` only check `isAuthenticated`, not role.** Any logged-in employee can enumerate the entire staff directory including admins.
3. **AI action role-check happens AFTER OpenAI call.** Move to top of handler. Saves tokens, prevents tool-metadata leak.
4. **JSR token entropy.** 24 chars from `Math.random`. Switch to `crypto.randomUUID()` or `crypto.randomBytes()`.
5. **No rate limiting on public JSR endpoints.** Possible abuse vector for `addJsrRemark`, `sendClientMessage`, file views.
6. **Prompt injection via uploaded files in aiAction.** Consider blocking tool execution when recent user input came from an uploaded file, or require confirmation before tool calls that mutate state.
7. **First-user-becomes-admin race.** Two simultaneous signups in first microsecond both become admin. Add a lock or use an explicit bootstrap step.

### P1 - correctness

8. **`deleteBrief` cascade is weaker than `deleteBrand`.** Brief deletion leaves orphaned comments, attachments, reactions, typingIndicators, readReceipts. Extract a shared cascade helper.
9. **`createNotification` validator lists 8 types, schema lists 20.** Either sync the validator or delete the helper (it is dead code today since inline inserts bypass it).
10. **Brief priority race.** `briefs.createBrief` sets priority to `count + 1`. Concurrent creates collide on the same number. Use a max+1 query inside a transaction or drop priority uniqueness assumption.
11. **`updateTaskStatus` duplicates brief-sync logic** already present in `syncMultiTaskBriefStatus`. Route both paths through the helper to avoid drift.
12. **Super admin substring match is fragile.** "mayur" matches "Mayura", "Mayurbhanj" etc. Use explicit user IDs or a flag on first setup.
13. **No enforcement on super admin demotion.** `updateUserRole` on a super admin still works if they are not the "last admin".

### P2 - performance

14. **`listTasksForBrief` fetches ALL users + ALL userTeams + ALL teams.** For a 100-user org this is fine, for scale it is N+M linear in the entire dataset per view.
15. **`aiAction.ts` 15-iteration loop has no break condition on repeated tool calls.** Possible runaway if model gets stuck.
16. **`listOverdueTasksForManager` pulls all tasks + all briefs + all users.** Same shape as above. Fine now, will hurt at scale.
17. **No pagination on `listBriefs`, `listAllUsers`, `listTasksForBrief`, most frontend queries.** Convex is fine for current volume but this is the slow-lane for growth.

### P3 - maintainability

18. **README out of sync** on role model (claims admin/manager/employee, actual is admin/employee + computed display).
19. **Four-layer review stack on one doc is hard to evolve.** Adding a fifth reviewer (e.g., QA) requires schema migration + touch all approvals.ts endpoints. A normalized `reviews` table would be saner long-term.
20. **`approvals.ts` is 2376 lines.** Split by layer (teamLeadReviews.ts, managerReviews.ts, clientReviews.ts, handoffs.ts) without changing function names so the frontend does not break.
21. **Dual storage (fileIds + r2FileKeys) with no explicit migration endpoint.** Every read path has to handle both. Document the migration plan or finish the cutover.
22. **Hardcoded IST timezone logic in `normalizeDeadlineToEndOfDay`** appears in both `briefs.ts` and `tasks.ts`. Duplicated code. Extract to a helper.
23. **`setSuperAdmins` is an internalMutation** with no trigger wired up. Assumed to be run manually after DB seed. Document or remove.

---

## 17. Quick Reference Cheat Sheet

### Who can do what

| Action | admin | brand mgr (admin in brandManagers) | team lead (employee w/ team.leadId) | employee | client (JSR) |
| --- | --- | --- | --- | --- | --- |
| Create brief | yes | no | no | no | no |
| Create task | yes | yes (if assignedManagerId) | no | no | no |
| Create sub-task | yes | via admin role | yes (of assignee team) | no | no |
| Reassign | yes | on own briefs | no | no | no |
| Approve deliverable (TL layer) | yes | n/a | yes | no | no |
| Approve deliverable (final) | yes | yes (via admin) | no | no | no |
| Approve (client) | no | no | no | no | yes |
| Mark task done directly | yes | yes (via admin) | no | no | no |
| Delete anything | yes | no | no | no | no |
| Handoff deliverable | yes | yes | no | no | no |
| Extend deadline | yes | yes (via admin) | no | no | no |

### Key file map

| Question | File |
| --- | --- |
| Schema shape | `convex/schema.ts` |
| Who is logged in, role check | `convex/auth.ts` + `convex/users.ts` |
| Brief lifecycle, creation, team assignment | `convex/briefs.ts` |
| Task lifecycle, sub-tasks, overdue workflow | `convex/tasks.ts` |
| The full approval chain | `convex/approvals.ts` |
| Client portal | `convex/jsr.ts` |
| Content calendar auto-wiring | `convex/contentCalendar.ts` |
| AI chat tools | `convex/aiAction.ts` |
| Brief<->task status sync | `convex/lib/syncBriefStatus.ts` |
| Resource propagation between tasks | `convex/lib/taskFlowResources.ts` |
| Display role mapping | `src/lib/roles.ts` |
| R2 file endpoints | `src/app/api/r2-file`, `src/app/api/r2-upload` |
| Electron bridge | `electron/main.ts`, `electron/preload.ts`, `src/components/DesktopNotificationBridge.tsx` |

### When touching the approval flow, remember

1. Every layer has its own reviewedBy/reviewedAt/reviewNote trio.
2. Manager-level reject clears the WHOLE chain.
3. Task goes `done` only when every deliverable on it is approved.
4. Client-facing tasks wait at `review` until JSR approval.
5. Auto-handoff only fires for content_calendar + handoff target + not client-facing.
6. Resource propagation runs on every approval along taskConnections edges.
7. Single-task briefs sync status 1:1 with their one task.
8. Multi-task briefs complete only when all tasks done.

---

## 18. Open Questions for Follow-up

Things worth verifying before your next change:

1. Are `/api/r2-file` and `/api/r2-upload` actually authed? (The sub-agent did not confirm explicit checks.)
2. Is the "overdue halt" enforced in the UI or just shown? (Backend does not block submissions.)
3. Is there a plan to fully migrate from Convex `_storage` to R2?
4. Is the JSR token rotation policy documented anywhere?
5. Does `setSuperAdmins` ever get called in production, or is it a manual admin-console action?

---

*End of audit. All files in `/convex` were read directly except schema.ts and approvals.ts, which were read earlier in the session and remain summarized from memory per the context reminder. Frontend structure, JSR, content calendar, and AI action were explored via sub-agent with thorough coverage.*
