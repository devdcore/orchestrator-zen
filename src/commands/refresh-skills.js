// Deprecated alias of `orbit sync`.
//
// refresh-skills used to rebuild only the index and registry by scanning the platform dirs.
// That made it possible for the index to disagree with what sync would generate. `orbit sync`
// now owns every derived artifact (skill copies, agent frontmatter, routing block, index,
// registry) from the canonical sources, so this command simply delegates to it.

import { syncCommand } from "./sync.js";

export async function refreshSkillsCommand(options) {
  console.log("orbit refresh-skills is deprecated — running `orbit sync` instead.\n");
  await syncCommand(options);
}
