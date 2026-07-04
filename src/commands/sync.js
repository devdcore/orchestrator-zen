// `orbit sync` — reconcile everything the harness derives from its sources of truth:
//
// 1. Skill copies: `.claude/skills/<id>/SKILL.md` is canonical; the Cursor/OpenCode/Codex copies
//    are derived with platform transforms (/opsx: -> /opsx-, CLAUDE.md -> AGENTS.md).
// 2. Agent files: frontmatter (md) / header keys (TOML) are regenerated from the capability
//    presets + the project's model config; bodies stay project-owned.
// 3. The `builder-routing` managed block inside orbit-builder is regenerated from skill
//    frontmatter (`paths`, `when_to_use`).
// 4. `docs/orbit/skills/index.md` and `.orbit/skill-registry.json` are regenerated from the
//    same records.
//
// `orbit sync --check` computes the same plan, writes nothing, and exits non-zero when anything
// is out of sync — the CI drift gate.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ORBIT_SKILLS,
  PLATFORM_AGENT_EXT,
  PLATFORM_SKILL_DIRS,
  isSubagentFor,
  locationFor,
} from "../lib/skills.js";
import { agentFrontmatter, agentTemplate, codexAgentHeader } from "../lib/templates.js";
import {
  extractManagedBlock,
  hasManagedBlock,
  joinCodexAgent,
  platformizeBody,
  renderBuilderRoutingRows,
  replaceManagedBlock,
  splitCodexAgent,
  splitMarkdownFrontmatter,
} from "../lib/managed.js";
import {
  buildRecords,
  isExcludedSkillId,
  parseFrontmatter,
  renderIndex,
  renderRegistry,
} from "../lib/registry.js";
import { resolveProjectModelConfig } from "../lib/models.js";
import { rel, writeText } from "../lib/files.js";

const CANONICAL_PLATFORM = "claude";

export async function syncCommand(options) {
  const root = options.cwd;
  const plan = await computeSyncPlan(options);

  if (options.check) {
    if (plan.changes.length === 0) {
      console.log("orbit sync --check: everything in sync.");
    } else {
      console.log("orbit sync --check: out of sync:\n");
      for (const change of plan.changes) {
        console.log(`- ${change.action}: ${rel(root, change.path)} (${change.reason})`);
      }
      console.log("\nRun `orbit sync` to apply.");
      process.exitCode = 1;
    }
    for (const warning of plan.warnings) {
      console.log(`WARN  ${warning}`);
    }
    return;
  }

  for (const change of plan.changes) {
    await writeText(change.path, change.content);
  }

  if (plan.changes.length === 0) {
    console.log("orbit sync: everything already in sync.");
  } else {
    console.log("orbit sync applied:");
    for (const change of plan.changes) {
      console.log(`- ${change.action}: ${rel(root, change.path)} (${change.reason})`);
    }
  }
  for (const warning of plan.warnings) {
    console.log(`WARN  ${warning}`);
  }
}

