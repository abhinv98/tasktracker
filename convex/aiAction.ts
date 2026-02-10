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
      name: "create_brief_from_content",
      description:
        "Parse document/text content and create a brief with extracted information. Admin only. Use this when the user provides a document or describes a brief to create.",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description:
              "The text content from a document or user description to parse into a brief",
          },
          brandId: {
            type: "string",
            description: "Optional brand ID to associate with",
          },
        },
        required: ["content"],
      },
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
      model: "gpt-4o-mini",
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      max_tokens: 2048,
      temperature: 0.3,
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
        model: "gpt-4o-mini",
        messages,
        tools: TOOLS,
        tool_choice: "auto",
        max_tokens: 2048,
        temperature: 0.3,
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
  return `You are the AI assistant for "The Orchestrator", a task tracking app. Be fast and direct.

User: ${userName} (${role})

Rules:
- Keep responses SHORT. 2-4 sentences max for simple questions. Use bullet points for lists.
- Use tools to get real data. Never guess.
- ${role === "admin" ? "This user can do everything: create briefs, create brands, assign teams to briefs, assign managers, create tasks, update statuses, manage brands/teams/users." : role === "manager" ? "This user can view assigned briefs/brands, assign teams to their briefs, create tasks in their briefs, update statuses." : "This user can view their tasks, update task status, and submit deliverables."}
- You can assign teams to briefs using assign_teams_to_brief. Use list_teams to find team IDs first.
- You can create tasks, update statuses, assign managers -- use the appropriate tools.
- For permissions the user doesn't have, say so briefly.
- Use light formatting: **bold** for emphasis, bullet points for lists. No headers. No excessive formatting.
- Get straight to the answer. Don't repeat the question back.
- At the end of a multi-step operation, summarize everything that was done.

CRITICAL — Multi-step workflow rules:
- NEVER create the same resource twice. Each brief, brand, or task should be created exactly ONCE.
- After creating a resource, SAVE its returned ID and reuse that SAME ID for all subsequent operations.
- For complex requests (e.g., "create a brief with brand, assign teams, and create tasks"), follow this EXACT order:
  1. First, list_brands to check if the brand already exists. If NOT, use create_brand to create it. Save the brandId.
  2. Then create the brief (use create_brief or create_brief_from_content) with the brandId. Save the briefId.
  3. Then list_teams to find the right team. Use assign_teams_to_brief with the saved briefId.
  4. Then get_team_members to get team member IDs. Use create_task for each task with the saved briefId.
- If a tool call fails, DO NOT retry the same operation blindly. Read the error, fix the issue, then try ONCE more.
- NEVER call create_brief or create_brief_from_content more than once for the same brief.
- When creating tasks from a document, extract meaningful task titles and DISTRIBUTE them evenly across ALL team members (round-robin), not just one person.
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
      const briefId = await ctx.runMutation(api.briefs.createBrief, {
        title: fnArgs.title,
        description: fnArgs.description,
        deadline: fnArgs.deadline,
        brandId: fnArgs.brandId,
      });
      return JSON.stringify({
        success: true,
        briefId,
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

    case "create_brief_from_content": {
      if (role !== "admin") {
        return JSON.stringify({
          error: "Only admins can create briefs",
        });
      }

      // Use OpenAI to parse the content into brief structure
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      // Get available brands for context
      const brands = await ctx.runQuery(api.brands.listBrands, {});
      const brandList = brands
        .map(
          (b: Record<string, unknown>) =>
            `- ${b.name} (ID: ${b._id})`
        )
        .join("\n");

      const parseResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a document parser. Extract brief information from the given content and return a JSON object with these fields:
- title (string, required): A concise title for the brief
- description (string, required): A comprehensive description summarizing the document
- deadline (string or null): If a deadline is mentioned, return it as ISO date string, otherwise null

Available brands (use the EXACT ID string, not the name):
${brandList || "No brands available"}

If the content mentions a brand that matches one above, include "brandId" with the EXACT ID value (the long alphanumeric string), NOT the brand name.
If no brand matches, do NOT include brandId at all.

Return ONLY valid JSON, no markdown or explanation.`,
          },
          { role: "user", content: fnArgs.content },
        ],
        max_tokens: 1024,
      });

      const parsed = parseResponse.choices[0]?.message?.content;
      if (!parsed)
        return JSON.stringify({ error: "Failed to parse content" });

      let briefData;
      try {
        briefData = JSON.parse(parsed);
      } catch {
        return JSON.stringify({
          error: "Failed to parse document content into brief format",
        });
      }

      const briefArgs: {
        title: string;
        description: string;
        deadline?: number;
        brandId?: string;
      } = {
        title: briefData.title,
        description: briefData.description,
      };

      if (briefData.deadline) {
        briefArgs.deadline = new Date(briefData.deadline).getTime();
      }

      // Resolve brandId - validate it's a real Convex ID, otherwise try to match by name
      const rawBrandId = fnArgs.brandId || briefData.brandId;
      if (rawBrandId) {
        // Check if it looks like a valid Convex document ID (they contain specific patterns)
        const matchedBrand = brands.find(
          (b: Record<string, unknown>) =>
            b._id === rawBrandId ||
            (b.name as string).toLowerCase() === rawBrandId.toLowerCase()
        );
        if (matchedBrand) {
          briefArgs.brandId = matchedBrand._id as string;
        }
        // If no match found, skip brandId rather than passing an invalid value
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const briefId = await ctx.runMutation(api.briefs.createBrief, briefArgs as any);

      return JSON.stringify({
        success: true,
        briefId,
        title: briefArgs.title,
        description: briefArgs.description,
        brandLinked: !!briefArgs.brandId,
        message: `Brief "${briefArgs.title}" created successfully. Use briefId "${briefId}" for all subsequent operations (assign teams, create tasks). Do NOT create another brief.`,
      });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${fnName}` });
  }
}
