/**
 * Fixture text for `known-failures.test.ts`'s own composition test.
 *
 * **Never imported, never run.** `vitest.config.ts` only collects
 * `tests/**\/*.test.ts`, and this file deliberately is not one — a temp file
 * in a directory the real glob doesn't cover would prove nothing, since
 * `inventoryOf` is handed a file path list directly, never a glob. This one
 * is read as plain text, exactly the way `inventoryOf` reads a real journey
 * or invariant file, so `known-failures.test.ts` can prove `allEntries` really
 * is the flatMap over the file list it is given: swap that flatMap for `[]`
 * and this fixture's own finding disappears from the result.
 *
 * Written as real, type-checked TypeScript anyway — `tests/tsconfig.json`
 * includes every `.ts` file under `tests/`, this one included — so a syntax
 * error here fails the gate the same way one in a real journey file would,
 * rather than being invisible because nothing ever imports it.
 */
import { it } from "vitest";

it.fails("R1 C1 — a fixture finding, read by inventoryOf but never executed", () => {
  throw new Error("unreachable — this file is never imported, only read as text");
});
