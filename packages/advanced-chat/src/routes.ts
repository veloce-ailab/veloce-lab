import { Context, Session } from "yumeri";
import { randomUUID } from "node:crypto";
import type { AdvancedChatService } from "./index.js";

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
  const token = (session: Session) => {
    const headers = session.client.req?.headers ?? {};
    const value = headers["x-connector-token"] ?? headers.authorization ?? "";
    const raw = Array.isArray(value) ? value[0] : value;
    return typeof raw === "string" ? raw.replace(/^bearer\s+/i, "").trim() : "";
  };
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
      await new Promise((resolve) => setTimeout(resolve, 150));
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
    if (!current?.id || !deviceId) return undefined;
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

  ctx
    .route("/api/user/advanced-chat/devices")
    .methods("GET")
    .action(async (session) => {
      const current = await user(session);
      if (!current?.id) return;
      session.respond(
        (await service.listConnectors(current.id)).map(
          ({ token_hash: _hash, ...item }) => item,
        ),
        "json",
      );
    });
  ctx
    .route("/api/user/advanced-chat/devices/token")
    .methods("POST")
    .action(async (session) => {
      const current = await user(session);
      if (!current?.id) return;
      const input = await body(session);
      const created = await service.createConnector(
        current.id,
        String(input.name ?? ""),
        String(input.remark ?? ""),
      );
      const { token_hash: _hash, ...device } = created.device;
      session.respond({ ...device, token: created.token }, "json");
    });
  ctx
    .route("/api/user/advanced-chat/agents")
    .methods("GET")
    .action(async (session) => {
      const current = await user(session);
      if (current?.id)
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
      if (!current?.id) return;
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
      if (!current?.id) return;
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
      if (current?.id) {
        await service.deleteAgent(current.id, id);
        session.respond({ success: true }, "json");
      }
    });
  ctx
    .route("/api/user/advanced-chat/agents/:id")
    .methods("PUT")
    .action(async (session, _params, id) => {
      const current = await user(session);
      if (!current?.id) return;
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
      if (current?.id)
        session.respond(await service.listSessions(current.id), "json");
    });
  ctx
    .route("/api/user/advanced-chat/sessions")
    .methods("POST")
    .action(async (session) => {
      const current = await user(session);
      if (!current?.id) return;
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
  ctx
    .route("/api/user/advanced-chat/sessions/:id")
    .methods("GET")
    .action(async (session, _params, id) => {
      const current = await user(session);
      if (!current?.id) return;
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
      if (current?.id)
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
      if (!current?.id) return;
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
      if (current?.id)
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
      if (!current?.id) return;
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
      if (current?.id)
        session.respond(await service.listSessionTasks(current.id, id), "json");
    });
  ctx
    .route("/api/user/advanced-chat/sessions/:id/tasks")
    .methods("POST")
    .action(async (session, _params, sessionId) => {
      const current = await user(session);
      if (!current?.id) return;
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
      if (!current?.id) return;
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
      if (current?.id) {
        await db.remove("advanced_chat_session_tasks", {
          id: taskId,
          session_id: sessionId,
          user_id: current.id,
        });
        session.respond({ success: true }, "json");
      }
    });
  ctx
    .route("/api/user/advanced-chat/sessions/folders")
    .methods("GET")
    .action(async (session) => {
      const current = await user(session);
      if (current?.id)
        session.respond(await service.listSessionFolders(current.id), "json");
    });
  ctx
    .route("/api/user/advanced-chat/sessions/folders")
    .methods("POST")
    .action(async (session) => {
      const current = await user(session);
      if (!current?.id) return;
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
    .route("/api/user/advanced-chat/settings")
    .methods("GET")
    .action(async (session) => {
      const current = await user(session);
      if (current?.id)
        session.respond(await service.getUserSettings(current.id), "json");
    });
  ctx
    .route("/api/user/advanced-chat/settings")
    .methods("PUT")
    .action(async (session) => {
      const current = await user(session);
      if (current?.id)
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
      if (!current?.id) return;
      const input = await body(session);
      const messages = Array.isArray(input.messages)
        ? input.messages.map((item: any) => ({
            role: String(item.role ?? "user"),
            content: String(item.content ?? ""),
            tool_calls: item.tool_calls,
            tool_call_id: item.tool_call_id,
          }))
        : [];
      session.respond(
        await service.complete(current.id, {
          sessionId:
            typeof input.session_id === "string" ? input.session_id : undefined,
          model: String(input.model ?? ""),
          messages,
          userChannelId: Number(input.channel_id ?? 0) || undefined,
          stream: input.stream === true,
          maxTokens: Number(input.max_tokens ?? 0) || undefined,
          temperature:
            typeof input.temperature === "number"
              ? input.temperature
              : undefined,
          reasoningEffort:
            typeof input.reasoning_effort === "string"
              ? input.reasoning_effort
              : undefined,
        }),
        "json",
      );
    });
  ctx
    .route("/api/user/advanced-chat/runs/:id")
    .methods("GET")
    .action(async (session, _params, id) => {
      const current = await user(session);
      if (current?.id)
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
      if (current?.id)
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
      if (current?.id)
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
      if (!current?.id) return;
      const events = await db.select("advanced_chat_run_events", {
        run_id: id,
        user_id: current.id,
      });
      session.respond(
        events.filter(
          (event: any) =>
            String(event.event_type ?? "").includes("agent") ||
            String(event.type ?? "").includes("agent"),
        ),
        "json",
      );
    });
  ctx
    .route("/api/user/advanced-chat/agent-tasks")
    .methods("GET")
    .action(async (session) => {
      const current = await user(session);
      if (!current?.id) return;
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
      if (current?.id)
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
      if (u?.id) {
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
      if (!u?.id) return;
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
      const value = u?.id ? await hydrateGroup(u.id, id) : undefined;
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
      if (!u?.id) return;
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
      if (!u?.id) return;
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
      if (!u?.id || !(await groupFor(u.id, id))) {
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
      if (u?.id && (await groupFor(u.id, id)))
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
      if (!u?.id) return;
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
          if (!u?.id) return;
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
      if (!u?.id) return;
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
  ctx
    .route("/api/advanced-chat/connectors/register")
    .methods("POST")
    .action(async (session) => {
      const input = await body(session);
      const value = await service.heartbeatConnector(
        token(session),
        input as any,
      );
      if (!value) {
        session.status = 401;
        session.respond({ error: "Invalid connector token" }, "json");
      } else {
        const { token_hash: _hash, ...device } = value;
        session.respond(device, "json");
      }
    });
  ctx
    .route("/api/advanced-chat/connectors/heartbeat")
    .methods("POST")
    .action(async (session) => {
      const value = await service.heartbeatConnector(
        token(session),
        (await body(session)) as any,
      );
      if (!value) session.status = 401;
      session.respond(
        value
          ? { ok: true, device_id: value.id }
          : { error: "Invalid connector token" },
        "json",
      );
    });
  ctx
    .route("/api/advanced-chat/connectors/tasks/next")
    .methods("GET")
    .action(async (session) => {
      const value = await service.nextConnectorTask(token(session));
      session.respond({ task: value ?? null }, "json");
    });
  ctx
    .route("/api/advanced-chat/connectors/tasks/:id/result")
    .methods("POST")
    .action(async (session, _params, id) => {
      const input = await body(session);
      session.respond(
        {
          ok: true,
          ignored: !(await service.completeConnectorTask(
            token(session),
            id,
            input.success === true,
            String(input.result ?? ""),
            String(input.error_message ?? ""),
          )),
        },
        "json",
      );
    });
}
