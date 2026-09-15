# 现有代码（packages/）对照旧代码（old/）的功能缺失与逻辑问题

分析对象：`old/`（Go + Gin 旧后端，行为基准）与 `packages/`（Yumeri 插件式 TypeScript 新后端）。
分析日期：本次会话。方法：路由清单机读比对 + 前端调用与后端路由交叉比对 + 关键实现逐行核对 + 实验验证。

## 0. 规模与方法

| 项 | 旧代码 | 新代码 |
| --- | --- | --- |
| 源文件 | 223 个 `.go`（149 非测试 / 74 测试），约 4 万行 | 49 个包，`src` 约 1.6 万行 + `frontend` 约 3.9 万行 |
| 路由声明 | 350 条 | 176 条（含跨包重复） |

比对结果（可复现，见 §5）：

- **旧后端 350 条路由声明中，158 条在新代码中不存在**（去重后的 `METHOD + path`）。
- 新前端共 259 处 API 调用，其中 **84 处（64 个去重路径）找不到对应后端路由**。
- 交付的核心域压缩比明显：旧 `advanced_chat_*.go` 核心约 1.8 万行 → `packages/advanced-chat/src` 约 3.5 千行。

---

## 一、功能缺失

### 1.1 完全未迁移的子系统

| 子系统 | 旧代码 | 缺失证据 |
| --- | --- | --- |
| 个人公司 / 企业组织（组织架构、员工、工作项、交接、审批、招聘计划、目标、章程、运行时绑定、调度、首席工具、看板） | `personal_company_api.go:15-48`（31 条路由）、`personal_company_*.go` 约 2600 行、`model/personal_company_*.go` 约 500 行 | `packages/` 下无任何 `personal-company` 路由；31 条路由全部缺失 |
| 企业版（RBAC、部门、配额、共享会话池、共享文件、企业设备、bootstrap/seed） | `enterprise_*.go`、`model/enterprise_*.go` 约 1400 行 | 前端仍调用 `/api/user/enterprise/shared-pools*`（`Chat.tsx:750,765,956,965,1619,1849,2413,2899,2959`、`AdvancedChatFiles.tsx:79,88,109`），后端无实现 |
| 云沙箱 / 沙箱主机 | `advanced_chat_cloud_sandboxes.go`（642 行，12 条路由） | `Chat.tsx:811` 仍调用 `/api/user/advanced-chat/cloud-sandboxes` |
| Meta-model / meta-DSL | `meta_model.go:70-76`、`meta_dsl.go`（共约 1500 行） | `/api/meta-models`(GET/POST)、`/:id`(PUT/DELETE)、`/validate` 全缺 |
| 插件宿主 / 市场 / 更新运行时 | `plugins.go`、`plugin_host.go`、`plugin_updates.go`、`plugin_market.go`、`plugin_runtime.go`、`plugin_upstream.go`、`plugin_hooks.go` 约 2900 行 | 15 条 `/api/plugins*` 路由全缺 |
| 支付 / 钱包 / 订阅 / 兑换码 | `payment*.go`（约 2200 行）、`subscription.go`、`wallet.go`、`billing.go`、`checkin.go` | `/api/subscription-plans*`、`/api/redeem-codes*`、`/api/user/subscription*`、`/api/user/redeem-code` 全缺 |
| 系统设置存储 | `api/admin.go` 的 SystemAPI、`app.go:696-699` | `GET/PUT /api/settings`、`/api/settings/export`、`/api/settings/import` 全缺（`MIGRATION_STATUS.md:74-77` 亦自认为已知缺口） |
| 首次运行向导 | `app.go:115-179`（`/api/setup/status`、`POST /api/setup`） | `packages/service/src/index.ts:34,152` 只有 `initialSetupRequired()` 判断，无路由 |
| 社区代理 | `app/community_proxy.go`、`app.go:106-113`（8 条路由） | `packages/community/src/index.ts` 共 3 行，**不注册任何路由**，仅注册前端入口 |
| 内容过滤 / URL 守卫 | `content_filter_community.go`、`url_guard_community.go` | 无实现 |
| 自动更新 / 重启 / 状态页 | `auto_update.go`、`restart.go`、`status.go` | 无实现 |
| 可靠性 / 重试 / 自动恢复 / 集群协调 | `reliability.go`、`cluster.go`、`model/cluster.go`、`api/scheduler.go`、`price_sync_schedule.go` | 无实现 |
| 审计与请求日志持久化 | `audit.go`、`middleware/audit.go`、`model/log_db.go`（485 行） | 见 §2.8（有中间件但只写内存） |
| SQLite→Postgres/MySQL 迁移工具 | `model/sqlite_migration.go`（含丢弃/修复统计） | 无实现，且新持久层无任何版本化迁移机制 |
| 消息渠道运行时（QQ/微信/视频号登录、公会、帖子、评论的收发运行时） | `channel/*.go` 约 4000 行 | 见 §1.3 |

### 1.2 已迁移但缺接口（按域）

**认证 / 账号安全（12 条）** — 旧 `app.go` 全部有；新 `packages/auth` 仅实现密码登录/注册/登出 + 用户管理：

- `/api/setup/status`、`POST /api/setup`
- `/auth/login`（OIDC 跳转）、`/auth/callback`、`/auth/oauth/:provider/login|callback`
- `/auth/passkey/login|login/options`、`/auth/password/email-code`、`/auth/phone/{sms-code,login-code,login,register}`
- `/api/user/passkeys*`、`/api/user/password/{method,email-code,change}`、`/api/user/phone/*`、`/api/user/oidc/bind-url`、`/api/user/desktop/authorize`、`/auth/desktop/token`
- `/api/user/avatar`、`/api/avatars/:id`

对应前端页面 `packages/user/frontend/pages/SecuritySettings.tsx` 的 12 个调用全部落空（见 §1.3）。

**模型目录 / 同步（5 条）**：`/api/models/sync`、`/api/channels/sync`、`/api/user/catalog`、`/api/user/usage/statistics`、`/api/channel-usage` 中的用量统计部分。

**消息渠道（16 条）**：`channel.go:197-231` 的
`qq/login/start|wait`、`weixin/login/start|wait`、`tencent-channel/login/start|wait|guilds|channels|list-posts|get-post|get-comments|publish-post|comment-post|reply-comment`，
以及管理端 `GET|PUT /api/message-channel/settings`。
`packages/channel/src/index.ts:262-279` 只实现了 `enable` / `disable` 两个动态子路由。

**Advanced Chat（24 条）**：

- **Agent groups 全部缺失**：`/api/user/advanced-chat/agent-groups`(GET/POST)、`/:id`(GET/PUT/DELETE) —— 旧 `advanced_chat.go:385-389`。前端 4 处调用（`AgentGroups.tsx:107,214`、`AgentGroupsPage.tsx:91,125`、`Chat.tsx:1204`、`MessageChannelsWorkspace.tsx:1688`）。
- 聊天群：`/:id/members/:member_id/activity`（`ChatGroups.tsx:745`）、`/:id/private-conversations/:conversation_id`（`ChatGroups.tsx:722`）。
- 知识库：`/:id/documents/:document_id/content` 的 GET/PUT（`KnowledgeBases.tsx:192,208`）。
- 技能：`GET /skills/:id`、`GET /skills/:id/files`（`Skills.tsx:171,184`）、`POST /skill-packages`、`GET /skill-packages/:id/files`（`Skills.tsx:93`）。
- 记忆：见 §2.7（路径前缀错误，等价于全缺）。
- 管理端 `GET|PUT /api/advanced-chat/settings`（`AdvancedChatManagement.tsx:93,111,130,157`）。
- 连接器：`/api/user/advanced-chat/devices/desktop/ensure` 被改名为 `.../desktop/connector/ensure`（`connector/src/index.ts:133`）。

**认证与限流基础设施**：旧代码每个敏感路由都挂 `middleware.NewSensitiveRateLimiter`（per-IP + per-identity，如密码登录 15/min、身份 5/min）；新代码 **`packages/ratelimit` 与 `packages/middleware` 没有任何文件 import**（`packages/middleware` 甚至只有 `dist/`、没有 `src/`）。

### 1.3 前端调用但后端无路由（84 处调用 / 64 个去重路径）

机读清单见 `.dsh-tmp/frontend-calls-without-route.csv`。按影响面排序的代表项：

| 调用 | 位置 | 后果 |
| --- | --- | --- |
| `GET /user/catalog` | `AgentEditor.tsx:37`、`Agents.tsx:104`、`AssistantSettings.tsx:56`、`Chat.tsx:704`、`ChatGroups.tsx:107`、`MessageChannelsWorkspace.tsx:1674`、`KnowledgeBases.tsx:95`、`AdvancedChatScheduledTasks.tsx:177`（8 页） | 8 个页面的模型/渠道下拉无数据 |
| `GET /community/*`（8 处） | `Community.tsx:89,92,118,121,147,150,179,208,239` | 社区页三个标签页全部不可用 |
| `GET/PUT /settings` | `SystemSettings.tsx:54,80`、`AppDesktop.tsx:243` | 系统设置/网络代理无法读写 |
| `GET /user/plugins`、`/user/plugins/:id/settings` | `Channels.tsx:163,361` | 与 `settings` 注册的 `/api/settings/plugins` 不匹配 |
| `/user/advanced-chat/agent-groups*` | 4 处 | 智能体群组页全不可用 |
| `/user/enterprise/shared-pools*` | 11 处 | 共享池相关界面全部不可用 |
| `/user/passkeys*`、`/user/password/*`、`/user/phone/*`、`/user/oidc/bind-url` | `SecuritySettings.tsx:72-166` | 安全设置页整页不可用 |
| `/user/advanced-chat/memories*` | `AdvancedChatMemories.tsx:83,120,176,177,199` | 记忆页整页不可用（见 §2.7） |
| `POST /user/avatar` | `ProfileSettings.tsx:67` | 无法上传头像 |
| `POST /user/desktop/authorize` | `DesktopAuthorize.tsx:29` | 桌面授权流程断裂 |
| `POST /auth/logout` | `SettingsWorkspace.tsx:86`、`bridges.tsx:46` | 见 §2.9 |

---

## 二、逻辑问题

### 严重

#### 2.1 聊天补全的前后端协议不一致：后端返回 JSON，前端按 SSE 解析

- 前端发 `stream: true` 并读取响应体作为 SSE 事件流：`Chat.tsx:2634-2665`（fetch）、`2673-2734`（`response.body.getReader()` 按 `\r?\n\r?\n` 切分）、`6359-6377`（`parseSSEEvent`），期望事件 `text`/`status`/`tool_call`/`done`/`error`（`2680-2718`）。
- 后端把整次补全 `await` 完再一次性返回 JSON：`advanced-chat/src/routes.ts:699-718`。
- `parseSSEEvent` 对没有 `data:` 行的输入返回 `null`（`Chat.tsx:6369-6371`），`handleStreamEvent(null)` 直接返回（`2677-2679`）——**失败是静默的**。

后果：无逐字输出、无状态提示（`retrying`/`model_round` 等）、无实时工具调用展示、`done` 分支携带的 `content_parts`/`input_tokens`/`output_tokens` 永不生效（`2704-2715`）。整条 SSE 协议在新后端**没有实现**：全仓库没有 `session.respond(..., "stream")`、没有 `res.write`、没有写入 `text/event-stream` 响应头的位置。

即便是适配器层的 `stream()` 也不是流式：`adapter-openai/src/index.ts:18-31` 先 `await response.text()` 再逐行切分，与 `advanced-chat/src/index.ts:1098-1102` 的 `response.clone()` + `response.text()` 叠加，同一份 SSE 体被完整缓冲两次。

#### 2.2 **没有任何 Provider 适配器被加载，聊天补全必然抛错**

- 每个 `@velocelab/adapter-*` 都是独立 Yumeri 插件，靠 `apply()` 自行注册到 `adapters` 组件（`adapter-openai/src/index.ts:49-85`，`depend = ["adapters"]`）。
- `adapters` 注册表本身不导入任何适配器：`packages/adapters/src/index.ts:1`（只 import `yumeri`），`build()` 在没有注册项时返回 `undefined`（`:102`）。
- `yumeri.json` 只启用了 `@velocelab/adapters`（第 38 行），**16 个 `@velocelab/adapter-*` 全都不在配置里**（`grep adapter yumeri.json` 仅命中第 38 行）；`advanced-chat/package.json:11-15` 也未依赖它们。
- 于是 `advanced-chat/src/index.ts:1045-1065` 的 `adapters.build(...)` 返回 `undefined`，直接 `throw Error("no adapter registered for upstream channel")`。

结论：按当前 `yumeri.json`，任何聊天补全都会立即失败。要么补全配置，要么让 `adapters` 包默认加载适配器。

#### 2.3 `database-core.create()` 用 SQLite rowid 覆盖调用方提供的字符串主键

`database-core/src/index.ts:175-182`：

```ts
const result = await this.driver.execute(INSERT ...);
return { ...data, ...(result.insertId === undefined ? {} : { id: Number(result.insertId) }) };
```

`sqlite/src/index.ts:40` 返回 `insertId: result.lastInsertRowid`，而 `node:sqlite` 的 `run()` **总是**返回一个已定义的 `lastInsertRowid`（已实测，Node v24.16.0：即使表主键是 `TEXT` 且显式写入 `acm-abc-123`，仍返回 `lastInsertRowid = 1`）。

后果：所有显式生成字符串 id 的 `create()` 调用，**返回对象的 `id` 被替换成数字 rowid**，而数据库行里存的仍是字符串 id。例如
`advanced-chat/src/index.ts:1222-1235` 创建助手消息后用 `assistant.id` 写回 `assistant_message_id`（`:1257`），并作为响应返回 `message.id`（`:1271`）——外键指向错误值，前端按 id 匹配助消息（`Chat.tsx:2620-2627`）也会错位。

#### 2.4 `database-core` 的 `update` / `remove` 在空条件下会作用于整表

- `where()` 对 `{}` 返回空串（`database-core/src/index.ts:52-105`）；`update`(`:206-226`) 与 `remove`(`:227-238`) 在条件为空时不追加任何 `WHERE`，生成 `UPDATE t SET ...` / `DELETE FROM t`。
- 更隐蔽的是 `:64` —— **值为 `undefined` 的过滤键被静默丢弃**。因此 `db.remove("x", { id: 1, user_id: maybeUndefined })` 会退化为只按 `id` 删除，跨用户命中。

这是结构性隐患：数据访问层没有"必须带归属过滤"的约束，全靠每个调用点自觉。

