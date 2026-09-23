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
            `A single zsh command for ${PLATFORM}. Empty if needs_context is true.`,
        },
        risk: {
          type: "string",
          enum: ["safe", "risky"],
          description:
            "risky unless the command only reads and prints. Use safe when needs_context is true.",
        },
        needs_context: {
          type: "boolean",
          description:
            "True only if you must look at files or folders before you can write the command.",
        },
        agent_prompt: {
          type: "string",
          description:
            "If needs_context is true, the initial prompt for a coding agent: what the user wants and what to inspect. Empty otherwise.",
        },
        reason: {
          type: "string",
          description:
            "Why the request cannot be turned into a command. Empty unless command is empty and needs_context is false.",
        },
      },
      required: ["command", "risk", "needs_context", "agent_prompt", "reason"],
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

type OpenRouterChoice = {
  finish_reason?: unknown;
  error?: { message?: unknown };
  message?: { content?: unknown };
};

type OpenRouterPayload = {
  error?: { message?: unknown; code?: unknown };
  choices?: OpenRouterChoice[];
};

function fail(message: string, code = 1): never {
  console.error(`please: ${message}`);
  process.exit(code);
}

function describeFetchError(error: unknown): string {
  if (error instanceof Error && error.name === "TimeoutError") {
    return "OpenRouter did not answer within 90s";
  }
  const reason = error instanceof Error ? error.message : String(error);
  return `could not reach OpenRouter: ${reason}`;
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```[^\n`]*\s*([\s\S]*?)\s*```$/);
  if (fence) {
    return fence[1].trim();
  }
  if (trimmed.startsWith("`") && trimmed.endsWith("`")) {
    return trimmed.replace(/^`+|`+$/g, "").trim();
  }
  return trimmed;
}

function extractJson(text: string): unknown {
  const clean = stripFences(text);
  try {
    return JSON.parse(clean);
  } catch {
    // Fall through to the brace search.
  }
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return JSON.parse(clean.slice(start, end + 1));
  }
  throw new Error("no JSON found");
}

function messageText(content: unknown): string {
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: unknown }).text ?? "");
        }
        if (part && typeof part === "object") {
          return JSON.stringify(part);
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
  return false;
}

function parseResult(content: string): PleaseResult {
  let data: unknown;
  try {
    data = extractJson(content);
  } catch {
    fail("OpenRouter did not return valid JSON");
  }

  if (!data || typeof data !== "object") {
    fail("OpenRouter JSON was not an object");
  }

  const record = data as Record<string, unknown>;
  const needsContext = asBool(record.needs_context);
  const command = stripFences(String(record.command ?? ""));
  if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(command)) {
    fail("OpenRouter returned a command with control characters");
  }
  if (!command && !needsContext) {
    fail(
      String(record.reason ?? "").trim() ||
        "OpenRouter returned an empty command",
      2,
    );
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
  const tools =
    PLATFORM === "macOS"
      ? "macOS ships BSD tools (sed -i '', date -v, stat -f): do not use GNU-only flags.\n\n"
      : "";
  const system = `You convert the user's request into a single zsh command for ${PLATFORM}.

The command runs with eval in the user's interactive zsh session: their
aliases expand, and cd, export, alias, and source take effect immediately.
Pipes, &&, and ; still count as one command.

Current directory: ${cwd}

${tools}Return structured JSON with:
- command: one shell command. No markdown, no explanation, no quotes around the whole command.
- risk: "safe" or "risky"
- needs_context: true or false
- agent_prompt: a prompt for a coding agent, or empty
- reason: why the request cannot be turned into a command, or empty

Set needs_context to true only if you would need to look at files or
folders before you could write the command. Reading files as part of
running the command (cat, ls, grep) does not count.

When needs_context is true:
- set command to an empty string
- set risk to "safe"
- set reason to an empty string
- set agent_prompt to a short initial prompt for a coding agent that can read files
  and run commands. Include the user's request, the current directory, and what to
  inspect.

When needs_context is false:
- set agent_prompt to an empty string
- if no command can do what the user asks, set command to an empty string
  and set reason to one sentence that says why
- otherwise set reason to an empty string

