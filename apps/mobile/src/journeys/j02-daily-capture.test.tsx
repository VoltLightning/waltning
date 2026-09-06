/**
 * @vitest-environment jsdom
 *
 * D5 — J02's own acceptance journey: *"the whole daily-capture journey works
 * end to end, offline, inside ten seconds — checked with a stopwatch rather
 * than estimated."* Two tests hold the two numbers the board card asks for
 * (a tap count and a wall clock); the rest of this file is the same script
 * checked for what it must refuse and for the one tap D2's proposal saves.
 *
 * **The keypad path, not the grammar path.** J02 §3 and S05 §3 both say the
 * ten-second target belongs to the keypad, which uses no model — so this
 * file times taps and a Save, never `parseCapture`.
 *
 * Every test mounts the **real** `Today` and `Quick add` screens, through the
 * **real** `TabsShell`, over a **real** `LocalLedgerSession` —
 * `journey-harness.tsx`'s own doc says why a fake port cannot stand in here.
 *
 * Proves: flows/J02-daily-capture.md §3, screens/S05-quick-add.md §3.
 * Findings: none — this is D5's acceptance timing check, not a
 * spec-violation probe, so it carries no `it.fails`.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { LAST_USED_WINDOW_MS } from "@waltning/client/transactions/last-capture";
import { currencyCode, forDisplay, toMoney } from "@waltning/core/money";
import { deleteTransactionInput } from "@waltning/core/registry/inputs";
import { defineLocalExecutor, localRegistry } from "@waltning/ledger/executor";
import { ledgerSchema } from "@waltning/ledger/schema-map";
import { type LocalTx, writeLocally } from "@waltning/ledger/write";
import { decimalMark } from "@waltning/ui/i18n/locales";
import { installPhoneLayout, settleLayout } from "@waltning/ui/shell/floating-add.test-support";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lastCapture } from "../platform";
import type { JourneyRouterStub } from "./journey-harness";

// Module scope, before the first render — `react-native-web` creates its
// `ResizeObserver` once and keeps it (`tabs-shell.test.tsx`'s own comment),
// which is why `FloatingAdd` — this journey's own `+` — needs it installed
// before anything renders.
installPhoneLayout();

const switchTab = { today: vi.fn(), ledger: vi.fn(), debt: vi.fn(), settings: vi.fn() };
const focused: "today" | "ledger" | "debt" = "today";

vi.mock("expo-router/ui", () => ({
  useTabTrigger: ({ name }: { name: "today" | "ledger" | "debt" }) => ({
    trigger: { isFocused: name === focused },
    switchTab: switchTab[name],
  }),
}));

/**
 * The stub currently under test — reassigned by `setupJourney()` per `it()`.
 * `expo-router`'s mock below closes over this binding rather than a value, so
 * the mock factory (invoked once, lazily, on first import) never goes stale.
 */
let currentStub: JourneyRouterStub | null = null;

vi.mock("expo-router", () => ({
  get router() {
    if (!currentStub) throw new Error("journey harness: no router stub installed for this test");
    return currentStub.router;
  },
  useLocalSearchParams: () => currentStub?.useLocalSearchParams() ?? {},
}));

const { JourneyHarness, createJourneyLedger, createJourneyRouterStub, seedJourneyFixture } =
  await import("./journey-harness");
type JourneyLedger = ReturnType<typeof createJourneyLedger>;

/**
 * `2026-09-04T09:00:00Z` — a fixed instant, not a boundary near midnight in
 * any timezone this suite is likely to run in. Only `Date` is faked
 * (`vi.useFakeTimers({ toFake: ["Date"] })`, matching `transaction-ops.
 * test.ts`'s own pattern): `performance.now()` and every timer stay real,
 * because the wall-clock test needs the real one.
 */
const NOW = new Date("2026-09-04T09:00:00Z");

const openLedgers: JourneyLedger[] = [];

