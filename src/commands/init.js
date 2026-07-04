import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, rm, writeFile } from "node:fs/promises";
import {
  LEGACY_SKILL_IDS,
  ORBIT_SKILLS,
  PLATFORM_SKILL_DIRS,
  STACK_DETECTION,
  allDefaultSkills,
  isSubagentFor,
  locationFor,
  selectProjectSkills,
} from "../lib/skills.js";
import {
  TDD_CONTEXT_LINES,
  TDD_RULES,
  agentsMdTemplate,
  claudeMdTemplate,
  agentTemplate,
  decisionsTemplate,
  handoffTemplate,
  openSpecConfigTemplate,
  renderTddRuleSections,
  roadmapTemplate,
  orbitConfigTemplate,
  skillTemplate,
  yamlListItem,
} from "../lib/templates.js";
import { renderBuilderRoutingRows } from "../lib/managed.js";
import { buildRecords, renderIndex, renderRegistry } from "../lib/registry.js";
import { ensureDir, rel, upsertGitignoreLine, writeFileIfAbsent } from "../lib/files.js";
import { resolveProjectModelConfig } from "../lib/models.js";

const execFileAsync = promisify(execFile);

export async function initCommand(options) {
  const root = options.cwd;
  const actions = [];

  // --- Stack detection ---
  // stack-* skills are installed only when their dependency is present in the project's
  // package.json. In a greenfield project (no package.json yet) none are selected; we print a
  // hint below so the user can re-run init once the stack solidifies.
  const detectedDeps = await detectProjectDeps(root);
  const selectedSkills = [...ORBIT_SKILLS, ...selectProjectSkills(detectedDeps)];
  const installedStackIds = selectedSkills
    .map((s) => s.id)
    .filter((id) => id in STACK_DETECTION);

  // --- Model config ---
  // Read the project's existing orbit.config.yaml (if any) BEFORE writing, so user edits to the
  // `models:` block survive a re-run and drive the subagent `model:` lines. Missing keys self-heal
  // from the defaults. This is what makes the tier->model map and per-agent overrides editable in
  // the project (edit orbit.config.yaml, then `orbit init --force`).
  const modelConfig = await resolveProjectModelConfig(root);

  // Routing rows for the builder's managed routing block, derived from the selected skills'
  // frontmatter metadata (pathGlobs/useWhen). `orbit sync` regenerates this block later as the
  // project adds its own skills.
  const templateContext = {
    routingRows: renderBuilderRoutingRows(
      selectedSkills
        .filter((skill) => skill.delegation !== "subagent" && skill.type !== "orbit-entrypoint")
        .map((skill) => ({
          id: skill.id,
          kind: "skill",
          orbit_type: skill.type,
          path_globs: (skill.pathGlobs || []).join(", "),
          when_to_use: (skill.useWhen || []).join("; "),
        })),
    ),
  };

  // --- Orbit harness files ---
  actions.push(await writeFileIfAbsent(join(root, "AGENTS.md"), agentsMdTemplate(), options));
  // Claude Code reads CLAUDE.md, not AGENTS.md. Import AGENTS.md so both stay in sync
  // from a single source of truth (no duplication, no sync hook needed).
  actions.push(await writeFileIfAbsent(join(root, "CLAUDE.md"), claudeMdTemplate(), options));
  actions.push(await writeFileIfAbsent(join(root, "orbit.config.yaml"), orbitConfigTemplate(options.tools, modelConfig), options));
  actions.push(await writeFileIfAbsent(join(root, "docs/orbit/roadmap.md"), roadmapTemplate(), options));
  actions.push(await writeFileIfAbsent(join(root, "docs/orbit/decisions.md"), decisionsTemplate(), options));
  actions.push(await writeFileIfAbsent(join(root, "docs/orbit/handoff.md"), handoffTemplate(), options));
  // Index + registry use the same record model `orbit sync` regenerates from, so a fresh init
  // starts in-sync (no false drift on the first `orbit sync --check`).
  const indexRecords = buildRecords(
    selectedSkills
      .filter((skill) => skill.delegation !== "subagent")
      .map((skill) => ({
        id: skill.id,
        meta: {
          name: skill.id,
          description: skill.summary,
          when_to_use: (skill.useWhen || []).join("; "),
          orbit_type: skill.type,
          paths: (skill.pathGlobs || []).join(", "),
        },
      })),
    options.tools,
  );
  actions.push(await writeFileIfAbsent(join(root, "docs/orbit/skills/index.md"), renderIndex(indexRecords), options));

  // --- Orbit cache ---
  actions.push(await writeFileIfAbsent(join(root, ".orbit/cache.json"), "{}\n", options));
  actions.push(await writeFileIfAbsent(join(root, ".orbit/skill-registry.json"), renderRegistry(indexRecords), options));
  actions.push(await upsertGitignoreLine(root, ".orbit/"));

  // --- Platform-native skill + subagent files ---
  // Delegated roles become real subagents on agent-capable platforms (Claude, OpenCode)
  // and fall back to skills elsewhere (Cursor, Codex). Everything else is a skill.
  for (const tool of options.tools) {
    for (const skill of selectedSkills) {
      const loc = locationFor(skill, tool);
      if (!loc.dir) {
        continue;
      }
      await ensureDir(join(root, loc.dir));

      const content = isSubagentFor(skill, tool)
        ? agentTemplate(skill, tool, modelConfig, templateContext)
        : skillTemplate(skill, tool);
      actions.push(await writeFileIfAbsent(join(root, loc.path), content, options));
    }
  }

  // --- Prune stale Orbit skills (self-heal older installations) ---
  // Remove consolidated skills, and skill copies of roles that are now subagents on this platform.
  for (const tool of options.tools) {
    const skillRoot = PLATFORM_SKILL_DIRS[tool];
    if (!skillRoot) {
      continue;
    }

    const staleIds = new Set(LEGACY_SKILL_IDS);
    for (const skill of allDefaultSkills()) {
      if (isSubagentFor(skill, tool)) {
        staleIds.add(skill.id);
      }
    }

    for (const id of staleIds) {
      const staleDir = join(root, skillRoot, id);
      const removed = await removeDirIfPresent(staleDir);
      if (removed) {
        actions.push({ action: "pruned", path: staleDir });
      }
    }
  }

  console.log("Orbit harness initialized.");
  for (const action of actions) {
    console.log(`- ${action.action}: ${rel(root, action.path)}`);
  }

  if (installedStackIds.length === 0) {
    console.log(
      "\nNo stack skills installed (no matching dependency detected in package.json)."
    );
    console.log(
      "  Add your stack (e.g. @nestjs/core, next, @prisma/client) and re-run `orbit init`"
    );
    console.log("  to install the matching stack-* skills.");
  } else {
    console.log(`\nStack skills installed: ${installedStackIds.join(", ")}.`);
  }

  // --- OpenSpec installation ---
  if (options.skipOpenspec) {
    console.log("\nOpenSpec installation skipped (--skip-openspec).");
  } else {
    console.log("\nInstalling OpenSpec...");
    const openspecInstalled = await installOpenSpec(root, options.tools);

    if (openspecInstalled) {
      // Inject TDD config into openspec/config.yaml
      await injectOpenSpecConfig(root, options);
    }
  }

  console.log("\nNext steps:");
  console.log("- Open an agent in this project and invoke: sdd-orchestrator");
  // Reference an actually-installed skill so the hint is never contradictory (e.g. greenfield).
  const exampleSkill = installedStackIds[0] || "project-testing";
  console.log(`- For direct work, invoke a specific skill such as /${exampleSkill} or $${exampleSkill}.`);
  console.log("- Run orbit doctor to inspect the installation.");
}

