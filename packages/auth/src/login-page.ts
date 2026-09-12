/**
 * The authentication page, served by this plugin as a plain document.
 *
 * It deliberately shares nothing with the dashboard bundle: nothing from the
 * application can be loaded before a session exists, so the page that creates
 * one has to stand on its own. Styles are inlined and keep the neutral palette
 * the application uses.
 */
export interface LoginPageOptions {
  /** Local path to open once a session exists. */
  next: string
}

interface Copy {
  title: string
  login: string
  register: string
  username: string
  email: string
  identifier: string
  password: string
  submitLogin: string
  submitRegister: string
  working: string
  agreementNotice: string
  agreementCheckbox: string
  agreementRequired: string
  setupRequired: string
  setupLink: string
  missingFields: string
  passwordTooShort: string
  failed: string
}

const copy: Record<string, Copy> = {
  zh: {
    title: "登录以继续",
    login: "登录",
    register: "注册",
    username: "用户名",
    email: "邮箱",
    identifier: "用户名或邮箱",
    password: "密码",
    submitLogin: "登录",
    submitRegister: "创建账户",
    working: "处理中…",
    agreementNotice: "继续即表示你已阅读并同意相关协议。",
    agreementCheckbox: "我已阅读并同意相关协议",
    agreementRequired: "请先勾选同意相关协议",
    setupRequired: "这个实例还没有初始化。",
    setupLink: "前往初始化",
    missingFields: "请填写所有字段",
    passwordTooShort: "密码至少需要 8 位",
    failed: "操作失败",
  },
  en: {
    title: "Sign in to continue",
    login: "Sign in",
    register: "Register",
    username: "Username",
    email: "Email",
    identifier: "Username or email",
    password: "Password",
    submitLogin: "Sign in",
    submitRegister: "Create account",
    working: "Working…",
    agreementNotice: "By continuing you agree to the terms of service.",
    agreementCheckbox: "I have read and agree to the terms of service",
    agreementRequired: "Please accept the terms first",
    setupRequired: "This instance has not been set up yet.",
    setupLink: "Continue to setup",
    missingFields: "Fill in every field",
    passwordTooShort: "The password needs at least 8 characters",
    failed: "Something went wrong",
  },
  ja: {
    title: "続行するにはログインしてください",
    login: "ログイン",
    register: "登録",
    username: "ユーザー名",
    email: "メール",
    identifier: "ユーザー名またはメール",
    password: "パスワード",
    submitLogin: "ログイン",
    submitRegister: "アカウントを作成",
    working: "処理中…",
    agreementNotice: "続行すると利用規約に同意したものとみなされます。",
    agreementCheckbox: "利用規約を読み、同意します",
    agreementRequired: "先に利用規約に同意してください",
    setupRequired: "このインスタンスはまだ初期化されていません。",
    setupLink: "初期設定へ進む",
    missingFields: "すべての項目を入力してください",
    passwordTooShort: "パスワードは 8 文字以上必要です",
    failed: "処理に失敗しました",
  },
}

/** Serialises a value for embedding inside a `<script>` block. */
function embed(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c")
}

function escapeHTML(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char)
}

