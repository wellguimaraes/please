#!/usr/bin/env node

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { CONFIG_DIR, CONFIG_FILE, KEY_FILE, ZSHRC, packageZshPath } from "./paths.js";

const KNOWN_AGENTS = [
  "pi",
  "claude",
  "codex",
  "cursor-agent",
  "prime-agent",
  "command-code",
] as const;

function hasCommand(name: string): boolean {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    return false;
  }
  try {
    execFileSync("/bin/sh", ["-c", `command -v ${name}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function usage(): void {
  console.log(`usage: please-setup [--agent NAME] [zsh-path]

Install the please zsh hook.

  --agent NAME   Use this agent without asking. Must be on PATH.
  zsh-path       Print the path to please.zsh and exit.`);
}

function parseArgs(argv: string[]): { agent: string; zshPathOnly: boolean } {
  let agent = "";
  let zshPathOnly = false;
  const rest: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      usage();
      process.exit(0);
    }
    if (arg === "--agent") {
      const value = argv[i + 1];
      if (!value) {
        console.error("please-setup: --agent needs a name");
        process.exit(1);
      }
      agent = value;
      i += 1;
      continue;
    }
    rest.push(arg);
  }

  if (rest.includes("zsh-path")) {
    zshPathOnly = true;
  } else if (rest.length > 0) {
    console.error(`please-setup: unknown argument: ${rest[0]}`);
    usage();
    process.exit(1);
  }

  return { agent, zshPathOnly };
}

function listInstalledAgents(): string[] {
  return KNOWN_AGENTS.filter((name) => hasCommand(name));
}

async function pickAgent(chosen: string, ask: (q: string) => Promise<string>): Promise<string> {
  if (chosen) {
    if (!hasCommand(chosen)) {
      console.error(`please-setup: agent not found on PATH: ${chosen}`);
      process.exit(1);
    }
    return chosen;
  }

  const installed = listInstalledAgents();
  if (installed.length === 0) {
    console.log(`No known agents were found (${KNOWN_AGENTS.join(", ")}).`);
    return (await ask("Agent command to use (or empty to skip): ")).trim();
  }

  console.log("Installed agents:");
  let defaultIndex = 1;
  installed.forEach((name, index) => {
    console.log(`  ${index + 1}) ${name}`);
    if (name === "pi") {
      defaultIndex = index + 1;
    }
  });

  const raw = (await ask(`Which agent should please start? [${defaultIndex}]: `)).trim();
  const choice = raw === "" ? defaultIndex : Number(raw);
  if (!Number.isInteger(choice) || choice < 1 || choice > installed.length) {
    console.error("please-setup: invalid choice");
    process.exit(1);
  }
  return installed[choice - 1];
}

async function readSecret(prompt: string): Promise<string> {
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    const rl = createInterface({ input, output });
    const value = await rl.question(prompt);
    rl.close();
    return value;
  }

  output.write(prompt);
  input.setRawMode(true);
  input.resume();
  input.setEncoding("utf8");

  return new Promise((resolve) => {
    let value = "";
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\n" || ch === "\r") {
          cleanup();
          output.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          cleanup();
          output.write("\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += ch;
      }
    };
    const cleanup = () => {
      input.off("data", onData);
      input.setRawMode(false);
    };
    input.on("data", onData);
  });
}

async function askForKey(): Promise<void> {
  if ((process.env.OPENROUTER_API_KEY ?? "").trim()) {
    console.log("OPENROUTER_API_KEY is already set in the environment.");
    return;
  }
  if (hasFile(KEY_FILE)) {
    console.log(`Using the saved key in ${KEY_FILE}`);
    return;
  }

  console.log("OPENROUTER_API_KEY is not set.");
  const key = (await readSecret("OpenRouter API key: ")).trim();
  if (!key) {
    console.log("No key entered. Set OPENROUTER_API_KEY later or re-run please-setup.");
    return;
  }
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(KEY_FILE, `${key}\n`, { mode: 0o600 });
  chmodSync(KEY_FILE, 0o600);
  console.log(`Saved the key to ${KEY_FILE}`);
}

function hasFile(path: string): boolean {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
}

function hookZshrc(): void {
  const begin = "# please-cli";
  const end = "# end please-cli";
  const sourceLine = 'source "$(please-setup zsh-path)"';
  const block = `${begin}\n${sourceLine}\n${end}`;
  const text = hasFile(ZSHRC) ? readFileSync(ZSHRC, "utf8") : "";
  const pattern = new RegExp(
    `${escapeRegExp(begin)}[\\s\\S]*?${escapeRegExp(end)}`,
  );
  let next: string;
  let action: "updated" | "added";
  if (pattern.test(text)) {
    next = text.replace(pattern, block);
    action = "updated";
  } else {
    next = text;
    if (next && !next.endsWith("\n")) {
      next += "\n";
    }
    next += `\n${block}\n`;
    action = "added";
  }
  writeFileSync(ZSHRC, next);
  if (action === "updated") {
    console.log(`Updated please in ${ZSHRC}`);
  } else {
    console.log(`Added please to ${ZSHRC}`);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const args = parseArgs(process.argv.slice(2));
if (args.zshPathOnly) {
  console.log(packageZshPath());
  process.exit(0);
}

if (!hasCommand("jq")) {
  console.error("please-setup: missing jq");
  process.exit(1);
}

mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
chmodSync(CONFIG_DIR, 0o700);

const rl = createInterface({ input, output });
const ask = (question: string) => rl.question(question);
await askForKey();
const agent = await pickAgent(args.agent, ask);
rl.close();
writeFileSync(CONFIG_FILE, `PLEASE_AGENT=${agent}\n`);
console.log(`Agent: ${agent || "none"}`);
hookZshrc();

console.log("");
console.log("Installed please.");
console.log("Reload your shell: source ~/.zshrc");
console.log("Then run: please print the current directory");
