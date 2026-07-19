import { PLATFORMS } from "./skills.js";
import {
  defaultModelConfig,
  renderModelsSection,
  resolveAgentModelId,
  resolveAgentReasoningEffort,
} from "./models.js";
import { platformizeBody, renderBuilderRoutingRows, renderManagedBlock } from "./managed.js";

export function agentsMdTemplate() {
  return `# AGENTS.md

This project uses Orbit as an agent harness for OpenSpec-driven SDD workflows.

## Startup

- Read this file first.
- Read \`orbit.config.yaml\`.
- Read \`docs/orbit/skills/index.md\` to discover available skills.
- Do not load every \`SKILL.md\` by default.
- Read \`docs/orbit/roadmap.md\` to orient on project status (modules/phases) and the project profile (\`## Project\`: stack, repo layout, architecture). This is the cheap, always-loaded source of project context.
- If \`ARCHITECTURE.md\` exists at the project root, read it before non-trivial implementation, architecture, security, testing, persistence, or package-boundary work — treat it as the normative source for how the repo is built.
- Read \`docs/orbit/decisions.md\` only on demand, when a task needs the reasoning behind a past decision. It is an append-only *why* log and may grow, so it is never loaded by default.
- Read \`docs/orbit/handoff.md\` only when resuming a dirty stop (work paused mid-task).

## Invocation

- If the user invokes \`sdd-orchestrator\`, enter the Orbit SDD flow.
- If the user invokes a direct skill, use that skill without forcing the full Orbit flow.
- Use OpenSpec (via \`/opsx:\` commands) for large, ambiguous, architectural, risky, or product-facing work.
- For small direct tasks, use the relevant project skill and keep the flow lightweight.

## Skill Routing

- Treat \`docs/orbit/skills/index.md\` as metadata only; open a full \`SKILL.md\` only after routing selects it.
- Select skills by task intent, path globs, detected stack, and current OpenSpec tasks.
- Pass the selected skill names and paths to delegated roles so they do not reload the whole index.
- The canonical copy of every skill lives in \`.claude/skills/<id>/SKILL.md\`; the other platform copies, the skill index, and the builder routing table are generated from it. After creating or modifying any skill, run \`orbit sync\`. Use \`orbit sync --check\` in CI to catch drift.

## Delegation And Subagents

Orbit's roles (\`orbit-pm-spec\`, \`orbit-scout\`, \`orbit-builder\`, \`orbit-qa-verifier\`, \`orbit-reviewer\`) are delegated workers, not inline phases.

- On Claude, Cursor, OpenCode, and Codex they are installed as real subagents (\`.claude/agents/\`, \`.cursor/agents/\`, \`.opencode/agents/\`, \`.codex/agents/\`) that run in their own context window. Delegate to them so heavy work (file reads, test output, diffs) never floods the main conversation. Claude/Cursor/OpenCode use markdown files; Codex uses TOML files.
- **Codex only spawns subagents when you explicitly ask** (it does not auto-delegate), so on Codex tell it to spawn the role as a subagent / run agents in parallel.
- The \`sdd-orchestrator\` stays in the main conversation: subagents cannot spawn other subagents, and the orchestrator must own the human gates.
- Prefer delegation for context-heavy steps: scouting, implementation, verification, and review.
- **Model tiers apply on Claude, Cursor, and Codex.** The per-role tiers in \`orbit.config.yaml\` (\`strong\` for pm-spec/qa-verifier/reviewer, \`fast\` for scout) map to concrete models via \`models.tiers.<platform>\` for those subagents, and can be overridden per agent (\`models.agents.<role>.model.<platform>\`). On OpenCode the roles run in the session's model regardless of tier — pick a capable session model there, and rely on the human gates for quality.

## Memory

- \`docs/orbit/roadmap.md\` is the always-loaded orientation file. Its \`## Project\` section holds the stable stack/architecture profile; its \`Modules\` table and \`Now\`/\`Next\` pointers hold project status. The \`Now\` pointer is the single source of truth for the active OpenSpec change and branch. Update statuses and \`Now\`/\`Next\` as work starts and closes. It is an index only — it references OpenSpec change names and never duplicates spec detail.
- \`docs/orbit/decisions.md\` is the on-demand *why* log: durable rationale and rejected alternatives. Loaded only when a task needs the reasoning behind a past decision. Do not put the stack/architecture profile here (that lives in the roadmap), and do not log transcripts or facts already visible in code.
- \`docs/orbit/handoff.md\` captures only the transient state of a dirty stop (next step + blockers not yet in code or tasks.md). The active change and branch live in the roadmap \`Now\` pointer, not here. Write it only when pausing mid-task; clear it on completion.

## OpenSpec Integration

OpenSpec is installed as a project dependency (\`@fission-ai/openspec\`).
Orbit uses the OpenSpec **default** workflow profile only: \`/opsx:propose\`, \`/opsx:explore\`, \`/opsx:apply\`, \`/opsx:sync\`, \`/opsx:archive\`. The expanded-only commands (\`verify\`, \`new\`, \`ff\`, \`continue\`, \`bulk-archive\`) are intentionally NOT used — they require a machine-global OpenSpec setting that is not portable. Artifact + acceptance verification is owned by \`orbit-qa-verifier\` plus the always-available \`npx openspec validate\` CLI.
Use \`npx openspec\` for CLI operations. Use \`/opsx:\` slash commands in the AI chat interface.

**Command syntax per tool**: Claude Code uses a colon (\`/opsx:propose\`). On Cursor, Windsurf, OpenCode, and Codex, substitute the colon for a hyphen (\`/opsx-propose\`, \`/opsx-apply\`, etc.). The same applies to every \`/opsx:\` command referenced in these instructions.

## Git Context

- Before planning or editing, check \`git status --short\` and the current branch when Git is available.
- For non-trivial work, inspect \`git diff --stat\` and relevant recent history.
- Before closing, inspect the final diff, summarize tests, and suggest a commit message.

## Working Principles

These bias toward caution over speed. For trivial tasks, use judgment.

### Think Before Coding

- State assumptions explicitly; if uncertain, ask instead of guessing.
- If multiple interpretations exist, present them — do not pick silently.
- If a simpler approach exists, say so and push back when warranted.
- If something is unclear, stop, name what is confusing, and ask.

### Surgical Changes

- Touch only what the task requires; every changed line should trace to the request.
- Do not refactor, reformat, or "improve" adjacent code that is not broken.
- Match existing style even if you would do it differently.
- Remove only the imports/variables your own change orphaned; flag unrelated dead code, do not delete it.

## Quality

- Functional implementation must use TDD (red-green-refactor) by default.
- Do not close functional work without test evidence or a clear justification.
- Testing evidence must match the touched surface. Use \`project-testing\` to map a change to the required test categories (unit, integration, contract, architecture, database/migration, end-to-end) before implementation and before closure.
- If \`ARCHITECTURE.md\` exists, it is the normative source for repo foundations, architecture boundaries, and testing gates; harness instructions translate that policy and do not override it.
- Reuse existing project patterns before adding new abstractions.
- Ask for human gates before applying, verifying, archiving, or closing important SDD changes.

These principles are working if: diffs contain fewer unnecessary changes, fewer rewrites are needed from overcomplication, and clarifying questions come before implementation rather than after mistakes.
`;
}

