/**
 * @vitest-environment jsdom
 *
 * D5 — J10's own acceptance journey: *"the rate shown for a date is the rate
 * a capture on that date is priced with"* — the real `SettingsRatesScreen`
 * and `QuickAdd` screens, mounted over a real `LocalLedgerSession` the same
 * way `journey-harness.tsx`'s own doc argues a write path must be.
 *
 * Proves: flows/J10-currency-and-rates.md, screens/S18-settings-exchange-
 * rates.md §3–§5.
 * Findings: R1 H1-r4 — fixed by #119 (a Sunday capture is priced at Monday's
 * rate), R1 L5-r5 — fixed by #119 (the rates screen and a capture on that
 * date disagree).
 *
 * **`USD` is this ledger's pivot** (`@waltning/core/currencies`), not a
 * quoted currency — it carries no `fx_rates` row and no Settings › Rates
 * table of its own (§7.0: "invisible… appears in no screen"), so the brief's
 * own "capture 100 USD" cannot be this scenario: there is no rate for a
 * pivot capture to be priced *at*, carried or otherwise. `PLN` is what this
 * fixture already prices (`journey-harness.tsx`'s own manual rate), so this
 * file seeds Friday/Saturday/Sunday at one rate and Monday at a different
 * one for `PLN` and captures in it instead — the same question, on the
 * currency this ledger can actually ask it about.
 *
 * **`transaction-detail-screen.tsx` shows no rate at all** — its own doc
 * says why: "`FxAmount`'s full basis… is not built… no rate table". There is
 * no "reference line" to read, and `PhoneTransactionDetail` carries no
 * `fxRate` field either, so the controller ruling's escape hatch applies:
 * the rate a capture actually priced at is read off the replica directly
 * (`ledger.scratch`, the same raw query `j02-daily-capture.test.tsx`'s own
 * outbox/local_meta assertions already use), never invented UI.
 */

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import * as money from "@waltning/core/money";
import { ledgerSchema } from "@waltning/ledger/schema-map";
import { installPhoneLayout, settleLayout } from "@waltning/ui/shell/floating-add.test-support";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lastCapture } from "../platform";
import type { JourneyRouterStub } from "./journey-harness";

/**
 * `formatRate`'s own formula (`packages/ui/src/fx/format-rate.ts`), matched
 * rather than imported — `fx/*`'s public surface is `.tsx` only
 * (`packages/ui/package.json`'s own `exports` map), and this file is a
 * journey, not a screen or a component, so it does not gain a new export.
 * 4dp, always — the same rule `RateTable`'s own doc states.
 */
function formatRate(rate: string): string {
  return money.forDisplay(money.toMoney(rate), 4, ".");
}

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
 * A Thursday, comfortably after the Friday–Monday week this journey seeds —
 * `2026-09-04` is a Friday, `2026-09-06` a Sunday, `2026-09-07` a Monday, and
 * capturing on the Sunday from here is a backdate, not a future date the
 * capture flow would refuse.
 */
const NOW = new Date("2026-09-10T09:00:00Z");

const FRIDAY = "2026-09-04";
const SUNDAY = "2026-09-06";
const MONDAY = "2026-09-07";

/**
 * Friday's own rate, held across Friday–Sunday as one range write
 * (`setupJourney`, below) — real, held rows RateTable can show, never a gap
 * it would fill in on its own.
 */
const FRIDAY_RATE = "4.1234";
/** Monday's own, different rate — real, not carried. */
const MONDAY_RATE = "4.5678";

const openLedgers: JourneyLedger[] = [];