// Compute the full reconciliation plan without writing. Shared with `orbit doctor`.
export async function computeSyncPlan(options) {
  const root = options.cwd;
  const tools = await resolveConfiguredTools(root, options.tools);
  const modelConfig = await resolveProjectModelConfig(root);
  const changes = [];
  const warnings = [];

  // --- 1. Canonical skills ---
  const canonical = await listCanonicalSkills(root);
  if (canonical === null) {
    warnings.push(
      `canonical skill dir ${PLATFORM_SKILL_DIRS[CANONICAL_PLATFORM]} not found — run orbit init first`,
    );
  }
  const skills = canonical ?? [];
  const records = buildRecords(skills, tools);
  const routingRows = renderBuilderRoutingRows(
    skills.map((skill) => ({
      id: skill.id,
      kind: "skill",
      orbit_type: skill.meta.orbit_type || "project-skill",
      path_globs: skill.meta.paths || "",
      when_to_use: skill.meta.when_to_use || "",
    })),
  );

  // --- 2. Propagate skill copies to the non-canonical platforms ---
  for (const skill of skills) {
    for (const tool of tools) {
      if (tool === CANONICAL_PLATFORM) {
        continue;
      }
      const dir = PLATFORM_SKILL_DIRS[tool];
      if (!dir) {
        continue;
      }
      await planWrite(
        changes,
        join(root, dir, skill.id, "SKILL.md"),
        platformizeBody(skill.text, tool),
        "derived skill copy out of sync with canonical",
      );
    }
  }

  // --- 3. Agent files: managed frontmatter/header + builder routing block ---
  for (const role of ORBIT_SKILLS.filter((skill) => skill.delegation === "subagent")) {
    for (const tool of tools) {
      if (!isSubagentFor(role, tool)) {
        continue;
      }
      const target = join(root, locationFor(role, tool).path);
      const current = await readTextOrNull(target);

      if (current === null) {
        changes.push({
          path: target,
          content: agentTemplate(role, tool, modelConfig, { routingRows }),
          action: "create",
          reason: "missing agent file",
        });
        continue;
      }

      let next = current;

      if (PLATFORM_AGENT_EXT[tool] === "toml") {
        const split = splitCodexAgent(next);
        if (!split) {
          warnings.push(`${rel(root, target)}: unrecognized TOML shape — left untouched`);
          continue;
        }
        const expectedHeader = codexAgentHeader(role, modelConfig);
        if (split.header !== expectedHeader) {
          next = joinCodexAgent(expectedHeader, split.body);
        }
      } else {
        const split = splitMarkdownFrontmatter(next);
        if (!split) {
          warnings.push(`${rel(root, target)}: no frontmatter found — left untouched`);
          continue;
        }
        const expectedFrontmatter = agentFrontmatter(role, tool, modelConfig);
        if (split.frontmatter !== expectedFrontmatter) {
          next = `${expectedFrontmatter}${split.body}`;
        }
      }

      if (role.id === "orbit-builder") {
        if (hasManagedBlock(next, "builder-routing")) {
          if (extractManagedBlock(next, "builder-routing") !== routingRows) {
            next = replaceManagedBlock(next, "builder-routing", routingRows);
          }
        } else {
          warnings.push(
            `${rel(root, target)}: no builder-routing managed block — insert the orbit:managed markers to activate the generated routing table`,
          );
        }
      }

      if (next !== current) {
        changes.push({
          path: target,
          content: next,
          action: "update",
          reason: "managed region out of sync",
        });
      }
    }
  }

  // --- 4. Index + registry ---
  await planWrite(
    changes,
    join(root, "docs/orbit/skills/index.md"),
    renderIndex(records),
    "index out of sync with skill frontmatter",
  );
  await planWrite(
    changes,
    join(root, ".orbit/skill-registry.json"),
    renderRegistry(records),
    "registry out of sync with skill frontmatter",
  );

  return { changes, warnings };
}

async function listCanonicalSkills(root) {
  const dir = join(root, PLATFORM_SKILL_DIRS[CANONICAL_PLATFORM]);
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || isExcludedSkillId(entry.name)) {
      continue;
    }
    const text = await readTextOrNull(join(dir, entry.name, "SKILL.md"));
    if (text === null) {
      continue;
    }
    skills.push({ id: entry.name, text, meta: parseFrontmatter(text) });
  }

  skills.sort((a, b) => a.id.localeCompare(b.id));
  return skills;
}

// The configured `tools:` list in orbit.config.yaml wins over the CLI default, so sync never
// creates platform dirs the project deliberately excluded at init time.
async function resolveConfiguredTools(root, fallback) {
  const raw = await readTextOrNull(join(root, "orbit.config.yaml"));
  if (raw !== null) {
    const lines = raw.split(/\r?\n/);
    const start = lines.findIndex((line) => /^tools:\s*$/.test(line));
    if (start !== -1) {
      const tools = [];
      for (let index = start + 1; index < lines.length; index += 1) {
        const match = lines[index].match(/^\s+-\s+([a-z]+)\s*$/);
        if (!match) {
          break;
        }
        tools.push(match[1]);
      }
      if (tools.length > 0) {
        return tools;
      }
    }
  }
  return fallback;
}

async function planWrite(changes, path, expected, reason) {
  const current = await readTextOrNull(path);
  if (current === expected) {
    return;
  }
  changes.push({ path, content: expected, action: current === null ? "create" : "update", reason });
}

async function readTextOrNull(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}