#### 2.5 持久层没有事务

`database-core` 的 `Database` 接口没有 `begin`/`commit`/`transaction`；全仓库搜不到事务 API。旧代码依赖 GORM 事务的多步写操作（建会话+写消息+写 run+写事件、建父记录+子记录、删除父+子）现在都是顺序非原子写，中途失败会留下半成品状态。典型例子：`advanced-chat/src/index.ts:946-978`（消息 + run）、`:1222-1266`（消息 + 事件 + run 状态 + 会话时间戳）。

#### 2.6 记忆插件存在路径穿越（任意文件写入）

`memory/src/index.ts`：

- `:353-355` 把 `PUT /api/advanced-chat/memories/:id` 绑定到 `save(s, id)`；
- `save()` 在 `:309` 直接 `const id = memoryId ?? randomUUID()`，**PUT 分支不校验该 id 是否存在或属于当前用户**；
- `:316-318` 用 `path.join(root, String(uid), scope, `${id}.md`)` 拼路径并直接 `mkdir` + `writeFile`。
- `id` 完全来自 URL 参数，`path.join` 会规范化 `..`，因此 `PUT /api/advanced-chat/memories/..%2f..%2f..%2fpwn` 可在 `root` 之外写入最多 512KB 的任意内容。POST/PATCH 分支（`:335`、`:362`）先查库，DELETE 分支（`:528`）也用 DB 记录，只有 PUT 有这个洞。

对照：仓库自己就有正确的守卫 `file/src/index.ts:28-33`（`resolveFile` 校验 `target.startsWith(root + sep)`），记忆插件没有复用它。群组记忆反而有校验（`memory/src/index.ts:466` 的 `ownedGroup`），说明是遗漏而非设计。

#### 2.7 记忆路由前缀错误：UI 与后端对不上

- 旧代码把记忆路由注册在用户组：`old/internal/service/memory.go:124-131`（`RegisterMemoryUserRoutes(group)`，`group` 来自 `app.go:733` 的 `/api/user`）→ `/api/user/advanced-chat/memories*`。
- 新代码注册在 `/api/advanced-chat/memories*`（`memory/src/index.ts:245,260,349,353,357,409`），**少了 `/user`**。
- 前端调用的是 `/api/user/advanced-chat/memories*`（`AdvancedChatMemories.tsx:83,120,176,177,199`）。

后果：记忆页的列表/读取/新建/修改/删除全部 404；而 §2.6 的穿越端点恰好位于这个"没人用但可访问"的路径上。

#### 2.8 审计日志只写内存，重启即丢

`audit/src/index.ts:17`：`records.push({...})` 写入进程内数组，`list()` 从中切片。旧代码有 `audit.go` + `model/log_db.go`（485 行）持久化审计与请求日志，并提供查询/导出。新实现既无落库、无保留策略，也无查询接口；多实例部署下各存各的。

### 中等

#### 2.9 登出路径不匹配，服务端吊销从未执行

- 后端注册 `/auth/logout`（`auth/src/index.ts:378`）。
- 前端 axios 实例 `baseURL = "/api"`（`dashboard/frontend/lib/api.ts:89`），调用 `api.post("/auth/logout")`（`settings/frontend/pages/SettingsWorkspace.tsx:86`、`dashboard/frontend/desktop/bridges.tsx:46`）实际打到 `/api/auth/logout`。

后果：登出只清本地 token，**服务端 token 未被吊销**，`revokedTokens` 永远不会因为登出而增长；旧 token 在过期前一直可用。

#### 2.10 会话吊销集合在内存中，无界增长且不跨进程

`auth/src/index.ts:205` `const revokedTokens = new Set<string>()`，`:385-387` 加入。后果：进程重启后吊销失效；多实例/多进程不一致；集合永不清理（内存泄漏）。

#### 2.11 补全接口丢弃了绝大部分前端入参

`advanced-chat/src/routes.ts:685-719` 只映射 8 个字段（messages / session_id / model / channel_id / stream / max_tokens / temperature / reasoning_effort）。前端实际发送（`Chat.tsx:2640-2663`）：`title`、`mode`、`agent_id`、`agent_group_id`、`skill_ids`、`mcp_server_ids`、`knowledge_base_ids`、`connector_device_id`、`connector_workspace_path`、`connector_auto_approve`、`connector_approval_mode`、`connector_command_prefixes`、`auto_compress_context`、`disabled_tool_groups`。

可验证的两处具体后果：

1. `mode` 永不传入 → `advanced-chat/src/index.ts:1074` 的 `String(input.mode ?? "chat")` 恒为 `"chat"` → `completion-runtime.ts:16-21` 的 `assistantRetryAttempts`（配置为 10）形同虚设，助手模式只重试 3 次。
2. `disabledToolGroups` 永不传入 → `index.ts:1041-1044` 传 `undefined` 给 `filterToolsByDisabledGroups`，而该函数在非数组时直接返回全部工具（`tool-groups.ts:4`）→ 前端"禁用工具组"开关完全无效。

#### 2.12 `complete()` 不读取会话上的配置

`advanced-chat/src/index.ts:908-945` 载入了 session，但只用到了 `session.id` 和一个 `session.agent_id`（`:1035` 传给 context provider）。`skill_ids`、`knowledge_base_ids`、`mcp_server_ids`、`connector_device_id`、`connector_workspace_path`、`connector_approval_mode`、`disabled_tool_groups`、`auto_compress_context`、`run_mode` 全都读了不用——会话里配好的智能体/技能/知识库/MCP/连接器不会进入补全流程。

#### 2.13 智能体循环退化成单轮，且跟进请求没有超时/重试/取消

- `advanced-chat/src/index.ts:1184-1221`：工具调用只做**一次**跟进请求，且 `adapters.build()` 未传 `tools`（`:1194-1203`），跟进轮无法再调工具；`current_round` 最多被置为 1（`:1255`）。
- 旧 `advanced_chat_runs.go`（3523 行）实现的是多轮循环 + 轮次上限 + 停止条件。
- 跟进请求是裸 `fetch`（`:1205-1212`）：没有 `AbortSignal.timeout`、没有重试，上游挂起会一直占住请求。

#### 2.14 `stopRun` 无法取消在途请求，且会产生自相矛盾的状态

`advanced-chat/src/index.ts:630-658` 只把 `advanced_chat_runs.status` 改成 `cancelled` 并插一条事件。但补全是在 HTTP 请求处理器内同步 `await` 完成的（`routes.ts:699-718`），停止请求到达时上游调用仍在继续；完成时 `:1250-1261` 会把同一行改成 `completed`。前端因此可能看到 `cancelled` 后又被改回 `completed`。

#### 2.15 运行事件只有一个，`agent-work` 查询字段名写错永远查不到

- 一次补全只写一条事件：`seq: 1`、`event: "completed"`（`advanced-chat/src/index.ts:1236-1249`）。旧实现按轮次/增量/工具调用持续落事件，前端靠轮询 `/runs/:id/events` 展示进度。
- `/api/user/advanced-chat/runs/:id/agent-work`（`routes.ts:757-775`）过滤 `event.event_type` 或 `event.type`，但 `advanced_chat_run_events` 的列名是 `event`（`tables.ts:104`；写入见 `index.ts:1241`）→ 该接口**恒返回空数组**。

#### 2.16 调度器：超时列是死列、无重入保护、串行阻塞、自动执行不写运行历史

- `timeout_seconds` 只在 `scheduler/src/tables.ts:24` 声明，全仓库无第二处引用 → 任务可永久挂起。
- `scheduler/src/index.ts:77-143`：`dispatchDue` 是 `for` + `await` 的串行循环，一个挂起任务阻塞其后所有任务；`ctx.setInterval(() => void dispatchDue(), 30_000)`（`:143`）**没有重入标志**，两次 tick 可能并发执行同一批任务（并发判定依赖前一 tick 已落库的 `last_status`）。
- `scheduled_task_runs` 只在**手动**运行路由里写入（`:272`、`:294`），自动 `dispatchDue` 从不写 → `GET /scheduled-tasks/:id/runs`（`:312-330`）对自动执行没有记录。且手动记录里 `duration_ms` 硬编码为 0（`:278`），尽管 `startedAt` 已采集。
- `dispatchDue` 调用 `chat.complete()` 时不传 `sessionId`（`:99-104`），而 `complete()` 在无 sessionId 时会**新建会话**（`advanced-chat/src/index.ts:913-938`）→ 任务表里的 `session_mode`/`session_id`/`auto_delete_session` 三列（`advanced-chat/src/types.ts:24`）全部被忽略，每次执行都产生一个新会话。

#### 2.17 base_url 尾斜杠清理正则写错，会拼出双斜杠 URL

`advanced-chat/src/index.ts:1072` 与 `:1206`：

```ts
`${String(channel.base_url).replace(/\\\/$/, "")}${request.urlPath}`
```

该正则匹配的是**字面量 `\/`**（反斜杠+斜杠）结尾，而不是单个尾斜杠。仓库其它三处都写对了：`channel-admin/src/index.ts:60`、`knowledge/src/index.ts:78`、`service/src/index.ts:198` 均为 `replace(/\/$/, "")`。后果：渠道 `base_url` 以 `/` 结尾时（管理端健康检查与同步都会主动去掉尾斜杠，说明这是常见配置），补全会请求 `https://host//v1/chat/completions`。

#### 2.18 连接器接口有两份实现，其中一份是死代码

- `advanced-chat/src/routes.ts:1204-1262` 注册 `/api/advanced-chat/connectors/{register,heartbeat,tasks/next,tasks/:id/result}`（委托 `service.*`）；`connector/src/index.ts:391-436` 注册**同名同法**的四个端点，另有设备/凭据/MCP 等重复注册。
- `@velocelab/connector` **不在 `yumeri.json` 中**，因此 `packages/connector`（1754 行 + 前端）当前完全不加载；生效的是 advanced-chat 内的那份。
- 两份实现语义不完全一致（例如 `tasks/next` 都把任务置 `running`：`connector/src/index.ts:422-431` 与 `advanced-chat/src/index.ts:875`，但参数校验与错误码写法不同），后续必然漂移。

#### 2.19 模型/渠道选择会退化为"任意可用渠道"

`advanced-chat/src/index.ts:979-997`：先按 `upstream_model_name === modelName` 在 `model_configs` 里找匹配项；找不到时 `channel = requestedChannel.find(row => row.enabled)` —— **任意一个启用的渠道**都会被选中，然后 `upstreamModel` 回退成用户请求的模型名（`:998`）。也就是说请求了 A 模型却可能被发到只支持 B 模型的渠道，旧代码的模型-渠道匹配与失败转移逻辑（`proxy.go`）不在这里。

### 轻微 / 一致性

- **`/health` 缺失**：旧 `app.go:102-104` 提供健康检查，新代码没有；`/favicon.svg`、`/icons.svg` 同样缺失（`app.go:823-824`）。
- **`packages/middleware` 是空包**：只有 `dist/index.js`（22 行）与 `.d.ts`，没有 `src`，且全仓库无人 import。
- **`packages/ratelimit` 无人 import**：配置项在 `yumeri.json:43-46` 存在（60 次/分、burst 10），但没有任何请求路径使用它。
- **`@velocelab/billing` 仅被 `channel-admin` 以一个类型导入**（`channel-admin/src/index.ts:3` `import type { TokenLog }`），没有任何计费调用点 → `advanced_chat_runs.cost` 永远是 `"0"`（`advanced-chat/src/index.ts:971`），token 用量只写进消息行（`:1230-1231`）不做结算，旧 `proxy.go` 的计费钩子（`price_tier.go`、`video_billing.go`、`cache/billing.go`）全部失效。
- **`yumeri.json` 未启用已实现的插件**：`skill`、`mcp`、`connector`、`uptime`、`delivery` 都不在配置里，这些包（合计约 4000 行 + 前端，且 `MIGRATION_STATUS.md` 声称已迁移）当前不可达；同时 `~@velocelab/auth` 被禁用（第 23 行 `~` 前缀），后端处于完全开放状态——此时记忆、连接器等按 `session.properties.user` 取用户的接口会因为 `user()` 返回 0 而静默不响应（例如 `memory/src/index.ts:289` `if (!uid) return`，**既不报错也不回包**）。
- **静默失败模式普遍**：大量 action 以 `if (!user?.id) return;` 开头（`routes.ts:689,725,762,781` 等、`channel/src/index.ts:271,285,302`），未认证时既不设状态码也不响应，调用方只能等到超时；这与旧代码统一返回 `401 {"error":"Unauthorized"}` 的行为不同。

---

## 三、建议的修复顺序

1. **让聊天跑起来**（§2.2 适配器未加载、§2.1 SSE 协议不一致、§2.3 主键覆盖）——这三项决定了核心功能是否可用。
2. **安全项**（§2.6 记忆路径穿越、§2.9 登出未吊销、§2.10 内存吊销集合、§2.4 空条件整表写、§2.19 渠道误选）。
3. **数据一致性**（§2.5 事务、§2.3 主键、§2.15 事件列名、§2.16 调度器运行历史/超时）。
4. **补齐断链**（§1.3 的 64 个前端→后端断点，优先 `/user/catalog`、`/api/settings`、`/community/*`）。
5. **按 `MIGRATION_ROADMAP.md` 补齐整块缺失域**（§1.1），或明确从产品中移除对应前端入口——目前前端仍在调用，用户看到的是坏页面而不是隐藏入口。

---

## 四、对既有文档的更正

- `MIGRATION_STATUS.md:17` 声称 "cache, rate limiting, file storage, MCP, skills, uptime and OOBE" 已迁移：其中 **rate limiting 未被任何代码引用**，**MCP/skills/uptime 未在 `yumeri.json` 启用**，**OOBE（首次运行向导）没有后端路由**。
- `MIGRATION_STATUS.md:74-77` 把 `/api/settings` 列为唯一"已知缺口"，但机读比对显示同类断链共 64 处。
- `MIGRATION_ROADMAP.md:94` 要求"从 `service` 移除重复的模型同步路由"：`packages/service/src/index.ts:186,229,253` 仍在注册 `/api/models/sync/preview|preview/browser|apply`，且 `MIGRATION_STATUS.md:42-44` 声称这些端点已归 `@velocelab/model-catalog` 所有——`model-catalog` 实际只注册了 `GET /api/models`（`model-catalog/src/index.ts:19`）。这是文档与代码的直接矛盾。

---

## 五、复现方法

分析脚本与中间产物在 `.dsh-tmp/`（只读比对，未改动任何产品代码）：

