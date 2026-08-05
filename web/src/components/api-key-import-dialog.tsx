import { useMemo, useState } from "react"
import { Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type Platform = "unix" | "windows"

export function APIKeyImportDialog({
  open,
  onOpenChange,
  apiKey,
  apiKeyName,
  baseURL,
  onCopy,
  language,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  apiKey: string
  apiKeyName: string
  baseURL: string
  onCopy: (value: string) => void
  language: string
}) {
  const [platform, setPlatform] = useState<Platform>("unix")
  const copy = language === "zh" ? zhCopy : enCopy
  const configs = useMemo(() => createClientConfigs(baseURL, apiKey), [apiKey, baseURL])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description(apiKeyName || copy.defaultKeyName)}</DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-muted-foreground">
          {copy.securityNotice}
        </div>
        <Tabs defaultValue="codex" className="gap-4">
          <TabsList className="h-auto w-full justify-start overflow-x-auto">
            <TabsTrigger value="codex" className="shrink-0 px-3">Codex CLI</TabsTrigger>
            <TabsTrigger value="claude" className="shrink-0 px-3">Claude Code</TabsTrigger>
            <TabsTrigger value="opencode" className="shrink-0 px-3">OpenCode</TabsTrigger>
          </TabsList>

          <TabsContent value="codex" className="space-y-4">
            <PlatformTabs platform={platform} onPlatformChange={setPlatform} copy={copy} />
            <p className="text-sm text-muted-foreground">{copy.codexHelp}</p>
            <ConfigSnippet value={platform === "windows" ? configs.codexWindows : configs.codexUnix} onCopy={onCopy} copy={copy} />
          </TabsContent>

          <TabsContent value="claude" className="space-y-4">
            <PlatformTabs platform={platform} onPlatformChange={setPlatform} copy={copy} />
            <p className="text-sm text-muted-foreground">{copy.claudeHelp}</p>
            <ConfigSnippet value={platform === "windows" ? configs.claudeWindows : configs.claudeUnix} onCopy={onCopy} copy={copy} />
          </TabsContent>

          <TabsContent value="opencode" className="space-y-4">
            <p className="text-sm text-muted-foreground">{copy.openCodeHelp}</p>
            <ConfigSnippet value={configs.openCode} onCopy={onCopy} copy={copy} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function PlatformTabs({ platform, onPlatformChange, copy }: { platform: Platform; onPlatformChange: (platform: Platform) => void; copy: ClientCopy }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant={platform === "unix" ? "default" : "outline"} onClick={() => onPlatformChange("unix")}>
        {copy.macLinux}
      </Button>
      <Button type="button" size="sm" variant={platform === "windows" ? "default" : "outline"} onClick={() => onPlatformChange("windows")}>
        Windows
      </Button>
    </div>
  )
}

function ConfigSnippet({ value, onCopy, copy }: { value: string; onCopy: (value: string) => void; copy: ClientCopy }) {
  return (
    <div className="overflow-hidden rounded-md border bg-muted/30">
      <div className="flex items-center justify-between gap-3 border-b bg-background/60 px-3 py-2">
        <span className="text-xs text-muted-foreground">{copy.copyHint}</span>
        <Button type="button" size="sm" variant="outline" className="shrink-0 gap-2" onClick={() => onCopy(value)}>
          <Copy size={14} />
          {copy.copy}
        </Button>
      </div>
      <pre className="max-h-[48vh] overflow-auto p-3 font-mono text-xs leading-5 whitespace-pre">{value}</pre>
    </div>
  )
}

function createClientConfigs(baseURL: string, apiKey: string) {
  const normalizedBaseURL = baseURL.replace(/\/+$/, "")
  return {
    codexUnix: codexUnixScript(normalizedBaseURL, apiKey),
    codexWindows: codexWindowsScript(normalizedBaseURL, apiKey),
    claudeUnix: claudeUnixScript(normalizedBaseURL, apiKey),
    claudeWindows: claudeWindowsScript(normalizedBaseURL, apiKey),
    openCode: JSON.stringify(openCodeConfig(normalizedBaseURL, apiKey), null, 2),
  }
}

