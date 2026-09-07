const PROTOCOL_VERSION = "2025-06-18";
const MAX_RESPONSE = 4 << 20;

export interface McpToolResult {
  text: string;
  isError: boolean;
}

export class McpClient {
  private nextRequestId = 0;
  private sessionId = "";
  private initialized = false;

  constructor(
    private readonly endpoint: string,
    private readonly headers: Record<string, string> = {},
  ) {}

  private async request(method: string, params: unknown = {}): Promise<any> {
    const url = new URL(this.endpoint);
    if (!/^https?:$/.test(url.protocol))
      throw Error("MCP server URL must use HTTP(S)");
    const id = ++this.nextRequestId;
    const response = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": PROTOCOL_VERSION,
        ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
        ...this.headers,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    this.sessionId = response.headers.get("mcp-session-id") || this.sessionId;
    if (!response.ok)
      throw Error(`MCP server returned HTTP ${response.status}`);
    const type = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (type.includes("text/event-stream")) {
      const text = await response.text();
      for (const event of text.split(/\n\s*\n/)) {
        const data = event
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("\n");
        if (!data) continue;
        try {
          const payload = JSON.parse(data);
          if (payload.id === id || payload.result || payload.error)
            return payload;
        } catch {
          // Ignore non-JSON SSE events.
        }
      }
      throw Error("MCP stream ended without a response");
    }
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_RESPONSE)
      throw Error("MCP response is too large");
    const payload = JSON.parse(text);
    if (Array.isArray(payload))
      return payload.find((item) => item.result || item.error);
    return payload;
  }

  async initialize() {
    if (this.initialized) return;
    const result = await this.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "veloce-advanced-chat", version: "1.0.0" },
    });
    if (result?.error)
      throw Error(result.error.message || "MCP initialize failed");
    const notice = await fetch(new URL(this.endpoint), {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": PROTOCOL_VERSION,
        ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
        ...this.headers,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {},
      }),
    });
    if (!notice.ok && notice.status !== 202 && notice.status !== 204)
      throw Error("MCP initialized notification failed");
    this.initialized = true;
  }

  async listTools() {
    await this.initialize();
    const response = await this.request("tools/list", {});
    if (response?.error)
      throw Error(response.error.message || "MCP tools/list failed");
    return Array.isArray(response?.result?.tools) ? response.result.tools : [];
  }

  async callTool(
    name: string,
    argumentsValue: Record<string, unknown> = {},
  ): Promise<McpToolResult> {
    await this.initialize();
    const response = await this.request("tools/call", {
      name,
      arguments: argumentsValue,
    });
    if (response?.error)
      throw Error(response.error.message || "MCP tools/call failed");
    const result = response?.result ?? {};
    const text = Array.isArray(result.content)
      ? result.content
          .filter((item: any) => item?.text)
          .map((item: any) => String(item.text))
          .join("\n")
      : result.structuredContent
        ? JSON.stringify(result.structuredContent)
        : "";
    return { text, isError: result.isError === true };
  }
}
