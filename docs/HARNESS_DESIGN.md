# Orbit Harness Design

## What Orbit Is

Orbit is a harness layer installed into a project. It gives agents a shared operating model:

- When to use OpenSpec and which `/opsx:` command to use.
- Which role should do what.
- Which skills are available.
- How to apply TDD (enforced via `openspec/config.yaml` and the `orbit-builder` role).
- How to use Git as factual history.
- How to close work without creating a PR or commit automatically.

Orbit is intentionally portable. It does not assume one agent platform owns the project.

## Orbit vs OpenSpec: Separation of Concerns

| Concern | Orbit | OpenSpec |
|---------|-------|---------|
| Classify requirement | ✓ | |
| Human gates | ✓ | |
| Skill routing | ✓ | |
| TDD enforcement | ✓ (config + skill) | ✓ (config injection) |
| PM spec / user story | ✓ | |
| Explore ideas | | ✓ (`/opsx:explore`) |
| Create change proposal, specs, design, tasks | | ✓ (`/opsx:propose`) |
| Implement tasks | orchestrates | ✓ (`/opsx:apply`) |
| Verify artifacts + acceptance criteria | ✓ (`orbit-qa-verifier` + `openspec validate`) | |
| Archive + sync specs | | ✓ (`/opsx:sync`, `/opsx:archive`) |
| Fresh-context diff review | ✓ (`orbit-reviewer`) | |
| Requirement satisfaction check | ✓ (`orbit-qa-verifier`) | |
| Git context | ✓ | |
| Suggest commit message | ✓ | |

For the step-by-step mapping of every flow step to its owner, command, and artifact, see
[FLOW_MAPPING.md](FLOW_MAPPING.md). That document is also where iteration findings and known
issues are tracked as the harness is tested in real projects.

## What `orbit init` Does

In a target project, `orbit init`:

1. Writes Orbit harness files:
   - `AGENTS.md`: startup map and orchestration rules for agents.
   - `CLAUDE.md`: a one-line `@AGENTS.md` import so Claude Code (which reads `CLAUDE.md`, not `AGENTS.md`) loads the same instructions from a single source of truth.
   - `orbit.config.yaml`: harness settings, OpenSpec config reference.
   - `docs/orbit/roadmap.md`: durable, lightweight map of modules and phases (project-level status).
   - `docs/orbit/decisions.md`: durable decisions only.
   - `docs/orbit/handoff.md`: active interrupted work only.
   - `docs/orbit/skills/index.md`: compact skill metadata (discovery only).
   - `.codex/skills/`, `.claude/skills/`, `.cursor/skills/`, `.opencode/skills/`: platform skill adapters.
     `stack-*` skills (`stack-nestjs`, `stack-nextjs`, `stack-prisma`) are written only when their
     dependency is detected in the project's `package.json`; the generic `project-testing` /
     `project-ui` skills are always written. In a greenfield project no `stack-*` skill is written
     and `orbit init` prints a hint to re-run once the stack is in place. The generated
     `docs/orbit/skills/index.md` lists only the skills actually installed.
   - `.claude/agents/`, `.cursor/agents/`, `.opencode/agents/`, `.codex/agents/`: real subagent
     definitions for the delegated roles (`orbit-pm-spec`, `orbit-scout`, `orbit-builder`,
     `orbit-qa-verifier`, `orbit-reviewer`). Claude/Cursor/OpenCode use markdown with YAML
     frontmatter; Codex uses standalone TOML files (`name`/`description`/`developer_instructions` +
     optional `model`/`sandbox_mode`). The inline role skills are pruned on every agent-capable
     platform so each role lives on a single path. Codex only spawns subagents on explicit request.
   - `.orbit/`: ignored cache and registry.

2. Installs OpenSpec:
   - `npm install --save-dev @fission-ai/openspec@latest`
   - `npx openspec init --tools <tools> --force` → creates `openspec/specs/`, `openspec/changes/`, `openspec/config.yaml`, and platform `/opsx:` skills.
   - Injects TDD `context` and `rules` into `openspec/config.yaml` (guarded against duplicate keys).
   - Uses the OpenSpec **default** profile only (`propose/explore/apply/sync/archive` + `openspec validate`). The expanded profile is deliberately not enabled — it is a non-portable, machine-global setting (see FLOW_MAPPING.md → *Why No Expanded Profile*).

The long Orbit plan and design docs stay in the Orbit source repository, not in every generated project.

## Skill Loading

Startup context should stay small. The orchestrator loads:

1. `AGENTS.md`.
2. `orbit.config.yaml`.
3. `docs/orbit/skills/index.md`.
4. `docs/orbit/roadmap.md` for both the project profile (`## Project`: stack/architecture) and status (modules, `Now`/`Next`).
5. `docs/orbit/decisions.md` only on demand, when a task needs the rationale behind a past decision (append-only *why* log, never loaded by default).
6. `docs/orbit/handoff.md` only when resuming a dirty stop (work paused mid-task).

The skill index contains metadata only (ID, type, delegation, summary, when to use, paths,
invocation hints, optional path globs). A full `SKILL.md` (or subagent file) is opened only after
routing selects it.

## Subagents And Context Isolation

The delegated roles run as real subagents on Claude, Cursor, OpenCode, and Codex, each in its own
context window. The orchestrator delegates the context-heavy steps (scouting, implementation, QA, review) and
consumes only the returned summary, so search results, test logs, and large diffs never accumulate
in the main conversation. This is the mechanism behind both the token savings and the genuinely
fresh-context review. Subagents cannot spawn other subagents, so the orchestrator itself is never a
subagent and remains responsible for the human gates and for asking the user questions.