| 文件 | 作用 |
| --- | --- |
| `extract-old-routes.ps1` → `old-routes.csv` | 从 Go 源码抽取 350 条路由，按 `app.go` 的 group 前缀（`/api`、`/api/user`、`/auth`）与路由钩子函数名还原完整路径 |
| `extract-new-routes.ps1` → `new-routes.csv` | 抽取 176 条 TS 路由声明（`ctx.route(...).methods(...)`），并展开动态路由循环 |
| `diff-routes.ps1` → `missing-routes.csv` | 参数名归一化后比对，输出 158 条缺失端点 |
| `check-frontend-calls.ps1` → `frontend-calls-without-route.csv` | 抽取 259 处前端调用（`api.get/post/...` 按 `baseURL="/api"` 解析，含 `fetch("/api/...")`）并与后端路由表比对，输出 84 处断链 |

`node:sqlite` 行为验证（§2.3）：

```
node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(':memory:');
db.exec('CREATE TABLE t (id TEXT PRIMARY KEY, name TEXT)');
const r=db.prepare('INSERT INTO t (id,name) VALUES (?,?)').run('acm-abc-123','x');
console.log(r.lastInsertRowid, r.lastInsertRowid===undefined);"
→ 1 false
```

---

## 六、本轮已修复

范围说明：按指示只动代码，不动 `yumeri.json` 等配置；**计费不处理**（§2.17 的 `cost`/结算缺口仍在）；`web/` 视为废弃目录，未改动；React 页面按插件改动，本次未改任何前端文件。

| 编号 | 问题 | 修复位置与做法 |
| --- | --- | --- |
| §2.2 | 适配器未加载 | **未处理**（属配置项，按指示跳过） |
| §2.1 | SSE 协议不一致 | 新增 `packages/advanced-chat/src/stream.ts`（`openChatStream`：自己写 `text/event-stream` 响应头、镜像 CORS、置 `session.responseHandled`，客户端断开时 abort 上游）；`routes.ts` completions 路由在 `stream: true` 时按 `text/event-stream` 作答并转发事件；`complete()` 通过 `hooks.onEvent` 依次发出 `status`/`text`/`tool_call`/`done`/`error`，字段与 `Chat.tsx` 的 `parseSSEEvent`、`normalizeToolCalls`、`normalizeContentParts` 一致 |
| §2.3 | `create()` 用 rowid 覆盖字符串主键 | `database-core/src/index.ts` 的 `create()`：调用方给了 `id` 就直接返回 `{...data}`，driver 的 `insertId` 只作兜底 |
| §2.4 | `update`/`remove` 空条件整表写 | `where()` 增加 `strict` 参数（写操作传 `true`，`undefined` 过滤值直接报错，读操作保持宽松以便可选过滤继续可用）；`update()` 无赋值或无过滤即抛错，SQL 一律带 `WHERE`；`remove()` 无过滤即抛错 |
| §2.6 | 记忆路径穿越 | `memory/src/index.ts` 新增 `assertSafeId`/`memoryPath`（拒绝 `..`、分隔符、超长 id，并做根目录包含校验），个人记忆、分组记忆、`memory_upsert` 工具全部改走该校验；同时把写文件挪到 `existing` 查询之后，避免"先落盘再校验" |
| §2.7 | 记忆 UI 路由前缀不匹配 | `memory` 的 6 条个人记忆路由由 `/api/advanced-chat/memories*` 改回 `/api/user/advanced-chat/memories*`，与 `AdvancedChatMemories.tsx` 的调用一致 |
| §2.9 | 登出路径不匹配（前端 `/api/auth/logout` vs 后端 `/auth/logout`） | `auth/src/index.ts` 两条路径都注册同一个 `logout`，并把 `/api/auth/logout` 加入免鉴权白名单 |
| §2.10 | 吊销集合只在内存、无上限 | 新增 `auth/src/tables.ts` 的 `auth_revoked_tokens`（按 token 哈希存储、带 `expires_at`），`revokeToken`/`isRevoked` 走数据库，内存只作有上限的命中缓存，每小时清理过期行 |
| §2.11 | `disabled_tool_groups` 到不了过滤逻辑 | completions 路由补齐全部字段映射（`disabled_tool_groups`、`skill_ids`、`mcp_server_ids`、`knowledge_base_ids`、`agent_id`、`agent_group_id`、`mode`、`connector_*`、`auto_compress_context`、`title`），`complete()` 统一解析后再调用 `filterToolsByDisabledGroups`；前端分组键（`workspace/web/tasks/ask_user/memory`）与 `tool-groups.ts` 一致，开关现在真正生效 |
| §2.12 | 智能体/技能/知识库/MCP 未接入 | `complete()` 解析 `agent_id`（按 `stable_id`）取 `prompt`/`default_model`/`user_channel_id`/技能等默认值，请求 > 会话 > 智能体三层回退，并写回会话行；上下文提供者新增 `skillIds`/`knowledgeBaseIds`/`mcpServerIds`/`mode` 入参，`skill` 与 `mcp` 的 provider 按选择收窄（选中技能时注入其正文）；工具执行上下文带上同一组选择 |
| §2.13 | 仅一轮工具调用、后续请求无工具/无超时/无重试 | 工具循环改成有界多轮（`chat` 8 轮、`assistant`/`agent_group` 20 轮，对齐旧 `advancedChatCompletionMaxToolRounds`），每轮都走 `fetchCompletionWithRetry`（带工具、超时、重试、取消信号），每轮写 `tool_round` 运行事件并推送 `tool_call` 事件 |
| §2.14 | `stopRun` 只改数据库 | `in-flight` 运行注册表（`Map<runId, AbortController>`）：`stopRun` 先 abort 上游请求再落状态；完成路径在收尾前检查取消，不会把 `cancelled` 覆盖回 `completed`；`markCancelled` 只在真正改到行时才写事件，避免与 `stopRun` 的 `seq=999999` 事件撞唯一索引 |
| §2.15 | `/runs/:id/agent-work` 用错列名、返回类型也不对 | 该端点按契约返回 `{run_id, session_id, group_id, group_name, agents, connector_tasks}`（原实现返回数组，前端 `normalizeAgentWorkResponse` 直接丢弃）；子智能体取 `agent_task` 事件，运行自身的工具轮次作为主智能体消息附上 |
| §2.19 | 渠道选择退化为"任意可用渠道" | `complete()` 中，调用方指定了渠道却匹配不到模型时不再回退到无关渠道，而是报错说明没有渠道提供该模型 |
| §2.18 | 连接器两套实现 | **已处理**，见 §7.1（`connector` 拥有该端点面，`advanced-chat` 的 6 条重复注册已删除） |
| 轻微项 | `packages/ratelimit` 无人引用 | 重写 `ratelimit/src/index.ts` 为**外置可选插件**：`depend` 为空、用 `ctx.use` 装全局中间件（按身份/来源 IP 单桶计数，429 + `Retry-After`/`X-RateLimit-*`，静态资源不计费，登录注册另有 10 次/分的独立预算），并通过可选的 `ratelimit` 组件暴露 `allow`/`enforce`/`allowUserChannel` 供其他插件按需调用；未启用时完全不生效 |

验证（可复现，均在本次会话执行；两个 `.mjs` 脚本读取 `packages/*/dist`，先按包 `tsc -p tsconfig.json` 构建即可运行）：

| 命令 | 结果 |
| --- | --- |
| `npx tsc -p packages/{database-core,advanced-chat,auth,memory,ratelimit,skill,mcp}/tsconfig.json` | 全部 exit 0 |
| `node .dsh-tmp/sse-contract.mjs` | SSE 字节流用前端同一套分帧/解析逻辑还原为 `status,text,tool_call,done` 四帧，响应头与 `responseHandled` 断言全部通过 |
| `node .dsh-tmp/persistence-contract.mjs` | 显式 `id` 不再被 rowid 覆盖、`update`/`remove` 拒绝空条件与 `undefined` 过滤值、读操作仍忽略可选过滤、`$gt`/`$lte` 与 `upsert` 语义符合吊销表需要 |

已知未处理（不在本次指示范围）：计费/结算、`web/` 目录、Agent Studio 的多智能体编排本体（`agent-work` 只做了契约与数据来源修正）、§1.x 的整块缺失域与 64 处前端断链。

## §7 第二轮：启用功能性插件所暴露的问题

第二轮按指示启用「全部适配器 + 除认证外的功能性插件」。启用本身把两类此前的隐藏问题变成了必须处理的问题：路由表的覆盖语义，以及「没人跑过」的那份实现。

### 7.1 路由表按路径覆盖，两份连接器实现只剩一份能活（§2.18）

`core.js:206` 是 `this.routes[path] = route`，`context.js:174` 又对**已存在的路径直接复用** Route 对象（注释说明这是为了让 GET/POST 分开声明）。因此跨插件重名不会报错，只是**后注册者覆盖前者的同名方法处理器**——静默地。

机读比对（`.dsh-tmp/` 脚本）在两轮之间给出：第一轮 49 条重名、其中 6 条是跨包真重名，全在 `advanced-chat` 与 `connector` 之间；处理后跨包重名为 **0**：

| 端点 | 处理 |
| --- | --- |
| `GET /api/user/advanced-chat/devices` | 保留 `connector`（等价实现，且 `token_hash` 同样被剥离） |
| `POST /api/user/advanced-chat/devices/token` | 保留 `connector`（等价，另外返回 201） |
| `POST /api/advanced-chat/connectors/register` | 保留 `connector`，补上 `name` 更新语义 |
| `POST /api/advanced-chat/connectors/heartbeat` | 保留 `connector`（两者都会对无效 token 回 401，行为一致） |
| `GET /api/advanced-chat/connectors/tasks/next` | 保留 `connector`，**修掉它的两个缺陷**（见下） |
| `POST /api/advanced-chat/connectors/tasks/:id/result` | 保留 `connector`（比原实现多了 device/task 归属校验与 404），补 `running` 前置条件 |

`tasks/next` 的两个缺陷是这次启用才会暴露的真 bug：

- 它查询 `status: "approved"`，而**全仓库没有任何代码写入 `approved`**：任务由 `chat.createConnectorTask`（`mcp` 的工具会调用）写成 `queued`。也就是说这份实现永远不会派发任务。现改为 `queued`，并按 `created_at` 取最旧的一条（`select` 没有 ORDER BY）保证先入先出。
- 领取任务是无条件 `update`，两个并发长轮询会拿到同一个任务；现改为带 `status: "queued"` 前置条件的条件更新，只有把 `queued` 翻成 `running` 的那一次才把任务交出去。
- `tasks/:id/result` 原本不校验任务状态，迟到的或重复的报告能把已完成的任务再翻一次；现要求 `status: "running"`，并用 `{ ok: true, ignored }` 保持与设备端兼容。

`advanced-chat` 的 service 方法（`createConnector`/`heartbeatConnector`/`nextConnectorTask`/`completeConnectorTask`）保留：它们是组件 API，`mcp` 通过 `chat.createConnectorTask` 建任务，`workspace`/`inner-tools` 通过 `component.connector` 取运行时；删掉的只是重复的 HTTP 注册。

### 7.2 工具名重复：`ask_user` 会被注册两次

`registerTool` 只做 `tools.push`，不去重；`toolPayload` 也不去重。`inner-tools` 原本也注册一个 `ask_user`，与 `advanced-chat` 内置的 `ask-user.ts` 同名——启用后每个请求都会带两个同名 function（多数上游会直接以 `Duplicate function name` 拒绝），且内置那份才拥有「问一句、结束本轮、等用户回复」的语义。已从 `inner-tools` 移除该条目。

注意：`inner-tools` 其余 10 个工具走 `connector.execute(...)`，而**本仓库没有任何插件注册 `ConnectorHandler`**（`connector` 的 `handlers` 数组因此为空，`execute` 会抛 `No connector runtime is enabled`）。这些工具在接上运行时之前都是空转，测完后如果发现模型反复调用它们，可以先把 `@velocelab/inner-tools` 关掉。

### 7.3 工作室点了会进到 `/chat/agent-groups/*/operations`

`dashboard/frontend/extension.tsx:38` 用 `page.path` 原样生成导航链接，而 `page.path` 是**路由模式**：`/chat/agent-groups/*` 被当作链接目标写进地址栏，页面内层的 `<Route path=":groupID">` 就把字面量 `*` 读成一个工作室的 id，再被 `element={<Navigate to="operations" replace />}` 拼成 `/chat/agent-groups/*/operations`。

改为由静态前缀生成链接（`navPath()`：从尾部剥掉 `*` 与 `:param`），落在 `index` 路由所在的 `/chat/agent-groups`；受影响的还有 `community` 的 `/chat/community/*`。`.dsh-tmp/nav-path-check.mjs` 直接抽取该函数的源码运行断言。浏览器的活跃态不受影响：`bestPathMatch` 的 `*` 分支本来就把「空剩余段」算作匹配，现在走的是前缀匹配。

顺带记录一个坑：各包的 `tsconfig.json` 只 `include: ["src"]`，`frontend/` **完全不参与类型检查**，唯一把关的是 vite 构建。而块注释里只要出现 ``*/`` 这组字符（例如在注释中写 `/chat/agent-groups/*/` 后接 `operations`）就会提前闭合注释，把后面的说明文字变成代码，直到文件末尾才报 `Unterminated template literal`。改前端文件时用 `npx tsc --noEmit --jsx react-jsx <file>` 单独过一遍能立刻发现这类解析错误。

### 7.4 配置启用结果与验证

`yumeri.json`：启用 45 个（原 24 个 + 14 个适配器 + `connector`/`skill`/`mcp`/`delivery`/`uptime`/`tools`/`inner-tools`），仅保留 `~@velocelab/auth` 禁用。`mysql`/`pgsql` 未启用：它们与 `sqlite` 都 `provide: ["database"]`，同时启用是组件冲突而不是能力叠加。`ratelimit` 的预算从 60/分提到 600/分（burst 100）：中间件在上一轮之前从未生效，而聊天页会按秒轮询，60/分 会让试用期直接吃 429。

验证：

