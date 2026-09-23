#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setupComplete } from "./config.js";
import { runSetup } from "./setup.js";
import { PACKAGE_NAME, packageVersion } from "./paths.js";

const args = process.argv.slice(2);
const first = args[0] ?? "";

function printHelp(): void {
  console.log(`please - turn a request into a shell command

Usage:
  please do something
  pls do something

Examples:
  please print the current directory
  pls list files in this folder
  please fix the failing test in this repo

Options:
  --help       Show this help and exit.
  --version    Show the installed version and exit.
  --update     Install the latest ${PACKAGE_NAME} and exit.

Setup:
  please-setup              Run the setup wizard again.
  please-setup --agent pi   Set the agent without the list.`);
}

function printVersion(): void {
  console.log(packageVersion());
}

function runUpdate(): void {
  const viaPnpm = fileURLToPath(import.meta.url).includes("pnpm");
  const spec = `${PACKAGE_NAME}@latest`;
  const cmd = viaPnpm ? "pnpm" : "npm";
  const cmdArgs = viaPnpm ? ["add", "-g", spec] : ["install", "-g", spec];
  const result = spawnSync(cmd, cmdArgs, { stdio: "inherit" });
  if (result.error) {
    console.error(`please: update failed: ${result.error.message}`);
    process.exit(1);
  }
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
  console.log("");
  console.log("Reload your shell: source ~/.zshrc");
}

if (first === "--help" || first === "-h") {
  printHelp();
  process.exit(0);
}

if (first === "--version" || first === "-V") {
  printVersion();
  process.exit(0);
}

if (first === "--update") {
  runUpdate();
  process.exit(0);
}

if (!setupComplete()) {
  await runSetup();
  console.log("");
  console.log("Reload your shell: source ~/.zshrc");
  if (args.length > 0) {
    console.log(`Then run: please ${args.join(" ")}`);
  }
  process.exit(0);
}

console.log("please is a zsh function. Reload your shell: source ~/.zshrc");
if (args.length > 0) {
  console.log(`Then run: please ${args.join(" ")}`);
}
