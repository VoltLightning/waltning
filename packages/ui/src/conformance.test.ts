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
 * thirty screens. This is that promise, stated as a test — and it catches the
 * regression that matters, which is a new control written without it.
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
const molecules = read("molecules");
const organisms = read("organisms");

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

describe("tokens are the only source of colour (§2.1)", () => {
  it("no component hardcodes a hex", () => {
    // The dashboard hardcoded `#b3261e` for a negative balance — a colour that
    // appears nowhere in `02-tokens.md`. This is what stops the next one.
    const offenders: string[] = [];
    for (const file of [...atoms, ...molecules, ...organisms]) {
      for (const line of file.text.split("\n")) {
        // Comments may quote a token's value; code may not write one.
        if (/^\s*(\*|\/\/)/.test(line)) continue;
        if (/#[0-9a-fA-F]{3,8}\b/.test(line)) offenders.push(`${file.name}: ${line.trim()}`);
      }
    }
    expect(offenders, "hardcoded colours — use a token from tokens.ts").toEqual([]);
  });
});

describe("every amount renders through Amount (§2.2)", () => {
  it("no molecule formats money itself", () => {
    // `money.toMoney` outside `Amount` is a figure with no guarantee of tabular
    // numerals — the omission §2.2 names as the most common, and the reason a
    // column of amounts fails to line up.
    const offenders = molecules
      .filter((m) => !/^amount\.tsx$/.test(m.name))
      .filter((m) => /money\.toMoney/.test(m.text))
      // `FxAmount` renders the *rate*, which is not an amount, and
      // `TransferAmount` renders the spread through its own `Text` for the
      // same reason. Both use `Amount` for every actual figure.
      .filter((m) => !/fx-amount\.tsx|transfer-amount\.tsx/.test(m.name))
      .map((m) => m.name);

    expect(offenders, "molecules formatting money outside Amount").toEqual([]);
  });
});
