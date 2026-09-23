# please

Your mother taught you to say please. Your terminal finally listens. Ask
nicely, review the command like you understand it, press `y`.

Turn a short request into a shell command. Review it, confirm it, run it.

```bash
please show disk usage for this folder
pls find large files in /tmp
please fix the failing test in this repo
```

`please` prints one command with a risk badge: green `safe` or tomato
`risky`. Press `y` to run it. Enter or ESC exits without running anything.
`pls` is an alias for `please` (both skip glob expansion).

When a request needs files or folders first, `please` hands off to a coding
agent instead. It shows the agent prompt and asks before it starts the agent.

## Install

Needs Node.js 20+, `jq`, and zsh. Works on macOS and Linux. Other shells
are not supported.

npm:

```bash
npm install -g @wellg/please
```

pnpm:

```bash
pnpm add -g @wellg/please
```

Yarn Classic:

```bash
yarn global add @wellg/please
```

Then reload your shell:

```bash
source ~/.zshrc
```

## Setup

The first `please` run starts the setup wizard. It asks for:

1. An OpenRouter API key. If a key is already set, it asks whether to keep
   it.
2. A default OpenRouter model (`z-ai/glm-5.3:nitro` is prefilled; `:nitro`
   routes to the fastest providers).
3. A default agent from the ones on your PATH (`pi`, `claude`, `codex`,
   `cursor-agent`, `prime-agent`, `command-code`). If none of them is
   installed, setup accepts any agent name instead. The agent runs when a
   request needs files, folders, or more context.

Each answer is saved before the next question. To run setup again later:

```bash
please --setup
please --setup --agent pi   # skip the agent picker
```

## Options

```bash
please --help        # Show help (-h works too)
please --version     # Show the installed version (-V works too)
please --update      # Install the latest version (via npm or pnpm)
please --setup       # Run the setup wizard again
```

After `--update`, reload with `source ~/.zshrc`.

## How it works

`please` is a zsh function, so commands run in your current shell. Setup adds
a marked block to `~/.zshrc` (between `# please-cli` markers, replaced if it
is already there):

```bash
source "$(please-setup zsh-path)"
```

Keep the global bin directory on your `PATH`.

## Config

Written to `~/.config/please/`:

| File | What it is |
| --- | --- |
| `config` | `PLEASE_AGENT` and `PLEASE_MODEL` |
| `key` | OpenRouter key, if setup saved one |

You can also set `OPENROUTER_API_KEY`, `PLEASE_MODEL`, or `PLEASE_AGENT` in
your environment. The environment wins over the files.

## License

MIT