| 命令/操作 | 结果 |
| --- | --- |
| `NODE_ENV=production node node_modules/yumeri/bin.js start`（临时端口 3311） | **45 个启用项全部 apply 成功**，无 `Failed to load plugin`、无依赖缺失、无组件重名 |
| `GET /api/dashboard/manifest` | 200，19 个插件前端注册（含新启用的 connector/skill/mcp/delivery/uptime/memory/scheduler/workspace；`tools`/`inner-tools` 无前端，按预期不出现） |
| `GET /api/advanced-chat/connectors/tasks/next`（无 token） | **401**（由 `connector` 处理并校验 token），证明重复注册已消除 |
| `.dsh-tmp/extract-new-routes.ps1` + 比对 | 跨包重名路径 0 条；同形状（`:param` 归一化后）异字面量路径 0 条 |
| `node .dsh-tmp/nav-path-check.mjs` | 8 条断言通过，`/chat/agent-groups/*` → `/chat/agent-groups` |

开发模式（`yarn dev`）在本会话的沙箱内无法验证：`@hirarijs/loader-ts` 依赖 esbuild，而沙箱禁止 esbuild 启动它的 service 子进程（`spawn EPERM`，与 `yarn workspaces` 同一处边界）。生产模式走 `dist/`，不需要 esbuild，因此以上验证是在生产模式下取得的。**正在 3000 端口上的那个进程是旧配置**（其 manifest 只注册了 10 个插件前端），需要重启才能加载新配置。

## 8. 未开 auth 时的默认用户（id 0）

### 8.1 默认用户不是管理员

`user` 插件在 `@velocelab/auth` 未启用时把每个请求都当成内置的默认用户，但那个对象是 `{ id: 0, is_admin: false }`。而全仓库的管理员判定都是 `session.properties.user?.is_admin`，于是所有管理员端点（`channel-admin` 的 12 条、`model-catalog`、`uptime`、`service`）在未开 auth 时一律走 `if (!admin(session)) return;`：**返回 200 空 body**。

前端拿到空 body 后解析失败（不是 `[]`，是"没有响应体"），`/api/channel-adapters` 的类型集合为空，`providerTypes ∩ ∅ = ∅`，于是"上级渠道类型"下拉框是空的 —— 启用适配器插件是必要条件，但不充分。

改为 `defaultUser = { id: 0, is_admin: true }`（同时把 `guestUser` 改名为 `defaultUser`，并写明它为什么是管理员：否则渠道/模型/供应商这些必须由管理员配置的东西根本无法配置）。`id: 0` 落在任何真实行之外（SQLite 自增从 1 开始），默认用户的数据天然隔离。

### 8.2 `id: 0` 被全仓库的 `if (!id)` 当成"没有用户"

默认用户被修成管理员后，管理员端点通了（`/api/channel-adapters` 返回 26 个类型），但**用户自己的端点全部返回 200 空 body**：`/api/user/advanced-chat/{sessions,agents,memories,workspaces,devices,skills,mcp-servers,chat-groups,scheduled-tasks,deliveries}`、`/api/user/message-channels` 等，一个不剩。

原因是各包的会话用户取值helper把"没有会话用户"和"默认用户 id 0"混成了同一个值：

| 形状 | 文件 | 问题 |
| --- | --- | --- |
| `Number((s.properties.user as any)?.id ?? 0)` | connector, memory, delivery, skill, mcp, scheduler, files.ts | 没有用户时返回 `0`，与默认用户无法区分 |
| `(s.properties.user as any)?.id as number \| undefined` | knowledge, workspace | 类型已是 `number \| undefined`，但守卫仍用真值判断 |
| `session.properties.user as {...} \| undefined`（对象） | advanced-chat/routes.ts, channel | 守卫 `if (!current?.id) return;` / `if (current?.id)` 用真值判断 |

统一改成"**判断有无用户**，而不是判断 id 是否为真"：

- 数值helper一律收敛为 `(s.properties.user as { id?: number } | undefined)?.id`（`number | undefined`），与 knowledge/workspace 原有写法一致；
- 守卫改为 `if (id === undefined) return;` / `if (current?.id === undefined) return;` / `if (current?.id !== undefined)`，三元条件同样显式比较（`const row = id !== undefined ? await ... : undefined`，保持分支顺序不变）；
- `advanced-chat` 的 `createAgent/createConnector/createScheduledTask` 里的 `if (!userId || ...)` 也一并改掉 —— 否则默认用户建智能体会得到 "agent name is required" 这种误导性报错；
- 保留 `if (!id || id.length > 120)`（knowledge/skill 的社区 id 是字符串，空串本就非法）、`assertSafeId`（memory 的 id 是路径片段）以及 `/api/user/*` cookie 解析里的 `if (!id)`（无 cookie 与 `userid=0` 都应落到默认用户）。

共 130 处（`.dsh-tmp/fix-user-id-guards.ps1`，逐条精确字面量替换 + 计数；其余 4 处单独修改）。`ratelimit.allowUserChannel` 的 `!userId` 未改：它目前没有任何调用方，改动会引入"匿名请求消耗默认用户配额"的新语义，留待有调用方时再定。

### 8.3 验证（未开 auth，无 cookie，端口 3311，生产模式）

| 检查 | 结果 |
| --- | --- |
| `GET /api/user/me` | `{"id":0,"is_admin":true}` |
| `GET /api/channel-adapters` | 200，26 个适配器类型（此前空 body） |
| `GET /api/channels` / `/api/channel-usage` | `[]` / `{"upstream_channels":[]}`（此前空 body） |
| 22 个用户/管理端点全量探测 | **22/22 返回数据**（改前：8 个全空，改后仅剩 sessions/agents/chat-groups/settings 为空，补上正向真值守卫后也恢复） |
| 默认用户写-读-删往返 | `POST /api/user/advanced-chat/agents` → 201 且 `user_id: 0`；`GET` 读回同一条；`DELETE` 后 `[]`（会话同样）——证明 id 0 可写可查，不是只读空集 |
| 11 个受改包 `tsc -p` | 全部 exit 0 |
| `sse-contract.mjs` / `persistence-contract.mjs` / `nav-path-check.mjs` | 全部通过 |
| 路由表同路径同方法重复 | 0 条；跨包重名 0 条 |

**注意**：正在 3000 端口上跑的进程是改动前起的，需要重启才会加载新的 `dist/`。

## 9. 从上级同步模型列表

### 9.1 前端有界面，后端没有端点

渠道页每个渠道的"模型配置"对话框（`ListTree` 按钮）里已经有完整的同步流程：选同步格式 → "同步模型" → 勾选预览结果 → "提交同步"，失败时还会打开"浏览器抓取"兜底对话框。它调用三个端点：

| 调用 | 期望 |
| --- | --- |
| `POST /api/models/sync/preview` | `{channel_id, format, path}` → `{channel_id, channel_name, source, models:[{model_name, provider, provider_name, provider_icon_url, exists}]}` |
| `POST /api/models/sync/preview/browser` | `{channel_id, source, payload}`（payload 是浏览器自己抓到的 JSON） |
| `POST /api/models/sync/apply` | `{channel_id, models}` → `{results:[{created, updated, …}]}` |

这三个路径在任何插件里都没有实现，所以按钮必然失败；而失败又会打开兜底对话框，那里同样 404。`service` 插件里其实有一段三路由的实现，但它躺在 185 行的块注释里（前面还有一句无条件 `return;`），从未执行，而且比这里需要的弱得多（只抓一个路径、不识别 new-api 的 `{model_name}` 形状、不做 HTML 嗅探、不做供应商推断、`created` 计的是目录行而不是渠道绑定）。它的注释还写着同步归 `model-catalog` 管，但 `model-catalog` 只有 `GET /api/models`。

### 9.2 实现

新增 `packages/channel-admin/src/sync.ts`（与 `channels`/`model_configs` 同包，前端也在这一包），从 `old/internal/service/sync.go` 与 `providers.go` 移植：

- **同步格式**与对话框的选项一一对应：`auto`（依次试 `/v1/models` → `/models` → `/api/models`，哪条先返回模型用哪条）、`openai_models`、`generic_models`、`api_models`、`custom`（自定义路径，绝对 URL 会被剥成路径）。显式格式只打一条路径，不再兜底；`auto` 失败时把每条路径的失败原因串起来返回。
- **模型名解析**覆盖上游真实的几种形状：OpenAI `{data:[{id}]}`、new-api `/api/models` 与 `/api/pricing` 的 `{data:[{model_name}]}`、new-api 以模型名为键的 `{data:{"gpt-4o":{…}}}`、one-api 的 `{model_ratio:{"gpt-4o":15}}`、纯字符串数组、`{models:[…]}`/`{items:[…]}`。键为模型名的映射与载荷元数据（`model_ratio`、`count`、`success` 等）区分开，纯数字的 `id` 不当模型名（`{id:1, model_name:"x"}` 取 `x`）。
- **供应商推断**移植 `providers.go` 的 40 个预设与按模型名的有序匹配规则，返回的 `provider` id 与前端 `providerPresets` 对得上，前端据此显示名称与图标；显式 provider 优先，未知 provider 保留原样。
- **应用语义**：先按 `model_name` 找/建目录行（已存在时只补空的 provider/图标，不覆盖手工设置），再按 `(channel_id, model_id)` upsert 渠道绑定（`upstream_model_name` + `enabled`），因此重复同步幂等：首次 `created:4`，再次 `created:0, updated:4`。
- **路由**在 `channel-admin` 注册，与其余 12 条渠道路由一样用 `if (!admin(session)) return;` 把关；格式非法/自定义缺路径/未选模型 → 400，渠道不存在 → 404，上游不可达 → 502（带 `GET <url> failed/returned status/HTML instead of JSON` 详情，正是兜底对话框要展示的东西）。
- **出站防护**：目标地址由操作者填写而由服务端请求，因此拒绝非 http(s)、回环、link-local 与元数据主机（仓库里 `delivery` 的 webhook 校验是同一风格）。与本机/内网上游中转站同机部署是真实场景，所以 `VELOCELAB_ALLOW_PRIVATE_UPSTREAM=1` 可以放行——集成测试也是靠它连本地假上游。

同时删掉 `service` 里那 149 行死代码，留一行指向新位置。

### 9.3 顺带修掉的工具缺陷

`.dsh-tmp/extract-new-routes.ps1` 是纯正则扫描，会把**注释里的**路由当成活路由：这次它把 `service` 注释块里的三条报成与 `channel-admin` 重复（上一轮 `ask_user` 的"重复"也是同一类误报）。现在扫描前先把块注释与行注释按字符数替换成空白（保持行号不变），路由总数从 172 降到 169，重复数为 0。

### 9.4 验证

| 检查 | 结果 |
| --- | --- |
| `.dsh-tmp/models-sync-unit.mjs`（对 `dist/sync.js` 直接跑） | **52 项全过**：12 种载荷形状、18 条供应商推断、目标/URL/路径规范化、回环拦截、正常抓取、HTML 与 404 失败、auto 逐源报错 |
| `.dsh-tmp/models-sync-e2e.mjs`（真服务器 + 真数据库 + 本地假上游） | **35 项全过**：预览（名字/供应商/图标/排序/剔除纯数字 id）→ 应用 `created:4` → 渠道绑定 4 条 → 再预览 `exists:true` → 再应用 `created:0,updated:4` 且无重复绑定 → 浏览器载荷路径（new-api pricing 形状）再加 2 条 → 400/404/502 各条失败路径 |
| 测试后数据清理 | 目录行删除 6 条、绑定与测试渠道全部删除；跑完 `models=0 model_configs=0 channels=1`（剩下那条是用户自己在浏览器里建的 `111`） |
| 全包 `tsc -p` | 42 个包全部 exit 0 |
| `sse-contract` / `persistence-contract` / `nav-path-check` | 全部通过 |
| 路由表 | 同路径同方法重复 0、跨包重名 0；`/api/models/sync/*` 仅 `channel-admin` 注册 |
| 生产模式启动日志 | 无 `Failed to load plugin` |

单元测试在实现过程中抓到一个真问题：`{data:{model_ratio:{"qwen-max":2}}}` 曾经把映射本身的键名 `model_ratio` 当成模型名收进来（"键为模型名的映射"判定没有排除元数据键），现在会先排除元数据键再采信键名。

**注意**：3000 端口上正在跑的进程仍是改动前起的，重启后新的 `dist/` 与这三个端点才生效。

## 10. 会话文件夹 404 与聊天页无限重渲染

浏览器控制台报的两个错其实是一件事的两半：`GET /api/user/advanced-chat/sessions/folders` 一直 404（计数 2 → 6 → 13 地刷），并伴随 React 的 "Maximum update depth exceeded"。

### 10.1 404：字面量路由被参数化路由抢走

`Core.route()` 以路径为键（重复路径复用同一个 Route 并累加方法），而 `getRoute()` 是**按声明顺序返回第一个匹配的模式**，不优先字面量：

```js
getRoute(path) {
  for (const routePath in this.routes) {
    const route = this.routes[routePath];
    if (route.match(path)) return route;   // 先到先得
  }
}
```

`advanced-chat` 里 `/sessions/:id`（原 422 行起，GET/DELETE/PATCH）声明在 `/sessions/folders`（原 615/623 行）**之前**，于是 `GET /sessions/folders` 落进了参数化处理器，`id = "folders"`，查不到会话 → `404 {error:"Session not found"}`。前端"从服务端拉文件夹列表"永远失败，本地缓存那份反而成了唯一来源。`POST` 侥幸没事——`/sessions/:id` 上没有 POST 方法，所以建文件夹一直是好的，只是建完列表刷不出来。

修法是把两条 folders 路由移到第一条 `/sessions/:id` 之前，并留注释说明理由（后加路由的人很容易再把它挪回去）。参数化路由本身仍然正常：新建会话、按 id 读取、设置会话归属文件夹、不存在 id 返回 404 都逐条验证过。

### 10.2 无限重渲染：查询默认值是个新数组

```tsx
const { data: serverSessionFolders = [] } = useQuery(...)   // 每渲染一个新 []
useEffect(() => {
  if (isAdvanced) setSessionFolders(serverSessionFolders)   // 无条件 setState
}, [isAdvanced, serverSessionFolders])
```

查询没有数据（加载中或**失败**）时 `data` 是 `undefined`，解构默认值每次渲染都造一个新数组 → 依赖恒变 → effect 每渲染都跑 → 用一个新数组 setState（对象身份不同，React 无法 bail out）→ 再渲染。404 恰好保证查询永远拿不到数据，两个 bug 咬合在一起。

改成不给默认值、拿到数据才同步：

```tsx
const { data: serverSessionFolders } = useQuery(...)
useEffect(() => {
  if (isAdvanced && serverSessionFolders) setSessionFolders(serverSessionFolders)
}, [isAdvanced, serverSessionFolders])
```

这样即使查询失败也只是不更新，不会再空转。

### 10.3 两个新工具

