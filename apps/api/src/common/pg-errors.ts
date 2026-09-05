/**
 * Postgres refusals → domain errors.
 *
 * The database is where this system's guarantees actually live, and until now
 * none of them could be *identified* by anything reading the error. Every
 * trigger raised `check_violation`, so fifteen different rules were one code,
 * and the only distinguishing feature left was English message text.
 *
 * The consequence was not cosmetic. `architecture/09`'s status table retries a
 * 5xx and never retries a `period_closed`. A queued edit into a filed period
 * came back as `internal`, so the outbox would retry a permanently-refused
 * write forever — and the period does not reopen on its own.
 *
 * Each guard now raises its own SQLSTATE (`0001_database_objects.sql`), and
 * this is the single place they are read.
 *
 * **Applied in `defineOperation`, not in services.** That is the same argument
 * the audit row and the idempotency receipt already make: a translation each
 * service has to remember is one a service will eventually forget, and the
 * failure is silent — the refusal still happens, it just arrives wearing the
 * wrong code. A service may still throw its own `DomainError` first when it can
 * word the message better; that passes through untouched.
 */

import { DomainError, type ErrorCode } from "./errors.ts";

/**
 * A raised guard: its domain code, and the trigger that refused.
 *
 * `constraint` is the **real trigger name**, so it can be grepped in the
 * migration and looked up in `\d`. Several SQLSTATEs share one trigger —
 * `categories_shape` alone raises four — and that is fine: the SQLSTATE is the
 * fine-grained discriminator, the trigger name is the thing that exists.
 * Inventing a per-branch name would read like a database object and not be one.
 */
type Guard = { code: ErrorCode; constraint: string };

/**
 * The SQLSTATEs, named once.
 *
 * They appear in three places — the migration, this map, and the tests — and a
 * five-character code is exactly the kind of literal that gets mistyped into
 * something that still parses. Naming them means a wrong one fails to compile
 * here, and `pg-errors.test.ts` reads the codes back out of the *installed*
 * functions to prove these still match what Postgres is actually running.
 */
export const SQLSTATE = {
  PERIOD_CLOSED: "WA001",
  ONE_PIVOT: "WA002",
  TXN_CURRENCY: "WA003",
  TRANSFER_CURRENCY: "WA004",
  CATEGORY_IS_LEAF: "WA005",
  CATEGORY_HAS_CHILDREN: "WA006",
  CATEGORY_UNDER_LEAF: "WA007",
  CATEGORY_STILL_ASSIGNED: "WA008",
  CATEGORY_KIND_PARENT: "WA009",
  CHILDREN_KIND: "WA010",
  BUSINESS_IN_SHARED: "WA011",
  BUSINESS_INTO_SHARED: "WA012",
  ACCOUNT_CURRENCY_CHANGE: "WA013",
  ACCOUNT_MADE_SHARED: "WA014",
  LINES_SUM: "WA015",
  /**
   * H2/H3/M1 — an amount past its own currency's own decimal scale
   * (`0011_transaction_scale_and_category_kind.sql`). **Shared by several
   * triggers** (`transactions`, `debt_reassignments`, `transaction_lines`,
   * `accounts`, `recurring_transactions`, `targets`, `receipts`) — the
   * migration sets `CONSTRAINT`/`COLUMN` on every raise, and `toDomainError`
   * below reads those off the driver rather than assuming this one entry.
   */
  AMOUNT_SCALE: "WA016",
  /** H1-b — a category's own kind disagrees with the transaction's type (`0011_transaction_scale_and_category_kind.sql`). */
  CATEGORY_KIND_MATCHES_TYPE: "WA017",
  /** C1 — a currency's `decimals` cannot be lowered under an existing row (`0011_transaction_scale_and_category_kind.sql`). */
  CURRENCY_DECIMALS_LOWERED: "WA018",
} as const;

export type GuardState = (typeof SQLSTATE)[keyof typeof SQLSTATE];

/** A unique index refused the write. Postgres's own code, not one of ours. */
export const UNIQUE_VIOLATION = "23505";

/**
 * Trigger names, as they exist in the database.
 *
 * Named for the same reason: these reach the client as `details.constraint` and
 * are the string a client keys on, so a typo would ship a name nothing can
 * match — and would look right in review.
 */