function setupJourney() {
  const ledger = createJourneyLedger();
  openLedgers.push(ledger);
  const fixture = seedJourneyFixture(ledger);
  const stub = createJourneyRouterStub();
  currentStub = stub;
  return { ledger, fixture, stub };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  currentStub = null;
  for (const ledger of openLedgers.splice(0)) ledger.close();
});

/** Counts every press this script makes — J02 §1's "a dozen taps" is a tap count, not an estimate. */
function createTapScript() {
  let taps = 0;
  const tap = (role: "button" | "radio", name: string | RegExp) => {
    fireEvent.click(screen.getByRole(role, { name }));
    taps += 1;
  };
  return { tap, count: () => taps };
}

/** `Keypad`'s own glyphs — `.` is English's decimal mark, mapped to the canonical `,` key. */
function tapAmount(tap: ReturnType<typeof createTapScript>["tap"]) {
  for (const glyph of ["4", "8", ".", "9", "0"]) tap("button", glyph);
}

function readTransactions(ledger: JourneyLedger) {
  return ledger.scratch.ledger.replica.db.select().from(ledgerSchema.transactions).all();
}

function readAppliedSeq(ledger: JourneyLedger): number {
  const [row] = ledger.scratch.ledger.replica.db.select().from(ledgerSchema.localMeta).all();
  if (!row) throw new Error("local_meta holds no row");
  return row.appliedSeq;
}

function readOutboxEntries(ledger: JourneyLedger) {
  return ledger.scratch.ledger.outbox.db.select().from(ledgerSchema.outbox).all();
}

/**
 * M3 — the two assertions in the test above hold on every *successful*
 * write, whether or not the entry genuinely committed before the row: a
 * bug that reordered `write.ts`'s two commits would still leave both rows
 * behind Save and pass them. Proving the crash-window shape needs a write
 * that actually fails between the two commits — this executor is that
 * failure, registered on its own so nothing about the journey's real
 * `create_transaction` executor is touched.
 */
type JourneyTx = LocalTx<Database.RunResult, typeof ledgerSchema>;
// `deleteTransactionInput`'s own tiny `{id, version}` shape, reused rather
// than a bespoke schema — this executor never applies it, so any already-
// registered input schema does the job and nothing here needs its own
// dependency on `zod` directly.
const crashesAfterIntent = defineLocalExecutor<typeof deleteTransactionInput, never, JourneyTx>({
  operation: "j02_crash_after_intent",
  opVersion: 1,
  input: deleteTransactionInput,
  mints: () => [],
  apply: (): never => {
    throw new Error("the replica half failed");
  },
});
const CRASH_REGISTRY = localRegistry<JourneyTx>([crashesAfterIntent]);

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const lower = sorted[mid - 1];
  const upper = sorted[mid];
  if (upper === undefined) throw new Error("median of an empty sample");
  return sorted.length % 2 === 0 && lower !== undefined ? (lower + upper) / 2 : upper;
}

