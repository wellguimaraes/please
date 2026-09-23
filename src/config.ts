import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { CONFIG_DIR, CONFIG_FILE, KEY_FILE } from "./paths.js";

export const DEFAULT_MODEL = "z-ai/glm-5.3:nitro";
export const MODEL_PATTERN = /^[A-Za-z0-9._:/-]+$/;

export type PleaseConfig = {
  agent: string;
  model: string;
};

function stripQuotes(value: string): string {
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function readConfig(): PleaseConfig {
  const result: PleaseConfig = { agent: "", model: "" };
  if (!existsSync(CONFIG_FILE)) {
    return result;
  }
  const text = readFileSync(CONFIG_FILE, "utf8");
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("PLEASE_AGENT=")) {
      const value = stripQuotes(line.slice("PLEASE_AGENT=".length));
      if (/^[A-Za-z0-9._-]+$/.test(value)) {
        result.agent = value;
      }
    }
    if (line.startsWith("PLEASE_MODEL=")) {
      const value = stripQuotes(line.slice("PLEASE_MODEL=".length));
      if (MODEL_PATTERN.test(value)) {
        result.model = value;
      }
    }
  }
  return result;
}

export function writeConfig(partial: Partial<PleaseConfig>): void {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const current = readConfig();
  const next = { ...current, ...partial };
  writeFileSync(
    CONFIG_FILE,
    `PLEASE_AGENT=${next.agent}\nPLEASE_MODEL=${next.model}\n`,
  );
}

export function setupComplete(): boolean {
  const config = readConfig();
  return Boolean(config.agent && config.model);
}

export function resolveModel(): string {
  const fromEnv = (process.env.PLEASE_MODEL ?? "").trim();
  if (fromEnv && MODEL_PATTERN.test(fromEnv)) {
    return fromEnv;
  }
  return readConfig().model || DEFAULT_MODEL;
}

export function hasExistingKey(): boolean {
  return Boolean((process.env.OPENROUTER_API_KEY ?? "").trim()) || existsSync(KEY_FILE);
}
