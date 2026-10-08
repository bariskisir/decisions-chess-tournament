// Copies the pinned Stockfish 19 Lite browser engine into public assets.
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Resolves the lite-single worker shipped by the pinned stockfish package. */
async function findLiteWorker(bin: string): Promise<string> {
  const entries = await readdir(bin);
  const script = entries.find((name) => /-lite-single\.js$/.test(name));
  if (!script) throw new Error("Pinned stockfish package has no lite-single worker.");
  return script;
}

/** Copies the Stockfish 19 Lite worker, WASM binary, and license without modification. */
async function main(): Promise<void> {
  const require = createRequire(import.meta.url);
  const packageRoot = dirname(require.resolve("stockfish/package.json"));
  const bin = join(packageRoot, "bin");
  const script = await findLiteWorker(bin);
  const destination = fileURLToPath(new URL("../public/engine/", import.meta.url));
  await mkdir(destination, { recursive: true });
  await copyFile(join(bin, script), join(destination, "stockfish-19-lite-single.js"));
  await copyFile(join(bin, script.replace(/\.js$/, ".wasm")), join(destination, "stockfish-19-lite-single.wasm"));
  await copyFile(join(packageRoot, "Copying.txt"), join(destination, "Copying.txt"));
}

await main();