// Map Orbit tool names to OpenSpec tool IDs (devin is dropped; all others match directly).
const OPENSPEC_TOOL_MAP = {
  codex: "codex",
  claude: "claude",
  cursor: "cursor",
  opencode: "opencode",
};

async function installOpenSpec(root, tools) {
  // 1. Ensure package.json exists in the target project.
  await ensurePackageJson(root);

  // 2. Install @fission-ai/openspec as a dev dependency.
  console.log("- Running: npm install --save-dev @fission-ai/openspec@latest");
  const install = await run(root, "npm", ["install", "--save-dev", "@fission-ai/openspec@latest"]);

  if (!install.ok) {
    console.warn("WARN  OpenSpec installation failed. You can install it manually:");
    console.warn("      npm install --save-dev @fission-ai/openspec@latest");
    console.warn("      npx openspec init --tools <tools> --force");
    console.warn(`      Details: ${install.stderr.trim()}`);
    return false;
  }

  console.log("- OpenSpec installed.");

  // 3. Run openspec init non-interactively to scaffold the openspec/ directory and tool skills.
  const openspecTools = tools
    .map((t) => OPENSPEC_TOOL_MAP[t])
    .filter(Boolean)
    .join(",");

  const initArgs = ["openspec", "init", "--force"];
  if (openspecTools) {
    initArgs.push("--tools", openspecTools);
  }

  console.log(`- Running: npx openspec init --tools ${openspecTools} --force`);
  const openspecInit = await run(root, "npx", initArgs);

  if (!openspecInit.ok) {
    console.warn("WARN  openspec init failed. Run manually: npx openspec init --tools <tools> --force");
    console.warn(`      Details: ${openspecInit.stderr.trim()}`);
    return false;
  }

  console.log("- OpenSpec initialized.");
  return true;
}

// NOTE: Orbit deliberately does NOT enable OpenSpec's "expanded" workflow profile.
// OpenSpec stores the active workflow set in its GLOBAL (machine-level) config, and there is no
// supported non-interactive way to add the extra commands (verify/new/continue/ff/bulk-archive):
// `openspec config set` cannot write the workflows array, and the only profile preset is `core`.
// Depending on a machine-global, non-portable setting would break Orbit's portability promise, so
// the harness uses only the default-profile commands (propose/explore/apply/sync/archive) plus the
// always-available `openspec validate` CLI. Artifact + acceptance verification is owned by the
// `orbit-qa-verifier` role; `/opsx:verify` is intentionally not part of the flow.

