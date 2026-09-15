#!/usr/bin/env bash
#
# Veloce installer for Linux, macOS, WSL and Git Bash.
#
# Checks that git, Node.js and Yarn are usable (offering to install what is
# missing), clones the repository into a directory you choose, installs the
# dependencies and starts the server. Everything it may do outside the target
# directory is asked for first.
#
# Run it directly, or straight from the repository:
#   curl -fsSL https://raw.githubusercontent.com/veloce-ailab/veloce-lab/main/scripts/install.sh | bash
set -eu

REPO_URL="${VELOCE_REPO:-https://github.com/veloce-ailab/veloce-lab}"
BRANCH="${VELOCE_BRANCH:-main}"
TARGET=""
PORT=""
MODE=""
ASSUME_YES=0
DRY_RUN=0
START_AFTER=1
MIN_NODE_MAJOR=22
MIN_NODE_MINOR=5
RECOMMENDED_NODE=24

say()  { printf '%s\n' "$*"; }
step() { printf '\n== %s\n' "$*"; }
warn() { printf '! %s\n' "$*" >&2; }
die()  { printf 'x %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Veloce installer

Usage: install.sh [options]

  --dir <path>      directory to install into (default: the current one when it
                    is empty, otherwise ./veloce-lab)
  --branch <name>   git branch or tag to clone (default: main)
  --repo <url>      repository to clone (default: the official one)
  --port <number>   port the server listens on (default: whatever the cloned
                    yumeri.json says, normally 3000)
  --mode dev|prod   dev starts without a build (default); prod builds first
  --no-start        install only, do not start the server
  --yes             accept every default, install nothing without asking
  --dry-run         print what would happen and change nothing
  --help            this text
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dir) TARGET="${2:-}"; shift 2 ;;
    --branch) BRANCH="${2:-}"; shift 2 ;;
    --repo) REPO_URL="${2:-}"; shift 2 ;;
    --port) PORT="${2:-}"; shift 2 ;;
    --mode) MODE="${2:-}"; shift 2 ;;
    --no-start) START_AFTER=0; shift ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) die "unknown option: $1 (try --help)"; ;;
  esac
done

# The script is often piped into a shell, and then stdin is the script itself:
# prompts would eat it instead of reaching the user. Reopen the terminal.
if [ ! -t 0 ]; then
  if [ -r /dev/tty ]; then
    exec </dev/tty
  else
    ASSUME_YES=1
    warn "no terminal to ask questions on; continuing with the defaults"
  fi
fi

# ---------------------------------------------------------------- prompting --
# `ask "question" "default"` prints the answer; `confirm "question" y|n` says
# whether the user agreed. `--yes` answers both with their default.
ask() {
  if [ "$ASSUME_YES" = "1" ]; then printf '%s' "$2"; return; fi
  printf '%s [%s]: ' "$1" "$2" >&2
  IFS= read -r answer || answer=""
  [ -n "$answer" ] || answer="$2"
  printf '%s' "$answer"
}
confirm() {
  local default="${2:-y}"
  if [ "$ASSUME_YES" = "1" ]; then [ "$default" = "y" ]; return $?; fi
  local hint="y/N"
  [ "$default" = "y" ] && hint="Y/n"
  printf '%s [%s]: ' "$1" "$hint" >&2
  IFS= read -r answer || answer=""
  [ -n "$answer" ] || answer="$default"
  case "$answer" in y|Y|yes|YES|Yes) return 0 ;; *) return 1 ;; esac
}

run() {
  if [ "$DRY_RUN" = "1" ]; then
    say "  (dry run) $*"
    return 0
  fi
  "$@"
}

# ---------------------------------------------------------------- platform --
PLATFORM="unknown"
case "$(uname -s 2>/dev/null || echo unknown)" in
  Linux*) PLATFORM=linux ;;
  Darwin*) PLATFORM=macos ;;
  MINGW*|MSYS*|CYGWIN*) PLATFORM=windows ;;
esac

SUDO=""
[ "$PLATFORM" = "linux" ] && [ "$(id -u 2>/dev/null || echo 0)" != "0" ] && command -v sudo >/dev/null 2>&1 && SUDO="sudo"

