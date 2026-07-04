export const PLATFORMS = ["codex", "claude", "cursor", "opencode"];

export const PLATFORM_SKILL_DIRS = {
  codex: ".codex/skills",
  claude: ".claude/skills",
  cursor: ".cursor/skills",
  opencode: ".opencode/skills",
};

// Platforms that support file-based subagents with isolated context windows.
// On these, Orbit role skills are emitted as real subagents instead of inline skills.
// Cursor reads `.cursor/agents/` (and, for compatibility, `.claude/agents/` and `.codex/agents/`)
// with the same name/description/model frontmatter. Codex reads its own TOML agent files from
// `.codex/agents/`. So all four platforms get real subagents (see PLATFORM_AGENT_EXT for format).
export const PLATFORM_AGENT_DIRS = {
  claude: ".claude/agents",
  cursor: ".cursor/agents",
  opencode: ".opencode/agents",
  codex: ".codex/agents",
};

// Subagent file format per platform. Claude/Cursor/OpenCode use markdown with YAML frontmatter;
// Codex uses standalone TOML files (name/description/developer_instructions + optional model,
// model_reasoning_effort, sandbox_mode). The .md and .toml files coexist in .codex/agents/ since
// Cursor reads the .md compat copies while Codex itself loads the .toml ones.
export const PLATFORM_AGENT_EXT = {
  claude: "md",
  cursor: "md",
  opencode: "md",
  codex: "toml",
};

export const AGENT_CAPABLE_PLATFORMS = Object.keys(PLATFORM_AGENT_DIRS);

// Capability presets for delegated roles.
// claudeTools omitted => inherit all tools. opencode permission map => edit/bash gates.
// cursorReadonly maps to Cursor's single `readonly:` boolean (no file edits, no state-changing
// shell). codexSandbox maps to Codex's `sandbox_mode` ("read-only" / omitted => inherit session).
// Neither Cursor nor Codex has an edit-deny+bash-allow combo, so READ_PLUS_BASH roles (which must
// run tests) are left unrestricted there and rely on their role instructions + the human gates.
const READ_ONLY = {
  claudeTools: "Read, Grep, Glob",
  opencodePermission: { edit: "deny", bash: "deny" },
  cursorReadonly: true,
  codexSandbox: "read-only",
};
const READ_PLUS_BASH = {
  claudeTools: "Read, Grep, Glob, Bash",
  opencodePermission: { edit: "deny", bash: "allow" },
  cursorReadonly: false,
  // codexSandbox omitted => inherits the session sandbox so the role can still run tests.
};
const FULL_ACCESS = {
  // no claudeTools => all tools inherited
  opencodePermission: { edit: "allow", bash: "allow" },
  cursorReadonly: false,
  // codexSandbox omitted => inherits the session sandbox (builder needs write access).
};

export const ORBIT_SKILLS = [
  {
    id: "sdd-orchestrator",
    type: "orbit-entrypoint",
    delegation: "skill",
    summary: "Starts and governs the Orbit SDD flow for non-trivial requirements.",
    useWhen: [
      "the user invokes sdd-orchestrator",
      "a requirement is large, ambiguous, architectural, risky, or product-facing",
      "the task needs OpenSpec, human gates, TDD, review, or coordinated agents",
    ],
  },
  {
    id: "orbit-pm-spec",
    type: "orbit-agent-role",
    delegation: "subagent",
    // Requirement understanding is priority #1 — pin it to the strongest model. A misunderstood
    // requirement poisons every downstream step (specs, build, QA), so this is the cheapest place
    // to spend model strength.
    model: "strong",
    capability: READ_ONLY,
    summary: "Turns vague prompts into local user stories, scope, risks, and acceptance criteria.",
    useWhen: ["requirements are vague", "the task needs product clarification", "OpenSpec input needs refinement"],
  },
  {
    id: "orbit-scout",
    type: "orbit-agent-role",
    delegation: "subagent",
    model: "fast",
    capability: READ_ONLY,
    summary: "Investigates repo context, stack, conventions, and risks without implementing.",
    useWhen: ["the area is unknown", "4 or more files must be read to understand a flow", "the task needs a compact handoff"],
  },
  {
    id: "orbit-builder",
    type: "orbit-agent-role",
    delegation: "subagent",
    model: "inherit",
    capability: FULL_ACCESS,
    summary: "Implements approved tasks under OpenSpec apply with strict scope, reuse-first, and red-green-refactor TDD.",
    useWhen: ["OpenSpec tasks are approved", "implementation is needed", "the task touches production code"],
  },
  {
    id: "orbit-qa-verifier",
    type: "orbit-agent-role",
    delegation: "subagent",
    // Strong model for correctness-critical verification — catching a missed acceptance criterion
    // here is cheaper than catching it in production.
    model: "strong",
    capability: READ_PLUS_BASH,
    summary: "Designs and runs tests, functional checks, Playwright/curl verification, and structural validation (openspec validate).",
    useWhen: ["functional behavior changed", "tests must be selected or created", "a change needs verification evidence"],
  },
  {
    id: "orbit-reviewer",
    type: "orbit-agent-role",
    delegation: "subagent",
    // Strong model for adversarial review — a bug missed here ships to production.
    model: "strong",
    capability: READ_PLUS_BASH,
    summary: "Performs fresh-context review of diffs, risks, missing tests, regressions, and scope drift.",
    useWhen: ["before closing non-trivial changes", "the user asks for a review", "Git/worktree/test state is confusing"],
  },
];