async function injectOpenSpecConfig(root, options) {
  const configPath = join(root, "openspec/config.yaml");

  // Check if OpenSpec already wrote a config.yaml.
  let existingContent = "";
  try {
    existingContent = await readFile(configPath, "utf8");
  } catch {
    // File not yet present; we will create it.
  }

  await writeFile(configPath, mergeOpenSpecTddConfig(existingContent), "utf8");

  console.log("- openspec/config.yaml: TDD rules injected.");
}

export function mergeOpenSpecTddConfig(content = "") {
  if (!content.trim()) {
    return openSpecConfigTemplate();
  }

  let lines = content.trimEnd().split(/\r?\n/);
  lines = ensureTddContext(lines);
  lines = ensureTddRules(lines);
  return `${lines.join("\n")}\n`;
}

function ensureTddContext(lines) {
  const block = findTopLevelBlock(lines, "context");
  const alreadyHasTdd = block
    ? lines.slice(block.start, block.end).join("\n").includes("red-green-refactor")
    : false;

  if (!block) {
    return [...lines, "", "context: |", ...TDD_CONTEXT_LINES.map((line) => `  ${line}`)];
  }

  if (alreadyHasTdd) {
    return lines;
  }

  const first = lines[block.start];
  const value = first.slice(first.indexOf(":") + 1).trim();
  const additions = TDD_CONTEXT_LINES.map((line) => `  ${line}`);

  if (value && !/^[>|]/.test(value)) {
    return [
      ...lines.slice(0, block.start),
      "context: |",
      `  ${value}`,
      ...lines.slice(block.start + 1, block.end),
      ...additions,
      ...lines.slice(block.end),
    ];
  }

  return [
    ...lines.slice(0, block.end),
    ...additions,
    ...lines.slice(block.end),
  ];
}

function ensureTddRules(lines) {
  let next = [...lines];
  let block = findTopLevelBlock(next, "rules");

  if (!block) {
    return [
      ...next,
      "",
      "rules:",
      ...renderTddRuleSections(),
    ];
  }

  for (const [section, rules] of Object.entries(TDD_RULES)) {
    block = findTopLevelBlock(next, "rules");
    const sectionBlock = findNestedBlock(next, block, section);
    const missing = rules.filter((rule) => !next.slice(block.start, block.end).join("\n").includes(rule));

    if (missing.length === 0) {
      continue;
    }

    if (!sectionBlock) {
      next = [
        ...next.slice(0, block.end),
        `  ${section}:`,
        ...missing.map((rule) => `    - ${yamlListItem(rule)}`),
        ...next.slice(block.end),
      ];
      continue;
    }

    next = [
      ...next.slice(0, sectionBlock.end),
      ...missing.map((rule) => `    - ${yamlListItem(rule)}`),
      ...next.slice(sectionBlock.end),
    ];
  }

  return next;
}

function findTopLevelBlock(lines, key) {
  const start = lines.findIndex((line) => new RegExp(`^${key}\\s*:`).test(line));
  if (start === -1) {
    return null;
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^[A-Za-z0-9_-]+\s*:/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return { start, end };
}

function findNestedBlock(lines, parentBlock, key) {
  const start = lines.findIndex((line, index) => {
    return index > parentBlock.start && index < parentBlock.end && new RegExp(`^  ${key}\\s*:`).test(line);
  });
  if (start === -1) {
    return null;
  }

  let end = parentBlock.end;
  for (let index = start + 1; index < parentBlock.end; index += 1) {
    if (/^  [A-Za-z0-9_-]+\s*:/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return { start, end };
}

async function removeDirIfPresent(dir) {
  try {
    await readFile(join(dir, "SKILL.md"), "utf8");
  } catch {
    return false;
  }
  await rm(dir, { recursive: true, force: true });
  return true;
}

// Read dependency + devDependency names from the target project's package.json.
// Returns an empty array when there is no package.json (greenfield) or it is unparseable.
async function detectProjectDeps(root) {
  try {
    const raw = await readFile(join(root, "package.json"), "utf8");
    const pkg = JSON.parse(raw);
    return [
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.devDependencies || {}),
    ];
  } catch {
    return [];
  }
}

async function ensurePackageJson(root) {
  const pkgPath = join(root, "package.json");
  try {
    await readFile(pkgPath, "utf8");
  } catch {
    // Create a minimal package.json so npm install works.
    await writeFile(pkgPath, JSON.stringify({ name: "project", version: "0.1.0", private: true }, null, 2) + "\n", "utf8");
    console.log("- created: package.json (minimal)");
  }
}

async function run(cwd, command, args) {
  try {
    const result = await execFileAsync(command, args, { cwd });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return { ok: false, stdout: error.stdout || "", stderr: error.stderr || error.message };
  }
}
