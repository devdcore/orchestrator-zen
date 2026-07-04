import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

export async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

export async function readText(path) {
  return readFile(path, "utf8");
}

export async function writeText(path, content) {
  await ensureDir(dirname(path));
  await writeFile(path, content, "utf8");
}

export async function writeFileIfAbsent(path, content, { force = false } = {}) {
  let existed = false;

  try {
    await readText(path);
    existed = true;
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  if (existed && !force) {
    return { path, action: "skipped" };
  }

  await writeText(path, content);
  return { path, action: existed ? "overwritten" : "created" };
}

export async function upsertGitignoreLine(root, line) {
  const path = join(root, ".gitignore");
  let content = "";

  try {
    content = await readText(path);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  const lines = content.split(/\r?\n/).filter((item, index, array) => {
    return !(item === "" && index === array.length - 1);
  });

  if (!lines.includes(line)) {
    lines.push(line);
    await writeText(path, `${lines.join("\n")}\n`);
    return { path, action: "updated" };
  }

  return { path, action: "unchanged" };
}

export function rel(root, path) {
  return relative(root, path) || ".";
}