export const PROJECT_SKILLS = [
  {
    id: "stack-nestjs",
    type: "project-stack",
    delegation: "skill",
    summary: "Nest.js conventions for controllers, services, modules, DTOs, providers, validation, and tests.",
    useWhen: ["touching Nest.js backend files", "creating controllers, services, modules, providers, or DTOs"],
    pathGlobs: ["apps/api/**", "src/**/*.controller.ts", "src/**/*.service.ts", "src/**/*.module.ts", "src/**/*.dto.ts"],
  },
  {
    id: "stack-nextjs",
    type: "project-stack",
    delegation: "skill",
    summary: "Next.js conventions for app router, pages, server actions, components, data loading, and UI tests.",
    useWhen: ["touching Next.js frontend files", "creating routes, components, layouts, or server actions"],
    pathGlobs: ["app/**", "pages/**", "components/**", "apps/web/**"],
  },
  {
    id: "stack-prisma",
    type: "project-stack",
    delegation: "skill",
    summary: "Prisma conventions for schema changes, migrations, query reuse, transactions, and generated clients.",
    useWhen: ["touching prisma schema or migrations", "changing database models", "writing Prisma queries"],
    pathGlobs: ["prisma/**", "**/*.prisma"],
  },
  {
    id: "project-testing",
    type: "project-quality",
    delegation: "skill",
    summary: "Project-specific test commands, fixtures, dev server checks, Playwright/curl verification, and evidence rules.",
    useWhen: ["running tests", "adding tests", "verifying frontend/backend behavior"],
  },
  {
    id: "project-ui",
    type: "project-stack",
    delegation: "skill",
    summary: "Project UI conventions for components, styling, accessibility, interaction states, and visual checks.",
    useWhen: ["touching shared UI", "creating frontend components", "reviewing visual or accessibility behavior"],
  },
];

// Orbit skill ids that previous versions generated but that have since been consolidated
// (folded into AGENTS.md or merged into orbit-builder). init prunes these so re-running the
// harness self-heals an older installation instead of leaving dead skills behind.
export const LEGACY_SKILL_IDS = [
  "orbit-strict-tdd",
  "orbit-git-context",
  "orbit-skill-routing",
  "orbit-handoff",
  "orbit-decision-log",
  // Removed: its command table + colon/hyphen syntax already live in AGENTS.md and the
  // sdd-orchestrator body, and OpenSpec ships its own opsx:* skills. A redundant bridge skill.
  "orbit-openspec-sdd-flow",
];

// stack-* skills are installed only when the matching dependency is detected in the target
// project's package.json. Generic project skills (project-testing, project-ui) are always
// installed. This keeps a portable harness from littering non-matching projects (e.g. a Go or
// Python repo) with framework skills it will never use.
export const STACK_DETECTION = {
  "stack-nestjs": ["@nestjs/core", "@nestjs/common"],
  "stack-nextjs": ["next"],
  "stack-prisma": ["@prisma/client", "prisma"],
};

export function allDefaultSkills() {
  return [...ORBIT_SKILLS, ...PROJECT_SKILLS];
}

// Given the set of dependency names found in the target project's package.json, return the
// project skills to install: generic ones always, stack-* only when a required dep is present.
// In a greenfield project (no deps), this returns only the generic project skills.
export function selectProjectSkills(depNames) {
  const deps = new Set(depNames);
  return PROJECT_SKILLS.filter((skill) => {
    const required = STACK_DETECTION[skill.id];
    if (!required) return true;
    return required.some((dep) => deps.has(dep));
  });
}

// True when this skill should be emitted as a real subagent on the given platform.
export function isSubagentFor(skill, tool) {
  return skill.delegation === "subagent" && AGENT_CAPABLE_PLATFORMS.includes(tool);
}

// Where a skill's file lives for a given tool, plus how it is referenced.
// Subagents on agent-capable platforms live in the agents dir as a flat <id>.<ext> file (markdown
// for Claude/Cursor/OpenCode, TOML for Codex); everything else is a skills/<id>/SKILL.md adapter.
export function locationFor(skill, tool) {
  if (isSubagentFor(skill, tool)) {
    const dir = PLATFORM_AGENT_DIRS[tool];
    const ext = PLATFORM_AGENT_EXT[tool] || "md";
    return { kind: "agent", dir, path: `${dir}/${skill.id}.${ext}` };
  }
  const dir = PLATFORM_SKILL_DIRS[tool];
  return { kind: "skill", dir, path: `${dir}/${skill.id}/SKILL.md` };
}
