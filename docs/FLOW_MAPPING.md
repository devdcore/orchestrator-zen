# Orbit ↔ OpenSpec Flow Mapping

This document is the authoritative reference for how the Orbit orchestration layer maps to
OpenSpec (`@fission-ai/openspec`) commands and artifacts. Use it when improving the harness,
debugging agent behavior, or deciding where a new concern belongs (Orbit vs OpenSpec).

---

## Core Principle

Orbit is the **orchestration layer** (architect, classifier, gate keeper, quality enforcer).
OpenSpec is the **SDD engine** (artifacts, implementation, verification, archiving).

Neither duplicates the other. When something feels missing, check here first before adding it
to the wrong layer.

## Delegation Model

The orchestrator does not perform the context-heavy steps itself. It **delegates** to the Orbit
roles, which run as real subagents (isolated context windows) on Claude, Cursor, OpenCode, and Codex
(Codex via TOML agent files, spawned on explicit request). The orchestrator consumes only each role's
returned summary, keeping file reads,
test output, and diffs out of the main conversation. Because subagents cannot spawn subagents, the
orchestrator stays in the main thread and owns the human gates.

---

## Step-by-Step Flow Mapping

Each row shows: the step in the Orbit flow, who owns it, the concrete command or skill involved,
and what the agent actually does.

| # | Step | Owner | Command / Skill | What happens |
|---|------|-------|----------------|--------------|
| 1 | Receive requirement | Orbit | `sdd-orchestrator` | Architect receives the requirement, reads `AGENTS.md`, `orbit.config.yaml`, skill index, `docs/orbit/roadmap.md` (project profile + status), and Git status |
| 2 | Classify | Orbit | `sdd-orchestrator` | Classifies as: **direct small task**, **context-heavy task**, or **OpenSpec SDD task**. For an SDD task, marks the target module/phase `in-progress` in `roadmap.md` and sets the `Now` pointer to the active change + branch. Reads `docs/orbit/decisions.md` only if the rationale behind a past decision is needed |
| 3 | PM Spec *(if vague)* | Orbit | `orbit-pm-spec` | Produces user story, acceptance criteria, scope, risks, and open questions |
| 4 | Scout *(if context-heavy)* | Orbit | `orbit-scout` | Investigates repo, stack, conventions, risks — no edits, compact handoff |
| 5 | Explore *(optional)* | OpenSpec | `/opsx:explore <topic>` | AI investigates and compares approaches before committing to a change |
| 6 | Propose | OpenSpec | `/opsx:propose <name>` | Creates `openspec/changes/<name>/` with `proposal.md`, `specs/`, `design.md`, `tasks.md` in one step |
| 7 | **HUMAN GATE — artifact review** | Orbit | `sdd-orchestrator` gate | Orchestrator presents `proposal.md`, `specs/`, `design.md`, `tasks.md` to the user. **Does not proceed until explicit approval.** |
| 8 | Apply with TDD | OpenSpec + Orbit | `orbit-builder` (subagent) running `/opsx:apply` | Orchestrator delegates to the `orbit-builder` subagent, which works through `tasks.md` checkboxes and enforces red-green-refactor per task (tracer bullets, behavior-not-implementation; TDD merged into the builder + pre-injected into `openspec/config.yaml`). Implementation context stays in the subagent; only a summary returns |
| 9 | QA — verify it works | Orbit | `orbit-qa-verifier` + `npx openspec validate` | Checks completeness (all tasks done & implemented), correctness vs spec deltas, and every acceptance criterion from `orbit-pm-spec`, with test evidence. Reports PASS / WARN / FAIL. Owns the artifact-coherence check (Orbit does **not** use `/opsx:verify` — expanded-only, machine-global) |
| 10 | **HUMAN GATE — verification review** | Orbit | `sdd-orchestrator` gate | Presents QA PASS/WARN/FAIL evidence. **Does not archive until explicit approval.** |
| 11 | Reviewer | Orbit | `orbit-reviewer` | Fresh-context adversarial diff review (bugs, regressions, test quality, security, scope drift) with confidence scoring ≥80 + false-positive filter. For high-risk changes the orchestrator escalates to a 2-3 lens parallel fan-out |
| 12 | Sync specs | OpenSpec | `/opsx:sync <name>` | Merges delta specs (`ADDED`/`MODIFIED`/`REMOVED`) from `openspec/changes/<name>/specs/` into `openspec/specs/` |
| 13 | Archive | OpenSpec | `/opsx:archive <name>` | Moves `openspec/changes/<name>/` to `openspec/changes/archive/` |
| 14 | Close | Orbit | `sdd-orchestrator` | Records durable *why* in `docs/orbit/decisions.md`, marks the module/phase `done` in `docs/orbit/roadmap.md` (linking the archived change), resets `Now` and advances `Next`, suggests commit message, clears handoff |

