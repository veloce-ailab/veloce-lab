import { createHash } from "node:crypto";
import type { OneBotEvent } from "./onebot.js";

type RecordValue = Record<string, any>;
const record = (value: unknown): RecordValue => value && typeof value === "object" ? value as RecordValue : {};
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export function parseQQOfficialEvent(name: string, value: unknown): OneBotEvent | undefined {
  if (name !== "GROUP_AT_MESSAGE_CREATE" && name !== "C2C_MESSAGE_CREATE") return undefined;
  const data = record(value);
  const author = record(data.author);
  if (author.bot === true) return undefined;
  const messageType = name === "GROUP_AT_MESSAGE_CREATE" ? "group" : "private";
  const images = Array.isArray(data.attachments)
    ? data.attachments.filter((attachment: unknown) => String(record(attachment).content_type ?? "").toLowerCase().startsWith("image/"))
      .map((attachment: unknown) => ({ url: String(record(attachment).url ?? ""), file: String(record(attachment).filename ?? "image") }))
    : [];
  const userId = String(messageType === "group" ? author.member_openid ?? author.id ?? "" : author.user_openid ?? author.id ?? "");
  const messageId = String(data.id ?? "");
  if (!userId || !messageId) return undefined;
  return {
    provider: "qq_official",
    messageType,
    selfId: "",
    userId,
    groupId: messageType === "group" ? String(data.group_openid ?? "") : "",
    messageId,
    userName: String(author.username ?? userId),
    text: String(data.content ?? "").trim(),
    images,
  };
}

export class QQOfficialAdapter {
  private readonly apiBaseURL: string;
  constructor(private readonly appId: string, private readonly clientSecret: string, apiBaseURL = "https://api.bot.qq.com") {
    this.apiBaseURL = apiBaseURL.replace(/\/+$/, "");
  }

  private async accessToken() {
    if (!this.appId || !this.clientSecret) throw new Error("QQ 官方 Bot AppID 和 ClientSecret 尚未配置");
    const cacheKey = createHash("sha256").update(`${this.appId}\0${this.clientSecret}`).digest("hex");
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
    const response = await fetch("https://api.bot.qq.com/app/getAppAccessToken", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: this.appId, clientSecret: this.clientSecret }), signal: AbortSignal.timeout(10000),
    });
    const raw = await response.text(); let data: RecordValue = {};
    try { data = JSON.parse(raw) as RecordValue; } catch {}
    if (!response.ok || !data.access_token) throw new Error(`QQ token 获取失败 (${response.status}): ${String(data.message ?? raw).slice(0, 300)}`);
    const expiresIn = Math.max(60, Number(data.expires_in) || 7200);
    tokenCache.set(cacheKey, { token: String(data.access_token), expiresAt: Date.now() + expiresIn * 1000 });
    return String(data.access_token);
  }

  async getAccessToken() { return this.accessToken(); }

  private async request(path: string, body?: RecordValue) {
    const token = await this.accessToken();
    const response = await fetch(`${this.apiBaseURL}${path}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `QQBot ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
    });
    const raw = await response.text(); let data: RecordValue = {};
    try { data = JSON.parse(raw) as RecordValue; } catch {}
    if (!response.ok || data.code) throw new Error(`QQ API 请求失败 (${response.status}): ${String(data.message ?? raw).slice(0, 400)}`);
    return data;
  }

  async gatewayURL() {
    const data = await this.request("/gateway/bot");
    if (!data.url) throw new Error("QQ 官方 Gateway 未返回 WebSocket 地址");
    return String(data.url);
  }

  async ping() {
    const data = await this.request("/users/@me");
    return data;
  }

  async sendText(event: Pick<OneBotEvent, "messageType" | "userId" | "groupId" | "messageId">, content: string, msgSeq: number) {
    const path = event.messageType === "group"
      ? `/v2/groups/${encodeURIComponent(event.groupId)}/messages`
      : `/v2/users/${encodeURIComponent(event.userId)}/messages`;
    return this.request(path, { msg_type: 0, content, msg_id: event.messageId, msg_seq: msgSeq });
  }

  async sendImage(event: Pick<OneBotEvent, "messageType" | "userId" | "groupId" | "messageId">, imageURL: string, msgSeq: number, fileName: string) {
    const basePath = event.messageType === "group"
      ? `/v2/groups/${encodeURIComponent(event.groupId)}`
      : `/v2/users/${encodeURIComponent(event.userId)}`;
    const uploaded = await this.request(`${basePath}/files`, { file_type: 1, url: imageURL, file_name: fileName, srv_send_msg: false });
    if (!uploaded.file_info) throw new Error("QQ 图片上传接口未返回 file_info");
    return this.request(`${basePath}/messages`, { msg_type: 7, media: { file_info: uploaded.file_info }, msg_id: event.messageId, msg_seq: msgSeq });
  }
}

