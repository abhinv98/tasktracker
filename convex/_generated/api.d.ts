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
import type * as brands from "../brands.js";
import type * as briefs from "../briefs.js";
import type * as chat from "../chat.js";
import type * as comments from "../comments.js";
import type * as crons from "../crons.js";
import type * as deliverables from "../deliverables.js";
import type * as dm from "../dm.js";
import type * as http from "../http.js";
import type * as notifications from "../notifications.js";
import type * as reminders from "../reminders.js";
import type * as schedule from "../schedule.js";
import type * as search from "../search.js";
import type * as seed from "../seed.js";
import type * as tasks from "../tasks.js";
import type * as teams from "../teams.js";
import type * as templates from "../templates.js";
import type * as timeTracking from "../timeTracking.js";
import type * as users from "../users.js";

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
  brands: typeof brands;
  briefs: typeof briefs;
  chat: typeof chat;
  comments: typeof comments;
  crons: typeof crons;
  deliverables: typeof deliverables;
  dm: typeof dm;
  http: typeof http;
  notifications: typeof notifications;
  reminders: typeof reminders;
  schedule: typeof schedule;
  search: typeof search;
  seed: typeof seed;
  tasks: typeof tasks;
  teams: typeof teams;
  templates: typeof templates;
  timeTracking: typeof timeTracking;
  users: typeof users;
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