# The package manager this machine installs system packages with, if any.
PACKAGE_MANAGER=""
PACKAGE_INSTALL=""
for candidate in brew apt-get dnf yum pacman zypper apk; do
  if command -v "$candidate" >/dev/null 2>&1; then
    PACKAGE_MANAGER="$candidate"
    break
  fi
done
case "$PACKAGE_MANAGER" in
  brew) PACKAGE_INSTALL="brew install" ;;
  apt-get) PACKAGE_INSTALL="$SUDO apt-get install -y" ;;
  dnf) PACKAGE_INSTALL="$SUDO dnf install -y" ;;
  yum) PACKAGE_INSTALL="$SUDO yum install -y" ;;
  pacman) PACKAGE_INSTALL="$SUDO pacman -S --noconfirm" ;;
  zypper) PACKAGE_INSTALL="$SUDO zypper install -y" ;;
  apk) PACKAGE_INSTALL="$SUDO apk add" ;;
esac

# Package names differ between distributions, so the caller passes one per
# manager and this picks the right one.
package_name() {
  case "$PACKAGE_MANAGER:$1" in
    apt-get:git) echo git ;;
    dnf:git|yum:git|zypper:git) echo git ;;
    pacman:git) echo git ;;
    apk:git) echo git ;;
    brew:git) echo git ;;
    apt-get:node) echo nodejs ;;
    dnf:node|yum:node|zypper:node) echo nodejs ;;
    pacman:node) echo nodejs ;;
    apk:node) echo nodejs ;;
    brew:node) echo node ;;
    *) echo "" ;;
  esac
}

install_with_package_manager() {
  local what="$1" name
  name="$(package_name "$what")"
  if [ -z "$PACKAGE_INSTALL" ] || [ -z "$name" ]; then
    return 1
  fi
  say "  $PACKAGE_INSTALL $name"
  run $PACKAGE_INSTALL "$name"
}

# ------------------------------------------------------------------- checks --
version_at_least() {
  # version_at_least "24.16.0" 22 5
  local version="$1" want_major="$2" want_minor="$3"
  local major minor
  major="${version%%.*}"
  minor="$(printf '%s' "$version" | cut -d. -f2)"
  [ -n "$minor" ] || minor=0
  [ "$major" -gt "$want_major" ] 2>/dev/null && return 0
  [ "$major" -eq "$want_major" ] 2>/dev/null && [ "$minor" -ge "$want_minor" ] && return 0
  return 1
}

node_version() {
  command -v node >/dev/null 2>&1 || return 1
  node -v 2>/dev/null | sed 's/^v//'
}

ensure_git() {
  command -v git >/dev/null 2>&1 && return 0
  warn "git is not installed"
  if confirm "Install git now?" y; then
    if install_with_package_manager git; then
      command -v git >/dev/null 2>&1 && return 0
    fi
    die "could not install git automatically; install it and run this script again (https://git-scm.com/downloads)"
  fi
  die "git is required to clone the repository (https://git-scm.com/downloads)"
}

