import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// From `import.meta.url` (a string) rather than `new URL(...)`: this package
// compiles against the DOM lib, where `URL` is the DOM's and not Node's.
const srcDir = dirname(fileURLToPath(import.meta.url));

/**
 * **Every component in the package, found by walking — never by naming a
 * folder.**
 *
 * This read `read("atoms")`, a hardcoded directory. That worked while the
 * package was three tiers and would have gone silently green the moment
 * interactive components spread across domain folders: the floor and the focus
 * ring would have had nothing to scan, and Q3's decision would have lost its
 * enforcement without a single test turning red.
 *
 * It is the same defect this file's own header describes — a check rooted
 * somewhere narrower than the behaviour it governs — so it is fixed in the same
 * change that would have caused it.
 */
function components(dir = srcDir, out: { name: string; text: string }[] = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) components(full, out);
    else if (/\.tsx$/.test(entry) && !entry.includes(".test."))
      out.push({ name: entry, text: readFileSync(full, "utf8") });
  }
  return out;
}

const all = components();

/** Anything a person can press or type into, wherever it lives. */
const INTERACTIVE = /Pressable|TextInput/;

describe("the 44px floor, fixed at the source (§10)", () => {
  it("every interactive atom carries it", () => {
    const interactive = all.filter((c) => INTERACTIVE.test(c.text));
    const missing = interactive
      .filter((c) => !/touchTarget\.min|minHeight: 44/.test(c.text))
      .map((c) => c.name);

    expect(missing, "interactive components with no touch-target floor").toEqual([]);
    // Non-vacuous: if the walk ever stops finding components, this says so
    // rather than passing on an empty list.
    expect(interactive.length, "interactive components found").toBeGreaterThan(3);
  });
});

describe("the focus ring, on every interactive element (§2.6)", () => {
  it("is never omitted", () => {
    // "Never removed, never replaced by a colour change alone." A colour-only
    // focus state is invisible to exactly the people it exists for.
    const interactive = all.filter((c) => INTERACTIVE.test(c.text));
    const missing = interactive.filter((c) => !/focus\./.test(c.text)).map((c) => c.name);

    expect(missing, "interactive components with no focus ring").toEqual([]);
    expect(interactive.length, "interactive components found").toBeGreaterThan(3);
  });
});
