import type { Session } from "yumeri";

/**
 * Event names the chat UI listens for. They are part of the wire contract with
 * `frontend/pages/Chat.tsx`, so they are spelled out here rather than inlined.
 */
export type ChatStreamEventType =
  | "status"
  | "text"
  | "tool_call"
  | "done"
  | "error";

export interface ChatStreamEvent {
  type: ChatStreamEventType;
  payload: Record<string, unknown>;
}

export interface ChatStream {
  /** Aborted when the client goes away, so the upstream request can be dropped. */
  readonly signal: AbortSignal;
  readonly closed: boolean;
  send(event: ChatStreamEvent): void;
  close(): void;
}

/**
 * Answer the current request with `text/event-stream` written straight to the
 * socket.
 *
 * The core writes `session.status` and `session.head` itself once the route
 * returns, so a route that answers with a stream has to write its own head and
 * mark the response handled — otherwise the core would write a second response
 * onto the same socket. The CORS header the core would have added is mirrored
 * here, because a hand-written head bypasses that code.
 *
 * A client that disappears aborts `signal` instead of leaving the upstream
 * request running to completion.
 */
export function openChatStream(session: Session): ChatStream | undefined {
  const res = session.client.res;
  if (!res) return undefined;
  const head: Record<string, string> = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
  if (session.client.req?.headers?.origin) head["Access-Control-Allow-Origin"] = "*";
  session.responseHandled = true;
  res.writeHead(200, head);
  res.flushHeaders?.();

  const controller = new AbortController();
  let closed = false;
  const stream: ChatStream = {
    signal: controller.signal,
    get closed() {
      return closed || res.writableEnded;
    },
    send(event) {
      if (closed || res.writableEnded) return;
      res.write(
        `event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`,
      );
    },
    close() {
      if (closed) return;
      closed = true;
      if (!res.writableEnded) res.end();
    },
  };
  // `close` also fires for an ordinary end, so only a response that goes away
  // before the handler finished it means the client disconnected.
  res.once("close", () => {
    if (!closed) controller.abort();
  });
  return stream;
}
