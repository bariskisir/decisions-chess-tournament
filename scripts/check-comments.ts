// Verifies that project-owned TypeScript files carry the required English header comment.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/** Collects every owned TypeScript source file under the given directory. */
async function collect(directory: string, output: string[]): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = join(directory, entry.name);
    if (entry.isDirectory()) await collect(full, output);
    else if (/\.tsx?$/.test(entry.name)) output.push(full);
  }
}

/** Requires a leading line comment in every owned source file. */
async function main(): Promise<void> {
  const files: string[] = [];
  for (const root of ["src", "scripts", "tests"]) {
    try {
      await collect(root, files);
    } catch {
      continue;
    }
  }
  const missing = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    if (!text.startsWith("//")) missing.push(file);
  }
  if (missing.length) {
    console.error(`Missing header comment in:\n${missing.join("\n")}`);
    process.exit(1);
  }
}

await main();
