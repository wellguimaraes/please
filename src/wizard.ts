import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { confirm, input, password, select } from "@inquirer/prompts";
import { CONFIG_DIR, KEY_FILE } from "./paths.js";
import { DEFAULT_MODEL, hasExistingKey, writeConfig } from "./config.js";

const KNOWN_AGENTS = [
  "pi",
  "claude",
  "codex",
  "cursor-agent",
  "prime-agent",
  "command-code",
] as const;

export function hasCommand(name: string): boolean {
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

function listInstalledAgents(): string[] {
  return KNOWN_AGENTS.filter((name) => hasCommand(name));
}

function saveKey(key: string): void {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(KEY_FILE, `${key}\n`, { mode: 0o600 });
  chmodSync(KEY_FILE, 0o600);
}

async function askForKey(): Promise<void> {
  if (hasExistingKey()) {
    const keep = await confirm({
      message: "An OpenRouter key is already set. Keep it?",
      default: true,
    });
    if (keep) {
      return;
    }
  }

  const key = (
    await password({
      message: "OpenRouter API key",
      mask: true,
      validate: (value) => (value.trim() ? true : "A key is required"),
    })
  ).trim();
  saveKey(key);
}

async function pickModel(): Promise<string> {
  const model = (
    await input({
      message: "Default OpenRouter model",
      default: DEFAULT_MODEL,
      validate: (value) =>
        /^[A-Za-z0-9._:/-]+$/.test(value.trim()) ? true : "Enter a model id",
    })
  ).trim();
  writeConfig({ model });
  return model;
}

async function pickAgent(chosen: string): Promise<string> {
  if (chosen) {
    if (!hasCommand(chosen)) {
      console.error(`please: agent not found on PATH: ${chosen}`);
      process.exit(1);
    }
    writeConfig({ agent: chosen });
    return chosen;
  }

  const installed = listInstalledAgents();
  let agent: string;
  if (installed.length === 0) {
    agent = (
      await input({
        message:
          "Default agent (used when a request needs files, folders, or more context)",
        validate: (value) => (value.trim() ? true : "An agent is required"),
      })
    ).trim();
  } else {
    agent = await select({
      message:
        "Default agent (used when a request needs files, folders, or more context)",
      choices: installed.map((name) => ({ name, value: name })),
      default: installed.includes("pi") ? "pi" : installed[0],
    });
  }
  writeConfig({ agent });
  return agent;
}

export async function runWizard(options: { agent?: string } = {}): Promise<void> {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  chmodSync(CONFIG_DIR, 0o700);

  console.log("please setup");
  console.log("");
  await askForKey();
  const model = await pickModel();
  const agent = await pickAgent(options.agent ?? "");
  console.log("");
  console.log(`Agent: ${agent || "none"}`);
  console.log(`Model: ${model}`);
}
