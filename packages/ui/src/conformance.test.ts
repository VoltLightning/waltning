/**
 * The rules §2, §3 and §10 fix once — checked at the source, because they are
 * not observable anywhere else.
 *
 * react-native-web compiles styles into atomic classes (`r-minHeight-peo1c`),
 * so a rendered component does not expose the *value* of its own tokens. A DOM
 * assertion can prove a declaration exists and never that it says 44.
 *
 * That makes source the right level, and arguably the better one: what D1
 * actually promises is that the floor is fixed **at the source** rather than on
 * thirty screens. This is that promise, stated as a test.
 *
 * **Scoped to this package on purpose, and only what is genuinely local.** The
 * colour and money rules used to live here too, rooted at `packages/ui/src` —
 * and the app then hardcoded `#b3261e`, the exact colour `tokens.ts` names as
 * its motivating defect, entirely unseen. Those two moved to
 * `tests/architecture.test.ts` where they scan the repository. What stays here
 * is the touch floor and the focus ring, which are properties of *primitives*
 * and have no meaning outside this package.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// From `import.meta.url` (a string) rather than `new URL(...)`: this package
// compiles against the DOM lib, where `URL` is the DOM's and not Node's, and
// the two are not interchangeable at the `fileURLToPath` boundary.
const srcDir = dirname(fileURLToPath(import.meta.url));

function read(folder: string): { name: string; text: string }[] {
  const dir = join(srcDir, folder);
  return readdirSync(dir)
    .filter((f) => /\.tsx$/.test(f) && !f.includes(".test."))
    .map((name) => ({ name, text: readFileSync(join(dir, name), "utf8") }));
}

const atoms = read("atoms");

/** Anything a person can press or type into. `Tag` and `Pill` are static. */
const INTERACTIVE = /Pressable|TextInput/;

describe("the 44px floor, fixed at the source (§10)", () => {
  it("every interactive atom carries it", () => {
    const missing = atoms
      .filter((a) => INTERACTIVE.test(a.text))
      .filter((a) => !/touchTarget\.min|minHeight: 44/.test(a.text))
      .map((a) => a.name);

    expect(missing, "interactive atoms with no touch-target floor").toEqual([]);
    // Non-vacuous: if the filter ever stops matching, this says so rather than
    // passing on an empty list.
    expect(atoms.filter((a) => INTERACTIVE.test(a.text)).length).toBeGreaterThan(3);
  });
});

describe("the focus ring, on every interactive element (§2.6)", () => {
  it("is never omitted", () => {
    // "Never removed, never replaced by a colour change alone." A colour-only
    // focus state is invisible to exactly the people it exists for.
    const missing = atoms
      .filter((a) => INTERACTIVE.test(a.text))
      .filter((a) => !/focus\./.test(a.text))
      .map((a) => a.name);

    expect(missing, "interactive atoms with no focus ring").toEqual([]);
  });
});
