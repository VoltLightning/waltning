import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode, toMoney } from "@waltning/core/money";
import { describe, expect, it, vi } from "vitest";
import type {
  PhoneContextRow,
  PhoneContextRowsQuery,
  PhoneTransactionDetail,
} from "../create-phone-ledger/create-phone-ledger.ts";
import { readTransactionContext, type TransactionContextLedger } from "./transaction-context.ts";

const PLN = currencyCode("PLN");
const CASH = id<"accounts">("11111111-1111-4111-8111-111111111111");
const SAVINGS = id<"accounts">("22222222-2222-4222-8222-222222222222");
const CAFE = id<"counterparties">("33333333-3333-4333-8333-333333333333");
const EATING_OUT = id<"categories">("44444444-4444-4444-8444-444444444444");
const GROCERIES = id<"categories">("66666666-6666-4666-8666-666666666666");
const SELF = id<"transactions">("55555555-5555-4555-8555-555555555555");

let sequence = 0;
function row(date: string, amount: string, overrides: Partial<PhoneContextRow> = {}) {
  sequence += 1;
  return {
    id: id<"transactions">(`00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`),
    date: accountingDate(date),
    amountOriginal: toMoney(amount),
    isCapital: false,
    ...overrides,
  } satisfies PhoneContextRow;
}

/** Honours the window, as the reader does in SQL; everything else is the rows given. */
function reading(rows: readonly PhoneContextRow[]) {
  return vi.fn((query: PhoneContextRowsQuery) =>
    rows.filter((candidate) => candidate.date >= query.from && candidate.date <= query.to),
  );
}

function detail(overrides: Partial<PhoneTransactionDetail> = {}): PhoneTransactionDetail {
  return {
    id: SELF,
    date: accountingDate("2026-03-12"),
    type: "expense",
    enteredName: "Café A",
    note: "",
    isBusiness: false,
    accountId: CASH,
    accountName: "Cash",
    toAccountId: null,
    toAccountName: null,
    categoryId: null,
    categoryName: null,
    counterpartyId: CAFE,
    counterpartyIdentityName: "Café A",
    obligationCounterpartyId: null,
    counterpartyName: null,
    obligationRole: null,
    isCapital: false,
    brandKey: null,
    amount: toMoney("-48.90"),
    currency: PLN,
    decimals: 2,
    version: 1,
    lines: [],
    ...overrides,
  };
}

const noSpend: TransactionContextLedger["readSpendByCategory"] = () => [];

