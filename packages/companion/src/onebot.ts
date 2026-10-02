export interface OneBotEvent {
  provider: "onebot_v11" | "qq_official";
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

export function parseOneBotEvent(value: unknown): OneBotEvent | undefined {
  const body = record(value);
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
