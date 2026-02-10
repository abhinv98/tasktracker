"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_briefs",
      description:
        "List all briefs visible to the current user. Returns title, status, manager, progress, task counts, deadline, and brand info.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: [
              "draft",
              "active",
              "in-progress",
              "review",
              "completed",
              "archived",
            ],
            description: "Optional status filter",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_brief_details",
      description:
        "Get detailed information about a specific brief including its tasks, assigned teams, manager, and progress.",
      parameters: {
        type: "object",
        properties: {
          briefId: {
            type: "string",
            description: "The brief ID to look up",
          },
        },
        required: ["briefId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_brief",
      description:
        "Create a new brief. Only available for admin users. Returns the new brief ID.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Brief title" },
          description: { type: "string", description: "Brief description" },
          deadline: {
            type: "number",
            description:
              "Optional deadline as Unix timestamp in milliseconds",
          },
          brandId: {
            type: "string",
            description: "Optional brand ID to associate with",
          },
        },
        required: ["title", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_brands",
      description:
        "List all brands. Returns name, description, manager count, brief count.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_brand_info",
      description:
        "Get detailed information about a specific brand including managers, briefs, employees, task stats.",
      parameters: {
        type: "object",
        properties: {
          brandId: {
            type: "string",
            description: "The brand ID to look up",
          },
        },
        required: ["brandId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_brand",
      description:
        "Create a new brand. Admin only. Returns the new brand ID. Use this BEFORE create_brief when the user wants a new brand.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Brand name" },
          description: {
            type: "string",
            description: "Optional brand description",
          },
          color: {
            type: "string",
            description:
              "Brand color as hex code (e.g. '#3B82F6'). Pick a professional color if not specified.",
          },
        },
        required: ["name", "color"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_teams",
      description:
        "List all teams with their lead name and member count.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_tasks",
      description:
        "Get all tasks assigned to the current user, including brief name, status, duration, and sort order.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dashboard_stats",
      description:
        "Get aggregated dashboard statistics: total briefs, tasks, completion rates, brand overview.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "assign_teams_to_brief",
      description:
        "Assign one or more teams to a brief. Admin or assigned manager only. Provide the brief ID and an array of team IDs.",
      parameters: {
        type: "object",
        properties: {
          briefId: {
            type: "string",
            description: "The brief ID to assign teams to",
          },
          teamIds: {
            type: "array",
            items: { type: "string" },
            description: "Array of team IDs to assign",
          },
        },
        required: ["briefId", "teamIds"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "assign_manager_to_brief",
      description:
        "Assign a manager to a brief. Admin only. Provide the brief ID and the manager's user ID.",
      parameters: {
        type: "object",
        properties: {
          briefId: {
            type: "string",
            description: "The brief ID",
          },
          managerId: {
            type: "string",
            description: "The user ID of the manager to assign",
          },
        },
        required: ["briefId", "managerId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description:
        "Create a new task within a brief. Admin or assigned manager only. Requires briefId, title, assigneeId, and duration.",
      parameters: {
        type: "object",
        properties: {
          briefId: {
            type: "string",
            description: "The brief ID to create the task in",
          },
          title: {
            type: "string",
            description: "Task title",
          },
          description: {
            type: "string",
            description: "Optional task description",
          },
          assigneeId: {
            type: "string",
            description: "The user ID of the employee to assign the task to",
          },
          duration: {
            type: "string",
            description: "Duration string like '2h', '30m', '1d'",
          },
        },
        required: ["briefId", "title", "assigneeId", "duration"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_task_status",
      description:
        "Update the status of a task. Available statuses: pending, in-progress, review, done.",
      parameters: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "The task ID to update",
          },
          newStatus: {
            type: "string",
            enum: ["pending", "in-progress", "review", "done"],
            description: "The new status",
          },
        },
        required: ["taskId", "newStatus"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_brief_status",
      description:
        "Update the status of a brief. Admin or assigned manager only.",
      parameters: {
        type: "object",
        properties: {
          briefId: {
            type: "string",
            description: "The brief ID to update",
          },
          status: {
            type: "string",
            enum: ["draft", "active", "in-progress", "review", "completed"],
            description: "The new status",
          },
        },
        required: ["briefId", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_team_members",
      description:
        "Get the members of a specific team by team ID.",
      parameters: {
        type: "object",
        properties: {
          teamId: {
            type: "string",
            description: "The team ID to look up",
          },
        },
        required: ["teamId"],
      },
    },
  },
];

export const sendMessage = action({
  args: {
    message: v.string(),
    fileId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    conversationId: v.optional(v.id("chatConversations")),
  },
  handler: async (ctx, args) => {
    // 1. Get current user
    const user = await ctx.runQuery(api.users.getCurrentUser);
    if (!user) throw new Error("Not authenticated");

    const role = user.role ?? "employee";

    // 2. Read file content if a file was uploaded
    let fileContent = "";
    if (args.fileId) {
      try {
        const blob = await ctx.storage.get(args.fileId);
        if (blob) {
          fileContent = await blob.text();
        }
      } catch {
        fileContent = "[Could not read file content]";
      }
    }

    // 3. Store the user message
    await ctx.runMutation(internal.chat.storeChatMessage, {
      userId: user._id,
      conversationId: args.conversationId,
      role: "user",
      content: args.message + (args.fileName ? ` [File: ${args.fileName}]` : ""),
      fileId: args.fileId,
      fileName: args.fileName,
    });

    // 4. Get recent chat history for context (limit for speed)
    const history = await ctx.runQuery(api.chat.getChatHistory, {
      conversationId: args.conversationId,
    });
    const recentMessages = history.slice(-10);

    // 5. Build conversation messages
    const systemPrompt = buildSystemPrompt(user.name ?? user.email ?? "User", role);

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
    ];

    // Add history (skip the very last one since we just stored it)
    for (const msg of recentMessages.slice(0, -1)) {
      messages.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      });
    }

    // Add current message
    let currentContent = args.message;
    if (fileContent) {
      currentContent += `\n\n--- Attached File: ${args.fileName} ---\n${fileContent}\n--- End of File ---`;
    }
    messages.push({ role: "user", content: currentContent });

    // 6. Call OpenAI with tools
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    let response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      max_tokens: 4096,
      temperature: 0.2,
    });

    let assistantMessage = response.choices[0]?.message;

    // 7. Handle tool calls in a loop (max 15 iterations for complex multi-step operations)
    let iterations = 0;
    const toolSteps: { tool: string; args: Record<string, unknown>; result: string; success: boolean }[] = [];

    while (assistantMessage?.tool_calls && iterations < 15) {
      iterations++;
      messages.push(assistantMessage);

      for (const toolCall of assistantMessage.tool_calls) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tc = toolCall as any;
        const fnName = tc.function.name as string;
        const fnArgs = JSON.parse(tc.function.arguments as string);
        let result: string;
        let success = true;

        try {
          result = await executeTool(ctx, fnName, fnArgs, user, role);
        } catch (e: unknown) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          result = JSON.stringify({ error: errorMsg });
          success = false;
        }

        // Track the tool step
        toolSteps.push({
          tool: fnName,
          args: fnArgs,
          result: result.length > 500 ? result.slice(0, 500) + "..." : result,
          success,
        });

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      }

      response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages,
        tools: TOOLS,
        tool_choice: "auto",
        max_tokens: 4096,
        temperature: 0.2,
      });

      assistantMessage = response.choices[0]?.message;
    }

    const aiReply =
      assistantMessage?.content ?? "I'm sorry, I couldn't generate a response.";

    // 8. Store the AI response with tool steps
    await ctx.runMutation(internal.chat.storeChatMessage, {
      userId: user._id,
      conversationId: args.conversationId,
      role: "assistant",
      content: aiReply,
      toolSteps: toolSteps.length > 0 ? JSON.stringify(toolSteps) : undefined,
    });

    return aiReply;
  },
});

