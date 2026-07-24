# Orbit Harness

Orbit is a portable, dependency-free Node.js CLI (`bin/orbit.js`) that scaffolds
an OpenSpec-driven SDD agent harness into other projects. See `README.md` and
`docs/` for the product overview and design.

## Cursor Cloud specific instructions

- Runtime: Node.js `>=20` (see `package.json` `engines`). The VM ships a newer
  Node, which is fine.
- The repo itself has **no runtime/dev npm dependencies**, so no install is
  required to run or test the CLI. `node_modules/` only appears inside projects
  that `orbit init` scaffolds, not in this repo.
- Commands (all standard, defined in `package.json` / `src/cli.js`):
  - Test: `npm test` (runs `node --test` against `tests/orbit.test.js`).
  - Run the CLI: `node ./bin/orbit.js <help|init|doctor|sync|refresh-skills>`.
  - There is no lint or build step — this is a plain ESM CLI (`"type": "module"`).
- Non-obvious gotchas for the CLI's `init` command:
  - `orbit init` (without `--skip-openspec`) **requires network**: it runs
    `npm install --save-dev @fission-ai/openspec@latest` and `npx openspec init`
    in the target dir. Use `orbit init --skip-openspec` for a network-free,
    deterministic scaffold (this is what the test suite uses).
  - `init` writes into the **target** directory (`--cwd`), never the Orbit repo.
    Always point it at a scratch dir (e.g. `orbit init --cwd /tmp/demo`) so you
    don't scaffold harness files into this repo.
  - After `init`, verify with `node ./bin/orbit.js doctor --cwd <dir>` and
    `node ./bin/orbit.js sync --cwd <dir> --check` (exits non-zero on drift).
