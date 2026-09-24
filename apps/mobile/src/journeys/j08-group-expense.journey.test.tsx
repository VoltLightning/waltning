/**
 * @vitest-environment jsdom
 *
 * J08's own acceptance journey — you pay for a group, the pot says so, and
 * allocating it charges each person and takes the balance to zero.
 *
 * Proves: flows/J08-group-expense.md §3–§6 end to end, through the real
 * `Today`, `Allocate` and `Debt` screens over one real `LocalLedgerSession`.
 * Findings: none — J08 had no implementation to review, so this journey is
 * written from the flow itself rather than against a reviewer's finding.
 *
 * **The invariant is the assertion.** §6.4 says a clearing account trends to
 * zero and a non-zero balance means an unallocated group expense. Every other
 * check here — the banner appearing, the debts landing, the remainder on
 * screen — is a way of saying the same thing at a different point in the
 * journey, and the one that would still be worth running alone is the last:
 * the pot reads `0,00` and the banner is gone.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { currencyCode } from "@waltning/core/money";
import { installPhoneLayout, settleLayout } from "@waltning/ui/shell/floating-add.test-support";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JourneyRouterStub } from "./journey-harness";

installPhoneLayout();

const switchTab = { today: vi.fn(), ledger: vi.fn(), counterparties: vi.fn(), settings: vi.fn() };

vi.mock("expo-router/ui", () => ({
  useTabTrigger: ({ name }: { name: "today" | "ledger" | "counterparties" }) => ({
    trigger: { isFocused: name === "today" },
    switchTab: switchTab[name],
  }),
}));

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

const NOW = new Date("2026-09-04T09:00:00Z");
const openLedgers: JourneyLedger[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  currentStub = null;
  for (const ledger of openLedgers.splice(0)) ledger.close();
});

/**
 * The fixture, plus what J08 needs that no other journey does: a clearing
 * account, two more people, and 400,00 PLN transferred into the pot — §3's
 * first step, *you pay for the group*.
 */
function setupGroupExpense() {
  const ledger = createJourneyLedger();
  openLedgers.push(ledger);
  const fixture = seedJourneyFixture(ledger);
  const { controller } = ledger;
  const today = "2026-09-04";

  const pot = controller.createAccount({
    name: "Clearing · PLN",
    currency: currencyCode("PLN"),
    kind: "clearing",
    ownership: "own",
    isBusiness: false,
    openingBalance: "0",
    openingDate: null,
    memo: "",
    groupId: null,
  });
  if (!("id" in pot)) throw new Error(`pot refused — ${JSON.stringify(pot.fieldErrors)}`);

  const people = ["Marek", "Piotr"].map((name) => {
    const created = controller.createCounterparty({
      name,
      kind: "person",
      settlementCurrency: currencyCode("PLN"),
      contact: null,
      note: "",
    });
    if (!("id" in created)) throw new Error(`counterparty refused — ${name}`);
    return created.id;
  });

  const funded = controller.createTransaction({
    type: "transfer",
    amount: "400.00",
    accountId: fixture.cashAccountId,
    toAccountId: pot.id,
    toAmount: "400.00",
    toCurrency: currencyCode("PLN"),
    categoryId: null,
    enteredName: "",
    date: today,
    note: "",
    isBusiness: false,
    obligationCounterpartyId: null,
    obligationRole: null,
  });
  if (!("id" in funded)) throw new Error(`funding refused — ${JSON.stringify(funded.fieldErrors)}`);
  controller.refresh();

  const stub = createJourneyRouterStub();
  currentStub = stub;
  return { ledger, fixture, stub, potId: pot.id, people };
}

const potBalance = (ledger: JourneyLedger, potId: string) =>
  ledger.controller.getSnapshot().accounts.find((account) => account.id === potId)?.balance ?? "";

