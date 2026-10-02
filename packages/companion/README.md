# Veloce Lab Companion

聊天陪伴扩展插件：在 Dashboard 的聊天侧栏中管理陪伴人格，通过 **OneBot v11** 或 **QQ 官方机器人开放平台**接入。陪伴人格克隆已有 Advanced Chat 助理配置，并通过 Advanced Chat 及其 adapter 调用模型；启用 Memory 插件后可复用原有记忆上下文和记忆工具。

## 构建

在仓库根目录运行：

```bash
corepack yarn install
corepack yarn workspace @velocelab/companion build
```

`packages/companion` 是 Yarn workspace；默认插件列表也已加入 `scripts/yumeri.json`。

## OneBot v11 接入

1. 启动提供 OneBot v11 HTTP API 的 QQ 机器人实现（例如 NapCat、Lagrange），确保 Veloce Lab 服务端能访问其 HTTP API 地址。
2. 打开 Dashboard → 聊天 → **聊天陪伴**，新增 OneBot 接入，填写 HTTP API 地址和可选 Access Token，然后保存。
3. 复制页面显示的 Webhook URL，在 OneBot 机器人中配置 **HTTP POST 反向事件上报**，订阅消息事件，并将该 URL 作为 `post_url`。
4. 使用“测试 OneBot 连接”确认 HTTP API 可达；群聊还需让机器人进入相应群。

Webhook URL 含随机高熵密钥，应作为秘密保管。过滤器为空时不限制；拒绝列表优先。接入以群号覆盖默认人格时，可在映射框填 JSON，例如：

```json
{"12345678":"人格 ID"}
```

## QQ 官方机器人接入

在 **聊天陪伴 → 新增 QQ 官方** 中填写 QQ 开放平台机器人的 AppID 和 ClientSecret。凭据保存在服务端，ClientSecret 不会返回到浏览器；保存后服务端自动获取官方 access token 并保持 Gateway WebSocket 连接。接入覆盖 QQ 群 @机器人消息和 C2C 私聊，使用官方 REST API 回消息，并通过官方富媒体接口发送图片。无需单独配置公网 Webhook。测试按钮验证官方 API 凭据。

在 QQ 开放平台确认机器人已开通并订阅 `GROUP_AND_C2C_EVENT`（Intent `1 << 25`），同时满足群聊和 C2C 私聊权限。默认 API Host 为 `https://api.bot.qq.com`。

官方参考： [获取 access token](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/access-token.html)、[WebSocket Gateway](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/event-emit/websocket.html)、[群 @ 事件](https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/group_at_message_create.html)、[C2C 事件](https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/c2c_message_create.html)、[群消息发送](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_groups_group_openid_messages.post.html)、[C2C 消息发送](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_users_user_openid_messages.post.html)、[富媒体上传](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/rich-media.html)。

## 人格、模型与会话

新建人格时选择一个已有的、已配置模型的 Advanced Chat 助理。插件会克隆模型、用户上游渠道、工具、技能及 MCP 配置；之后由该人格关联的 Advanced Chat agent 按原有 adapter 路由请求。模型目录和凭证不在此插件中另造或复制成独立设置。

会话模式可以按群聊/私聊对象分别隔离，或让该人格统一共享会话。不同人格有不同会话。Memory 沿用该助理的现有 memory 注入和工具行为。

## 图片与表情包

- 开启图片输入后，OneBot 与 QQ 官方收到的图片会保存为 Advanced Chat 附件并随消息交给模型；图片输入关闭时只记录忽略提示。
- 收到的图片会作为待分类候选。陪伴人格可以调用 `companion_sticker_save`，自主选择分类、为**每张表情包命名**并描述适合复用的图片；同一分类内名称不重复，工具仅允许关联陪伴人格调用。
- `companion_sticker_list` 返回分类和名称，发送前必须调用 `companion_sticker_find` 精确查找。回复中的 `[[sticker:分类/名称]]` 只会命中对应那一张，再由 OneBot 或 QQ 官方富媒体 API 发送。
- 启用多条输出后，模型可用单独一行 `---` 分隔消息；每条发送前按模拟打字间隔等待。
- 为避免机器人读取本地任意文件，模型生成的直接 OneBot `[CQ:image,...]` 指令会被丢弃；图片输出以已保存表情包为准。

图片输入通过 HTTP(S) 图片 URL 获取，限制响应大小，并仅信任公网地址或所配置 OneBot API 的相同源站。QQ 官方接口按官方要求分别上传至对应私聊/群聊媒体端点。
