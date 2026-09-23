import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
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

async function pickAgent(
  chosen: string,
  ask: (question: string) => Promise<string>,
): Promise<string> {
  if (chosen) {
    if (!hasCommand(chosen)) {
      console.error(`please: agent not found on PATH: ${chosen}`);
      process.exit(1);
    }
    return chosen;
  }

  const installed = listInstalledAgents();
  if (installed.length === 0) {
    console.log(`No known agents were found (${KNOWN_AGENTS.join(", ")}).`);
    const name = (await ask("Agent command to use: ")).trim();
    if (!name) {
      console.error("please: an agent is required");
      process.exit(1);
    }
    return name;
  }

  console.log("Default agent:");
  let defaultIndex = 1;
  installed.forEach((name, index) => {
    console.log(`  ${index + 1}) ${name}`);
    if (name === "pi") {
      defaultIndex = index + 1;
    }
  });

  const raw = (await ask(`Which agent? [${defaultIndex}]: `)).trim();
  const choice = raw === "" ? defaultIndex : Number(raw);
  if (!Number.isInteger(choice) || choice < 1 || choice > installed.length) {
    console.error("please: invalid choice");
    process.exit(1);
  }
  return installed[choice - 1];
}

async function pickModel(ask: (question: string) => Promise<string>): Promise<string> {
  const raw = (await ask(`Default model [${DEFAULT_MODEL}]: `)).trim();
  const model = raw || DEFAULT_MODEL;
  if (!/^[A-Za-z0-9._:/-]+$/.test(model)) {
    console.error("please: invalid model id");
    process.exit(1);
  }
  return model;
}

function saveKey(key: string): void {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(KEY_FILE, `${key}\n`, { mode: 0o600 });
  chmodSync(KEY_FILE, 0o600);
}

async function askForKey(ask: (question: string) => Promise<string>): Promise<void> {
  if (hasExistingKey()) {
    const keep = (await ask("An OpenRouter key is already set. Keep it? [Y/n] ")).trim();
    if (keep === "" || /^y(es)?$/i.test(keep)) {
      return;
    }
    const key = (await readSecret("OpenRouter API key: ")).trim();
    if (!key) {
      console.error("please: a key is required");
      process.exit(1);
    }
    saveKey(key);
    return;
  }

  const key = (await readSecret("OpenRouter API key: ")).trim();
  if (!key) {
    console.error("please: a key is required");
    process.exit(1);
  }
  saveKey(key);
}

export async function runWizard(options: { agent?: string } = {}): Promise<void> {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  chmodSync(CONFIG_DIR, 0o700);

  const rl = createInterface({ input, output });
  const ask = (question: string) => rl.question(question);
  try {
    console.log("please setup");
    console.log("");
    const agent = await pickAgent(options.agent ?? "", ask);
    const model = await pickModel(ask);
    await askForKey(ask);
    writeConfig(agent, model);
    console.log("");
    console.log(`Agent: ${agent || "none"}`);
    console.log(`Model: ${model}`);
  } finally {
    rl.close();
  }
}
