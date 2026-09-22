/**
 * The plural polyfill, installed the way the phone gets it.
 *
 * Hermes has no `Intl.PluralRules`, so on the device every counted message
 * resolves through `@formatjs`'s — and that one knows only the languages whose
 * data `polyfills.ts` imports. A shipped language without data does not throw:
 * it resolves as English, and Russian reads *5 день*. Node has a native
 * `PluralRules`, so no other suite can see this; here the native one is taken
 * away first, which is the state Hermes starts in.
 */

import { LOCALES } from "@waltning/ui/i18n/locales";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("expo-crypto", () => ({ randomUUID: () => "00000000-0000-4000-8000-000000000000" }));

const native = Intl.PluralRules;

beforeAll(async () => {
  // Absent, not undefined: the polyfill checks `"PluralRules" in Intl`.
  delete (Intl as { PluralRules?: unknown }).PluralRules;
  await import("./polyfills.ts");
});

afterAll(() => {
  Object.defineProperty(Intl, "PluralRules", { value: native, configurable: true, writable: true });
});

describe("plural rules on a runtime that has none", () => {
  it("installs a polyfill in place of the missing one", () => {
    expect(Intl.PluralRules).toBeDefined();
    expect(Intl.PluralRules).not.toBe(native);
  });

  it.each(LOCALES)("carries %s's own rules rather than English's", (locale) => {
    expect(new Intl.PluralRules(locale).resolvedOptions().locale).toBe(locale);
  });

  it("declines Russian and Belarusian four ways", () => {
    for (const locale of ["ru", "be"]) {
      const rules = new Intl.PluralRules(locale);
      expect([1, 3, 5, 21].map((n) => rules.select(n))).toEqual(["one", "few", "many", "one"]);
    }
  });
});
