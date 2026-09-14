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