function codexUnixScript(baseURL: string, apiKey: string) {
  return [
    "bash << 'SETUP_SCRIPT'",
    "mkdir -p ~/.codex",
    "[ -f ~/.codex/config.toml ] && cp ~/.codex/config.toml ~/.codex/config.toml.bak",
    "[ -f ~/.codex/auth.json ] && cp ~/.codex/auth.json ~/.codex/auth.json.bak",
    "cat > ~/.codex/config.toml << 'CODEX_CONFIG'",
    'model_provider = "veloce"',
    'model = "gpt-5.5"',
    'model_reasoning_effort = "high"',
    'network_access = "enabled"',
    "disable_response_storage = true",
    "windows_wsl_setup_acknowledged = true",
    'model_verbosity = "high"',
    "",
    "[model_providers.veloce]",
    'name = "Veloce"',
    `base_url = ${tomlString(baseURL)}`,
    'wire_api = "responses"',
    "requires_openai_auth = true",
    "CODEX_CONFIG",
    "cat > ~/.codex/auth.json << 'CODEX_AUTH'",
    JSON.stringify({ OPENAI_API_KEY: apiKey }, null, 2),
    "CODEX_AUTH",
    'echo "✅ Done! Codex CLI is ready."',
    "SETUP_SCRIPT",
  ].join("\n")
}

function codexWindowsScript(baseURL: string, apiKey: string) {
  return [
    "@echo off",
    "chcp 65001 >nul",
    "echo Veloce - Codex CLI One-Click Setup",
    "echo.",
    'if not exist "%userprofile%\\.codex" mkdir "%userprofile%\\.codex"',
    'if exist "%userprofile%\\.codex\\config.toml" copy "%userprofile%\\.codex\\config.toml" "%userprofile%\\.codex\\config.toml.bak" >nul',
    'if exist "%userprofile%\\.codex\\auth.json" copy "%userprofile%\\.codex\\auth.json" "%userprofile%\\.codex\\auth.json.bak" >nul',
    "(",
    'echo model_provider = "veloce"',
    'echo model = "gpt-5.5"',
    'echo model_reasoning_effort = "high"',
    'echo network_access = "enabled"',
    "echo disable_response_storage = true",
    "echo windows_wsl_setup_acknowledged = true",
    'echo model_verbosity = "high"',
    "echo.",
    "echo [model_providers.veloce]",
    'echo name = "Veloce"',
    `echo base_url = ${tomlString(baseURL)}`,
    'echo wire_api = "responses"',
    "echo requires_openai_auth = true",
    ') > "%userprofile%\\.codex\\config.toml"',
    "(",
    "echo {",
    `echo   "OPENAI_API_KEY": ${JSON.stringify(apiKey)}`,
    "echo }",
    ') > "%userprofile%\\.codex\\auth.json"',
    "echo.",
    "echo Done! Codex CLI is ready.",
    "pause",
  ].join("\r\n")
}

