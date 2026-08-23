/**
 * What these tests are for, and what they deliberately are not.
 *
 * Not *"zod validates"* — zod's own suite covers that. Every case below is a
 * claim this file makes on top of zod: that a field the specification requires
 * cannot be omitted, that a field the column defaults need not be supplied and
 * comes back **normalised** rather than echoed, that the cross-field CHECKs in
 * §6.5 are refused at the edge rather than at drain, and that what reaches a
 * handler is branded — `Money`, `AccountingDate`, `CurrencyCode`,
 * `PivotPerUnit`, `Id<Table>` — because the whole point of `zod.ts` is that the
 * boundary is the only place a brand can be established.
 *
 * Placeholders throughout (`Bank A · PLN`, invented names): public repo,
 * private ledger.
 */

import { describe, expect, it } from "vitest";
import type { AccountingDate } from "../date.ts";
import type { Id } from "../id.ts";
import type { CurrencyCode, Money, PivotPerUnit, TxnType, UnitsPerPivot } from "../money.ts";
import {
  type AccountKind,
  type CreateAccountInput,
  type CreateTransactionInput,
  createAccountInput,
  createTransactionInput,
} from "./inputs.ts";

/* ── compile-time assertions ─────────────────────────────────────────────────
 *
 * The half a runtime test cannot reach. A brand is a phantom property: at run
 * time `Money` is the string it always was, so `expect(typeof x).toBe("string")`
 * passes just as well when the transform was dropped. These fail through `tsc`,
 * in the same gate, the way `id.type-test.ts` and `rate.type-test.ts` do.
 */

type Expect<T extends true> = T;
type Not<T extends boolean> = T extends true ? false : true;
type Extends<A, B> = A extends B ? true : false;
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** Every amount arrives as `Money`, never as a bare string. */
export type OpeningBalanceIsMoney = Expect<Exact<CreateAccountInput["openingBalance"], Money>>;
export type AmountIsMoney = Expect<Exact<CreateTransactionInput["amountOriginal"], Money>>;

/** Ids are branded by table, so `{ accountId: categoryId }` is a compile error. */
export type AccountIdIsAnAccountId = Expect<Exact<CreateAccountInput["id"], Id<"accounts">>>;
export type TxnIdIsATxnId = Expect<Exact<CreateTransactionInput["id"], Id<"transactions">>>;
export type CategoryIdIsNotAnAccountId = Expect<
  Not<Extends<NonNullable<CreateTransactionInput["categoryId"]>, Id<"accounts">>>
>;

export type DateIsAccountingDate = Expect<Exact<CreateTransactionInput["date"], AccountingDate>>;
export type CurrencyIsCurrencyCode = Expect<Exact<CreateAccountInput["currency"], CurrencyCode>>;
export type AccountKindMatchesInput = Expect<Exact<AccountKind, CreateAccountInput["kind"]>>;

/**
 * H21, at the input boundary. `transactions.fx_rate` is pivot-per-unit and
 * `fx_rates.rate` is its reciprocal; both are called *rate* and the confusion
 * produced a 14.1× error. Handing this field a `UnitsPerPivot` must not compile.
 */
export type FxRateIsPivotPerUnit = Expect<
  Exact<NonNullable<CreateTransactionInput["fxRate"]>, PivotPerUnit>
>;
export type FxRateIsNotUnitsPerPivot = Expect<
  Not<Extends<UnitsPerPivot, NonNullable<CreateTransactionInput["fxRate"]>>>
>;

/**
 * The enumerations in `inputs.ts` are hand-copied from `packages/schema` because
 * the import would be a cycle. This is the one that can be pinned without one —
 * and it is pinned through the *parsed output*, so it checks the schema rather
 * than restating the copy beside it.
 */
export type TxnTypeMatchesTheBrand = Expect<Exact<CreateTransactionInput["type"], TxnType>>;

/* ── fixtures ────────────────────────────────────────────────────────────── */

