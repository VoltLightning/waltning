/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { currencyCode } from "@waltning/core/money";
import { expect, it, vi } from "vitest";
import { QuickAddComposer, type QuickAddComposerProps } from "./quick-add-composer";

const ACCOUNTS: QuickAddComposerProps["accounts"] = [
  {
    id: "account-a",
    name: "Cash · PLN",
    currency: currencyCode("PLN"),
    decimals: 2,
    capturable: true,
    ownership: "own",
  },
  {
    id: "account-shared",
    name: "Joint · PLN",
    currency: currencyCode("PLN"),
    decimals: 2,
    capturable: true,
    ownership: "shared",
  },
];

const CATEGORIES: QuickAddComposerProps["categories"] = [
  { id: "cat-eating-out", name: "Eating out", kind: "expense" },
  { id: "cat-salary", name: "Salary", kind: "income" },
];

const TODAY = "2026-09-03";

const BASE_PROPS: QuickAddComposerProps = {
  raw: "",
  type: "expense",
  accounts: ACCOUNTS,
  accountId: null,
  accountMachineFilled: false,
  onOpenAccountPicker: vi.fn(),
  categories: CATEGORIES,
  categoryId: null,
  onOpenCategoryPicker: vi.fn(),
  payee: "",
  onPayeeChange: vi.fn(),
  date: TODAY,
  onDateChange: vi.fn(),
  today: TODAY,
  isBusiness: false,
  onBusinessChange: vi.fn(),
  note: "",
  onNoteChange: vi.fn(),
  counterparties: [],
  counterpartyId: null,
  onCounterpartyChange: vi.fn(),
  counterpartyRole: null,
  onCounterpartyRoleChange: vi.fn(),
};

function props(overrides: Partial<QuickAddComposerProps> = {}): QuickAddComposerProps {
  return { ...BASE_PROPS, ...overrides };
}

