import assert from "node:assert/strict";
import { test } from "node:test";
import { OneBotV12Adapter, parseOneBotEvent } from "../dist/onebot.js";

test("parses OneBot v11 group messages and CQ images", () => {
  const event = parseOneBotEvent({
    post_type: "message", message_type: "group", self_id: 8, user_id: 9, group_id: 10, message_id: 11,
    sender: { card: "Mika" }, raw_message: "hello [CQ:image,file=img-1,url=https://example.com/a.png]",
  });
  assert.equal(event.provider, "onebot_v11");
  assert.equal(event.userName, "Mika");
  assert.equal(event.text, "hello");
  assert.deepEqual(event.images, [{ url: "https://example.com/a.png", file: "img-1" }]);
});

test("parses OneBot v12 message events into the shared chat event shape", () => {
  const event = parseOneBotEvent({
    id: "event-1", type: "message", detail_type: "private", self: { user_id: "bot" },
    user: { user_id: "user-1", user_name: "Mika" }, message: [
      { type: "text", data: { text: "hello" } },
      { type: "image", data: { file_id: "file-1", url: "https://example.com/a.png" } },
    ],
  }, "v12");
  assert.equal(event.provider, "onebot_v12");
  assert.equal(event.userId, "user-1");
  assert.equal(event.text, "hello");
  assert.deepEqual(event.images, [{ url: "https://example.com/a.png", file: "file-1" }]);
  assert.equal(parseOneBotEvent({ post_type: "message", message_type: "private" }, "v12"), undefined);
});

test("sends OneBot v12 messages and images through the action API", async (t) => {
  let request;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    request = { url, options };
    return Response.json({ status: "ok", retcode: 0, data: { message_id: "sent-1" } });
  });
  const result = await new OneBotV12Adapter("https://bot.example/api", "secret").send(
    { messageType: "group", userId: "u1", groupId: "g1" },
    "hello",
    ["https://example.com/a.png"],
  );
  assert.deepEqual(result, { message_id: "sent-1" });
  assert.equal(request.url, "https://bot.example/api");
  assert.equal(request.options.headers.Authorization, "Bearer secret");
  assert.deepEqual(JSON.parse(request.options.body), {
    action: "send_message",
    params: {
      detail_type: "group", group_id: "g1",
      message: [
        { type: "text", data: { text: "hello" } },
        { type: "image", data: { file: "https://example.com/a.png" } },
      ],
    },
  });
});