risk is "safe" only when the command just reads and prints (ls, cat, grep,
find without -delete or -exec, git status/log/diff, curl or wget that only
prints to stdout). Everything else is "risky": creating, appending to,
editing, moving, or deleting files or settings (>, >>, tee, sed -i, cp, mv,
rm, git commit/push/reset/checkout, brew/npm/pip install, defaults write,
launchctl, chmod/chown), sudo, kill, uploading data, or running code
fetched from the network.

Quoting rules. In zsh an unquoted ? * [ ] with no matching file is an
error, not a literal.
- Quote every URL, and every path or argument that contains anything other
  than letters, digits, and _ - . / : = @ + ,
- Use single quotes for literal text. Nothing is escaped inside them. A
  single quote cannot appear inside them: write it as '\\'' or use double
  quotes on the outside instead.
- Use double quotes only when a $VAR must expand. Inside them, write \\\" \\\$ \\\` \\\\
  for a literal double quote, dollar, backtick, or backslash.
- Keep ~ outside quotes: "~/x" does not expand. Write ~/"Some Dir" or
  "$HOME/Some Dir".
- To append shell code (alias, export, function) to a file, use a quoted
  heredoc so nothing inside needs escaping:
  cat >> ~/.zshrc <<'EOF'
  alias weather='curl -s "wttr.in/City?format=3"'
  EOF

Prefer common, safe commands for ${PLATFORM}.
Use the current directory unless the user asks otherwise.
`;

  const baseBody = {
    model: resolveModel(),
    reasoning: { effort: "medium" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
    response_format: RESPONSE_FORMAT,
    provider: { require_parameters: true },
  };

  async function attempt(includeTemperature: boolean): Promise<{
    ok: boolean;
    status: number;
    payload: OpenRouterPayload;
  }> {
    const body = includeTemperature
      ? { ...baseBody, temperature: 0 }
      : baseBody;
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
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (error) {
      fail(describeFetchError(error));
    }
    let raw: string;
    try {
      raw = await response.text();
    } catch (error) {
      fail(describeFetchError(error));
    }
    let payload: OpenRouterPayload = {};
    try {
      payload = JSON.parse(raw) as OpenRouterPayload;
    } catch {
      fail(
        `OpenRouter HTTP ${response.status} ${response.statusText}: ${raw.slice(0, 200).trim()}`,
      );
    }
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      payload,
    };
  }

  function mentionsTemperature(payload: OpenRouterPayload): boolean {
    const message =
      typeof payload.error?.message === "string"
        ? payload.error.message
        : JSON.stringify(payload);
    return message.toLowerCase().includes("temperature");
  }

  let result = await attempt(true);
  if (result.status === 400 && mentionsTemperature(result.payload)) {
    result = await attempt(false);
  }

  if (!result.ok) {
    const detail =
      typeof result.payload.error?.message === "string" &&
      result.payload.error.message
        ? result.payload.error.message
        : JSON.stringify(result.payload.error ?? result.payload);
    fail(`OpenRouter HTTP ${result.status}: ${detail}`);
  }

  if (result.payload.error) {
    const detail =
      typeof result.payload.error.message === "string"
        ? result.payload.error.message
        : JSON.stringify(result.payload.error);
    fail(detail || JSON.stringify(result.payload));
  }

  const choices = result.payload.choices ?? [];
  if (choices.length === 0) {
    fail("OpenRouter returned no choices");
  }

  const choice = choices[0];
  if (choice.error) {
    const detail =
      typeof choice.error.message === "string"
        ? choice.error.message
        : JSON.stringify(choice.error);
    fail(`OpenRouter provider error: ${detail}`);
  }
  if (choice.finish_reason === "length") {
    fail("OpenRouter cut the answer short (finish_reason=length)");
  }

  const content = messageText(choice.message?.content);
  if (!content) {
    fail("OpenRouter returned an empty reply");
  }

  return parseResult(content);
}

const userPrompt = process.argv.slice(2).join(" ").trim();
if (!userPrompt) {
  fail("usage: please do something");
}

const result = await complete(userPrompt);
console.log(JSON.stringify(result));