function buildSystemPrompt(userName: string, role: string): string {
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return `You are the AI assistant for "The Orchestrator", a task tracking app. Be fast and direct.

User: ${userName} (${role})
Today's date: ${today}

Rules:
- Keep responses SHORT. 2-4 sentences max for simple questions. Use bullet points for lists.
- Use tools to get real data. Never guess.
- ${role === "admin" ? "This user can do everything: create briefs, create brands, assign teams to briefs, assign managers, create tasks, update statuses, manage brands/teams/users." : role === "manager" ? "This user can view assigned briefs/brands, assign teams to their briefs, create tasks in their briefs, update statuses." : "This user can view their tasks, update task status, and submit deliverables."}
- For permissions the user doesn't have, say so briefly.
- Use light formatting: **bold** for emphasis, bullet points for lists. No headers. No excessive formatting.
- Get straight to the answer. Don't repeat the question back.
- At the end of a multi-step operation, summarize everything that was done.

IMPORTANT — A "brand" and a "brief" are DIFFERENT things:
- A BRAND is a client/company (e.g., "L&T Finance", "Nike"). Use create_brand to create one.
- A BRIEF is a project/campaign for a brand (e.g., "Corporate Website Redesign"). Use create_brief to create one.
- A brand can have many briefs. A brief belongs to one brand.
- When the user says "create the brand", they mean use the create_brand tool. NEVER create a brand by calling create_brief.

CRITICAL — When user attaches a document and asks to create a brief + brand:
You MUST follow these steps IN THIS EXACT ORDER. Do NOT skip or combine steps.

Step 1: Call list_brands to check existing brands.
Step 2: If the brand doesn't exist, call create_brand with the brand name from the document. Save the returned brandId.
Step 3: Call create_brief with the brief title, description, deadline (as Unix timestamp in ms — make sure the year is correct, e.g. 2025 not 2005), and the brandId from Step 2. Save the returned briefId.
Step 4: Call list_teams to find the right team. Then call assign_teams_to_brief with the briefId from Step 3.
Step 5: Call get_team_members to get member IDs. Then call create_task for EACH task, using the briefId from Step 3. DISTRIBUTE tasks across ALL team members using round-robin (not all to one person).

Additional rules:
- NEVER create the same resource twice. Each brief, brand, or task should be created exactly ONCE.
- After creating a resource, SAVE its returned ID and reuse that SAME ID for all subsequent operations.
- If a tool call fails, DO NOT retry blindly. Read the error, fix the issue, then try ONCE more.
- NEVER call create_brief more than once for the same brief.
- For deadlines: convert dates to Unix timestamp in milliseconds. Double-check the YEAR — if the document says "March 2025", the timestamp must be for year 2025, not 2005 or any other year.
- When distributing tasks, if you have N tasks and M team members, assign approximately N/M tasks to each member.`;
}

