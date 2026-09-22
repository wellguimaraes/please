# please — turn a request into a shell command, or hand off to an agent.
# Source this file from ~/.zshrc. A function (not a plain alias) so the
# command can run in the current shell.

PLEASE_CONFIG_DIR="${PLEASE_CONFIG_DIR:-$HOME/.config/please}"

if [[ -z "${OPENROUTER_API_KEY:-}" && -f "$PLEASE_CONFIG_DIR/key" ]]; then
  OPENROUTER_API_KEY="$(<"$PLEASE_CONFIG_DIR/key")"
  export OPENROUTER_API_KEY
fi

_please_agent() {
  local line value agent=""
  if [[ -n "${PLEASE_AGENT:-}" && "$PLEASE_AGENT" == [A-Za-z0-9._-]## ]]; then
    print -r -- "$PLEASE_AGENT"
    return 0
  fi
  if [[ -f "$PLEASE_CONFIG_DIR/config" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      [[ "$line" == PLEASE_AGENT=* ]] || continue
      value="${line#PLEASE_AGENT=}"
      if [[ "$value" == \'*\' ]]; then
        value="${value#\'}"
        value="${value%\'}"
      elif [[ "$value" == \"*\" ]]; then
        value="${value#\"}"
        value="${value%\"}"
      fi
      if [[ "$value" == [A-Za-z0-9._-]## ]]; then
        agent="$value"
      fi
    done < "$PLEASE_CONFIG_DIR/config"
  fi
  print -r -- "${agent:-pi}"
}

_please_run_agent() {
  local prompt="$1"
  local agent="$2"
  case "$agent" in
    pi) command pi -- "$prompt" ;;
    claude) command claude -- "$prompt" ;;
    codex) command codex -- "$prompt" ;;
    cursor-agent) command cursor-agent -- "$prompt" ;;
    prime-agent) command prime-agent -- "$prompt" ;;
    command-code) command command-code -- "$prompt" ;;
    *) command "$agent" -- "$prompt" ;;
  esac
}

unalias please 2>/dev/null
unalias pls 2>/dev/null

please() {
  if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
    print -u2 "please: OPENROUTER_API_KEY is not set"
    return 1
  fi

  if (( $# == 0 )); then
    print -u2 'usage: please do something'
    return 1
  fi

  if ! command -v please-complete >/dev/null; then
    print -u2 "please: please-complete is not on PATH. Run: npm install -g @wellg/please"
    return 1
  fi

  if ! command -v jq >/dev/null; then
    print -u2 "please: jq is required"
    return 1
  fi

  local payload cmd risk needs_context agent_prompt complete_status
  local spinner_pid complete_pid out interrupted reply
  local agent
  agent="$(_please_agent)"
  setopt localoptions nomonitor localtraps
  out="$(mktemp "${TMPDIR:-/tmp}/please.XXXXXX")" || return 1
  interrupted=0

  {
    local frames=('|' '/' '-' $'\\')
    local i=1
    while true; do
      printf '\r[%1s] Loading...\e[K' "${frames[i]}" >&2
      i=$(( i % $#frames + 1 ))
      sleep 0.1
    done
  } &
  spinner_pid=$!

  command please-complete "$@" >"$out" &
  complete_pid=$!
  trap '
    interrupted=1
    kill '"$spinner_pid"' '"$complete_pid"' 2>/dev/null
    printf "\r\e[K" >&2
  ' INT TERM

  wait "$complete_pid"
  complete_status=$?

  kill "$spinner_pid" 2>/dev/null
  wait "$spinner_pid" 2>/dev/null
  printf '\r\e[K' >&2
  trap - INT TERM

  if (( interrupted )); then
    rm -f "$out"
    return 130
  fi

  payload="$(<"$out")"
  rm -f "$out"

  (( complete_status == 0 )) || return $complete_status
  cmd="$(print -r -- "$payload" | jq -r .command)"
  risk="$(print -r -- "$payload" | jq -r .risk)"
  needs_context="$(print -r -- "$payload" | jq -r .needs_context)"
  agent_prompt="$(print -r -- "$payload" | jq -r .agent_prompt)"

  if [[ "$needs_context" == "true" ]]; then
    if [[ -z "$agent_prompt" || "$agent_prompt" == null ]]; then
      agent_prompt="$*"
    fi
    if ! command -v "$agent" >/dev/null; then
      print -u2 "please: needs more context, but $agent was not found"
      return 1
    fi
    print
    printf '\033[1;97;48;2;59;130;246m agent \033[0m \033[38;2;59;130;246mneeds more context\033[0m\n'
    print
    print -r -- "$agent_prompt"
    print
    print -n "Start ${agent}? [y/N] "
    read -r reply
    if [[ "$reply" == [yY] || "$reply" == [yY][eE][sS] ]]; then
      _please_run_agent "$agent_prompt" "$agent"
      return $?
    fi
    return 1
  fi

  if [[ -z "$cmd" || "$cmd" == null ]]; then
    print -u2 "please: no command came back"
    return 1
  fi

  print
  if [[ "$risk" == "safe" ]]; then
    printf '\033[1;97;48;2;74;222;128m safe \033[0m \033[38;2;74;222;128m%s\033[0m\n' "$cmd"
  else
    printf '\033[1;97;48;2;239;68;68m risky \033[0m \033[38;2;239;68;68m%s\033[0m\n' "$cmd"
  fi
  print
  print -n "Run this command? [y/N] "
  read -r reply
  if [[ "$reply" == [yY] || "$reply" == [yY][eE][sS] ]]; then
    eval "$cmd"
  else
    return 1
  fi
}

alias please='noglob please'
alias pls='noglob please'