这类"路由永远到不了"的问题在 §7、§8 都是靠人工翻代码发现的，现在做成了检查器：

- `.dsh-tmp/route-shadow-check.mjs`：按**真实插件加载顺序**（`.dsh-tmp/plugin-order.txt`，取自一次真实启动的 `core apply plugin` 日志）× 文件内行号排出路由声明顺序，用 `@yumerijs/core` 真实的 `Route` 匹配器判断每条**字面量**路径是否会被更早的模式抢走。当前 169 条路由、0 条不可达。它同时也是这次修复的回归门禁：把 folders 路由挪回 `:id` 之后会立刻报出来。
- `.dsh-tmp/unstable-default-check.mjs`：扫 `data: x = []`/`= {}` 这类默认值，找出"依赖它 + 无条件 setState"的 effect。本仓库 125 个前端文件里命中 7 处，除本次修掉的那处外，其余 5 处逐个人工复核为安全（有的被 `isFetched` 门住，有的 set 的是字符串所以同值会 bail out），复核理由写在脚本内的 `reviewed` 表里，避免下次又当新问题重报。

### 10.4 验证

| 检查 | 结果 |
| --- | --- |
| `.dsh-tmp/chat-folders-e2e.mjs`（真服务器 + 真库） | **14 项全过**：列表 200 且等于表内行数、建文件夹 201 且 `id` 为字符串（`SessionFolder.id: string`）、新文件夹出现在列表、建会话、设置会话归属、按 id 读回、未知 id 仍 404 "Session not found"；跑完 folders 0 → 0、无残留会话 |
| `route-shadow-check` | 修复前报 1 条（`GET /sessions/folders` 被 `/sessions/:id` 抢走），修复后 0 条 |
| `unstable-default-check` | 0 条未复核风险、5 处已复核安全 |
| 全包 `tsc` + `advanced-chat` 前端 `vite build` | 通过（前端 TSX 只有 vite 这一道门禁：包的 `tsconfig.json` 只 `include: ["src"]`） |
| 三份契约 + 路由表 | 全部通过；169 条路由无同路径同方法重复 |

**要生效需要重启 3000 端口的服务**：后端路由顺序在 `dist/routes.js`，前端已在 `packages/advanced-chat/dist/frontend/advanced-chat.js` 重新构建（用旧包的浏览器建议硬刷新一次）。

## 11. "渠道里有模型，聊天里选不到"：目录端点缺失 + 运行链路四个 bug

现象是渠道页看得到模型，聊天页的模型下拉是空的。查下来不是一个 bug，是一串：模型列表的来源端点根本没实现，而它下游的运行链路还有三个移植错误加一个漏声明的依赖。

### 11.1 模型列表的来源端点不存在

聊天页（以及 Agents、AgentEditor）的模型下拉来自 `GET /api/user/catalog`：

```tsx
const modelOptions = useMemo(() => uniqueModels(catalog), [catalog])   // 所有渠道模型的并集
const channelModelOptions = selectedUserChannel ? selectedUserChannel.models : modelOptions
```

期望的形状是**渠道数组**，每个渠道带它可服务的模型名：`[{id, name, enabled, models, model_icons, video_billing_configs}]`。新后端里这个路径**任何插件都没注册**（全库 `/api/user/*` 路由里只有 message-channels 这类无关端点），所以请求 404，`catalog` 空数组，下拉自然空——而渠道页是直接读 `channels`/`model_configs` 的，所以那边看得到模型。

旧后端在 `old/internal/app/app.go:738` 注册了它，处理函数是 `ChannelAPI.Catalog`（`old/internal/api/admin.go:3938`）：取**启用**的渠道（按名字排序），再取其**启用**的 `model_configs` 所指向的、**启用**的目录模型，汇成去重排序后的模型名集合，并附带 `model_icons`（模型图标）与 `video_billing_configs`。已在 `packages/channel-admin`（与 `channels`/`model_configs` 同包）按此实现，为面向用户的接口（登录即可读，不做管理员门禁）。

两个刻意的取舍：`video_billing_configs` 恒为 `{}`——新库的 `models` 表没有这一列，而视频计费配置属于计费域，本轮明确不动；三个前端都只读 `id`/`name`/`models`，不影响显示。

### 11.2 聊天运行链路上的四个 bug

问出"选不到模型"之后紧接着就会问"为什么发不出去"，所以顺着 `executeRun` 查了一遍，四个都是真问题：

1. **少了 `adapters` 依赖**（致命）。`advanced-chat` 的 `depend = ["database", "dashboard", "file"]`，而代码里 `ctx.component.adapters` 取适配器注册表。加载器只把**声明过的**依赖注入上下文，所以拿到的是 `undefined`，每次运行都在 `adapters.build(...)` 抛 `Cannot read properties of undefined (reading 'build')`。也就是说**聊天从来没有成功发出过一次请求**，只是此前模型列表是空的，没人走到这一步。修法是把它加进 `depend`（`channel-admin` 一直有这一项，是同类的正确写法）。
2. **按错的列找渠道**。前端发的是 `channel_id: selectedUserChannel?.id`，即**渠道自己的 id**（目录返回的就是它），而后端在 `channels` 上过滤 `row.user_channel_id === userChannelId`——`user_channel_id` 是旧库"上游渠道归属某个用户渠道组"的遗留列，在当前单用户构建里没人写。结果：只要用户在下拉里选了渠道，就一个候选都找不到，直接报"没有渠道提供该模型"。旧后端的权威查询是 `serverChatCandidates`（`old/internal/service/chat_executor.go:267`）：`... WHERE channels.enabled AND model_configs.enabled AND models.enabled AND models.model_name = ?`，钉住渠道时用 `channels.id = ?`。
3. **按上游别名找模型**。旧查询匹配的是 `models.model_name`（用户在界面上看到、并原样发回来的名字），再把 `upstream_model_name` 作为真正发给上游的模型名；新代码却拿 `upstream_model_name` 去比对请求里的名字。两者相等的常见情况下侥幸能用，一旦某渠道把目录模型映射成别的上游名（sync 的自定义映射、手工改别名）就找不到绑定。
4. **无候选时挑一个不相关的渠道**。旧代码在没有候选时返回 503 "No available channel for this model"；新代码会在"调用方没钉渠道"时随便挑一个启用渠道发出去，把模型名送到从未听说过它的上游。已按旧行为改为直接报错（错误信息里带模型名和"没有启用的上游渠道提供该模型"）。

顺带把候选排序也按旧查询补上：`priority DESC, weight DESC, id ASC`（旧库的多候选还支持用户渠道组上的轮询/加权轮询，当前构建没有该概念，故选第一个）。

### 11.3 路由抛错会把 worker 打死

测试上述修复时发现：运行失败（例如 session 不存在）时不仅返回 500，**整个服务进程会退出**。原因是框架的错误处理会先写一次响应，`handleRoute` 随后又走一遍 `res.writeHead`，抛出的 `ERR_HTTP_HEADERS_SENT` 没有人接，进程直接死：

```
[E] core Unhandled error in route execution ... Error: session not found
Error [ERR_HTTP_HEADERS_SENT]: Cannot write headers after they are sent to the client
    at handleRoute (node_modules/@yumerijs/core/dist/server.js:134:21)
```

框架在 `@yumerijs/core`（依赖包，不属本仓库），所以本轮在**本仓库**能守的地方守住：`completions` 的非流式分支原来是 `session.respond(await service.complete(...))`，错误会逃到路由层；现在改为捕获后按语义回 404/400/503 + `{error}`，绝不再抛（流式分支本来就有 `try/catch` 并发 `error` 事件）。集成测试里专门加了一条"跑完各条失败路径后服务仍活着"的断言。

**仍待处理**：其它路由只要抛出未捕获的错误，同样会打死 worker（这是框架层的问题，修在 `@yumerijs/core` 或加一个兜底中间件）。本轮没有擅自新增插件，留待确认。

### 11.4 新工具：组件依赖检查

`adapters` 这类"少声明一个依赖 → 运行期 undefined → 在很远的地方崩"的问题，静态看一眼依赖列表就能发现，于是加了 `.dsh-tmp/component-dep-check.mjs`：比对每个包 `ctx.component.X`/`ctx.service.X` 用到的名字与 `depend`/`provide` 声明，顺带查出声明了却无人提供的名字（拼写错误）。当前 50 个包、31 个被提供的名字、0 问题；`user` 里 `ctx.component.auth` 是**故意的**存在性探测（未声明即为 undefined，恰好表示 auth 插件未安装），作为已复核项写在脚本里。第一版把 `guide` 注释里提到的 `ctx.component.name` 当成违规报了——又是"正则扫源码不看注释"的老问题，现已先剥离注释再扫。

### 11.5 验证

| 检查 | 结果 |
| --- | --- |
| `.dsh-tmp/user-catalog-e2e.mjs`（真服务器 + 真库） | **8 项全过**：200、数组、每个启用渠道一项、模型名与其启用绑定一致且有序、图标只覆盖本渠道模型、并集非空。真实返回：`[{"id":1,"name":"111","models":["deepseek-v4.1-flash"],"model_icons":{...deepseek.svg}}]` |
| `.dsh-tmp/chat-run-e2e.mjs`（真服务器 + 真库 + 本地假上游） | **20 项全过**：不钉渠道可发；钉目录给出的渠道 id 可发；绑定别名与目录名不同时仍按目录名解析、且上游收到的是别名；上游收到 `Bearer secret`；钉错渠道被拒且不多发请求；未绑定模型被拒；**失败路径跑完服务仍存活** |
| 网关错误信息 | 失败时返回 `{error:"no enabled upstream channel serves model dsh-not-bound"}` 一类可读信息，而不是 500 空响应或进程退出 |
| `component-dep-check` | 修复前报 `advanced-chat` 缺 `adapters`，修复后 0 问题 |
| 全包 `tsc` / 三份契约 / 路由影子检查 / 不稳定默认值检查 | 全部通过；170 条路由无重复 |
| 测试数据 | 探针渠道、绑定、目录行、会话、运行记录全部清理，库回到 `channels=1 bindings=1 models=1`（只剩用户自己的 `111` 与其 `deepseek-v4.1-flash`） |

**要生效需要重启 3000 端口的服务**（`channel-admin` 与 `advanced-chat` 的 `dist` 都已重建）。

## 12. 模型选择改为按上级渠道分组

上一轮把模型列表的来源端点补上以后，下拉变成"所有渠道模型名的并集"，而"这个模型走哪个渠道"由旁边另一个渠道下拉单独决定。两个控件各管一半，语义上是散的：同名模型被两个渠道同时提供时，界面无从表达选了哪一个。按要求改成**按上级渠道分组选择**：分组标题是渠道名，组内是这个渠道能服务的模型，选中某个模型即同时确定它的渠道。

### 12.1 分组规则

规则本身有两条容易搞错，所以抽成了独立模块 `packages/advanced-chat/frontend/lib/model-groups.ts`（纯函数，可单测），而不是塞在 8700 行的页面里：

1. **同名模型只能出现在一个分组里**。Radix 的 `Select` 要求 item value 唯一，而页面其余部分（会话、agent、请求体）存的就是裸模型名，所以不能靠 `渠道id:模型名` 编码绕开。规则是"先到先得"：按下面的排序依次认领，已被认领的名字不再出现在后面的组里。
2. **当前选中的渠道排在最前**，因此它也是同名模型的所有者——这正好让"先在渠道下拉里选定渠道，再选模型"这条老路径仍然能选中该渠道的副本，同一个名字不会变成两个都点不到。

排序规则：选中渠道第一，其余按渠道名；没有模型的渠道整组省略；当前生效但没有任何渠道提供的模型（agent 的默认模型、旧会话遗留的模型名）单独成组且**不带渠道标题**——给它冠一个渠道名等于谎称那个渠道提供它。`activeModelName` 属于某组时不会重复成组。

### 12.2 交互

- 会话配置里的"会话模型"下拉：`SelectGroup` + `SelectLabel`（渠道名），组内 `SelectItem` 仍是裸模型名；选中后 `handleGroupedModelChange` 会先切换渠道、再设模型，并在已有会话上持久化 `user_channel_id` 与 `model_name`（与旁边渠道下拉的行为一致）。
- 输入框上方那个紧凑的模型菜单（`DropdownMenuSub`）：同样按渠道分组，用 `DropdownMenuLabel` 作组标题，行为一致。
- 原来那份扁平列表 `modelSelectOptions` 已无人使用，连同 `channelModelOptions` 一起删掉；其余逻辑继续用 `modelOptions`（全渠道并集，用于默认模型兜底）。

顺带被单测逼出来的两个小问题：只判 `!model` 会放过纯空白模型名（现在 trim 后丢弃，与后端目录端点的过滤一致）；以及无渠道模型那一组原先冠了选中渠道的名字，同一标签会出现两次（现在不带标题）。

### 12.3 验证

| 检查 | 结果 |
| --- | --- |
| `.dsh-tmp/model-groups-unit.mjs`（编译真实源码后直接调用，非副本） | **16 项全过**：按名排序、空渠道省略、选中渠道置顶并认领同名模型、每个模型名只出现一次、无渠道模型单独成组且无标题、已提供的模型不重复成组、空目录、空白名过滤、模型→渠道反查（命中/选中/未知三种）、排序不改动入参 |
| 同脚本接真实服务器目录 | 4 项全过：每个分组都对应真实渠道、模型名全局唯一、无空分组、有模型的渠道都被列出（真实数据：`111[deepseek-v4.1-flash]`） |
| `.dsh-tmp/model-grouping-live.mjs`（真库造第二个渠道，含同名模型） | **8 项全过**：两个渠道两组、按名排序、同名模型只出现一次且归第一个渠道、选中渠道置顶并拿到同名模型、模型→渠道反查正确、名字全局唯一。真实输出：选中探针渠道时 `dsh-groups-probe[deepseek-v4.1-flash,dsh-second-model]`（`111` 只剩空组被省略，正是规则 1 的结果） |
| `vite build` | 通过（前端 TSX 的唯一门禁），`dist/frontend/advanced-chat.js` 已重建 |
| 全包 `tsc`／三份契约／路由影子／默认值／组件依赖／模型同步单测 | 全部通过；170 条路由无重复 |
| 测试数据 | 探针渠道与其绑定、目录行全部清理，库回到 `channels=1 models=1 bindings=1` |

**要生效需要重启 3000 端口的服务并强刷页面**（dashboard 在重启时重新读取各插件的 `dist/frontend/*.js`）。

## 13. 本机连接器：把运行 Yumeri 的计算机接成一个设备

