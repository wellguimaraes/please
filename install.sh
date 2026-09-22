#!/usr/bin/env bash
# Install please: copy/link files, write config, hook ~/.zshrc.
set -euo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
PREFIX="${PLEASE_PREFIX:-$HOME/.local/share/please}"
CONFIG_DIR="${PLEASE_CONFIG_DIR:-$HOME/.config/please}"
ZSHRC="${ZSHRC:-$HOME/.zshrc}"
KNOWN_AGENTS=(pi claude codex cursor-agent prime-agent command-code)

chosen_agent=""

usage() {
  cat <<'EOF'
usage: ./install.sh [--agent NAME]

Install please for zsh.

--agent NAME   Use this agent without asking. Must be on PATH.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent)
      chosen_agent="${2:-}"
      if [[ -z "$chosen_agent" ]]; then
        echo "install: --agent needs a name" >&2
        exit 1
      fi
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "install: unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

need() {
  if ! command -v "$1" >/dev/null; then
    echo "install: missing $1" >&2
    exit 1
  fi
}

need python3
need jq

list_installed_agents() {
  local name
  for name in "${KNOWN_AGENTS[@]}"; do
    if command -v "$name" >/dev/null; then
      printf '%s\n' "$name"
    fi
  done
}

pick_agent() {
  local installed=()
  local name i choice default_index=1

  while IFS= read -r name; do
    installed+=("$name")
  done < <(list_installed_agents)

  if [[ -n "$chosen_agent" ]]; then
    if ! command -v "$chosen_agent" >/dev/null; then
      echo "install: agent not found on PATH: $chosen_agent" >&2
      exit 1
    fi
    printf '%s\n' "$chosen_agent"
    return 0
  fi

  if ((${#installed[@]} == 0)); then
    echo "No known agents were found (${KNOWN_AGENTS[*]})."
    read -r -p "Agent command to use (or empty to skip): " name
    printf '%s\n' "$name"
    return 0
  fi

  echo "Installed agents:"
  i=1
  for name in "${installed[@]}"; do
    echo "  $i) $name"
    if [[ "$name" == "pi" ]]; then
      default_index="$i"
    fi
    i=$((i + 1))
  done

  read -r -p "Which agent should please start? [$default_index]: " choice
  choice="${choice:-$default_index}"
  if ! [[ "$choice" =~ ^[0-9]+$ ]] || ((choice < 1 || choice > ${#installed[@]})); then
    echo "install: invalid choice" >&2
    exit 1
  fi
  printf '%s\n' "${installed[$((choice - 1))]}"
}

ask_for_key() {
  local key=""
  if [[ -n "${OPENROUTER_API_KEY:-}" ]]; then
    echo "OPENROUTER_API_KEY is already set in the environment."
    return 0
  fi
  if [[ -f "$CONFIG_DIR/key" ]]; then
    echo "Using the saved key in $CONFIG_DIR/key"
    return 0
  fi

  echo "OPENROUTER_API_KEY is not set."
  read -r -s -p "OpenRouter API key: " key
  echo
  if [[ -z "$key" ]]; then
    echo "No key entered. Set OPENROUTER_API_KEY later or re-run install."
    return 0
  fi
  umask 077
  printf '%s\n' "$key" >"$CONFIG_DIR/key"
  chmod 600 "$CONFIG_DIR/key"
  echo "Saved the key to $CONFIG_DIR/key"
}

hook_zshrc() {
  local begin="# please-cli"
  local end="# end please-cli"
  local block

  block=$(
    cat <<EOF
$begin
source "$PREFIX/please.zsh"
$end
EOF
  )

  mkdir -p "$(dirname "$ZSHRC")"
  touch "$ZSHRC"

  if grep -q "$begin" "$ZSHRC"; then
    echo "zshrc already sources please."
    return 0
  fi

  printf '\n%s\n' "$block" >>"$ZSHRC"
  echo "Added please to $ZSHRC"
}

mkdir -p "$PREFIX" "$CONFIG_DIR"
chmod 700 "$CONFIG_DIR"

ln -sfn "$REPO/shell/please.zsh" "$PREFIX/please.zsh"
ln -sfn "$REPO/bin/please-complete" "$PREFIX/please-complete"
chmod +x "$REPO/bin/please-complete"

ask_for_key
agent="$(pick_agent)"
printf 'PLEASE_AGENT=%q\n' "$agent" >"$CONFIG_DIR/config"
echo "Agent: ${agent:-none}"

hook_zshrc

echo
echo "Installed please."
echo "Reload your shell: source ~/.zshrc"
echo "Then run: please print the current directory"