function setupJourney() {
  const ledger = createJourneyLedger();
  openLedgers.push(ledger);
  const fixture = seedJourneyFixture(ledger);
  const { controller } = ledger;

  // Friday through Sunday, one range write — `set_manual_rate` (S18's own
  // op) writes one row per day across it (`set-manual-rate.executor.ts`),
  // so Sunday's own row is real, held data — never a gap `RateTable` would
  // fill in — and it carries Friday's own rate, unchanged across the
  // weekend.
  const today = deviceRuntime().capture().date;
  const fridayThroughSunday = controller.setManualRate({
    base: "USD",
    quote: "PLN",
    from: FRIDAY,
    to: SUNDAY,
    rate: FRIDAY_RATE,
    overwriteManual: true,
    today,
  });
  if ("fieldErrors" in fridayThroughSunday) {
    throw new Error("journey: friday-through-sunday rate refused");
  }
  const monday = controller.setManualRate({
    base: "USD",
    quote: "PLN",
    from: MONDAY,
    to: MONDAY,
    rate: MONDAY_RATE,
    overwriteManual: true,
    today,
  });
  if ("fieldErrors" in monday) throw new Error("journey: monday's rate refused");

  // `lastKnownRate` (`create-transaction.executor.ts`) is deliberately not
  // date-filtered — it always answers the single latest-dated row in the
  // whole table, which by this fixture's own "now" (`NOW`, below) is
  // *today*, not Monday. Pinned to Monday's own value here so "priced at
  // Monday's rate" is literally what the replica holds as its latest row,
  // rather than an incidental fixture date winning the same race for a
  // different reason.
  const pinnedToday = controller.setManualRate({
    base: "USD",
    quote: "PLN",
    from: today,
    to: today,
    rate: MONDAY_RATE,
    overwriteManual: true,
    today,
  });
  if ("fieldErrors" in pinnedToday) throw new Error("journey: today's rate refused");

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

describe("J10 — currency and rates", () => {
  it("R1 H1-r4 — a Sunday capture is priced at Monday's rate, not the rate Settings › Rates shows for Sunday's own date", async () => {
    const { ledger, fixture, stub } = setupJourney();
    await lastCapture.set({ accountId: fixture.cashAccountId, at: Date.now() });
    stub.pushWithParams("rates", {});

    render(<JourneyHarness controller={ledger.controller} stub={stub} />);
    await settleLayout();

    // S18 — the quote picker, over PLN. The picker defaults to the first
    // currency alphabetically (`settings-rates-screen.tsx`'s own
    // `quoteOptions[0]`), so this opens it by its label rather than
    // assuming which one that is.
    fireEvent.click(screen.getByRole("button", { name: /^Quote, against USD/ }));
    fireEvent.click(screen.getByRole("radio", { name: "PLN · Polish Złoty" }));

    // The default 30-day range renders through a bare `FlatList`
    // (`rate-table.tsx`'s own doc: "no virtualisation library"), which
    // still only mounts its own initial window under jsdom — Sunday, 4
    // days back, is well inside 30 rows but not inside that window. A
    // tight custom range (`fx.rangeFrom`/`fx.rangeTo`) sidesteps the
    // question entirely rather than asserting on `FlatList`'s own
    // internals.
    fireEvent.change(screen.getByRole("textbox", { name: "From" }), {
      target: { value: FRIDAY },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "To" }), {
      target: { value: MONDAY },
    });

    // Sunday's own row — carried across the weekend gap from Friday's
    // rate, never Monday's (S18 §3–§5, screens/S18 §3–§5).
    const sundayRow = screen.getByRole("button", { name: SUNDAY });
    const shownRateText = within(sundayRow).getByText(formatRate(FRIDAY_RATE));
    expect(shownRateText).toBeDefined();

    // Capture 100.00 PLN dated Sunday — the date control quick-add
    // exposes (`quick-add-screen.tsx`'s own Chip → `DateField`), typed
    // directly since Sunday is further back than the field's own
    // Today/Yesterday/two-days-ago shortcuts reach from this fixed "now".
    act(() => stub.pushWithParams("quick-add", {}));
    await settleLayout();

    for (const glyph of ["1", "0", "0"]) {
      fireEvent.click(screen.getByRole("button", { name: glyph }));
    }
    fireEvent.click(screen.getByRole("button", { name: /^Date/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Date" }), {
      target: { value: SUNDAY },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: /^Category/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Eating out" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).toBeNull());

    // The rate the capture was actually priced with — read off the
    // replica directly (`transaction-detail-screen.tsx` shows none; see
    // the file header). `transactions.fxRate` is pivot-per-unit; `fx_rates
    // .rate` (and `formatRate`, and the row read above) is units-per-pivot
    // — `money.reciprocal` is the one sanctioned crossing
    // (`create-transaction.executor.ts`'s own comment).
    const rows = ledger.scratch.ledger.replica.db.select().from(ledgerSchema.transactions).all();
    const captured = rows.find(
      (row) => row.date === SUNDAY && row.amountOriginal === "100.00000000",
    );
    if (!captured) throw new Error("the capture never reached the replica");
    const pricedRate = formatRate(money.reciprocal(money.pivotPerUnit(captured.fxRate)));

    // What S18 itself shows for Sunday's own date — the same text read
    // above, off the real screen.
    expect(pricedRate).toBe(formatRate(FRIDAY_RATE));
  });
});
