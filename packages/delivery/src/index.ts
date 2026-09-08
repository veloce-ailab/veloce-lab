import { randomUUID } from "node:crypto";
import { Context, Database, Session } from "yumeri";
import "@velocelab/dashboard";
import "@velocelab/advanced-chat";
import "@velocelab/advanced-chat";
export const depend = ["dashboard", "database", "advanced-chat"];
export const provide = ["delivery"];
export function apply(ctx: Context) {
  ctx.component.dashboard.addEntry({
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("./frontend/delivery.js", import.meta.url).pathname,
    plugin: "delivery",
  });
  const db = ctx.component.database as Database;
  const chat = ctx.component["advanced-chat"];
  const user = (s: Session) => Number((s.properties.user as any)?.id ?? 0);
  const fields = (input: any, old: any = {}) => ({
    name: String(input.name ?? old.name ?? "Delivery")
      .trim()
      .slice(0, 120),
    description: String(input.description ?? old.description ?? "")
      .trim()
      .slice(0, 2000),
    method: String(input.method ?? old.method ?? "webhook")
      .trim()
      .toLowerCase(),
    webhook_url: String(input.webhook_url ?? old.webhook_url ?? "")
      .trim()
      .slice(0, 2000),
    webhook_headers: JSON.stringify(
      input.webhook_headers ??
        (old.webhook_headers ? JSON.parse(old.webhook_headers) : {}),
    ),
    email_to: String(input.email_to ?? old.email_to ?? ""),
    smtp_host: String(input.smtp_host ?? old.smtp_host ?? ""),
    smtp_port: String(input.smtp_port ?? old.smtp_port ?? ""),
    smtp_username: String(input.smtp_username ?? old.smtp_username ?? ""),
    smtp_password: String(input.smtp_password ?? old.smtp_password ?? ""),
    smtp_from: String(input.smtp_from ?? old.smtp_from ?? ""),
    enabled: input.enabled !== false,
  });
  const validate = (value: any) => {
    if (!value.name) throw Error("Delivery name is required");
    if (!["webhook", "email"].includes(value.method))
      throw Error("Delivery method is invalid");
    if (value.method === "webhook") {
      let url: URL;
      try {
        url = new URL(value.webhook_url);
      } catch {
        throw Error("Webhook URL is invalid");
      }
      if (
        !/^https?:$/.test(url.protocol) ||
        ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(url.hostname)
      )
        throw Error("Webhook URL is blocked");
      let headers: Record<string, string> = {};
      try {
        headers = JSON.parse(value.webhook_headers || "{}");
      } catch {
        throw Error("Webhook headers are invalid");
      }
      if (
        Object.keys(headers).length > 20 ||
        Object.entries(headers).some(
          ([key, header]) =>
            key.length > 100 ||
            String(header).length > 1000 ||
            /[\r\n:]/.test(key),
        )
      )
        throw Error("Webhook headers are invalid");
    }
    if (
      value.method === "email" &&
      (!String(value.email_to).includes("@") ||
        String(value.email_to).length > 320)
    )
      throw Error("Email recipient is invalid");
    return value;
  };
  chat.registerTool({
    name: "deliver_result",
    description: "Deliver a completed result through a configured webhook",
    parameters: {
      type: "object",
      properties: {
        delivery_id: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
      },
      required: ["delivery_id", "body"],
    },
    execute: async (input, context) => {
      const value = input as any;
      const delivery: any = await db.selectOne("advanced_chat_deliveries", {
        id: String(value.delivery_id),
        user_id: context.userId,
      });
      if (!delivery || delivery.enabled === false)
        throw Error("Delivery is not available");
      if (delivery.method !== "webhook" || !delivery.webhook_url)
        throw Error("Only configured webhook delivery is supported");
      let headers: Record<string, string> = {
        "content-type": "application/json",
      };
      try {
        headers = {
          ...headers,
          ...JSON.parse(String(delivery.webhook_headers ?? "{}")),
        };
      } catch {}
      const response = await fetch(String(delivery.webhook_url), {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: String(value.title ?? ""),
          body: String(value.body),
          delivery_id: delivery.id,
        }),
      });
      if (!response.ok) throw Error(`Delivery failed (${response.status})`);
      return { success: true, status: response.status };
    },
  });
  ctx
    .route("/api/user/advanced-chat/deliveries")
    .methods("GET")
    .action(async (s) => {
      const id = user(s);
      if (id)
        s.respond(
          await db.select("advanced_chat_deliveries", { user_id: id }),
          "json",
        );
    });
  ctx
    .route("/api/user/advanced-chat/deliveries")
    .methods("POST")
    .action(async (s) => {
      const id = user(s);
      if (!id) return;
      const now = new Date().toISOString();
      try {
        const input = await s.parseRequestBody();
        const value = validate(fields(input));
        s.status = 201;
        s.respond(
          await db.create("advanced_chat_deliveries", {
            id: randomUUID(),
            user_id: id,
            ...value,
            created_at: now,
            updated_at: now,
          } as any),
          "json",
        );
      } catch (error) {
        s.status = 400;
        s.respond(
          { error: error instanceof Error ? error.message : String(error) },
          "json",
        );
      }
    });
  ctx
    .route("/api/user/advanced-chat/deliveries/:id")
    .methods("PUT")
    .action(async (s, _p, rid) => {
      const id = user(s);
      if (!id) return;
      const old = await db.selectOne("advanced_chat_deliveries", {
        id: rid,
        user_id: id,
      });
      if (!old) {
        s.status = 404;
        s.respond({ error: "Delivery not found" }, "json");
        return;
      }
      try {
        const value = validate(fields(await s.parseRequestBody(), old));
        await db.update(
          "advanced_chat_deliveries",
          { id: rid, user_id: id },
          {
            ...value,
            updated_at: new Date().toISOString(),
          },
        );
        s.respond(
          await db.selectOne("advanced_chat_deliveries", {
            id: rid,
            user_id: id,
          }),
          "json",
        );
      } catch (error) {
        s.status = 400;
        s.respond(
          { error: error instanceof Error ? error.message : String(error) },
          "json",
        );
      }
    });
  ctx
    .route("/api/user/advanced-chat/deliveries/:id")
    .methods("DELETE")
    .action(async (s, _p, rid) => {
      const id = user(s);
      if (id) {
        const tasks = await db.select("advanced_chat_scheduled_tasks", {
          user_id: id,
          delivery_id: rid,
        });
        if (tasks.length) {
          s.status = 409;
          s.respond({ error: "Delivery is used by scheduled tasks" }, "json");
          return;
        }
        await db.remove("advanced_chat_deliveries", { id: rid, user_id: id });
        s.respond({ success: true }, "json");
      }
    });
}
