# please

Turn a short request into a shell command. Confirm before it runs. If the
request needs files or folders first, confirm and start a coding agent.

```bash
please print the current directory
pls list files in this folder
please fix the failing test in this repo
```

Uses OpenRouter (`z-ai/glm-5.3`) and your `OPENROUTER_API_KEY`.

## Install

Needs `python3`, `jq`, and zsh.

```bash
./install.sh
```

The script will:

1. Ask for an OpenRouter API key if `OPENROUTER_API_KEY` is not already set
2. List coding agents it finds on your PATH (`pi`, `claude`, `codex`,
   `cursor-agent`, `prime-agent`, `command-code`) and ask which one to start
   when a request needs more context

To pick an agent without the prompt:

```bash
./install.sh --agent pi
```

Then:

```bash
source ~/.zshrc
```

## Config

Written to `~/.config/please/`:

| File | What it is |
| --- | --- |
| `config` | `PLEASE_AGENT=...` |
| `key` | OpenRouter key, only if install had to ask |

The shell function is linked from `~/.local/share/please/` back to this repo.
Install writes this line into `~/.zshrc` and replaces it if it is already there:

```bash
source "$HOME/.local/share/please/please.zsh"
```

## License

MIT