Read-only roles (`orbit-scout`, `orbit-pm-spec`) and review/QA roles (`orbit-reviewer`,
`orbit-qa-verifier`) are restricted from editing files (Claude `tools` allowlist / Cursor `readonly`
/ Codex `sandbox_mode` / OpenCode `permission`); only `orbit-builder` has full write access. (Cursor
and Codex expose a single read-only switch rather than an edit-deny/bash-allow split, so the
test-running roles `orbit-qa-verifier` and `orbit-reviewer` are not marked read-only there and rely
on their role instructions plus the human gates to stay in scope.) Model tiers are configured per role in
`orbit.config.yaml`: `strong` for the quality-critical roles — `orbit-pm-spec` (requirement
understanding is priority #1; a misunderstood requirement poisons everything downstream),
`orbit-qa-verifier`, and `orbit-reviewer` (a missed criterion or bug ships to production); `fast`
for `orbit-scout` (mechanical recon); and `inherit` for `orbit-builder` (scoped work, audited
downstream by QA + review).

**Tiers take effect on Claude, Cursor, and Codex** — the platforms with a per-role model field
(markdown `model:` on Claude/Cursor, `model` in the Codex TOML). `agentTemplate` resolves the tier to
a concrete model via the per-platform map in `orbit.config.yaml` (`models.tiers.<platform>`), with an
optional per-agent, per-platform override (`models.agents.<role>.model.<platform>`) that beats the
tier map. That map is editable in the project: change it and re-run `orbit init --force`; the parser
preserves your edits and the missing keys self-heal from the defaults. The defaults: `strong` → Opus
(`opus` on Claude, `claude-opus-4-8` on Cursor) and `gpt-5.5` on Codex; `fast` → Haiku (`haiku` /
`claude-4-5-haiku`) and `gpt-5.4-mini` on Codex. On OpenCode, Orbit emits no per-role `model`, so the
tier is informational there and the quality lever is the session model plus the human gates. A blocked
or unavailable Cursor model falls back to a compatible one automatically. Per-provider model mapping
for OpenCode was deliberately not pursued: the active model is runtime-switchable, its config is often
machine-global (non-portable), and a tier→model table per provider would be perpetual maintenance.

## Project Roadmap

`docs/orbit/roadmap.md` is the always-loaded, project-level memory that spans modules and phases
across sessions. It is the single cheap file a new session reads to regain full context, and it
holds two things:

- **`## Project`** — the stable stack/architecture profile (frontend, backend, database, repo
  layout, key architecture). This is the foundational context wanted on every session, kept small
  and stable so it is cheap to always load. The *why* behind these choices lives in
  `decisions.md` (on demand), not here.
- **`Modules` table + `Now`/`Next`** — project status as an **index only**: one row per
  module/phase with a status (`backlog`, `planned`, `in-progress`, `done`), referencing the
  OpenSpec change name. The `Now` pointer is the single source of truth for the active change and
  branch. It never duplicates spec detail — that stays in `openspec/specs/`, `openspec/changes/`,
  and the code.

The orchestrator writes the profile and module rows at kickoff, flips a phase to `in-progress` and
sets `Now` when work starts, and marks `done` + resets `Now` at close. This keeps re-orientation
cheap: one compact file gives profile + done / active / next without scanning `openspec/changes/`,
the archive, or `git log`.

Memory split rationale:

- **roadmap.md** (always loaded): stable profile + status. Small by design.
- **decisions.md** (on demand): the append-only *why* log. May grow, so it is never a startup cost.
- **handoff.md** (on resume only): transient state of a dirty stop (next step + blockers not yet in
  code or `tasks.md`). The active change/branch are NOT here — they live in the roadmap `Now`
  pointer.

## TDD Enforcement

TDD is applied at two layers:

1. **`openspec/config.yaml`** (Orbit-injected): forces red-green-refactor context and a
   failing-test sub-task before every functional task in `tasks.md`. OpenSpec's artifact generation
   and `/opsx:apply` pick this up automatically.

2. **`orbit-builder`** (delegated subagent): red-green-refactor is part of the builder's own
   instructions, so it applies failing-test-first during `/opsx:apply`. The orchestrator holds it
   accountable if it deviates from the config-injected rules.

## OpenSpec Integration

OpenSpec handles: explore, propose, artifact creation, apply, verify, sync, archive.
Orbit handles: classification, PM spec, human gates, TDD enforcement, QA verification, review, close.

The orchestrator's two human gates are the key Orbit additions not present in OpenSpec:
- **Gate 1**: after artifacts are created, before `/opsx:apply`.
- **Gate 2**: after orbit-qa-verifier evidence (PASS/WARN/FAIL), before `/opsx:archive`.

## Git As Factual Memory

Git is used selectively:

- Always check current worktree status when available.
- Inspect diffs before editing or closing non-trivial changes.
- Inspect file history for regressions or risky existing areas.

Git is factual history, not a substitute for reading current code.

## V1 Boundaries

Orbit V1 deliberately excludes:

- Jira/Notion/Azure integrations.
- Semantic memory, embeddings, SQLite, or Engram.
- Automatic PRs.
- Automatic commits by default.
- Mandatory worktrees.
- Deep platform-specific plugin packaging.
- `devin` platform support (removed; not supported by OpenSpec).

This keeps the first version small enough to use and improve.
