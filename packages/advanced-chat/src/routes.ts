import { Context, Session } from "yumeri";
import { randomUUID } from "node:crypto";
import type { AdvancedChatService } from "./index.js";
import { openChatStream } from "./stream.js";

export function registerAdvancedChatRoutes(
  ctx: Context,
  service: AdvancedChatService,
) {
  const db = ctx.component.database;
  const user = async (session: Session) => {
    return session.properties.user as { id?: number } | undefined;
  };
  const body = async (session: Session) =>
    (await session.parseRequestBody()) as Record<string, unknown>;
  const list = (value: unknown) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  const agent = (value: any) => ({
    ...value,
    id: value.stable_id || String(value.id ?? ""),
  });
  const terminalTask = async (
    session: Session,
    userId: number,
    deviceId: string,
    action: string,
    payload: Record<string, unknown>,
  ) => {
    const task = await service.createConnectorTask(
      userId,
      deviceId.trim(),
      action,
      payload,
    );
    const deadline = Date.now() + 25_000;
    while (Date.now() < deadline) {
      const current: any = await db.selectOne("advanced_chat_connector_tasks", {
        id: task.id,
        user_id: userId,
      });
      if (current?.status === "completed") {
        try {
          session.respond(JSON.parse(String(current.result || "{}")), "json");
        } catch {
          session.status = 502;
          session.respond(
            { error: "Invalid connector terminal response" },
            "json",
          );
        }
        return;
      }
      if (current?.status === "failed") {
        session.status = 502;
        session.respond(
          {
            error: String(
              current.error_message || "Connector terminal task failed",
            ),
          },
          "json",
        );
        return;
      }
      await new Promise((resolve) => ctx.setTimeout(resolve, 150));
    }
    await db.update(
      "advanced_chat_connector_tasks",
      { id: task.id, user_id: userId },
      {
        status: "failed",
        error_message: "Connector terminal task timed out",
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    );
    session.status = 502;
    session.respond({ error: "Connector terminal task timed out" }, "json");
  };
  const terminalDevice = async (session: Session, value: unknown) => {
    const current = await user(session);
    const deviceId = String(value ?? "").trim();
    if (current?.id === undefined || !deviceId) return undefined;
    const device: any = await db.selectOne("advanced_chat_connector_devices", {
      id: deviceId,
      user_id: current.id,
      status: "online",
    });
    if (!device) {
      session.status = 400;
      session.respond({ error: "A connected device is required" }, "json");
      return undefined;
    }
    return { userId: current.id, device };
  };

  ctx
    .route("/api/user/advanced-chat/terminal/open")
    .methods("POST")
    .action(async (session) => {
      const input = await body(session);
      const target = await terminalDevice(session, input.connector_device_id);
      if (!target) return;
      const shell = String(input.shell ?? "")
        .trim()
        .toLowerCase();
      if (
        shell &&
        !["cmd", "powershell", "pwsh", "bash", "zsh", "sh"].includes(shell)
      ) {
        session.status = 400;
        session.respond({ error: "Unsupported terminal shell" }, "json");
        return;
      }
      const cols = Number(input.cols ?? 120) || 120;
      const rows = Number(input.rows ?? 30) || 30;
      if (cols < 0 || rows < 0 || cols > 500 || rows > 200) {
        session.status = 400;
        session.respond(
          { error: "Terminal dimensions are out of range" },
          "json",
        );
        return;
      }
      await terminalTask(
        session,
        target.userId,
        target.device.id,
        "terminal_open",
        {
          workspace_path: String(input.connector_workspace_path ?? "").trim(),
          ...(shell ? { shell } : {}),
          cols,
          rows,
        },
      );
    });
  ctx
    .route("/api/user/advanced-chat/terminal/input")
    .methods("POST")
    .action(async (session) => {
      const input = await body(session);
      const target = await terminalDevice(session, input.connector_device_id);
      if (!target) return;
      const terminalId = String(input.terminal_id ?? "").trim();
      const data = String(input.data ?? "");
      if (
        !terminalId ||
        terminalId.length > 80 ||
        !/^[A-Za-z0-9+/=_-]*$/.test(data)
      ) {
        session.status = 400;
        session.respond({ error: "Invalid terminal input" }, "json");
        return;
      }
      try {
        if (Buffer.from(data, "base64").byteLength > 8192) throw Error();
      } catch {
        session.status = 400;
        session.respond({ error: "Terminal input is too large" }, "json");
        return;
      }
      await terminalTask(
        session,
        target.userId,
        target.device.id,
        "terminal_input",
        {
          terminal_id: terminalId,
          data,
        },
      );
    });
  ctx
    .route("/api/user/advanced-chat/terminal/output")
    .methods("GET")
    .action(async (session) => {
      const target = await terminalDevice(
        session,
        session.query.connector_device_id,
      );
      if (!target) return;
      const terminalId = String(session.query.terminal_id ?? "").trim();
      const offset = Number(session.query.offset ?? 0);
      if (
        !terminalId ||
        terminalId.length > 80 ||
        !Number.isSafeInteger(offset) ||
        offset < 0
      ) {
        session.status = 400;
        session.respond({ error: "Invalid terminal query" }, "json");
        return;
      }
      await terminalTask(
        session,
        target.userId,
        target.device.id,
        "terminal_read",
        {
          terminal_id: terminalId,
          offset,
        },
      );
    });
  for (const [path, action] of [
    ["resize", "terminal_resize"],
    ["close", "terminal_close"],
  ] as const) {
    ctx
      .route(`/api/user/advanced-chat/terminal/${path}`)
      .methods("POST")
      .action(async (session) => {
        const input = await body(session);
        const target = await terminalDevice(session, input.connector_device_id);
        if (!target) return;
        const terminalId = String(input.terminal_id ?? "").trim();
        if (!terminalId || terminalId.length > 80) {
          session.status = 400;
          session.respond({ error: "Terminal id is required" }, "json");
          return;
        }
        if (path === "resize") {
          const cols = Number(input.cols ?? 120) || 120;
          const rows = Number(input.rows ?? 30) || 30;
          if (cols < 0 || rows < 0 || cols > 500 || rows > 200) {
            session.status = 400;
            session.respond(
              { error: "Terminal dimensions are out of range" },
              "json",
            );
            return;
          }
          await terminalTask(session, target.userId, target.device.id, action, {
            terminal_id: terminalId,
            cols,
            rows,
          });
        } else
          await terminalTask(session, target.userId, target.device.id, action, {
            terminal_id: terminalId,
          });
      });
  }

  // Device and connector routes live in `@velocelab/connector`, which owns the
  // credential storage and the MCP process control around them. Keeping copies
  // here would silently shadow one of the two implementations: the router keys
  // its table by path, so the later registration wins the method.

  ctx
    .route("/api/user/advanced-chat/agents")
    .methods("GET")
    .action(async (session) => {
      const current = await user(session);
      if (current?.id !== undefined)
        session.respond(
          (await service.listAgents(current.id)).map(agent),
          "json",
        );
    });
  ctx
    .route("/api/user/advanced-chat/agents")
    .methods("POST")
    .action(async (session) => {
      const current = await user(session);
      if (current?.id === undefined) return;
      const input = await body(session);
      const value = await service.createAgent(current.id, {
        name: String(input.name ?? ""),
        prompt: String(input.prompt ?? ""),
        defaultModel: String(input.default_model ?? ""),
        userChannelId: Number(input.user_channel_id ?? 0) || undefined,
        stream: input.stream === true,
        skillIds: list(input.skill_ids),
        mcpServerIds: list(input.mcp_server_ids),
      });
      session.status = 201;
      session.respond(agent(value), "json");
    });
  ctx
    .route("/api/user/advanced-chat/agents/generate")
    .methods("POST")
    .action(async (session) => {
      const current = await user(session);
      if (current?.id === undefined) return;
      const input = await body(session);
      const requirements = String(input.requirements ?? "").trim();
      const sourceId = String(input.source_agent_id ?? "");
      if (!requirements || requirements.length > 4000 || !sourceId) {
        session.status = 400;
        session.respond(
          { error: "Agent requirements and source agent are required" },
          "json",
        );
        return;
      }
      const source: any = await db.selectOne("advanced_chat_agents", {
        stable_id: sourceId,
        user_id: current.id,
      });
      if (!source || !source.default_model) {
        session.status = 400;
        session.respond(
          { error: "Selected agent not found or has no default model" },
          "json",
        );
        return;
      }
      try {
        const result = await service.complete(current.id, {
          model: source.default_model,
          userChannelId: source.user_channel_id || undefined,
          stream: false,
          messages: [
            {
              role: "user",
              content: JSON.stringify({
                source_agent: {
                  name: source.name,
                  prompt: source.prompt,
                  default_model: source.default_model,
                },
                requirements,
              }),
            },
          ],
        });
        let generated: any = {};
        try {
          generated = JSON.parse(
            result.message.content
              .replace(/^```json\s*/i, "")
              .replace(/```$/i, "")
              .trim(),
          );
        } catch {}
        const name = String(generated.name ?? `${source.name} Agent`).slice(
          0,
          100,
        );
        const value = await service.createAgent(current.id, {
          name,
          prompt: String(generated.prompt ?? requirements).slice(0, 20000),
          defaultModel: source.default_model,
          userChannelId: source.user_channel_id || undefined,
          stream: source.stream === true,
          skillIds: JSON.parse(source.skill_ids || "[]"),
          mcpServerIds: JSON.parse(source.mcp_server_ids || "[]"),
        });
        session.respond(agent(value), "json");
      } catch (error) {
        session.status = 502;
        session.respond(
          { error: error instanceof Error ? error.message : String(error) },
          "json",
        );
      }
    });
  ctx
    .route("/api/user/advanced-chat/agents/:id")
    .methods("DELETE")
    .action(async (session, _params, id) => {
      const current = await user(session);
      if (current?.id !== undefined) {
        await service.deleteAgent(current.id, id);
        session.respond({ success: true }, "json");
      }
    });
  ctx
    .route("/api/user/advanced-chat/agents/:id")
    .methods("PUT")
    .action(async (session, _params, id) => {
      const current = await user(session);
      if (current?.id === undefined) return;
      const input = await body(session);
      const value = await service.updateAgent(current.id, id, {
        name: String(input.name ?? ""),
        prompt: String(input.prompt ?? ""),
        defaultModel: String(input.default_model ?? ""),
        userChannelId: Number(input.user_channel_id ?? 0) || undefined,
        stream: input.stream === true,
        skillIds: list(input.skill_ids),
        mcpServerIds: list(input.mcp_server_ids),
      });
      if (!value) {
        session.status = 404;
        session.respond({ error: "Agent not found" }, "json");
        return;
      }
      session.respond(agent(value), "json");
    });
  ctx
    .route("/api/user/advanced-chat/sessions")
    .methods("GET")
    .action(async (session) => {
      const current = await user(session);
      if (current?.id !== undefined)
        session.respond(await service.listSessions(current.id), "json");
    });
  ctx
    .route("/api/user/advanced-chat/sessions")
    .methods("POST")
    .action(async (session) => {
      const current = await user(session);
      if (current?.id === undefined) return;
      const input = await body(session);
      const value = await service.createSession(current.id, {
        agentId:
          typeof input.agent_id === "string" ? input.agent_id : undefined,
        title: typeof input.title === "string" ? input.title : undefined,
        modelName:
          typeof input.model_name === "string" ? input.model_name : undefined,
        userChannelId: Number(input.user_channel_id ?? 0) || undefined,
      });
      session.status = 201;
      session.respond(value, "json");
    });
  // Declared before /sessions/:id on purpose: the router answers with the first
  // matching pattern in declaration order, so a parameterised route declared
  // earlier would swallow the literal "folders" segment.
  ctx
    .route("/api/user/advanced-chat/sessions/folders")
    .methods("GET")
    .action(async (session) => {
      const current = await user(session);
      if (current?.id !== undefined)
        session.respond(await service.listSessionFolders(current.id), "json");
    });
  ctx
    .route("/api/user/advanced-chat/sessions/folders")
    .methods("POST")
    .action(async (session) => {
      const current = await user(session);
      if (current?.id === undefined) return;
      session.status = 201;
      session.respond(
        await service.createSessionFolder(
          current.id,
          String((await body(session)).name ?? ""),
        ),
        "json",
      );
    });
  ctx
    .route("/api/user/advanced-chat/sessions/:id")
    .methods("GET")
    .action(async (session, _params, id) => {
      const current = await user(session);
      if (current?.id === undefined) return;
      const value = await service.getSession(current.id, id);
      if (!value) {
        session.status = 404;
        session.respond({ error: "Session not found" }, "json");
      } else session.respond(value, "json");
    });
  ctx
    .route("/api/user/advanced-chat/sessions/:id")
    .methods("DELETE")
    .action(async (session, _params, id) => {
      const current = await user(session);
      if (current?.id !== undefined)
        session.respond(
          { success: await service.deleteSession(current.id, id) },
          "json",
        );
    });
  ctx
    .route("/api/user/advanced-chat/sessions/:id")
    .methods("PUT")
    .action(async (session, _params, id) => {
      const current = await user(session);
      if (current?.id === undefined) return;
      const input = await body(session);
      session.respond(
        await service.updateSession(current.id, id, {
          title: typeof input.title === "string" ? input.title : undefined,
          modelName:
            typeof input.model_name === "string" ? input.model_name : undefined,
          agentId:
            typeof input.agent_id === "string" ? input.agent_id : undefined,
        }),
        "json",
      );
    });
  ctx
    .route("/api/user/advanced-chat/sessions/:id/folder")
    .methods("PUT")
    .action(async (session, _params, id) => {
      const current = await user(session);
      if (current?.id !== undefined)
        session.respond(
          await service.updateSession(current.id, id, {
            folderId: String((await body(session)).folder_id ?? ""),
          }),
          "json",
        );
    });
  ctx
    .route("/api/user/advanced-chat/sessions/:id/title/regenerate")
    .methods("POST")
    .action(async (request, _params, id) => {
      const current = await user(request);
      if (current?.id === undefined) return;
      const currentSession = await service.getSession(current.id, id);
      if (!currentSession) {
        request.status = 404;
        request.respond({ error: "Session not found" }, "json");
        return;
      }
      const messages = Array.isArray((currentSession as any).messages)
        ? (currentSession as any).messages.slice(-8)
        : [];
      let title = "New conversation";
      try {
        const result = await service.complete(current.id, {
          sessionId: id,
          model: String((currentSession as any).model_name ?? ""),
          messages: [
            {
              role: "user",
              content: `Create a concise title of at most 60 characters for this conversation. Return title only.\n${messages.map((item: any) => `${item.role}: ${item.content}`).join("\n")}`,
            },
          ],
          stream: false,
        });
        title =
          result.message.content
            .trim()
            .replace(/^['"`]+|['"`]+$/g, "")
            .slice(0, 60) || title;
      } catch {}
      const value = await service.updateSession(current.id, id, { title });
      if (!value) {
        request.status = 404;
        request.respond({ error: "Session not found" }, "json");
        return;
      }
      request.respond(value, "json");
    });
  ctx
    .route("/api/user/advanced-chat/sessions/:id/tasks")
    .methods("GET")
    .action(async (session, _params, id) => {
      const current = await user(session);
      if (current?.id !== undefined)
        session.respond(await service.listSessionTasks(current.id, id), "json");
    });
  ctx
    .route("/api/user/advanced-chat/sessions/:id/tasks")
    .methods("POST")
    .action(async (session, _params, sessionId) => {
      const current = await user(session);
      if (current?.id === undefined) return;
      const owned = await service.getSession(current.id, sessionId);
      if (!owned) {
        session.status = 404;
        session.respond({ error: "Session not found" }, "json");
        return;
      }
      const input = await body(session);
      const existing = await db.select("advanced_chat_session_tasks", {
        user_id: current.id,
        session_id: sessionId,
      });
      const now = new Date().toISOString();
      const row = await db.create("advanced_chat_session_tasks", {
        id: `task-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        user_id: current.id,
        session_id: sessionId,
        position: existing.length,
        title: String(input.title ?? "Task").slice(0, 200),
        description: String(input.description ?? ""),
        status: String(input.status ?? "pending"),
        note: String(input.note ?? ""),
        created_at: now,
        updated_at: now,
      } as any);
      session.status = 201;
      session.respond(row, "json");
    });
  ctx
    .route("/api/user/advanced-chat/sessions/:id/tasks/:task_id")
    .methods("PUT")
    .action(async (session, _params, sessionId, taskId) => {
      const current = await user(session);
      if (current?.id === undefined) return;
      const task = await db.selectOne("advanced_chat_session_tasks", {
        id: taskId,
        session_id: sessionId,
        user_id: current.id,
      });
      if (!task) {
        session.status = 404;
        session.respond({ error: "Task not found" }, "json");
        return;
      }
      const input = await body(session);
      await db.update(
        "advanced_chat_session_tasks",
        { id: taskId, user_id: current.id },
        {
          ...(input.title !== undefined
            ? { title: String(input.title).slice(0, 200) }
            : {}),
          ...(input.description !== undefined
            ? { description: String(input.description) }
            : {}),
          ...(input.status !== undefined
            ? { status: String(input.status) }
            : {}),
          ...(input.note !== undefined ? { note: String(input.note) } : {}),
          updated_at: new Date().toISOString(),
        },
      );
      session.respond(
        await db.selectOne("advanced_chat_session_tasks", {
          id: taskId,
          user_id: current.id,
        }),
        "json",
      );
    });
  ctx
    .route("/api/user/advanced-chat/sessions/:id/tasks/:task_id")
    .methods("DELETE")
    .action(async (session, _params, sessionId, taskId) => {
      const current = await user(session);
      if (current?.id !== undefined) {
        await db.remove("advanced_chat_session_tasks", {
          id: taskId,
          session_id: sessionId,
          user_id: current.id,
        });
        session.respond({ success: true }, "json");
      }
    });
  ctx
    .route("/api/user/advanced-chat/settings")
    .methods("GET")
    .action(async (session) => {
      const current = await user(session);
      if (current?.id !== undefined)
        session.respond(await service.getUserSettings(current.id), "json");
    });
  ctx
    .route("/api/user/advanced-chat/settings")
    .methods("PUT")
    .action(async (session) => {
      const current = await user(session);
      if (current?.id !== undefined)
        session.respond(
          await service.updateUserSettings(current.id, await body(session)),
          "json",
        );
    });
  ctx
    .route("/api/user/advanced-chat/completions")
    .methods("POST")
    .action(async (session) => {
      const current = await user(session);
      if (current?.id === undefined) return;
      const input = await body(session);
      const messages = Array.isArray(input.messages)
        ? input.messages.map((item: any) => ({
            role: String(item.role ?? "user"),
            content: String(item.content ?? ""),
            tool_calls: item.tool_calls,
            tool_call_id: item.tool_call_id,
          }))
        : [];
      const list = (value: unknown) =>
        Array.isArray(value) ? value.map(String) : undefined;
      const payload = {
        sessionId:
          typeof input.session_id === "string" ? input.session_id : undefined,
        title: typeof input.title === "string" ? input.title : undefined,
        model: String(input.model ?? ""),
        messages,
        userChannelId: Number(input.channel_id ?? 0) || undefined,
        stream: input.stream === true,
        maxTokens: Number(input.max_tokens ?? 0) || undefined,
        temperature:
          typeof input.temperature === "number" ? input.temperature : undefined,
        reasoningEffort:
          typeof input.reasoning_effort === "string"
            ? input.reasoning_effort
            : undefined,
        // Every one of these selects something the run uses: dropping any of
        // them silently turned the request into a plain chat with no agent,
        // skills, knowledge or tools.
        mode: typeof input.mode === "string" ? input.mode : undefined,
        agentId: typeof input.agent_id === "string" ? input.agent_id : undefined,
        agentGroupId:
          typeof input.agent_group_id === "string"
            ? input.agent_group_id
            : undefined,
        skillIds: list(input.skill_ids),
        mcpServerIds: list(input.mcp_server_ids),
        knowledgeBaseIds: list(input.knowledge_base_ids),
        connectorDeviceId:
          typeof input.connector_device_id === "string"
            ? input.connector_device_id
            : undefined,
        connectorWorkspacePath:
          typeof input.connector_workspace_path === "string"
            ? input.connector_workspace_path
            : undefined,
        connectorAutoApprove: input.connector_auto_approve === true,
        connectorApprovalMode:
          typeof input.connector_approval_mode === "string"
            ? input.connector_approval_mode
            : undefined,
        connectorCommandPrefixes: list(input.connector_command_prefixes),
        autoCompressContext: input.auto_compress_context !== false,
        disabledToolGroups: list(input.disabled_tool_groups),
      };
      if (!payload.stream) {
        session.respond(await service.complete(current.id, payload), "json");
        return;
      }
      // The client asked for `text/event-stream`, so this route writes the
      // response itself. Answering with JSON here is what made the UI's reader
      // see a body it could not parse.
      const stream = openChatStream(session);
      if (!stream) {
        session.status = 500;
        session.respond({ error: "Streaming is unavailable" }, "json");
        return;
      }
      try {
        await service.complete(current.id, payload, {
          signal: stream.signal,
          onEvent: (event) => stream.send(event),
        });
      } catch (error) {
        stream.send({
          type: "error",
          payload: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
      } finally {
        stream.close();
      }
    });
  ctx
    .route("/api/user/advanced-chat/runs/:id")
    .methods("GET")
    .action(async (session, _params, id) => {
      const current = await user(session);
      if (current?.id !== undefined)
        session.respond(
          (await service.getRun(current.id, id)) ?? { error: "Run not found" },
          "json",
        );
    });
  ctx
    .route("/api/user/advanced-chat/runs/:id/stop")
    .methods("POST")
    .action(async (session, _params, id) => {
      const current = await user(session);
      if (current?.id !== undefined)
        session.respond(
          (await service.stopRun(current.id, id)) ?? { error: "Run not found" },
          "json",
        );
    });
  ctx
    .route("/api/user/advanced-chat/runs/:id/events")
    .methods("GET")
    .action(async (session, params, id) => {
      const current = await user(session);
      if (current?.id !== undefined)
        session.respond(
          await service.listRunEvents(
            current.id,
            id,
            Number(params.get("after") ?? 0) || 0,
          ),
          "json",
        );
    });
  ctx
    .route("/api/user/advanced-chat/runs/:id/agent-work")
    .methods("GET")
    .action(async (session, _params, id) => {
      const current = await user(session);
      if (current?.id === undefined) return;
      const run = await db.selectOne("advanced_chat_runs", {
        id,
        user_id: current.id,
      });
      if (!run) {
        session.status = 404;
        session.respond({ error: "Run not found" }, "json");
        return;
      }
      const chatSession = await db.selectOne("advanced_chat_sessions", {
        id: run.session_id,
        user_id: current.id,
      });
      const groupId = String(chatSession?.agent_group_id ?? "");
      const group = groupId
        ? await db.selectOne("advanced_chat_chat_groups", {
            id: groupId,
            user_id: current.id,
          })
        : undefined;
      const groupName = String(group?.name ?? "");
      const members = groupId
        ? await db.select("advanced_chat_chat_group_members", {
            group_id: groupId,
            user_id: current.id,
          })
        : [];
      const agents = new Map<
        string,
        {
          agent_id: string;
          agent_name: string;
          agent_type: string;
          group_id: string;
          group_name: string;
          status: string;
          working: boolean;
          updated_at?: string;
          messages: Array<Record<string, unknown>>;
        }
      >();
      for (const member of members as any[]) {
        const agentId = String(member.agent_id ?? "");
        if (!agentId) continue;
        agents.set(agentId, {
          agent_id: agentId,
          agent_name: String(member.agent_name ?? agentId),
          agent_type: String(member.agent_type ?? "worker"),
          group_id: groupId,
          group_name: groupName,
          status: String(member.status ?? "idle") || "idle",
          working: false,
          messages: [],
        });
      }
      // Sub-agent progress arrives as `agent_task` events — the same convention
      // the Agent Studio tools write — so the panel reflects real work.
      const events = await db.select("advanced_chat_run_events", {
        run_id: id,
        user_id: current.id,
      });
      for (const row of (events as any[])
        .filter((item) => String(item.event ?? "") === "agent_task")
        .sort((a, b) => Number(a.seq ?? 0) - Number(b.seq ?? 0))) {
        let payload: any = {};
        try {
          payload = JSON.parse(String(row.payload ?? "{}"));
        } catch {
          payload = {};
        }
        const agentId = String(payload.agent_id ?? payload.task_id ?? "");
        if (!agentId) continue;
        const status = String(payload.status ?? "");
        const existing = agents.get(agentId) ?? {
          agent_id: agentId,
          agent_name: String(payload.agent_name ?? agentId),
          agent_type: String(payload.agent_type ?? "worker"),
          group_id: groupId,
          group_name: groupName,
          status: "idle",
          working: false,
          messages: [],
        };
        if (status) existing.status = status;
        existing.working = ["running", "approval_required", "queued"].includes(
          existing.status,
        );
        existing.updated_at = String(row.created_at ?? existing.updated_at ?? "");
        const content = String(payload.message ?? payload.content ?? "");
        if (content.trim())
          existing.messages.push({
            role: String(payload.role ?? "assistant"),
            content: content.slice(0, 2000),
            status: existing.status,
            tool: payload.tool ? String(payload.tool) : undefined,
            created_at: String(row.created_at ?? ""),
          });
        agents.set(agentId, existing);
      }
      const list = [...agents.values()];
      // Without a studio group the run still belongs to one agent; reporting it
      // keeps the panel useful instead of showing nothing at all.
      if (!list.length) {
        const agentName = String(chatSession?.agent_id ?? "") || "assistant";
        list.push({
          agent_id: agentName,
          agent_name: agentName,
          agent_type: "primary",
          group_id: groupId,
          group_name: groupName,
          status: String(run.status ?? "idle") || "idle",
          working: ["queued", "running"].includes(String(run.status ?? "")),
          updated_at: String(run.updated_at ?? ""),
          messages: [],
        });
      }
      const messages = await db.select("advanced_chat_messages", {
        session_id: run.session_id,
        user_id: current.id,
      });
      const primary = list[0];
      primary.messages = (messages as any[])
        .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
        .filter((message) => String(message.content ?? "").trim())
        .map((message) => ({
          role: String(message.role ?? ""),
          content: String(message.content ?? "").slice(0, 2000),
          created_at: String(message.created_at ?? ""),
        }));
      // The run's own tool rounds are progress too, and they are what the panel
      // has to show when no sub-agent has reported anything.
      for (const row of (events as any[])
        .filter((item) => String(item.event ?? "") === "tool_round")
        .sort((a, b) => Number(a.seq ?? 0) - Number(b.seq ?? 0))) {
        let payload: any = {};
        try {
          payload = JSON.parse(String(row.payload ?? "{}"));
        } catch {
          payload = {};
        }
        const calls = Array.isArray(payload.tool_calls) ? payload.tool_calls : [];
        for (const call of calls) {
          const name = String(call?.name ?? "");
          if (!name) continue;
          primary.messages.push({
            role: "tool",
            content: String(
              call?.result ?? JSON.stringify({ error: call?.error ?? "" }),
            ).slice(0, 2000),
            status: String(call?.status ?? ""),
            tool: name,
            created_at: String(row.created_at ?? ""),
          });
        }
      }
      const tasks = await db.select("advanced_chat_connector_tasks", {
        run_id: id,
        user_id: current.id,
      });
      session.respond(
        {
          run_id: String(run.id),
          session_id: String(run.session_id),
          group_id: groupId,
          group_name: groupName,
          agents: list,
          connector_tasks: (tasks as any[]).map((task) => {
            let payload: unknown = {};
            try {
              payload = JSON.parse(String(task.payload ?? "{}"));
            } catch {
              payload = {};
            }
            return {
              id: String(task.id),
              device_id: String(task.device_id ?? ""),
              action: String(task.action ?? ""),
              status: String(task.status ?? "queued"),
              workspace_path: String(task.workspace_path ?? ""),
              payload,
              result: String(task.result ?? ""),
              error_message: String(task.error_message ?? ""),
              created_at: String(task.created_at ?? ""),
              updated_at: String(task.updated_at ?? ""),
              started_at: task.started_at ?? undefined,
              finished_at: task.finished_at ?? undefined,
            };
          }),
        },
        "json",
      );
    });
  ctx
    .route("/api/user/advanced-chat/agent-tasks")
    .methods("GET")
    .action(async (session) => {
      const current = await user(session);
      if (current?.id === undefined) return;
      const runs: any[] = await db.select("advanced_chat_runs", {
        user_id: current.id,
      });
      const active = runs
        .filter((run) => ["queued", "running"].includes(String(run.status)))
        .sort((left, right) =>
          String(right.updated_at).localeCompare(String(left.updated_at)),
        )
        .slice(0, 50);
      const result = await Promise.all(
        active.map(async (run) => ({
          run_id: run.id,
          session_id: run.session_id,
          status: run.status,
          status_message: run.status_message,
          started_at: run.started_at,
          events: (
            await db.select("advanced_chat_run_events", {
              run_id: run.id,
              user_id: current.id,
            })
          )
            .filter((event: any) => event.event === "agent_task")
            .slice(-100),
        })),
      );
      session.respond(result, "json");
    });
  ctx
    .route("/api/user/advanced-chat/runs/:id/connector-tasks/pending")
    .methods("GET")
    .action(async (session, _params, id) => {
      const current = await user(session);
      if (current?.id !== undefined)
        session.respond(
          await service.listPendingConnectorTasks(current.id, id),
          "json",
        );
    });
  const groupFor = async (uid: number, id: string) =>
    db.selectOne("advanced_chat_chat_groups", { id, user_id: uid });
  const hydrateGroup = async (uid: number, id: string) => {
    const group = await groupFor(uid, id);
    if (!group) return undefined;
    const [members, messages] = await Promise.all([
      db.select("advanced_chat_chat_group_members", {
        group_id: id,
        user_id: uid,
      }),
      db.select("advanced_chat_chat_group_messages", {
        group_id: id,
        user_id: uid,
      }),
    ]);
    return {
      ...group,
      members,
      messages: messages
        .sort((a: any, b: any) =>
          String(a.created_at).localeCompare(String(b.created_at)),
        )
        .slice(-200),
    };
  };
  ctx
    .route("/api/user/advanced-chat/chat-groups")
    .methods("GET")
    .action(async (s) => {
      const u = await user(s);
      if (u?.id !== undefined) {
        const groups = await db.select("advanced_chat_chat_groups", {
          user_id: u.id,
        });
        s.respond(
          await Promise.all(
            groups.map((g) => hydrateGroup(u.id!, String(g.id))),
          ),
          "json",
        );
      }
    });
  ctx
    .route("/api/user/advanced-chat/chat-groups")
    .methods("POST")
    .action(async (s) => {
      const u = await user(s);
      if (u?.id === undefined) return;
      const input = await body(s);
      const now = new Date().toISOString();
      const id = randomUUID();
      const group = await db.create("advanced_chat_chat_groups", {
        id,
        user_id: u.id,
        name: String(input.name ?? "")
          .trim()
          .slice(0, 120),
        description: String(input.description ?? "").slice(0, 2000),
        connector_device_id: String(input.connector_device_id ?? ""),
        connector_workspace_path: String(input.connector_workspace_path ?? ""),
        created_at: now,
        updated_at: now,
      });
      const ids = Array.isArray(input.agent_ids)
        ? input.agent_ids.map(String)
        : [];
      for (const agentId of ids) {
        const agent = await db.selectOne("advanced_chat_agents", {
          stable_id: agentId,
          user_id: u.id,
        });
        if (!agent) continue;
        await db.create("advanced_chat_chat_group_members", {
          id: randomUUID(),
          group_id: id,
          user_id: u.id,
          agent_id: agentId,
          agent_name: agent.name,
          model_name: agent.default_model,
          user_channel_id: agent.user_channel_id || null,
          connector_device_id: String(input.connector_device_id ?? ""),
          session_id: "",
          run_id: "",
          status: "idle",
          work_depth: 0,
          created_at: now,
          updated_at: now,
        });
      }
      s.status = 201;
      s.respond(await hydrateGroup(u.id, String(group.id)), "json");
    });
  ctx
    .route("/api/user/advanced-chat/chat-groups/:id")
    .methods("GET")
    .action(async (s, _p, id) => {
      const u = await user(s);
      const value = u?.id !== undefined ? await hydrateGroup(u.id, id) : undefined;
      if (!value) {
        s.status = 404;
        s.respond({ error: "Chat group not found" }, "json");
      } else s.respond(value, "json");
    });
  ctx
    .route("/api/user/advanced-chat/chat-groups/:id")
    .methods("PUT")
    .action(async (s, _p, id) => {
      const u = await user(s);
      if (u?.id === undefined) return;
      if (!(await groupFor(u.id, id))) {
        s.status = 404;
        s.respond({ error: "Chat group not found" }, "json");
        return;
      }
      const input = await body(s);
      const now = new Date().toISOString();
      await db.update(
        "advanced_chat_chat_groups",
        { id, user_id: u.id },
        {
          name: String(input.name ?? "")
            .trim()
            .slice(0, 120),
          description: String(input.description ?? "").slice(0, 2000),
          connector_device_id: String(input.connector_device_id ?? ""),
          connector_workspace_path: String(
            input.connector_workspace_path ?? "",
          ),
          updated_at: now,
        },
      );
      if (Array.isArray(input.agent_ids)) {
        await db.remove("advanced_chat_chat_group_members", {
          group_id: id,
          user_id: u.id,
        });
        for (const agentId of input.agent_ids.map(String)) {
          const agent = await db.selectOne("advanced_chat_agents", {
            stable_id: agentId,
            user_id: u.id,
          });
          if (agent)
            await db.create("advanced_chat_chat_group_members", {
              id: randomUUID(),
              group_id: id,
              user_id: u.id,
              agent_id: agentId,
              agent_name: agent.name,
              model_name: agent.default_model,
              user_channel_id: agent.user_channel_id || null,
              connector_device_id: String(input.connector_device_id ?? ""),
              session_id: "",
              run_id: "",
              status: "idle",
              work_depth: 0,
              created_at: now,
              updated_at: now,
            });
        }
      }
      s.respond(await hydrateGroup(u.id, id), "json");
    });
  ctx
    .route("/api/user/advanced-chat/chat-groups/:id")
    .methods("DELETE")
    .action(async (s, _p, id) => {
      const u = await user(s);
      if (u?.id === undefined) return;
      if (!(await groupFor(u.id, id))) {
        s.status = 404;
        s.respond({ error: "Chat group not found" }, "json");
        return;
      }
      await db.remove("advanced_chat_chat_group_messages", {
        group_id: id,
        user_id: u.id,
      });
      await db.remove("advanced_chat_chat_group_members", {
        group_id: id,
        user_id: u.id,
      });
      await db.remove("advanced_chat_private_conversations", {
        group_id: id,
        user_id: u.id,
      });
      await db.remove("advanced_chat_chat_groups", { id, user_id: u.id });
      s.respond({ success: true }, "json");
    });
  ctx
    .route("/api/user/advanced-chat/chat-groups/:id/messages")
    .methods("POST")
    .action(async (s, _p, id) => {
      const u = await user(s);
      if (u?.id === undefined || !(await groupFor(u.id, id))) {
        s.status = 404;
        s.respond({ error: "Chat group not found" }, "json");
        return;
      }
      const input = await body(s);
      const message = await db.create("advanced_chat_chat_group_messages", {
        id: randomUUID(),
        group_id: id,
        user_id: u.id,
        sender_type: "user",
        sender_id: String(u.id),
        sender_name: "User",
        content: String(input.content ?? "").slice(0, 10000),
        mention_member_ids: JSON.stringify(
          Array.isArray(input.mention_member_ids)
            ? input.mention_member_ids
            : [],
        ),
        depth: 0,
        source_run_id: "",
        created_at: new Date().toISOString(),
      });
      s.status = 201;
      s.respond(message, "json");
      void (async () => {
        const members: any[] = await db.select(
          "advanced_chat_chat_group_members",
          { group_id: id, user_id: u.id },
        );
        const mentions = Array.isArray(input.mention_member_ids)
          ? input.mention_member_ids.map(String)
          : [];
        for (const member of members) {
          if (mentions.length && !mentions.includes(String(member.id)))
            continue;
          await db.update(
            "advanced_chat_chat_group_members",
            { id: member.id, user_id: u.id },
            { status: "working", updated_at: new Date().toISOString() },
          );
          try {
            const result = await service.complete(u.id!, {
              model: String(member.model_name ?? ""),
              messages: [
                {
                  role: "user",
                  content: `You are ${member.agent_name}. Respond to this group message concisely: ${message.content}`,
                },
              ],
              userChannelId: Number(member.user_channel_id ?? 0) || undefined,
              stream: false,
            });
            await db.create("advanced_chat_chat_group_messages", {
              id: randomUUID(),
              group_id: id,
              user_id: u.id,
              sender_type: "agent",
              sender_id: String(member.id),
              sender_name: String(member.agent_name),
              content: result.message.content,
              mention_member_ids: "[]",
              depth: 1,
              source_run_id: result.runId,
              created_at: new Date().toISOString(),
            } as any);
            await db.update(
              "advanced_chat_chat_group_members",
              { id: member.id, user_id: u.id },
              {
                status: "idle",
                run_id: result.runId,
                updated_at: new Date().toISOString(),
              },
            );
          } catch (error) {
            await db.update(
              "advanced_chat_chat_group_members",
              { id: member.id, user_id: u.id },
              { status: "error", updated_at: new Date().toISOString() },
            );
          }
        }
      })();
    });
  ctx
    .route("/api/user/advanced-chat/chat-groups/:id/private-conversations")
    .methods("GET")
    .action(async (s, _p, id) => {
      const u = await user(s);
      if (u?.id !== undefined && (await groupFor(u.id, id)))
        s.respond(
          await db.select("advanced_chat_private_conversations", {
            group_id: id,
            user_id: u.id,
          }),
          "json",
        );
    });
  ctx
    .route(
      "/api/user/advanced-chat/chat-groups/:id/private-conversations/:conversation_id",
    )
    .methods("GET")
    .action(async (s, _p, id, conversationId) => {
      const u = await user(s);
      if (u?.id === undefined) return;
      const conversation = await db.selectOne(
        "advanced_chat_private_conversations",
        { id: conversationId, group_id: id, user_id: u.id },
      );
      if (!conversation) {
        s.status = 404;
        s.respond({ error: "Conversation not found" }, "json");
        return;
      }
      const messages = await db.select("advanced_chat_private_messages", {
        conversation_id: conversationId,
        user_id: u.id,
      });
      ctx
        .route(
          "/api/user/advanced-chat/chat-groups/:id/private-conversations/:conversation_id/messages",
        )
        .methods("POST")
        .action(async (s, _p, groupId, conversationId) => {
          const u = await user(s);
          if (u?.id === undefined) return;
          const conversation: any = await db.selectOne(
            "advanced_chat_private_conversations",
            { id: conversationId, group_id: groupId, user_id: u.id },
          );
          if (!conversation) {
            s.status = 404;
            s.respond({ error: "Conversation not found" }, "json");
            return;
          }
          const input = await body(s);
          const row = await db.create("advanced_chat_private_messages", {
            id: randomUUID(),
            conversation_id: conversationId,
            group_id: groupId,
            user_id: u.id,
            sender_member_id: conversation.member_a_id,
            sender_name: conversation.member_a_name,
            recipient_member_id: conversation.member_b_id,
            content: String(input.content ?? "").slice(0, 10000),
            source_run_id: "",
            delivered_at: null,
            created_at: new Date().toISOString(),
          } as any);
          await db.update(
            "advanced_chat_private_conversations",
            { id: conversationId, user_id: u.id },
            {
              last_message_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          );
          s.status = 201;
          s.respond(row, "json");
        });
      s.respond({ ...conversation, messages }, "json");
    });
  ctx
    .route(
      "/api/user/advanced-chat/chat-groups/:id/members/:member_id/activity",
    )
    .methods("GET")
    .action(async (s, _p, id, memberId) => {
      const u = await user(s);
      if (u?.id === undefined) return;
      const member = await db.selectOne("advanced_chat_chat_group_members", {
        id: memberId,
        group_id: id,
        user_id: u.id,
      });
      if (!member) {
        s.status = 404;
        s.respond({ error: "Member not found" }, "json");
        return;
      }
      const events = member.run_id
        ? await db.select("advanced_chat_run_events", {
            run_id: member.run_id,
            user_id: u.id,
          })
        : [];
      s.respond({ member, events }, "json");
    });
}
