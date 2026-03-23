/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activityLog from "../activityLog.js";
import type * as aiAction from "../aiAction.js";
import type * as analytics from "../analytics.js";
import type * as approvals from "../approvals.js";
import type * as attachments from "../attachments.js";
import type * as auth from "../auth.js";
import type * as brandCredentials from "../brandCredentials.js";
import type * as brandDocuments from "../brandDocuments.js";
import type * as brandLinks from "../brandLinks.js";
import type * as brands from "../brands.js";
import type * as briefs from "../briefs.js";
import type * as chat from "../chat.js";
import type * as comments from "../comments.js";
import type * as contentCalendar from "../contentCalendar.js";
import type * as crons from "../crons.js";
import type * as deliverables from "../deliverables.js";
import type * as dm from "../dm.js";
import type * as http from "../http.js";
import type * as jsr from "../jsr.js";
import type * as lib_syncBriefStatus from "../lib/syncBriefStatus.js";
import type * as meetingMinutes from "../meetingMinutes.js";
import type * as migrations_backfillReviewAt from "../migrations/backfillReviewAt.js";
import type * as migrations_checkDeadlineValues from "../migrations/checkDeadlineValues.js";
import type * as migrations_checkPremTask from "../migrations/checkPremTask.js";
import type * as migrations_checkTimeEntries from "../migrations/checkTimeEntries.js";
import type * as migrations_findDuplicateUsers from "../migrations/findDuplicateUsers.js";
import type * as migrations_findUser from "../migrations/findUser.js";
import type * as migrations_fixAdminDoneBriefs from "../migrations/fixAdminDoneBriefs.js";
import type * as migrations_fixDeadlines from "../migrations/fixDeadlines.js";
import type * as migrations_fixSingleTaskBriefStatus from "../migrations/fixSingleTaskBriefStatus.js";
import type * as migrations_mergeAccounts from "../migrations/mergeAccounts.js";
import type * as migrations_normalizeDeadlines from "../migrations/normalizeDeadlines.js";
import type * as migrations_resetPassword from "../migrations/resetPassword.js";
import type * as migrations_syncSingleTaskBriefs from "../migrations/syncSingleTaskBriefs.js";
import type * as notifications from "../notifications.js";
import type * as passwordChange from "../passwordChange.js";
import type * as reminders from "../reminders.js";
import type * as reports from "../reports.js";
import type * as schedule from "../schedule.js";
import type * as search from "../search.js";
import type * as seed from "../seed.js";
import type * as taskDailySummaries from "../taskDailySummaries.js";
import type * as tasks from "../tasks.js";
import type * as teams from "../teams.js";
import type * as templates from "../templates.js";
import type * as timeTracking from "../timeTracking.js";
import type * as users from "../users.js";
import type * as worklog from "../worklog.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activityLog: typeof activityLog;
  aiAction: typeof aiAction;
  analytics: typeof analytics;
  approvals: typeof approvals;
  attachments: typeof attachments;
  auth: typeof auth;
  brandCredentials: typeof brandCredentials;
  brandDocuments: typeof brandDocuments;
  brandLinks: typeof brandLinks;
  brands: typeof brands;
  briefs: typeof briefs;
  chat: typeof chat;
  comments: typeof comments;
  contentCalendar: typeof contentCalendar;
  crons: typeof crons;
  deliverables: typeof deliverables;
  dm: typeof dm;
  http: typeof http;
  jsr: typeof jsr;
  "lib/syncBriefStatus": typeof lib_syncBriefStatus;
  meetingMinutes: typeof meetingMinutes;
  "migrations/backfillReviewAt": typeof migrations_backfillReviewAt;
  "migrations/checkDeadlineValues": typeof migrations_checkDeadlineValues;
  "migrations/checkPremTask": typeof migrations_checkPremTask;
  "migrations/checkTimeEntries": typeof migrations_checkTimeEntries;
  "migrations/findDuplicateUsers": typeof migrations_findDuplicateUsers;
  "migrations/findUser": typeof migrations_findUser;
  "migrations/fixAdminDoneBriefs": typeof migrations_fixAdminDoneBriefs;
  "migrations/fixDeadlines": typeof migrations_fixDeadlines;
  "migrations/fixSingleTaskBriefStatus": typeof migrations_fixSingleTaskBriefStatus;
  "migrations/mergeAccounts": typeof migrations_mergeAccounts;
  "migrations/normalizeDeadlines": typeof migrations_normalizeDeadlines;
  "migrations/resetPassword": typeof migrations_resetPassword;
  "migrations/syncSingleTaskBriefs": typeof migrations_syncSingleTaskBriefs;
  notifications: typeof notifications;
  passwordChange: typeof passwordChange;
  reminders: typeof reminders;
  reports: typeof reports;
  schedule: typeof schedule;
  search: typeof search;
  seed: typeof seed;
  taskDailySummaries: typeof taskDailySummaries;
  tasks: typeof tasks;
  teams: typeof teams;
  templates: typeof templates;
  timeTracking: typeof timeTracking;
  users: typeof users;
  worklog: typeof worklog;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
