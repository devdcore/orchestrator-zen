import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { mergeOpenSpecTddConfig } from "../src/commands/init.js";

const execFileAsync = promisify(execFile);
const bin = resolve("bin/orbit.js");

// Pass --skip-openspec to orbit init to bypass npm install and openspec init during tests.
// This keeps tests fast, deterministic, and network-free while still verifying Orbit harness output.
const SKIP_OPENSPEC = "--skip-openspec";

describe("orbit cli", () => {
  it("initializes a new project with harness files and native skill folders", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orbit-test-"));

    try {
      // Provide a package.json with the stack deps so stack-* skills are detected and installed.
      await writeFile(
        join(dir, "package.json"),
        JSON.stringify({
          name: "t",
          dependencies: { "@nestjs/core": "^10", next: "^14", "@prisma/client": "^5" },
        }),
        "utf8",
      );

      await execFileAsync(process.execPath, [bin, "init", "--cwd", dir, SKIP_OPENSPEC]);

      const agents = await readFile(join(dir, "AGENTS.md"), "utf8");
      const claudeMd = await readFile(join(dir, "CLAUDE.md"), "utf8");
      const config = await readFile(join(dir, "orbit.config.yaml"), "utf8");
      const skillIndex = await readFile(join(dir, "docs/orbit/skills/index.md"), "utf8");
      const claudeSkill = await readFile(join(dir, ".claude/skills/sdd-orchestrator/SKILL.md"), "utf8");
      const codexSkill = await readFile(join(dir, ".codex/skills/stack-nestjs/SKILL.md"), "utf8");
      const gitignore = await readFile(join(dir, ".gitignore"), "utf8");

      // AGENTS.md
      assert.match(agents, /sdd-orchestrator/);
      assert.match(agents, /OpenSpec/);
      assert.match(agents, /\/opsx:/);

      // CLAUDE.md imports AGENTS.md so Claude Code reads the same instructions (single source)
      assert.match(claudeMd, /@AGENTS\.md/);

      // orbit.config.yaml
      assert.match(config, /load_strategy: selective/);
      assert.match(config, /profile: default/);
      assert.match(config, /@fission-ai\/openspec/);

      // No devin in config
      assert.doesNotMatch(config, /devin/);

      // Skill index
      assert.match(skillIndex, /## stack-nestjs/);
      assert.match(skillIndex, /## sdd-orchestrator/);
      // orbit-openspec-sdd-flow was removed as redundant: its content lives in AGENTS.md
      assert.doesNotMatch(skillIndex, /## orbit-openspec-sdd-flow/);
      // Index marks delegated roles as subagents on agent-capable platforms
      assert.match(skillIndex, /delegation: subagent/);
      assert.match(skillIndex, /\.claude\/agents\/orbit-builder\.md \(subagent\)/);

      // Orchestrator skill references /opsx: commands and delegates to the builder subagent
      assert.match(claudeSkill, /Orbit SDD Orchestrator/);
      assert.match(claudeSkill, /\/opsx:propose/);
      assert.match(claudeSkill, /\/opsx:apply/);
      assert.match(claudeSkill, /orbit-qa-verifier/);
      assert.match(claudeSkill, /\/opsx:archive/);
      assert.match(claudeSkill, /human gate/);
      assert.match(claudeSkill, /TDD/);
      assert.match(claudeSkill, /orbit-builder/);
      // Planning gate confirms touched surfaces/suites before approval (testing-sufficiency reinforcement)
      assert.match(claudeSkill, /touched surfaces and required suites/);

      // AGENTS.md Quality section requires evidence to match the touched surface
      assert.match(agents, /touched surface/);
      // AGENTS.md startup + quality check for an optional, project-supplied ARCHITECTURE.md
      assert.match(agents, /If `ARCHITECTURE\.md` exists/);

      // Builder is a real Claude subagent with frontmatter and TDD enforcement
      const builderAgent = await readFile(join(dir, ".claude/agents/orbit-builder.md"), "utf8");
      assert.match(builderAgent, /^---\nname: orbit-builder/);
      assert.match(builderAgent, /model: inherit/);
      assert.match(builderAgent, /red-green-refactor/);
      assert.match(builderAgent, /failing test/);
      assert.match(builderAgent, /required closing suites for the touched surface/);
      assert.match(builderAgent, /ARCHITECTURE\.md/);

      // QA verifier and reviewer gained a testing-sufficiency step/lens against project-testing
      // and an optional ARCHITECTURE.md, when the project supplies one.
      const qaAgent = await readFile(join(dir, ".claude/agents/orbit-qa-verifier.md"), "utf8");
      assert.match(qaAgent, /Testing sufficiency/);
      assert.match(qaAgent, /map touched surfaces to required suites/);
      assert.match(qaAgent, /ARCHITECTURE\.md/);

      const reviewerAgent = await readFile(join(dir, ".claude/agents/orbit-reviewer.md"), "utf8");
      assert.match(reviewerAgent, /Testing sufficiency/);
      assert.match(reviewerAgent, /ARCHITECTURE\.md/);

      // sdd-orchestrator also checks for an optional ARCHITECTURE.md before non-trivial work
      assert.match(claudeSkill, /ARCHITECTURE\.md/);

      // project-testing is prescriptive: it maps touched surfaces to required evidence, and
      // defers to ARCHITECTURE.md when the project has one.
      const projectTestingSkill = await readFile(join(dir, ".claude/skills/project-testing/SKILL.md"), "utf8");
      assert.match(projectTestingSkill, /## Surface Matrix/);
      assert.match(projectTestingSkill, /## Evidence Rules/);
      assert.match(projectTestingSkill, /ARCHITECTURE\.md/);
      // Generic harness: no stack-specific leakage (ORM/DB engine names, project-specific docs)
      assert.doesNotMatch(projectTestingSkill, /Prisma|RLS|PostgreSQL|plan-cimientos-arquitectura/);

      // Read-only role restricts tools (Claude) — scout cannot edit
      const scoutAgent = await readFile(join(dir, ".claude/agents/orbit-scout.md"), "utf8");
      assert.match(scoutAgent, /tools: Read, Grep, Glob/);
      assert.match(scoutAgent, /model: haiku/);

      // OpenCode emits subagents with mode: subagent and permission gates
      const reviewerAgentOpencode = await readFile(join(dir, ".opencode/agents/orbit-reviewer.md"), "utf8");
      assert.match(reviewerAgentOpencode, /mode: subagent/);
      assert.match(reviewerAgentOpencode, /edit: deny/);

      // Cursor supports file-based subagents: roles are real subagents in .cursor/agents/, not
      // inline skills. The inline skill copy must be pruned.
      const builderCursorAgent = await readFile(join(dir, ".cursor/agents/orbit-builder.md"), "utf8");
      assert.match(builderCursorAgent, /^---\nname: orbit-builder/);
      assert.match(builderCursorAgent, /red-green-refactor/);
      // Full-access role: no readonly line, inherits the session model.
      assert.match(builderCursorAgent, /model: inherit/);
      assert.doesNotMatch(builderCursorAgent, /readonly:/);
      try {
        await readFile(join(dir, ".cursor/skills/orbit-builder/SKILL.md"), "utf8");
        assert.fail("orbit-builder should be a Cursor subagent, not an inline skill");
      } catch (err) {
        assert.equal(err.code, "ENOENT");
      }

      // Read-only role on Cursor: strong tier -> mapped model + readonly:true (no edits).
      const pmSpecCursorAgent = await readFile(join(dir, ".cursor/agents/orbit-pm-spec.md"), "utf8");
      assert.match(pmSpecCursorAgent, /model: claude-opus-4-8/);
      assert.match(pmSpecCursorAgent, /readonly: true/);
      // Scout is the fast tier on Cursor.
      const scoutCursorAgent = await readFile(join(dir, ".cursor/agents/orbit-scout.md"), "utf8");
      assert.match(scoutCursorAgent, /model: claude-4-5-haiku/);

      // The skill index marks Cursor roles as subagents too.
      assert.match(skillIndex, /\.cursor\/agents\/orbit-builder\.md \(subagent\)/);

      // Codex supports subagents as standalone TOML files in .codex/agents/. The inline skill copy
      // must be pruned.
      const builderCodexAgent = await readFile(join(dir, ".codex/agents/orbit-builder.toml"), "utf8");
      assert.match(builderCodexAgent, /^name = "orbit-builder"/m);
      assert.match(builderCodexAgent, /description = "/);
      assert.match(builderCodexAgent, /developer_instructions = '''/);
      assert.match(builderCodexAgent, /red-green-refactor/);
      // Full-access builder: inherit tier -> no model line, no sandbox restriction.
      assert.doesNotMatch(builderCodexAgent, /^model = /m);
      assert.doesNotMatch(builderCodexAgent, /sandbox_mode/);
      try {
        await readFile(join(dir, ".codex/skills/orbit-builder/SKILL.md"), "utf8");
        assert.fail("orbit-builder should be a Codex subagent, not an inline skill");
      } catch (err) {
        assert.equal(err.code, "ENOENT");
      }

      // Read-only Codex role: strong tier -> gpt-5.5, sandbox_mode read-only.
      const pmSpecCodexAgent = await readFile(join(dir, ".codex/agents/orbit-pm-spec.toml"), "utf8");
      assert.match(pmSpecCodexAgent, /model = "gpt-5\.5"/);
      assert.match(pmSpecCodexAgent, /sandbox_mode = "read-only"/);
      // Scout is the fast tier on Codex.
      const scoutCodexAgent = await readFile(join(dir, ".codex/agents/orbit-scout.toml"), "utf8");
      assert.match(scoutCodexAgent, /model = "gpt-5\.4-mini"/);

      // The skill index marks Codex roles as subagents (TOML path).
      assert.match(skillIndex, /\.codex\/agents\/orbit-builder\.toml \(subagent\)/);
      // Non-role Codex skills stay as inline skills (orchestrator + stack).
      const orchestratorCodexSkill = await readFile(join(dir, ".codex/skills/sdd-orchestrator/SKILL.md"), "utf8");
      assert.match(orchestratorCodexSkill, /Orbit SDD Orchestrator/);

      // Consolidated skills are removed (folded into AGENTS.md / orbit-builder)
      for (const removed of ["orbit-strict-tdd", "orbit-git-context", "orbit-skill-routing"]) {
        try {
          await readFile(join(dir, `.claude/skills/${removed}/SKILL.md`), "utf8");
          assert.fail(`${removed} skill should no longer be generated`);
        } catch (err) {
          assert.equal(err.code, "ENOENT");
        }
      }

      // AGENTS.md absorbs delegation, skill-routing, and memory guidance
      assert.match(agents, /Delegation And Subagents/);
      assert.match(agents, /Skill Routing/);

      // The redundant orbit-openspec-sdd-flow skill is no longer generated; the /opsx:
      // command reference now lives in AGENTS.md (single source).
      try {
        await readFile(join(dir, ".claude/skills/orbit-openspec-sdd-flow/SKILL.md"), "utf8");
        assert.fail("orbit-openspec-sdd-flow skill should no longer be generated");
      } catch (err) {
        assert.equal(err.code, "ENOENT");
      }
      assert.match(agents, /\/opsx:propose/);
      assert.match(agents, /\/opsx:apply/);

      // Stack skills
      assert.match(codexSkill, /Nest\.js conventions/);

      // Roadmap: project-level status index, wired into startup + orchestrator
      const roadmap = await readFile(join(dir, "docs/orbit/roadmap.md"), "utf8");
      assert.match(roadmap, /# Project Roadmap/);
      assert.match(roadmap, /\| Module \| Phase \| Status \| OpenSpec change \|/);
      assert.match(agents, /docs\/orbit\/roadmap\.md/);
      assert.match(config, /roadmap: docs\/orbit\/roadmap\.md/);
      assert.match(claudeSkill, /roadmap\.md/);

      // .gitignore
      assert.match(gitignore, /\.orbit\//);

      // No devin skill directory should be created
      try {
        await readFile(join(dir, ".devin/skills/sdd-orchestrator/SKILL.md"), "utf8");
        assert.fail("devin skill directory should not exist");
      } catch (err) {
        assert.equal(err.code, "ENOENT");
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not overwrite existing files unless force is used", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orbit-test-"));

    try {
      await execFileAsync(process.execPath, [bin, "init", "--cwd", dir, SKIP_OPENSPEC]);
      await execFileAsync(process.execPath, [bin, "init", "--cwd", dir, SKIP_OPENSPEC]);

      const agents = await readFile(join(dir, "AGENTS.md"), "utf8");
      assert.match(agents, /Orbit/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refreshes skill registry from native skill directories", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orbit-test-"));

    try {
      await execFileAsync(process.execPath, [bin, "init", "--cwd", dir, SKIP_OPENSPEC]);
      await execFileAsync(process.execPath, [bin, "refresh-skills", "--cwd", dir]);

      const registry = await readFile(join(dir, ".orbit/skill-registry.json"), "utf8");
      const index = await readFile(join(dir, "docs/orbit/skills/index.md"), "utf8");

      assert.match(registry, /"id": "sdd-orchestrator"/);
      assert.match(index, /\.claude\/skills\/sdd-orchestrator\/SKILL\.md/);
      assert.match(index, /type: orbit-entrypoint/);
      assert.match(index, /invocation:/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("doctor reports OpenSpec config.yaml as present when it exists", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orbit-test-"));

    try {
      await execFileAsync(process.execPath, [bin, "init", "--cwd", dir, SKIP_OPENSPEC]);

      // Simulate openspec init having run by creating the expected files.
      await mkdir(join(dir, "openspec/specs"), { recursive: true });
      await mkdir(join(dir, "openspec/changes"), { recursive: true });
      await writeFile(
        join(dir, "openspec/config.yaml"),
        "schema: spec-driven\ncontext: |\n  TDD red-green-refactor\n",
        "utf8",
      );

      const { stdout } = await execFileAsync(process.execPath, [bin, "doctor", "--cwd", dir]);

      assert.match(stdout, /OK.*roadmap/);
      assert.match(stdout, /OK.*OpenSpec config/);
      assert.match(stdout, /OK.*OpenSpec TDD config/);
      assert.match(stdout, /OK.*OpenSpec specs dir/);
      assert.match(stdout, /OK.*OpenSpec changes dir/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("doctor warns when openspec/config.yaml is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orbit-test-"));

    try {
      await execFileAsync(process.execPath, [bin, "init", "--cwd", dir, SKIP_OPENSPEC]);

      const { stdout } = await execFileAsync(process.execPath, [bin, "doctor", "--cwd", dir]);

      assert.match(stdout, /WARN.*OpenSpec config/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("merges Orbit TDD rules into an existing OpenSpec config without duplicating keys", () => {
    const existing = `schema: spec-driven
context: |
  Existing project context.

rules:
  tasks:
    - Existing task rule.
  proposal:
    - Existing proposal rule.
`;

    const merged = mergeOpenSpecTddConfig(existing);
    const mergedAgain = mergeOpenSpecTddConfig(merged);

    assert.equal(mergedAgain, merged);
    assert.match(merged, /Existing project context/);
    assert.match(merged, /Existing task rule/);
    assert.match(merged, /Existing proposal rule/);
    assert.match(merged, /red-green-refactor/);
    assert.match(merged, /T\.0 Write failing test/);
    assert.match(merged, /Testing Strategy section/);
    assert.match(merged, /Risk section/);
    // Quoted scalar avoids YAML ambiguity from the colon inside the value.
    assert.match(merged, /- 'Format: "T\.0 Write failing test/);
    // Testing-sufficiency reinforcement: surface-to-suite mapping, not "tests pass" alone.
    assert.match(merged, /required suites for the touched surface/);
    assert.match(merged, /Identify the touched surfaces/);
    // Optional, project-supplied ARCHITECTURE.md is treated as normative testing policy when present.
    assert.match(merged, /If ARCHITECTURE\.md exists at the project root/);
    assert.equal((merged.match(/^context:/gm) || []).length, 1);
    assert.equal((merged.match(/^rules:/gm) || []).length, 1);
  });

  it("initializes only requested tools and excludes others", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orbit-test-"));

    try {
      await execFileAsync(process.execPath, [bin, "init", "--cwd", dir, "--tools", "claude", SKIP_OPENSPEC]);

      // claude skill exists
      const claudeSkill = await readFile(join(dir, ".claude/skills/sdd-orchestrator/SKILL.md"), "utf8");
      assert.match(claudeSkill, /sdd-orchestrator/);

      // codex skill does not exist
      try {
        await readFile(join(dir, ".codex/skills/sdd-orchestrator/SKILL.md"), "utf8");
        assert.fail("codex skill should not exist when only claude is requested");
      } catch (err) {
        assert.equal(err.code, "ENOENT");
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("installs no stack skills and prints a hint in a greenfield project", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orbit-test-"));

    try {
      const { stdout } = await execFileAsync(process.execPath, [bin, "init", "--cwd", dir, SKIP_OPENSPEC]);

      // No package.json present → no stack skills installed, hint shown.
      assert.match(stdout, /No stack skills installed/);

      for (const stack of ["stack-nestjs", "stack-nextjs", "stack-prisma"]) {
        try {
          await readFile(join(dir, `.claude/skills/${stack}/SKILL.md`), "utf8");
          assert.fail(`${stack} should not be installed in a greenfield project`);
        } catch (err) {
          assert.equal(err.code, "ENOENT");
        }
      }

      // Generic project skills are always installed.
      const testing = await readFile(join(dir, ".claude/skills/project-testing/SKILL.md"), "utf8");
      assert.match(testing, /test/i);

      // Index lists no stack skill but keeps the generic ones.
      const index = await readFile(join(dir, "docs/orbit/skills/index.md"), "utf8");
      assert.doesNotMatch(index, /## stack-nestjs/);
      assert.match(index, /## project-testing/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("installs only the stack skills whose dependency is detected", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orbit-test-"));

    try {
      await writeFile(
        join(dir, "package.json"),
        JSON.stringify({ name: "t", dependencies: { "@nestjs/core": "^10" } }),
        "utf8",
      );

      const { stdout } = await execFileAsync(process.execPath, [bin, "init", "--cwd", dir, SKIP_OPENSPEC]);

      assert.match(stdout, /Stack skills installed: stack-nestjs/);

      // Nest detected → installed.
      const nest = await readFile(join(dir, ".claude/skills/stack-nestjs/SKILL.md"), "utf8");
      assert.match(nest, /Nest\.js/);

      // Next/Prisma not in deps → not installed.
      for (const stack of ["stack-nextjs", "stack-prisma"]) {
        try {
          await readFile(join(dir, `.claude/skills/${stack}/SKILL.md`), "utf8");
          assert.fail(`${stack} should not be installed when its dependency is absent`);
        } catch (err) {
          assert.equal(err.code, "ENOENT");
        }
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("starts in sync right after init: sync --check passes and the builder has a routing block", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orbit-test-"));

    try {
      await execFileAsync(process.execPath, [bin, "init", "--cwd", dir, SKIP_OPENSPEC]);

      // Fresh init leaves nothing to reconcile.
      const { stdout } = await execFileAsync(process.execPath, [bin, "sync", "--cwd", dir, "--check"]);
      assert.match(stdout, /everything in sync/);

      // The builder carries the managed routing block, populated from the installed skills.
      const builder = await readFile(join(dir, ".claude/agents/orbit-builder.md"), "utf8");
      assert.match(builder, /<!-- orbit:managed:builder-routing:start -->/);
      assert.match(builder, /<!-- orbit:managed:builder-routing:end -->/);
      assert.match(builder, /-> `project-testing`/);
      assert.match(builder, /routing packet at `openspec\/changes\/<change-name>\/routing\.md`/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("sync propagates canonical skill edits to the other platforms with syntax transforms", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orbit-test-"));

    try {
      await execFileAsync(process.execPath, [bin, "init", "--cwd", dir, SKIP_OPENSPEC]);

      // Edit the canonical Claude copy with platform-specific tokens.
      const canonicalPath = join(dir, ".claude/skills/project-testing/SKILL.md");
      const canonical = await readFile(canonicalPath, "utf8");
      await writeFile(canonicalPath, `${canonical}\nRun /opsx:apply and read CLAUDE.md for context.\n`, "utf8");

      await execFileAsync(process.execPath, [bin, "sync", "--cwd", dir]);

      // Derived copies pick up the edit with the colon->hyphen and CLAUDE->AGENTS transforms.
      const cursorCopy = await readFile(join(dir, ".cursor/skills/project-testing/SKILL.md"), "utf8");
      assert.match(cursorCopy, /\/opsx-apply/);
      assert.match(cursorCopy, /AGENTS\.md/);
      assert.doesNotMatch(cursorCopy, /\/opsx:apply/);
      assert.doesNotMatch(cursorCopy, /CLAUDE\.md/);

      // The canonical copy is never rewritten.
      const canonicalAfter = await readFile(canonicalPath, "utf8");
      assert.match(canonicalAfter, /\/opsx:apply/);
      assert.match(canonicalAfter, /CLAUDE\.md/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("sync wires a new project-authored skill into every platform, the index, the registry, and the routing table", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orbit-test-"));

    try {
      await execFileAsync(process.execPath, [bin, "init", "--cwd", dir, SKIP_OPENSPEC]);

      await mkdir(join(dir, ".claude/skills/create-payment-flow"), { recursive: true });
      await writeFile(
        join(dir, ".claude/skills/create-payment-flow/SKILL.md"),
        `---
name: create-payment-flow
description: Create or change payment flows with provider isolation.
when_to_use: payments, checkout, refunds, or billing behavior changes
orbit_type: project-implementation
paths: apps/api/payments/**, packages/billing/**
---

# create-payment-flow

Body of the custom skill. Use /opsx:apply during implementation.
`,
        "utf8",
      );

      await execFileAsync(process.execPath, [bin, "sync", "--cwd", dir]);

      // Copies on the other platforms, with transforms applied.
      for (const platformDir of [".cursor", ".codex", ".opencode"]) {
        const copy = await readFile(join(dir, `${platformDir}/skills/create-payment-flow/SKILL.md`), "utf8");
        assert.match(copy, /create-payment-flow/);
        assert.match(copy, /\/opsx-apply/);
      }

      // Index entry generated from the frontmatter.
      const index = await readFile(join(dir, "docs/orbit/skills/index.md"), "utf8");
      assert.match(index, /## create-payment-flow/);
      assert.match(index, /path_globs: apps\/api\/payments\/\*\*, packages\/billing\/\*\*/);

      // Registry record present.
      const registry = await readFile(join(dir, ".orbit/skill-registry.json"), "utf8");
      assert.match(registry, /"id": "create-payment-flow"/);

      // Builder routing table row generated on every platform, including the Codex TOML agent.
      const builder = await readFile(join(dir, ".claude/agents/orbit-builder.md"), "utf8");
      assert.match(builder, /apps\/api\/payments\/\*\*.*-> `create-payment-flow`/);
      const builderCodex = await readFile(join(dir, ".codex/agents/orbit-builder.toml"), "utf8");
      assert.match(builderCodex, /-> `create-payment-flow`/);

      // Second sync is a no-op (idempotent).
      const { stdout } = await execFileAsync(process.execPath, [bin, "sync", "--cwd", dir]);
      assert.match(stdout, /everything already in sync/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("sync restores managed agent frontmatter while preserving project additions in the body", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orbit-test-"));

    try {
      await execFileAsync(process.execPath, [bin, "init", "--cwd", dir, SKIP_OPENSPEC]);

      // Simulate stale/hand-edited frontmatter (the H2-class drift) plus a project-owned body edit.
      const reviewerPath = join(dir, ".claude/agents/orbit-reviewer.md");
      let reviewer = await readFile(reviewerPath, "utf8");
      reviewer = reviewer.replace("model: opus", "model: claude-opus-4-8\nreadonly: true");
      reviewer += "\n- PROJECT-SPECIFIC review lens kept by sync.\n";
      await writeFile(reviewerPath, reviewer, "utf8");

      await execFileAsync(process.execPath, [bin, "sync", "--cwd", dir]);

      const synced = await readFile(reviewerPath, "utf8");
      // Managed frontmatter regenerated from the capability preset + model config.
      assert.match(synced, /tools: Read, Grep, Glob, Bash/);
      assert.match(synced, /model: opus/);
      assert.doesNotMatch(synced, /readonly:/);
      // Project-owned body content preserved.
      assert.match(synced, /PROJECT-SPECIFIC review lens kept by sync\./);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("sync --check exits non-zero on drift without writing, and doctor reports the drift", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orbit-test-"));

    try {
      await execFileAsync(process.execPath, [bin, "init", "--cwd", dir, SKIP_OPENSPEC]);

      // Introduce drift: edit the canonical skill without syncing.
      const canonicalPath = join(dir, ".claude/skills/project-ui/SKILL.md");
      const canonical = await readFile(canonicalPath, "utf8");
      await writeFile(canonicalPath, `${canonical}\nNew canonical-only rule.\n`, "utf8");
      const cursorBefore = await readFile(join(dir, ".cursor/skills/project-ui/SKILL.md"), "utf8");

      // --check exits 1 and does not write.
      let checkError = null;
      try {
        await execFileAsync(process.execPath, [bin, "sync", "--cwd", dir, "--check"]);
      } catch (error) {
        checkError = error;
      }
      assert.ok(checkError, "sync --check should exit non-zero on drift");
      assert.equal(checkError.code, 1);
      assert.match(checkError.stdout, /out of sync/);
      const cursorAfterCheck = await readFile(join(dir, ".cursor/skills/project-ui/SKILL.md"), "utf8");
      assert.equal(cursorAfterCheck, cursorBefore);

      // doctor surfaces the same drift.
      const { stdout: doctorOut } = await execFileAsync(process.execPath, [bin, "doctor", "--cwd", dir]);
      assert.match(doctorOut, /Sync \(derived files\).*out of sync/);

      // Apply, then the gate passes.
      await execFileAsync(process.execPath, [bin, "sync", "--cwd", dir]);
      const { stdout: checkOut } = await execFileAsync(process.execPath, [bin, "sync", "--cwd", dir, "--check"]);
      assert.match(checkOut, /everything in sync/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("sync ignores OpenSpec-owned skills entirely", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orbit-test-"));

    try {
      await execFileAsync(process.execPath, [bin, "init", "--cwd", dir, SKIP_OPENSPEC]);

      await mkdir(join(dir, ".claude/skills/openspec-propose"), { recursive: true });
      await writeFile(
        join(dir, ".claude/skills/openspec-propose/SKILL.md"),
        "---\nname: openspec-propose\ndescription: Vendored by OpenSpec.\n---\n\nVendored body.\n",
        "utf8",
      );

      await execFileAsync(process.execPath, [bin, "sync", "--cwd", dir]);

      // Not propagated, not indexed.
      try {
        await readFile(join(dir, ".cursor/skills/openspec-propose/SKILL.md"), "utf8");
        assert.fail("openspec-* skills must not be propagated by sync");
      } catch (err) {
        assert.equal(err.code, "ENOENT");
      }
      const index = await readFile(join(dir, "docs/orbit/skills/index.md"), "utf8");
      assert.doesNotMatch(index, /## openspec-propose/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("quotes YAML rule scalars that contain a colon so OpenSpec keeps the design rules", () => {
    const fresh = mergeOpenSpecTddConfig("");
    // Unquoted, this line parses as a nested map and OpenSpec silently drops ALL design rules.
    assert.match(fresh, /- 'Identify the touched surfaces: domain\/core logic/);
    assert.match(fresh, /- 'Format: "T\.0 Write failing test/);

    // The merge path quotes inserted rules the same way.
    const merged = mergeOpenSpecTddConfig("schema: spec-driven\nrules:\n  tasks:\n    - Existing rule.\n");
    assert.match(merged, /- 'Identify the touched surfaces: domain\/core logic/);
  });

  it("makes the model map project-configurable: edits to orbit.config.yaml survive init --force and drive subagent models", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orbit-test-"));

    try {
      await execFileAsync(process.execPath, [bin, "init", "--cwd", dir, SKIP_OPENSPEC]);

      // Default Cursor mapping is present and applied.
      let config = await readFile(join(dir, "orbit.config.yaml"), "utf8");
      assert.match(config, /cursor:\n\s+strong: claude-opus-4-8/);

      // User edits the tier maps (strong -> gpt-5.5 on Cursor, fast -> gpt-5.4 on Codex) and adds
      // a per-agent override (orbit-reviewer pinned to composer-2.5 on Cursor only).
      config = config
        .replace("strong: claude-opus-4-8", "strong: gpt-5.5")
        .replace("    codex:\n      strong: gpt-5.5\n      fast: gpt-5.4-mini", "    codex:\n      strong: gpt-5.5\n      fast: gpt-5.4")
        .replace(
          "    orbit-reviewer:\n      tier: strong",
          "    orbit-reviewer:\n      tier: strong\n      model:\n        cursor: composer-2.5",
        );
      await writeFile(join(dir, "orbit.config.yaml"), config, "utf8");

      // Re-run with --force to regenerate the subagent files from the edited config.
      await execFileAsync(process.execPath, [bin, "init", "--cwd", dir, SKIP_OPENSPEC, "--force"]);

      // The user's edits are preserved in the regenerated config (not wiped by --force).
      const reconfig = await readFile(join(dir, "orbit.config.yaml"), "utf8");
      assert.match(reconfig, /cursor:\n\s+strong: gpt-5\.5/);
      assert.match(reconfig, /cursor: composer-2\.5/);

      // Tier edit applied: strong roles on Cursor now use gpt-5.5...
      const pmSpec = await readFile(join(dir, ".cursor/agents/orbit-pm-spec.md"), "utf8");
      assert.match(pmSpec, /model: gpt-5\.5/);
      // ...except orbit-reviewer, whose per-agent override wins.
      const reviewer = await readFile(join(dir, ".cursor/agents/orbit-reviewer.md"), "utf8");
      assert.match(reviewer, /model: composer-2\.5/);

      // Claude mapping is untouched by the Cursor edit.
      const pmSpecClaude = await readFile(join(dir, ".claude/agents/orbit-pm-spec.md"), "utf8");
      assert.match(pmSpecClaude, /model: opus/);

      // Codex fast-tier edit applied: scout now uses gpt-5.4.
      const scoutCodex = await readFile(join(dir, ".codex/agents/orbit-scout.toml"), "utf8");
      assert.match(scoutCodex, /model = "gpt-5\.4"/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
