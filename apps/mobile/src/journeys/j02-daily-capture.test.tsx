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
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { LAST_USED_WINDOW_MS } from "@waltning/client/transactions/last-capture";
import { currencyCode } from "@waltning/core/money";
import { ledgerSchema } from "@waltning/ledger/schema-map";
import { installPhoneLayout, settleLayout } from "@waltning/ui/shell/floating-add.test-support";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lastCapture } from "../platform";
import type { JourneyRouterStub } from "./journey-harness";

// Module scope, before the first render — `react-native-web` creates its
// `ResizeObserver` once and keeps it (`tabs-shell.test.tsx`'s own comment),
// which is why `FloatingAdd` — this journey's own `+` — needs it installed
// before anything renders.
installPhoneLayout();

const switchTab = { today: vi.fn(), ledger: vi.fn(), calendar: vi.fn(), debt: vi.fn() };
const focused: "today" | "ledger" | "calendar" | "debt" = "today";

vi.mock("expo-router/ui", () => ({
  useTabTrigger: ({ name }: { name: "today" | "ledger" | "calendar" | "debt" }) => ({
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
    tap("radio", "Account: Cash · PLN");
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
    await waitFor(() => expect(document.body.textContent ?? "").toContain("48.90"));
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
   * D2's whole point: the payee chip's fold matches the fixture's prior
   * "Costa" capture exactly, so the category chip fills as a proposal at
   * confidence 1 before the category chip is ever tapped — and accepting it
   * is the one tap on the proposal row itself, never a second confirm and
   * never a search through the flat leaf list.
   */
  it("proposes Eating out at confidence 1 from the payee, and accepting it costs one tap (D2)", async () => {
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
      target: { value: "Costa" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    // The chip itself carries the proposal — no sheet needs to be open to see it.
    expect(screen.getByText("Eating out")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Category: Eating out, filled automatically" }),
    ).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /^Category/ }));
    expect(screen.getByRole("button", { name: "Suggested: Eating out" })).toBeDefined();
    expect(screen.getByText("100%")).toBeDefined();

    // Accepting: one tap on the proposal row, and the sheet closes on its own.
    fireEvent.click(screen.getByRole("button", { name: "Suggested: Eating out" }));
    expect(screen.getByRole("button", { name: "Category: Eating out" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).toBeNull());

    const rows = readTransactions(ledger);
    const captured = rows.find(
      (row) => row.payee === "Costa" && row.amountOriginal === "48.90000000",
    );
    expect(captured?.categoryId).toBe(fixture.eatingOutCategoryId);
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
    fireEvent.click(screen.getByRole("radio", { name: "Account: Bank A · EUR" }));
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
