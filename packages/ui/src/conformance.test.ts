import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { light, type Theme, themes } from "./theme/roles.ts";

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

describe("a component names a role, never a colour (`theme/roles.ts`)", () => {
  /**
   * **The check that keeps the theme layer a theme layer.**
   *
   * Roles and a provider make re-theming a one-file change; nothing about them
   * stops the next component reaching past a role and writing a value. That
   * regression is invisible — the screen looks right in the theme it was
   * written in, and wrong in the other one, months later, on a screen nobody
   * opened during the change.
   *
   * `tokens.ts`'s own header records the original instance: the dashboard
   * hardcoded `#b3261e` for a negative balance, a colour that appears nowhere
   * in the palette. That was at n=2 components. This is the check that would
   * have caught it.
   */
  it("no component reaches into the palette", () => {
    const offenders = all
      .filter(
        (c) =>
          /\bcolor\./.test(c.text) ||
          /from "(\.\.\/)*tokens\.ts";?[\s\S]{0,80}\bcolor\b/.test(c.text),
      )
      .map((c) => c.name);

    expect(offenders, "components naming a palette entry instead of a role").toEqual([]);
    expect(all.length, "components found").toBeGreaterThan(8);
  });

  it("no component writes a colour literal", () => {
    /**
     * Hex, `rgb(`/`rgba(`, and the CSS named colours that actually get typed.
     *
     * **`"transparent"` is deliberately absent**, and it is the one exclusion
     * worth arguing for: it is the *absence* of a fill rather than a colour, so
     * there is no theme in which it could sensibly be anything else. Making it a
     * role would mean adding an entry whose value is identical in every theme —
     * which is not a role, it is a constant with extra steps, and every future
     * theme would have to restate it to say nothing.
     *
     * `white` and `black` get no such exemption. They read as neutral and are
     * the two values most likely to be wrong in the other theme.
     */
    const LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|["'](?:white|black|red)["']/;

    const offenders = all
      .filter((c) => LITERAL.test(c.text.replace(/^\s*\*.*$/gm, "")))
      .map((c) => c.name);

    expect(offenders, "components with a colour literal").toEqual([]);
  });
});

describe("every theme answers for every role", () => {
  /**
   * The `Theme` type is a closed record, so a theme missing a role does not
   * compile — which covers the honest mistake and not the cast. A role read as
   * `undefined` renders transparent or black, and that reads as a styling slip
   * on the one screen someone happens to be looking at: it gets fixed there,
   * locally, and stays broken everywhere else that uses the same role.
   *
   * So the roles are enumerated from the theme that is known complete, and
   * every other theme is checked against it — which is also what makes adding
   * `dark` safe rather than hopeful.
   */
  it("no role is missing or empty in any theme", () => {
    type ColorRole = Exclude<keyof Theme, "elevation">;
    const roles = Object.keys(light).filter((role): role is ColorRole => role !== "elevation");
    expect(roles.length, "roles found").toBeGreaterThan(15);

    const holes: string[] = [];
    for (const [name, theme] of Object.entries(themes)) {
      for (const role of roles) {
        if (!theme[role]) holes.push(`${name}.${String(role)}`);
      }
      for (const level of ["card", "raised", "frame"] as const) {
        const elevation = theme.elevation[level];
        if (!elevation.shadowColor || !elevation.borderColor) {
          holes.push(`${name}.elevation.${level}`);
        }
      }
    }

    expect(holes, "roles a theme does not answer for").toEqual([]);
  });
});

describe("a component names a scale step, never a size (§2.2)", () => {
  /**
   * The sibling of the colour rule, and it holds **today**: no component writes
   * a raw `fontSize`, every one goes through `type.*`. That is the cheapest
   * moment to pin a rule — a check added while the count is zero never has to
   * argue with an existing exception, and the exception is how these decay.
   */
  it("no component writes a font size or line height literal", () => {
    const LITERAL = /\b(fontSize|lineHeight):\s*[\d.]/;

    const offenders = all
      .filter((c) => LITERAL.test(c.text.replace(/^\s*\*.*$/gm, "")))
      .map((c) => c.name);

    expect(offenders, "components with a hardcoded size").toEqual([]);
    expect(all.length, "components found").toBeGreaterThan(8);
  });

  /**
   * **A step is four properties, and every call site was taking one.**
   *
   * The sibling rule above holds that a component names a step rather than a
   * size — and it passed for the whole life of the design system while the
   * scale was, in practice, unenforced. `type.body.fontSize` names a step and
   * takes only its size, so `lineHeightRatio` reached exactly one component out
   * of twenty and the negative tracking §2.2 spends a paragraph justifying
   * reached none: the 54pt headline total rendered at the platform's default
   * leading with no tracking at all.
   *
   * That is the failure mode a design system is for. Nothing looked broken —
   * it looked *slightly wrong*, which never gets reported and never gets fixed.
   *
   * So the unit is the step: `text.ui("body")`, `text.display("displayHero")`,
   * `text.mono("caption")`. Reaching into a step for one of its fields is what
   * this refuses.
   */
  it("a component takes the whole step, never one of its fields", () => {
    const FIELD = /\btype\.\w+\.(fontSize|lineHeightRatio|letterSpacing|weight)\b/;

    const offenders = all
      .filter((c) => FIELD.test(c.text.replace(/^\s*\*.*$/gm, "")))
      .map((c) => c.name);

    expect(offenders, "components reaching into a scale step").toEqual([]);
    expect(all.length, "components found").toBeGreaterThan(8);
  });

  /**
   * **A family plus a weight does not select a face in React Native.** Each
   * weight is its own file registered under its own name, so `fontFamily:
   * "Figtree"` with `fontWeight: "600"` finds no such family — it falls back, or
   * synthesises a bold from the regular, which is a smeared approximation of the
   * semibold sitting unused in the bundle. Both are silent; the second looks
   * nearly right.
   *
   * So a component asks for a face by name, through `face.ui(600)`, and never
   * writes a family string of its own.
   */
  it("no component writes a font family string", () => {
    const offenders = all
      .filter((c) => /fontFamily:\s*["']/.test(c.text.replace(/^\s*\*.*$/gm, "")))
      .map((c) => c.name);

    expect(offenders, "components naming a font family directly").toEqual([]);
  });
});