export const TRIGGER = {
  PERIOD_NOT_CLOSED: "transactions_period_not_closed",
  ONE_PIVOT: "currencies_exactly_one_pivot",
  CURRENCY_MATCHES_ACCOUNT: "transactions_currency_matches_account",
  CATEGORY_IS_LEAF: "transactions_category_is_leaf",
  CATEGORY_SHAPE: "categories_shape",
  CHILDREN_KIND: "categories_children_kind",
  BUSINESS_NOT_SHARED: "transactions_business_not_shared",
  BUSINESS_NOT_SHARED_TARGET: "transactions_business_not_shared_target",
  ACCOUNT_CHANGE_SAFE: "accounts_change_safe",
  LINES_SUM: "transaction_lines_sum_matches",
  /**
   * The *default* — used only when the driver did not report a `constraint`
   * of its own (`toDomainError` prefers the driver's). `transactions` is the
   * oldest of the WA016 raisers and the one every existing caller of this
   * map already expects here.
   */
  AMOUNT_SCALE: "transactions_amount_scale_matches_currency",
  CATEGORY_KIND_MATCHES_TYPE: "transactions_category_kind_matches_type",
  CURRENCY_DECIMALS_SAFE: "currencies_decimals_safe",
} as const;

/**
 * What each guard means.
 *
 * `Record<GuardState, Guard>` rather than `Record<string, Guard>`: adding a
 * SQLSTATE above without a row here fails to compile, so the map cannot fall
 * behind the migration by omission. A code arriving with no row falls through
 * as `internal`, which is the honest answer for "the database refused and we do
 * not know why" — but it should never be reachable for one of ours.
 */
export const GUARDS: Record<GuardState, Guard> = {
  // The one whose handling differs. Never retry: the period is filed, and it
  // stays filed until a person reopens it.
  [SQLSTATE.PERIOD_CLOSED]: { code: "period_closed", constraint: TRIGGER.PERIOD_NOT_CLOSED },

  [SQLSTATE.ONE_PIVOT]: { code: "validation", constraint: TRIGGER.ONE_PIVOT },
  [SQLSTATE.TXN_CURRENCY]: { code: "validation", constraint: TRIGGER.CURRENCY_MATCHES_ACCOUNT },
  [SQLSTATE.TRANSFER_CURRENCY]: {
    code: "validation",
    constraint: TRIGGER.CURRENCY_MATCHES_ACCOUNT,
  },
  [SQLSTATE.CATEGORY_IS_LEAF]: { code: "validation", constraint: TRIGGER.CATEGORY_IS_LEAF },
  [SQLSTATE.CATEGORY_HAS_CHILDREN]: { code: "validation", constraint: TRIGGER.CATEGORY_SHAPE },
  [SQLSTATE.CATEGORY_UNDER_LEAF]: { code: "validation", constraint: TRIGGER.CATEGORY_SHAPE },
  [SQLSTATE.CATEGORY_STILL_ASSIGNED]: { code: "validation", constraint: TRIGGER.CATEGORY_SHAPE },
  [SQLSTATE.CATEGORY_KIND_PARENT]: { code: "validation", constraint: TRIGGER.CATEGORY_SHAPE },
  [SQLSTATE.CHILDREN_KIND]: { code: "validation", constraint: TRIGGER.CHILDREN_KIND },
  [SQLSTATE.BUSINESS_IN_SHARED]: { code: "validation", constraint: TRIGGER.BUSINESS_NOT_SHARED },
  [SQLSTATE.BUSINESS_INTO_SHARED]: {
    code: "validation",
    constraint: TRIGGER.BUSINESS_NOT_SHARED_TARGET,
  },
  [SQLSTATE.ACCOUNT_CURRENCY_CHANGE]: {
    code: "validation",
    constraint: TRIGGER.ACCOUNT_CHANGE_SAFE,
  },
  [SQLSTATE.ACCOUNT_MADE_SHARED]: { code: "validation", constraint: TRIGGER.ACCOUNT_CHANGE_SAFE },

  // Deferred, so it surfaces at COMMIT rather than at the offending statement.
  // The client still sees one refusal for one intention, because the whole
  // split is one operation.
  [SQLSTATE.LINES_SUM]: { code: "validation", constraint: TRIGGER.LINES_SUM },

  [SQLSTATE.AMOUNT_SCALE]: { code: "validation", constraint: TRIGGER.AMOUNT_SCALE },

  [SQLSTATE.CATEGORY_KIND_MATCHES_TYPE]: {
    code: "validation",
    constraint: TRIGGER.CATEGORY_KIND_MATCHES_TYPE,
  },

  [SQLSTATE.CURRENCY_DECIMALS_LOWERED]: {
    code: "validation",
    constraint: TRIGGER.CURRENCY_DECIMALS_SAFE,
  },
};

