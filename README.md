# Orbit Harness

Orbit is a portable agent harness scaffold for OpenSpec-driven SDD workflows.

It is not a closed plugin. It is a CLI that installs project-local instructions,
skills, and lightweight continuity files so Codex, Claude, Cursor, and OpenCode
can follow the same workflow — with OpenSpec (`@fission-ai/openspec`) as the
spec and artifact engine.

## How It Works

Orbit is the **orchestration layer**. OpenSpec is the **SDD engine**.

- `orbit init` scaffolds the Orbit harness and installs OpenSpec as a project dependency.
- The `sdd-orchestrator` skill acts as the senior technical architect, governing the full SDD flow,
  applying human gates, enforcing TDD, and delegating to specialized roles.
- The delegated roles (`orbit-pm-spec`, `orbit-scout`, `orbit-builder`, `orbit-qa-verifier`,
  `orbit-reviewer`) are installed as **real subagents** with isolated context windows on Claude,
  Cursor, OpenCode, and Codex. Claude/Cursor/OpenCode use markdown agent files; Codex uses TOML
  agent files, supports per-role Codex reasoning effort, and requires explicit spawning. This keeps file reads, test output, and diffs out of
  the main conversation — real token savings and a genuinely fresh-context review.
- OpenSpec handles spec artifacts and implementation phases via `/opsx:` slash commands.
- Orbit's `orbit-qa-verifier` role owns verification (completeness, correctness vs spec, acceptance
  criteria with test evidence, plus `openspec validate`), and `orbit-reviewer` does a separate
  adversarial diff review (bugs, regressions, security). Orbit does not use `/opsx:verify`.
- `docs/orbit/roadmap.md` is a lightweight, durable map of the project's modules and phases. The
  orchestrator reads it at startup to regain project context (done / active / next) cheaply, and
  updates statuses as work starts and closes — it references OpenSpec change names without
  duplicating spec detail.

## Commands

```bash
node ./bin/orbit.js init
node ./bin/orbit.js doctor
node ./bin/orbit.js refresh-skills
```

After publishing or linking the package:

```bash
orbit init
orbit doctor
orbit refresh-skills
```

## In A New Project

```bash
mkdir my-project
cd my-project
orbit init
```

`orbit init` will:
1. Scaffold Orbit harness files (`AGENTS.md`, `CLAUDE.md` → `@AGENTS.md`, `orbit.config.yaml`, skill files, etc.).
2. Install `@fission-ai/openspec` as a dev dependency.
3. Run `npx openspec init` (non-interactive) to scaffold the `openspec/` directory and tool skills.
4. Inject TDD rules into `openspec/config.yaml`.

`stack-*` skills (`stack-nestjs`, `stack-nextjs`, `stack-prisma`) install only when their dependency
is detected in `package.json`; `project-testing` / `project-ui` always install. A greenfield project
installs no `stack-*` skill and prints a hint to re-run `orbit init` once the stack is added.

Orbit uses the OpenSpec **default** profile only (`propose/explore/apply/sync/archive` +
`openspec validate`). The expanded-only commands (`verify`, `ff`, `new`, …) are not used because
they require a machine-global OpenSpec setting that is not portable; verification is owned by
`orbit-qa-verifier`. Commands use a colon on Claude Code (`/opsx:propose`) and a hyphen elsewhere
(`/opsx-propose`).

Then open your agent in that folder and invoke:

```text
sdd-orchestrator
```

The orchestrator will guide you through the full SDD flow. For direct work without the full
SDD flow, invoke a specific project skill:

```text
/stack-nestjs refactor this controller
```

or in tools that use `$` for skills:

```text
$stack-nestjs refactor this controller
```

## Supported Tools

`codex`, `claude`, `cursor`, `opencode`

## Full SDD Flow

```
idea/requirement
  → sdd-orchestrator (architect, classifier, gate keeper)
  → orbit-pm-spec (user story + acceptance criteria, if needed)
  → /opsx:explore (optional investigation)
  → /opsx:propose (proposal + specs + design + tasks)
  → [HUMAN GATE — artifact review]
  → orbit-builder subagent runs /opsx:apply with red-green-refactor TDD
  → orbit-qa-verifier (completeness + acceptance criteria + npx openspec validate)
  → [HUMAN GATE — verification review]
  → orbit-reviewer (fresh-context adversarial diff review)
  → /opsx:sync + /opsx:archive
  → summary + suggested commit message
```

## Documentation

- [Flow Mapping](docs/FLOW_MAPPING.md) — step-by-step Orbit ↔ OpenSpec mapping, responsibility matrix, iteration log
- [Orbit Plan](docs/ORBIT_PLAN.md) — full SDD flow, skills list, TDD integration, V1 assumptions
- [Harness Design](docs/HARNESS_DESIGN.md) — architecture, separation of concerns, `orbit init` breakdown
- [Implementation Notes](docs/IMPLEMENTATION_NOTES.md) — commands, design choices, known issues index
- [OpenSpec docs](https://github.com/Fission-AI/OpenSpec/tree/main/docs)
