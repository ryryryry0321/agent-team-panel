#!/usr/bin/env bash
#
# Agent Team Panel — install script for quick install
# https://github.com/ryryryry0321/agent-team-panel
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/ryryryry0321/agent-team-panel/main/install.sh | bash
#
# Options (via environment variables):
#   INSTALL_DIR   — where to install (default: ~/.agent-team-panel)
#   SKIP_CONFIRM  — set to 1 to skip the confirmation prompt
#

set -euo pipefail

REPO="ryryryry0321/agent-team-panel"
INSTALL_DIR="${INSTALL_DIR:-${HOME}/.agent-team-panel}"
BIN_NAME="agent-team-panel"

# ---- Terminal helpers ----

use_color=false
if [ -t 1 ] && command -v tput &>/dev/null && [ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]; then
  use_color=true
fi

red()   { $use_color && printf "\033[31m%s\033[0m\n" "$1" || echo "$1"; }
green() { $use_color && printf "\033[32m%s\033[0m\n" "$1" || echo "$1"; }
bold()  { $use_color && printf "\033[1m%s\033[0m\n" "$1"  || echo "$1"; }

info()  { echo "  $1"; }
abort() { red "Error: $1" >&2; exit 1; }

# ---- OS detection ----

detect_os() {
  case "$(uname -s)" in
    Darwin) echo "macos" ;;
    Linux)  echo "linux" ;;
    *)      abort "Unsupported OS: $(uname -s). Only macOS and Linux are supported." ;;
  esac
}

OS="$(detect_os)"

# ---- Prerequisite checks ----

check_prerequisites() {
  local missing=()

  for cmd in node npm git tmux; do
    if ! command -v "$cmd" &>/dev/null; then
      missing+=("$cmd")
    fi
  done

  if [ ${#missing[@]} -gt 0 ]; then
    red "Missing required tools: ${missing[*]}"
    echo ""
    if [ "$OS" = "macos" ]; then
      info "Install with:  brew install ${missing[*]}"
    else
      info "Install with:  sudo apt install ${missing[*]}  (or your package manager)"
    fi
    exit 1
  fi

  local node_major
  node_major=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$node_major" -lt 18 ]; then
    abort "Node.js >= 18 is required (found $(node -v))"
  fi
}

# ---- Confirmation ----

confirm() {
  if [ "${SKIP_CONFIRM:-0}" = "1" ]; then
    return 0
  fi

  echo ""
  bold "The following will be installed:"
  echo ""
  info "Repository:    https://github.com/${REPO}"
  info "Install to:    ${INSTALL_DIR}"
  info "Command:       ${BIN_NAME}"
  echo ""

  printf "  Proceed? [Y/n] "
  read -r reply </dev/tty
  case "$reply" in
    [nN]*) echo "Aborted."; exit 0 ;;
  esac
}

# ---- Install ----

do_install() {
  if [ -d "${INSTALL_DIR}/.git" ]; then
    bold "Updating existing installation..."
    cd "$INSTALL_DIR"
    git pull --ff-only || abort "git pull failed. Resolve conflicts manually in ${INSTALL_DIR}"
  else
    if [ -d "$INSTALL_DIR" ]; then
      abort "${INSTALL_DIR} already exists but is not a git repo. Remove it first or set INSTALL_DIR."
    fi
    bold "Cloning repository..."
    git clone --depth 1 "https://github.com/${REPO}.git" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
  fi

  bold "Installing dependencies..."
  npm ci --no-audit --no-fund --loglevel=error

  bold "Building..."
  npm run build --silent
}

# ---- Post-install: create launcher ----

create_launcher() {
  local launcher="${INSTALL_DIR}/launch.sh"

  cat > "$launcher" <<'SCRIPT'
#!/usr/bin/env bash
cd "$(dirname "$0")"
exec env -u ELECTRON_RUN_AS_NODE npx electron . "$@"
SCRIPT
  chmod +x "$launcher"

  local bin_dir="/usr/local/bin"
  local bin_path="${bin_dir}/${BIN_NAME}"

  if [ -w "$bin_dir" ]; then
    ln -sf "$launcher" "$bin_path"
  elif command -v sudo &>/dev/null; then
    echo ""
    info "Creating symlink in ${bin_dir} (requires sudo)..."
    sudo ln -sf "$launcher" "$bin_path"
  else
    echo ""
    info "To add to PATH manually:"
    info "  ln -sf ${launcher} ${bin_path}"
    return 0
  fi

  green "  ✓ Linked: ${bin_path} → ${launcher}"
}

# ---- Main ----

main() {
  echo ""
  bold "Agent Team Panel — Installer"
  echo ""

  check_prerequisites
  green "  ✓ node $(node -v) / npm $(npm -v) / git / tmux"

  confirm
  echo ""

  do_install
  create_launcher

  echo ""
  green "✓ Installation complete!"
  echo ""
  info "Start:    ${BIN_NAME}"
  info "Update:   cd ${INSTALL_DIR} && git pull && npm ci && npm run build"
  info "Remove:   rm -rf ${INSTALL_DIR} && rm -f /usr/local/bin/${BIN_NAME}"
  echo ""
}

main
