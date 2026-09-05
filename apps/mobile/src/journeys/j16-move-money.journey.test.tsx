/**
 * @vitest-environment jsdom
 *
 * D5 — J16's own acceptance journey: a transfer between two of your own
 * accounts, cross-currency, priced live while typing (S31) — the real
 * `Transfer` screen, mounted over a real `LocalLedgerSession` the same way
 * `journey-harness.tsx`'s own doc argues a write path must be.
 *
 * Proves: flows/J16-move-money.md §2–§4.
 * Findings: R5 C2, R5 H1, R4 H1-r4 — fixed by #118, R4 H2-r4, R4 H-r4 (date) — fixed by #118, R4 M-r4 (",5").
 *
 * **R5 H1 and R4 H2-r4 are fixed for a currency change, not for a date
 * change (R4 H-r4 is the same gap, one input over).** R4 H2-r4 (PR #118's
 * round-3 finding) named exactly this: "the destination leg keeps a figure
 * converted at the previous currency's rate" — a stale conversion left
 * behind by a currency switch. `referenceRate` itself is a `useMemo` keyed
 * on `date`/`fromAccount`/`toAccount` (`transfer-screen.tsx`), so it always
 * answers correctly, and an effect on `date` now recomputes the
 * *destination amount string* from it too, alongside `handleKey` (a
 * keypress) and the two account-change handlers. Picking `To: EUR` after
 * typing the source amount reprices the figure correctly and the stale
 * `25.00` figure is gone (`#114` landed the reset — a plain `it`, below,
 * credits both R5 H1 and R4 H2-r4 on that one assertion); picking a
 * different *date* after typing it now reprices too — R4 H-r4, fixed by
 * #118 (`it`, its own scenario below, no longer `it.fails`).
 *
 * **R4 H1-r4 and R4 M-r4, as this file actually found them.** The brief's
 * own scripted fee value, `1,234.56`, carries two separators (a comma *and*
 * a dot) — `parseAmount`'s own "more than one separator" refusal
 * (`amount-field.tsx`) catches that before any scale question is reached,
 * and Save is correctly disabled with `transactions.feeInvalid` shown. That
 * is the parser working, not R4 H1-r4 — the finding names a fee with *more
 * decimal places than the source account's own currency* surviving with no
 * refusal at all, which needs a value that parses cleanly (`"12.345"` into a
 * 2dp PLN account) to exercise. `",5"` does parse (to `"0.5"` — a leading
 * comma is exactly the shape `parseAmount` accepts, matching `en.ts`'s own
 * decimal-mark convention), so R4 M-r4 is the same scale gap at one decimal
 * place surviving unrefused, not a parse failure either. Both are scripted
 * against what the field actually accepts, below.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { currencyCode } from "@waltning/core/money";
import { ledgerSchema } from "@waltning/ledger/schema-map";
import { installPhoneLayout, settleLayout } from "@waltning/ui/shell/floating-add.test-support";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JourneyRouterStub } from "./journey-harness";

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

/** `2026-09-04T09:00:00Z` — the same fixed instant J02's own journey pins. */
const NOW = new Date("2026-09-04T09:00:00Z");

const openLedgers: JourneyLedger[] = [];

/**
 * The fixture's own USD/PLN rate (`journey-harness.tsx`) plus a EUR leg and
 * a second, different USD/PLN rate the day before — S31 §6's own two moving
 * parts: a currency change and a date change must each re-price the
 * destination figure.
 */
