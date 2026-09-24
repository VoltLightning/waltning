import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { currencyCode, type Money, toMoney } from "@waltning/core/money";
import { describe, expect, it, vi } from "vitest";
import type {
  PhoneSearchCursor,
  PhoneSearchTransaction,
  PhoneTransactionDetail,
  TransactionFilterDraft,
  TransactionSearchCursorDraft,
} from "../create-phone-ledger/create-phone-ledger.ts";
import { readTransactionContext, type TransactionContextLedger } from "./transaction-context.ts";

const PLN = currencyCode("PLN");
const EUR = currencyCode("EUR");
const CASH = id<"accounts">("11111111-1111-4111-8111-111111111111");
const SAVINGS = id<"accounts">("22222222-2222-4222-8222-222222222222");
const CAFE = id<"counterparties">("33333333-3333-4333-8333-333333333333");
const EATING_OUT = id<"categories">("44444444-4444-4444-8444-444444444444");

let sequence = 0;
function row(
  date: string,
  amount: string,
  overrides: Partial<PhoneSearchTransaction> = {},
): PhoneSearchTransaction {
  sequence += 1;
  return {
    id: id<"transactions">(`00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`),
    date: accountingDate(date),
    type: "expense",
    enteredName: "Café A",
    note: "",
    categoryName: null,
    brandKey: null,
    accountId: CASH,
    accountName: "Cash",
    toAccountId: null,
    toAccountName: null,
    amount: toMoney(amount),
    currency: PLN,
    decimals: 2,
    fxRate: "1" as PhoneSearchTransaction["fxRate"],
    fxRateEstimated: false,
    toAmount: null,
    toFxRate: null,
    toCurrency: null,
    toDecimals: null,
    isBusiness: false,
    isCapital: false,
    obligationRole: null,
    ...overrides,
  };
}

/** Honours the date window, and pages two rows at a time so the cursor loop is exercised. */
function searching(rows: readonly PhoneSearchTransaction[]) {
  const offsets = new WeakMap<object, number>();
  const searchTransactions = vi.fn(
    (filter: TransactionFilterDraft, cursor?: TransactionSearchCursorDraft) => {
      const inWindow = rows.filter(
        (candidate) =>
          (filter.from === undefined || candidate.date >= filter.from) &&
          (filter.to === undefined || candidate.date <= filter.to),
      );
      const start = cursor === undefined ? 0 : (offsets.get(cursor) ?? 0);
      const page = inWindow.slice(start, start + 2);
      const last = page.at(-1);
      let nextCursor: PhoneSearchCursor | undefined;
      if (last !== undefined && start + 2 < inWindow.length) {
        nextCursor = { date: last.date, id: last.id };
        offsets.set(nextCursor, start + 2);
      }
      return { rows: page, nextCursor, total: { count: inWindow.length, currencies: [] } };
    },
  );
  return searchTransactions;
}

function detail(overrides: Partial<PhoneTransactionDetail> = {}): PhoneTransactionDetail {
  return {
    id: id<"transactions">("55555555-5555-4555-8555-555555555555"),
    date: accountingDate("2026-03-12"),
    type: "expense",
    enteredName: "Café A",
    note: "",
    isBusiness: false,
    accountId: CASH,
    accountName: "Cash",
    toAccountId: null,
    categoryId: null,
    categoryName: null,
    counterpartyId: CAFE,
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
    const searchTransactions = searching([
      row("2025-10-03", "-10"),
      row("2026-01-15", "-20"),
      row("2026-03-01", "-30"),
      row("2026-03-12", "-48.90"),
      row("2026-04-02", "-999"),
    ]);
    const [card] = readTransactionContext(
      { searchTransactions, readSpendByCategory: noSpend },
      detail(),
    );
    expect(card?.kind).toBe("who");
    if (card?.kind !== "who") return;
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
    // Four rows in the window, two pages of two, both read.
    expect(searchTransactions).toHaveBeenCalledTimes(2);
  });

  it("leaves one-offs, other directions and other currencies out", () => {
    const searchTransactions = searching([
      row("2026-03-02", "-10"),
      row("2026-03-03", "-500", { isCapital: true }),
      row("2026-03-04", "25", { type: "income" }),
      row("2026-03-05", "-7", { currency: EUR }),
    ]);
    const [card] = readTransactionContext(
      { searchTransactions, readSpendByCategory: noSpend },
      detail({ isCapital: true, amount: toMoney("-500") }),
    );
    if (card?.kind !== "who") throw new Error("expected a Who card");
    expect(card.months.at(-1)?.total).toBe(toMoney("10"));
    expect(card.count).toBe(1);
    // A one-off contributes nowhere, so it has no share to draw.
    expect(card.share).toBeNull();
  });

  it("offers to link a counterparty when there is none", () => {
    const searchTransactions = searching([]);
    const cards = readTransactionContext(
      { searchTransactions, readSpendByCategory: noSpend },
      detail({ counterpartyId: null }),
    );
    expect(cards).toEqual([{ kind: "link" }]);
    expect(searchTransactions).not.toHaveBeenCalled();
  });
});

