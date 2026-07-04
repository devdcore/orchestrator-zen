import { initCommand } from "./commands/init.js";
import { doctorCommand } from "./commands/doctor.js";
import { refreshSkillsCommand } from "./commands/refresh-skills.js";
import { syncCommand } from "./commands/sync.js";

const HELP = `Orbit Harness

Usage:
  orbit init [--cwd <path>] [--force] [--tools codex,claude,cursor,opencode]
  orbit sync [--cwd <path>] [--check]
  orbit doctor [--cwd <path>]
  orbit refresh-skills [--cwd <path>]   (deprecated alias of sync)
  orbit help

Commands:
  init            Install the Orbit harness layer in the current project.
  sync            Reconcile derived files from their sources of truth: propagate the canonical
                  .claude skill copies to the other platforms, regenerate agent frontmatter and
                  the builder routing block, and rebuild the skill index + registry.
                  With --check, write nothing and exit non-zero on drift (CI gate).
  doctor          Inspect Git, OpenSpec, skills, sync drift, and Orbit project files.
  refresh-skills  Deprecated alias of sync.
`;

export async function main(argv) {
  const [command = "help", ...rest] = argv;
  const options = parseOptions(rest);

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(HELP);
    return;
  }

  if (command === "init") {
    await initCommand(options);
    return;
  }

  if (command === "sync") {
    await syncCommand(options);
    return;
  }

  if (command === "doctor") {
    await doctorCommand(options);
    return;
  }

  if (command === "refresh-skills") {
    await refreshSkillsCommand(options);
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}

function parseOptions(args) {
  const options = {
    cwd: process.cwd(),
    force: false,
    check: false,
    skipOpenspec: false,
    tools: ["codex", "claude", "cursor", "opencode"],
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--cwd") {
      options.cwd = args[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--cwd=")) {
      options.cwd = arg.slice("--cwd=".length);
      continue;
    }

    if (arg === "--force") {
      options.force = true;
      continue;
    }

    if (arg === "--check") {
      options.check = true;
      continue;
    }

    if (arg === "--skip-openspec") {
      options.skipOpenspec = true;
      continue;
    }

    if (arg === "--tools") {
      options.tools = parseTools(args[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith("--tools=")) {
      options.tools = parseTools(arg.slice("--tools=".length));
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function parseTools(value = "") {
  const supported = new Set(["codex", "claude", "cursor", "opencode"]);
  const tools = value
    .split(",")
    .map((tool) => tool.trim())
    .filter(Boolean);

  for (const tool of tools) {
    if (!supported.has(tool)) {
      throw new Error(`Unsupported tool "${tool}". Use codex, claude, cursor, opencode.`);
    }
  }

  return tools.length > 0 ? tools : ["codex", "claude", "cursor", "opencode"];
}
