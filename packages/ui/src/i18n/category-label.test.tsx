/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { seedNames } from "@waltning/core/seed-label";
import { expect, it } from "vitest";
import { categoryTintKey } from "./category-label.ts";
import type { Locale } from "./locales.ts";
import { catalogues, LOCALES } from "./locales.ts";
import { I18nProvider } from "./provider";
import { useCategoryLabel } from "./use-category-label.ts";

type Row = { name: string; externalId: string | null };

function Label({ row }: { row: Row }) {
  const labelOf = useCategoryLabel();
  return <span data-testid="label">{labelOf(row)}</span>;
}

function shown(locale: Locale, row: Row): string {
  const { unmount } = render(
    <I18nProvider locale={locale}>
      <Label row={row} />
    </I18nProvider>,
  );
  const text = screen.getByTestId("label").textContent ?? "";
  unmount();
  return text;
}

it("a starter category with its canonical name reads in the app's language", () => {
  expect(shown("de", { name: "Salary", externalId: "seed:salary" })).toBe("Gehalt");
  expect(shown("pl", { name: "Salary", externalId: "seed:salary" })).toBe("Wynagrodzenie");
  expect(shown("ru", { name: "Salary", externalId: "seed:salary" })).toBe("Заработная плата");
  expect(shown("be", { name: "Salary", externalId: "seed:salary" })).toBe("Заработная плата");
  expect(shown("en", { name: "Salary", externalId: "seed:salary" })).toBe("Salary");
});

it("Uncategorized and the groups translate too", () => {
  expect(shown("de", { name: "Uncategorized", externalId: "seed:uncategorized" })).toBe(
    "Ohne Kategorie",
  );
  expect(shown("de", { name: "Employment", externalId: "seed:employment" })).toBe("Beruf");
});

it("a renamed starter is the person's own text and does not translate", () => {
  expect(shown("de", { name: "Pay", externalId: "seed:salary" })).toBe("Pay");
});

it("a category that is not a starter reads as stored, even under a starter's name", () => {
  expect(shown("de", { name: "Salary", externalId: null })).toBe("Salary");
  expect(shown("de", { name: "Padel", externalId: null })).toBe("Padel");
});

it("a language change re-labels the same row", () => {
  const row = { name: "Groceries", externalId: "seed:groceries" };
  expect(shown("de", row)).toBe("Lebensmittel");
  expect(shown("ru", row)).toBe("Продукты");
});

it("every group, leaf and Uncategorized has a native name in every catalogue", () => {
  for (const locale of LOCALES) {
    const block: Record<string, string> = catalogues[locale].taxonomy;
    for (const [key, canonical] of seedNames) {
      const words = block[key];
      expect(words, `${locale}.taxonomy.${key}`).toBeTruthy();
      if (locale === "en") expect(words).toBe(canonical);
    }
    expect(Object.keys(block).sort()).toEqual([...seedNames.keys()].sort());
  }
});

it("a starter's colour is hashed from its seed tag, so a language change never repaints it", () => {
  expect(categoryTintKey({ name: "Gehalt", externalId: "seed:salary" })).toBe("seed:salary");
  expect(categoryTintKey({ name: "Padel", externalId: null })).toBe("Padel");
});