---

## Orbit vs OpenSpec: Responsibility Matrix

| Concern | Orbit | OpenSpec |
|---------|:-----:|:--------:|
| Classify requirement | ✓ | |
| Human gates | ✓ | |
| Skill routing | ✓ | |
| PM spec / user story / acceptance criteria | ✓ | |
| Repo investigation (no edits) | ✓ | |
| Explore ideas | | ✓ |
| Create change + all planning artifacts | | ✓ |
| TDD rules injected into artifacts | ✓ (via config.yaml) | ✓ (applies them) |
| TDD enforcement during implementation | ✓ (orbit-builder, TDD baked in) | ✓ (tasks.md checkboxes) |
| Implement tasks | orchestrates | ✓ |
| Structural validation (specs/changes well-formed) | | ✓ (`openspec validate`) |
| Verify artifacts (completeness/correctness/coherence) | ✓ (`orbit-qa-verifier`) | |
| Verify acceptance criteria | ✓ (`orbit-qa-verifier`) | |
| Fresh-context diff review | ✓ (`orbit-reviewer`) | |
| Requirement satisfaction check | ✓ | |
| Sync delta specs to main | | ✓ |
| Archive change | | ✓ |
| Git context | ✓ | |
| Record durable decisions | ✓ | |
| Project roadmap (module/phase status) | ✓ | |
| Suggest commit message | ✓ | |

---

## OpenSpec Artifacts Per Change

Every change in `openspec/changes/<name>/` contains:

```
openspec/changes/<name>/
  .openspec.yaml    — change metadata (schema, created date)
  proposal.md       — intent, scope, approach, risks
  specs/            — delta specs (ADDED / MODIFIED / REMOVED requirements, Given/When/Then)
  design.md         — technical approach, sequence diagrams, Testing Strategy (TDD-injected)
  tasks.md          — implementation checklist with TDD sub-tasks (T.0 failing test first)
```

After `/opsx:archive`, the folder moves to:

```
openspec/changes/archive/YYYY-MM-DD-<name>/
```

Main specs are updated at:

```
openspec/specs/<domain>/spec.md
```

---

## OpenSpec Commands Quick Reference (Default Profile)

Orbit uses **only** the OpenSpec default-profile commands — they need no machine-global setup and
are portable across tools. The expanded-only commands (`verify`, `new`, `continue`, `ff`,
`bulk-archive`, `onboard`) are intentionally **not** used (see *Why no expanded profile* below).

Syntax: Claude Code uses a colon (`/opsx:propose`); Cursor, Windsurf, OpenCode, and Codex use a
hyphen (`/opsx-propose`).

| Command | Phase | Description |
|---------|-------|-------------|
| `/opsx:explore <topic>` | Pre-planning | Investigate ideas, compare approaches (only if the approach is uncertain). No artifacts created. |
| `/opsx:propose <name>` | Planning | Create change + all planning artifacts in one step |
| `/opsx:apply <name>` | Implementation | Work through `tasks.md`, check off completed items |
| `npx openspec validate <name>` | Verification | Structural validation that specs/changes are well-formed (CLI, always available) |
| `/opsx:sync <name>` | Closing | Merge delta specs into main `openspec/specs/` |
| `/opsx:archive <name>` | Closing | Move change to archive |

> Verification of *implementation vs artifacts and acceptance criteria* is owned by the
> `orbit-qa-verifier` role, not by `/opsx:verify`.

---

## TDD Injection Points

TDD is enforced at two layers so it cannot be bypassed:

**Layer 1 — `openspec/config.yaml`** (injected by `orbit init`):
```yaml
context: |
  This project uses TDD (red-green-refactor) for all functional changes.
  Write a failing test before writing production code.
  ...

rules:
  tasks:
    - Every task that changes functional behavior must include a test sub-task listed first.
    - Format: "T.0 Write failing test for <behavior>" before any implementation sub-task.
  design:
    - Include a Testing Strategy section.
  proposal:
    - Include a Risk section.
```
This context is automatically prepended to every artifact generated by OpenSpec. The `tasks.md`
produced by `/opsx:propose` will already contain `T.0` failing-test sub-tasks.