export function renderLoginPage({ next }: LoginPageOptions) {
  const fallback = copy.zh
  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Veloce</title>
<style>
:root{color-scheme:dark;--bg:oklch(0.145 0 0);--panel:oklch(0.205 0 0);--fg:oklch(0.985 0 0);--muted:oklch(0.708 0 0);--border:oklch(1 0 0 / 12%);--field:oklch(1 0 0 / 4%);--primary:oklch(0.922 0 0);--primary-fg:oklch(0.205 0 0);--danger:oklch(0.704 0.191 22.216)}
@media (prefers-color-scheme:light){:root{color-scheme:light;--bg:#fff;--panel:#fff;--fg:oklch(0.145 0 0);--muted:oklch(0.556 0 0);--border:oklch(0 0 0 / 10%);--field:oklch(0 0 0 / 2%);--primary:oklch(0.205 0 0);--primary-fg:oklch(0.985 0 0)}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bg);color:var(--fg);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Inter,sans-serif;-webkit-font-smoothing:antialiased}
.card{width:100%;max-width:400px;border:1px solid var(--border);background:var(--panel);border-radius:14px;padding:28px;box-shadow:0 1px 3px 0 rgb(0 0 0 / 10%),0 1px 2px -1px rgb(0 0 0 / 10%)}
.brand{font-size:20px;font-weight:600;letter-spacing:-0.01em}
.subtitle{margin:6px 0 0;color:var(--muted);font-size:13px}
.tabs{display:flex;gap:4px;margin:20px 0 0;padding:3px;border:1px solid var(--border);border-radius:10px;background:var(--field)}
.tabs[hidden]{display:none}
.tab{flex:1;height:32px;border:0;border-radius:7px;background:transparent;color:var(--muted);font:inherit;font-weight:500;cursor:pointer}
.tab.is-active{background:var(--panel);color:var(--fg);box-shadow:0 1px 2px rgb(0 0 0 / 12%)}
form{display:flex;flex-direction:column;gap:14px;margin-top:20px}
label.field{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:500}
label.field[hidden]{display:none}
input[type=text],input[type=email],input[type=password]{height:38px;width:100%;padding:0 12px;border:1px solid var(--border);border-radius:9px;background:var(--field);color:var(--fg);font:inherit;outline:none}
input:focus-visible{border-color:var(--primary);box-shadow:0 0 0 3px color-mix(in oklab,var(--primary) 25%,transparent)}
label.check{display:flex;align-items:center;gap:10px;font-size:13px;font-weight:400;color:var(--muted)}
label.check[hidden]{display:none}
.notice{margin:0;font-size:12px;color:var(--muted)}
.notice[hidden]{display:none}
button.primary{height:40px;border:0;border-radius:9px;background:var(--primary);color:var(--primary-fg);font:inherit;font-weight:600;cursor:pointer}
button.primary:disabled{opacity:.6;cursor:progress}
.alert{margin:0;font-size:13px;color:var(--danger)}
.alert[hidden]{display:none}
.hint{margin:16px 0 0;font-size:13px;color:var(--muted)}
.hint[hidden]{display:none}
.hint a{color:var(--fg)}
</style>
</head>
<body>
<main class="card">
  <div class="brand" id="site-name">Veloce</div>
  <p class="subtitle" data-label="title">${escapeHTML(fallback.title)}</p>
  <div class="tabs" id="tabs" hidden>
    <button type="button" class="tab is-active" id="tab-login" data-mode="login" data-label="login">${escapeHTML(fallback.login)}</button>
    <button type="button" class="tab" id="tab-register" data-mode="register" data-label="register">${escapeHTML(fallback.register)}</button>
  </div>
  <form id="form" novalidate>
    <label class="field" id="field-username" hidden><span data-label="username">${escapeHTML(fallback.username)}</span><input id="username" type="text" autocomplete="username" /></label>
    <label class="field" id="field-email" hidden><span data-label="email">${escapeHTML(fallback.email)}</span><input id="email" type="email" autocomplete="email" /></label>
    <label class="field" id="field-identifier"><span data-label="identifier">${escapeHTML(fallback.identifier)}</span><input id="identifier" type="text" autocomplete="username" /></label>
    <label class="field" id="field-password"><span data-label="password">${escapeHTML(fallback.password)}</span><input id="password" type="password" autocomplete="current-password" /></label>
    <label class="check" id="agreement" hidden><input id="agreement-box" type="checkbox" /><span data-label="agreementCheckbox">${escapeHTML(fallback.agreementCheckbox)}</span></label>
    <p class="notice" id="notice" hidden></p>
    <p class="alert" id="alert" hidden></p>
    <button class="primary" id="submit" type="submit">${escapeHTML(fallback.submitLogin)}</button>
  </form>
  <p class="hint" id="setup-hint" hidden></p>
</main>
<script type="module">
const NEXT = ${embed(next)}
const COPY = ${embed(copy)}
const language = (() => {
  const value = (navigator.language || "en").toLowerCase()
  if (value.startsWith("zh")) return "zh"
  if (value.startsWith("ja")) return "ja"
  return "en"
})()
const text = COPY[language] || COPY.en
const $ = (id) => document.getElementById(id)
let mode = "login"
let registrationEnabled = false
let agreementMode = "notice"
let busy = false

for (const node of document.querySelectorAll("[data-label]")) {
  const value = text[node.dataset.label]
  if (value) node.textContent = value
}

function showAlert(message) {
  const alert = $("alert")
  alert.textContent = message || ""
  alert.hidden = !message
}

function applyMode() {
  const registering = mode === "register"
  $("tab-login").classList.toggle("is-active", !registering)
  $("tab-register").classList.toggle("is-active", registering)
  $("field-identifier").hidden = registering
  $("field-username").hidden = !registering
  $("field-email").hidden = !registering
  $("password").setAttribute("autocomplete", registering ? "new-password" : "current-password")
  $("submit").textContent = registering ? text.submitRegister : text.submitLogin
}

function setBusy(value) {
  busy = value
  $("submit").disabled = value
  if (value) $("submit").textContent = text.working
  else applyMode()
}

async function request(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || text.failed)
  return payload
}

async function enter(identifier, password) {
  const result = await request("/auth/password/login", { identifier, password, agreement_accepted: true })
  localStorage.setItem("token", result.token || "")
  location.replace(NEXT || "/")
}

async function submit(event) {
  event.preventDefault()
  if (busy) return
  if (agreementMode === "checkbox" && !$("agreement-box").checked) {
    showAlert(text.agreementRequired)
    return
  }
  const registering = mode === "register"
  const password = $("password").value
  const identifier = (registering ? $("username").value : $("identifier").value).trim()
  const email = registering ? $("email").value.trim() : ""
  if (!identifier || !password || (registering && !email)) {
    showAlert(text.missingFields)
    return
  }
  if (registering && password.length < 8) {
    showAlert(text.passwordTooShort)
    return
  }
  setBusy(true)
  showAlert("")
  try {
    if (registering) {
      await request("/auth/password/register", { username: identifier, email, password, agreement_accepted: true })
    }
    await enter(identifier, password)
  } catch (error) {
    setBusy(false)
    showAlert(error instanceof Error ? error.message : text.failed)
  }
}

$("form").addEventListener("submit", submit)
$("tab-login").addEventListener("click", () => { mode = "login"; showAlert(""); applyMode() })
$("tab-register").addEventListener("click", () => { mode = "register"; showAlert(""); applyMode() })

async function boot() {
  try {
    const [configuration, settings, setup] = await Promise.all([
      fetch("/api/configuration").then((response) => (response.ok ? response.json() : {})),
      fetch("/api/public/settings").then((response) => (response.ok ? response.json() : {})),
      fetch("/api/setup/status").then((response) => (response.ok ? response.json() : {})),
    ])
    if (settings.site_name) {
      document.title = settings.site_name
      $("site-name").textContent = settings.site_name
    }
    if (setup.required) {
      const hint = $("setup-hint")
      hint.append(text.setupRequired + " ")
      const link = document.createElement("a")
      link.href = "/setup"
      link.textContent = text.setupLink
      hint.append(link)
      hint.hidden = false
    }
    agreementMode = String(configuration.auth_agreement_mode || "notice").toLowerCase()
    registrationEnabled = configuration.password_registration_enabled === true
    $("tabs").hidden = !registrationEnabled
    if (agreementMode === "checkbox") $("agreement").hidden = false
    else {
      $("notice").textContent = text.agreementNotice
      $("notice").hidden = false
    }
  } catch {
    // Defaults keep the page usable when the configuration cannot be read.
  }
  applyMode()
}

void boot()
</script>
</body>
</html>
`
}
