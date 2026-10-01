import { describe, expect, it, vi } from "vitest";
import { DEMO_NAMES, type DemoLocale } from "./demo-names.ts";
import { DEMO_ACCOUNTS, DEMO_COUNTERPARTIES, DEMO_DEBTS, demoTransactions } from "./demo-plan.ts";
import { type DemoTarget, loadDemo } from "./load-demo.ts";

const TODAY = "2026-09-18";
const CYRILLIC = /\p{Script=Cyrillic}/u;
const LOCALES: readonly DemoLocale[] = ["en", "pl", "de", "ru", "be"];

function target(): DemoTarget {
  let next = 0;
  const id = () => {
    next += 1;
    return `id-${next}`;
  };
  return {
    createAccount: vi.fn(() => ({ id: id() })),
    createCategory: vi.fn(() => ({ id: id() })),
    createTransaction: vi.fn(() => ({ id: id() })),
    createCounterparty: vi.fn(() => ({ id: id() })),
    settleDebt: vi.fn(() => ({ id: id() })),
    convertCategory: vi.fn(() => ({ id: id() })),
    setManualRate: vi.fn(() => ({ written: 1 })),
    existingCategories: [],
    pivot: "USD",
  };
}

/** Every name the loader wrote that a person reads: accounts, people, and the row names. */
async function namesLoadedIn(locale: DemoLocale) {
  const t = target();
  await loadDemo(t, TODAY, 2, undefined, locale);
  return {
    accounts: vi.mocked(t.createAccount).mock.calls.map(([draft]) => draft.name),
    people: vi.mocked(t.createCounterparty).mock.calls.map(([draft]) => draft.name),
    rows: vi.mocked(t.createTransaction).mock.calls.map(([draft]) => draft.enteredName),
  };
}

describe("the demo is named in the app's language", () => {
  it("has no Cyrillic anywhere in a German demo", async () => {
    const { accounts, people, rows } = await namesLoadedIn("de");
    for (const name of [...accounts, ...people, ...rows]) {
      expect(name, `"${name}" in the German demo`).not.toMatch(CYRILLIC);
    }
  });

  it("has no Cyrillic in a Polish or English demo either", async () => {
    for (const locale of ["pl", "en"] as const) {
      const { accounts, people, rows } = await namesLoadedIn(locale);
      for (const name of [...accounts, ...people, ...rows]) {
        expect(name, `"${name}" in the ${locale} demo`).not.toMatch(CYRILLIC);
      }
    }
  });

  it("writes Russian people and accounts in a Russian demo", async () => {
    const { accounts, people } = await namesLoadedIn("ru");
    expect(
      people.filter((name) => !CYRILLIC.test(name)),
      "every person is written in Cyrillic; only the company keeps its Latin name",
    ).toEqual(["Studio B"]);
    expect(
      accounts.every((name) => CYRILLIC.test(name)),
      "accounts too",
    ).toBe(true);
  });

  it("names every person in the language's own table, never the plan's fallback by accident", () => {
    for (const locale of LOCALES) {
      for (const person of DEMO_COUNTERPARTIES.filter((c) => c.kind === "person")) {
        expect(
          DEMO_NAMES[locale].counterparties[person.ref],
          `${person.ref} in ${locale}`,
        ).toBeDefined();
      }
      for (const account of DEMO_ACCOUNTS) {
        expect(
          DEMO_NAMES[locale].accounts[account.ref],
          `${account.ref} in ${locale}`,
        ).toBeDefined();
      }
    }
  });

  it("names every debt note in every language", () => {
    for (const locale of ["pl", "de", "ru", "be"] as const) {
      for (const debt of DEMO_DEBTS) {
        expect(
          DEMO_NAMES[locale].text[debt.enteredName],
          `${debt.enteredName} in ${locale}`,
        ).toBeDefined();
      }
    }
  });
});

/** Public repo: no real brand is named anywhere in the demo, in any language. */
describe("the demo names no real brand", () => {
  const BRANDS = [
    "netflix",
    "spotify",
    "youtube",
    "uber",
    "ikea",
    "anthropic",
    "lidl",
    "żabka",
    "orlen",
    "allegro",
  ];

  it("in the plan, or in any language's table", () => {
    const words: string[] = [
      ...DEMO_ACCOUNTS.map((a) => a.name),
      ...DEMO_COUNTERPARTIES.map((c) => c.name),
      ...DEMO_DEBTS.map((d) => d.enteredName),
      ...demoTransactions(TODAY, 3).map((r) => r.enteredName),
    ];
    for (const locale of LOCALES) {
      const names = DEMO_NAMES[locale];
      words.push(
        ...Object.values(names.accounts),
        ...Object.values(names.counterparties),
        ...Object.values(names.text),
      );
    }
    for (const word of words) {
      for (const brand of BRANDS) expect(word.toLowerCase(), word).not.toContain(brand);
    }
  });
});

describe("the structure does not depend on the language", () => {
  /** What the tests and the screens rely on: refs, amounts, dates, types — never a name. */
  function shape(locale: DemoLocale) {
    return demoTransactions(TODAY, 26, locale).map((row) => ({
      account: row.account,
      toAccount: row.toAccount,
      category: row.category,
      type: row.type,
      amount: row.amount,
      date: row.date,
    }));
  }

  it("keeps every ref, amount, date and type identical across the five languages", () => {
    const english = shape("en");
    for (const locale of LOCALES) expect(shape(locale), locale).toEqual(english);
  });

  it("writes the same number of accounts, people and rows in each", async () => {
    const english = await namesLoadedIn("en");
    for (const locale of LOCALES) {
      const loaded = await namesLoadedIn(locale);
      expect(loaded.accounts, locale).toHaveLength(english.accounts.length);
      expect(loaded.people, locale).toHaveLength(english.people.length);
      expect(loaded.rows, locale).toHaveLength(english.rows.length);
    }
  });
});