**Layer 2 — `orbit-builder`** (delegated subagent): the red-green-refactor cycle is part of the
builder's own instructions, so it applies the failing-test-first discipline during `/opsx:apply`.
The orchestrator holds the builder accountable to the config-injected rules step by step.

---

## Flow Shortcut: Direct Task (No OpenSpec)

For small, well-scoped, low-risk tasks the orchestrator skips OpenSpec entirely:

```
idea/requirement
  → sdd-orchestrator (classifies as direct)
  → relevant project skill (stack-nestjs, stack-nextjs, etc.)
  → orbit-builder (red-green-refactor, if functional change)
  → orbit-reviewer (optional, for non-trivial direct changes)
  → summary + suggested commit message
```

---

## Known Constraints and Open Questions

Track findings here as the harness is tested in real projects.

### Why No Expanded Profile (resolved)

Earlier versions tried to enable OpenSpec's expanded profile (for `/opsx:verify`, `/opsx:new`,
`/opsx:ff`, etc.) via `npx openspec update --profile custom`. Verified against the OpenSpec CLI,
this is **not possible non-interactively or portably**:

- `openspec update` has no `--profile` flag (only `--force`) — the old call always failed.
- The active workflow set lives in OpenSpec's **global, machine-level** config (`config` only
  supports `--scope global`). It is not project-local and is not committed.
- There is no non-interactive way to add the extra workflows: `config set` cannot write the
  `workflows` array, and the only `config profile` preset is `core`.

Depending on a machine-global, non-portable, undocumented setting would break Orbit's portability
promise. **Resolution**: Orbit uses only the default-profile commands
(`propose/explore/apply/sync/archive`) plus `npx openspec validate`. Implementation/acceptance
verification is owned by `orbit-qa-verifier`. `enableExpandedProfile` was removed from `init.js`.

### `openspec init` in Projects Without `package.json`

`orbit init` creates a minimal `package.json` if one is not present. This is intentional but
should be documented to the user — a blank `package.json` may surprise teams that use another
package manager or monorepo setup.

**To investigate**: add detection for `pnpm-workspace.yaml`, `bun.lockb`, `yarn.lock` and use the
appropriate package manager for the OpenSpec install step.

### Verification ownership (resolved)

Because `/opsx:verify` is not used (see *Why No Expanded Profile*), `orbit-qa-verifier` owns the
full verification: completeness, correctness vs spec deltas, and acceptance criteria with test
evidence, plus `npx openspec validate` for structural checks. `orbit-reviewer` is the separate
adversarial pass (bugs/regressions/security). The two are kept distinct on purpose: constructive
"does it work?" vs adversarial "what's broken?".

---

## Iteration Log

Use this section to record findings, fixes, and improvements discovered during real use.
Add entries in reverse chronological order.

### 2026-06-13 — Review round 1 (see `docs/ORBIT_REVIEW.md`)

- **What was tested**: design review of the harness + empirical verification of the OpenSpec CLI and Claude Code memory docs.
- **Findings & fixes**:
  - `/opsx:verify` never installed → root cause: `openspec update --profile custom` is an invalid command and the expanded profile is machine-global. **Fixed**: removed expanded-profile dependency; `orbit-qa-verifier` + `openspec validate` own verification.
  - `orbit init` never wrote `CLAUDE.md` (Claude reads `CLAUDE.md`, not `AGENTS.md`). **Fixed**: writes `CLAUDE.md` = `@AGENTS.md`.
  - TDD config injection could duplicate `context:`/`rules:` keys. **Fixed**: guarded against duplicate active keys.
  - `orbit-reviewer` had undefined "modo juicio" jargon. **Fixed**.
  - `orbit-pm-spec` ran on the weakest model despite owning priority-#1 work. **Fixed**: tier `fast` → `inherit`.
  - Roles reinforced: pm-spec (write-spec structure), builder (tdd tracer-bullets), reviewer (confidence scoring + false-positive list + conditional fan-out), qa-verifier (absorbs artifact coherence).
  - Colon-vs-hyphen `/opsx` syntax note added for non-Claude tools.
- **Status**: fixed (round 1). Pending: thin out `orbit-openspec-sdd-flow` and always-on `stack-*` skills.

### 2026-06-14 — Review round 2 (thinning)

