Veloce Lab

你的新一代个人助理

[English](README.md) | 简体中文

Veloce Lab 是一个面向个人助理的 harness，基于 YumeriJS 框架构建，为 AI 能力、插件、工具和工作流提供统一的运行环境。

## 快速安装

在一个空项目中下载配置文件：

```bash
curl -fsSL -o yumeri.json https://raw.githubusercontent.com/veloce-ailab/veloce-lab/main/scripts/yumeri.json
```

然后启动 Veloce Lab。推荐使用 `npx`，它不要求项目预先安装 Yumeri：

```bash
npx yumeri@latest -c yumeri.json --auto-install
```

也可以使用以下方式：

```bash
# 在已经安装 Yumeri、并使用 Yarn 作为包管理器的项目中
yarn yumeri -c yumeri.json --auto-install

# 在已经全局安装 Yumeri 的环境中
yumeri -c yumeri.json --auto-install
```

其中 `--auto-install` 会自动安装配置中声明的所有依赖包。如果依赖已经安装，也可以省略该参数。

Windows PowerShell 可以使用以下命令下载配置文件：

```powershell
irm -OutFile yumeri.json https://raw.githubusercontent.com/veloce-ailab/veloce-lab/main/scripts/yumeri.json
```

项目需要 Node.js 24 LTS 以上版本，因为 SQLite 插件使用内置的 `node:sqlite`。
通过 Corepack 可使用 `package.json` 中固定的 Yarn 4.14.1 版本。

## 功能特性

- 多上游渠道管理
- OIDC 登录认证
- 用户余额管理
- Token 用量统计
- 基础计费系统
- 图片生成支持
- 现代化 Web 管理后台

## 仓库结构

app/         Go 侧工具与平台辅助代码
packages/    Yumeri 核心包、插件与适配器
desktop/     桌面端应用
mobile/      移动端应用
scripts/     配置模板与辅助脚本
data/        运行时数据、文件与记忆

## 构建

环境要求：

- Node.js 24 LTS 以上
- Corepack

启用固定版本的 Yarn 并安装项目依赖：

```bash
corepack enable
yarn install
```

构建所有工作区：

```bash
yarn build
```

启动生产服务器：

```bash
yarn start
```

开发时使用开发服务器：

```bash
yarn dev
```

## 配置

Veloce Lab 使用 `yumeri.json` 作为配置文件。模板位于 `scripts/yumeri.json`，
将它下载到启动服务的目录中，或在该目录创建自己的配置文件，然后通过以下命令启动：

```bash
yumeri -c yumeri.json
```

该文件包含核心服务设置和启用的 Yumeri 插件，包括监听端口、数据库路径、存储路径和适配器等。
部署专用的配置请保存在本地 `yumeri.json` 中，不要直接修改仓库里跟踪的模板。

服务启动后，应用支持的设置也可以通过 Web 管理控制台进行配置；启动参数和插件加载配置仍需要在
`yumeri.json` 中定义。
## 许可证

本项目采用AGPL许可证，详情请查看仓库中 "LICENSE" 文件。

## 特别鸣谢

[Linuxdo](https://linux.do)
