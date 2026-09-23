# please

Turn a short request into a shell command. Confirm before it runs. If the
request needs files or folders first, confirm and start a coding agent.

```bash
please print the current directory
pls list files in this folder
please fix the failing test in this repo
```

Uses OpenRouter and your `OPENROUTER_API_KEY`. The default model is
`z-ai/glm-5.3`.

## Install

Needs Node.js 18+, `jq`, and zsh.

```bash
npm install -g @wellg/please
please
```

The first run asks for:

1. A default agent from the ones it finds on your PATH (`pi`, `claude`,
   `codex`, `cursor-agent`, `prime-agent`, `command-code`)
2. A default OpenRouter model (`z-ai/glm-5.3` is prefilled)
3. An OpenRouter API key. If a key is already set, it asks whether to keep it

Then reload:

```bash
source ~/.zshrc
```

`please-setup` still works for the same wizard. To pick an agent without the
list:

```bash
please-setup --agent pi
```

`please` is a zsh function so the command can run in your current shell. Keep
the npm global bin directory on your `PATH`.

## Config

Written to `~/.config/please/`:

| File | What it is |
| --- | --- |
| `config` | `PLEASE_AGENT` and `PLEASE_MODEL` |
| `key` | OpenRouter key, if setup saved one |

Setup writes this line into `~/.zshrc` and replaces it if it is already there:

```bash
source "$(please-setup zsh-path)"
```

## License

MIT
