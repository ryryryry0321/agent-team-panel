#!/usr/bin/env bash
#
# Claude Team Panel — install script
# https://github.com/ryryryry0321/agent-team-panel
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/ryryryry0321/agent-team-panel/main/install.sh | bash
#
# Options (via environment variables):
#   INSTALL_DIR   — where to clone the source (default: ~/.agent-team-panel)
#   SKIP_CONFIRM  — set to 1 to skip the confirmation prompt
#

set -euo pipefail

REPO="ryryryry0321/agent-team-panel"
INSTALL_DIR="${INSTALL_DIR:-${HOME}/.agent-team-panel}"
APP_NAME="Agent Teams Panel"
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

# ---- OS / Arch detection ----

detect_os() {
  case "$(uname -s)" in
    Darwin) echo "macos" ;;
    Linux)  echo "linux" ;;
    *)      abort "Unsupported OS: $(uname -s). Only macOS and Linux are supported." ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    arm64|aarch64) echo "arm64" ;;
    x86_64|amd64)  echo "x64" ;;
    *)             abort "Unsupported architecture: $(uname -m)" ;;
  esac
}

OS="$(detect_os)"
ARCH="$(detect_arch)"

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
  info "Source dir:    ${INSTALL_DIR}"
  if [ "$OS" = "macos" ]; then
    info "Application:   /Applications/${APP_NAME}.app"
  else
    info "Application:   ${HOME}/.local/share/${BIN_NAME}"
  fi
  echo ""

  printf "  Proceed? [Y/n] "
  read -r reply </dev/tty
  case "$reply" in
    [nN]*) echo "Aborted."; exit 0 ;;
  esac
}

# ---- Clone / Update source ----

fetch_source() {
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
}

# ---- Build ----

build_app() {
  bold "Installing dependencies..."
  npm ci --no-audit --no-fund --loglevel=error

  bold "Rebuilding native modules for Electron..."
  npx electron-rebuild

  bold "Building..."
  npm run build --silent
}

# ---- Package & Install ----

install_macos() {
  bold "Packaging macOS application..."

  npx electron-packager . "$APP_NAME" \
    --platform=darwin \
    --arch="$ARCH" \
    --out=release \
    --overwrite \
    --prune=true \
    --ignore="^/(src|release|\.git|\.github|tsconfig|todo|install|AGENTS|LICENSE|README)"

  local app_src="release/${APP_NAME}-darwin-${ARCH}/${APP_NAME}.app"
  local app_dest="/Applications/${APP_NAME}.app"

  if [ ! -d "$app_src" ]; then
    abort "Packaging failed: ${app_src} not found"
  fi

  bold "Installing to /Applications..."
  if [ -d "$app_dest" ]; then
    rm -rf "$app_dest"
  fi

  if [ -w "/Applications" ]; then
    cp -R "$app_src" "$app_dest"
  elif command -v sudo &>/dev/null; then
    info "Copying to /Applications (requires sudo)..."
    sudo cp -R "$app_src" "$app_dest"
  else
    abort "Cannot write to /Applications. Run with sudo or copy manually:\n  cp -R \"$app_src\" \"$app_dest\""
  fi

  green "  ✓ ${app_dest}"
}

install_linux() {
  bold "Packaging Linux application..."

  npx electron-packager . "$APP_NAME" \
    --platform=linux \
    --arch="$ARCH" \
    --out=release \
    --overwrite \
    --prune=true \
    --ignore="^/(src|release|\.git|\.github|tsconfig|todo|install|AGENTS|LICENSE|README)"

  local app_src="release/${APP_NAME}-linux-${ARCH}"
  local app_dest="${HOME}/.local/share/${BIN_NAME}"

  if [ ! -d "$app_src" ]; then
    abort "Packaging failed: ${app_src} not found"
  fi

  bold "Installing application..."
  rm -rf "$app_dest"
  mkdir -p "$app_dest"
  cp -R "${app_src}/." "$app_dest/"

  local desktop_dir="${HOME}/.local/share/applications"
  mkdir -p "$desktop_dir"
  cat > "${desktop_dir}/${BIN_NAME}.desktop" <<DESKTOP
[Desktop Entry]
Name=${APP_NAME}
Exec=${app_dest}/${APP_NAME} %U
Type=Application
Terminal=false
Categories=Development;
DESKTOP

  green "  ✓ ${app_dest}"
  green "  ✓ ${desktop_dir}/${BIN_NAME}.desktop"
}

create_cli_launcher() {
  if [ "$OS" = "macos" ]; then
    local target="/Applications/${APP_NAME}.app/Contents/MacOS/${APP_NAME}"
  else
    local target="${HOME}/.local/share/${BIN_NAME}/${APP_NAME}"
  fi

  local bin_dir="/usr/local/bin"
  local bin_path="${bin_dir}/${BIN_NAME}"

  if [ -w "$bin_dir" ]; then
    ln -sf "$target" "$bin_path"
  elif command -v sudo &>/dev/null; then
    info "Creating CLI symlink in ${bin_dir} (requires sudo)..."
    sudo ln -sf "$target" "$bin_path"
  else
    info "To add CLI access manually:"
    info "  ln -sf \"${target}\" ${bin_path}"
    return 0
  fi

  green "  ✓ CLI: ${bin_path}"
}

# ---- Cleanup ----

cleanup_release() {
  rm -rf "${INSTALL_DIR}/release"
}

# ---- Main ----

main() {
  echo ""
  bold "${APP_NAME} — Installer"
  echo ""

  check_prerequisites
  green "  ✓ node $(node -v) / npm $(npm -v) / git / tmux"

  confirm
  echo ""

  fetch_source
  build_app

  if [ "$OS" = "macos" ]; then
    install_macos
  else
    install_linux
  fi

  create_cli_launcher
  cleanup_release

  echo ""
  green "✓ Installation complete!"
  echo ""
  if [ "$OS" = "macos" ]; then
    info "Launch:   Spotlight → '${APP_NAME}'  or  open -a '${APP_NAME}'"
    info "CLI:      ${BIN_NAME}"
  else
    info "Launch:   Find '${APP_NAME}' in your application launcher"
    info "CLI:      ${BIN_NAME}"
  fi
  info "Update:   re-run this install script"
  info "Remove:   rm -rf '${INSTALL_DIR}' && rm -f '/usr/local/bin/${BIN_NAME}'"
  if [ "$OS" = "macos" ]; then
    info "          rm -rf '/Applications/${APP_NAME}.app'"
  else
    info "          rm -rf '${HOME}/.local/share/${BIN_NAME}' '${HOME}/.local/share/applications/${BIN_NAME}.desktop'"
  fi
  echo ""
  
  bold "Launching ${APP_NAME}..."
  if [ "$OS" = "macos" ]; then
    open -a "$APP_NAME"
  else
    nohup "${HOME}/.local/share/${BIN_NAME}/${APP_NAME}" &>/dev/null &
  fi
}

main