describe("readTransactionContext — Who", () => {
  it("draws the transaction's own month and the five before it, not today's", () => {
    const readContextRows = reading([
      row("2025-10-03", "10"),
      row("2026-01-15", "20"),
      row("2026-03-01", "30"),
      row("2026-03-12", "48.90", { id: SELF }),
      row("2026-04-02", "999"),
    ]);
    const [card] = readTransactionContext(
      { readContextRows, readSpendByCategory: noSpend },
      detail(),
    );
    if (card?.kind !== "who") throw new Error("expected a Who card");
    expect(readContextRows).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "who",
        counterpartyId: CAFE,
        type: "expense",
        from: "2025-10-01",
        to: "2026-03-31",
      }),
    );
    expect(card.months.map((m) => m.month)).toEqual([
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    expect(card.months.map((m) => m.total)).toEqual(
      ["10", "0", "0", "20", "0", "78.9"].map((v) => toMoney(v)),
    );
    expect(card.count).toBe(2);
    expect(card.share).toBe(toMoney("48.90"));
    expect(card.oneOffsLeftOut).toBe(false);
  });

  it("leaves other one-offs out and says so (§5)", () => {
    const readContextRows = reading([
      row("2026-03-02", "10"),
      row("2026-03-03", "500", { isCapital: true }),
      row("2026-03-12", "48.90", { id: SELF }),
    ]);
    const [card] = readTransactionContext(
      { readContextRows, readSpendByCategory: noSpend },
      detail(),
    );
    if (card?.kind !== "who") throw new Error("expected a Who card");
    expect(card.months.at(-1)?.total).toBe(toMoney("58.90"));
    expect(card.count).toBe(2);
    expect(card.oneOffsLeftOut).toBe(true);
    expect(card.ownOneOff).toBe(false);
  });

  it("has no share when this row is a one-off, and says it is", () => {
    const readContextRows = reading([
      row("2026-03-02", "10"),
      row("2026-03-12", "500", { id: SELF, isCapital: true }),
    ]);
    const [card] = readTransactionContext(
      { readContextRows, readSpendByCategory: noSpend },
      detail({ isCapital: true, amount: toMoney("-500") }),
    );
    if (card?.kind !== "who") throw new Error("expected a Who card");
    expect(card.share).toBeNull();
    expect(card.ownOneOff).toBe(true);
    expect(card.oneOffsLeftOut).toBe(false);
  });

  /** H2 — the share is the window's own row, never the screen's older copy. */
  it("takes the share from the same read as the bars", () => {
    const readContextRows = reading([row("2026-03-12", "10", { id: SELF })]);
    const [card] = readTransactionContext(
      { readContextRows, readSpendByCategory: noSpend },
      detail({ amount: toMoney("-48.90") }),
    );
    if (card?.kind !== "who") throw new Error("expected a Who card");
    expect(card.share).toBe(toMoney("10"));
    expect(card.months.at(-1)?.total).toBe(toMoney("10"));
  });

  it("offers to link a counterparty when there is none", () => {
    const readContextRows = reading([]);
    const cards = readTransactionContext(
      { readContextRows, readSpendByCategory: noSpend },
      detail({ counterpartyId: null }),
    );
    expect(cards).toEqual([{ kind: "link" }]);
    expect(readContextRows).not.toHaveBeenCalled();
  });
});