function claudeUnixScript(baseURL: string, apiKey: string) {
  const base = shellQuote(baseURL)
  const key = shellQuote(apiKey)
  return [
    "bash << 'CLAUDE_SETUP'",
    "mkdir -p ~/.claude",
    `export VELOCE_BASE_URL=${base}`,
    `export VELOCE_API_KEY=${key}`,
    "[ -f ~/.claude/settings.json ] && cp ~/.claude/settings.json ~/.claude/settings.json.bak",
    "if command -v python3 >/dev/null 2>&1; then",
    "  python3 << 'VELOCE_CLAUDE_SETTINGS'",
    "import json",
    "import os",
    "from pathlib import Path",
    "",
    'path = Path.home() / ".claude" / "settings.json"',
    'raw = path.read_text(encoding="utf-8").strip() if path.exists() else "{}"',
    "try:",
    "    settings = json.loads(raw or '{}')",
    "except Exception:",
    "    settings = {}",
    "if not isinstance(settings, dict):",
    "    settings = {}",
    'settings.pop("claudeCode.environmentVariables", None)',
    'env = settings.setdefault("env", {})',
    "if not isinstance(env, dict):",
    "    env = settings['env'] = {}",
    'env["ANTHROPIC_BASE_URL"] = os.environ["VELOCE_BASE_URL"]',
    'env["ANTHROPIC_AUTH_TOKEN"] = os.environ["VELOCE_API_KEY"]',
    'env["CLAUDE_CODE_AUTO_COMPACT_WINDOW"] = "250000"',
    'env["CLAUDE_CODE_ATTRIBUTION_HEADER"] = "0"',
    'path.write_text(json.dumps(settings, ensure_ascii=False, indent=2) + "\\n", encoding="utf-8")',
    'print(f"Claude Code settings merged into {path}")',
    "VELOCE_CLAUDE_SETTINGS",
    "else",
    "  cat > ~/.claude/settings.json << 'CLAUDE_SETTINGS'",
    JSON.stringify({ env: claudeEnvironment(baseURL, apiKey) }, null, 2),
    "CLAUDE_SETTINGS",
    "fi",
    "cat > ~/.claude/veloce-env.sh << 'CLAUDE_ENV'",
    `export ANTHROPIC_BASE_URL=${base}`,
    `export ANTHROPIC_AUTH_TOKEN=${key}`,
    'export CLAUDE_CODE_AUTO_COMPACT_WINDOW="250000"',
    'export CLAUDE_CODE_ATTRIBUTION_HEADER="0"',
    "CLAUDE_ENV",
    "chmod 600 ~/.claude/settings.json ~/.claude/veloce-env.sh",
    'plugin_settings_paths="$HOME/.config/Devin/User/settings.json',
    '$HOME/.config/Windsurf/User/settings.json"',
    'if [ "$(uname -s)" = "Darwin" ]; then',
    '  plugin_settings_paths="$HOME/Library/Application Support/Devin/User/settings.json',
    '$HOME/Library/Application Support/Windsurf/User/settings.json"',
    "fi",
    "if command -v python3 >/dev/null 2>&1; then",
    "  printf '%s\\n' \"$plugin_settings_paths\" | while IFS= read -r plugin_settings_path; do",
    "    [ -n \"$plugin_settings_path\" ] || continue",
    "    mkdir -p \"$(dirname \"$plugin_settings_path\")\"",
    "    [ -f \"$plugin_settings_path\" ] || printf '{}\\n' > \"$plugin_settings_path\"",
    "    cp \"$plugin_settings_path\" \"$plugin_settings_path.bak.veloce\"",
    "    VELOCE_PLUGIN_SETTINGS_PATH=\"$plugin_settings_path\" python3 << 'VELOCE_PLUGIN_JSON'",
    "import json",
    "import os",
    "",
    'path = os.environ["VELOCE_PLUGIN_SETTINGS_PATH"]',
    'with open(path, "r", encoding="utf-8") as handle:',
    '    raw = handle.read().strip()',
    "try:",
    "    settings = json.loads(raw or '{}')",
    "except Exception:",
    '    print(f"Skipped plugin settings: {path} is not valid JSON.")',
    "    raise SystemExit(0)",
    "if not isinstance(settings, dict):",
    "    settings = {}",
    'settings["claudeCode.environmentVariables"] = [',
    '    {"name": "ANTHROPIC_AUTH_TOKEN", "value": os.environ["VELOCE_API_KEY"]},',
    '    {"name": "ANTHROPIC_BASE_URL", "value": os.environ["VELOCE_BASE_URL"]},',
    '    {"name": "CLAUDE_CODE_AUTO_COMPACT_WINDOW", "value": "250000"},',
    '    {"name": "CLAUDE_CODE_ATTRIBUTION_HEADER", "value": "0"},',
    "]",
    'with open(path, "w", encoding="utf-8") as handle:',
    "    json.dump(settings, handle, ensure_ascii=False, indent=2)",
    '    handle.write("\\n")',
    'print(f"Plugin settings merged into {path}")',
    "VELOCE_PLUGIN_JSON",
    "  done",
    "else",
    '  echo "python3 not found; skipped Devin/Windsurf plugin settings merge."',
    "fi",
    'echo "Claude Code config written to ~/.claude/settings.json"',
    'echo "Devin and Windsurf plugin configs merged when possible."',
    'echo "Optional: run source ~/.claude/veloce-env.sh before starting Claude Code in this shell."',
    "CLAUDE_SETUP",
  ].join("\n")
}

