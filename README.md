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

Needs Node.js 18+, `jq`, and zsh.

```bash
npm install -g @wellg/please
please-setup
source ~/.zshrc
```

`please-setup` will:

1. Ask for an OpenRouter API key if `OPENROUTER_API_KEY` is not already set
2. List coding agents it finds on your PATH (`pi`, `claude`, `codex`,
   `cursor-agent`, `prime-agent`, `command-code`) and ask which one to start
   when a request needs more context

To pick an agent without the prompt:

```bash
please-setup --agent pi
```

`please` is a zsh function so the command can run in your current shell. The
npm package provides `please-complete` and `please-setup`. Keep the npm
global bin directory on your `PATH`.

## Config

Written to `~/.config/please/`:

| File | What it is |
| --- | --- |
| `config` | `PLEASE_AGENT=...` |
| `key` | OpenRouter key, only if setup had to ask |

Setup writes this line into `~/.zshrc` and replaces it if it is already there:

```bash
source "$(please-setup zsh-path)"
```

## License

MIT