/**
 * Lookup by whatever string the driver handed us.
 *
 * Built from `Object.entries`, so it needs no cast: `GUARDS` stays exhaustively
 * typed for authors, and this stays honest about the fact that a driver code is
 * just a string until it matches.
 */
const BY_STATE: ReadonlyMap<string, Guard> = new Map(Object.entries(GUARDS));

/**
 * Drizzle wraps driver errors in a `DrizzleQueryError` whose message is the SQL
 * and whose `code` lives on `.cause`. Reading `e.code` therefore finds nothing
 * and every refusal falls through as `internal` — which is exactly what
 * happened until a test asked for the duplicate case. Walking the chain is what
 * makes any of this fire at all.
 */
type CausedError = {
  code?: string;
  /**
   * postgres.js spells it `constraint_name`; node-postgres spells it
   * `constraint`. Both are read, because reading only one is invisible: the
   * field is optional, so the wrong name yields `undefined` and the error still
   * looks handled. That is precisely what happened — the first version read
   * `constraint`, and every unique violation lost the index name silently.
   */
  constraint_name?: string;
  constraint?: string;
  /**
   * M3 — the offending column, when a `RAISE … USING COLUMN = …` set one
   * (every WA016 raise in `0011_transaction_scale_and_category_kind.sql`
   * does). Same dual-spelling story as `constraint`/`constraint_name`:
   * postgres.js reads the wire protocol's `Column Name` field as
   * `column_name`, node-postgres as `column`.
   */
  column_name?: string;
  column?: string;
  message?: string;
  cause?: CausedError;
};

/** Narrows rather than casting: `catch` gives `unknown`, and this is the check. */
function isCausedError(e: unknown): e is CausedError {
  return typeof e === "object" && e !== null;
}

/** Walks to the first link in the chain carrying a driver error code. */
function driverError(e: unknown): CausedError | undefined {
  let cur = isCausedError(e) ? e : undefined;
  for (let depth = 0; cur && depth < 5; depth++) {
    if (typeof cur.code === "string") return cur;
    cur = isCausedError(cur.cause) ? cur.cause : undefined;
  }
  return undefined;
}

export function pgErrorCode(e: unknown): string | undefined {
  return driverError(e)?.code;
}

/**
 * The domain error a Postgres refusal means, or `undefined` if it means nothing
 * we recognise.
 *
 * `undefined` rather than a catch-all `internal`: the caller re-throws the
 * original, which keeps the stack and the driver's own detail for the log.
 * Manufacturing an `internal` here would discard both and claim we understood
 * the failure.
 */
export function toDomainError(e: unknown): DomainError | undefined {
  const driver = driverError(e);
  if (!driver?.code) return undefined;

  const guard = BY_STATE.get(driver.code);
  if (guard) {
    // M3 — several triggers now share WA016, so the map's own `constraint`
    // is only ever a default; a `RAISE … USING CONSTRAINT = …, COLUMN = …`
    // (every raise in `0011_transaction_scale_and_category_kind.sql`) tells
    // the truth about which one actually fired, and is preferred whenever
    // the driver reported one.
    const constraint = driver.constraint_name ?? driver.constraint ?? guard.constraint;
    const column = driver.column_name ?? driver.column;
    return new DomainError(guard.code, messageOf(e), {
      constraint,
      ...(column === undefined ? {} : { column }),
    });
  }

  if (driver.code === UNIQUE_VIOLATION) {
    // The index name is the useful part and Postgres supplies it. A service
    // that can word this better throws its own DomainError before reaching here.
    const constraint = driver.constraint_name ?? driver.constraint;
    return new DomainError(
      "validation",
      messageOf(e),
      constraint === undefined ? {} : { constraint },
    );
  }

  return undefined;
}

/**
 * The database's own message, which is written for a person and names the rule
 * (`SPEC.md §13.4` and so on).
 *
 * Deliberately passed through rather than replaced by a generic string: these
 * messages were written to be read. The *classification* no longer depends on
 * them, which was the actual problem — `code` and `constraint` carry that now,
 * and the text is free to stay human.
 */
function messageOf(e: unknown): string {
  const message = driverError(e)?.message;
  return message && message.length > 0 ? message : "the database refused this write";
}
