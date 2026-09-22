import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

export const CONFIG_DIR =
  process.env.PLEASE_CONFIG_DIR ?? join(homedir(), ".config", "please");
export const KEY_FILE = join(CONFIG_DIR, "key");
export const CONFIG_FILE = join(CONFIG_DIR, "config");
export const ZSHRC = process.env.ZSHRC ?? join(homedir(), ".zshrc");

export function packageZshPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidate = join(here, "..", "shell", "please.zsh");
  if (!existsSync(candidate)) {
    throw new Error("please.zsh is missing from the package");
  }
  return candidate;
}
