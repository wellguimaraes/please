#!/usr/bin/env node

import { setupComplete } from "./config.js";
import { runSetup } from "./setup.js";

const args = process.argv.slice(2);

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
