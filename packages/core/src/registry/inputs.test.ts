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
// A3's own import from "./inputs.ts" — kept separate from A2's above so a
// rebase against A2's append is a line-level merge, not a symbol-level one.
import {
  type AccountKind,
  type ArchiveAccountInput,
  archiveAccountInput,
  archiveCategoryInput,
  archiveGroupInput,
  type CreateAccountInput,
  type CreateCategoryInput,
  type CreateTransactionInput,
  categorizeBatchInput,
  createAccountInput,
  createCategoryInput,
  createGroupInput,
  createTransactionInput,
  deleteTransactionInput,
  mergeCategoriesInput,
  reconcileAccountInput,
  renameCategoryInput,
  reorderAccountsInput,
  reorderGroupsInput,
  reparentCategoryInput,
  setTransactionLinesInput,
  supersedeTransactionInput,
  type UpdateAccountInput,
  updateAccountInput,
  updateGroupInput,
  updateTransactionInput,
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

/* ══════════════════════════════════════════════════════════════════════════
 * A3 · accounts, groups and categories — appended in its own block, matching
 * `inputs.ts`'s own delimiter, so a rebase against A2's append is trivial.
 * ════════════════════════════════════════════════════════════════════════ */

const GROUP_ID = "66666666-6666-4666-8666-666666666666";
const LEAF_ID = "77777777-7777-4777-8777-777777777777";
const OTHER_LEAF_ID = "88888888-8888-4888-8888-888888888888";
const ADJUSTMENT_ID = "99999999-9999-4999-8999-999999999999";

export type PatchAccountVersionIsRequired = Expect<Extends<UpdateAccountInput["version"], number>>;
export type ArchiveAccountVersionIsRequired = Expect<
  Extends<ArchiveAccountInput["version"], number>
>;
export type CategoryKindIsIncomeOrExpense = Expect<
  Extends<CreateCategoryInput["kind"], "income" | "expense">
>;

describe("updateAccountInput", () => {
  it("refuses an empty patch", () => {
    const result = updateAccountInput.safeParse({ id: ACCOUNT_ID, version: 1, patch: {} });

    expect(result.success).toBe(false);
    expect(paths(result)).toContain("patch");
  });

  it("refuses currency in the patch — S16 §7 has no in-place path for it", () => {
    const result = updateAccountInput.safeParse({
      id: ACCOUNT_ID,
      version: 1,
      patch: { currency: "PLN" },
    });

    expect(result.success).toBe(false);
  });

  it("accepts a single-field patch and normalises the money one", () => {
    const parsed = updateAccountInput.parse({
      id: ACCOUNT_ID,
      version: 3,
      patch: { openingBalance: "40" },
    });

    expect(parsed.patch.openingBalance).toBe("40.00000000");
  });
});

describe("archiveAccountInput", () => {
  it("requires a version", () => {
    const result = archiveAccountInput.safeParse({ id: ACCOUNT_ID });

    expect(result.success).toBe(false);
    expect(paths(result)).toContain("version");
  });
});

describe("reorderAccountsInput", () => {
  it("refuses an empty list", () => {
    const result = reorderAccountsInput.safeParse({ ids: [] });

    expect(result.success).toBe(false);
    expect(paths(result)).toContain("ids");
  });

  it("refuses a duplicate id — two rows tied on sort is not an order", () => {
    const result = reorderAccountsInput.safeParse({ ids: [ACCOUNT_ID, ACCOUNT_ID] });

    expect(result.success).toBe(false);
    expect(paths(result)).toContain("ids");
  });
});

describe("createGroupInput", () => {
  it("defaults institution to null rather than requiring it", () => {
    const parsed = createGroupInput.parse({ id: GROUP_ID, name: "Bank A" });

    expect(parsed.institution).toBeNull();
  });
});

describe("updateGroupInput", () => {
  it("refuses an empty patch", () => {
    const result = updateGroupInput.safeParse({ id: GROUP_ID, patch: {} });

    expect(result.success).toBe(false);
    expect(paths(result)).toContain("patch");
  });
});

describe("reorderGroupsInput", () => {
  it("refuses an empty list", () => {
    const result = reorderGroupsInput.safeParse({ ids: [] });

    expect(result.success).toBe(false);
    expect(paths(result)).toContain("ids");
  });

  it("refuses a duplicate id", () => {
    const result = reorderGroupsInput.safeParse({ ids: [GROUP_ID, GROUP_ID] });

    expect(result.success).toBe(false);
    expect(paths(result)).toContain("ids");
  });
});

describe("archiveGroupInput", () => {
  it("parses the id alone — no version column on account_groups", () => {
    expect(archiveGroupInput.parse({ id: GROUP_ID })).toEqual({ id: GROUP_ID });
  });
});

describe("reconcileAccountInput", () => {
  it("parses S16 §5's worked example", () => {
    const parsed = reconcileAccountInput.parse({
      accountId: ACCOUNT_ID,
      adjustmentId: ADJUSTMENT_ID,
      observedBalance: "1198.30",
      asOf: "2026-03-12",
      note: "cash spent, not recorded",
    });

    expect(parsed.observedBalance).toBe("1198.30000000");
    expect(parsed.categoryId).toBeUndefined();
  });

  it("refuses an ISO timestamp where `asOf` belongs", () => {
    const result = reconcileAccountInput.safeParse({
      accountId: ACCOUNT_ID,
      adjustmentId: ADJUSTMENT_ID,
      observedBalance: "1198.30",
      asOf: "2026-03-12T22:00:00.000Z",
    });

    expect(result.success).toBe(false);
    expect(paths(result)).toContain("asOf");
  });
});

describe("createCategoryInput", () => {
  it("defaults parentId to null and isEarnings to false", () => {
    const parsed = createCategoryInput.parse({ id: LEAF_ID, name: "Groceries", kind: "expense" });

    expect(parsed.parentId).toBeNull();
    expect(parsed.isEarnings).toBe(false);
  });

  it("refuses a colour that is not a hex triplet", () => {
    const result = createCategoryInput.safeParse({
      id: LEAF_ID,
      name: "Groceries",
      kind: "expense",
      color: "red",
    });

    expect(result.success).toBe(false);
    expect(paths(result)).toContain("color");
  });
});

describe("renameCategoryInput", () => {
  it("requires a version", () => {
    const result = renameCategoryInput.safeParse({ id: LEAF_ID, name: "Groceries" });

    expect(result.success).toBe(false);
    expect(paths(result)).toContain("version");
  });
});

describe("reparentCategoryInput", () => {
  it("allows an explicit null parent — a top-level leaf", () => {
    const parsed = reparentCategoryInput.parse({ id: LEAF_ID, version: 1, parentId: null });

    expect(parsed.parentId).toBeNull();
  });
});

describe("mergeCategoriesInput", () => {
  it("refuses a category merging into itself", () => {
    const result = mergeCategoriesInput.safeParse({ loserId: LEAF_ID, winnerId: LEAF_ID });

    expect(result.success).toBe(false);
    expect(paths(result)).toContain("winnerId");
  });

  it("accepts two different categories", () => {
    expect(
      mergeCategoriesInput.safeParse({ loserId: LEAF_ID, winnerId: OTHER_LEAF_ID }).success,
    ).toBe(true);
  });
});

describe("archiveCategoryInput", () => {
  it("requires a version", () => {
    const result = archiveCategoryInput.safeParse({ id: LEAF_ID });

    expect(result.success).toBe(false);
    expect(paths(result)).toContain("version");
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

/* ════════════════════════════════════════════════════════════════════════
 * A2 · transaction operations
 * ════════════════════════════════════════════════════════════════════════ */

const TXN_ID_2 = "66666666-6666-4666-8666-666666666666";
const LINE_ID_1 = "77777777-7777-4777-8777-777777777771";
const LINE_ID_2 = "77777777-7777-4777-8777-777777777772";

describe("update_transaction", () => {
  it("is a patch: only the fields sent are set, and version is required", () => {
    const parsed = updateTransactionInput.parse({
      id: TXN_ID,
      version: 3,
      patch: { payee: "Coffee" },
    });
    expect(parsed.patch).toEqual({ payee: "Coffee" });
    expect(() => updateTransactionInput.parse({ id: TXN_ID, patch: {} })).toThrow();
  });

  it("refuses an empty patch — a write that changes nothing is a bug, not a no-op", () => {
    expect(() => updateTransactionInput.parse({ id: TXN_ID, version: 1, patch: {} })).toThrow(
      /at least one field/,
    );
  });

  it("refuses fields that are not patchable: id, version, source, createdAt", () => {
    expect(() =>
      updateTransactionInput.parse({ id: TXN_ID, version: 1, patch: { id: "x" } }),
    ).toThrow();
    expect(() =>
      updateTransactionInput.parse({ id: TXN_ID, version: 1, patch: { version: 2 } }),
    ).toThrow();
    expect(() =>
      updateTransactionInput.parse({ id: TXN_ID, version: 1, patch: { source: "manual" } }),
    ).toThrow();
    expect(() =>
      updateTransactionInput.parse({
        id: TXN_ID,
        version: 1,
        patch: { createdAt: "2026-01-01" },
      }),
    ).toThrow();
  });
});

describe("delete_transaction", () => {
  it("needs an id and the version it read", () => {
    const parsed = deleteTransactionInput.parse({ id: TXN_ID, version: 1 });
    expect(parsed).toEqual({ id: TXN_ID, version: 1 });
    expect(() => deleteTransactionInput.parse({ id: TXN_ID })).toThrow();
  });
});

describe("set_transaction_lines", () => {
  it("requires each line's amount and description", () => {
    expect(() =>
      setTransactionLinesInput.parse({
        transactionId: TXN_ID,
        version: 1,
        lines: [{ id: LINE_ID_1, amount: "1" }],
      }),
    ).toThrow();
  });

  it("accepts an empty set — that is how lines are removed", () => {
    expect(
      setTransactionLinesInput.parse({ transactionId: TXN_ID, version: 1, lines: [] }).lines,
    ).toEqual([]);
  });

  it("parses a full set, branding each amount", () => {
    const parsed = setTransactionLinesInput.parse({
      transactionId: TXN_ID,
      version: 1,
      lines: [
        { id: LINE_ID_1, description: "Espresso", amount: "10" },
        { id: LINE_ID_2, description: "Croissant", amount: "8" },
      ],
    });
    expect(parsed.lines.map((l) => l.amount)).toEqual(["10.00000000", "8.00000000"]);
  });
});

describe("supersede_transaction", () => {
  it("carries the whole replacement row and the id it replaces", () => {
    expect(() =>
      supersedeTransactionInput.parse({ supersedesId: TXN_ID, supersedesVersion: 1 }),
    ).toThrow();

    const parsed = supersedeTransactionInput.parse({
      supersedesId: TXN_ID,
      supersedesVersion: 1,
      replacement: { ...expense, id: TXN_ID_2, source: "import" },
    });
    expect(parsed.replacement.id).toBe(TXN_ID_2);
    expect(parsed.replacement.source).toBe("import");
  });
});

describe("categorize_batch", () => {
  it("needs at least one id and one category", () => {
    expect(() =>
      categorizeBatchInput.parse({ transactionIds: [], categoryId: CATEGORY_ID }),
    ).toThrow();
    expect(() =>
      categorizeBatchInput.parse({ transactionIds: [TXN_ID], categoryId: undefined }),
    ).toThrow();
  });

  it("parses one category over many ids", () => {
    const parsed = categorizeBatchInput.parse({
      transactionIds: [TXN_ID, TXN_ID_2],
      categoryId: CATEGORY_ID,
    });
    expect(parsed.transactionIds).toEqual([TXN_ID, TXN_ID_2]);
  });
});