ensure_node() {
  local version
  version="$(node_version || true)"
  if [ -n "$version" ] && version_at_least "$version" "$MIN_NODE_MAJOR" "$MIN_NODE_MINOR"; then
    say "  node $(node -v)"
    return 0
  fi
  if [ -n "$version" ]; then
    warn "node $version is too old: this project needs ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR} or newer (Node ${RECOMMENDED_NODE} LTS recommended)"
  else
    warn "node is not installed (this project needs ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}+, Node ${RECOMMENDED_NODE} LTS recommended)"
  fi

  # nvm keeps a usable Node next to the user's shell, which is the least
  # invasive way to get the right version where it exists.
  for nvm_sh in "${NVM_DIR:-$HOME/.nvm}/nvm.sh" "$HOME/.nvm/nvm.sh" "/usr/local/opt/nvm/nvm.sh"; do
    if [ -s "$nvm_sh" ]; then
      if confirm "Install Node ${RECOMMENDED_NODE} with nvm ($nvm_sh)?" y; then
        # shellcheck disable=SC1090
        . "$nvm_sh"
        run nvm install "$RECOMMENDED_NODE"
        run nvm use "$RECOMMENDED_NODE"
        version="$(node_version || true)"
        if [ -n "$version" ] && version_at_least "$version" "$MIN_NODE_MAJOR" "$MIN_NODE_MINOR"; then
          say "  node $(node -v)"
          return 0
        fi
      fi
      break
    fi
  done

  if [ -n "$PACKAGE_INSTALL" ] && confirm "Install or upgrade Node with $PACKAGE_MANAGER?" y; then
    if install_with_package_manager node; then
      version="$(node_version || true)"
      if [ -n "$version" ] && version_at_least "$version" "$MIN_NODE_MAJOR" "$MIN_NODE_MINOR"; then
        say "  node $(node -v)"
        return 0
      fi
    fi
  fi
  die "node ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}+ is required; get it from https://nodejs.org or with nvm (https://github.com/nvm-sh/nvm)"
}

# Yarn comes from corepack when it can, because the repository pins the version
# it wants in package.json ("packageManager"). A global Yarn 1 would ignore that
# pin, so it is deliberately not used when corepack is available.
YARN=""
ensure_yarn() {
  local version="" corepack_usable=0
  if command -v corepack >/dev/null 2>&1; then
    corepack_usable=1
    version="$(corepack yarn --version 2>/dev/null || true)"
  fi
  if command -v yarn >/dev/null 2>&1; then
    local global
    global="$(yarn --version 2>/dev/null || true)"
    case "$global" in
      1.*) warn "the installed yarn is $global; the repository pins 4.x, so corepack will be used instead" ;;
      "") : ;;
      *) say "  yarn $global"; YARN="yarn"; return 0 ;;
    esac
  fi

  if [ "$corepack_usable" = "1" ] && [ -n "$version" ]; then
    # `corepack enable` writes shims next to node and may need administrator
    # rights; when it fails, `corepack yarn` still runs the pinned version.
    run corepack enable >/dev/null 2>&1 || true
    if command -v yarn >/dev/null 2>&1 && [ "$(yarn --version 2>/dev/null || true)" != "1."* ]; then
      say "  yarn $(yarn --version)"
      YARN="yarn"
      return 0
    fi
    say "  corepack yarn $version"
    YARN="corepack yarn"
    return 0
  fi

  warn "yarn is not available"
  if [ "$corepack_usable" != "1" ]; then
    if command -v npm >/dev/null 2>&1 && confirm "Install Yarn globally with npm?" y; then
      run npm install -g yarn
      if command -v yarn >/dev/null 2>&1; then
        say "  yarn $(yarn --version)"
        YARN="yarn"
        return 0
      fi
    fi
    die "yarn is required; install it from https://yarnpkg.com/getting-started/install (or install corepack, which ships with Node)"
  fi
  die "corepack is present but could not provide yarn; run 'corepack enable' yourself and try again"
}

# ------------------------------------------------------------------ target --
is_empty_dir() {
  [ -d "$1" ] || return 0
  [ -z "$(ls -A "$1" 2>/dev/null || true)" ]
}

repo_in() {
  [ -d "$1/.git" ] || return 1
  git -C "$1" remote get-url origin >/dev/null 2>&1
}

step "Veloce installer"
say "Repository: $REPO_URL"
say "Branch:     $BRANCH"
[ "$DRY_RUN" = "1" ] && say "Mode:       dry run (nothing will be changed)"

step "Checking git, Node.js and Yarn"
ensure_git
ensure_node
ensure_yarn

step "Choosing where to install"
CURRENT_DIR="$(pwd)"
if [ -z "$TARGET" ]; then
  if is_empty_dir "$CURRENT_DIR"; then
    TARGET="$(ask "Install into this directory ($CURRENT_DIR)?" "$CURRENT_DIR")"
  else
    TARGET="$(ask "This directory is not empty. Install into which directory?" "$CURRENT_DIR/veloce-lab")"
  fi
