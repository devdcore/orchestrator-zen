# Orbit Harness Agents V1 Plan

## Summary

Orbit is a CLI/scaffolder for an agent harness, not a closed plugin. It is installed once as a tool
and activated per project with `orbit init`.

The goal is to create a full SDD workflow with agents, OpenSpec, TDD, review, Git, and selective
skills without loading unnecessary context.

Orbit is the **orchestration layer**. OpenSpec (`@fission-ai/openspec`) is the **SDD engine**.
Orbit installs OpenSpec as a project dependency and configures it; it does not duplicate its work.

## Installation And Invocation

`orbit init` installs the local harness layer in the target project:

```text
AGENTS.md
orbit.config.yaml
openspec/                   ← created by openspec init (not by Orbit directly)
  config.yaml               ← TDD rules injected by Orbit
  specs/
  changes/
docs/orbit/roadmap.md
docs/orbit/decisions.md
docs/orbit/handoff.md
docs/orbit/skills/index.md
.codex/
.claude/
.cursor/
.opencode/
.orbit/
```

`orbit init` also:
- Writes `CLAUDE.md` (= `@AGENTS.md`) so Claude Code reads the same instructions
- Runs `npm install --save-dev @fission-ai/openspec@latest`
- Runs `npx openspec init --tools <tools> --force`
- Injects TDD context and rules into `openspec/config.yaml`
- Uses the OpenSpec default profile only (the expanded profile is non-portable / machine-global)

Orbit invocation:

```text
sdd-orchestrator
```

If invoked without a requirement, the agent enters Orbit SDD Orchestrator mode and asks for the
requirement.

Direct skill invocation remains available without forcing the full Orbit flow:

```text
/stack-nestjs refactor this controller
```

## Agents And Flow

Orbit defines six portable roles. The five delegated roles are emitted as **real subagents** with
isolated context windows on agent-capable platforms (Claude → `.claude/agents/`, Cursor →
`.cursor/agents/`, OpenCode → `.opencode/agents/`, Codex → `.codex/agents/` TOML files). The
orchestrator always stays in the main conversation — subagents cannot spawn subagents, and the
orchestrator owns the human gates.

| Role | Delegation | Context / tools | Responsibility |
| --- | --- | --- | --- |
| `sdd-orchestrator` | skill (main thread) | full | Entrypoint: classifies work, governs flow, applies gates, delegates, closes. |
| `orbit-pm-spec` | subagent | read-only, **strong** | Converts vague ideas into user stories, goals/non-goals, scope, risks, and acceptance criteria (write-spec structure). Priority-#1 quality → strongest model. |
| `orbit-scout` | subagent | read-only, **fast** | Investigates context without implementing; returns a compact handoff. |
| `orbit-builder` | subagent | full tools, **inherit** | Implements under `/opsx:apply` with strict TDD (red-green-refactor); audited downstream by QA + review. |
| `orbit-qa-verifier` | subagent | read + bash, **strong** | Verifies acceptance criteria with tests and evidence. |
| `orbit-reviewer` | subagent | read + bash, fresh context, **strong** | Fresh-context review; confirms requirement is actually satisfied. |

Isolating these roles as subagents keeps file reads, test output, and diffs out of the main
conversation, which is what makes the "fresh-context" review and the token savings real rather than
aspirational.

## Full SDD Flow

```text
idea/requirement
  → sdd-orchestrator
  → orbit-pm-spec (if vague)
  → /opsx:explore (optional)
  → /opsx:propose
  → [HUMAN GATE — artifact review]
  → orbit-builder (subagent) runs /opsx:apply with red-green-refactor
  → orbit-qa-verifier (+ npx openspec validate)
  → [HUMAN GATE — verification review]
  → orbit-reviewer (adversarial; fan-out for high-risk)
  → /opsx:sync + /opsx:archive
  → summary + suggested commit message
```

### OpenSpec Command Reference (default profile)

Colon on Claude Code (`/opsx:propose`), hyphen elsewhere (`/opsx-propose`).

| Phase | Command |
|-------|---------|
| Explore (if approach uncertain) | `/opsx:explore <topic>` |
| Propose | `/opsx:propose <name>` |
| Implement | `/opsx:apply <name>` |
| Structural validation | `npx openspec validate <name>` |
| Merge delta specs | `/opsx:sync <name>` |
| Archive | `/opsx:archive <name>` |

## Skills

Orbit skills and roles:

```text
sdd-orchestrator        (skill, main thread)
orbit-pm-spec           (subagent / skill fallback)
orbit-scout             (subagent / skill fallback)
orbit-builder           (subagent / skill fallback; TDD baked in)
orbit-qa-verifier       (subagent / skill fallback)
orbit-reviewer          (subagent / skill fallback)
```

The previous standalone workflow skills were consolidated to reduce skill count and duplication:

- `orbit-strict-tdd` → merged into `orbit-builder` (and still enforced via `openspec/config.yaml`).
- `orbit-git-context`, `orbit-skill-routing` → folded into `AGENTS.md`.
- `orbit-handoff`, `orbit-decision-log` → folded into `AGENTS.md` (the `handoff.md` / `decisions.md`
  templates remain).