describe("readTransactionContext — Category", () => {
  function spending(byMonth: Record<string, string>, capitalByMonth: Record<string, string> = {}) {
    return vi.fn(
      (
        period: { start: string },
        _scope: string,
        options?: { excludeCapital?: boolean },
      ): ReturnType<TransactionContextLedger["readSpendByCategory"]> => {
        const base = byMonth[period.start];
        if (base === undefined) return [];
        const amount = options?.excludeCapital
          ? toMoney(base)
          : money.add(toMoney(base), toMoney(capitalByMonth[period.start] ?? "0"));
        return [{ currency: PLN, decimals: 2, categoryId: EATING_OUT, amount }];
      },
    );
  }

  it("sets the month against the mean of the previous three that held anything", () => {
    const readSpendByCategory = spending({
      "2026-03-01": "312.60",
      "2026-02-01": "400",
      "2025-12-01": "200",
    });
    const cards = readTransactionContext(
      { readContextRows: reading([]), readSpendByCategory },
      detail({ categoryId: EATING_OUT }),
    );
    const card = cards.find((candidate) => candidate.kind === "category");
    if (card?.kind !== "category") throw new Error("expected a Category card");
    expect(card.spent).toBe(toMoney("312.60"));
    expect(card.usual).toBe(toMoney("300"));
    expect(card.share).toBe(toMoney("48.90"));
    expect(card.oneOffsLeftOut).toBe(false);
  });

  it("says when a one-off in the month was left out", () => {
    const readSpendByCategory = spending({ "2026-03-01": "100" }, { "2026-03-01": "900" });
    const cards = readTransactionContext(
      { readContextRows: reading([]), readSpendByCategory },
      detail({ categoryId: EATING_OUT }),
    );
    const card = cards.find((candidate) => candidate.kind === "category");
    if (card?.kind !== "category") throw new Error("expected a Category card");
    expect(card.oneOffsLeftOut).toBe(true);
  });

  /** H1 — a negative line nets inside the share, exactly as §6 nets it in the bar. */
  it("nets signed lines, so the share is never more than the fold gives", () => {
    const readSpendByCategory = spending({ "2026-03-01": "100" });
    const cards = readTransactionContext(
      { readContextRows: reading([]), readSpendByCategory },
      detail({
        amount: toMoney("-100"),
        categoryId: EATING_OUT,
        lines: [line("130", EATING_OUT), line("-30", EATING_OUT)],
      }),
    );
    const card = cards.find((candidate) => candidate.kind === "category");
    if (card?.kind !== "category") throw new Error("expected a Category card");
    expect(card.share).toBe(toMoney("100"));
  });

  it("draws no slice when a lined row nets to nothing or less in the category", () => {
    const readSpendByCategory = spending({ "2026-03-01": "40" });
    const cards = readTransactionContext(
      { readContextRows: reading([]), readSpendByCategory },
      detail({
        amount: toMoney("-70"),
        categoryId: EATING_OUT,
        lines: [line("50", EATING_OUT), line("80", GROCERIES), line("-60", EATING_OUT)],
      }),
    );
    const card = cards.find((candidate) => candidate.kind === "category");
    if (card?.kind !== "category") throw new Error("expected a Category card");
    expect(card.share).toBeNull();
    expect(card.ownOneOff).toBe(false);
  });

  /** L3 — §6 ignores a lined row's own category, and so does the card. */
  it("reads a lined row through its lines when none carries its own category", () => {
    const cards = readTransactionContext(
      { readContextRows: reading([]), readSpendByCategory: noSpend },
      detail({
        categoryId: null,
        lines: [line("18.90", EATING_OUT), line("30", GROCERIES)],
      }),
    );
    const card = cards.find((candidate) => candidate.kind === "category");
    if (card?.kind !== "category") throw new Error("expected a Category card");
    expect(card.categoryId).toBe(GROCERIES);
    expect(card.share).toBe(toMoney("30"));
  });

  it("has no usual with no earlier month", () => {
    const cards = readTransactionContext(
      { readContextRows: reading([]), readSpendByCategory: spending({ "2026-03-01": "60" }) },
      detail({ categoryId: EATING_OUT }),
    );
    const card = cards.find((candidate) => candidate.kind === "category");
    if (card?.kind !== "category") throw new Error("expected a Category card");
    expect(card.usual).toBeNull();
  });

  it("is not drawn for income, which has no category breakdown", () => {
    const readSpendByCategory = vi.fn(noSpend);
    const cards = readTransactionContext(
      { readContextRows: reading([]), readSpendByCategory },
      detail({ type: "income", amount: toMoney("100"), categoryId: EATING_OUT }),
    );
    expect(cards.map((card) => card.kind)).toEqual(["who"]);
    expect(readSpendByCategory).not.toHaveBeenCalled();
  });
});

describe("readTransactionContext — Pair", () => {
  it("asks for moves between the same two accounts, in this direction", () => {
    const readContextRows = reading([
      row("2026-03-01", "100", { id: SELF }),
      row("2026-02-10", "200"),
    ]);
    const cards = readTransactionContext(
      { readContextRows, readSpendByCategory: noSpend },
      detail({
        type: "transfer",
        amount: toMoney("-100"),
        toAccountId: SAVINGS,
        counterpartyId: null,
      }),
    );
    expect(readContextRows).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "pair", accountId: CASH, toAccountId: SAVINGS }),
    );
    const [card] = cards;
    if (card?.kind !== "pair") throw new Error("expected a Pair card");
    expect(card.count).toBe(1);
    expect(card.months.slice(-2).map((m) => m.total)).toEqual([toMoney("200"), toMoney("100")]);
  });

  it("draws nothing for an adjustment", () => {
    expect(
      readTransactionContext(
        { readContextRows: reading([]), readSpendByCategory: noSpend },
        detail({ type: "adjustment" }),
      ),
    ).toEqual([]);
  });
});

function line(amount: string, categoryId: PhoneTransactionDetail["lines"][number]["categoryId"]) {
  sequence += 1;
  return {
    id: id<"transactionLines">(`77777777-7777-4777-8777-${String(sequence).padStart(12, "0")}`),
    description: "",
    amount: toMoney(amount),
    categoryId,
    categoryName: null,
  };
}