function claudeWindowsScript(baseURL: string, apiKey: string) {
  return [
    "@echo off",
    "chcp 65001 >nul",
    "echo Veloce - Claude Code One-Click Setup",
    "echo.",
    `set "VELOCE_BASE_URL=${batchValue(baseURL)}"`,
    `set "VELOCE_API_KEY=${batchValue(apiKey)}"`,
    'if not exist "%userprofile%\\.claude" mkdir "%userprofile%\\.claude"',
    "powershell -NoProfile -ExecutionPolicy Bypass -Command ^",
    "  \"$ErrorActionPreference='Stop';\" ^",
    "  \"$path = Join-Path $env:USERPROFILE '.claude\\settings.json';\" ^",
    "  \"New-Item -ItemType Directory -Force -Path (Split-Path $path) | Out-Null;\" ^",
    "  \"if (Test-Path $path) { Copy-Item $path ($path + '.bak') -Force; $raw = Get-Content $path -Raw } else { $raw = '{}' };\" ^",
    "  \"try { $settings = $raw | ConvertFrom-Json -ErrorAction Stop } catch { $settings = [pscustomobject]@{} };\" ^",
    "  \"if ($null -eq $settings -or $settings -isnot [pscustomobject]) { $settings = [pscustomobject]@{} };\" ^",
    "  \"if ($settings.PSObject.Properties.Name -contains 'claudeCode.environmentVariables') { $settings.PSObject.Properties.Remove('claudeCode.environmentVariables') };\" ^",
    "  \"if ($null -eq $settings.env -or $settings.env -isnot [pscustomobject]) { $settings | Add-Member -NotePropertyName env -NotePropertyValue ([pscustomobject]@{}) -Force };\" ^",
    "  \"$settings.env | Add-Member -NotePropertyName 'ANTHROPIC_BASE_URL' -NotePropertyValue $env:VELOCE_BASE_URL -Force;\" ^",
    "  \"$settings.env | Add-Member -NotePropertyName 'ANTHROPIC_AUTH_TOKEN' -NotePropertyValue $env:VELOCE_API_KEY -Force;\" ^",
    "  \"$settings.env | Add-Member -NotePropertyName 'CLAUDE_CODE_AUTO_COMPACT_WINDOW' -NotePropertyValue '250000' -Force;\" ^",
    "  \"$settings.env | Add-Member -NotePropertyName 'CLAUDE_CODE_ATTRIBUTION_HEADER' -NotePropertyValue '0' -Force;\" ^",
    "  \"$settings | ConvertTo-Json -Depth 12 | Set-Content -Encoding UTF8 $path;\" ^",
    "  \"Write-Host ('Claude Code settings merged into ' + $path);\"",
    "(",
    "echo @echo off",
    "echo set ANTHROPIC_BASE_URL=%VELOCE_BASE_URL%",
    "echo set ANTHROPIC_AUTH_TOKEN=%VELOCE_API_KEY%",
    "echo set CLAUDE_CODE_AUTO_COMPACT_WINDOW=250000",
    "echo set CLAUDE_CODE_ATTRIBUTION_HEADER=0",
    ") > \"%userprofile%\\.claude\\veloce-env.bat\"",
    "powershell -NoProfile -ExecutionPolicy Bypass -Command ^",
    "  \"$ErrorActionPreference='Stop';\" ^",
    "  \"$targets = @((Join-Path $env:APPDATA 'Devin\\User\\settings.json'), (Join-Path $env:APPDATA 'Windsurf\\User\\settings.json'));\" ^",
    "  \"$variables = @([pscustomobject]@{ name='ANTHROPIC_AUTH_TOKEN'; value=$env:VELOCE_API_KEY }, [pscustomobject]@{ name='ANTHROPIC_BASE_URL'; value=$env:VELOCE_BASE_URL }, [pscustomobject]@{ name='CLAUDE_CODE_AUTO_COMPACT_WINDOW'; value='250000' }, [pscustomobject]@{ name='CLAUDE_CODE_ATTRIBUTION_HEADER'; value='0' });\" ^",
    "  \"foreach ($path in $targets) { New-Item -ItemType Directory -Force -Path (Split-Path $path) | Out-Null; if (Test-Path $path) { Copy-Item $path ($path + '.bak.veloce') -Force; $raw = Get-Content $path -Raw } else { $raw = '{}' }; try { $settings = $raw | ConvertFrom-Json -ErrorAction Stop } catch { Write-Host ('Skipped plugin settings: ' + $path); continue }; if ($null -eq $settings -or $settings -isnot [pscustomobject]) { $settings = [pscustomobject]@{} }; $settings | Add-Member -NotePropertyName 'claudeCode.environmentVariables' -NotePropertyValue $variables -Force; $settings | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $path; Write-Host ('Plugin settings merged into ' + $path) };\"",
    "echo.",
    'echo Done! Claude Code config written to "%userprofile%\\.claude\\settings.json"',
    'echo Devin and Windsurf plugin configs merged under "%APPDATA%" when possible.',
    'echo Optional: run "%userprofile%\\.claude\\veloce-env.bat" before starting Claude Code in CMD.',
    "pause",
  ].join("\r\n")
}

