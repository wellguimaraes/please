# please — turn a request into a shell command, or hand off to an agent.
# Source this file from ~/.zshrc. A function (not a plain alias) so the
# command can run in the current shell.

PLEASE_CONFIG_DIR="${PLEASE_CONFIG_DIR:-$HOME/.config/please}"

_please_load_key() {
  if [[ -f "$PLEASE_CONFIG_DIR/key" ]]; then
    OPENROUTER_API_KEY="$(<"$PLEASE_CONFIG_DIR/key")"
    export OPENROUTER_API_KEY
  fi
}

if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
  _please_load_key
fi

_please_config_value() {
  # `##` needs EXTENDED_GLOB; it is off by default in zsh.
  setopt localoptions extendedglob
  local key="$1"
  local pattern="$2"
  local line value=""
  if [[ -n "${(P)key}" && "${(P)key}" == $~pattern ]]; then
    print -r -- "${(P)key}"
    return 0
  fi
  if [[ -f "$PLEASE_CONFIG_DIR/config" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      [[ "$line" == ${key}=* ]] || continue
      value="${line#${key}=}"
      if [[ "$value" == \'*\' ]]; then
        value="${value#\'}"
        value="${value%\'}"
      elif [[ "$value" == \"*\" ]]; then
        value="${value#\"}"
        value="${value%\"}"
      fi
      if [[ "$value" == $~pattern ]]; then
        print -r -- "$value"
        return 0
      fi
    done < "$PLEASE_CONFIG_DIR/config"
  fi
  return 1
}

_please_agent() {
  _please_config_value PLEASE_AGENT '[A-Za-z0-9._-]##'
}

_please_model() {
  _please_config_value PLEASE_MODEL '[A-Za-z0-9._:/-]##'
}

_please_setup_needed() {
  local agent model
  agent="$(_please_agent)"
  model="$(_please_model)"
  [[ -z "$agent" || -z "$model" ]]
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

# Confirm. On a terminal, one keypress decides: y runs, anything else exits,
# and ESC exits at once without waiting for Enter. On a pipe, read one line
# so scripts can still answer.
_please_confirm() {
  local prompt="$1"
  local reply rest
  print -n "$prompt"
  if [[ -t 0 ]]; then
    read -k 1 reply || { print; return 1; }
    if [[ "$reply" == $'\e' ]]; then
      # Drain the rest of any escape sequence so it does not leak to the prompt.
      # One char at a time: the timeout only covers the wait for the first char.
      while read -t 0.05 -k 1 rest 2>/dev/null; do :; done
      print
      return 1
    fi
    print
    [[ "$reply" == [yY] ]]
  else
    read -r reply || return 1
    [[ "$reply" == [yY] || "$reply" == [yY][eE][sS] ]]
  fi
}

unalias please 2>/dev/null
unalias pls 2>/dev/null

please() {
  if (( $# == 0 )); then
    print -u2 'usage: please do something'
    return 1
  fi

  if ! command -v please-complete >/dev/null || ! command -v please-setup >/dev/null; then
    print -u2 "please: @wellg/please is not on PATH. Run: npm install -g @wellg/please"
    return 1
  fi

  # Flags run without jq, setup, or an API key. The Node bin owns them.
  case "$1" in
    --help|-h|--version|-V|--update)
      command please "$1"
      return $?
      ;;
  esac

  if ! command -v jq >/dev/null; then
    print -u2 "please: jq is required"
    return 1
  fi

  if _please_setup_needed; then
    PLEASE_FROM_ZSH=1 command please-setup || return $?
    _please_load_key
  fi

  if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
    _please_load_key
  fi
  if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
    print -u2 "please: OPENROUTER_API_KEY is not set"
    return 1
  fi

  local payload cmd risk needs_context agent_prompt complete_status
  local spinner_pid complete_pid out interrupted
  local agent model
  agent="$(_please_agent)"
  model="$(_please_model)"
  if [[ -n "$model" ]]; then
    export PLEASE_MODEL="$model"
  fi
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
    if _please_confirm "Start ${agent}? [y/N] "; then
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
    printf '\033[1;38;2;0;0;0;48;2;74;222;128m safe \033[0m \033[38;2;74;222;128m%s\033[0m\n' "$cmd"
  else
    printf '\033[1;97;48;2;255;99;71m risky \033[0m \033[38;2;255;99;71m%s\033[0m\n' "$cmd"
  fi
  print
  if _please_confirm "Run this command? [y/N] "; then
    eval "$cmd"
  else
    return 1
  fi
}

alias please='noglob please'
alias pls='noglob please'
