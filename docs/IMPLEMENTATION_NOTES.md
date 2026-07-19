# Orbit Implementation Notes

## Implemented MVP

This repository contains a dependency-free Node 20 CLI with:

- `orbit init`
- `orbit doctor`
- `orbit refresh-skills`

The CLI itself has no runtime dependencies. The only external dependency it installs is
`@fission-ai/openspec` into the **target project**, not into Orbit itself.

## Commands

### `orbit init`

Scaffolds the Orbit harness layer in the current project or a target directory passed with `--cwd`.

Writes files only if they are absent unless `--force` is used.

Also:
- Writes `CLAUDE.md` (= `@AGENTS.md`) so Claude Code loads the same instructions.
- Installs `@fission-ai/openspec` as a dev dependency in the target project.
- Runs `npx openspec init --tools <tools> --force` to scaffold `openspec/` and platform `/opsx:` skills.
- Merges TDD rules into `openspec/config.yaml` idempotently, preserving existing `context:`/`rules:` keys.
- Uses the OpenSpec default profile only (does NOT enable the expanded profile — see below).

Pass `--skip-openspec` to bypass the OpenSpec installation step (used in tests and offline environments).

### `orbit doctor`

Checks whether expected Orbit files, OpenSpec files, platform skill directories, and Git are available.

Checks:
- `AGENTS.md`, `orbit.config.yaml`, skill index, roadmap, decisions, handoff.
- `openspec/config.yaml`, `openspec/specs/`, `openspec/changes/`.
- TDD rules in `openspec/config.yaml`.
- `@fission-ai/openspec` in `package.json`.
- OpenSpec CLI via `npx openspec --version` (local) or global fallback.
- Git repository, branch, and status.
- Platform skill directories.

### `orbit refresh-skills`

Scans platform-native skill folders and rebuilds:

- `docs/orbit/skills/index.md`
- `.orbit/skill-registry.json`

The generated index remains metadata-only.

## Design Choices

- `sdd-orchestrator` is a real skill name so tools like Claude expose `/sdd-orchestrator`.
- Orbit skills and project skills are installed into platform-native skill directories.
- OpenSpec is a **managed project dependency** (`@fission-ai/openspec`), not a peer tool.
  `orbit init` handles the full installation and configuration.
- TDD is enforced via `openspec/config.yaml` injection (context + rules), not by modifying OpenSpec itself.
- The OpenSpec expanded profile is intentionally NOT enabled: it is a machine-global, non-portable, non-scriptable setting (verified against the CLI). Orbit uses the default profile + `openspec validate`; verification is owned by `orbit-qa-verifier`. See FLOW_MAPPING.md → *Why No Expanded Profile*.
- `stack-*` skills are installed by dependency detection from `package.json` (`stack-nestjs` ←
  `@nestjs/*`, `stack-nextjs` ← `next`, `stack-prisma` ← `@prisma/client`/`prisma`,
  `stack-react-native` ← `expo`/`react-native`). Generic
  `project-testing` / `project-ui` are always installed. Greenfield projects (no `package.json`)
  install no `stack-*` skill and get a hint to re-run. Detection runs before the OpenSpec step, so
  it reads the user's real `package.json`, not the minimal one `ensurePackageJson` may create. The
  skill index lists only installed skills. See `selectProjectSkills` / `STACK_DETECTION` in
  `src/lib/skills.js`.
- `orbit-openspec-sdd-flow` skill was removed as redundant (its content lives in `AGENTS.md` and the
  `sdd-orchestrator` body; OpenSpec ships its own `opsx:*` skills). It is in `LEGACY_SKILL_IDS` so
  re-running `orbit init` prunes it from older installations.
- `devin` is not a supported platform (removed; not supported by OpenSpec).
- `--skip-openspec` flag allows network-free init for tests and CI.
- The generated project does not receive the full Orbit plan or harness design docs.
- `.orbit/` is added to `.gitignore` because it is cache/registry state.

## Supported Platforms

`codex`, `claude`, `cursor`, `opencode`

## OpenSpec Tool ID Mapping

| Orbit tool | OpenSpec tool ID |
|-----------|-----------------|
| `codex` | `codex` |
| `claude` | `claude` |
| `cursor` | `cursor` |
| `opencode` | `opencode` |

## Where To Look For What

| Question | Document |
|----------|----------|
| How does each flow step map to an `/opsx:` command? | [FLOW_MAPPING.md](FLOW_MAPPING.md) |
| What does Orbit own vs OpenSpec? | [FLOW_MAPPING.md — Responsibility Matrix](FLOW_MAPPING.md#orbit-vs-openspec-responsibility-matrix) |
| Known issues / iteration log | [FLOW_MAPPING.md — Iteration Log](FLOW_MAPPING.md#iteration-log) |
| Architecture decisions | [HARNESS_DESIGN.md](HARNESS_DESIGN.md) |
| How project status is tracked across sessions | [HARNESS_DESIGN.md — Project Roadmap](HARNESS_DESIGN.md#project-roadmap) |
| Full SDD flow and skills list | [ORBIT_PLAN.md](ORBIT_PLAN.md) |

## Next Improvements

- Add richer platform adapters once Cursor and OpenCode skill conventions are finalized locally.
- Add more project stack skills as real projects need them.
- Add a publishable package workflow.
- (Resolved) Expanded-profile setup is not pursued: it is machine-global and not scriptable. Orbit stays on the default profile.