it("renders every chip empty at rest", () => {
  render(<QuickAddComposer {...props()} />);
  expect(screen.getByRole("button", { name: "Account" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Category" })).toBeDefined();
  expect(screen.getByRole("button", { name: "+ Payee" })).toBeDefined();
  expect(screen.getByRole("button", { name: "+ Note" })).toBeDefined();
  // Today's date renders as "Today", not the bare ISO string.
  expect(screen.getByRole("button", { name: /Today/ })).toBeDefined();
  // No counterparty in the ledger — the person chip is not offered at all (S05 §5).
  expect(screen.queryByRole("button", { name: "+ Person" })).toBeNull();
});

it("carries the chosen account's currency onto the hero amount", () => {
  render(<QuickAddComposer {...props({ accountId: "account-a", raw: "48,90" })} />);
  expect(screen.getByText("PLN")).toBeDefined();
  expect(screen.getByText("48.90")).toBeDefined();
});

it("opens the category picker through a callback rather than a sheet of its own", () => {
  const onOpenCategoryPicker = vi.fn();
  render(<QuickAddComposer {...props({ onOpenCategoryPicker })} />);
  fireEvent.click(screen.getByRole("button", { name: "Category" }));
  expect(onOpenCategoryPicker).toHaveBeenCalledOnce();
});

it("shows D2's proposal machine-filled until a real pick lands (P2, §14)", () => {
  render(
    <QuickAddComposer
      {...props({
        categoryProposal: {
          categoryId: "cat-eating-out",
          confidence: 0.9,
          basis: "exact",
          neighbours: [],
        },
      })}
    />,
  );
  expect(screen.getByText("Eating out")).toBeDefined();
  // Chip's own machine-filled marker (P5: text, not tint alone) —
  // `common.autoFilledLabel`'s whole accessible name.
  expect(
    screen.getByRole("button", { name: "Category: Eating out, filled automatically" }),
  ).toBeDefined();
});

it("stops showing the proposal marker once a real category is picked", () => {
  render(
    <QuickAddComposer
      {...props({
        categoryId: "cat-eating-out",
        categoryProposal: {
          categoryId: "cat-eating-out",
          confidence: 0.9,
          basis: "exact",
          neighbours: [],
        },
      })}
    />,
  );
  expect(screen.getByText("Eating out")).toBeDefined();
  expect(
    screen.queryByRole("button", { name: "Category: Eating out, filled automatically" }),
  ).toBeNull();
});

it("shows the P2 trail and Undo when the draft holds an applied proposal (H1, S05 §8)", () => {
  const onUndoCategory = vi.fn();
  render(
    <QuickAddComposer
      {...props({
        payee: "Corner Café",
        categoryId: "cat-eating-out",
        categoryProposal: {
          categoryId: "cat-eating-out",
          confidence: 1,
          basis: "exact",
          neighbours: [],
        },
        categoryAutoFilled: true,
        onUndoCategory,
      })}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Category: Eating out, filled automatically" }),
  ).toBeDefined();
  expect(screen.getByText("From your history: Corner Café")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(onUndoCategory).toHaveBeenCalledOnce();
});

/**
 * M — the trail used to interpolate the just-typed `payee` verbatim; a
 * neighbours-basis proposal can win on a fold match against a differently
 * spelled history row (S05 §8), and the trail names *where the pick came
 * from* — the history's own spelling — not an echo of what was just typed.
 */
it("names the trail from the proposal's own neighbour, not the typed payee (M)", () => {
  render(
    <QuickAddComposer
      {...props({
        payee: "corner cafe",
        categoryId: "cat-eating-out",
        categoryProposal: {
          categoryId: "cat-eating-out",
          confidence: 0.9,
          basis: "neighbours",
          neighbours: [
            { payee: "Corner Café", similarity: 0.8, categoryId: "cat-eating-out" },
            { payee: "Corner Cafe Ltd", similarity: 0.5, categoryId: "cat-eating-out" },
          ],
        },
        categoryAutoFilled: true,
      })}
    />,
  );
  expect(screen.getByText("From your history: Corner Café")).toBeDefined();
  expect(screen.queryByText("From your history: corner cafe")).toBeNull();
});

/**
 * M — the reviewer's own case: the closest neighbour overall can sit in a
 * different, *losing* category (`payee-memory.ts`'s own test) and still
 * rank first by similarity alone. The trail must skip past it to the
 * closest neighbour *of the winning category* — never name a row that
 * never voted for this pick.
 */
it("names the trail from the closest neighbour of the winning category, not rank-0 overall (M)", () => {
  render(
    <QuickAddComposer
      {...props({
        payee: "Coffee House",
        categoryId: "cat-dining",
        categoryProposal: {
          categoryId: "cat-dining",
          confidence: 0.67,
          basis: "neighbours",
          neighbours: [
            // Closest overall, but the *losing* category — must not be named.
            { payee: "Coffee Hous", similarity: 0.9, categoryId: "cat-groceries" },
            { payee: "Coffee Shop", similarity: 0.6, categoryId: "cat-dining" },
            { payee: "Coffee Stop", similarity: 0.5, categoryId: "cat-dining" },
          ],
        },
        categoryAutoFilled: true,
      })}
    />,
  );
  expect(screen.getByText("From your history: Coffee Shop")).toBeDefined();
  expect(screen.queryByText("From your history: Coffee Hous")).toBeNull();
});

it("lets someone type a payee through its own sheet", () => {
  const onPayeeChange = vi.fn();
  render(<QuickAddComposer {...props({ onPayeeChange })} />);
  fireEvent.click(screen.getByRole("button", { name: "+ Payee" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Payee" }), {
    target: { value: "Corner shop" },
  });
  expect(onPayeeChange).toHaveBeenCalledWith("Corner shop");
});

/**
 * `AccountPicker` (`accounts/`) is a sibling domain — the same rule
 * `CategorySheet` already keeps. This composer only ever asks the screen to
 * open it; `account-picker.test.tsx` covers the sheet itself.
 */
it("opens the account picker through a callback rather than a sheet of its own", () => {
  const onOpenAccountPicker = vi.fn();
  render(<QuickAddComposer {...props({ onOpenAccountPicker })} />);
  fireEvent.click(screen.getByRole("button", { name: "Account" }));
  expect(onOpenAccountPicker).toHaveBeenCalledOnce();
});

it("shows the account chip machine-filled when the last-used pick still holds", () => {
  render(<QuickAddComposer {...props({ accountId: "account-a", accountMachineFilled: true })} />);
  expect(
    screen.getByRole("button", { name: "Account: Cash · PLN, filled automatically" }),
  ).toBeDefined();
});

it("offers a counterparty once the ledger holds one, and its role once it is picked (§6.6)", () => {
  const onCounterpartyChange = vi.fn();
  render(
    <QuickAddComposer
      {...props({ counterparties: [{ id: "cp-a", name: "Counterparty A" }], onCounterpartyChange })}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "+ Person" }));
  expect(screen.queryByRole("radiogroup", { name: "Role" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Counterparty" }));
  fireEvent.click(screen.getByRole("radio", { name: "Counterparty A" }));
  expect(onCounterpartyChange).toHaveBeenCalledWith("cp-a");
});

it("shows the role picker once a counterparty is controlled in", () => {
  render(
    <QuickAddComposer
      {...props({
        counterparties: [{ id: "cp-a", name: "Counterparty A" }],
        counterpartyId: "cp-a",
      })}
    />,
  );
  fireEvent.click(screen.getByText(/Counterparty A/));
  expect(screen.getByRole("radiogroup", { name: "Role" })).toBeDefined();
  expect(screen.getByRole("radio", { name: "Debt — expected back" })).toBeDefined();
});

it("renders a field error under the chip it names", () => {
  render(
    <QuickAddComposer
      {...props({
        fieldErrors: {
          byField: { accountId: ["Choose an account before saving"] },
          formLevel: [],
        },
      })}
    />,
  );
  expect(screen.getByText("Choose an account before saving")).toBeDefined();
});

/**
 * §14.6 — the same proactive caption `QuickAddForm`'s own `blocked` text
 * already shows on the desk fallback, the moment the picked account holds no
 * rate rather than only after a save attempt bounces it.
 */
it("shows the needsRate caption the moment an uncapturable account is picked (SPEC.md §14.6)", () => {
  render(
    <QuickAddComposer
      {...props({
        accounts: [
          {
            id: "account-a",
            name: "Cash · PLN",
            currency: currencyCode("PLN"),
            decimals: 2,
            capturable: false,
            ownership: "own",
          },
        ],
        accountId: "account-a",
      })}
    />,
  );
  expect(
    screen.getByText("PLN needs an exchange rate before a transaction can be recorded in it."),
  ).toBeDefined();
});

/**
 * The refusal is a product, not a caption. A fresh install holding one PLN
 * account with the pivot elsewhere cannot record anything at all, and a muted
 * line under the chips left the person to find S18 unaided — so the banner
 * carries the one action that ends the refusal.
 */
it("offers the way out of the refusal, scoped to the currency (S05 §6)", () => {
  const onSetRate = vi.fn();
  render(
    <QuickAddComposer
      {...props({
        accounts: [
          {
            id: "account-a",
            name: "Cash · PLN",
            currency: currencyCode("PLN"),
            decimals: 2,
            capturable: false,
            ownership: "own",
          },
        ],
        accountId: "account-a",
        onSetRate,
      })}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Set a PLN rate" }));
  expect(onSetRate).toHaveBeenCalledOnce();
});

/** No caller, no offer — `packages/ui` names no router, so the action is the screen's to give. */
it("states the refusal without an action when the caller has nowhere to send it", () => {
  render(
    <QuickAddComposer
      {...props({
        accounts: [
          {
            id: "account-a",
            name: "Cash · PLN",
            currency: currencyCode("PLN"),
            decimals: 2,
            capturable: false,
            ownership: "own",
          },
        ],
        accountId: "account-a",
      })}
    />,
  );
  expect(
    screen.getByText("PLN needs an exchange rate before a transaction can be recorded in it."),
  ).toBeDefined();
  expect(screen.queryByRole("button", { name: "Set a PLN rate" })).toBeNull();
});

it("shows the scope chip's own value from the account's ownership and isBusiness", () => {
  const { rerender } = render(<QuickAddComposer {...props({ accountId: "account-a" })} />);
  expect(screen.getByText("Mine")).toBeDefined();

  rerender(<QuickAddComposer {...props({ accountId: "account-a", isBusiness: true })} />);
  expect(screen.getByText("Business")).toBeDefined();

  rerender(<QuickAddComposer {...props({ accountId: "account-shared" })} />);
  expect(screen.getByText("Shared")).toBeDefined();
});

it("toggles isBusiness through the scope sheet's segment control", () => {
  const onBusinessChange = vi.fn();
  render(<QuickAddComposer {...props({ accountId: "account-a", onBusinessChange })} />);
  fireEvent.click(screen.getByText("Mine"));
  fireEvent.click(screen.getByRole("tab", { name: "Business" }));
  expect(onBusinessChange).toHaveBeenCalledWith(true);
});

it("makes Business unreachable for a shared account (SPEC.md §6.7)", () => {
  const onBusinessChange = vi.fn();
  render(<QuickAddComposer {...props({ accountId: "account-shared", onBusinessChange })} />);
  fireEvent.click(screen.getByText("Shared"));
  const business = screen.getByRole("tab", { name: /Business/ });
  expect(business.getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(business);
  expect(onBusinessChange).not.toHaveBeenCalled();
});

it("names the reason Business is unreachable, not the generic 'later'", () => {
  render(<QuickAddComposer {...props({ accountId: "account-shared" })} />);
  fireEvent.click(screen.getByText("Shared"));
  expect(
    screen.getByRole("tab", { name: "Business, A shared account is never business." }),
  ).toBeDefined();
});

it("shows a proposal's low-confidence marker only below §14's threshold", () => {
  const { rerender } = render(
    <QuickAddComposer
      {...props({
        categoryProposal: {
          categoryId: "cat-eating-out",
          confidence: 0.92,
          basis: "exact",
          neighbours: [],
        },
      })}
    />,
  );
  expect(screen.queryByText("Low confidence — check before using.")).toBeNull();

  rerender(
    <QuickAddComposer
      {...props({
        categoryProposal: {
          categoryId: "cat-eating-out",
          confidence: 0.6,
          basis: "neighbours",
          neighbours: [],
        },
      })}
    />,
  );
  expect(screen.getByText("Low confidence — check before using.")).toBeDefined();
});

/**
 * H1-a — below §14's display threshold, `categoryValue` used to fall back to
 * the proposal's own name regardless of confidence, so the chip read as
 * filled (an accent border, the proposal's name in the filled ink) even
 * though nothing had picked it. The chip must instead read as a suggestion:
 * the placeholder itself names it, in the placeholder's own ink, never
 * machine-filled.
 */
it("shows a below-threshold proposal as a suggestion, never as the chip's value (H1-a)", () => {
  render(
    <QuickAddComposer
      {...props({
        categoryProposal: {
          categoryId: "cat-eating-out",
          confidence: 0.57,
          basis: "neighbours",
          neighbours: [{ payee: "corner cafe", similarity: 0.5, categoryId: "cat-eating-out" }],
        },
      })}
    />,
  );
  // The suggestion is the chip's placeholder, not its value — "Eating out"
  // never reads as a filled category, and there is no auto-filled marker.
  const category = screen.getByRole("button", { name: "Suggested: Eating out" });
  expect(category).toBeDefined();
  expect(category.textContent).not.toContain("auto");
  expect(screen.queryByRole("button", { name: /Category: Eating out/ })).toBeNull();
});

it("shows a 'role?' suffix on the counterparty chip while the role is unresolved (§6.6)", () => {
  render(
    <QuickAddComposer
      {...props({
        counterparties: [{ id: "cp-a", name: "Counterparty A" }],
        counterpartyId: "cp-a",
        counterpartyRole: null,
      })}
    />,
  );
  expect(screen.getByRole("button", { name: /Counterparty A · role\?/ })).toBeDefined();
});

it("renders a controller refusal on counterpartyRole under the counterparty chip", () => {
  render(
    <QuickAddComposer
      {...props({
        counterparties: [{ id: "cp-a", name: "Counterparty A" }],
        counterpartyId: "cp-a",
        counterpartyRole: null,
        fieldErrors: {
          byField: { counterpartyRole: ["a counterparty and its role travel together (§6.6)"] },
          formLevel: [],
        },
      })}
    />,
  );
  expect(screen.getByText("a counterparty and its role travel together (§6.6)")).toBeDefined();
});

/**
 * L2 — the controller's own `accountId` refusal resolves to the same
 * sentence the banner already carries (`field-error-messages.ts` maps
 * `transactions.needsRate`). A save attempt followed by a switch to an
 * uncapturable account reaches both at once; the banner keeps it, because
 * the banner is the half with the way out.
 */
it("states the refusal once when the field error repeats the banner's own sentence", () => {
  const message = "PLN needs an exchange rate before a transaction can be recorded in it.";
  render(
    <QuickAddComposer
      {...props({
        accounts: [
          {
            id: "account-a",
            name: "Cash · PLN",
            currency: currencyCode("PLN"),
            decimals: 2,
            capturable: false,
            ownership: "own",
          },
        ],
        accountId: "account-a",
        fieldErrors: { byField: { accountId: [message] }, formLevel: [] },
      })}
    />,
  );
  expect(screen.getAllByText(message)).toHaveLength(1);
});
