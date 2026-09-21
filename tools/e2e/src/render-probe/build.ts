/**
 * Bundles `probe.ts` into one script Playwright can inject.
 *
 * `bippy` ships ES modules and an init script is a classic script, so the
 * probe is bundled to an IIFE once per run. `esbuild` is already in the tree
 * (Vite's and tsx's own), so this adds a library and no toolchain.
 */

import { build } from "esbuild";

export async function buildProbe(outfile: string): Promise<string> {
  await build({
    entryPoints: [new URL("./probe.ts", import.meta.url).pathname],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    outfile,
    logLevel: "silent",
  });
  return outfile;
}
