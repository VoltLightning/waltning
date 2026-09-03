/**
 * The nine account, group and reconciliation operations, as the phone applies
 * them — `archive_account` `update_account` `reorder_accounts` · `create_group`
 * `update_group` `reorder_groups` `archive_group` · `reconcile_account`.
 *
 * Same harness as `executors.test.ts`: real two-file writes through
 * `writeLocally` and the real `ledgerRegistry`, so a refusal here is a
 * refusal a caller of `writeLocally` actually meets, not an assertion on an
 * executor called out of band.
 */

import { accountingDate } from "@waltning/core/date";
import { type Id, id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { z } from "zod";
import { archiveAccountExecutor } from "../accounts/archive-account.executor.ts";
import { archiveGroupExecutor } from "../accounts/archive-group.executor.ts";
import { createGroupExecutor } from "../accounts/create-group.executor.ts";
import { reconcileAccountExecutor } from "../accounts/reconcile-account.executor.ts";
import { reorderAccountsExecutor } from "../accounts/reorder-accounts.executor.ts";
import { reorderGroupsExecutor } from "../accounts/reorder-groups.executor.ts";
import { updateAccountExecutor } from "../accounts/update-account.executor.ts";
import { updateGroupExecutor } from "../accounts/update-group.executor.ts";
import type { LocalExecutor } from "../executor.ts";
import { ledgerRegistry } from "../registry.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { Capture, LocalTx, LocalWriteResult } from "../write.ts";
import { writeLocally } from "../write.ts";
import { type ScratchStores, scratchStores } from "./stores.ts";

const { accountGroups, accounts, outbox, transactions } = schema;

const PLN = currencyCode("PLN");
const ACCOUNT_A = id<"accounts">("11111111-1111-4111-8111-111111111111");
const ACCOUNT_B = id<"accounts">("22222222-2222-4222-8222-222222222222");
const GROUP_A = id<"accountGroups">("33333333-3333-4333-8333-333333333333");
const GROUP_B = id<"accountGroups">("44444444-4444-4444-8444-444444444444");
const ADJUSTMENT = id<"transactions">("55555555-5555-4555-8555-555555555555");

const capture: Capture = { timeZone: "Europe/Warsaw", offsetMinutes: 60 };

let s: ScratchStores;

beforeEach(() => {
  s = scratchStores();
  const db = s.ledger.replica.db;
  db.insert(schema.currencies)
    .values({ code: PLN, name: "Placeholder", decimals: 2, isPivot: true })
    .run();
  db.insert(accountGroups).values({ id: GROUP_A, name: "Bank A" }).run();
  db.insert(accounts)
    .values([
      { id: ACCOUNT_A, name: "Bank A · PLN", currency: PLN, groupId: GROUP_A },
      { id: ACCOUNT_B, name: "Cash · PLN", currency: PLN },
    ])
    .run();
});

afterEach(() => s?.close());

function write<Input extends z.ZodTypeAny, Row>(
  executor: LocalExecutor<Input, Row, LocalTx<unknown, typeof schema>>,
  input: unknown,
): LocalWriteResult<Row> {
  return writeLocally(s.ledger, { executor, registry: ledgerRegistry, input, capture });
}

const entries = () => s.ledger.outbox.db.select().from(outbox).all();
const account = (accountId: Id<"accounts">) =>
  s.ledger.replica.db.select().from(accounts).where(eq(accounts.id, accountId)).all()[0];

/* ── update_account ─────────────────────────────────────────────────────── */

describe("update_account", () => {
  it("patches the fields sent, bumps version, and queues one entry", () => {
    const before = account(ACCOUNT_A);
    const result = write(updateAccountExecutor, {
      id: ACCOUNT_A,
      version: before?.version,
      patch: { name: "Bank A · PLN (renamed)", memo: "reconciled monthly" },
    });

    expect(result.row.name).toBe("Bank A · PLN (renamed)");
    expect(result.row.memo).toBe("reconciled monthly");
    expect(result.row.version).toBe((before?.version ?? 0) + 1);
    expect(entries()).toHaveLength(1);
  });

  it("refuses a stale version — the row moved under the writer", () => {
    expect(() =>
      write(updateAccountExecutor, { id: ACCOUNT_A, version: 999, patch: { name: "x" } }),
    ).toThrow(/stale version/);
    // The crash window: the outbox entry commits before the replica half
    // throws, so the intent is not lost even though the row never moved.
    expect(entries()).toHaveLength(1);
    expect(account(ACCOUNT_A)?.name).toBe("Bank A · PLN");
  });

  it("refuses to patch an archived account", () => {
    const before = account(ACCOUNT_A);
    write(archiveAccountExecutor, { id: ACCOUNT_A, version: before?.version });

    expect(() =>
      write(updateAccountExecutor, {
        id: ACCOUNT_A,
        version: (before?.version ?? 0) + 1,
        patch: { name: "x" },
      }),
    ).toThrow(/archived/);
  });

  it("refuses a shared+business row on the merged result, not only on the payload", () => {
    // §6.7 accounts_shared_not_business, checked against `current` patched by
    // `input.patch` — `isBusiness: true` alone must be refused on a row that
    // is already `shared`, the case `createAccountInput`'s own refine cannot
    // see because it only ever validates one write in isolation.
    const before = account(ACCOUNT_A);
    write(updateAccountExecutor, {
      id: ACCOUNT_A,
      version: before?.version,
      patch: { ownership: "shared" },
    });

    expect(() =>
      write(updateAccountExecutor, {
        id: ACCOUNT_A,
        version: (before?.version ?? 0) + 1,
        patch: { isBusiness: true },
      }),
    ).toThrow(/never business/);
  });
});

/* ── archive_account ─────────────────────────────────────────────────────── */

describe("archive_account", () => {
  it("flips the flag, bumps version, and queues one entry", () => {
    const before = account(ACCOUNT_A);
    const result = write(archiveAccountExecutor, { id: ACCOUNT_A, version: before?.version });

    expect(result.row.archived).toBe(true);
    expect(result.row.version).toBe((before?.version ?? 0) + 1);
    expect(entries()).toHaveLength(1);
  });

  it("refuses an account that is already archived", () => {
    const before = account(ACCOUNT_A);
    write(archiveAccountExecutor, { id: ACCOUNT_A, version: before?.version });

    expect(() =>
      write(archiveAccountExecutor, { id: ACCOUNT_A, version: (before?.version ?? 0) + 1 }),
    ).toThrow(/already archived/);
  });

  it("refuses a stale version", () => {
    expect(() => write(archiveAccountExecutor, { id: ACCOUNT_A, version: 999 })).toThrow(
      /stale version/,
    );
  });
});

/* ── reorder_accounts ────────────────────────────────────────────────────── */

describe("reorder_accounts", () => {
  it("sets sort to each id's index, in order", () => {
    const result = write(reorderAccountsExecutor, { ids: [ACCOUNT_B, ACCOUNT_A] });

    expect(result.row.map((row) => [row.id, row.sort])).toEqual([
      [ACCOUNT_B, 0],
      [ACCOUNT_A, 1],
    ]);
  });

  it("refuses a list naming an account that does not exist", () => {
    const ghost = id<"accounts">("99999999-9999-4999-8999-999999999999");

    expect(() => write(reorderAccountsExecutor, { ids: [ACCOUNT_A, ghost] })).toThrow(
      new RegExp(ghost),
    );
    expect(entries()).toHaveLength(1);
  });
});

/* ── create_group / update_group / reorder_groups ───────────────────────── */

describe("create_group", () => {
  it("lands the row, defaults institution to null, and queues one entry", () => {
    const result = write(createGroupExecutor, { id: GROUP_B, name: "Bank B" });

    expect(result.row.institution).toBeNull();
    expect(entries()).toHaveLength(1);
  });
});

describe("update_group", () => {
  it("sets institution — the field FX Cost totals by", () => {
    const result = write(updateGroupExecutor, {
      id: GROUP_A,
      patch: { institution: "Bank A" },
    });

    expect(result.row.institution).toBe("Bank A");
  });

  it("refuses a group that does not exist", () => {
    const ghost = id<"accountGroups">("99999999-9999-4999-8999-999999999999");

    expect(() => write(updateGroupExecutor, { id: ghost, patch: { name: "x" } })).toThrow(
      new RegExp(ghost),
    );
  });
});

describe("reorder_groups", () => {
  it("sets sort to each id's index", () => {
    write(createGroupExecutor, { id: GROUP_B, name: "Bank B" });

    const result = write(reorderGroupsExecutor, { ids: [GROUP_B, GROUP_A] });

    expect(result.row.map((row) => [row.id, row.sort])).toEqual([
      [GROUP_B, 0],
      [GROUP_A, 1],
    ]);
  });
});

/* ── archive_group ───────────────────────────────────────────────────────── */

describe("archive_group", () => {
  it("deletes the row once nothing names it — no archived column exists to flip", () => {
    write(createGroupExecutor, { id: GROUP_B, name: "Bank B" });

    write(archiveGroupExecutor, { id: GROUP_B });

    const rows = s.ledger.replica.db
      .select()
      .from(accountGroups)
      .where(eq(accountGroups.id, GROUP_B))
      .all();
    expect(rows).toHaveLength(0);
  });

  it("refuses while a live account still names it", () => {
    expect(() => write(archiveGroupExecutor, { id: GROUP_A })).toThrow(/account\(s\) still name/);
    // The group survives — the SQLite FK would have refused the delete
    // anyway, but this is the clear message rather than a raw constraint
    // error.
    const rows = s.ledger.replica.db
      .select()
      .from(accountGroups)
      .where(eq(accountGroups.id, GROUP_A))
      .all();
    expect(rows).toHaveLength(1);
  });

  it("refuses while only an archived account still names it", () => {
    const before = account(ACCOUNT_A);
    write(archiveAccountExecutor, { id: ACCOUNT_A, version: before?.version });

    // An archived account is not "live", but the FK still points at the
    // group — deleting it would either orphan the reference or throw a raw
    // SQLite constraint error, so this refuses it with a clear message
    // instead of narrowing the check to "live" accounts only.
    expect(() => write(archiveGroupExecutor, { id: GROUP_A })).toThrow(/account\(s\) still name/);
  });
});

/* ── reconcile_account ───────────────────────────────────────────────────── */

describe("reconcile_account", () => {
  function seedComputedBalance() {
    // opening 0 + one income of 1240.50, dated before the reconciliation —
    // S16 §5's own worked example: computed 1240.50, observed 1198.30.
    s.ledger.replica.db
      .insert(transactions)
      .values({
        id: id<"transactions">("66666666-6666-4666-8666-666666666666"),
        date: accountingDate("2026-03-01"),
        type: "income",
        accountId: ACCOUNT_A,
        amountOriginal: money.toMoney("1240.50"),
        currency: PLN,
        fxRate: money.pivotPerUnit("1"),
      })
      .run();
  }

  it("writes one adjustment for the difference — S16 §5's worked example", () => {
    seedComputedBalance();

    const result = write(reconcileAccountExecutor, {
      accountId: ACCOUNT_A,
      adjustmentId: ADJUSTMENT,
      observedBalance: "1198.30",
      asOf: "2026-03-12",
      note: "cash spent, not recorded",
    });

    expect(result.row.type).toBe("adjustment");
    expect(result.row.amountOriginal).toBe("-42.20000000");
    expect(result.row.date).toBe("2026-03-12");
    expect(result.row.note).toBe("cash spent, not recorded");

    // Never a silent overwrite — the account's own balance is still the
    // opening + Σ signed legs, now including the adjustment; `expected_balance`
    // is the separate observation column.
    expect(account(ACCOUNT_A)?.expectedBalance).toBe("1198.30000000");
  });

  it("ignores rows dated after the observation", () => {
    seedComputedBalance();
    // A row the day after `asOf` — must not be folded into `computed`, or
    // reconciling yesterday's statement would absorb today's coffee.
    s.ledger.replica.db
      .insert(transactions)
      .values({
        id: id<"transactions">("77777777-7777-4777-8777-777777777777"),
        date: accountingDate("2026-03-13"),
        type: "expense",
        accountId: ACCOUNT_A,
        amountOriginal: money.toMoney("5.00"),
        currency: PLN,
        fxRate: money.pivotPerUnit("1"),
      })
      .run();

    const result = write(reconcileAccountExecutor, {
      accountId: ACCOUNT_A,
      adjustmentId: ADJUSTMENT,
      observedBalance: "1198.30",
      asOf: "2026-03-12",
    });

    // Same figure as the test above — the row dated the 13th changed nothing.
    expect(result.row.amountOriginal).toBe("-42.20000000");
  });

  it("refuses a zero difference — nothing to reconcile", () => {
    seedComputedBalance();

    expect(() =>
      write(reconcileAccountExecutor, {
        accountId: ACCOUNT_A,
        adjustmentId: ADJUSTMENT,
        observedBalance: "1240.50",
        asOf: "2026-03-12",
      }),
    ).toThrow(/nothing to reconcile/);

    // Only the seeded income row — no adjustment was written.
    const rows = s.ledger.replica.db.select().from(transactions).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe("income");
  });

  it("refuses reconciling an archived account", () => {
    const before = account(ACCOUNT_A);
    write(archiveAccountExecutor, { id: ACCOUNT_A, version: before?.version });

    expect(() =>
      write(reconcileAccountExecutor, {
        accountId: ACCOUNT_A,
        adjustmentId: ADJUSTMENT,
        observedBalance: "5.00",
        asOf: "2026-03-12",
      }),
    ).toThrow(/archived/);
  });
});
