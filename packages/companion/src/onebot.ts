export interface OneBotEvent {
  provider: "onebot_v11" | "onebot_v12" | "qq_official";
  messageType: "group" | "private";
  selfId: string;
  userId: string;
  groupId: string;
  messageId: string;
  userName: string;
  text: string;
  images: Array<{ url: string; file: string }>;
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? value as Record<string, any> : {};
}

function decodeCQ(value: string) {
  return value.replace(/&#44;/g, ",").replace(/&#91;/g, "[").replace(/&#93;/g, "]").replace(/&amp;/g, "&");
}

function parseCQImages(message: string) {
  const images: Array<{ url: string; file: string }> = [];
  const text = message.replace(/\[CQ:image,([^\]]+)\]/gi, (_match, raw: string) => {
    const data = Object.fromEntries(raw.split(",").map((item) => {
      const index = item.indexOf("=");
      return index < 0 ? [item, ""] : [item.slice(0, index), decodeCQ(item.slice(index + 1))];
    }));
    images.push({ url: String(data.url ?? ""), file: String(data.file ?? "") });
    return " ";
  });
  return { text: decodeCQ(text).replace(/\[CQ:[^\]]+\]/gi, " ").replace(/\s+/g, " ").trim(), images };
}

export function parseOneBotEvent(value: unknown, version: "v11" | "v12" = "v11"): OneBotEvent | undefined {
  const body = record(value);
  if (version === "v12") {
    if (body.type !== "message" || !["group", "private"].includes(String(body.detail_type))) return undefined;
    const messageType = body.detail_type as "group" | "private";
    const user = record(body.user);
    const images: OneBotEvent["images"] = [];
    const chunks: string[] = [];
    for (const raw of Array.isArray(body.message) ? body.message : []) {
      const segment = record(raw);
      const data = record(segment.data);
      if (segment.type === "text") chunks.push(String(data.text ?? ""));
      else if (segment.type === "image") images.push({ url: String(data.url ?? ""), file: String(data.file_id ?? data.file ?? "") });
    }
    return {
      provider: "onebot_v12",
      messageType,
      selfId: String(body.self?.user_id ?? body.self_id ?? ""),
      userId: String(user.user_id ?? body.user_id ?? ""),
      groupId: messageType === "group" ? String(body.group_id ?? "") : "",
      messageId: String(body.message_id ?? body.id ?? ""),
      userName: String(user.card ?? user.user_name ?? user.nickname ?? user.user_id ?? ""),
      text: chunks.join("").trim(),
      images,
    };
  }
  if (body.post_type !== "message" || !["group", "private"].includes(String(body.message_type))) return undefined;
  const sender = record(body.sender);
  const messageType = body.message_type as "group" | "private";
  const images: OneBotEvent["images"] = [];
  let text = "";
  if (Array.isArray(body.message)) {
    const chunks: string[] = [];
    for (const raw of body.message) {
      const segment = record(raw);
      const data = record(segment.data);
      if (segment.type === "text") chunks.push(String(data.text ?? ""));
      else if (segment.type === "image") images.push({ url: String(data.url ?? ""), file: String(data.file ?? "") });
      else if (segment.type === "face" || segment.type === "mface") chunks.push(`[表情:${String(data.id ?? data.summary ?? "")} ]`);
    }
    text = chunks.join("").trim();
  } else {
    const parsed = parseCQImages(String(body.raw_message ?? body.message ?? ""));
    text = parsed.text;
    images.push(...parsed.images);
  }
  return {
    provider: "onebot_v11",
    messageType,
    selfId: String(body.self_id ?? ""),
    userId: String(body.user_id ?? ""),
    groupId: messageType === "group" ? String(body.group_id ?? "") : "",
    messageId: String(body.message_id ?? ""),
    userName: String(sender.card ?? sender.nickname ?? sender.name ?? body.user_id ?? ""),
    text,
    images,
  };
}

export class OneBotV11Adapter {
  constructor(private readonly baseURL: string, private readonly accessToken: string) {}