describe("J02 — daily capture, under ten seconds, offline", () => {
  /**
   * The dozen-taps card, warm: `+`, five keypad digits, the account chip
   * already filled from `lastCapture` (S05 §9.2's four-hour window — zero
   * taps), the category chip opened and `Eating out` picked, Save. Nine taps,
   * inside the dozen `02-tokens` §2's own "a capture is a dozen taps" names.
   */
  it("captures 48.90 PLN to Eating out in 9 taps from a warm account chip, intent committed before the replica row (architecture/14 §14.6)", async () => {
    const { ledger, fixture, stub } = setupJourney();
    await lastCapture.set({ accountId: fixture.cashAccountId, at: Date.now() });
    const appliedSeqBefore = readAppliedSeq(ledger);

    render(<JourneyHarness controller={ledger.controller} stub={stub} />);
    await settleLayout();

    const { tap, count } = createTapScript();
    tap("button", "Add"); // S04's `+`
    tapAmount(tap); // 4 8 . 9 0 — five taps
    // account chip: already last-used, inside the window — zero taps
    tap("button", /^Category/);
    tap("radio", "Eating out");
    tap("button", "Save");

    expect(count()).toBe(9);
    expect(count()).toBeLessThanOrEqual(12);

    await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).toBeNull());
    expect(stub.getRoute()).toBe("today");

    const today = deviceRuntime().capture().date;
    const rows = readTransactions(ledger);
    const captured = rows.find(
      (row) =>
        row.amountOriginal === "48.90000000" && row.categoryId === fixture.eatingOutCategoryId,
    );
    if (!captured) throw new Error("the capture never reached the replica");
    expect(captured.type).toBe("expense");
    expect(captured.accountId).toBe(fixture.cashAccountId);
    expect(captured.date).toBe(today);
    expect(captured.deletedAt).toBeNull();

    // §14.6: "intent commits first" — the outbox entry that names this row
    // exists, and `local_meta.applied_seq` (advanced in the same transaction
    // as the replica row it describes) has caught up to it.
    const entries = readOutboxEntries(ledger);
    const maxSeq = entries.reduce((max, entry) => Math.max(max, entry.seq), 0);
    const entry = entries.find((row) => row.seq === maxSeq);
    if (!entry) throw new Error("the outbox holds no entry for this capture");
    expect(entry.operation).toBe("create_transaction");
    const appliedSeqAfter = readAppliedSeq(ledger);
    expect(appliedSeqAfter).toBeGreaterThan(appliedSeqBefore);
    expect(appliedSeqAfter).toBe(maxSeq);
  });

  /**
   * M3 — the test above only ever runs the happy path: whatever order
   * `write.ts` actually commits in, a *successful* write leaves both an
   * entry and a row behind Save, so that assertion cannot fail on ordering.
   * This one forces the failure §14.6 names — the crash between the two
   * commits — over the same journey ledger, and checks the shape that
   * survives it: the outbox entry exists, and `local_meta.applied_seq`
   * never advanced to claim a row that was never written.
   */
  it("keeps the outbox entry and holds the watermark back when the replica half fails (architecture/14 §14.6)", async () => {
    const { ledger } = setupJourney();
    const appliedSeqBefore = readAppliedSeq(ledger);
    const entriesBefore = readOutboxEntries(ledger).length;

    expect(() =>
      writeLocally(ledger.scratch.ledger, {
        executor: crashesAfterIntent,
        registry: CRASH_REGISTRY,
        input: { id: "11111111-1111-4111-8111-111111111111", version: 1 },
        capture: deviceRuntime().capture(),
      }),
    ).toThrow("the replica half failed");

    const entries = readOutboxEntries(ledger);
    expect(entries.length).toBe(entriesBefore + 1);
    const entry = entries.find((row) => row.operation === "j02_crash_after_intent");
    if (!entry) throw new Error("the outbox holds no entry for the forced crash");
    // The watermark stayed behind the entry it should have caught up to —
    // the crash-window shape, not merely "nothing changed".
    expect(readAppliedSeq(ledger)).toBe(appliedSeqBefore);
    expect(readAppliedSeq(ledger)).toBeLessThan(entry.seq);
  });

  /**
   * The same script, cold: `lastCapture` outside the four-hour window
   * (S05 §9.2), so the account chip opens empty and Save stays disabled
   * until it is chosen. Choosing a chip that starts empty is always two
   * presses — open the sheet, then pick a row — so this costs two more than
   * the warm case above, eleven against the twelve-tap ceiling rather than
   * the plan's own "+1" (which counted the pick and not the open).
   */
  it("costs two more taps once the account chip has gone cold, still inside the dozen", async () => {
    const { ledger, fixture, stub } = setupJourney();
    await lastCapture.set({
      accountId: fixture.cashAccountId,
      at: Date.now() - LAST_USED_WINDOW_MS - 1000,
    });

    render(<JourneyHarness controller={ledger.controller} stub={stub} />);
    await settleLayout();

    const { tap, count } = createTapScript();
    tap("button", "Add");
    tapAmount(tap);
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);

    tap("button", "Account");
    tap("radio", "Cash · PLN");
    tap("button", /^Category/);
    tap("radio", "Eating out");
    tap("button", "Save");

    expect(count()).toBe(11);
    expect(count()).toBeLessThanOrEqual(12);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).toBeNull());
  });

  /**
   * J02 §7's target is ten seconds for a *person* — thumb travel, reading
   * the screen, deciding. This bounds the machine's own share of that
   * budget instead: a scripted `fireEvent` run carries no human latency, so
   * what this catches is regression in the write path itself. 3 000 ms is
   * three-tenths of the human budget — generous enough not to flake on a
   * loaded CI box, tight enough to fail on anything resembling ten seconds.
   */
  const MACHINE_BUDGET_MS = 3000;

  /**
   * M4 — RTL's `waitFor` defaults to a 1 s timeout, well under
   * `MACHINE_BUDGET_MS`: a write path slower than the budget but faster than
   * one second would still pass, because the assertion itself gave up first.
   * Passing the budget (plus slack for the assertion's own retry granularity)
   * as this `waitFor`'s own timeout is what makes `MACHINE_BUDGET_MS` the
   * actual gate rather than a number nothing enforces.
   */
  const WAIT_FOR_TIMEOUT = { timeout: MACHINE_BUDGET_MS + 500 };

  /** One full run of the warm script, `performance.now()` from `+` to Today showing the new row. */
  async function timeOneCapture(): Promise<number> {
    const { ledger, fixture, stub } = setupJourney();
    await lastCapture.set({ accountId: fixture.cashAccountId, at: Date.now() });

    const view = render(<JourneyHarness controller={ledger.controller} stub={stub} />);
    await settleLayout();

    const start = performance.now();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    for (const glyph of ["4", "8", ".", "9", "0"]) {
      fireEvent.click(screen.getByRole("button", { name: glyph }));
    }
    fireEvent.click(screen.getByRole("button", { name: /^Category/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Eating out" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    // The harness never wraps `I18nProvider`, so `useLocale()` falls back to
    // `"en"` (`provider.tsx`'s own doc) — `decimalMark("en")` rather than a
    // hardcoded `"."` is what keeps this assertion honest if that ever changes.
    const expected = forDisplay(toMoney("48.90"), 2, decimalMark("en"));
    await waitFor(
      () => expect(document.body.textContent ?? "").toContain(expected),
      WAIT_FOR_TIMEOUT,
    );
    const elapsed = performance.now() - start;

    // Each run mounts its own tree — RTL only auto-cleans up `afterEach` the
    // whole test, and this test calls `render()` three times.
    view.unmount();
    return elapsed;
  }

  it(`keypad-to-Save lands under ${MACHINE_BUDGET_MS}ms, median of three (J02 §7: "under 10 seconds, tap + to Save")`, async () => {
    const samples = [await timeOneCapture(), await timeOneCapture(), await timeOneCapture()];
    expect(median(samples)).toBeLessThan(MACHINE_BUDGET_MS);
  });

  /**
   * H1 — a proposal at or above `PROPOSAL_DISPLAY_THRESHOLD` **is** the
   * draft's category the moment it fills, never only a suggestion the sheet
   * has to confirm: the payee chip's fold matches the fixture's prior
   * "Corner Café" capture exactly (confidence 1), so this test never opens
   * the category sheet at all — Save alone is enough, and the P2 trail
   * (S05 §8) says where the value came from and offers Undo.
   */
  it("saves the proposed category without opening the sheet, confidence at threshold (H1, D2)", async () => {
    const { ledger, fixture, stub } = setupJourney();
    await lastCapture.set({ accountId: fixture.cashAccountId, at: Date.now() });

    render(<JourneyHarness controller={ledger.controller} stub={stub} />);
    await settleLayout();

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    for (const glyph of ["4", "8", ".", "9", "0"]) {
      fireEvent.click(screen.getByRole("button", { name: glyph }));
    }

    fireEvent.click(screen.getByRole("button", { name: "+ Payee" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Payee" }), {
      target: { value: "Corner Café" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    // The chip itself carries the proposal — no sheet needs to be open to see it.
    expect(screen.getByText("Eating out")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Category: Eating out, filled automatically" }),
    ).toBeDefined();
    // P2's trail: what produced it, in one line, with Undo (S05 §8).
    expect(screen.getByText("From your history: Corner Café")).toBeDefined();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDefined();

    // No tap on the sheet, no tap on the proposal row — straight to Save.
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).toBeNull());

    const rows = readTransactions(ledger);
    const captured = rows.find(
      (row) => row.payee === "Corner Café" && row.amountOriginal === "48.90000000",
    );
    expect(captured?.categoryId).toBe(fixture.eatingOutCategoryId);
  });

  /**
   * H1-b — the auto-fill used to ignore `composerType`: switching to Income
   * after an expense proposal auto-filled left the chip empty but still
   * sent the stale expense leaf's id on Save. `Eating out` is `kind:
   * "expense"` (the fixture above), so once the type toggle reads
   * "Income" the proposal no longer matches and the draft's category must
   * go back to unset, not silently keep the expense category.
   */
  it("clears an auto-filled category when the type switches away from its own kind (H1-b)", async () => {
    const { ledger, fixture, stub } = setupJourney();
    await lastCapture.set({ accountId: fixture.cashAccountId, at: Date.now() });

    render(<JourneyHarness controller={ledger.controller} stub={stub} />);
    await settleLayout();

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    for (const glyph of ["4", "8", ".", "9", "0"]) {
      fireEvent.click(screen.getByRole("button", { name: glyph }));
    }
    fireEvent.click(screen.getByRole("button", { name: "+ Payee" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Payee" }), {
      target: { value: "Corner Café" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    // Auto-filled, expense side (this file's own test above pins this state).
    expect(
      screen.getByRole("button", { name: "Category: Eating out, filled automatically" }),
    ).toBeDefined();

    // The type toggle — top-right, S05 §9.1's own escape hatch.
    fireEvent.click(screen.getByRole("button", { name: "Expense" }));

    // The chip goes back to plain, unfilled — `Eating out` is an expense
    // category and no longer matches `type: "income"`.
    expect(screen.queryByRole("button", { name: /Category: Eating out/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Category" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).toBeNull());

    const rows = readTransactions(ledger);
    const captured = rows.find((row) => row.payee === "Corner Café" && row.type === "income");
    expect(captured?.categoryId).toBeNull();
  });

  /**
   * §14.6: a capture on a currency the replica cannot value is refused
   * *before* Save, with the currency named — the refusal asked in advance
   * (`readCurrencies#capturable`) rather than thrown from inside the write,
   * which on a phone with no backend would otherwise leave an outbox entry
   * that drains nowhere. Nothing here seeds a rate for EUR, so the account
   * this test opens is uncapturable by construction.
   */
  it("refuses a capture on an uncapturable account before Save, naming the currency, nothing added to the outbox", async () => {
    const { ledger, fixture, stub } = setupJourney();
    await lastCapture.set({
      accountId: fixture.cashAccountId,
      at: Date.now() - LAST_USED_WINDOW_MS - 1000,
    });
    const eur = ledger.controller.createAccount({
      name: "Bank A · EUR",
      currency: currencyCode("EUR"),
      kind: "bank",
      ownership: "own",
      isBusiness: false,
      openingBalance: "0",
      openingDate: null,
      memo: "",
      groupId: null,
    });
    if (!("id" in eur)) throw new Error("could not seed the uncapturable account");

    render(<JourneyHarness controller={ledger.controller} stub={stub} />);
    await settleLayout();
    const outboxBefore = readOutboxEntries(ledger).length;

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    for (const glyph of ["4", "8", ".", "9", "0"]) {
      fireEvent.click(screen.getByRole("button", { name: glyph }));
    }
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    fireEvent.click(screen.getByRole("radio", { name: "Bank A · EUR" }));
    fireEvent.click(screen.getByRole("button", { name: /^Category/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Eating out" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      screen.getByText("EUR needs an exchange rate before a transaction can be recorded in it."),
    ).toBeDefined();
    expect(stub.getRoute()).toBe("quick-add");
    expect(readOutboxEntries(ledger).length).toBe(outboxBefore);
  });
});
