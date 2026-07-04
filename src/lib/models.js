import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ORBIT_SKILLS } from "./skills.js";

// Model resolution for delegated roles.
//
// Two levers, both editable in the project's orbit.config.yaml and re-applied with
// `orbit init --force`:
//   1. A per-platform tier -> concrete model map (`models.tiers.<platform>.<tier>`).
//   2. A per-agent tier (`models.agents.<role>.tier`) plus an optional per-agent, per-platform
//      override (`models.agents.<role>.model.<platform>`) that beats the tier map.
//
// Tiers map to concrete models on the platforms with a per-role model field: Claude and Cursor
// (markdown `model:` frontmatter) and Codex (`model` in the TOML agent file). On OpenCode no
// per-role model is emitted, so the tier is informational there; the session model plus the human
// gates are the quality lever.
export const DEFAULT_TIER_MODELS = {
  claude: { strong: "opus", fast: "haiku" },
  // Cursor model IDs mirror the Claude mapping (strong -> Opus, fast -> Haiku). Edit these to taste
  // in orbit.config.yaml. If a model is blocked, needs Max Mode, or is not on your plan, Cursor
  // falls back to a compatible model automatically.
  cursor: { strong: "claude-opus-4-8", fast: "claude-4-5-haiku" },
  // Codex model IDs follow OpenAI's guidance: gpt-5.5 for demanding work, gpt-5.4-mini for fast,
  // lower-cost subagents. Reasoning effort (model_reasoning_effort) is left to the session/auto;
  // add it per agent in the .toml if you need finer control.
  codex: { strong: "gpt-5.5", fast: "gpt-5.4-mini" },
};

// Build the default model config from the ORBIT_SKILLS tier assignments. This is what a fresh
// `orbit init` writes; an existing project's edits are merged on top of it.
export function defaultModelConfig() {
  const agents = {};
  for (const skill of ORBIT_SKILLS) {
    agents[skill.id] = { tier: skill.model || "inherit" };
  }
  return {
    default: "inherit",
    tiers: {
      claude: { ...DEFAULT_TIER_MODELS.claude },
      cursor: { ...DEFAULT_TIER_MODELS.cursor },
      codex: { ...DEFAULT_TIER_MODELS.codex },
    },
    agents,
  };
}

// Resolve the concrete `model:` value for a role on a given platform.
// Precedence: per-agent per-platform override > tier map > "inherit".
export function resolveAgentModelId(modelConfig, skill, platform) {
  const agentCfg = modelConfig?.agents?.[skill.id];
  const override = agentCfg?.model?.[platform];
  if (override) {
    return override;
  }
  const tier = agentCfg?.tier ?? skill.model ?? "inherit";
  if (tier === "inherit") {
    return "inherit";
  }
  return modelConfig?.tiers?.[platform]?.[tier] ?? "inherit";
}

// Deep-merge plain objects (override wins on scalars, recurse on nested maps). Used to overlay a
// project's existing orbit.config.yaml model edits on top of the current defaults so re-running
// init never loses a user's customizations and always self-heals missing keys.
export function mergeModelConfig(base, override) {
  if (!isPlainObject(base)) {
    return override;
  }
  if (!isPlainObject(override)) {
    return base;
  }
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] = isPlainObject(value) && isPlainObject(base[key])
      ? mergeModelConfig(base[key], value)
      : value;
  }
  return result;
}

// Merge any existing orbit.config.yaml `models:` block on top of the defaults so a project's
// tier->model edits and per-agent overrides survive re-runs (and missing keys self-heal). When no
// config exists yet, the defaults are used as-is. Shared by `orbit init` and `orbit sync`.
export async function resolveProjectModelConfig(root) {
  try {
    const raw = await readFile(join(root, "orbit.config.yaml"), "utf8");
    const existing = parseModelsBlock(raw);
    if (existing) {
      return mergeModelConfig(defaultModelConfig(), existing);
    }
  } catch {
    // No existing config (or unreadable) — fall through to defaults.
  }
  return defaultModelConfig();
}

// Extract and parse the `models:` block from an orbit.config.yaml string into a nested object.
// Returns null when the block is absent. This is a deliberately tiny YAML subset parser (indented
// maps of scalars only — the exact shape Orbit emits) so the harness stays dependency-free.
export function parseModelsBlock(text) {
  if (typeof text !== "string") {
    return null;
  }
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^models:\s*$/.test(line));
  if (start === -1) {
    return null;
  }

  const body = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    // A non-indented, non-empty line marks the next top-level key: the block has ended.
    if (line.trim() !== "" && !/^\s/.test(line)) {
      break;
    }
    body.push(line);
  }

  return parseIndented(body);
}

// Build a nested object from indentation-structured `key:` / `key: value` lines.
function parseIndented(lines) {
  const root = {};
  const stack = [{ indent: -1, obj: root }];

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }
    const colon = trimmed.indexOf(":");
    if (colon === -1) {
      continue;
    }

    const indent = raw.length - raw.trimStart().length;
    const key = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].obj;

    if (value === "") {
      const child = {};
      parent[key] = child;
      stack.push({ indent, obj: child });
    } else {
      parent[key] = value;
    }
  }

  return root;
}

// Render the `models:` section of orbit.config.yaml from a model config object. Round-trips with
// parseModelsBlock so a project's edits survive `orbit init --force`.
export function renderModelsSection(modelConfig) {
  const cfg = modelConfig || defaultModelConfig();
  const lines = [
    "models:",
    `  default: ${cfg.default ?? "inherit"}`,
    "  # tier -> concrete model id, per platform. Applied in Claude, Cursor, and Codex subagents.",
    "  # Edit these and re-run `orbit init --force` to apply. A blocked/unavailable model falls",
    "  # back automatically on Cursor. OpenCode emits no per-role model, so the tier is",
    "  # informational there.",
    "  tiers:",
  ];

  for (const [platform, tiers] of Object.entries(cfg.tiers || {})) {
    lines.push(`    ${platform}:`);
    for (const [tier, model] of Object.entries(tiers || {})) {
      lines.push(`      ${tier}: ${model}`);
    }
  }

  lines.push(
    "  # Per-agent tier. An optional per-agent, per-platform override beats the tier map for a",
    "  # single role without touching the others. Example — pin only orbit-reviewer to a specific",
    "  # model on Cursor, leaving the other strong roles and the other platforms untouched:",
    "  #   orbit-reviewer:",
    "  #     tier: strong",
    "  #     model:",
    "  #       cursor: composer-2.5",
    "  # Overrides apply to the delegated subagent roles on Claude/Cursor/Codex. They have no effect",
    "  # on OpenCode (no per-role model) or on sdd-orchestrator (a main-thread skill, not a subagent).",
    "  agents:",
  );

  for (const [id, agent] of Object.entries(cfg.agents || {})) {
    lines.push(`    ${id}:`);
    lines.push(`      tier: ${agent.tier ?? "inherit"}`);
    if (isPlainObject(agent.model)) {
      lines.push("      model:");
      for (const [platform, model] of Object.entries(agent.model)) {
        lines.push(`        ${platform}: ${model}`);
      }
    }
  }

  return lines.join("\n");
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
