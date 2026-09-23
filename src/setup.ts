#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ZSHRC, packageZshPath } from "./paths.js";
import { hasCommand, runWizard } from "./wizard.js";

function usage(): void {
  console.log(`usage: please-setup [--agent NAME] [zsh-path]

Set up please, or print the zsh hook path.

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

function hookZshrc(): void {
  const begin = "# please-cli";
  const end = "# end please-cli";
  const sourceLine = 'source "$(please-setup zsh-path)"';
  const block = `${begin}\n${sourceLine}\n${end}`;
  const text = existsSync(ZSHRC) ? readFileSync(ZSHRC, "utf8") : "";
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

function ensureZsh(): void {
  // The zsh function sets this when it calls setup, which also covers users
  // who run zsh under a different login shell.
  if ((process.env.PLEASE_FROM_ZSH ?? "") === "1") {
    return;
  }
  const shell = (process.env.SHELL ?? "").trim().split("/").pop() ?? "";
  if (shell === "" || shell === "zsh") {
    return;
  }
  console.error(`please: zsh is required, but your shell is ${shell}.`);
  console.error("Switch to zsh, then run please-setup again.");
  process.exit(1);
}

export async function runSetup(options: { agent?: string } = {}): Promise<void> {
  ensureZsh();
  if (!hasCommand("jq")) {
    console.error("please: missing jq");
    process.exit(1);
  }
  await runWizard(options);
  hookZshrc();
}

function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return fileURLToPath(import.meta.url) === entry || /please-setup$/.test(entry);
}

if (isMain()) {
  const args = parseArgs(process.argv.slice(2));
  if (args.zshPathOnly) {
    console.log(packageZshPath());
    process.exit(0);
  }

  await runSetup({ agent: args.agent });
  console.log("");
  console.log("Reload your shell: source ~/.zshrc");
  console.log("Then run: please print the current directory");
}
