import { randomUUID } from "node:crypto";
import { Context, Database, Session } from "yumeri";
import "@velocelab/dashboard";
import "@velocelab/model";
import "@velocelab/advanced-chat";
export const depend = ["dashboard", "database", "model", "advanced-chat"];
export const provide = ["delivery"];
export function apply(ctx: Context) {
  ctx.component.dashboard.addEntry({
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("../frontend/delivery.js", import.meta.url).pathname,
    plugin: "delivery",
  });
  const db = ctx.component.database as Database;
  const chat = ctx.component["advanced-chat"];
  const user = (s: Session) => Number((s.properties.user as any)?.id ?? 0);
  const fields = (input: any, old: any = {}) => ({
    name: String(input.name ?? old.name ?? "Delivery"),
    description: String(input.description ?? old.description ?? ""),
    method: String(input.method ?? old.method ?? "webhook"),
    webhook_url: String(input.webhook_url ?? old.webhook_url ?? ""),
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
      s.status = 201;
      s.respond(
        await db.create("advanced_chat_deliveries", {
          id: randomUUID(),
          user_id: id,
          ...fields(await s.parseRequestBody()),
          created_at: now,
          updated_at: now,
        } as any),
        "json",
      );
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
      await db.update(
        "advanced_chat_deliveries",
        { id: rid, user_id: id },
        {
          ...fields(await s.parseRequestBody(), old),
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
    });
  ctx
    .route("/api/user/advanced-chat/deliveries/:id")
    .methods("DELETE")
    .action(async (s, _p, rid) => {
      const id = user(s);
      if (id) {
        await db.remove("advanced_chat_deliveries", { id: rid, user_id: id });
        s.respond({ success: true }, "json");
      }
    });
}