- **What was tested**: skill inventory vs. duplication and portability, following round-1 pending items.
- **Findings & fixes**:
  - `orbit-openspec-sdd-flow` skill was a redundant bridge: its command table, colon/hyphen syntax,
    artifact schema, and gates already live in `AGENTS.md` + the `sdd-orchestrator` body, and
    OpenSpec ships its own `opsx:*` skills. **Fixed**: removed from `ORBIT_SKILLS`, added to
    `LEGACY_SKILL_IDS` so re-running `orbit init` prunes it. Verified the `/opsx:` reference still
    lives in `AGENTS.md` (the file the orchestrator loads via `CLAUDE.md → @AGENTS.md`) before
    deleting the on-demand copy.
  - `stack-*` skills installed unconditionally, littering non-Node/non-matching projects. **Fixed**:
    dependency detection from `package.json` (`selectProjectSkills` / `STACK_DETECTION`). Greenfield
    (no `package.json`) installs none + prints a hint; generic `project-testing` / `project-ui`
    always install. Detection runs before the OpenSpec step so it reads the real `package.json`. The
    skill index lists only installed skills.
  - Decided NOT to add a dedicated `orbit-tdd` skill: it was already consolidated into `orbit-builder`
    + `openspec/config.yaml` injection in round 1; re-adding it would reverse the thinning.
  - Fixed stale `orbit-qa-verifier` summary ("OpenSpec verify" → "structural validation (openspec validate)").
- **Tests**: added greenfield (no stack skills + hint) and selective-detection cases; updated the
  main test to provide a `package.json` and to assert `orbit-openspec-sdd-flow` is gone and the
  `/opsx:` reference is in `AGENTS.md`. All 8 tests pass.
- **Status**: fixed (round 2).

### 2026-06-14 — Review round 3: modelos fuertes + orquestador afilado

- **Modelos `orbit-pm-spec`, `orbit-qa-verifier` y `orbit-reviewer` subidos a `strong` (= opus)**.
  Rationale: pm-spec entiende el requerimiento (prioridad #1; un malentendido envenena todo aguas
  abajo); qa-verifier y reviewer cazan criterios perdidos y bugs antes de producción. Es donde la
  fuerza de modelo es más barata de gastar. Verificado: Claude emite `model: opus`; OpenCode no tiene
  selector de modelo por agente en su frontmatter (por diseño de plataforma).
- **`orbit-builder` se mantiene en `inherit`** a propósito: su trabajo está acotado (specs/tasks ya
  aprobados en el gate 1, reglas TDD inyectadas) y **doblemente auditado aguas abajo** por qa-verifier
  y reviewer, ambos `strong`. `orbit-scout` se mantiene en `fast` (recon mecánico).
- **`sdd-orchestrator` afilado**:
  1. Apertura: "senior technical architect" (puffery genérico) → postura conductual concreta.
  2. Clasificación: palabras-tamaño ("small", "large") → triggers concretos: Direct / Scout first /
     Full SDD, con señales objetivas (toca auth/payments/migration/API contract, área desconocida).
  3. Quality Rules: quitada la redundante "no silently broaden scope"; añadidas "gates are not
     formalities" y "challenge scope expansions".
- **Tests**: 8/8 pasan sin cambios (el bloque del orquestador no rompió aserciones existentes).
- **Status**: fixed (round 3).

### 2026-06-14 — Review round 3b: límite de tiers (Claude-only) + sync de config

- **Aclarado el alcance real de los tiers de modelo.** Los tiers solo surten efecto en **subagentes de
  Claude** (`agentTemplate` escribe `model: <claudeModelFor(tier)>`). En **OpenCode** Orbit no emite
  línea `model` por agente; en **Codex/Cursor** los roles son skills inline → corren en el modelo de
  la sesión. Conclusión de diseño: **no perseguir detección de proveedor en OpenCode** (el modelo es
  cambiable en runtime, la config suele ser global/no-portable, y mapear `strong→modelo` por proveedor
  exige una tabla que envejece). El tier queda como optimización de Claude, documentada como límite.
- **Quitada metadata muerta** `model: inherit` del frontmatter de las skills (`skillTemplate`): ni
  Codex ni Cursor la usan; implicaba falsamente que respetan un modelo por rol.
- **Bug corregido — config desincronizada**: `orbit.config.yaml` declaraba `pm-spec`/`qa-verifier`/
  `reviewer` en `inherit` mientras `skills.js` (fuente real de la generación de subagentes) ya los
  tenía en `strong`. Sincronizada la plantilla + añadido el comentario del límite Claude-only.
- **Documentado** el límite en `AGENTS.md` (sección Delegation And Subagents) y en `orbit.config.yaml`.
- **Tests**: 8/8 pasan. Verificado por smoke: skill de Codex sin `model:`; agente Claude pm-spec con
  `model: opus`.
