Veloce

你的新一代个人助理与AI中转站点

[English](README.md) | 简体中文

Veloce 是一款面向 AI 平台与开发者生态打造的 AI API 网关与服务市场。提供完整的 AI API 管理基础能力，包括身份认证、上游渠道管理、API 网关、用户余额、计费、调用日志等功能。

## 快速安装

安装脚本是交互式的：先确认 git、Node.js、Yarn 可用（缺了会问你要不要装），再把仓库克隆到你指定的目录，
安装依赖，然后启动。

Linux / macOS / WSL：

```bash
curl -fsSL https://raw.githubusercontent.com/veloce-ailab/veloce-lab/main/scripts/install.sh | bash
```

Windows（PowerShell）：

```powershell
irm https://raw.githubusercontent.com/veloce-ailab/veloce-lab/main/scripts/install.ps1 | iex
```

也可以先把脚本下载下来再运行（内容一样，方便先看一眼）：

```bash
curl -fsSL -o install.sh https://raw.githubusercontent.com/veloce-ailab/veloce-lab/main/scripts/install.sh
bash install.sh
```

```powershell
irm -OutFile install.ps1 https://raw.githubusercontent.com/veloce-ailab/veloce-lab/main/scripts/install.ps1
pwsh -File install.ps1
```

可用参数：`--dir <路径>`（装到哪里）、`--branch <分支>`（克隆哪个分支或 tag，默认 `main`）、
`--port <端口>`、`--mode dev|prod`（`dev` 免构建直接起，`prod` 先构建）、`--no-start`（只装不启动）、
`--yes`（全部用默认值，不再提问）、`--dry-run`（只打印计划不执行）；`--help` 会列出全部。
Windows 上对应的是 `-Dir`、`-Branch`、`-Port`、`-Mode`、`-NoStart`、`-Yes`、`-DryRun`。

> `main` 上目前还是旧的 Go 实现。在这次重写合并之前，需要指定分支：
> `... | bash -s -- --branch feature-new-backend`（Windows 用 `-Branch feature-new-backend`）。

脚本会检查它需要的东西：git、Node.js 22.5 以上（推荐 Node 24 LTS —— SQLite 插件用的是内置的
`node:sqlite`）、以及 Yarn 4 —— Yarn 通过 corepack 获取，因此跑的必然是 `package.json` 里
`packageManager` 钉住的那个版本。

## 功能特性

- OpenAI 兼容 API 网关
- 多上游渠道管理
- OIDC 登录认证
- Passkey（WebAuthn）认证
- API Key 鉴权
- 用户余额管理
- Token 用量统计
- 基础计费系统
- 图片生成支持
- 现代化 Web 管理后台

## 仓库结构

internal/    内部代码
cmd/         Cli组件

## 构建

环境要求

- Go（版本以 "go.mod" 为准）
- Node.js
- Yarn

1. 构建前端
```
cd web
yarn install
yarn build
```
> 提示：前端需要放在相对后端的../web位置
2. 构建后端
```
cd ../community
go build
```
开发时可直接运行：
```
go run .
```
完成前端构建后，后端会自动提供构建好的前端静态资源。

## 配置

将 ".env.example" 复制为 ".env"，并根据实际环境修改配置：
```
APP_ENV=development
PORT=8080
DB_DRIVER=sqlite
DB_PATH=veloce.db
DB_DSN=
DB_MAX_OPEN_CONNS=25
DB_MAX_IDLE_CONNS=10
DB_CONN_MAX_LIFETIME_SECONDS=3600
JWT_SECRET=your-secure-jwt-secret-here
OIDC_ISSUER=https://your-oidc-provider.com
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_REDIRECT_URL=http://localhost:8080/auth/callback
BOOTSTRAP_ADMIN_OIDC_SUBS=
BOOTSTRAP_ADMIN_EMAILS=
```

企业功能通过管理后台“运行模式”中的“企业模式”手动开启，不使用环境变量。一套部署只对应一个企业；切换回运营模式或自用模式时企业数据会保留，但企业接口停止启用。

`DB_DRIVER` 支持 `sqlite`（默认）、`postgres` 与 `mysql`。SQLite 使用
`DB_PATH`；PostgreSQL/MySQL 使用 `DB_DSN`（也支持 `DATABASE_URL`），应用启动时会自动创建或迁移表结构。

```dotenv
# PostgreSQL
DB_DRIVER=postgres
DB_DSN=host=127.0.0.1 user=flai password=change-me dbname=flai port=5432 sslmode=disable

# MySQL 8+
DB_DRIVER=mysql
DB_DSN=flai:change-me@tcp(127.0.0.1:3306)/flai?charset=utf8mb4&parseTime=True&loc=Local
```
## 许可证

本项目采用AGPL许可证，详情请查看仓库中 "LICENSE" 文件。

## 特别鸣谢

[Linuxdo](https://linux.do)