function openCodeConfig(baseURL: string, apiKey: string) {
  const model = (name: string, context: number, output: number, options?: Record<string, unknown>) => ({ name, limit: { context, output }, ...(options ? { options } : {}) })
  const reasoningVariants = { low: {}, medium: {}, high: {}, xhigh: {} }
  return {
    provider: {
      openai: {
        options: { baseURL: `${baseURL}/v1`, apiKey },
        models: {
          "gpt-5.2": { ...model("GPT-5.2", 400000, 128000, { store: false }), variants: reasoningVariants },
          "claude-opus-4-6": { ...model("Claude Opus 4.6", 200000, 128000), modalities: { input: ["text", "image", "pdf"], output: ["text"] } },
          "gpt-5.5": { ...model("GPT-5.5", 1050000, 128000, { store: false }), variants: reasoningVariants },
          "gpt-5.4": { ...model("GPT-5.4", 1050000, 128000, { store: false }), variants: reasoningVariants },
          "gpt-5.4-mini": { ...model("GPT-5.4 Mini", 400000, 128000, { store: false }), variants: reasoningVariants },
          "gpt-5.3-codex-spark": { ...model("GPT-5.3 Codex Spark", 128000, 32000, { store: false }), variants: reasoningVariants },
          "gpt-5.3-codex": { ...model("GPT-5.3 Codex", 400000, 128000, { store: false }), variants: reasoningVariants },
          "codex-mini-latest": { ...model("Codex Mini", 200000, 100000, { store: false }), variants: { low: {}, medium: {}, high: {} } },
        },
      },
    },
    agent: { build: { options: { store: false } }, plan: { options: { store: false } } },
    $schema: "https://opencode.ai/config.json",
  }
}

function claudeEnvironment(baseURL: string, apiKey: string) {
  return {
    ANTHROPIC_BASE_URL: baseURL,
    ANTHROPIC_AUTH_TOKEN: apiKey,
    CLAUDE_CODE_AUTO_COMPACT_WINDOW: "250000",
    CLAUDE_CODE_ATTRIBUTION_HEADER: "0",
  }
}

function tomlString(value: string) {
  return JSON.stringify(value)
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

function batchValue(value: string) {
  return value.replace(/"/g, '""')
}

interface ClientCopy {
  title: string
  defaultKeyName: string
  description: (name: string) => string
  securityNotice: string
  macLinux: string
  codexHelp: string
  claudeHelp: string
  openCodeHelp: string
  copyHint: string
  copy: string
}

const zhCopy: ClientCopy = {
  title: "导入客户端配置",
  defaultKeyName: "当前令牌",
  description: (name) => `为“${name}”生成可直接复制的客户端配置。`,
  securityNotice: "配置中包含此令牌。请只在受信任的个人设备上粘贴和保存；轮换或删除令牌后，旧配置会立即失效。脚本会先备份已有的 Codex / Claude 配置。",
  macLinux: "macOS / Linux",
  codexHelp: "复制后粘贴到终端执行。脚本会写入 ~/.codex/config.toml 和 ~/.codex/auth.json。",
  claudeHelp: "复制后粘贴到终端执行。Claude Code 本体仅写入 ~/.claude/settings.json，并会清理误放在其中的 claudeCode.environmentVariables。",
  openCodeHelp: "复制完整 JSON，保存为 OpenCode 配置文件（通常是 ~/.config/opencode/opencode.json；Windows 为 %USERPROFILE%\\.config\\opencode\\opencode.json）。",
  copyHint: "内容包含令牌，请妥善保存。",
  copy: "一键复制",
}

const enCopy: ClientCopy = {
  title: "Import client configuration",
  defaultKeyName: "this API key",
  description: (name) => `Generate copy-ready client configuration for “${name}”.`,
  securityNotice: "These configurations contain this API key. Only paste and save them on trusted personal devices. Rotating or deleting the key immediately invalidates old configurations. The scripts back up existing Codex / Claude settings first.",
  macLinux: "macOS / Linux",
  codexHelp: "Copy and run this in a terminal. It writes ~/.codex/config.toml and ~/.codex/auth.json.",
  claudeHelp: "Copy and run this in a terminal. Claude Code itself only uses ~/.claude/settings.json; the script removes any misplaced claudeCode.environmentVariables field.",
  openCodeHelp: "Copy the complete JSON into your OpenCode configuration file (usually ~/.config/opencode/opencode.json; on Windows, %USERPROFILE%\\.config\\opencode\\opencode.json).",
  copyHint: "This content contains the API key. Store it safely.",
  copy: "Copy",
}
