Veloce Lab

Your better personal agent

English | [简体中文](README_zh.md)

Veloce Lab is a personal assistant harness built on the YumeriJS framework, providing a unified runtime for AI capabilities, plugins, tools, and workflows.

## Quick Install

Download the configuration file into an empty project:

```bash
curl -fsSL -o yumeri.json https://raw.githubusercontent.com/veloce-ailab/veloce-lab/main/scripts/yumeri.json
```

Then start Veloce Lab. `npx` is recommended because it does not require Yumeri to
be installed in the project beforehand:

```bash
npx yumeri@latest -c yumeri.json --auto-install
```

Alternatively:

```bash
# In a project that already has Yumeri installed and uses Yarn
yarn yumeri -c yumeri.json --auto-install

# In an environment where Yumeri is installed globally
yumeri -c yumeri.json --auto-install
```

The `--auto-install` option automatically installs all dependencies declared in
the configuration. It can be omitted when the dependencies are already
installed.

On Windows PowerShell, download the configuration with:

```powershell
irm -OutFile yumeri.json https://raw.githubusercontent.com/veloce-ailab/veloce-lab/main/scripts/yumeri.json
```

The project requires Node.js 24 LTS or newer because the SQLite plugin uses the
built-in `node:sqlite`. Corepack provides the Yarn 4.14.1 version pinned in
`package.json`.

## Features

- OpenAI-compatible API gateway
- Multiple upstream provider management
- OIDC authentication
- Passkey (WebAuthn) authentication
- API Key authentication
- User balance management
- Token usage logging
- Basic billing system
- Image generation support
- Modern administration dashboard

## Configuration

Veloce Lab uses `yumeri.json` as its configuration file. The template is available
at `scripts/yumeri.json`; download it into the directory where you start the
service, or create your own configuration file there, then pass it with:

```bash
yumeri -c yumeri.json
```

The file contains the core server settings and the enabled Yumeri plugins,
including the listening port, database path, storage paths and adapters. Keep
deployment-specific values in the local `yumeri.json` rather than changing the
tracked template.

After the service starts, settings supported by the application can also be
configured through the Web administration console. Startup and plugin loading
options still need to be defined in `yumeri.json`.

## Repository Structure

```text
app/         Go-side tools and platform helpers
packages/    Yumeri core packages, plugins and adapters
desktop/     Desktop application
mobile/      Mobile application
scripts/     Configuration templates and helper scripts
data/        Runtime data, files and memories
```

## License

We use AGPL. See the LICENSE file for licensing information.

## Special thanks

[Linuxdo](https://linux.do)