describe("readTransactionContext — Category", () => {
  function spending(byMonth: Record<string, string>) {
    return vi.fn(
      (
        period: { start: string },
        _scope: string,
        options?: { excludeCapital?: boolean },
      ): ReturnType<TransactionContextLedger["readSpendByCategory"]> => {
        expect(options).toEqual({ excludeCapital: true });
        const amount = byMonth[period.start];
        return amount === undefined
          ? []
          : [{ currency: PLN, decimals: 2, categoryId: EATING_OUT, amount: toMoney(amount) }];
      },
    );
  }

  it("sets the month against the mean of the previous three that held anything", () => {
    const readSpendByCategory = spending({
      "2026-03-01": "312.60",
      "2026-02-01": "400",
      "2026-12-01": "9999",
      "2025-12-01": "200",
    });
    const cards = readTransactionContext(
      { searchTransactions: searching([]), readSpendByCategory },
      detail({ categoryId: EATING_OUT }),
    );
    const card = cards.find((candidate) => candidate.kind === "category");
    if (card?.kind !== "category") throw new Error("expected a Category card");
    expect(card.spent).toBe(toMoney("312.60"));
    expect(card.usual).toBe(toMoney("300"));
    expect(card.share).toBe(toMoney("48.90"));
  });

  it("has no usual with no earlier month, and credits a lined row only its lines in the category", () => {
    const readSpendByCategory = spending({ "2026-03-01": "60" });
    const cards = readTransactionContext(
      { searchTransactions: searching([]), readSpendByCategory },
      detail({
        categoryId: EATING_OUT,
        lines: [
          line("18.90", EATING_OUT),
          line("30.00", id<"categories">("66666666-6666-4666-8666-666666666666")),
        ],
      }),
    );
    const card = cards.find((candidate) => candidate.kind === "category");
    if (card?.kind !== "category") throw new Error("expected a Category card");
    expect(card.usual).toBeNull();
    expect(card.share).toBe(toMoney("18.90"));
  });

  it("is not drawn for income, which has no category breakdown", () => {
    const readSpendByCategory = vi.fn(noSpend);
    const cards = readTransactionContext(
      { searchTransactions: searching([]), readSpendByCategory },
      detail({ type: "income", amount: toMoney("100"), categoryId: EATING_OUT }),
    );
    expect(cards.map((card) => card.kind)).toEqual(["who"]);
    expect(readSpendByCategory).not.toHaveBeenCalled();
  });
});

describe("readTransactionContext — Pair", () => {
  it("counts moves between the same two accounts, in the same direction", () => {
    const searchTransactions = searching([
      row("2026-03-01", "-100", { type: "transfer", toAccountId: SAVINGS }),
      row("2026-03-02", "-50", { type: "transfer", accountId: SAVINGS, toAccountId: CASH }),
      row("2026-03-03", "-9", { type: "expense" }),
      row("2026-02-10", "-200", { type: "transfer", toAccountId: SAVINGS }),
    ]);
    const cards = readTransactionContext(
      { searchTransactions, readSpendByCategory: noSpend },
      detail({
        type: "transfer",
        amount: toMoney("-100"),
        toAccountId: SAVINGS,
        counterpartyId: null,
      }),
    );
    expect(cards).toHaveLength(1);
    const [card] = cards;
    if (card?.kind !== "pair") throw new Error("expected a Pair card");
    expect(card.count).toBe(1);
    expect(card.months.slice(-2).map((m) => m.total)).toEqual([toMoney("200"), toMoney("100")]);
  });

  it("draws nothing for an adjustment", () => {
    expect(
      readTransactionContext(
        { searchTransactions: searching([]), readSpendByCategory: noSpend },
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
    amount: toMoney(amount) as Money,
    categoryId,
    categoryName: null,
  };
}