export class QQOfficialGateway {
  private running = false;
  private socket?: WebSocket;
  private heartbeat?: ReturnType<typeof setInterval>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectResolve?: () => void;
  private seq: number | null = null;
  private sessionId = "";

  constructor(
    private readonly adapter: QQOfficialAdapter,
    private readonly onMessage: (eventName: string, eventData: unknown) => Promise<void> | void,
    private readonly label: string,
  ) {}

  start() {
    if (this.running) return;
    this.running = true;
    void this.run();
  }

  stop() {
    this.running = false;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = undefined;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.reconnectResolve?.(); this.reconnectResolve = undefined;
    try { this.socket?.close(1000, "integration stopped"); } catch {}
    this.socket = undefined;
  }

  private async run() {
    let backoff = 1000;
    while (this.running) {
      const connectedAt = Date.now();
      try { await this.connectOnce(); }
      catch (error) { console.error(`[companion/qq:${this.label}]`, error); }
      if (!this.running) break;
      if (Date.now() - connectedAt > 5 * 60_000) backoff = 1000;
      else backoff = Math.min(30_000, backoff * 2);
      await new Promise<void>((resolve) => {
        this.reconnectResolve = resolve;
        this.reconnectTimer = setTimeout(() => { this.reconnectTimer = undefined; this.reconnectResolve = undefined; resolve(); }, backoff);
        this.reconnectTimer.unref?.();
      });
    }
  }

  private async connectOnce() {
    const url = await this.adapter.gatewayURL();
    if (!this.running) return;
    await new Promise<void>((resolve) => {
      let finished = false;
      let heartbeatInterval = 45000;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (this.heartbeat) clearInterval(this.heartbeat);
        this.heartbeat = undefined;
        resolve();
      };
      const socket = new WebSocket(url);
      this.socket = socket;
      let lastAck = Date.now();
      socket.addEventListener("message", (event) => {
        let payload: RecordValue;
        try { payload = JSON.parse(String(event.data)) as RecordValue; }
        catch { return; }
        const opcode = Number(payload.op);
        if (opcode === 10) {
          heartbeatInterval = Math.max(5000, Number(record(payload.d).heartbeat_interval) || 45000);
          const identify = this.sessionId && this.seq !== null
            ? { op: 6, d: { token: "", session_id: this.sessionId, seq: this.seq } }
            : { op: 2, d: { token: "", intents: 1 << 25, shard: [0, 1], properties: { $os: "linux", $browser: "veloce-lab", $device: "veloce-lab" } } };
          void (async () => {
            try {
              const token = await this.adapter.getAccessToken();
              identify.d.token = `QQBot ${token}`;
              socket.send(JSON.stringify(identify));
              lastAck = Date.now();
              this.heartbeat = setInterval(() => {
                if (Date.now() - lastAck > heartbeatInterval * 2) { try { socket.close(4000, "heartbeat timeout"); } catch {} return; }
                if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ op: 1, d: this.seq }));
              }, heartbeatInterval);
            } catch (error) { console.error(`[companion/qq:${this.label}] gateway identify failed`, error); try { socket.close(); } catch {} }
          })();
          return;
        }
        if (opcode === 11) { lastAck = Date.now(); return; }
        if (opcode === 7) { try { socket.close(4001, "gateway reconnect"); } catch {} return; }
        if (opcode === 9) {
          if (payload.d === false) { this.sessionId = ""; this.seq = null; }
          try { socket.close(4002, "invalid session"); } catch {}
          return;
        }
        if (opcode !== 0) return;
        if (Number.isFinite(Number(payload.s))) this.seq = Number(payload.s);
        const eventName = String(payload.t ?? "");
        if (eventName === "READY") this.sessionId = String(record(payload.d).session_id ?? "");
        if (eventName === "RESUMED") return;
        if (eventName === "GROUP_AT_MESSAGE_CREATE" || eventName === "C2C_MESSAGE_CREATE") {
          void Promise.resolve(this.onMessage(eventName, payload.d)).catch((error) => console.error(`[companion/qq:${this.label}] event failed`, error));
        }
      });
      socket.addEventListener("close", (event) => {
        if ([4006, 4007].includes(event.code)) { this.sessionId = ""; this.seq = null; }
        if (this.socket === socket) this.socket = undefined;
        finish();
      });
      socket.addEventListener("error", () => {
        if (socket.readyState !== WebSocket.OPEN) finish();
      });
    });
  }
}