  async action(action: string, params: Record<string, unknown> = {}) {
    const response = await fetch(`${this.baseURL.trim().replace(/\/+$/, "")}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}) },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    if (!response.ok) throw Error(`OneBot ${action} failed (${response.status}): ${text.slice(0, 500)}`);
    let data: any;
    try { data = JSON.parse(text || "{}"); } catch { throw Error(`OneBot ${action} returned invalid JSON`); }
    if (data.status === "failed" || (Number(data.retcode) !== 0 && data.retcode !== undefined)) throw Error(`OneBot rejected ${action}: ${String(data.wording ?? data.message ?? data.retcode ?? "unknown error")}`);
    return data.data ?? data;
  }

  async send(event: Pick<OneBotEvent, "messageType" | "userId" | "groupId">, message: string) {
    const url = `${this.baseURL.trim().replace(/\/+$/, "")}/send_msg`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
      },
      body: JSON.stringify({
        message_type: event.messageType,
        ...(event.messageType === "group" ? { group_id: event.groupId } : { user_id: event.userId }),
        message,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    if (!response.ok) throw Error(`OneBot send_msg failed (${response.status}): ${text.slice(0, 500)}`);
    let data: any;
    try { data = JSON.parse(text); } catch { data = {}; }
    if (data.status === "failed" || (Number(data.retcode) !== 0 && data.retcode !== undefined))
      throw Error(`OneBot rejected send_msg: ${String(data.wording ?? data.message ?? data.retcode ?? "unknown error")}`);
    return data;
  }

  async ping() {
    const response = await fetch(`${this.baseURL.trim().replace(/\/+$/, "")}/get_login_info`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}) },
      body: "{}",
      signal: AbortSignal.timeout(8000),
    });
    const text = await response.text();
    if (!response.ok) throw Error(`OneBot connection failed (${response.status}): ${text.slice(0, 300)}`);
    return JSON.parse(text || "{}");
  }
}

export class OneBotV12Adapter {
  constructor(private readonly baseURL: string, private readonly accessToken: string) {}

  async action(action: string, params: Record<string, unknown> = {}) {
    const response = await fetch(this.baseURL.trim().replace(/\/+$/, ""), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}) },
      body: JSON.stringify({ action, params }),
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    if (!response.ok) throw Error(`OneBot v12 ${action} failed (${response.status}): ${text.slice(0, 500)}`);
    let result: any;
    try { result = JSON.parse(text || "{}"); } catch { throw Error(`OneBot v12 ${action} returned invalid JSON`); }
    if (result.status === "failed" || (Number(result.retcode) !== 0 && result.retcode !== undefined)) throw Error(`OneBot v12 rejected ${action}: ${String(result.message ?? result.retcode ?? "unknown error")}`);
    return result.data ?? result;
  }

  send(event: Pick<OneBotEvent, "messageType" | "userId" | "groupId">, message: string, images: string[] = []) {
    const segments = [
      ...(message ? [{ type: "text", data: { text: message } }] : []),
      ...images.map((url) => ({ type: "image", data: { file: url } })),
    ];
    return this.action("send_message", { detail_type: event.messageType, ...(event.messageType === "group" ? { group_id: event.groupId } : { user_id: event.userId }), message: segments });
  }

  ping() { return this.action("get_status"); }

  async imageURL(fileID: string) {
    const result = await this.action("get_file", { file_id: fileID });
    return String(result.url ?? result.download_url ?? "");
  }
}
import { randomUUID } from "node:crypto";
import WebSocket from "ws";


export class OneBotWsClient {
  private socket?: WebSocket;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();

  constructor(private readonly url: string, private readonly accessToken: string, private readonly onEvent: (event: unknown) => void) {}

  start() { this.stopped = false; this.connect(); }

  stop() {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.socket?.close(1000, "integration stopped");
    this.socket = undefined;
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error("OneBot WebSocket disconnected")); }
    this.pending.clear();
  }

  action(action: string, params: Record<string, unknown> = {}) {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("OneBot WebSocket is not connected"));
    const echo = randomUUID();
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(echo); reject(new Error(`OneBot WebSocket ${action} timed out`)); }, 15000);
      this.pending.set(echo, { resolve, reject, timer });
      socket.send(JSON.stringify({ action, params, echo }), (error) => {
        if (!error) return;
        clearTimeout(timer); this.pending.delete(echo); reject(error);
      });
    });
  }

  private connect() {
    if (this.stopped) return;
    const socket = new WebSocket(this.url, { headers: this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {} });
    this.socket = socket;
    socket.on("message", (raw) => {
      let value: any;
      try { value = JSON.parse(String(raw)); } catch { return; }
      const echo = value?.echo == null ? "" : String(value.echo);
      const pending = echo ? this.pending.get(echo) : undefined;
      if (pending) {
        this.pending.delete(echo); clearTimeout(pending.timer);
        if (value.status === "failed" || (Number(value.retcode) !== 0 && value.retcode !== undefined)) pending.reject(new Error(String(value.message ?? value.wording ?? value.retcode)));
        else pending.resolve(value.data ?? value);
        return;
      }
      this.onEvent(value);
    });
    socket.on("close", () => {
      if (this.socket === socket) this.socket = undefined;
      for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error("OneBot WebSocket disconnected")); }
      this.pending.clear();
      if (!this.stopped) this.retryTimer = setTimeout(() => this.connect(), 1500);
    });
    socket.on("error", () => socket.close());
  }
}
