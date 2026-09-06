/**
 * @vitest-environment jsdom
 *
 * D5 — J07's own acceptance journey: a lent debt, tracked on S12/S13, settled
 * through S14's own sheet — the real `Debt` and `CounterpartyDetail` screens,
 * mounted the way `journey-harness.tsx`'s own doc argues for a real write
 * path (no fake port, offline by construction).
 *
 * Proves: flows/J07-lend-and-settle.md §2–§6 end to end.
 * Findings: R2 H3, R2 H4.
 *
 * **R2 H4 ("balance moved") has no scenario at the ledger level** — the
 * settle_debt journey suite's own comment says why: `settleDebtInput` carries
 * no field a stale client figure could travel on, so there is nothing to feed
 * a wrong residual *into*. What the ledger suite could not write is exactly
 * what the happy path below proves instead: the screen's own balance re-reads
 * off `snapshot.revision` (`debt-screen.tsx`'s H1, `counterparty-detail-
 * screen.tsx`'s own H1), so the counterparty's figure and the debt tab's row
 * both reflect the settle the moment it lands — never a balance the screen
 * remembers from before the write. That is a plain `it`, not `it.fails`: R2
 * H4 is not reachable here as a bug, only as a guarantee this journey can
 * check.
 *
 * **R2 H3 — settle_debt never checks that `currency` names the destination
 * account's own currency (SPEC.md §6.5's "a row's currency is its
 * account's").** `SettleSheet` always derives `currency` from the picked
 * account (`counterparty-detail-screen.tsx`'s own `handleSettleSave`), so the
 * mismatch this finding names can never actually reach the sheet through a
 * tap — there is no control that lets the two diverge, and the pivot
 * currency (USD, always capturable per §7.0) can never trigger the sheet's
 * own `accountNeedsRate` caption either, so there is no needs-rate scenario
 * for a screen test to exercise. The screen test below is the happy path
 * only; R2 H3 itself is proven directly against the controller instead — the
 * one place it is reachable at all — by calling `settleDebt` with a
 * `currency` that does not match the picked account, a mismatch no UI
 * control can express.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { installPhoneLayout, settleLayout } from "@waltning/ui/shell/floating-add.test-support";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JourneyRouterStub } from "./journey-harness";

installPhoneLayout();

const switchTab = { today: vi.fn(), ledger: vi.fn(), debt: vi.fn(), settings: vi.fn() };
const focused: "today" | "ledger" | "debt" = "debt";

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

/** `2026-09-04T09:00:00Z` — the same fixed instant J02's own journey pins. */
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

/** `Keypad`'s own glyphs, tapped in sequence. */
function tapDigits(digits: readonly string[]) {
  for (const digit of digits) fireEvent.click(screen.getByRole("button", { name: digit }));
}

describe("J07 — lend and settle", () => {
  it("settles a PLN debt end to end: the debt tab's row clears and the counterparty's own figure reads zero (flows/J07-lend-and-settle.md §2–§6, R2 H4 — not stale)", async () => {
    const { ledger, stub } = setupJourney();
    stub.pushWithParams("debt", {});

    render(<JourneyHarness controller={ledger.controller} stub={stub} />);
    await settleLayout();

    // S12 — the counterparty row, its net stated in words and in the figure.
    // `<Amount>` nests the currency in its own `<Text>` (§4.1's own affix), so
    // the figure is read off the rendered body rather than one text node.
    expect(document.body.textContent ?? "").toContain("100.00 PLN");

    // S12 → S13.
    fireEvent.click(screen.getByRole("button", { name: /Placeholder/ }));
    expect(stub.getRoute()).toBe("counterparty");
    await waitFor(() => expect(screen.getByRole("button", { name: "Settle" })).toBeDefined());

    // S13 → S14.
    fireEvent.click(screen.getByRole("button", { name: "Settle" }));

    // The "Into" amount — active by default.
    tapDigits(["1", "0", "0"]);
    expect(screen.getByRole("button", { name: "Amount: 100" })).toBeDefined();

    // The Discharges amount — S14 §5's own two-amount, derived-rate shape.
    fireEvent.click(screen.getByRole("button", { name: "Discharges: 0" }));
    tapDigits(["1", "0", "0"]);
    expect(screen.getByRole("button", { name: "Discharges: 100" })).toBeDefined();

    // Into the same PLN account the lend itself came from.
    fireEvent.click(screen.getByRole("button", { name: "Into" }));
    fireEvent.click(screen.getByRole("radio", { name: "Cash · PLN" }));

    // The sheet's own submit — the last "Settle" in the tree, distinct from
    // the trigger button underneath it, which `BottomSheet` leaves mounted.
    const settleButtons = screen.getAllByRole("button", { name: "Settle" });
    fireEvent.click(settleButtons[settleButtons.length - 1] as HTMLElement);

    // S14 §5 — a settlement never implicitly clears; this one reconciles
    // exactly, so the sheet closes and the toast names it settled.
    await waitFor(() => expect(screen.getByText(/Settled\. 0\.00 PLN/)).toBeDefined());

    // S13's own figure — zeroed, not merely re-read stale (R2 H4):
    // `<BalanceLedger>` renders "All settled" once `rows` is empty, off the
    // very same `snapshot.revision`-keyed read `debt-screen.tsx`'s own H1
    // fix argues for. The lend's own history row still reads 100.00 PLN —
    // history is not a running balance — so the settled state is read off
    // this key, never a blanket absence of the figure.
    expect(document.body.textContent ?? "").toContain("All settled");

    // Back to S12 — this screen carries no back control of its own (no
    // `Stack` header in this harness, `journey-harness.tsx`'s own doc), so
    // the jump is scripted the way the controller ruling allows for a route
    // with no UI control to reach it. The counterparty's row is gone;
    // nothing left to settle.
    act(() => stub.pushWithParams("debt", {}));
    expect(document.body.textContent ?? "").not.toContain("100.00 PLN");
  });

  /**
   * R2 H3, proven where it is actually reachable — the controller, not the
   * sheet (the controller ruling: no UI control lets `currency` diverge from
   * the picked account's own). `SPEC.md`'s own table names the guarantee
   * this exercises directly: *"transactions.currency = accounts.currency …
   * Nothing enforced it, so a USD amount could sit on a PLN account and
   * every balance downstream would be wrong."*
   */
  it("R2 H3 — settle_debt never checks that `currency` names the destination account's own currency (SPEC.md §6.5)", () => {
    const { ledger, fixture } = setupJourney();

    const result = ledger.controller.settleDebt({
      counterpartyId: fixture.counterpartyId,
      accountId: fixture.cashAccountId, // a PLN account
      date: "2026-09-04",
      amount: "40.00",
      currency: "USD", // claims dollars landed in a PLN account
      dischargesCurrency: "PLN",
      dischargesAmount: "40.00",
      note: "",
      categoryId: null,
    });

    expect("fieldErrors" in result).toBe(true);
  });
});