// Claude Code reads CLAUDE.md (not AGENTS.md). A single-line @import keeps both files in
// sync from one source of truth; Claude expands the import at session start.
export function claudeMdTemplate() {
  return `@AGENTS.md
`;
}

export function orbitConfigTemplate(tools = PLATFORMS, modelConfig = defaultModelConfig()) {
  return `version: 1
name: orbit

tools:
${tools.map((tool) => `  - ${tool}`).join("\n")}

invocation:
  orchestrator: sdd-orchestrator

memory:
  mode: minimal
  roadmap: docs/orbit/roadmap.md
  decisions: docs/orbit/decisions.md
  handoff: docs/orbit/handoff.md

skills:
  index: docs/orbit/skills/index.md
  load_strategy: selective

git:
  factual_memory: true
  commit:
    automatic: false
    suggest_message: true
  pull_request:
    automatic: false

openspec:
  enabled: true
  directory: openspec
  # Orbit uses the OpenSpec default profile (propose/explore/apply/sync/archive).
  # Expanded-only commands (verify/new/ff/continue/bulk-archive) are not used: they need a
  # machine-global OpenSpec setting that breaks portability. Verification is owned by
  # orbit-qa-verifier + 'npx openspec validate'.
  profile: default
  dependency: "@fission-ai/openspec"
  use_for:
    - large
    - ambiguous
    - architectural
    - risky
    - product-facing

tdd:
  default_for_functional_changes: true
  exceptions:
    - docs-only
    - mechanical-change
    - trivial-config

${renderModelsSection(modelConfig)}
`;
}

export function decisionsTemplate() {
  return `# Orbit Decisions

Append-only log of the *why* behind durable choices (trade-offs, alternatives rejected, rationale).
This file is loaded ON DEMAND only — when a task needs the reasoning behind a past decision.

Do NOT put the project's stack/architecture profile here; that lives in \`docs/orbit/roadmap.md\`
(\`## Project\`) so it is cheap to load every session. Keep entries short and factual.

Format:

## YYYY-MM-DD - Decision title

- Decision:
- Context:
- Alternatives considered:
- Consequences:
- Related OpenSpec change:
`;
}

export function handoffTemplate() {
  return `# Orbit Handoff

Use this file only for the transient state of a DIRTY stop (work paused mid-task). It captures the
mental state that is not yet in code, tasks.md, or git. Write it only when stopping before
completion, and clear it on completion.

The active OpenSpec change and branch live in the \`Now\` pointer of \`docs/orbit/roadmap.md\` — do
not duplicate them here.

## Paused Work

- Status: none
- Next step:
- Blockers / risks (not yet in code or tasks.md):
`;
}

export function roadmapTemplate() {
  return `# Project Roadmap

Lightweight, durable map of the project's modules and phases. This is the first file the
orchestrator reads to orient on project status across sessions.

Keep this file an INDEX, not a spec:
- One row per module/phase. Statuses: \`backlog\`, \`planned\`, \`in-progress\`, \`done\`.
- Reference the OpenSpec change name in the last column when a phase is active or archived.
- Detailed requirements live in OpenSpec (\`openspec/specs/\`, \`openspec/changes/\`) and in code — do not duplicate them here.
- The \`## Project\` section holds the stable stack/architecture profile (loaded every session). The *why* behind those choices lives in \`docs/orbit/decisions.md\` (loaded on demand) — link, do not copy.

## Project

Foundational, stable profile loaded every session for cheap orientation. Keep it short; the *why*
behind these choices lives in \`docs/orbit/decisions.md\` (loaded on demand).

- Name:
- Frontend:
- Backend:
- Database:
- Repo layout: (e.g. monorepo: apps/web, apps/api)
- Key architecture notes:
- Last updated:

## Now / Next

- Now: (active OpenSpec change + branch, or none)
- Next: (next planned phase to pick up)

## Modules

| Module | Phase | Status | OpenSpec change |
|--------|-------|--------|-----------------|
| example | initial scope | planned | — |
`;
}

// TDD context and per-artifact rules injected into openspec/config.yaml. Single source for both
// the fresh template below and the merge path in init.js (mergeOpenSpecTddConfig).
export const TDD_CONTEXT_LINES = [
  "This project uses TDD (red-green-refactor) for all functional changes.",
  "Write a failing test before writing production code.",
  "Run the narrowest relevant test suite to confirm failure, then implement the minimum code to pass.",
  "Run the closing suites required for the touched surface before marking any task complete; see the project-testing skill for the surface-to-suite mapping.",
  "Record test commands run and their outcomes in the implementation session.",
  "TDD red/green is necessary but not sufficient: evidence must cover the changed layer and risk (see project-testing).",
  "If ARCHITECTURE.md exists at the project root, testing policy comes from it plus project-testing.",
];

