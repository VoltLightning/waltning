/** @vitest-environment jsdom */

import { render } from "@testing-library/react";
import { yearMonth } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";
import { Amount } from "../fx/amount";
import { en, type Messages } from "./en.ts";
import { decimalMark, LOCALES, monthLabel, resolveLocale } from "./locales.ts";
import { pl } from "./pl.ts";
import { I18nProvider } from "./provider";

describe("choosing a language", () => {
  /**
   * **The device's order, not ours.** Scanning `LOCALES` instead would hand a
   * phone that lists Polish before English the English catalogue, because
   * English happens to be first in our own list — a bug that is invisible to
   * anyone testing on an English phone, which is every phone in this repo's
   * test suite.
   */
  it("takes the first shipped language in the device's own order", () => {
    expect(resolveLocale(["pl-PL", "en-US"])).toBe("pl");
    expect(resolveLocale(["en-US", "pl-PL"])).toBe("en");
  });

  it("matches on the primary subtag, with or without a region", () => {
    expect(resolveLocale(["pl"])).toBe("pl");
    expect(resolveLocale(["PL-pl"])).toBe("pl");
  });

  /** A device set to a language nobody has translated, and a fresh install. */
  it("falls back to English rather than rendering keys", () => {
    expect(resolveLocale(["de-DE", "fr-FR"])).toBe("en");
    expect(resolveLocale([])).toBe("en");
  });
});

describe("the catalogues", () => {
  /**
   * The type already refuses a missing key, so this exists for what the type
   * cannot see: a key that is *present* and empty. `""` is a valid `string`,
   * compiles, and renders as a blank label — the one translation failure that
   * looks like a layout bug.
   */
  it("translates every English key into a non-empty Polish one", () => {
    for (const section of Object.keys(en) as (keyof Messages)[]) {
      const english = en[section] as Record<string, string>;
      const polish = pl[section] as Record<string, string>;

      expect(Object.keys(polish).sort(), `${section} has different keys`).toEqual(
        Object.keys(english).sort(),
      );
      for (const [key, value] of Object.entries(polish)) {
        expect(value.trim(), `${section}.${key} is blank`).not.toBe("");
      }
    }
  });

  /**
   * A placeholder that survives translation. `{{currency}}` renamed or dropped
   * in one language produces a sentence with a hole in it, at runtime, only in
   * that language — and the type cannot see inside the string.
   */
  it("keeps every interpolation placeholder in every language", () => {
    const placeholders = (value: string) => (value.match(/{{\w+}}/g) ?? []).sort();

    for (const section of Object.keys(en) as (keyof Messages)[]) {
      const english = en[section] as Record<string, string>;
      const polish = pl[section] as Record<string, string>;

      for (const [key, value] of Object.entries(english)) {
        expect(placeholders(polish[key] ?? ""), `${section}.${key}`).toEqual(placeholders(value));
      }
    }
  });

  it("ships exactly the languages it has catalogues for", () => {
    expect([...LOCALES].sort()).toEqual(["en", "pl"]);
  });
});

/**
 * **The group separator is fixed; the decimal mark is not.**
 * `design-system/04` §4.1 settles U+00A0 for every language and reasons that a
 * space group is unambiguous in both conventions this product meets — which
 * leaves the mark free to follow the reader, and means it must, because
 * `12 480.20` is not how a Polish reader writes a figure.
 */
describe("punctuating a figure", () => {
  const value = money.toMoney("12480.20");
  const normalise = (container: HTMLElement) => (container.textContent ?? "").replace(/ /g, " ");

  it("maps each language to its mark", () => {
    expect(decimalMark("en")).toBe(".");
    expect(decimalMark("pl")).toBe(",");
  });

  it("says the month in the reader's language — PeriodHeader's label (C2)", () => {
    expect(monthLabel(yearMonth("2026-08"), "en")).toBe("August 2026");
    expect(monthLabel(yearMonth("2026-08"), "pl")).toBe("sierpień 2026");
  });

  it("renders a dot in English and a comma in Polish", () => {
    const english = render(<Amount value={value} currency="PLN" />);
    expect(normalise(english.container)).toContain("12 480.20");
    english.unmount();

    const polish = render(
      <I18nProvider locale="pl">
        <Amount value={value} currency="PLN" />
      </I18nProvider>,
    );
    expect(normalise(polish.container)).toContain("12 480,20");
  });

  /**
   * The half that does **not** move. An `Intl.NumberFormat` here would take the
   * group separator with it — Polish groups with a space, English with a comma
   * — and silently overturn a decision §4.1 states in prose.
   */
  it("groups with a no-break space in both languages", () => {
    const polish = render(
      <I18nProvider locale="pl">
        <Amount value={value} currency="PLN" />
      </I18nProvider>,
    );
    expect(polish.container.textContent).toContain("12 480,20");
    expect(polish.container.textContent).not.toContain("12,480");
  });
});

/**
 * **Polish has four plural categories where English has two.**
 *
 * Nothing in the shipped catalogue takes a `count` yet, and this proves the
 * machinery before the first message that does — otherwise the first plural
 * added would be wrong in Polish and read as perfectly ordinary text to anyone
 * who does not speak it.
 *
 * What it proves here is i18next's **configuration**: Node has a real
 * `Intl.PluralRules`, so the resolver under test is the platform's. On the
 * device it is the polyfill in `apps/mobile/src/polyfills.ts` — Hermes ships no
 * `PluralRules` at all — and that half is only provable on a build.
 */
describe("plural categories", () => {
  it("gives Polish four forms where English has two", () => {
    expect(new Intl.PluralRules("en").select(1)).toBe("one");
    expect(new Intl.PluralRules("en").select(3)).toBe("other");
    expect(new Intl.PluralRules("en").select(5)).toBe("other");

    expect(new Intl.PluralRules("pl").select(1)).toBe("one");
    expect(new Intl.PluralRules("pl").select(3)).toBe("few");
    expect(new Intl.PluralRules("pl").select(5)).toBe("many");
  });

  /**
   * i18next builds its key suffixes from those categories, so this is the link
   * between the platform primitive above and the catalogue: a Polish message
   * with a `count` needs `_one` `_few` `_many` `_other`, and writing only the
   * English pair is the mistake this asserts against.
   */
  it("asks i18next for Polish's suffixes and gets four", () => {
    const instance = createInstance();
    void instance.init({ lng: "pl", fallbackLng: "en", resources: {}, initAsync: false });

    expect(instance.services.pluralResolver.getSuffixes("pl").sort()).toEqual([
      "_few",
      "_many",
      "_one",
      "_other",
    ]);
    expect(instance.services.pluralResolver.getSuffixes("en").sort()).toEqual(["_one", "_other"]);
  });
});