fi
case "$TARGET" in
  "~"*) TARGET="$HOME${TARGET#\~}" ;;
esac
say "  target: $TARGET"

if repo_in "$TARGET"; then
  if confirm "$TARGET already is a Veloce checkout. Update it with git pull instead of cloning?" y; then
    step "Updating the existing checkout"
    run git -C "$TARGET" fetch --prune origin
    run git -C "$TARGET" checkout "$BRANCH"
    run git -C "$TARGET" pull --ff-only origin "$BRANCH"
    CLONED=0
  else
    TARGET="$(ask "Clone into which other directory?" "$TARGET-2")"
    CLONED=2
  fi
else
  if [ -e "$TARGET" ] && ! is_empty_dir "$TARGET"; then
    if ! confirm "$TARGET is not empty; cloning into it may overwrite files. Continue?" n; then
      TARGET="$(ask "Clone into which other directory?" "$TARGET-2")"
    fi
  fi
  CLONED=1
fi

if [ "${CLONED:-1}" != "0" ]; then
  step "Cloning $REPO_URL into $TARGET"
  if [ "$DRY_RUN" != "1" ]; then
    mkdir -p "$(dirname "$TARGET")"
  fi
  run git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$TARGET"
  if [ "$DRY_RUN" != "1" ] && [ ! -d "$TARGET/.git" ]; then
    die "cloning failed; run 'git clone --branch $BRANCH $REPO_URL $TARGET' yourself to see why"
  fi
fi

# ------------------------------------------------------------------ install --
step "Installing dependencies"
if [ "$DRY_RUN" != "1" ]; then
  cd "$TARGET"
else
  say "  (dry run) cd $TARGET"
fi
# shellcheck disable=SC2086
run $YARN install

# --------------------------------------------------------------------- port --
if [ -z "$PORT" ] && [ "$DRY_RUN" != "1" ]; then
  DETECTED="$(sed -n 's/.*"port"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' yumeri.json 2>/dev/null | head -n 1)"
  [ -n "$DETECTED" ] || DETECTED=3000
  say ""
  PORT="$(ask "Which port should the server listen on?" "$DETECTED")"
fi
if [ -n "$PORT" ] && [ "$DRY_RUN" != "1" ] && [ -f yumeri.json ]; then
  CURRENT_PORT="$(sed -n 's/.*"port"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' yumeri.json 2>/dev/null | head -n 1)"
  if [ "$CURRENT_PORT" != "$PORT" ]; then
    say "  setting the port in yumeri.json to $PORT"
    sed "s/\"port\"[[:space:]]*:[[:space:]]*[0-9][0-9]*/\"port\": $PORT/" yumeri.json > yumeri.json.tmp && mv yumeri.json.tmp yumeri.json
  fi
fi
[ -n "$PORT" ] || PORT=3000

# -------------------------------------------------------------------- start --
if [ "$START_AFTER" != "1" ]; then
  step "Done"
  say "Dependencies installed in $TARGET."
  say "Start it with:  cd $TARGET && $YARN dev"
  exit 0
fi

if [ -z "$MODE" ]; then
  say ""
  say "How should it start?"
  say "  1) dev  - no build step, frontend served on the fly (recommended first run)"
  say "  2) prod - run the full build first, then start (slower, for a deployment)"
  MODE="$(ask "Choose 1 or 2" "1")"
fi
case "$MODE" in
  1|dev|development) MODE=dev ;;
  2|prod|production) MODE=prod ;;
  *) warn "unknown mode '$MODE'; using dev"; MODE=dev ;;
esac

if [ "$MODE" = "prod" ]; then
  step "Building all packages"
  # shellcheck disable=SC2086
  run $YARN build
  START_COMMAND="start"
else
  START_COMMAND="dev"
fi

step "Starting Veloce"
say "  cd $TARGET && $YARN $START_COMMAND"
say "  http://localhost:$PORT"
say ""
say "Press Ctrl+C to stop the server."
if [ "$DRY_RUN" = "1" ]; then
  say "(dry run) nothing was started"
  exit 0
fi
# shellcheck disable=SC2086
exec $YARN "$START_COMMAND"