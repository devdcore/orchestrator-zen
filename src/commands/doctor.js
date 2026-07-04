import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PLATFORM_AGENT_DIRS, PLATFORM_SKILL_DIRS } from "../lib/skills.js";
import { computeSyncPlan } from "./sync.js";

const execFileAsync = promisify(execFile);

export async function doctorCommand(options) {
  const root = options.cwd;
  const checks = [];

  // --- Orbit harness files ---
  checks.push(await existsCheck(root, "AGENTS.md", "AGENTS.md"));
  checks.push(await existsCheck(root, "CLAUDE.md", "CLAUDE.md (Claude Code entrypoint)"));
  checks.push(await existsCheck(root, "orbit.config.yaml", "orbit.config.yaml"));
  checks.push(await existsCheck(root, "docs/orbit/skills/index.md", "skill index"));
  checks.push(await existsCheck(root, "docs/orbit/roadmap.md", "roadmap"));
  checks.push(await existsCheck(root, "docs/orbit/decisions.md", "decisions"));
  checks.push(await existsCheck(root, "docs/orbit/handoff.md", "handoff"));

  // --- OpenSpec structure (created by openspec init) ---
  checks.push(await existsCheck(root, "openspec/config.yaml", "OpenSpec config"));
  checks.push(await existsCheck(root, "openspec/specs", "OpenSpec specs dir"));
  checks.push(await existsCheck(root, "openspec/changes", "OpenSpec changes dir"));

  // Check that the TDD context was injected into openspec/config.yaml
  checks.push(await openSpecConfigHasTdd(root));

  // --- Platform skill directories ---
  for (const [tool, dir] of Object.entries(PLATFORM_SKILL_DIRS)) {
    checks.push(await existsCheck(root, dir, `${tool} skills`));
  }

  // --- Platform subagent directories (agent-capable platforms only) ---
  for (const [tool, dir] of Object.entries(PLATFORM_AGENT_DIRS)) {
    checks.push(await existsCheck(root, dir, `${tool} subagents`));
  }

  // --- Sync drift (derived copies vs sources of truth) ---
  try {
    const plan = await computeSyncPlan({ cwd: root, tools: options.tools });
    checks.push({
      label: "Sync (derived files)",
      ok: plan.changes.length === 0,
      detail:
        plan.changes.length === 0
          ? "in sync"
          : `${plan.changes.length} file(s) out of sync — run orbit sync`,
    });
    for (const warning of plan.warnings) {
      checks.push({ label: "Sync note", ok: false, detail: warning });
    }
  } catch (error) {
    checks.push({ label: "Sync (derived files)", ok: false, detail: `check failed: ${error.message}` });
  }

  // --- Git ---
  const git = await run(root, "git", ["rev-parse", "--is-inside-work-tree"]);
  checks.push({
    label: "Git repository",
    ok: git.ok && git.stdout.trim() === "true",
    detail: git.ok ? "available" : "not detected",
  });

  if (git.ok) {
    const branch = await run(root, "git", ["branch", "--show-current"]);
    const status = await run(root, "git", ["status", "--short"]);
    checks.push({
      label: "Git branch",
      ok: true,
      detail: branch.stdout.trim() || "(detached or unnamed)",
    });
    checks.push({
      label: "Git status",
      ok: true,
      detail: status.stdout.trim() ? "working tree has changes" : "clean",
    });
  }

  // --- OpenSpec CLI (local via npx, preferred over global) ---
  const openspecLocal = await run(root, "npx", ["openspec", "--version"]);
  if (openspecLocal.ok) {
    checks.push({
      label: "OpenSpec CLI (local)",
      ok: true,
      detail: openspecLocal.stdout.trim() || "available via npx",
    });
  } else {
    // Fallback: check global install
    const openspecGlobal = await run(root, "openspec", ["--version"]);
    checks.push({
      label: "OpenSpec CLI",
      ok: openspecGlobal.ok,
      detail: openspecGlobal.ok
        ? `global: ${openspecGlobal.stdout.trim() || "available"}`
        : "not found — run: npm install --save-dev @fission-ai/openspec@latest",
    });
  }

  // --- OpenSpec npm dependency in package.json ---
  checks.push(await openSpecInPackageJson(root));

  console.log("Orbit doctor\n");
  for (const check of checks) {
    const level = check.ok ? "OK  " : "WARN";
    console.log(`${level}  ${check.label}: ${check.detail}`);
  }
}

async function existsCheck(root, path, label) {
  try {
    await access(join(root, path));
    return { label, ok: true, detail: path };
  } catch {
    return { label, ok: false, detail: `missing ${path}` };
  }
}

async function openSpecConfigHasTdd(root) {
  const label = "OpenSpec TDD config";
  try {
    const content = await readFile(join(root, "openspec/config.yaml"), "utf8");
    const hasTdd = content.includes("red-green-refactor") || content.includes("TDD");
    return {
      label,
      ok: hasTdd,
      detail: hasTdd ? "TDD rules present" : "missing TDD rules — run orbit init to inject them",
    };
  } catch {
    return { label, ok: false, detail: "openspec/config.yaml not found" };
  }
}

async function openSpecInPackageJson(root) {
  const label = "OpenSpec in package.json";
  try {
    const content = await readFile(join(root, "package.json"), "utf8");
    const pkg = JSON.parse(content);
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
    const present = Boolean(allDeps["@fission-ai/openspec"]);
    return {
      label,
      ok: present,
      detail: present
        ? `${allDeps["@fission-ai/openspec"]}`
        : "not found — run: npm install --save-dev @fission-ai/openspec@latest",
    };
  } catch {
    return { label, ok: false, detail: "package.json not found or unreadable" };
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
