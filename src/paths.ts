import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

export const PACKAGE_NAME = "@wellg/please";

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

export function platformLabel(): string {
  if (process.platform === "darwin") {
    return "macOS";
  }
  if (process.platform === "linux") {
    return "Linux";
  }
  return "Unix";
}

export function packageVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgFile = join(here, "..", "package.json");
  try {
    const pkg = JSON.parse(readFileSync(pkgFile, "utf8")) as {
      version?: unknown;
    };
    if (typeof pkg.version === "string" && pkg.version) {
      return pkg.version;
    }
  } catch {
    // Fall through to "unknown".
  }
  return "unknown";
}