原来的连接器只有一种存在形式：**另起一个进程**，拿令牌、连服务器、长轮询领任务。桌面上那个 `window.veloceDesktop.startConnector`、页面上那行 `app.exe -server ... -token ...` 都是这个模式。而**跑 Yumeri 的这台机器本身就是能干活的那台机器**，再让它去连自己、领自己的任务没有意义。于是加了一个插件让本机直接作为连接器，并且顺手把"连接器类型"变成其他插件可以注册的东西——因为"怎么弹文件夹选择窗口"这种能力本来就该由连接器自己决定。

顺带补上的是一个更基础的缺口：**在此之前没有任何插件实现连接器的动作**。`connector.execute` 的处理器链是空的，所以工作区页的目录浏览（`list_directories`）、git 面板（`git_status`/`git_action`）以及 `inner-tools` 那批连接器工具**全部**只会得到 `No connector runtime is enabled`。本机的文件系统与 git 正好补上这块。

### 13.1 连接器插件：类型注册表

`ConnectorService` 新增三个能力，原有的 `register(handler)` 处理器链原样保留（外部代理那条路不受影响）：

```ts
export interface ConnectorType {
  id: string;                    // 写进 advanced_chat_connector_devices.kind
  label: LocalizedText;
  description?: LocalizedText;
  autoConnect?: boolean;         // 不需要令牌、也没有代理进程：主机在它就在
  creatable?: boolean;
  capabilities?: string[];       // 该类型能应答的动作名，供界面判断
  ensureDevice?(userId): Promise<ConnectorDeviceRecord>;              // 自动连接的钩子
  actions?: Record<string, (userId, input, device) => Promise<unknown>>;
  pickDirectory?(userId, input, device): Promise<{path, cancelled}>;  // 该连接器自己决定怎么选文件夹
  runTask?(task, device): Promise<{success, result?, error_message?}>; // 自己消化任务队列
}
```

- **动作分发**：`execute` 先按 `input.device_id` 找到设备行，取它的类型，命中动作就交给类型；类型存在但没有这个动作、或者压根没有这个类型，都回落到原来的处理器链（外部代理仍可服务）。指定了不存在的设备会明确报 `Connector device not found`，而不是悄悄换一台机器执行。
- **默认设备**：动作没点名设备时，若该用户恰有一个在线的自动连接设备，就用它。这就是"本机连接器开着，聊天里的连接器工具就直接作用在本机"的由来，也让 `inner-tools` 那批不带 `device_id` 的工具第一次真正能跑。
- **任务**：`createTask(userId, {device_id, action, workspace_path, payload, requiresApproval})` 统一负责入队、按需即时执行；`executeTask(userId, taskId)` 只吃 `queued`/`approved` 的任务，并且用"只有把状态从 queued 改成 running 的那一次才执行"来防止重复执行（与外部连接器 `tasks/next` 的写法一致）。
- 新增两个端点：`GET /api/user/advanced-chat/connector-types`（前端据此标注设备、判断某台设备能否自己弹文件夹窗口）与 `POST /api/user/advanced-chat/devices/:id/pick-directory`（把"选文件夹"这件事派给设备背后的连接器，按 404/400/504/502 区分"设备不存在/类型不支持/窗口超时/其它失败"）。

**顺手修掉的一个潜在崩溃**：插件读不到自己注册的组件——`ctx.component` 只装加载器从**别的**插件注入进来的名字。连接器插件里原本有两条路由（MCP 进程列表/停止）用 `ctx.component.connector` 取自己，取到的是 `undefined`，一调用就 `Cannot read properties of undefined (reading 'execute')`。现在服务对象存成局部变量，路由直接引用它。这次是本机连接器的取文件夹路由先踩到，才把这个既有 bug 暴露出来。

### 13.2 新插件 device-local

注册一个 `local` 类型，并在 `GET /devices`、`GET /devices/:id` 时通过 `ensureDevice` **自动建立并保持在线**这台机器的设备行（`kind = "local"`，带主机名/系统/架构/内核版本）。它不需要客户端、不需要令牌——设备行里的 `token_hash` 只是为了让表的唯一约束不冲突而随机生成的，永远不会被用来认证。

动作（也就是"本机作为连接器会干什么"）：`list_directories`、`list_windows_drives`、`pick_directory`、`list_directory`、`list_files`、`read_file`、`write_file`、`replace_text`、`file_sha256`、`git_status`、`git_action`。

**两类路径，两种规则**（这是本插件唯一需要小心的设计）：浏览（`list_directories`）故意允许机器上任意绝对路径——选工作区本来就得先看得到整台机器；而工作区内的文件操作（读/写/替换/哈希）在给了 `workspace_path` 时**不许越出该目录**，`..` 也不行，这样模型或过期会话给出的路径不能溜到别处。相对路径一律相对工作区（而非进程 cwd）解析。

**刻意不做 `run_command`**，也不做 `web_search`/`web_fetch`：在主机上从聊天工具执行任意命令需要审批链路，静默打开等于把服务器的 shell 交给模型。这不是遗漏，是选择；能力列表里也没有它们，所以界面与模型都能看出来。

**它自己消化队列**：聊天运行时创建的任务是直接写表的，而本机既是调度方也是执行方，所以插件每 2 秒扫一次自己的设备、只领 `queued`/`approved` 的任务执行——等价于外部连接器那次长轮询，只是发生在进程内。需要审批的任务（`pending_approval`）不碰，等用户在界面上批准。

**文件夹窗口**：Windows 走 `pick-folder.ps1` + `pick-folder.cs` 两个随包资产（放在包根目录，`src` 与 `dist` 都能用同一个相对路径找到，不需要构建时拷贝），用 `powershell.exe -STA -File` 调起来，窗口是 **`IFileOpenDialog` + `FOS_PICKFOLDERS`**——也就是资源管理器自己在用的那个"选择文件夹"：导航窗格、面包屑、搜索框、新建文件夹按钮。**不是** WinForms 的 `FolderBrowserDialog`：那是 Windows 95 那代的树形窗口，第一版实现用的就是它，被指出"太老"之后换掉。COM interop 单独放一个 `.cs`，好处是它自己能被编译检查，而不是埋在字符串里。

弹不出新窗口的场合有两层退路，按顺序：`Shell.Application` 的 `BrowseForFolder`（带 `BIF_NEWDIALOGSTYLE`，可缩放、带文本框和新建文件夹），最后才是 WinForms 那个老的。顺序是有讲究的：新窗口不可用，不等于"选文件夹"这件事就该失败。

macOS 用 `osascript` 的 `choose folder`，Linux 先试 `zenity` 再退到 `kdialog`——都是各自平台的原生窗口，不需要换。

`DEVICE_LOCAL_PICK_COMMAND` 可以整体替换这条命令（把初始目录作为唯一参数传进去、把选中的目录打到 stdout），`DEVICE_LOCAL_PICK_SCRIPT` 单独换掉那个 PowerShell 脚本路径，`DEVICE_LOCAL_PICK_TIMEOUT_MS` 调整等待上限（默认 120 秒，超时按 504 报，而不是假装用户取消了）。**退出码 1 且没有输出**才算"用户取消"；其它退出码、被拒绝的 spawn、缺失的 picker 都是真错误（脚本自己也守这条：三层都弹不出来时写 stderr 并 `exit 2`）——把后者说成"用户取消"会让一个坏掉的环境看起来像用户在犹豫。

### 13.3 前端

- 聊天页的工作区选择对话框多了一个「浏览本机文件夹…」按钮，**只在所选设备的连接器类型声明了 `pick_directory` 时出现**（能力来自 `/connector-types`，所以它跟着连接器走，而不是跟着页面走）。点开就是主机上的原生窗口，选完直接落到路径框（因为 browser 给不出真实路径，这件事只能由后端做）。
- 设备页每台设备显示**它自己的类型名**（来自类型表，而不是"CLI 设备/桌面端设备"的二选一），自动连接的类型加一个「自动连接」标记，并且不再提供"重新生成命令"——它没有令牌可发。

### 13.4 顺带修掉的三个既有 bug

1. **工作区目录浏览永远只列根目录**。前端发的是 `path`，工作区插件读的是 `connector_workspace_path`，于是每次下钻都被忽略、又回到起点。现在两个名字都接受。
2. **git 动作可能作用在错的机器上**。`POST /workspace/git/action` 把请求体原样透传给连接器，而分发读的是 `device_id`、请求体里叫 `connector_device_id`，所以用户选的设备被忽略、动作落到"默认设备"上。现在显式映射（`connector_workspace_path` → `workspace_path` 同理）。
3. **本机设备最初被写成 `cli`**。`ensureDevice` 插入时没写 `kind`，落到了表默认值 `cli` 上，于是它看起来像个"没人启动的外部代理"。集成测试第一次跑就抓到了。

### 13.5 验证

| 检查 | 结果 |
| --- | --- |
| `.dsh-tmp/device-local-unit.mjs`（编译真实源码后直接调用） | **52 项全过**：三个平台各自的窗口命令与参数（含 Windows 必须 `-STA`、`-File` 指向随包脚本、初始目录按需传入、脚本路径可覆盖）、**新窗口没有被人换回旧的**（`IFileOpenDialog` 的 GUID、`FOS_PICKFOLDERS`、`SIGDN_FILESYSPATH`、取消判定、两层退路的先后、退路使用 `BIF_NEWDIALOGSTYLE`、弹不出来时 `exit 2`、`src`/`dist` 解析到同一个脚本）、带空格的覆盖命令切分、结果解释的七种情形（选中/取消/取消但仍打印/超时/缺命令/被拒绝的 spawn/崩溃）、路径规则（相对、工作区内绝对、`..` 越界、无工作区）、目录列举（只列文件夹、缺目录报错）、读写/替换/哈希/条目类型、越界读写被拒 |
| `.dsh-tmp/device-local-e2e.mjs`（真服务器 + 真库） | **25 项全过**：类型已发布且标记自动连接、不提供 `run_command`、标签有中英；宿主设备**无需任何人创建**就出现、在线、带本机信息、不下发 token_hash、且只有一个；按设备列目录、只给文件夹、下钻读到指定目录、空目录为空、**不点名设备也落在本机**、缺目录报错；选文件夹的端点会给出答案而不是挂住（本环境不允许 spawn，所以走 502 分支并带上原因）；未知设备 404；空路径从"此电脑"开始 |
| `.dsh-tmp/device-local-tasks-e2e.mjs`（真服务器 + 真库） | **12 项全过**：`pending_approval` 的任务不会被自动执行；批准之后由设备自己领走并写回状态、开始/结束时间与失败原因；聊天页 git 按钮排的任务确实属于所选设备；`full_access` 的任务不经批准就被执行；探针任务全部清理 |
| 全包 `tsc` / 三份契约 / 路由影子 / 默认值 / 组件依赖 / 模型分组单测 | 全部通过；172 条路由、无重复、无不可达；组件依赖检查覆盖 51 个包、0 问题 |
| 数据库 | 设备表只剩本机设备；任务表无残留；`yumeri.json` 端口已还原 3000 |

**本环境无法验证的部分（如实记录）**：这个工作沙箱禁止 Node 子进程带管道 stdio 启动（`spawn EPERM`，`inherit`/`ignore` 同样被拒），所以**真正弹出窗口**与**真正调用 git** 这两条路径没能在这里跑通（弹窗那次的 502 回应是 `The folder window could not be opened: spawn EPERM`，说明请求确实走到了 picker 并把原因带回来了）。窗口脚本与 interop 本身做了能做的静态检查：`pick-folder.ps1` 用 PowerShell 自己的 parser 解析通过（350 个 token、0 错误），`pick-folder.cs` 用 Roslyn 编译通过（`VeloceFolderPicker.Pick` 存在）。已验证的是"命令怎么构造、结果怎么解释、动作怎么被派发、任务怎么被领走"；`gitStatus`/`gitAction` 的 git 调用本身与 PowerShell 弹窗需要在真实桌面上跑（单元测试里那两段会自动跳过并打印原因）。

**要生效需要**：在每个包构建之后（`packages/device-local` 是新包，没有 `dist` 就加载不了）重启 3000 端口的服务并强刷页面。

## 14. 默认连接器，以及选择器的两套入口

上一轮做出来的本机连接器能用了，但用起来立刻暴露两件事：**"此电脑"里的驱动器进不去**，以及**没有任何东西保证这台机器始终有一个连接器**。这一轮把这两件补上，并且明确了选择器的实现方向。

### 14.1 驱动器显示不出来：两个原因叠在一起

"选工作区"的对话框里，驱动器列表（也就是"此电脑"）**一旦选过工作区就再也回不去**：