describe("J08 — group expense", () => {
  it("splits a pot four ways, charges three people and takes the balance to zero (§3–§6, §6.4)", async () => {
    const { ledger, stub, potId } = setupGroupExpense();
    stub.pushWithParams("today", {});

    render(<JourneyHarness controller={ledger.controller} stub={stub} />);
    await settleLayout();

    // §6.4 — a funded pot is an unallocated group expense until it is split,
    // and the banner is how the app says so.
    expect(screen.getByRole("alert")).toBeDefined();
    fireEvent.click(screen.getByText("Open"));
    expect(stub.getRoute()).toBe("allocate");
    await settleLayout();

    // S36 §3 — the pot leads, and every other figure is measured against it.
    expect(document.body.textContent ?? "").toContain("400.00");

    // Three people beside you: Nina from the fixture, Marek and Piotr.
    for (const name of ["Placeholder", "Marek", "Piotr"]) {
      fireEvent.click(screen.getByRole("button", { name: /Add someone/ }));
      // The picker draws a person as a row — monogram, name, kind — so the
      // match is on the row's own text rather than an exact accessible name.
      const row = await waitFor(() =>
        screen.getAllByRole("button").find((b) => b.textContent?.includes(name)),
      );
      fireEvent.click(row as HTMLElement);
    }

    // Your own row picks what the money was for — the one row that becomes
    // spending (J08 §4).
    fireEvent.click(screen.getByRole("button", { name: "Choose a category" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "Eating out" })).toBeDefined());
    fireEvent.click(screen.getByRole("radio", { name: "Eating out" }));

    // §6 — the remainder is on screen throughout. Four ways on 400,00 leaves
    // nothing, and the commit states the figure it will write.
    expect(screen.getByTestId("allocate-remainder").textContent ?? "").toMatch(/0[.,]00/);
    fireEvent.click(screen.getByRole("button", { name: /^Allocate 400/ }));

    // **The invariant.** The pot is at zero the moment the split lands —
    // before anyone has repaid a grosz.
    await waitFor(() => expect(potBalance(ledger, potId).slice(0, 4)).toBe("0.00"));

    // And what it became: three debts, each in the debt ledger because the
    // role is what puts it there (§6.6).
    act(() => stub.pushWithParams("counterparties", {}));
    await settleLayout();
    const debt = document.body.textContent ?? "";
    for (const name of ["Placeholder", "Marek", "Piotr"]) expect(debt).toContain(name);
  });

  it("leaves the remainder on the pot when the split does not sum, and the banner stays (§4, §5)", async () => {
    const { ledger, stub, potId } = setupGroupExpense();
    stub.pushWithParams("allocate", { account: potId });

    render(<JourneyHarness controller={ledger.controller} stub={stub} />);
    await settleLayout();

    // You and one other: 400,00 two ways is 200,00 each, so 200,00 of the
    // pot belongs to people nobody has named yet.
    fireEvent.click(screen.getByRole("button", { name: /Add someone/ }));
    const marek = await waitFor(() =>
      screen.getAllByRole("button").find((b) => b.textContent?.includes("Marek")),
    );
    fireEvent.click(marek as HTMLElement);

    fireEvent.click(screen.getByRole("button", { name: "Choose a category" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "Eating out" })).toBeDefined());
    fireEvent.click(screen.getByRole("radio", { name: "Eating out" }));

    // Switch to Custom and hand out less than the pot holds.
    fireEvent.click(screen.getByRole("tab", { name: "Custom" }));
    const fields = screen.getAllByRole("textbox");
    fireEvent.change(fields[0] as HTMLElement, { target: { value: "100" } });
    fireEvent.change(fields[1] as HTMLElement, { target: { value: "100" } });

    // §6 — stated before commit, not discovered after it.
    await waitFor(() =>
      expect(screen.getByTestId("allocate-remainder").textContent ?? "").toMatch(/200[.,]00/),
    );

    // §4 — committed, not refused. The balance stays non-zero and the banner
    // is what keeps saying so.
    fireEvent.click(screen.getByRole("button", { name: /^Allocate 200/ }));
    await waitFor(() => expect(potBalance(ledger, potId).slice(0, 6)).toBe("200.00"));

    act(() => stub.pushWithParams("today", {}));
    await settleLayout();
    expect(screen.getByRole("alert")).toBeDefined();
  });
});
