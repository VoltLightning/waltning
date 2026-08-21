/**
 * The enumerated value sets, named once and dialect-free.
 *
 * **Why they moved here from `packages/db`.** Postgres has a real `ENUM` type
 * and SQLite has none, so the same column is a `pgEnum` on one engine and a
 * `text` on the other — and until now that meant the same column had **two
 * different row types**: `"income" | "expense" | …` on the server and plain
 * `string` on the phone. Nothing connected the two, so nothing noticed.
 *
 * That is precisely the divergence `parity.type-test.ts` exists to make
 * impossible, and it was invisible to it because the two declarations were
 * written independently rather than from one source.
 *
 * So the values live here, and each dialect builds its own column from them:
 * `pgEnum(name, VALUES)` on Postgres, `text(name, { enum: VALUES })` on SQLite.
 * Drizzle infers the **same union** from both, so the row types match and the
 * server keeps the compile-time check it would otherwise have lost. Writing
 * `type: "incme"` fails to build on either engine.
 *
 * **The names are the Postgres type names**, because those are already in a
 * shipped migration and a rename would be a migration, not a refactor.
 */

/**
 * Money Manager leaves ZTYPE = 0 on all 68 accounts, so the real taxonomy lived
 * in group names and memo text. Decoded from those.
 */
export const ACCOUNT_KIND = [
  "cash",
  "bank",
  "card",
  "loan_receivable",
  "loan_payable",
  "clearing",
  "investment",
  "deposit",
  "other",
] as const;

/** §6.7 — a shared account is ordinary; it just belongs to a different total. */
export const OWNERSHIP = ["own", "shared"] as const;

export const CATEGORY_KIND = ["income", "expense"] as const;

export const TXN_TYPE = ["income", "expense", "transfer", "adjustment"] as const;

export const TXN_SOURCE = ["manual", "import", "receipt", "agent", "migration"] as const;

export const ACTOR = ["user", "agent", "import", "migration"] as const;

export const COUNTERPARTY_KIND = ["person", "company"] as const;

/**
 * §6.6 — naming a counterparty is not the same as owing them. Only `debt` rows
 * reach `counterparty_balances`; `contribution` attributes an inflow to a
 * shared account (§6.7) and carries no settlement expectation; `reference`
 * merely records who was involved.
 */
export const COUNTERPARTY_ROLE = ["debt", "contribution", "reference"] as const;

/** §7.6 — `manual` outranks every synced source for the same pair and date. */
export const FX_SOURCE = ["nbp", "ecb", "nbrb", "nbg", "manual", "carried_forward"] as const;

export const IMPORT_ROW_STATUS = [
  "pending",
  "ready",
  "needs_review",
  "duplicate",
  "imported",
  "skipped",
] as const;

export const TAX_LINE_KIND = ["revenue", "expense", "excluded"] as const;

/** A dashboard widget's footprint in the grid. */
export const WIDGET_SIZE = ["s", "m", "l"] as const;

export type AccountKind = (typeof ACCOUNT_KIND)[number];
export type Ownership = (typeof OWNERSHIP)[number];
export type CategoryKind = (typeof CATEGORY_KIND)[number];
export type TxnType = (typeof TXN_TYPE)[number];
export type TxnSource = (typeof TXN_SOURCE)[number];
export type Actor = (typeof ACTOR)[number];
export type CounterpartyKind = (typeof COUNTERPARTY_KIND)[number];
export type CounterpartyRole = (typeof COUNTERPARTY_ROLE)[number];
export type FxSource = (typeof FX_SOURCE)[number];
export type ImportRowStatus = (typeof IMPORT_ROW_STATUS)[number];
export type TaxLineKind = (typeof TAX_LINE_KIND)[number];
export type WidgetSize = (typeof WIDGET_SIZE)[number];