- **Status**: fixed (round 3b).

### 2026-06-14 — Cursor pasa a subagentes reales + mapa de modelos configurable en proyecto

- **Supera el límite "tiers solo en Claude" de la ronda 3b.** Cursor soporta subagentes basados en
  archivo en `.cursor/agents/` (aislamiento de contexto, paralelo/background, invocación `/name`,
  frontmatter `name`/`description`/`model`/`readonly`), y además lee `.claude/agents/` y
  `.codex/agents/` por compatibilidad. Verificado en la doc oficial (`cursor.com/docs/subagents`).
- **Cursor añadido a `PLATFORM_AGENT_DIRS`** → los cinco roles delegados se emiten como subagentes
  reales en Cursor; las copias inline en `.cursor/skills/orbit-*` se podan automáticamente (la lógica
  de prune existente ya cubre el dedup al volverse Cursor agent-capable).
- **Modelos ahora configurables en el proyecto.** Nuevo `src/lib/models.js`: mapa `tier→modelo` por
  plataforma (`models.tiers.<platform>`) + override por agente (`models.agents.<role>.model.<platform>`),
  con parser propio del bloque `models:` (sigue zero-dependency). `init` lee el `orbit.config.yaml`
  existente, lo mergea sobre los defaults y lo usa para escribir el `model:` de cada subagente; con
  `--force` regenera y **preserva** las ediciones del usuario. Default: `strong` → Opus
  (`opus`/`claude-opus-4-8`), `fast` → Haiku (`haiku`/`claude-4-5-haiku`).
- **`readonly` de Cursor**: `READ_ONLY` → `readonly: true`; `READ_PLUS_BASH` (qa/reviewer, corren
  tests) → no readonly, porque Cursor no tiene combo edit-deny/bash-allow. Documentado el matiz.
- **Borrada `claudeModelFor`** (reemplazada por `resolveAgentModelId`).
- **Tests**: 9/9 pasan (nuevo test: editar el mapa + `init --force` aplica el tier y respeta el
  override por agente, sin pisar las ediciones). Docs (PLAN/DESIGN/FLOW) actualizadas.
- **Status**: fixed.

### 2026-06-14 — Codex pasa a subagentes reales (TOML)

- **Verificado en la doc oficial de Codex** (`developers.openai.com/codex/subagents`): Codex soporta
  subagentes custom como **archivos TOML** en `.codex/agents/` (proyecto) o `~/.codex/agents/`.
  Campos: `name`/`description`/`developer_instructions` (obligatorios) + `model`,
  `model_reasoning_effort`, `sandbox_mode` opcionales. Codex **solo los lanza si se lo pides
  explícitamente** (no auto-delega).
- **Codex añadido a `PLATFORM_AGENT_DIRS`** + nuevo `PLATFORM_AGENT_EXT` (md para
  Claude/Cursor/OpenCode, **toml** para Codex). `locationFor` usa la extensión por plataforma. Los
  cinco roles se emiten como `.codex/agents/<rol>.toml`; las skills inline `.codex/skills/orbit-*` se
  podan (dedup automático). `sdd-orchestrator` + skills de proyecto siguen como skills.
- **Render TOML** (`codexAgentTemplate`): instrucciones en string literal multilínea `'''...'''`
  (sin escapes), `name`/`description` como basic strings escapados. `sandbox_mode = "read-only"` para
  roles de solo-lectura; omitido (hereda sesión) en qa/reviewer/builder (Codex no tiene combo
  edit-deny/bash-allow, igual que Cursor).
- **Modelos Codex** en el mapa de tiers: `strong → gpt-5.5`, `fast → gpt-5.4-mini` (guía oficial).
  `model = inherit` se omite. Configurable por proyecto + override por agente, igual que el resto.
- **`refresh-skills`** ahora lee agentes `.toml` (parser TOML mínimo para name/description).
- **Tests**: 9/9 (añadidas aserciones de TOML/modelo/sandbox/prune de Codex + edición de su tier en
  el test de configurabilidad). Docs (PLAN/DESIGN/FLOW) actualizadas: las cuatro plataformas tienen
  subagentes reales; ya no hay fallback inline para los roles.
- **Status**: fixed.

### YYYY-MM-DD — Template

- **What was tested**: describe the scenario or project.
- **Finding**: what went wrong or felt off.
- **Root cause**: if known.
- **Fix applied**: PR/commit reference or description.
- **Status**: open / fixed / wont-fix.