export const TDD_RULES = {
  tasks: [
    "Every task that changes functional behavior must include a test sub-task listed first.",
    'Format: "T.0 Write failing test for <behavior>" before any implementation sub-task.',
    "Include a closing verification sub-task naming the required suites for the touched surface (see project-testing).",
    "Do not mark a task complete unless the required suites pass, or a human explicitly accepts a documented exception.",
  ],
  design: [
    "Include a Testing Strategy section describing the test approach and key scenarios.",
    "Identify the touched surfaces: domain/core logic, API endpoint, worker/job, UI, database/migration, architecture/boundaries, or infrastructure.",
    "For each touched surface, name the required test categories per project-testing (unit, integration, contract, architecture, database/migration, build, or end-to-end).",
    "Explain when end-to-end tests do not apply; reserve them for critical complete user flows once those flows exist.",
  ],
  proposal: [
    "Include a Risk section identifying unknowns and implementation risks.",
  ],
};

// Quote a YAML sequence scalar when it would otherwise parse as a nested mapping (a ": " inside
// the value makes an unquoted scalar ambiguous and OpenSpec silently drops the whole rules array).
// Single-quote style; internal single quotes are doubled per YAML.
export function yamlListItem(value) {
  if (/:\s/.test(value) || /^["'&*?|>%@`]/.test(value)) {
    return `'${value.replace(/'/g, "''")}'`;
  }
  return value;
}

export function renderTddRuleSections() {
  return Object.entries(TDD_RULES).flatMap(([section, rules]) => [
    `  ${section}:`,
    ...rules.map((rule) => `    - ${yamlListItem(rule)}`),
  ]);
}

export function openSpecConfigTemplate() {
  return `# OpenSpec project configuration
# Generated by Orbit. Edit to add project-specific context and rules.

schema: spec-driven

context: |
${TDD_CONTEXT_LINES.map((line) => `  ${line}`).join("\n")}

rules:
${renderTddRuleSections().join("\n")}
`;
}

export function skillTemplate(skill, platform) {
  const frontmatter = [
    `name: ${skill.id}`,
    `description: ${skill.summary}`,
    `when_to_use: ${skill.useWhen.join("; ")}`,
    `orbit_type: ${skill.type}`,
  ];

  if (skill.pathGlobs?.length) {
    frontmatter.push(`paths: ${skill.pathGlobs.join(", ")}`);
  }

  // No model line: skills run inline in the session's model. The model tier only has an effect in
  // file-based subagents (see agentTemplate); writing `model:` here would be dead metadata. This
  // path now only renders non-subagent skills (sdd-orchestrator, project-*) on every platform.

  return platformizeBody(
    `---
${frontmatter.join("\n")}
---

# ${skill.id}

${skill.summary}

## When To Use

${skill.useWhen.map((item) => `- ${item}`).join("\n")}

## Instructions

${roleInstructions(skill.id, platform)}
`,
    platform,
  );
}

// Real subagent definition for platforms that support file-based subagents.
// Claude reads: name, description, tools (omit => all), model.
// Cursor reads: name, description, model, readonly (single boolean), is_background.
// OpenCode reads: description, mode, model (optional), permission, body as system prompt.
// Codex reads a standalone TOML file (see codexAgentTemplate) — a different format, so it is
// dispatched separately.
export function agentTemplate(skill, platform, modelConfig = defaultModelConfig(), context = {}) {
  if (platform === "codex") {
    return codexAgentTemplate(skill, modelConfig, context);
  }

  const body = platformizeBody(
    `${skill.summary}

## When To Use

${skill.useWhen.map((item) => `- ${item}`).join("\n")}

## Instructions

${roleInstructions(skill.id, platform, context)}
`,
    platform,
  );

  return `${agentFrontmatter(skill, platform, modelConfig)}\n${body}`;
}

// The harness-managed part of a subagent markdown file. `orbit sync` regenerates exactly this
// block (from the capability presets + model config) and preserves the body below it.
export function agentFrontmatter(skill, platform, modelConfig = defaultModelConfig()) {
  const cap = skill.capability || {};
  const description = `${skill.summary} Use when: ${skill.useWhen.join("; ")}.`;
  const lines = [];

  if (platform === "claude") {
    lines.push(`name: ${skill.id}`, `description: ${description}`);
    if (cap.claudeTools) {
      lines.push(`tools: ${cap.claudeTools}`);
    }
    lines.push(`model: ${resolveAgentModelId(modelConfig, skill, "claude")}`);
  } else if (platform === "cursor") {
    lines.push(
      `name: ${skill.id}`,
      `description: ${description}`,
      `model: ${resolveAgentModelId(modelConfig, skill, "cursor")}`,
    );
    if (cap.cursorReadonly) {
      lines.push(`readonly: true`);
    }
  } else {
    // opencode: no per-role model (session model applies); permission map gates edit/bash.
    lines.push(`description: ${description}`, `mode: subagent`);
    const perm = cap.opencodePermission;
    if (perm) {
      lines.push("permission:");
      for (const [key, value] of Object.entries(perm)) {
        lines.push(`  ${key}: ${value}`);
      }
    }
  }

  return `---\n${lines.join("\n")}\n---\n`;
}

// Codex custom agents are standalone TOML files under .codex/agents/. Required keys: name,
// description, developer_instructions. Optional: model, model_reasoning_effort, sandbox_mode
// (omitted keys inherit from the parent session). Codex only spawns these when explicitly asked.
function codexAgentTemplate(skill, modelConfig = defaultModelConfig(), context = {}) {
  const instructions = platformizeBody(
    `${skill.summary}

## When To Use

${skill.useWhen.map((item) => `- ${item}`).join("\n")}

## Instructions

${roleInstructions(skill.id, "codex", context)}`,
    "codex",
  );

  // developer_instructions uses a TOML multiline literal string ('''...''') so the markdown body
  // is stored verbatim without escape processing.
  return `${codexAgentHeader(skill, modelConfig)}developer_instructions = '''\n${instructions}\n'''\n`;
}

// The harness-managed header keys of a Codex agent TOML file. `orbit sync` regenerates exactly
// these lines and preserves the developer_instructions body.
export function codexAgentHeader(skill, modelConfig = defaultModelConfig()) {
  const cap = skill.capability || {};
  const description = `${skill.summary} Use when: ${skill.useWhen.join("; ")}.`;
  const lines = [
    `name = ${tomlString(skill.id)}`,
    `description = ${tomlString(description)}`,
  ];

  const model = resolveAgentModelId(modelConfig, skill, "codex");
  if (model && model !== "inherit") {
    lines.push(`model = ${tomlString(model)}`);
  }
  const reasoningEffort = resolveAgentReasoningEffort(modelConfig, skill, "codex");
  if (reasoningEffort && reasoningEffort !== "inherit") {
    lines.push(`model_reasoning_effort = ${tomlString(reasoningEffort)}`);
  }
  if (cap.codexSandbox) {
    lines.push(`sandbox_mode = ${tomlString(cap.codexSandbox)}`);
  }

  return `${lines.join("\n")}\n`;
}

// Quote a value as a TOML basic string, escaping backslashes and double quotes.
function tomlString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function roleInstructions(id, platform, context = {}) {
  if (id === "sdd-orchestrator") {
    return `You govern the Orbit SDD flow. Your operating posture: bias to reuse over new abstractions, challenge every scope expansion, never pass a gate without evidence, and choose the cheapest correct path — not the most thorough one.

### On Invocation

- If invoked without a requirement, say that Orbit SDD Orchestrator is active and ask for the requirement.
- Load \`AGENTS.md\`, \`orbit.config.yaml\`, and \`docs/orbit/skills/index.md\`.
- Read \`docs/orbit/roadmap.md\` to orient before classifying: the \`## Project\` section gives the stack/architecture profile and the \`Modules\`/\`Now\`/\`Next\` pointers give status. This is the cheapest way to regain full project context in a new session.
- If the roadmap \`Now\` pointer names an active OpenSpec change, read \`openspec/changes/<change>/routing.md\` when it exists to recover the approved routing packet before delegating.
- If \`ARCHITECTURE.md\` exists at the project root, read it before proposing or applying non-trivial, structural, security, persistence, testing, or package-boundary work — it is the normative source inside the repo.
- Read \`docs/orbit/decisions.md\` only when you need the reasoning behind a past decision (it is an on-demand *why* log, not loaded by default).
- Check \`git status --short\` when Git is available.
- Do not load every skill body. Select skills by requirement, file paths, and stack.

### Project Kickoff (new or empty project)

When the project is new or the roadmap is still empty, before any feature work:

1. Help the user define the tech stack (frameworks, languages, database, repo layout). Write the resulting profile into the \`## Project\` section of \`docs/orbit/roadmap.md\` (stable, loaded every session). Record only the *why* (rejected alternatives, trade-offs) in \`docs/orbit/decisions.md\`.
2. Help the user lay out the project's modules and phases (e.g. auth, admin, web features, app features) and write them to the \`Modules\` table of \`docs/orbit/roadmap.md\` as \`planned\`/\`backlog\` rows. Keep it an index — no spec detail.
3. Set the \`Now\` / \`Next\` pointers so future sessions know where to resume.

The roadmap (profile + status) and decisions (why) are durable and survive across sessions; the per-feature detail lives in OpenSpec.

### Delegation Model

You stay in the main conversation and own the human gates. Delegate context-heavy work to the Orbit roles so their file reads, test output, and diffs stay out of this conversation:

- On Claude/Cursor/OpenCode/Codex these roles are subagents with isolated context windows — delegate to \`orbit-scout\`, \`orbit-builder\`, \`orbit-qa-verifier\`, \`orbit-reviewer\`, and \`orbit-pm-spec\` and consume only their summaries.
- On Codex, explicitly ask to spawn the role as a subagent (Codex does not auto-delegate); the others delegate by name.
- Subagents cannot spawn subagents, so never delegate the orchestrator itself.
- Give each delegation a complete, self-contained prompt (context, scope, constraints, expected
  report shape) so the agent needs no follow-up to start. Send a follow-up only to relay a blocker,
  a human-gate decision, or a scoped remediation — not to steer routine progress.

### Classification

Route before anything else. Pick by concrete signals, not by size:

- **Direct** — single understood change in a known file, reversible, no external contracts touched → use the relevant project skill, skip the full flow.
- **Scout first, then build** — change is understood but the code area is unknown (needs 4+ files to orient, unfamiliar module, existing integration to trace) → delegate to \`orbit-scout\`, then \`orbit-builder\`.
- **Full SDD flow** — enter when ANY of these is true:
  - Touches auth, authz, payments, billing, or a security surface
  - Changes a public API contract, webhook schema, or external integration
  - Requires a destructive or irreversible operation (migration, data deletion, schema change)
  - Affects a core shared module with many dependents
  - Product ask remains ambiguous after one clarifying question
  - User explicitly requests a spec or design artifact

After classifying, state the clarification routing (pm-spec / explore / scout — yes or no, with a
one-line justification each) in the kickoff message and continue without waiting for approval; the
user corrects the routing only if they wish. Stop only for a genuinely blocking question.

### Clarification Roles — What vs Where vs How

Three mechanisms clarify a requirement. They are distinct; do not run all three by reflex — pick by what is actually unclear:

- \`orbit-pm-spec\` — **the WHAT/WHY**: user story, acceptance criteria, goals/non-goals, scope, risks. Use when the product ask is vague.
- \`orbit-scout\` — **the WHERE**: files, conventions, reusable code, technical risks in the repo. Use when the code area is unknown.
- \`/opsx:explore\` — **the HOW (options)**: compare technical approaches. Use only when the approach is genuinely uncertain. It does NOT improve a vague requirement (that is pm-spec's job) — run it after the WHAT is clear.

For product-facing features, \`orbit-pm-spec\` runs by default — an existing decision in
\`docs/orbit/decisions.md\` is input to pm-spec, not a reason to skip it; skipping requires stated
justification (e.g. the WHAT is already normative in \`ARCHITECTURE.md\` or existing specs). Discovery
completeness is measured, not assumed: if pm-spec returns dense or structural blocking Open
Questions (not just a couple of details), do not relay them as a long questionnaire — recommend a
discovery round with the user (\`/opsx:explore\` in thinking-partner mode, feeding durable outcomes
to \`docs/orbit/decisions.md\`) before proposing.

### Full SDD Flow (OpenSpec tasks)

0. **Roadmap sync + branch — start**: pick the change name now and create (or switch to) the working branch \`change/<change-name>\` from an up-to-date \`main\` before proposing or editing — never work on protected \`main\`; reuse the branch if the \`Now\` pointer or \`routing.md\` already names it. Then mark the relevant module/phase as \`in-progress\` in \`docs/orbit/roadmap.md\` and set the \`Now\` pointer to the active OpenSpec change + branch. Add a row first if the work is not yet listed. The stack/architecture profile is already in the roadmap \`## Project\` section from startup.
1. **PM Spec** (if the product ask is vague): delegate to \`orbit-pm-spec\` to produce a user story, acceptance criteria, scope/non-goals, and risks. These acceptance criteria are the contract \`orbit-qa-verifier\` checks later. pm-spec cannot talk to the user; it returns Open Questions tagged blocking/non-blocking. Relay the blocking ones to the user in a batch, then re-delegate with the answers as fresh input (stateless — do not rely on subagent continuity). This is human-driven iteration: **no hard round cap** — iterate while the user keeps answering; at most suggest timeboxing the rest as spec Open Questions. If pm-spec is skipped, the acceptance criteria default to the Given/When/Then scenarios in the specs \`/opsx:propose\` generates.
2. **Explore** (only if the technical approach is uncertain): run \`/opsx:explore <topic>\` to compare approaches before proposing. Skip it otherwise.
3. **Propose**: run \`/opsx:propose <change-name>\` to create the change and generate all planning artifacts (proposal, specs, design, tasks) in one step.
4. **Human gate — planning review**: stop and present the generated artifacts (proposal, specs, design, tasks) to the user. Before presenting, cross-check every version the artifacts pin (runtime, base images, dependency majors) against the repo's existing pins (\`engines\`, \`.nvmrc\`, CI, Dockerfiles, lockfile) and recent git history; a mismatch is an artifact defect to fix before the gate, not during apply. Build a compact routing packet from proposal/specs/design/tasks: touched surfaces, selected project skills with paths, required evidence from \`project-testing\`, inputs for \`orbit-builder\`, \`orbit-qa-verifier\`, and \`orbit-reviewer\`, and skills intentionally not loaded. This gate is an **iterative checkpoint, not a one-pass approve/reject**: when the user asks for a change, apply it with the right actor (WHAT → pm-spec/proposal; HOW → design/explore; a spec detail → direct edit, no subagent) and re-present, with **no round cap**, until explicit approval. On approval, write the packet to \`openspec/changes/<change-name>/routing.md\`: it is the approved coordination plan the delegated roles read, it survives context compaction and session breaks, and it is archived with the change.
5. **Apply with TDD**: delegate implementation to \`orbit-builder\`, which runs \`/opsx:apply <change-name>\` and enforces red-green-refactor per task. Point the builder at \`openspec/changes/<change-name>/routing.md\` as the primary source for selected skills and required evidence. The TDD rules are already injected into the OpenSpec config; hold the builder accountable if it deviates.
6. **QA — verify it works**: delegate to \`orbit-qa-verifier\` with the routing packet (\`openspec/changes/<change-name>/routing.md\`) and the change artifacts to run tests, check completeness/correctness against the specs (with \`npx openspec validate\`), and confirm every acceptance criterion is met with evidence. \`project-testing\` defines the evidence matrix; it does not replace QA. (This harness does not use \`/opsx:verify\`; the QA role owns that check.) On any FAIL, enter the **Remediation Loop** (below) before moving on.
7. **Reviewer — adversarial review** (after QA is green, so the reviewer sees a near-final diff): delegate to \`orbit-reviewer\` for a fresh-context diff review (bugs, regressions, test quality, security, scope drift). This does not replace QA evidence; it looks for risks QA may miss. Include the routing packet so the reviewer can flag deviations from the approved plan. CRITICAL/HIGH findings enter the **Remediation Loop**; MEDIUM/LOW go to the gate as informational. For **high-risk changes** (security-sensitive surface, large blast radius / core modules, destructive migrations, or when the user asks), escalate: launch 2-3 \`orbit-reviewer\` passes in parallel, each with a single lens (bugs / regressions-via-history / security), then synthesize and dedupe — tell each pass to restrict findings to its assigned lens plus scope drift, not to also run its full generic lens list. Otherwise a single pass is enough.
8. **Human gate — delivery review** (single, consolidated): present (a) QA PASS/WARN evidence per criterion and suite, (b) reviewer findings with their resolution (fixed / accepted / open-LOW), (c) the \`## Verification Log\` summary of remediation cycles, and (d) the final \`git diff --stat\`. Explicit approval authorizes archive; WARNs and accepted findings require explicit acknowledgement. Do not archive until approved.
9. **Archive**: when approved, run \`/opsx:sync <change-name>\` (merge delta specs into main specs) then \`/opsx:archive <change-name>\`. Before archiving, append a \`## Metrics\` line to \`routing.md\` — per-role token usage (from task-completion notifications), turn/resume count, number of remediation cycles, findings by severity, count of full verify runs, and count of Docker/image builds — so cost patterns are visible across changes without instrumentation.
10. **Close**: summarize what was built, record any durable *why* in \`docs/orbit/decisions.md\`, mark the module/phase \`done\` in \`docs/orbit/roadmap.md\` (link the archived change name), reset the \`Now\` pointer and advance \`Next\`, clear \`docs/orbit/handoff.md\` if used, and suggest a commit message plus a pull request.

### Evidence Ownership

One full required-suite verification per candidate state, not one per actor per cycle:

- \`orbit-builder\` runs the full required-suite verification once, at the end of its apply pass —
  not before every task and not again inside a remediation cycle.
- Remediation cycles (a re-delegation scoped to one finding) run ONLY the suites/criteria that
  finding touches, for both the builder's fix and QA's re-verify — never a repo-wide verify for a
  scoped fix.
- \`orbit-qa-verifier\` owns the single closing run: full required suites over the final diff, after
  the last remediation cycle. Sync and archive (and any project-specific release verification)
  consume that evidence plus \`openspec validate\` — they do not re-run test/build suites.
- \`orbit-reviewer\` never executes test/build/Docker suites; it reviews code, diffs, history, and
  existing evidence. Evidence that looks insufficient is a finding for QA to close, not something
  the reviewer reruns itself.
- If the same environment failure (daemon down, credential/auth loop, network, unavailable
  service — not a code defect) recurs twice for \`orbit-builder\` or \`orbit-qa-verifier\`, they stop
  retrying and report it to you as an external blocker. Treat it as a human gate: resolve the
  environment or explicitly accept the gap, then resume — do not let an agent keep re-running
  expensive builds against a broken environment.

### Remediation Loop

When QA reports FAIL or the reviewer reports CRITICAL/HIGH, classify each finding before acting:

- **Code defect** (the spec is correct, the code does not meet it) → remediate: re-delegate to \`orbit-builder\` with a prompt scoped to the finding (TDD, no broadening), then have \`orbit-qa-verifier\` re-verify only the affected criteria/suites. The builder never self-certifies its own fix.
- **Spec/artifact defect** (missing scenario, wrong criterion, incomplete tasks, or a spec that does not solve the original requirement) → do NOT loop: escalate to the user immediately as a re-planning event (fix the artifacts, confirm, resume). When classification is genuinely uncertain, treat it as an artifact defect and escalate — friction is cheaper than silent spec drift.

Bound the autonomous loops (builder↔QA and reviewer↔builder) at **2 cycles per lens** (a default, not dogma — the user may extend it at an escalation gate). This cap applies only to these post-approval autonomous loops, never to human-driven planning iteration. On exhaustion, stop and give the user the choice: accept as a documented exception, re-plan via \`routing.md\`, or drop. Never keep iterating in silence.

A reviewer re-check is a **fresh instance**: pass it the routing packet, the prior findings with their declared resolution, and the diff since the last review; it verifies the resolutions and scans only the new hunks. New findings are legitimate and consume the same lens budget. After the last cycle, have QA run the full required suites once (closing run) so the gate evidence reflects the final diff.

Record one compact line per cycle in a \`## Verification Log\` section of
\`openspec/changes/<change-name>/routing.md\`, in the form
\`actor | lens | finding | severity | classification | action | evidence-pointer\` — the
evidence-pointer names a command/suite/result, it does not paste output. Example:
\`QA | build-runtime | REDIS_URL placeholder guard missing | MEDIUM | code defect | fixed | api+worker test:unit 7/7\`.
Full narrative belongs in the delegated agent's own report to you, not duplicated into \`routing.md\`
or \`tasks.md\`. The log is durable and archived with the change.

### Quality Rules

- Functional changes require TDD unless docs-only, mechanical, or trivial config.
- Do not close functional work without test evidence that matches the touched surface.
- Gates are not formalities: verify the artifacts genuinely answer the requirement before proceeding.
- Challenge scope expansions — ask "why is this in scope right now?" before accepting them.
- No one self-certifies: every builder fix is re-verified by \`orbit-qa-verifier\`.
- Human-driven iteration (planning gate, pm-spec relay) has no hard round cap; the 2-cycle circuit breaker applies only to autonomous remediation loops.
- Suggest a commit at each durable checkpoint (planning-gate approval, apply complete, each remediation cycle closed); \`commit.automatic\` is false, so these are suggestions, not auto-commits.`;
  }

  if (id === "orbit-pm-spec") {
    return `Turn a vague idea or request into a structured, implementation-neutral spec. Gather context conversationally — ask the most important questions first, do not dump them all at once. Produce these sections (markdown, scannable):

- **Problem Statement**: the user problem, who experiences it, and the cost of not solving it (2-3 sentences, grounded in evidence when available).
- **Goals**: 3-5 measurable outcomes (outcomes, not outputs — "reduce time to first value by 50%", not "build a wizard").
- **Non-Goals**: 3-5 things explicitly out of scope, each with a brief rationale. These prevent scope creep.
- **User Stories**: "As a [specific actor], I want [capability] so that [benefit]". The actor must be specific ("enterprise admin", not "user"); the benefit explains the why. Order by priority; include edge/empty/error cases.
- **Requirements**: categorize as **P0 (must-have)**, **P1 (nice-to-have)**, **P2 (future)**. Be ruthless about P0 — "if everything is P0, nothing is P0"; challenge every must-have with "would we really not ship without this?".
- **Acceptance Criteria**: per requirement, in Given/When/Then form. Cover the happy path, edge cases, AND negative cases (what should NOT happen). Each criterion must be independently testable; avoid vague words ("fast", "intuitive").
- **Open Questions**: genuinely unresolved questions, tagged with who must answer (eng/design/legal/data) and whether they block starting.
- **Risks**: unknowns and implementation risks.

Keep it implementation-neutral unless technical constraints are already known. The acceptance criteria become the contract that \`orbit-qa-verifier\` checks. Output is suitable to feed \`/opsx:propose\`.`;
  }

  if (id === "orbit-scout") {
    return `- Investigate without editing.
- Identify stack, conventions, key files, tests, risks, and existing reusable code.
- Inventory the repo's pinned toolchain and dependency versions relevant to the task (\`engines\`,
  \`.nvmrc\`, CI setup versions, Docker base images, key dependency majors) and report them as
  facts; any design that pins a version must match these existing deliberate pins.
- Summarize findings in a compact handoff suitable for orbit-builder or the orchestrator.
- Stop when enough context exists to implement safely.`;
  }

  if (id === "orbit-builder") {
    return `You implement approved work and run the OpenSpec apply phase. Keep the heavy work (file reads, edits, test runs) in your own context and return a compact summary.

- Implement only approved scope from the current requirement or OpenSpec tasks.
- For structural, security, persistence, testing, package-boundary, or architecture work, check whether \`ARCHITECTURE.md\` exists at the project root and treat it as normative if it does.
- Run \`/opsx:apply <change-name>\` and work through \`tasks.md\`, marking checkboxes as you go.
- Load only the stack/project skills relevant to the files you touch before editing.

### Skill Selection

Use the routing packet at \`openspec/changes/<change-name>/routing.md\` (written by the orchestrator at the planning gate) as the primary source for selected skills; if it is missing for an OpenSpec change, ask before proceeding. Verify it against the routing map below and pause if a required skill is missing or the map conflicts with the touched files:

${renderManagedBlock("builder-routing", context.routingRows ?? renderBuilderRoutingRows([]))}

- Apply strict red-green-refactor for every functional task, in **vertical slices (tracer bullets)** — one test → minimal code → repeat. Do NOT write all tests first then all code ("horizontal slicing" produces tests of imagined behavior). Per behavior:
  1. Write ONE failing test for the next behavior.
  2. Run the narrowest relevant test to confirm it fails (explain if a red step is genuinely impossible).
  3. Write the minimum production code to pass — nothing speculative.
  4. Run focused tests to confirm green, then broader checks when risk justifies it.
  5. Refactor only while tests stay GREEN — never refactor while red.
- Tests must verify **behavior through public interfaces, not implementation details**. A test that breaks on a pure refactor (no behavior change) is testing the wrong thing — rewrite it.
- Use \`project-testing\` to identify the required closing suites for the touched surface. Red/green TDD is not sufficient when the change also requires integration, contract, architecture, database, or build evidence.
- Do not mark a task complete unless the required suites pass, or a human explicitly accepts a documented exception.
- Evidence is proportional to state: run the full required-suite verification (e.g. \`pnpm verify\`)
  once, at the end of your apply pass — not before every task. If you are re-delegated inside a
  remediation cycle for one finding, run only the suites/criteria that finding touches; never
  repeat a repo-wide verify for a scoped fix.
- Prefer existing project patterns and shared helpers; do not silently broaden scope.
- Pause on ambiguity, design issues, or blockers instead of guessing.
- Environmental circuit breaker: if the same environment failure recurs twice (daemon down,
  credential/auth loop, network, unavailable service — not a code defect), stop retrying. Report it
  as an external blocker and wait; do not keep re-running expensive builds/images hoping the
  environment changes on its own.
- Do not end your run while your own background tasks (monitors, watchers, long-running commands)
  are still pending: finish them, kill them, or report them as blockers — never stop to "wait" for
  a notification that will outlive your run.
- Return: tasks completed, touched surfaces, test commands run and their outcomes by suite, files changed, missing/unavailable suites, and any open risks — evidence for orbit-qa-verifier and orbit-reviewer.`;
  }

  if (id === "orbit-qa-verifier") {
    return `You verify that an approved change actually works and satisfies its acceptance criteria. This harness does not use OpenSpec's \`/opsx:verify\`, so you also own the artifact-coherence check. Run the heavy work in your own context and return a compact PASS/WARN/FAIL report with evidence.

Inputs: the OpenSpec change (\`proposal.md\`, \`specs/\`, \`design.md\`, \`tasks.md\`), the acceptance criteria from \`orbit-pm-spec\`, the routing packet (\`openspec/changes/<change>/routing.md\`) when present, and the diff.

Work in this order:
1. **Completeness**: every task in \`tasks.md\` is checked off AND actually implemented (not just marked). Run \`openspec validate <change>\` for structural validation of the specs/changes (CLI, available in the default profile).
2. **Correctness vs spec**: the code satisfies each spec delta (ADDED / MODIFIED / REMOVED) and its Given/When/Then scenarios.
3. **Acceptance criteria**: for EACH criterion from \`orbit-pm-spec\`, find or run a test/check that proves it. Prefer automated tests; use Playwright, curl, or dev-server checks when behavior is end-to-end.
4. **Testing sufficiency**: use \`ARCHITECTURE.md\` (if present) and \`project-testing\` to map touched surfaces to required suites. PASS only when evidence matches the required suites. WARN when a required suite is not scaffolded or cannot run but the gap is documented. FAIL when the wrong suite substitutes for an obligatory one, such as unit tests substituting for required database or migration tests.
5. **Evidence**: record the exact commands run and their outcomes. If coverage is missing for a scenario, propose the minimum viable test or reproducible step — do not hand-wave.

Report per criterion and per required suite: PASS / WARN / FAIL with evidence (command + result, or \`file:line\`). On any FAIL, classify it as a **code defect** (spec correct, code does not meet it → the orchestrator loops it back to \`orbit-builder\`) or a **spec/artifact defect** (missing scenario, wrong criterion, incomplete tasks → the orchestrator escalates to the user); when uncertain, call it an artifact defect. On a remediation re-verify, re-run ONLY the affected criteria/suites — not the full matrix — and append one compact line (\`actor | lens | finding | severity | classification | action | evidence-pointer\`) to a \`## Verification Log\` in \`routing.md\`. Run the full required suites exactly once, as the single closing run over the final diff after the last remediation cycle; that is the evidence sync/archive (and any project-specific release verification) consume, so do not repeat it later. Environmental circuit breaker: if the same environment failure (daemon down, credential/auth loop, network, unavailable service — not a code defect) recurs twice, stop retrying, report it as an external blocker, and wait. Do not approve closure while any FAIL stands without explicit human acknowledgement. Stay to findings + evidence; do not edit code.`;
  }

  if (id === "orbit-reviewer") {
    return `You review the change with fresh context to catch what verification misses: bugs and problems the change introduces. Start from \`git status\` and \`git diff\`. When \`openspec/changes/<change>/routing.md\` exists, read it and flag deviations from the approved plan (skills skipped, evidence substituted, unapproved scope). Report findings before fixes; do not rewrite code unless asked.

Use Bash only for read-only inspection (\`git\`, \`grep\`, \`find\`, log/history) — never to run test suites, builds, or Docker; QA owns that evidence. If existing evidence looks insufficient or stale, report that as a finding for QA to close, don't generate the evidence yourself. When the orchestrator assigns you a single lens (multi-pass escalation for a high-risk change), restrict your findings to that lens plus scope drift — do not also run the other generic lenses below.

Review through these lenses, in priority order:
1. **Correctness bugs** in the diff: logic errors, off-by-one, null/undefined, error handling, race conditions, resource leaks.
2. **Regressions**: trace each changed function/contract to its callers; flag behavior other code depended on. Inspect file history (\`git log\`/blame) for risky areas.
3. **Requirement satisfaction**: confirm the change solves the ORIGINAL requirement, not just that artifacts match.
4. **Test quality**: tests must verify behavior through public interfaces, not implementation details — a test that breaks on a pure refactor is testing the wrong thing. Flag missing tests for changed behavior and tests coupled to implementation.
5. **Testing sufficiency**: use \`ARCHITECTURE.md\` (if present) and \`project-testing\` as the expected evidence matrix. Flag suite substitution, missing negative auth/tenant cases, mocks used in place of real database-enforced security checks, redundant tests with no added signal, and skipped/weakened tests.
6. **Security** on the touched paths: input validation, authz, injection, secret handling.
7. **Scope drift**: changes not traceable to the requirement.

**Score every finding 0-100 for confidence and report only those >= 80** (or clearly mark lower-confidence ones as such). This keeps the signal high.

**Do NOT flag** (false positives): pre-existing issues; lines the change did not modify; anything a linter/typechecker/compiler would catch; stylistic nitpicks not required by project conventions; intentional changes related to the broader requirement.

Report each finding with: severity (CRITICAL / HIGH / MEDIUM / LOW), location (\`file:line\`), and why it matters, and classify it as a code defect (the orchestrator loops it back to \`orbit-builder\`) or a spec/artifact defect (the orchestrator escalates to the user). On a remediation re-check you are a fresh instance: the orchestrator hands you your prior findings with their declared resolution plus the diff since the last review — verify each resolution and scan only the new hunks; new findings follow the same rules and confidence threshold. For high-risk or security-sensitive changes, do two independent passes and synthesize. (The orchestrator may also escalate by running additional independent reviewer passes with distinct lenses for high-risk changes.) On Claude Code, \`/code-review\` and \`/security-review\` can complement this pass.`;
  }

  if (id === "stack-nestjs") {
    return `- Follow Nest.js module boundaries: controllers handle transport, services hold business logic, providers are injectable.
- Use DTOs and validation for request input.
- Reuse existing modules, providers, guards, pipes, and exception conventions before adding new ones.
- Add or update tests around service/controller behavior when functional behavior changes.
- Keep database access behind established repository/service patterns.`;
  }

  if (id === "stack-nextjs") {
    return `- Follow the project router convention already in use before introducing alternatives.
- Keep server/client component boundaries explicit.
- Reuse shared components, hooks, utilities, and styling conventions.
- Verify loading, error, empty, and responsive states for user-facing changes.
- Use Playwright or component-level tests when the behavior is visual or end-to-end.`;
  }

  if (id === "stack-prisma") {
    return `- Treat schema changes as migrations with compatibility implications.
- Prefer existing Prisma client access patterns.
- Use transactions for multi-step writes that must be atomic.
- Consider generated client updates, seed data, and test fixtures.
- Never hide destructive migration risk.`;
  }

  if (id === "stack-react-native") {
    return `- Render strings only inside \`Text\`; never place raw text under \`View\`, \`Pressable\`, or other non-text primitives.
- Use a virtualized list for repeated content instead of mapping rows in a \`ScrollView\`; keep rows lightweight with stable, primitive props.
- Animate \`transform\` and \`opacity\` rather than layout properties, and keep gesture/animation work off the JS thread when the installed stack supports it.
- Keep native dependencies in the mobile app's own package.json at a single version; do not add a native module without an approved need.
- Verify platform behavior (safe areas, press states, navigation) on the target platforms; add component or end-to-end tests when behavior is visual or end-to-end.`;
  }

  if (id === "project-testing") {
    return `- If \`ARCHITECTURE.md\` exists at the project root, start there; it is the normative testing/architecture policy. Otherwise, check for another documented testing or architecture policy (e.g. a foundations doc under \`docs/\`) and treat it as normative over the generic defaults below.
- Discover current command names from package scripts, CI, or prior Orbit decisions, but do not weaken the required evidence because a command is not scaffolded yet. Report missing commands as a harness/scaffold gap.
- Use focused tests first for TDD red/green, then run the required closing suites for the touched surface.
- Record exact commands run and outcomes. If a required suite cannot run yet, record why and whether this is WARN or FAIL.

## Surface Matrix

| Surface touched | Required evidence |
|---|---|
| Domain / core business logic | Unit tests for invariants, policies, errors, use cases, and public behavior. |
| API endpoint | Unit, contract, and integration tests; include auth default-deny, policy, tenancy, safe response mapping, and 401/403/404 negatives when applicable. |
| Worker / background job | Unit, contract, and integration tests; cover envelope validation, idempotency, retry/dead-letter handling, rereading authoritative state, and tenant isolation. |
| UI / frontend | Component or unit tests for render/loading/error and role visibility; add contract tests when consuming shared contracts. Use end-to-end tests only for critical complete flows once they exist. |
| Database / persistence / migration | Integration tests plus schema/migration validation; prove migration history is reproducible from scratch, access-control rules enforced by the database, rollback safety, and audit/outbox correctness as applicable. Do not use mocks in place of real database-enforced security checks. |
| Architecture / module boundaries | Architecture/dependency tests; prove forbidden imports, deep imports, cycles, and cross-module access stay blocked. |
| Generated client / shared contracts | Contract tests; prove no drift between the schema definition, the generated client, and consumers. |
| Cross-cutting repo change | Add lint, typecheck, build, and the affected tests. |

## Evidence Rules

- A change can touch multiple surfaces; require the union of their suites.
- TDD red/green is necessary for functional work, but it is not sufficient for closure when integration, contract, architecture, or database evidence is required.
- Do not substitute one suite for another: e2e does not replace unit/integration; unit tests do not replace database-security or migration tests; contract tests do not re-test business logic.
- Healthy duplication answers different questions at different layers. Flag redundant tests that repeat the same behavior without additional risk coverage.`;
  }

  if (id === "project-ui") {
    return `- Follow existing design system and component patterns.
- Preserve accessibility, keyboard behavior, responsive layout, and loading/error states.
- Avoid introducing one-off visual styles when shared primitives exist.
- Verify visually when the change affects layout or interaction.`;
  }

  return `- Follow this skill's summary and use cases.
- Keep context compact.
- Prefer existing project patterns.
- Report evidence and risks clearly.
- Platform adapter: ${platform}.`;
}