1. **上跳在盘根停住**。`workspacePickerCanGoUp` 对 `C:\` 返回 false，`workspacePickerParentPath` 对 `C:\` 返回它自己——于是从工作区一路往上只能走到盘根，"此电脑"永远到不了。选中一个工作区之后，路径从工作区开始，驱动器就再也看不见了。（在旧代码里这个 bug 被另一个 bug 盖住了：后端只认 `connector_workspace_path`，于是每次下钻都被忽略、永远返回根目录＝驱动器列表。上一轮把下钻修好之后，导航的缺口就露出来了。）
2. **本机设备的系统名不对**。本机连接器上报 `os: "win32"`（Node 的叫法），而界面判断的是 `os === "windows"`。于是本机设备被当成别的系统：Windows 那套路径规则全部不生效，从 `C:\` 往上还会走到 `/`。

修法：`hostInfo()` 改用界面认识的词汇（`windows`/`macos`/`linux`），同时界面**两种拼法都认**（外部代理可能发任一拼法）；上跳规则改成"驱动器之上还有此电脑"，并在工具栏加了一个**「此电脑」按钮**（只在 Windows 设备上出现）——只靠上跳也能回根，但有按钮才找得到。驱动器条目现在带 `kind: "drive"`，名字是 `C:`（不再带反斜杠），图标也和普通文件夹区分开。

这套路径规则从页面里抽到了 `packages/advanced-chat/frontend/lib/workspace-picker.ts`——纯函数、无 React 依赖，可以直接跑单测（就是这次出问题的那部分，值得单独钉住）。

### 14.2 默认存在的连接器，且不能删除

要求是"默认存在的默认代理，不能删除"。做法是把"能不能删"变成连接器类型自己的属性，而不是在界面里硬编码某一种类型：

- `ConnectorType` 新增 `removable?: boolean`，**默认取 `autoConnect` 的反面**：主机自己提供的连接器属于安装的一部分，删掉只会让它下次列表时又出现，或者让部署一个连接器都不剩。本机类型显式写 `removable: false`。
- `GET /connector-types` 一并公布 `removable`，界面据此**不渲染删除按钮**，改成一句"由本机提供，不能删除"——而不是给一个按下去必然失败的按钮。
- 后端也拦：`DELETE /devices/:id` 对不可删除的类型回 **403** 并给出中英两份说明；**即使有人绕过后端直接删库**，下一次设备列表也会由 `ensureDevice` 重新建出来并回到在线（这一点是集成测试专门验的）。给这种设备**发令牌**同样被拒（它没有代理进程可发）。
- 设备列表里主机提供的连接器**排在最前**，界面标成"默认连接器"，不会被用户后来添加的设备挤下去。

### 14.3 选择器：两套入口并存

要求过"选工作区时要能打开文件夹窗口"，之后又提出"picker 最好用纯 JS 实现"。**原生系统窗口不可能用纯 JS 实现**——浏览器给不出真实路径（`showDirectoryPicker` 只给句柄），Node 没有原生对话框 API，唯一不依赖 C#/PowerShell 的"窗口"是浏览器自己弹的窗口。所以这里确认了方向：**两套入口都留**。

- **纯 JS 的前端选择器是默认入口**：驱动器、此电脑、上级、刷新、双击进入，全部由 JS 实现，服务端只提供列表（`list_directories` 返回 `{name, path, kind}`）。它**对任何设备都有效**，包括远程设备——原生窗口只有"服务端本身就是那台桌面"时才有意义。
- **原生现代窗口**保留为「浏览本机文件夹…」按钮，**只在所选设备的连接器类型声明了 `pick_directory` 时出现**（也就是本机连接器）。它是上一轮那套 Windows `IFileOpenDialog` / macOS `osascript` / Linux `zenity|kdialog`。

### 14.4 验证

| 检查 | 结果 |
| --- | --- |
| `.dsh-tmp/device-local-default-e2e.mjs`（真服务器 + 真库） | **23 项全过**：类型标记为不可删除/不需要令牌/自动连接；默认连接器无需创建即存在、**排在列表第一位**、在线、上报 `os: windows`、不下发 token_hash；删除被 **403** 拒绝且中英说明齐全、库里仍在；**直接删库后列表会把它重建**并回到在线；给它发令牌被拒；"此电脑"列出驱动器且带 `kind: drive`、名字无尾部分隔符、路径仍是绝对路径；驱动器能打开，里面的条目是 `kind: folder` |
| `.dsh-tmp/workspace-picker-unit.mjs`（导入真实模块） | **20 项全过**：`win32`/`Windows` 都认作 Windows；盘根判定；此电脑是顶（不能再上跳）；**盘根能上跳到此电脑**；`D:\dev\veloce-lab` → `D:\dev` → `D:\` → `""`；`D:/` 与带尾分隔符的写法同样处理；Linux/macOS/未知系统仍走"根目录即顶"的旧规则 |
| `device-local-unit.mjs` / `device-local-e2e.mjs` / `device-local-tasks-e2e.mjs` | 52 / 25 / 12 项全过（无回归） |
| 全包 `tsc`、三份契约、路由影子/组件依赖/默认值/模型分组 | 全过；172 条路由无重复、无不可达；组件依赖 51 包 0 问题 |
| 数据库与配置 | 设备表只剩本机设备（`local/windows`）；任务表无残留；`yumeri.json` 端口已还原 3000 |

**仍然存在的环境限制**：这个沙箱禁止 Node 子进程带管道 stdio 启动（`spawn EPERM`），所以**真正弹窗**与**真正调用 git** 依旧只能靠静态检查加真实桌面验证；选择器这次新加的逻辑全是纯函数，因此不受影响，可以直接单测。

## 15. 默认代理：必须有，且不能删

上一轮我把"默认存在的、不能删除"理解成了**连接器**，做成了默认设备——那是错的。用户说的是**代理（智能体）**，也就是"代理"页面里那一列东西。这一轮回到代理上做对。

### 15.1 缺的是什么

一句话：**后端从来没有创建过那个"默认代理"，但前端从头到尾都在假设它存在**。`Agents.tsx` 与 `Chat.tsx` 里硬编码着 `defaultAgentID = "default"`，并且在二十多处使用它：

- 新会话没有选代理时用 `agent_id = currentSession?.agent_id || "default"` 发起；
- 代理列表里 `agent.id !== defaultAgentID` 才渲染删除按钮；
- 编辑默认代理时名称输入框是禁用的。

也就是说这套 UI 是照着"一定有一个 id 为 `default` 的代理"写的，而后端既不创建它、也没有任何地方保证它存在。这个库里当时**代理数量是 0**，于是：代理页空空如也、聊天没有可用的代理、而那条"不能删除"的规则更是无从谈起。

### 15.2 旧实现里的原始契约（照着它对齐）

旧 Go 代码写得很明确，这次是照着它抄的，而不是自己发明一套：

```go
advancedChatDefaultAgentID   = "default"
advancedChatDefaultAgentName = "Default"
```

- 请求里没有 `agent_id` → `input.AgentID = "default"`；
- `loadAdvancedChatAgent(userID, "default")` → `ensureAdvancedChatDefaultAgent(userID)`，也就是**按需创建**；
- 创建时先按 `stable_id = "default"` 找；找不到就按**名字 "Default"** 找，找到就把 `stable_id` 改成 `"default"`（收养）；再找不到才新建，内容全空（`prompt`、`default_model` 都为空，各列表为 `[]`）。

所以这一轮把上轮多加的 `is_default` 列**撤掉了**：身份就用那个保留的 `stable_id = "default"`。旗标会多出一种"改个名字就失去默认身份"的可能，而保留 id 不会——身份和数据是分开的。

### 15.3 改了什么

- `ensureDefaultAgent(userId)`：按保留 id 找 → 否则收养同名代理 → 否则新建。被 `GET /agents` 调用，所以**一列就有**，永远不为空。
- 列表里默认代理**排最前**（聊天在没选代理时会取列表第一项，于是它自然成为缺省）。
- `DELETE /agents/:id` 对默认代理回 **403** 并给出中英说明；即使有人绕过后端直接删库，下一次列表面也会重新建出来。
- 代理查找统一成 `stable_id` 或 `id`（`$or`）：`stable_id` 是后加的列，早期行只有 `id`，原来的 `updateAgent`/`deleteAgent` 只按 `stable_id` 找，那些行既改不了也删不掉。
- **运行路径**：`agent_id` 为空时回落到 `"default"` 并解析出这条记录（原来是遇到 `"default"` 就直接跳过、当成没有代理）。差别在于：用户如果给默认代理填了提示词或技能，以前那些设置会被静默忽略，现在会像别的代理一样生效。
- 前端：代理列表里默认代理加一个「默认代理」标记（悬停说明"系统内置，始终存在，不能删除"），删除按钮本来就已隐藏，保持不动。i18n 三种语言都补了键。

### 15.4 验证

`.dsh-tmp/default-agent-e2e.mjs`（真服务器 + 真库，**29 项全过**）：

| 场景 | 结果 |
| --- | --- |
| 库里 0 个代理时列表 | 自动创建出 id `default`、名字 `Default`、提示词为空、未绑定模型的代理，且**排在第一位** |
| 删除它 | **403** + 中英说明；列表里还在、库里还在 |
| 普通代理 | 仍然能建（201）、能删，默认代理不受影响 |
| 改名 + 改提示词 | 200；`stable_id` 仍是 `default`，改名之后**依然不可删**（证明身份不是名字） |
| 直接删库 | 下一次列表重新建出来，保留 id 与名字 |
| 用户自己建了一个叫 `Default` 的代理 | 列表面**收养**它（改成保留 id），内容保留（`prompt: "mine"`），并同样不可删 |

探针结束时清掉了自己造的行，数据库回到"0 个代理"的原始状态——**下次打开代理页就会看到那条默认代理**，这正是它按需创建的意义。

其余检查照旧全过：全包 `tsc`、三份契约、路由影子/组件依赖/默认值/模型分组、选择器路径单测 20 项、device-local 单元 52 项；172 条路由无重复、无不可达。前端重建了 `advanced-chat`（代理页标记）与 `dashboard`（i18n 文案，`@/lib/*` 走的是 dashboard 那个外部客户端）。

### 15.5 跟进：为什么"选择代理"里看不到

补上默认代理解释不了全部现象——用户反馈**选择代理里看不到**。查下去是第二个、更直接的原因：`Chat.tsx` 里那份代理列表的 query 写的是

```ts
const { data: agents = [], isFetched: agentsFetched } = useQuery<ChatAgent[]>({
  queryKey: agentsQueryKey,
  enabled: false,
  ...
```

`enabled: false` 意味着**这个页面自己永远不拉列表**。它只在这份缓存被别的页面（代理页、记忆页、渠道页……它们都用同一个 queryKey）先填过时才有数据；而解构时又只取了 `data` 和 `isFetched`，连个 `refetch` 句柄都没留，所以本页面也没有任何办法去补拉。于是：按钮上显示的是 `selectedAgent?.name || copy.selectAgent`，而 `selectedAgent` 也是从这份空列表里 find 出来的——**按钮就一直写着"选择代理"，点开是空的**，正是用户看到的样子。前面那条默认代理虽然已经建出来了，界面上依然一处都看不到。

改动：

- `enabled: false` → `enabled: isAdvanced`（与同页 skills 的写法一致），页面自己负责拉。
- 顺带解决"看不到名字"的第二层问题：默认代理在库里叫 `Default`（沿用 Go 的名字），中文界面里等于没说。加 `agentDisplayName()`：默认代理且名字仍是 `Default` 时显示 `t("chat.defaultAgent")`（"默认代理"），用户改过名就尊重用户的名字。composer 的下拉与最近使用条都用它。

新增守卫 `.dsh-tmp/agent-picker-check.mjs`：扫全部前端源码，凡是 queryKey 指向 `advanced-chat-agents` / `advanced-chat-skills` 的 query，选项里出现 `enabled: false` 就报错（queryKey 常写成旁边的 `const ... as const`，所以先解析常量再比对；只找字面量会扫到声明那一行而**空过**）。

这个守卫本身也验证过不是摆设：`.dsh-tmp/agent-picker-negative.mjs` 把 `enabled` 改回 `false`、导入守卫、确认它报错、再还原文件——结果是 `guard caught the broken query: true`。中间还踩到一个坑值得记下：最初用 `execFileSync` 跑子进程，而这个沙箱**禁止 Node 起子进程**（`spawn EPERM`），异常被 catch 成空输出，看起来就像"守卫没抓到"——把守卫**在同一进程内 import** 才测出真实结果。凡是用子进程做验证的地方都要防这种假阴性。

## 16. 前端没人做类型检查，以及一个被自己清掉的构建产物

用户报 `Uncaught ReferenceError: HardDrive is not defined`（`Chat.tsx:4352`）—— 那是我上一轮加"驱动器"图标时**忘了往 `lucide-react` 的 import 里加 `HardDrive`**。查这个错的过程中又发现两件更值得记的事。

### 16.1 为什么没人拦住它

每个包的 `tsconfig.json` 都是 `"include": ["src"]` —— **`frontend/` 从来不在任何类型检查范围内**。vite（esbuild）只做转译、**不检查类型**，所以一个没定义的标识符会被原样输出到 bundle 里，直到浏览器执行到那一行才炸。React 里这意味着**整个页面白屏**，而不是少个图标。`npx tsc -p packages/advanced-chat/tsconfig.json` 一路是 0 错误，因为那个文件根本没被看过。

### 16.2 补上前端类型检查

新增 `.dsh-tmp/frontend-configs.mjs`（为每个有 `frontend/` 的包生成 tsconfig，共 21 个）+ `.dsh-tmp/frontend-typecheck.ps1`（逐包跑 `tsc`）。要点：

- 生成器把 vite 的 alias 映射到**真实源码**（`@/lib/*` → dashboard 的 `frontend/lib/*`，`@/components/chat/*` 优先本包自己的目录，`react`/`lucide-react` 等指向真正的 npm 包），否则前端一行都解析不了。
- 只把 **`TS2304` / `TS2552`（未定义的名字）** 当致命错误：这一类**打包器不会替你发现**，正是白屏的成因；而 `TS2307`（模块不存在）**打包时就会硬失败**，不必在这里重复报警（dashboard 里 `@/pages/Login` 那种是没进构建的遗留文件）。
- 生成的 tsconfig 放在 `.dsh-tmp/frontend-tsconfigs/`，而 tsconfig 的 `include`/`paths` 是**相对配置文件本身**解析的 —— 所以里面一律写绝对路径；另外 TypeScript 的 glob 与 `paths` 值**不接受反斜杠**，必须转成 `/`（这两条都实际踩了一次，症状分别是"找不到任何输入文件"和"模块解析不到"）。
- 结果：21 个前端全过，另有 374 条历史遗留错误（大多在共享 client 源码里）**只报数量、不阻塞** —— 否则这条检查会因为噪音而没人看。

它确实能抓住这次的错：`.dsh-tmp/frontend-typecheck-negative.ps1` 把 `HardDrive` 从 import 里删掉、跑检查、确认报出 `error TS2304: Cannot find name 'HardDrive'` 并让该包 FAIL、再还原文件，全部为真。注意最初我用 Node 的 `execFileSync` 写这个反向验证，而**沙箱禁止 Node 起子进程**（`spawn EPERM`）——异常被 catch 成空输出，看起来就像"检查没抓到"。这类验证必须用 pwsh 起子进程，或在同进程内 import。

### 16.3 顺手发现：我把 `dashboard-client.js` 清掉了

dashboard 的 `build` 脚本是**三步**：`tsc` → `vite build`（网页外壳）→ `vite build --config vite.client.config.ts`（共享 client，`emptyOutDir: false`）。而第一步 `vite build` 对**同一个** `dist/web` 是 `emptyOutDir: true`。前面几轮我为了更新 i18n 文案只跑了中间那一步，于是**把 `dist/web/dashboard-client.js` 删了**——那是所有插件 bundle 通过稳定 URL `/dashboard-client.js` 导入的共享 React/runtime 包。少了它，`/dashboard-client.js` 会落到 dashboard 的兜底路由上返回 index.html，整个面板在加载插件时就崩。这次已用第三步单独重建（该配置是 `emptyOutDir: false`，可以单独跑），2.35 MB，并确认它确实导出了 `HardDrive` 等图标（`client.ts` 里 `export * from "lucide-react"`）。

新增守卫 `.dsh-tmp/build-artifacts-check.mjs`：读每个包的 `build` 脚本与 vite 配置，断言每一步的产物都在 —— 有 `main` 的包要有 `dist/index.js`；build 里出现第二个 `vite build --config X` 的，要能从 X 里解析出 `outDir` 与 `fileName` 且文件存在；有前端且配置带 `lib.fileName` 的包要有对应 bundle（不带的按外壳 `index.html` 检查）；另外显式检查共享 client 与网页外壳。当前 74 项全过。反向验证：把 client 改名藏起来 → 立刻报 3 条 FAIL，再改回来。

**教训**：重建某个包要用它自己的 `build` 脚本（`yarn workspace @velocelab/<pkg> build`），不要只手敲其中一条命令 —— 同一个输出目录被多步构建共用时，"少跑一步"的后果是**删掉别人的产物**，而且只在你刷新页面时才炸。

## 17. "发了之后说 session not found"

### 17.1 现象与根因

新开一个聊天、发出第一条消息就报 **session not found**（这句就是后端 `complete()` 抛的）。只发生在**新**会话上，历史会话一切正常。

原因是会话的所有权约定没被移植过来。前端**自己生成会话 id**（`createSession()` 用 `crypto.randomUUID()`），并把它知道的一切用一次 `PUT /sessions/:id` 存回去 —— 那个函数就叫 `saveAdvancedChatSessionSnapshot`，名字直接来自旧 Go 的同名函数。前端从头到尾**只**用 GET / PUT / DELETE，**从不调用 `POST /sessions`**（那个接口发号，是服务端生成 id 的路子）。

而我们的 `PUT` 做的是：`updateSession()` 先按 id 查，查不到就 `return undefined` —— **它不会创建**，而且只认 `title` / `model_name` / `agent_id` 三个字段。于是新会话在服务端**永远不存在**，紧接着的 `POST /completions` 带着那个 id 过来，`complete()` 查不到就抛了 `session not found`。历史会话之所以没事，是因为它们的行来自 `POST /sessions`（服务端 id，确实存在）。

旧实现写得明明白白（`old/internal/service/advanced_chat_runs.go:1625-1654`）：

```go
if existing.ID != "" {
    tx.Model(&existing).Updates(map[string]interface{}{ "title": …, "run_mode": …,
        "agent_id": …, "agent_group_id": …, "skill_ids": …, "mcp_server_ids": …,
        "knowledge_base_ids": …, "connector_device_id": …, "connector_workspace_path": …,
        "cloud_sandbox_id": …, "connector_auto_approve": …, "connector_approval_mode": …,
        "connector_command_prefixes": …, "model_name": …, "user_channel_id": …,
        "max_tokens": …, "temperature": …, "reasoning_effort": …,
        "auto_compress_context": …, "disabled_tool_groups": … })
} else {
    tx.Create(&session)      // 没找到就按客户端给的 id 建
}
```

移植时两半都丢了：**不创建**，且只写 3 个字段 —— 后者还意味着 `run_mode`、连接器设备/工作区、技能、`max_tokens`、`temperature` 这些设置**发出去就被丢掉**，会话行里一直是默认值。

### 17.2 改了什么

- 新增 `service.saveSessionSnapshot(userId, sessionId, input)`：**有就整体更新，没有就按客户端给的 id 建**；覆盖上表那 19 个字段；`folder_id` 刻意不动（前端用单独的 `/sessions/:id/folder` 接口移动会话，快照里从不带这个字段）；id 为空或超过 191 字符直接拒绝，路由返回 400 而不是留下一行没法用的数据；会话点名默认代理时先 `ensureDefaultAgent`，保证外键有意义。
- `PUT /sessions/:id` 改为把整个快照透传进去；响应仍是**会话本身**（前端 `saveAdvancedSessionSnapshot` 直接 `normalizeSession(res.data)`）。
- `complete()`：id 已知但库里没有时**按需创建**（前端快照与发送存在竞态，先到的请求不该失败），而不是抛 `session not found`；剩下那个兜底分支现在只会因为 id 畸形触发，措辞改成 "Invalid session id"。
- 特意**没做**：`PUT` 仍不写 `messages`。运行路径自己写 user/assistant 消息（自造 id），若把客户端那份也写进去就会重复；消息持久化的口径另议。

### 17.3 验证

`.dsh-tmp/session-snapshot-e2e.mjs`（真服务器 + 真库，**26 项全过**）：客户端命名的会话被创建且字段逐个落库（run_mode / agent_id / connector_device_id / model_name / max_tokens / temperature / reasoning_effort）；能按 id 读回、出现在会话列表里；再存一次是原地更新（行数仍为 1）；先移动到文件夹再存快照，`folder_id` 保留；畸形 id 返回 400；**未知 id 的 completions 不再回 session not found，并且按需建出了会话**。

反向验证也做了：用 `PROBE_OLD_BEHAVIOUR` 环境变量临时恢复"查不到就不创建"的旧行为，同一份探针立刻大面积 FAIL（"saving a session the client named creates it"、"the row exists" 等），确认这套检查真的能抓住这个 bug；随后还原文件（确认无残留标记）、重新编译、重跑全绿。

顺带记一笔环境事实：这个部署在 `yumeri.json` 里声明了 `@velocelab/auth` 管理员，插件启动时会把管理员**落到 users 表**并打日志 `[auth] administrator "FireGuo" adopted from configuration`。users 表为空时匿名请求按 uid 0 处理，一旦这行存在就要求登录（`/auth/password/login`），所以现在探针都要先登录取 token —— 这也解释了为什么之前几轮的探针不需要认证。

## 18. completions 报 400 Bad Request：真正的问题在上游 URL 上

### 18.1 现象与真实原因链

会话快照修好之后，浏览器控制台开始出现 `/api/user/advanced-chat/completions: 400 (Bad Request)`。400 是"请求写错了"的意思，于是排查方向自然落到请求体上 —— 但请求体没问题。

真实链条是四步：

1. 该用户的渠道是 `channels.base_url = https://api-staff.mcjpg.org/v1` —— **base URL 里已经带了 `/v1`**（这是渠道配置里很常见的一种写法）。
2. 插件把上游路径直接拼在 base 后面：`${base_url}/v1/chat/completions` → `https://api-staff.mcjpg.org/v1/v1/chat/completions`。
3. 上游 SDK 拿到这个 URL 直接抛 `Invalid URL (POST /v1/v1/chat/completions)` —— **根本没有发出网络请求**。这一条留在了库里，是定位的关键证据：`advanced_chat_runs.error_message`。
4. completions 路由用**消息文本**猜状态码：`/required|not specified|invalid/i` —— `Invalid URL` 里的 "Invalid" 命中了 → 返回 **400**。于是浏览器把它显示成一个 400，把"渠道 URL 配错"伪装成了"请求体写错"。

同一类拼接还有第二处：`knowledge` 的 embedding 调用写死 `${base_url}/v1/embeddings`，base 带版本时同样会变成 `/v1/v1/embeddings`。

### 18.2 改了什么

- 新增 `upstreamURL(baseURL, urlPath)`（`packages/advanced-chat/src/index.ts`，导出让别的插件复用）：base 末尾斜杠先去掉；如果路径的版本段（`/v1`、`/v2`…）base 末尾已经有了，就不再重复。四个形状都对：带 `/v1` 的 base、裸主机名、带尾斜杠、dashscope 那种 `/compatible-mode/v1`。两个调用点（首轮 completions 与工具循环的后续轮次）都改用它；`knowledge` 的 embeddings 也改用它（该插件本来就依赖 advanced-chat）。
- 新增 `ChatInputError`（`packages/advanced-chat/src/index.ts`）：我们**自己**拒绝的请求（消息为空、模型缺失、会话 id 畸形）抛这个类型，路由靠 `instanceof` 判定 400；其余异常一律 **502**（上游/网关失败），`/not found/` 仍是 404。不再靠消息文本猜状态码 —— 这正是把上游故障误报成 400 的原因。
- 顺手补齐一个从旧实现漏掉的契约：旧代码是 `if modelName == "" && mode != advancedChatModeAgentGroup` 才报错（`old/internal/service/advanced_chat_completion.go:166`），也就是**代理组运行时前端故意送空 model**（每个成员各自解析自己的模型）。移植时这条豁免丢了，导致代理组发送被我们自己的校验拦下。现在豁免照旧；而 Agent Studio 的多智能体编排本体本来就是已知未移植项（见 §"已知未处理"），所以代理组运行会明确回答 `Agent group runs are not implemented yet; use assistant mode for now`，而不是一个误导人的字段校验错误。两个校验错误的措辞也改回旧实现的区分写法：`Messages are required` / `Model is required`。

### 18.3 验证

`.dsh-tmp/upstream-url-e2e.mjs`：在本地起一个桩上游（`127.0.0.1:3901`），往库里插入一组临时渠道/模型/绑定行，然后真的发一次运行，**记录桩收到的请求路径**并断言：

- base 带 `/v1`（就是该用户的形状）→ 上游收到 `/v1/chat/completions`（修前是 `/v1/v1/chat/completions`）；
- 裸主机名 → 仍然是 `/v1/chat/completions`（没有回归）；
- base 带尾斜杠 → 不会产生双斜杠；
- assistant 模式（该用户实际用的模式）→ 同样的 URL，并且整轮跑通拿到回复；
- 空 messages → 400 `Messages are required`；代理组运行 → 400 且消息说的是真实原因。

探针自己清理临时渠道/模型/绑定行与探针会话，跑完核对库里只剩用户自己的数据。

反向证据是意外得到的、也因此格外可信：第一遍探针跑在**没重启的旧构建**上，同一份断言直接报 5 项 FAIL，桩收到的正是 `/v1/v1/chat/completions`、错误文案也正是旧的 `model and messages are required`。

定位本身也没靠猜：`advanced_chat_runs` 里那条 `Invalid URL (POST /v1/v1/chat/completions)` 与 `channels.base_url` 的 `/v1` 结尾，两条库内数据一对，链路就闭合了。

## 19. "请求参数错误 / bad_response_status_code"：请求体不合规，不是上游坏

### 19.1 先把"是谁的问题"数据化

用户贴出的 `{"error":"{\"error\":{\"message\":\"请求参数错误\",\"type\":\"bad_response_status_code\"}}"}` 里，**外层是我们路由的包装**（上游失败现在是 502），**内层字符串是中继原样返回的错误**。所以问题只能出在两处：中继/上游，或者我们的请求。

中继本身是好的，证据是三件事：

1. `GET https://api-staff.mcjpg.org/v1/models` → 200，列出 `deepseek-v4.1-flash`，且带 `supported_endpoint_types: ["openai","anthropic"]`。
2. 最小请求 `POST /v1/chat/completions {model, messages:[{role:"user",content:"hi"}]}` → **200**，正常返回内容。
3. `POST /v1/responses`（Responses API 形状）→ **503 model_not_found**（"No available channel for model …"）—— 这条端点上中继根本没有通道。

然后看用户库里自己的运行记录，两种错误各出现了一次，正好对应两种渠道类型：

| 时间 | 渠道类型 | 我们打到的路径 | 结果 |
| --- | --- | --- | --- |
| 01:17 | `completion`（用户自己试过） | `/v1/chat/completions` | 中继转发到真上游，真上游判请求非法 → `请求参数错误` |
| 01:18 | `responses`（当前配置） | `/v1/responses` | `model_not_found`：该端点没有可用通道 |

用户说"completion 也是一样的"是对的，而且这恰好说明**类型不是关键区别**：`completion` 与 `openai` 在我们的适配器注册表里是**同一个适配器**（都注册在 `adapter-openai`，都打 `/v1/chat/completions`），所以换名字不会有任何变化。真正的差别在请求体上。

### 19.2 抓出我们真正发出去的东西

把中继前面放一个记录用的代理（临时渠道指向代理，代理再转发给中继），抓到 assistant 运行的真实请求体，发现两处与线上格式不符：

1. **工具没有包 `function` 外壳**：我们发的是 `{"name":…,"description":…,"parameters":…}`，而 chat completions 要的是 `{"type":"function","function":{…}}`。旧实现是包好的（`old/internal/service/chat_executor.go:1142-1143`：`"type": "function", "function": map[string]interface{}{…}`），移植时这一层丢了 —— 27 个工具全是裸的。
2. **空 `tool_calls` 没有被省略**：每条 user 消息都带着 `tool_calls: []`。旧实现的字段是 `json:"tool_calls,omitempty"`（`old/internal/service/advanced_chat_completion.go:69`），而 JS 里空数组是**真值**，`message.toolCalls ? {…} : {}` 判断不出来，于是空数组一路发到了上游。

两者是**两个独立的缺陷**，先后验证：只修工具外壳后同一条运行**仍然失败**；再按 omitempty 省略空 `tool_calls` 后，同一条运行返回 **200**（`status: completed`，input 1755 / output 42 tokens，assistant 内容正常）。也就是说空 `tool_calls` 是压垮上游的那一下，工具外壳是同一段代码里另一个必须修的错。

### 19.3 改了什么

- `@velocelab/adapters` 新增两个共享映射：`openAIChatTools()`（内部 `{name, description, parameters}` → `{type:"function", function:{…}}`，并丢弃没有名字的工具）与 `openAIChatMessages()`（空 `tool_calls` 按 omitempty 省略）。放在共享包而不是某个适配器里，是因为线上格式是协议事实，不该由每个适配器各抄一遍。
- `adapter-openai` 与 `adapter-openai-compatible`（原先各自有一份逐字相同的 `mapMessages`）改用这两个映射；后者顺带补上了 `tools` + `tool_choice`（它此前完全不发工具）。

### 19.4 仍需用户做的一步

渠道类型不能是 `responses`：我们的 `responses` 适配器打 `/v1/responses`，而这个中继在该端点没有通道（503 model_not_found），与请求体修得对不对无关。要用 `completion` 或 `openai`（二者等价），它们打 `/v1/chat/completions`，正是上文验证通过的那条路。渠道类型是每次请求现读的，改完不用重启；但 19.3 的代码修复要重启服务加载新编译的 dist。

### 19.5 已知遗留

除 `adapter-openai` 与 `adapter-openai-compatible` 外，其余对话类适配器（`adapter-deepseek`、`adapter-moonshot`、`adapter-siliconflow`、`adapter-xai`、`adapter-zhipu`、`adapter-dashscope` 等）**根本不发送 `tools`** —— 也就是说走这些渠道时 assistant 模式没有工具可用，只会变成普通对话。这是与本节同源的移植缺口，留待单独处理。