async function executeTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  fnName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fnArgs: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: any,
  role: string
): Promise<string> {
  switch (fnName) {
    case "list_briefs": {
      const briefs = await ctx.runQuery(api.briefs.listBriefs, {
        status: fnArgs.status,
      });
      return JSON.stringify(
        briefs.map((b: Record<string, unknown>) => ({
          id: b._id,
          title: b.title,
          status: b.status,
          manager: b.managerName,
          progress: b.progress,
          taskCount: b.taskCount,
          doneCount: b.doneCount,
          teamNames: b.teamNames,
          deadline: b.deadline
            ? new Date(b.deadline as number).toLocaleDateString()
            : null,
        }))
      );
    }

    case "get_brief_details": {
      const brief = await ctx.runQuery(api.briefs.getBrief, {
        briefId: fnArgs.briefId,
      });
      if (!brief) return JSON.stringify({ error: "Brief not found" });
      return JSON.stringify({
        id: brief._id,
        title: brief.title,
        description: brief.description,
        status: brief.status,
        manager: brief.manager
          ? { name: brief.manager.name, email: brief.manager.email }
          : null,
        progress: brief.progress,
        taskCount: brief.taskCount,
        doneCount: brief.doneCount,
        deadline: brief.deadline
          ? new Date(brief.deadline).toLocaleDateString()
          : null,
        teams: brief.assignedTeams?.map(
          (t: Record<string, unknown>) => t.name
        ),
        tasks: brief.tasks?.map((t: Record<string, unknown>) => ({
          id: t._id,
          title: t.title,
          status: t.status,
          duration: t.duration,
          assigneeId: t.assigneeId,
        })),
      });
    }

    case "create_brief": {
      if (role !== "admin") {
        return JSON.stringify({
          error: "Only admins can create briefs",
        });
      }

      // Validate brandId — sanitize empty strings and resolve brand names
      let resolvedBrandId: string | undefined = undefined;
      if (fnArgs.brandId && typeof fnArgs.brandId === "string" && fnArgs.brandId.trim() !== "") {
        const allBrands = await ctx.runQuery(api.brands.listBrands, {});
        const matched = allBrands.find(
          (b: Record<string, unknown>) =>
            b._id === fnArgs.brandId ||
            (b.name as string).toLowerCase() === fnArgs.brandId.toLowerCase()
        );
        if (matched) {
          resolvedBrandId = matched._id as string;
        }
        // If no match found, skip brandId rather than passing an invalid value
      }

      // Sanitize deadline — ensure it's a reasonable future-ish date (after year 2020)
      let deadline = fnArgs.deadline;
      if (deadline && typeof deadline === "number") {
        const deadlineDate = new Date(deadline);
        if (deadlineDate.getFullYear() < 2020) {
          // AI probably computed the timestamp wrong — try to fix common errors
          deadline = undefined; // drop it rather than store a wrong date
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const briefId = await ctx.runMutation(api.briefs.createBrief, {
        title: fnArgs.title,
        description: fnArgs.description,
        ...(deadline ? { deadline } : {}),
        ...(resolvedBrandId ? { brandId: resolvedBrandId } : {}),
      } as any);
      return JSON.stringify({
        success: true,
        briefId,
        brandLinked: !!resolvedBrandId,
        message: `Brief "${fnArgs.title}" created successfully. Use briefId "${briefId}" for all subsequent operations. Do NOT create another brief.`,
      });
    }

    case "list_brands": {
      const brands = await ctx.runQuery(api.brands.listBrands, {});
      return JSON.stringify(
        brands.map((b: Record<string, unknown>) => ({
          id: b._id,
          name: b.name,
          description: b.description,
          color: b.color,
          managerCount: b.managerCount,
          managerNames: b.managerNames,
          briefCount: b.briefCount,
          activeBriefCount: b.activeBriefCount,
        }))
      );
    }

    case "get_brand_info": {
      const brand = await ctx.runQuery(api.brands.getBrand, {
        brandId: fnArgs.brandId,
      });
      if (!brand) return JSON.stringify({ error: "Brand not found" });
      return JSON.stringify({
        id: brand._id,
        name: brand.name,
        description: brand.description,
        color: brand.color,
        totalTasks: brand.totalTasks,
        taskStatusCounts: brand.taskStatusCounts,
        employeeCount: brand.employeeCount,
        managers: brand.managers?.map(
          (m: Record<string, unknown>) => ({
            name: m.name,
            email: m.email,
          })
        ),
        briefs: brand.briefs?.map(
          (b: Record<string, unknown>) => ({
            id: b._id,
            title: b.title,
            status: b.status,
            progress: b.progress,
            taskCount: b.taskCount,
          })
        ),
      });
    }

    case "create_brand": {
      if (role !== "admin") {
        return JSON.stringify({ error: "Only admins can create brands" });
      }
      const brandId = await ctx.runMutation(api.brands.createBrand, {
        name: fnArgs.name,
        description: fnArgs.description,
        color: fnArgs.color ?? "#3B82F6",
      });
      return JSON.stringify({
        success: true,
        brandId,
        message: `Brand "${fnArgs.name}" created successfully`,
      });
    }

    case "list_teams": {
      const teams = await ctx.runQuery(api.teams.listTeams, {});
      return JSON.stringify(
        teams.map((t: Record<string, unknown>) => ({
          id: t._id,
          name: t.name,
          description: t.description,
          leadName: t.leadName,
          memberCount: t.memberCount,
          color: t.color,
        }))
      );
    }

    case "get_my_tasks": {
      const tasks = await ctx.runQuery(api.tasks.listTasksForUser, {
        userId: user._id,
      });
      return JSON.stringify(
        tasks.map((t: Record<string, unknown>) => ({
          id: t._id,
          title: t.title,
          status: t.status,
          duration: t.duration,
          briefName: t.briefName,
          sortOrder: t.sortOrder,
          deadline: t.deadline
            ? new Date(t.deadline as number).toLocaleDateString()
            : null,
        }))
      );
    }

    case "get_dashboard_stats": {
      const briefs = await ctx.runQuery(api.briefs.listBriefs, {});
      const brands = await ctx.runQuery(api.brands.listBrands, {});
      const teams = await ctx.runQuery(api.teams.listTeams, {});

      const totalBriefs = briefs.length;
      const totalTasks = briefs.reduce(
        (sum: number, b: Record<string, unknown>) =>
          sum + (b.taskCount as number),
        0
      );
      const doneTasks = briefs.reduce(
        (sum: number, b: Record<string, unknown>) =>
          sum + (b.doneCount as number),
        0
      );

      const statusCounts: Record<string, number> = {};
      for (const b of briefs) {
        const s = b.status as string;
        statusCounts[s] = (statusCounts[s] || 0) + 1;
      }

      return JSON.stringify({
        totalBriefs,
        totalTasks,
        doneTasks,
        completionRate:
          totalTasks > 0
            ? Math.round((doneTasks / totalTasks) * 100)
            : 0,
        briefsByStatus: statusCounts,
        totalBrands: brands.length,
        totalTeams: teams.length,
      });
    }

    case "assign_teams_to_brief": {
      if (role !== "admin" && role !== "manager") {
        return JSON.stringify({ error: "Only admins and managers can assign teams to briefs" });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ctx.runMutation(api.briefs.assignTeamsToBrief, {
        briefId: fnArgs.briefId,
        teamIds: fnArgs.teamIds,
      } as any);
      return JSON.stringify({
        success: true,
        message: `Assigned ${fnArgs.teamIds.length} team(s) to brief`,
      });
    }

    case "assign_manager_to_brief": {
      if (role !== "admin") {
        return JSON.stringify({ error: "Only admins can assign managers" });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ctx.runMutation(api.briefs.updateBrief, {
        briefId: fnArgs.briefId,
        assignedManagerId: fnArgs.managerId,
      } as any);
      return JSON.stringify({
        success: true,
        message: `Manager assigned to brief`,
      });
    }

    case "create_task": {
      if (role !== "admin" && role !== "manager") {
        return JSON.stringify({ error: "Only admins and managers can create tasks" });
      }
      const durationStr = fnArgs.duration as string;
      const m = durationStr.match(/^(\d+)(m|h|d)$/i);
      let durationMinutes = 120; // default 2h
      if (m) {
        const val = parseInt(m[1], 10);
        const unit = m[2].toLowerCase();
        if (unit === "m") durationMinutes = val;
        else if (unit === "h") durationMinutes = val * 60;
        else if (unit === "d") durationMinutes = val * 60 * 8;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const taskId = await ctx.runMutation(api.tasks.createTask, {
        briefId: fnArgs.briefId,
        title: fnArgs.title,
        description: fnArgs.description,
        assigneeId: fnArgs.assigneeId,
        duration: fnArgs.duration,
        durationMinutes,
      } as any);
      return JSON.stringify({
        success: true,
        taskId,
        message: `Task "${fnArgs.title}" created`,
      });
    }

    case "update_task_status": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ctx.runMutation(api.tasks.updateTaskStatus, {
        taskId: fnArgs.taskId,
        newStatus: fnArgs.newStatus,
      } as any);
      return JSON.stringify({
        success: true,
        message: `Task status updated to ${fnArgs.newStatus}`,
      });
    }

    case "update_brief_status": {
      if (role !== "admin" && role !== "manager") {
        return JSON.stringify({ error: "Only admins and managers can update brief status" });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ctx.runMutation(api.briefs.updateBrief, {
        briefId: fnArgs.briefId,
        status: fnArgs.status,
      } as any);
      return JSON.stringify({
        success: true,
        message: `Brief status updated to ${fnArgs.status}`,
      });
    }

    case "get_team_members": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const members = await ctx.runQuery(api.teams.getTeamMembers, {
        teamId: fnArgs.teamId,
      } as any);
      return JSON.stringify(
        (members ?? []).map((m: Record<string, unknown>) => ({
          id: m._id,
          name: m.name,
          email: m.email,
          role: m.role,
        }))
      );
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${fnName}` });
  }
}
