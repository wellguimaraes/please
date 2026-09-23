#!/usr/bin/env node

import { resolveModel } from "./config.js";
import { platformLabel } from "./paths.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const RISKS = new Set(["safe", "risky"]);
const PLATFORM = platformLabel();

const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "please_command",
    strict: true,
    schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description:
            `A single zsh command for ${PLATFORM}. Quote paths and arguments that can contain spaces or special characters. No markdown, no explanation, and no quotes around the whole command. Empty if needs_context is true.`,
        },
        risk: {
          type: "string",
          enum: ["safe", "risky"],
          description:
            "risky if the command can delete, overwrite, change permissions, use sudo, send data, kill processes, or otherwise harm the system or data. Otherwise safe. Use safe when needs_context is true.",
        },
        needs_context: {
          type: "boolean",
          description:
            "true if a reliable command requires reading files, listing folders, or inspecting the project. false if one command is enough.",
        },
        agent_prompt: {
          type: "string",
          description:
            "If needs_context is true, the initial prompt for a coding agent: what the user wants and what to inspect. Empty otherwise.",
        },
      },
      required: ["command", "risk", "needs_context", "agent_prompt"],
      additionalProperties: false,
    },
  },
};

type PleaseResult = {
  command: string;
  risk: string;
  needs_context: boolean;
  agent_prompt: string;
};

function fail(message: string, code = 1): never {
  console.error(`please: ${message}`);
  process.exit(code);
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:[a-zA-Z0-9_-]+)?\n(.*)\n```$/s);
  if (fence) {
    return fence[1].trim();
  }
  if (trimmed.startsWith("`") && trimmed.endsWith("`")) {
    return trimmed.replace(/^`+|`+$/g, "").trim();
  }
  return trimmed;
}

function messageText(content: unknown): string {
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: unknown }).text ?? "");
        }
        return String(part);
      })
      .join("");
  }
  return String(content ?? "");
}

function asBool(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return ["true", "1", "yes"].includes(value.trim().toLowerCase());
  }
  return Boolean(value);
}

function parseResult(content: string): PleaseResult {
  let data: unknown;
  try {
    data = JSON.parse(stripFences(content));
  } catch {
    fail("OpenRouter did not return valid JSON");
  }

  if (!data || typeof data !== "object") {
    fail("OpenRouter JSON was not an object");
  }

  const record = data as Record<string, unknown>;
  const needsContext = asBool(record.needs_context);
  const command = String(record.command ?? "").trim();
  if (!command && !needsContext) {
    fail("OpenRouter returned an empty command");
  }

  let risk = String(record.risk ?? "")
    .trim()
    .toLowerCase();
  if (!RISKS.has(risk)) {
    risk = "risky";
  }

  return {
    command,
    risk,
    needs_context: needsContext,
    agent_prompt: String(record.agent_prompt ?? "").trim(),
  };
}

async function complete(prompt: string): Promise<PleaseResult> {
  const apiKey = (process.env.OPENROUTER_API_KEY ?? "").trim();
  if (!apiKey) {
    fail("OPENROUTER_API_KEY is not set");
  }

  const cwd = process.env.PWD || process.cwd();
  const system = `You convert the user's request into a single zsh command for ${PLATFORM}.

Current directory: ${cwd}

Return structured JSON with:
- command: one shell command. No markdown, no explanation, no quotes around the whole command.
- risk: "safe" or "risky"
- needs_context: true or false
- agent_prompt: a prompt for a coding agent, or empty

Set needs_context to true when you cannot write a reliable command without reading
files, listing folders, or inspecting the project. Examples: the request depends on
file contents, repo layout, which files match, or a choice you cannot see from the
request and current directory path alone.

When needs_context is true:
- set command to an empty string
- set risk to "safe"
- set agent_prompt to a short initial prompt for a coding agent that can read files
  and run commands. Include the user's request, the current directory, and what to
  inspect.

When needs_context is false:
- set agent_prompt to an empty string
- mark risk as "risky" when the command can delete, overwrite, move, change
  permissions, use sudo, send data over the network, kill processes, format disks,
  or otherwise harm the system or data. Use "safe" for read-only or otherwise
  harmless commands.

Prefer common, safe commands for ${PLATFORM}.
Quote file paths and arguments that can contain spaces or shell
special characters. Use single quotes for literal text and double
quotes when a variable must expand.
Use the current directory unless the user asks otherwise.
If the request cannot be turned into a command and also does not need project
context, set command to:
echo 'please: cannot turn that into a command'
and set risk to "safe".
`;

  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://localhost",
        "X-Title": "please",
      },
      body: JSON.stringify({
        model: resolveModel(),
        temperature: 0,
        reasoning: { effort: "high" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        response_format: RESPONSE_FORMAT,
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    fail(`could not reach OpenRouter: ${reason}`);
  }

  const payload = (await response.json()) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: unknown } }>;
  };

  if (!response.ok) {
    const detail = payload.error?.message || JSON.stringify(payload);
    fail(`OpenRouter HTTP ${response.status}: ${detail}`);
  }

  if (payload.error) {
    fail(payload.error.message || String(payload.error));
  }

  const choices = payload.choices ?? [];
  if (choices.length === 0) {
    fail("OpenRouter returned no choices");
  }

  const content = messageText(choices[0]?.message?.content);
  if (!content) {
    fail("OpenRouter returned an empty command");
  }

  return parseResult(content);
}

const userPrompt = process.argv.slice(2).join(" ").trim();
if (!userPrompt) {
  fail("usage: please do something");
}

const result = await complete(userPrompt);
console.log(JSON.stringify(result));