const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";
const CATEGORY_ID = "33333333-3333-4333-8333-333333333333";
const COUNTERPARTY_ID = "44444444-4444-4444-8444-444444444444";
const TXN_ID = "55555555-5555-4555-8555-555555555555";

/** The smallest payload that produces a valid `accounts` row. */
const account = { id: ACCOUNT_ID, name: "Bank A · PLN", currency: "PLN" };

/** The smallest payload that produces a valid `transactions` row. */
const expense = {
  id: TXN_ID,
  date: "2026-03-12",
  type: "expense",
  accountId: ACCOUNT_ID,
  amountOriginal: "18.40",
  currency: "PLN",
};

/** The paths of every issue, for asserting *which field* was refused. */
const paths = (result: {
  success: boolean;
  error?: { issues: readonly { path: PropertyKey[] }[] };
}) => (result.error?.issues ?? []).map((i) => i.path.join("."));

/* ── create_account ──────────────────────────────────────────────────────── */

describe("createAccountInput", () => {
  it("parses the minimum payload and brands what it parsed", () => {
    const parsed = createAccountInput.parse({ ...account, currency: " pln " });

    expect(parsed.id).toBe(ACCOUNT_ID);
    expect(parsed.name).toBe("Bank A · PLN");
    // Trimmed and upper-cased on the way in, so `pln` is accepted and `PLN` is
    // what a foreign key ever sees.
    expect(parsed.currency).toBe("PLN");
  });

  it("supplies the column's own defaults, and normalises the money one", () => {
    const parsed = createAccountInput.parse(account);

    expect(parsed.kind).toBe("other");
    expect(parsed.ownership).toBe("own");
    expect(parsed.memo).toBe("");
    expect(parsed.isBusiness).toBe(false);
    // The `.prefault` case. Zod 4's `.default()` short-circuits, so a default
    // written as `"0"` would arrive as `"0"` — a different value from the
    // `"0.00000000"` every supplied amount arrives as, off the same field.
    expect(parsed.openingBalance).toBe("0.00000000");
  });

  it("normalises a supplied opening balance to the storage scale", () => {
    expect(createAccountInput.parse({ ...account, openingBalance: "1200" }).openingBalance).toBe(
      "1200.00000000",
    );
  });

  it.each(["id", "name", "currency"] as const)("requires %s", (field) => {
    const { [field]: _dropped, ...rest } = account;
    const result = createAccountInput.safeParse(rest);

    expect(result.success).toBe(false);
    expect(paths(result)).toContain(field);
  });

  it("refuses an amount that arrived as a JS number", () => {
    // §7.1: amounts are decimal strings end to end. A number here is `0.1 + 0.2`
    // waiting to happen, and it is the mistake a hand-written client makes
    // first because JSON has no other numeric shape.
    const result = createAccountInput.safeParse({ ...account, openingBalance: 1200 });

    expect(result.success).toBe(false);
    expect(paths(result)).toContain("openingBalance");
  });

  it("refuses an ISO timestamp where an opening date belongs", () => {
    // C28. `new Date().toISOString()` is a string, so as a plain `string` this
    // compiled and stored — the wrong shape, and for anyone east of UTC the
    // wrong *day*.
    const result = createAccountInput.safeParse({
      ...account,
      openingDate: "2026-03-12T22:00:00.000Z",
    });

    expect(result.success).toBe(false);
    expect(paths(result)).toContain("openingDate");
  });

  it("refuses a business account that is shared", () => {
    // §6.7 — shared money is never reportable, and `accounts_shared_not_business`
    // is the CHECK. Refusing it here is what stops the phone queueing a write
    // whose only possible outcome is a failed drain three days later.
    const result = createAccountInput.safeParse({
      ...account,
      ownership: "shared",
      isBusiness: true,
    });

    expect(result.success).toBe(false);
    expect(paths(result)).toContain("isBusiness");
  });

  it("allows a shared account that is not business, and a business account that is own", () => {
    expect(createAccountInput.safeParse({ ...account, ownership: "shared" }).success).toBe(true);
    expect(createAccountInput.safeParse({ ...account, isBusiness: true }).success).toBe(true);
  });
});