- `orbit-openspec-sdd-flow` → removed as redundant. Its command table, colon/hyphen syntax, and
  artifact/gates description already live in `AGENTS.md` and the `sdd-orchestrator` body, and
  OpenSpec ships its own `opsx:*` skills. Kept in `LEGACY_SKILL_IDS` so re-running `orbit init`
  prunes it from older installations.

Project skills (stack-detected):

```text
stack-nestjs    ← installed only if @nestjs/core | @nestjs/common is in package.json
stack-nextjs    ← installed only if next is in package.json
stack-prisma    ← installed only if @prisma/client | prisma is in package.json
stack-react-native ← installed only if expo | react-native is in package.json
project-testing ← always (generic)
project-ui      ← always (generic)
```

The `stack-*` skills are installed only when their dependency is detected in the target project's
`package.json`, so a portable harness does not litter non-matching projects (e.g. a Go or Python
repo) with framework skills. In a greenfield project (no `package.json` yet) no `stack-*` skill is
installed; `orbit init` prints a hint to re-run once the stack solidifies. The generic
`project-testing` / `project-ui` skills are always installed.

`docs/orbit/skills/index.md` is discovery metadata only. The orchestrator loads IDs, summaries,
use cases, paths, invocations, and optional path globs. It opens full `SKILL.md` files only when
they are selected for the current task.

OpenSpec installs its own `/opsx:` skills into the same platform directories. They coexist without
conflict (Orbit skills are `orbit-*` / `stack-*`; OpenSpec skills are `opsx:*`).

## TDD Integration

TDD is enforced at two levels:

1. **`openspec/config.yaml`**: Orbit injects `context` and `rules` that require red-green-refactor
   and a failing-test sub-task before every functional task in `tasks.md`. This is applied by
   OpenSpec's own artifact generation and `/opsx:apply`.
2. **`orbit-builder`** (delegated subagent): red-green-refactor is part of the builder's own
   instructions. The orchestrator holds the builder accountable if the config-level rules are bypassed.

## Memory, Git, And Models

Memory V1 is intentionally minimal:

```text
docs/orbit/roadmap.md     ← always loaded: project profile (## Project) + module/phase status
docs/orbit/decisions.md   ← on demand: append-only *why* log (rationale, rejected alternatives)
docs/orbit/handoff.md     ← on resume: transient state of a dirty stop
```

`roadmap.md` is the always-loaded project layer. Its `## Project` section holds the stable
stack/architecture profile (cheap to load every session), and its `Modules` table plus `Now`/`Next`
pointers hold status (`backlog`/`planned`/`in-progress`/`done`), referencing OpenSpec change names
without duplicating spec detail. The `Now` pointer is the single source of truth for the active
change and branch. The orchestrator writes the profile + rows at kickoff and updates status at
start and close, so a fresh session regains profile + "done / active / next" cheaply.

`decisions.md` is kept separate and on-demand precisely because it grows over time; it must never
become a per-session token cost. `handoff.md` holds only the transient next-step/blockers of a
dirty stop — the active change/branch live in the roadmap `Now` pointer, not here. No SQLite,
embeddings, or large local memory exists in V1.

Git is factual memory:

- Check `git status --short` whenever Git is available.
- Use `git diff`, `git log`, and file history selectively.
- Before closure, inspect final diff, tests, summary, and suggested commit message.

Model tiers are configured per role in `orbit.config.yaml` (`models.agents.<role>.tier`): `strong`
for the quality-critical roles (`orbit-pm-spec`, `orbit-qa-verifier`, `orbit-reviewer`), `fast` for
`orbit-scout`, and `inherit` for `orbit-builder`. **Tiers take effect on Claude, Cursor, and Codex** —
the platforms with a per-role model field — via the editable per-platform map
`models.tiers.<platform>` (defaults: `strong` → Opus / `gpt-5.5`, `fast` → Haiku / `gpt-5.4-mini`),
with an optional per-agent override `models.agents.<role>.model.<platform>`. Edit the map and re-run
`orbit init --force` to apply; your edits are preserved. Codex additionally supports a per-role
`models.agents.<role>.reasoning_effort.codex` value, rendered as `model_reasoning_effort` in the
agent TOML; omitted values inherit the parent session. On OpenCode the roles run in the session's
model (see HARNESS_DESIGN.md → *Subagents And Context Isolation*). The `sdd-orchestrator` is a
main-thread skill, so it always runs in the session's model.

## Quality And Security

- TDD by default for functional changes (enforced via openspec/config.yaml + the orbit-builder role).
- OpenSpec for large, ambiguous, architectural, risky, or product-facing changes.
- Two human gates: before apply and before archive.
- Fresh-context review before closing non-trivial changes.
- No automatic PR in V1.
- No automatic commit by default.
- No loading every memory or skill body by default.

## Assumptions

- Name: Orbit.
- Project command: `orbit init`.
- Orchestrator invocation: `sdd-orchestrator`.
- V1 is a CLI/scaffolder, not a platform-specific plugin.
- Skills live in platform-native folders.
- OpenSpec is a managed project dependency (`@fission-ai/openspec`), not a peer tool.
- Supported platforms: codex, claude, cursor, opencode.
- Long-term memory remains out of V1 until real pain proves it is needed.