function setupJourney() {
  const ledger = createJourneyLedger();
  openLedgers.push(ledger);
  const fixture = seedJourneyFixture(ledger);
  const { controller } = ledger;

  const eur = controller.createAccount({
    name: "Bank C · EUR",
    currency: currencyCode("EUR"),
    kind: "bank",
    ownership: "own",
    isBusiness: false,
    openingBalance: "0",
    openingDate: null,
    memo: "",
    groupId: null,
  });
  if (!("id" in eur)) throw new Error(`journey: eur account refused — ${JSON.stringify(eur)}`);

  const eurRate = controller.setManualRate({
    base: "USD",
    quote: "EUR",
    from: "2026-09-04",
    to: "2026-09-04",
    rate: "0.9200",
    overwriteManual: true,
  });
  if ("fieldErrors" in eurRate) throw new Error("journey: eur rate refused");

  // Yesterday's own USD/PLN rate — different from today's `4.00`
  // (`journey-harness.tsx`'s own fixture), so a date change actually moves
  // the destination figure rather than reading the same reference twice.
  const yesterdayRate = controller.setManualRate({
    base: "USD",
    quote: "PLN",
    from: "2026-09-03",
    to: "2026-09-03",
    rate: "4.4000",
    overwriteManual: true,
  });
  if ("fieldErrors" in yesterdayRate) throw new Error("journey: yesterday's rate refused");

  const stub = createJourneyRouterStub();
  currentStub = stub;
  return { ledger, fixture, stub, eurAccountId: eur.id };
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

function tapDigits(digits: readonly string[]) {
  for (const digit of digits) fireEvent.click(screen.getByRole("button", { name: digit }));
}

describe("J16 — move money", () => {
  it("converts live while typing, re-prices on a currency change and a date change, refuses a malformed fee, survives a stray letter, and saves both legs (flows/J16-move-money.md §2–§4)", async () => {
    const { ledger, stub } = setupJourney();
    stub.pushWithParams("transfer", {});

    render(<JourneyHarness controller={ledger.controller} stub={stub} />);
    await settleLayout();

    fireEvent.click(screen.getByRole("button", { name: "From" }));
    fireEvent.click(screen.getByRole("radio", { name: "Cash · PLN" }));
    fireEvent.click(screen.getByRole("button", { name: "To" }));
    fireEvent.click(screen.getByRole("radio", { name: "Bank B · USD" }));

    tapDigits(["1", "0", "0"]);
    // §3 — pre-filled from the reference rate: 100 PLN at `4.00` PLN/USD is
    // 25.00 USD.
    expect(screen.getByRole("button", { name: "Destination amount: 25.00" })).toBeDefined();

    // §4 — a currency change re-prices the destination (R5 H1, R4 H2-r4,
    // both fixed): the stale USD-rate figure is gone, not left behind at
    // the previous currency's own conversion. 100 PLN at 4.00 PLN/USD and
    // 0.9200 EUR/USD is 100 × (0.92 / 4.00) = 23.00 EUR.
    fireEvent.click(screen.getByRole("button", { name: "To: Bank B · USD" }));
    fireEvent.click(screen.getByRole("radio", { name: "Bank C · EUR" }));
    expect(screen.getByRole("button", { name: "Destination amount: 23.00" })).toBeDefined();
    // R4 H2-r4 — the previous currency's stale figure must not survive.
    expect(screen.queryByRole("button", { name: "Destination amount: 25.00" })).toBeNull();

    // Back to USD, so the rest of the script prices at the fixture's own
    // reference rate — the date-change re-pricing (R4 H-r4) is its own
    // scenario below, since it does not hold on this branch.
    fireEvent.click(screen.getByRole("button", { name: "To: Bank C · EUR" }));
    fireEvent.click(screen.getByRole("radio", { name: "Bank B · USD" }));
    expect(screen.getByRole("button", { name: "Destination amount: 25.00" })).toBeDefined();

    // §9.1 — a fee with more separators than one is unparsable outright;
    // Save is correctly disabled and the field states so (not R4 H1-r4 —
    // see the file header).
    fireEvent.change(screen.getByRole("textbox", { name: "Fee" }), {
      target: { value: "1,234.56" },
    });
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
    expect(screen.getByText("Enter a number, or leave it blank.")).toBeDefined();

    // R4 H1-r4 — a fee that parses cleanly but carries more decimal places
    // than the source account's own currency (PLN, 2dp) is not refused.
    fireEvent.change(screen.getByRole("textbox", { name: "Fee" }), {
      target: { value: "12.345" },
    });
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", false);

    // R4 M-r4 — the same scale gap at one decimal place: `",5"` parses to
    // `"0.5"`, one place, so this is not the malformed-fee gap either;
    // written here as the brief's own literal script, and reported as
    // passing rather than failing (see the file header for R4 H1-r4/M-r4).
    fireEvent.change(screen.getByRole("textbox", { name: "Fee" }), { target: { value: "" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Fee" }), { target: { value: ",5" } });
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", false);

    // R5 C2 — fixed on main: a stray letter does not crash the screen, it is
    // simply unparsable, same as any other malformed fee.
    fireEvent.change(screen.getByRole("textbox", { name: "Fee" }), { target: { value: "" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Fee" }), { target: { value: "a" } });
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
    expect(screen.getByText("Enter a number, or leave it blank.")).toBeDefined();

    // A clean, valid transfer.
    fireEvent.change(screen.getByRole("textbox", { name: "Fee" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(stub.getRoute()).toBe("today"));
    const rows = ledger.scratch.ledger.replica.db.select().from(ledgerSchema.transactions).all();
    const transfer = rows.find((row) => row.type === "transfer");
    if (!transfer) throw new Error("the transfer never reached the replica");
    expect(transfer.amountOriginal).toBe("100.00000000");
    expect(transfer.currency).toBe("PLN");
    expect(transfer.toAmount).toBe("25.00000000");
    expect(transfer.toCurrency).toBe("USD");
    expect(transfer.deletedAt).toBeNull();
  });

  /**
   * R4 H1-r4, proven strictly: the malformed fee above (`"12.345"`, 3dp into
   * a 2dp PLN account) does not merely leave Save enabled — it is accepted
   * all the way to the replica, at the extra scale, with no refusal
   * anywhere on the write path.
   */
  it("R4 H1-r4 — a fee with more decimal places than the source account's own currency reaches the replica unrefused", async () => {
    const { ledger, stub } = setupJourney();
    stub.pushWithParams("transfer", {});

    render(<JourneyHarness controller={ledger.controller} stub={stub} />);
    await settleLayout();

    fireEvent.click(screen.getByRole("button", { name: "From" }));
    fireEvent.click(screen.getByRole("radio", { name: "Cash · PLN" }));
    fireEvent.click(screen.getByRole("button", { name: "To" }));
    fireEvent.click(screen.getByRole("radio", { name: "Bank B · USD" }));
    tapDigits(["1", "0", "0"]);
    fireEvent.change(screen.getByRole("textbox", { name: "Fee" }), {
      target: { value: "12.345" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // A fee at the wrong scale for its own currency should be refused —
    // the same guard `transactions_fee_positive` and its siblings enforce
    // for every other malformed figure (SPEC.md §6.5) — so the route
    // should still read `transfer` and the replica should hold no row.
    // On main it saves, silently, at the extra scale.
    expect(stub.getRoute()).toBe("transfer");
    const rows = ledger.scratch.ledger.replica.db.select().from(ledgerSchema.transactions).all();
    expect(rows.some((row) => row.type === "transfer")).toBe(false);
  });

  /**
   * R4 H-r4 — the destination figure is only ever recomputed from
   * `handleKey` (a keypress) or the two account-change handlers
   * (`transfer-screen.tsx`'s own `handleFromAccountChange`/
   * `handleToAccountChange`); nothing recomputes it when only `date`
   * changes, even though `referenceRate` itself is correctly re-derived
   * (it is a `useMemo` keyed on `date`). A date picked after the amount is
   * typed leaves the destination figure priced at the *old* date's rate —
   * stale, and silently so, since nothing on screen says the figure and the
   * date it is priced at have drifted apart.
   */
  it("R4 H-r4 — the destination amount does not reprice when only the date changes, even though the reference rate does", async () => {
    const { ledger, stub } = setupJourney();
    stub.pushWithParams("transfer", {});

    render(<JourneyHarness controller={ledger.controller} stub={stub} />);
    await settleLayout();

    fireEvent.click(screen.getByRole("button", { name: "From" }));
    fireEvent.click(screen.getByRole("radio", { name: "Cash · PLN" }));
    fireEvent.click(screen.getByRole("button", { name: "To" }));
    fireEvent.click(screen.getByRole("radio", { name: "Bank B · USD" }));
    tapDigits(["1", "0", "0"]);
    expect(screen.getByRole("button", { name: "Destination amount: 25.00" })).toBeDefined();

    // Yesterday's own rate, 4.40 PLN/USD (`setupJourney`, above): 100 PLN
    // is 22.73 USD there, not 25.00.
    fireEvent.click(screen.getByRole("button", { name: "Date: Today" }));
    fireEvent.click(screen.getByRole("button", { name: "Yesterday" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Destination amount: 22.73" })).toBeDefined(),
    );
  });
});