/* ── create_transaction ──────────────────────────────────────────────────── */

describe("createTransactionInput", () => {
  it("parses the minimum payload and brands what it parsed", () => {
    const parsed = createTransactionInput.parse(expense);

    expect(parsed.date).toBe("2026-03-12");
    expect(parsed.amountOriginal).toBe("18.40000000");
    expect(parsed.currency).toBe("PLN");
  });

  it("supplies the column's own defaults", () => {
    const parsed = createTransactionInput.parse(expense);

    expect(parsed.payee).toBe("");
    expect(parsed.note).toBe("");
    expect(parsed.isBusiness).toBe(false);
    expect(parsed.isCapital).toBe(false);
    // S29 writes migrated rows as `migration`; everything else defaults here.
    expect(parsed.source).toBe("manual");
  });

  it.each(["id", "date", "type", "accountId", "amountOriginal", "currency"] as const)(
    "requires %s",
    (field) => {
      const { [field]: _dropped, ...rest } = expense;
      const result = createTransactionInput.safeParse(rest);

      expect(result.success).toBe(false);
      expect(paths(result)).toContain(field);
    },
  );

  it("refuses an amount that arrived as a JS number", () => {
    const result = createTransactionInput.safeParse({ ...expense, amountOriginal: 18.4 });

    expect(result.success).toBe(false);
    expect(paths(result)).toContain("amountOriginal");
  });

  it("refuses an ISO timestamp where an accounting date belongs", () => {
    // C28 again, on the field that matters most: a capture at 01:00 in Warsaw
    // dated by a UTC instant is dated *yesterday*, permanently.
    const result = createTransactionInput.safeParse({
      ...expense,
      date: "2026-03-12T22:00:00.000Z",
    });

    expect(result.success).toBe(false);
    expect(paths(result)).toContain("date");
  });

  it("does not require the capture caller to resolve a rate", () => {
    // §14.6. The phone's cached rate is display only; `fx_rate` is resolved
    // server-side at commit from the row's own date, which is also the only
    // moment `fx_rate_estimated` can be answered correctly.
    const parsed = createTransactionInput.parse(expense);

    expect(parsed.fxRate).toBeUndefined();
    expect(parsed).not.toHaveProperty("fxRateEstimated");
  });

  it("takes a rate you are asserting, in the pivot-per-unit direction", () => {
    // §7.6 level 1 — *"enter the rate your bank actually applied"*. Multiply by
    // it to reach the pivot; `fx_rates.rate` is the reciprocal.
    const parsed = createTransactionInput.parse({ ...expense, fxRate: "0.248564000000" });

    expect(parsed.fxRate).toBe("0.248564000000");
  });

  describe("the sign convention", () => {
    it("refuses a negative expense", () => {
      // §7.2 — stored amounts are positive and `type` carries direction. A
      // negative expense is a sign flip that every aggregate would then double.
      const result = createTransactionInput.safeParse({ ...expense, amountOriginal: "-18.40" });

      expect(result.success).toBe(false);
      expect(paths(result)).toContain("amountOriginal");
    });

    it("allows a negative adjustment, and only an adjustment", () => {
      // `computations.md` §1: an adjustment carries its own sign, because
      // reconciling an account downward is the ordinary use.
      const parsed = createTransactionInput.parse({
        ...expense,
        type: "adjustment",
        amountOriginal: "-18.40",
      });

      expect(parsed.amountOriginal).toBe("-18.40000000");
    });
  });

  describe("the transfer's second leg", () => {
    const transfer = {
      ...expense,
      type: "transfer",
      toAccountId: OTHER_ACCOUNT_ID,
      toAmount: "4.60",
      toCurrency: "EUR",
    };

    it("parses a cross-currency transfer as one row", () => {
      // §6.1 — one row carrying both legs, never two rows to be re-paired.
      const parsed = createTransactionInput.parse(transfer);

      expect(parsed.toAmount).toBe("4.60000000");
      expect(parsed.toCurrency).toBe("EUR");
    });

    it.each(["toAccountId", "toAmount", "toCurrency"] as const)(
      "refuses a transfer missing %s",
      (field) => {
        const { [field]: _dropped, ...rest } = transfer;
        const result = createTransactionInput.safeParse(rest);

        expect(result.success).toBe(false);
        expect(paths(result)).toContain(field);
      },
    );

    it.each(["toAccountId", "toAmount", "toCurrency", "toFxRate"] as const)(
      "refuses %s on something that is not a transfer",
      (field) => {
        // The CHECKs are equalities, not implications: a destination leg on an
        // expense is a field no reader renders and the database rejects.
        const result = createTransactionInput.safeParse({
          ...expense,
          [field]: field === "toAccountId" ? OTHER_ACCOUNT_ID : "1.00",
        });

        expect(result.success).toBe(false);
        expect(paths(result)).toContain(field);
      },
    );

    it("refuses a transfer to the same account", () => {
      // `transactions_transfer_distinct`, and S31 refuses it inline — the
      // mistake is a mis-tap on the second picker.
      const result = createTransactionInput.safeParse({ ...transfer, toAccountId: ACCOUNT_ID });

      expect(result.success).toBe(false);
      expect(paths(result)).toContain("toAccountId");
    });

    it("refuses a negative destination amount", () => {
      const result = createTransactionInput.safeParse({ ...transfer, toAmount: "-4.60" });

      expect(result.success).toBe(false);
      expect(paths(result)).toContain("toAmount");
    });
  });

  describe("the shapes that are not about money", () => {
    it("allows a category on income and expense", () => {
      expect(
        createTransactionInput.safeParse({ ...expense, categoryId: CATEGORY_ID }).success,
      ).toBe(true);
    });

    it("refuses a category on a transfer", () => {
      // `transactions_category_shape`. A transfer moves money between two of
      // your own accounts; categorising it double counts the same spend.
      const result = createTransactionInput.safeParse({
        ...expense,
        type: "transfer",
        toAccountId: OTHER_ACCOUNT_ID,
        toAmount: "18.40",
        toCurrency: "PLN",
        categoryId: CATEGORY_ID,
      });

      expect(result.success).toBe(false);
      expect(paths(result)).toContain("categoryId");
    });

    it("refuses a counterparty with no role, and a role with no counterparty", () => {
      // §6.6 — the role decides whether the row reaches `counterparty_balances`
      // at all, so leaving it unsaid is not a smaller claim.
      const noRole = createTransactionInput.safeParse({
        ...expense,
        counterpartyId: COUNTERPARTY_ID,
      });
      const noCounterparty = createTransactionInput.safeParse({
        ...expense,
        counterpartyRole: "debt",
      });

      expect(paths(noRole)).toContain("counterpartyRole");
      expect(paths(noCounterparty)).toContain("counterpartyId");
    });

    it("accepts the pair", () => {
      const parsed = createTransactionInput.parse({
        ...expense,
        counterpartyId: COUNTERPARTY_ID,
        counterpartyRole: "debt",
      });

      expect(parsed.counterpartyRole).toBe("debt");
    });
  });
});

/**
 * Non-vacuous, in the sense `id.type-test.ts` means it: every `Expect<…>` above
 * is satisfied by `never`, so naming an inhabitant of each parsed shape is what
 * stops this file passing while proving nothing.
 */
export const inhabited: [CreateAccountInput, CreateTransactionInput] = [
  createAccountInput.parse(account),
  createTransactionInput.parse(expense),
];
