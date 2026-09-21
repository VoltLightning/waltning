/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import type {
  PhoneLedgerController,
  PhoneSearchTransaction,
} from "@waltning/client/ledger/create-phone-ledger";
import { type AccountingDate, accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { currencyCode, pivotPerUnit, toMoney } from "@waltning/core/money";
import { I18nProvider } from "@waltning/ui/i18n/provider";
import { ThemeProvider } from "@waltning/ui/theme/provider";
import { light } from "@waltning/ui/theme/roles";
import type { DayRowPlace } from "@waltning/ui/transactions/day-group";
import { dateOfEntry } from "@waltning/ui/transactions/molecules/list-entry/entry";
import { Text } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { describe, expect, it, vi } from "vitest";
import { HomeListPage } from "./home-list-page";

const PLN = currencyCode("PLN");
const TODAY = accountingDate("2026-08-14");

function row(date: string, n: number, amount: string, over: Partial<PhoneSearchTransaction> = {}) {
  return {
    id: id<"transactions">(`00000000-0000-4000-8000-0000000${String(n).padStart(5, "0")}`),
    date: accountingDate(date),
    type: "expense" as const,
    payee: `Payee ${n}`,
    note: "",
    categoryName: "Groceries",
    brandKey: null,
    accountId: id<"accounts">("00000000-0000-4000-8000-00000000000a"),
    accountName: "Bank A",
    toAccountId: null,
    toAccountName: null,
    amount: toMoney(amount),
    currency: PLN,
    decimals: 2,
    fxRate: pivotPerUnit("1"),
    fxRateEstimated: false,
    toAmount: null,
    toFxRate: null,
    toCurrency: null,
    toDecimals: null,
    isBusiness: false,
    isCapital: false,
    counterpartyRole: null,
    ...over,
  } satisfies PhoneSearchTransaction;
}

function ledgerWith(older: PhoneSearchTransaction[], newer: PhoneSearchTransaction[] = []) {
  return {
    readLedgerPage: vi.fn((o: { direction: string }) => ({
      rows: o.direction === "older" ? older : newer,
      nextCursor: undefined,
    })),
  } as unknown as PhoneLedgerController;
}

/**
 * The list's own scroll offset, as a still one.
 *
 * jsdom does not scroll, so this never changes — which is the honest state for
 * this suite: what the offset *drives* (the strip's position, the settle that
 * writes the date) is arithmetic tested in `scrub.ts` and `scroll-settle.ts`,
 * a story the visual suite shoots in a real browser, and `tools/e2e` against
 * the built app.
 */
const scrollY = { value: 0 } as SharedValue<number>;
const active = { value: true } as SharedValue<boolean>;

function draw(
  ledger: PhoneLedgerController,
  onPickDay = vi.fn(),
  over: {
    anchor?: AccountingDate;
    onReturnToToday?: () => void;
    onVisibleDay?: (date: AccountingDate) => void;
    onCategorize?: () => void;
    query?: string | null;
  } = {},
) {
  render(
    <ThemeProvider theme={light}>
      <I18nProvider>
        <HomeListPage
          ledger={ledger}
          anchor={over.anchor ?? TODAY}
          {...(over.onVisibleDay === undefined ? {} : { onVisibleDay: over.onVisibleDay })}
          today={TODAY}
          revision={0}
          pivotCurrency={PLN}
          pivotDecimals={2}
          onPickDay={onPickDay}
          onOpenTransaction={vi.fn()}
          onCategorize={over.onCategorize ?? vi.fn()}
          onReturnToToday={over.onReturnToToday ?? vi.fn()}
          query={over.query ?? null}
          scrollY={scrollY}
          active={active}
          empty={<Text>nothing yet</Text>}
        />
      </I18nProvider>
    </ThemeProvider>,
  );
  return { onPickDay };
}

it("draws a day, its total, and its rows", () => {
  draw(ledgerWith([row("2026-08-14", 1, "-96"), row("2026-08-14", 2, "-48.90")]));
  expect(screen.getByText("August 14, 2026")).toBeTruthy();
  expect(screen.getByRole("button", { name: /Payee 1/ })).toBeTruthy();
  // −96 and −48,90 folded to the day's own figure.
  expect(screen.getByText(/144[,.]90/)).toBeTruthy();
});

it("names a ribbon cell by its date and what happened, not by the number", () => {
  // A run of bare numbers says nothing about which month or which year.
  draw(ledgerWith([row("2026-08-14", 1, "-96")]));
  expect(screen.getByRole("button", { name: /August 14, 2026, 1 entry/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "14" })).toBeNull();
});

it("draws one quiet day as a line and a run as a single row", () => {
  draw(
    ledgerWith([
      row("2026-08-14", 1, "-96"),
      row("2026-08-12", 2, "-10"), // one day missing between
      row("2026-07-20", 3, "-10"), // a long run below it
    ]),
  );
  expect(screen.getByText("August 13, 2026")).toBeTruthy();
  // **One range, not two dates.** `July 21, 2026 – August 11, 2026` spells the
  // year twice over a row whose whole content is that nothing happened; §6's
  // own example of it is the much shorter "3 – 4 August · 2 days · nothing".
  expect(
    screen.getByRole("button", { name: /Show: July 21\u2009–\u2009August 11, 2026/ }),
  ).toBeTruthy();
});

it("writes a run inside one month without saying the month twice", () => {
  draw(ledgerWith([row("2026-08-14", 1, "-96"), row("2026-08-11", 2, "-10")]));
  expect(screen.getByRole("button", { name: /Show: August 12\u2009–\u200913, 2026/ })).toBeTruthy();
});

it("shows no figure at all on a day it cannot price", () => {
  // A total of only the priceable legs would be a smaller number presented as
  // the day's own — the failure that looks like health.
  draw(
    ledgerWith([
      row("2026-08-14", 1, "-50", {
        toAmount: toMoney("50"),
        toCurrency: currencyCode("EUR"),
        toFxRate: null,
      }),
    ]),
  );
  expect(screen.getByText("—")).toBeTruthy();
});

it("asks the list to move when a collapsed run is opened", () => {
  const { onPickDay } = draw(
    ledgerWith([row("2026-08-14", 1, "-96"), row("2026-07-20", 2, "-10")]),
  );
  screen.getByRole("button", { name: /Show:/ }).click();
  expect(onPickDay).toHaveBeenCalledExactlyOnceWith("2026-08-13");
});

/**
 * **§6 says the ledger is continuous in both directions, and only one of them
 * was wired.** `useLedgerList` has paged forwards and backwards since it was
 * written, but the list was given `onEndReached` alone — so a reader who
 * jumped to a day could walk backwards from it forever and never forwards.
 * The newer half loaded once, at the anchor, and then froze.
 *
 * Asserted through the port rather than by firing a scroll: what the list
 * *asks the ledger for* is the behaviour, and a scroll event in jsdom has no
 * layout to make `onStartReached` fire from.
 */
it("asks the ledger for both directions, not only for older rows", () => {
  const ledger = ledgerWith([row("2026-08-14", 1, "-96")], [row("2026-08-16", 2, "-48.90")]);
  draw(ledger);

  const asked = vi.mocked(ledger.readLedgerPage).mock.calls.map(([options]) => options.direction);
  expect(asked, "the list must page both ways").toContain("older");
  expect(asked).toContain("newer");
});

it("draws the newer rows above the older ones", () => {
  // The order is the claim: a page walked `newer` is prepended, and a reader
  // scrolling up must find later days rather than the same day twice.
  draw(ledgerWith([row("2026-08-14", 1, "-96")], [row("2026-08-16", 2, "-48.90")]));
  const shown = screen
    .getAllByRole("button", { name: /Payee/ })
    .map((node) => node.getAttribute("aria-label") ?? node.textContent ?? "");
  expect(shown, "both rows drawn").toHaveLength(2);
  expect(shown[0]).toMatch(/Payee 2/);
  expect(shown[1]).toMatch(/Payee 1/);
});

/**
 * **A jump is one-way without the pill** (S04 §6). Picking a far date loads
 * that date's neighbourhood and nothing between, so walking home from 2021 is
 * four years of scrolling. The pill was specified in §4 and never built.
 */
it("offers the way back only once the list has left today", () => {
  const rows = [row("2026-08-14", 1, "-96")];
  draw(ledgerWith(rows));
  expect(
    screen.queryByRole("button", { name: /Back to today/ }),
    "a pill offering today while the list is on today does nothing",
  ).toBeNull();
});

it("names where the list is, and returns it", () => {
  const onReturnToToday = vi.fn();
  draw(ledgerWith([row("2021-03-02", 1, "-96")]), vi.fn(), {
    anchor: accountingDate("2021-03-02"),
    onReturnToToday,
  });

  // The name carries the date the list is on: "Today" alone is what the eye
  // reads off the pill, and tells a reader who cannot see the list nothing
  // about why it appeared.
  const pill = screen.getByRole("button", { name: /Back to today/ });
  expect(pill.getAttribute("aria-label")).toMatch(/March 2, 2021/);

  fireEvent.click(pill);
  expect(onReturnToToday).toHaveBeenCalledTimes(1);
});

/**
 * **§7 gives every row two gestures, and the phone list passed neither.**
 * `LedgerRowItem` has taken `onShortSwipe`/`onLongSwipe` since S10 wired them
 * on the desk; this page rendered it with `onPress` alone, so every row was
 * tap-only and the component silently fell back to a plain `EntryRow`.
 *
 * The swipe itself is `SwipeableRow`'s and is tested there. What this pins is
 * that the row is wrapped in one at all, which is the thing that was missing.
 */
it("wraps a categorisable row in the layer its gestures move", () => {
  draw(ledgerWith([row("2026-08-14", 1, "-96")]));
  // `SwipeableRow` is the only thing on this row that can travel sideways, so
  // a `translateX` above the button is the wrapper's own signature. Asserting
  // the handler props instead would prove the page passes them, not that
  // `LedgerRowItem` accepted both and built the row it builds when it does.
  const button = screen.getByRole("button", { name: /Payee 1/ });
  const travelled = button.closest("[style*='translateX']");
  expect(travelled, "an expense takes both gestures (§7)").not.toBeNull();
});

it("leaves a transfer tap-only, because it has no category to choose", () => {
  draw(
    ledgerWith([
      row("2026-08-14", 1, "-96", {
        type: "transfer",
        toAccountName: "Bank B",
        toAmount: toMoney("96.00"),
        toCurrency: PLN,
        toDecimals: 2,
        toFxRate: pivotPerUnit("1"),
      }),
    ]),
  );
  // A transfer is drawn by `TransferRow`, which names the two accounts rather
  // than a payee — the row a transfer has instead of one.
  // By text, not by role: `TransferRow` is not pressable at all — it states
  // two accounts rather than offering one target — so there is no button here
  // to find.
  const row1 = screen.getByText(/^Transfer · /);
  expect(
    row1.closest("[style*='translateX']"),
    "a swipe onto a sheet with nothing in it is worse than no swipe",
  ).toBeNull();
});

/**
 * **C1 — the search reached the hook and stopped.** `useLedgerList`'s option
 * type was widened to admit `text`, and every layer below it — the controller's
 * parameter type, its hand-written forwarding, and `readLedgerPage`'s own
 * `LedgerFilter` — omitted the key. A filter built in a variable is not
 * excess-property checked, so it compiled, forwarded nothing, and the list drew
 * the whole ledger under a field reporting three matches. It *looked* like
 * search working, because a query change re-keys the list and both halves
 * visibly reload on every keystroke.
 *
 * Asserted at the port, which is the seam that dropped it.
 */
it("hands the search down to the read, not just to the hook", () => {
  const ledger = ledgerWith([row("2026-08-14", 1, "-96")]);
  draw(ledger, vi.fn(), { query: "market" });

  const filters = vi
    .mocked(ledger.readLedgerPage)
    .mock.calls.map(([options]) => (options as { filter?: { text?: string } }).filter);
  expect(filters.length).toBeGreaterThan(0);
  for (const filter of filters) expect(filter?.text).toBe("market");
});

/**
 * §7: a filtered list has no gaps to explain and no day totals to state. Run a
 * filtered set through the unfiltered rules and a day holding six rows of which
 * one matched reports that row's amount as *the day's total*.
 */
it("states no day total while the rows are a filtered subset", () => {
  draw(ledgerWith([row("2026-08-14", 1, "-96")]), vi.fn(), { query: "market" });
  expect(
    screen.queryByLabelText(/No total/),
    "not the dash either — that one means a rate has not arrived",
  ).toBeNull();
  expect(screen.queryByText("−96,00"), "and not the matched row's own amount").toBeNull();
});

/**
 * **The header and the rows named different months, on the same screen.**
 *
 * S04 §6: a jump *"loads that date's neighbourhood and **nothing between**"*.
 * The list loaded its newer half unconditionally, and a reverse-chronological
 * list draws the newer half *first* — so picking May put September's rows at
 * the top of a page whose title read *May*, with `TodayPill` floating over them
 * saying the list had moved. It had not: the reader was looking at today's
 * rows the whole time.
 *
 * Asserted through the port, the way its sibling above is: what the list asks
 * the ledger for is the behaviour.
 */
it("asks both ways on a jump, and draws the day jumped to as its own line", () => {
  // S04 §6: a jump loads the day's neighbourhood. The older-only rule this
  // replaced landed a jump to a quiet day on *nothing on or before*, over a
  // ledger holding rows three days newer — a dead end with nothing to walk.
  const ledger = ledgerWith([], [row("2026-08-14", 2, "-10")]);
  draw(ledger, vi.fn(), { anchor: accountingDate("2021-03-02") });

  const asked = vi.mocked(ledger.readLedgerPage).mock.calls.map(([options]) => options.direction);
  expect(asked.sort(), "the neighbourhood, both ways").toEqual(["newer", "older"]);
  expect(screen.getByRole("button", { name: /Payee 2/ }), "the newer row is here").toBeTruthy();
  expect(screen.getByText("March 2, 2021"), "and so is the day itself").toBeTruthy();
  expect(screen.getByText("nothing"), "as a quiet line").toBeTruthy();
});

/**
 * **A jump behind the ledger's own beginning is not an empty ledger** — but a
 * ledger that answers nothing in either direction is one, wherever the reader
 * is standing, and the screen's first-run state is the honest answer.
 */
it("offers a first capture only once both halves have answered nothing", () => {
  draw(ledgerWith([]), vi.fn(), { anchor: accountingDate("2021-03-02") });
  expect(screen.getByText("nothing yet")).toBeTruthy();
  expect(screen.queryByText(/Nothing recorded on or before/)).toBeNull();
});

/**
 * S04 §6: *today is on the page either way*. Over an empty ledger the rows'
 * place is taken by the first-run state, so the one cell that names the day
 * is the ribbon's — and the ribbon has to draw it from the anchor alone, with
 * no item to derive it from. It did not: an empty ledger had no cell.
 */
it("still offers a first capture when the ledger itself is empty, under a strip naming today", () => {
  draw(ledgerWith([]));
  expect(screen.getByText("nothing yet")).toBeTruthy();
  expect(screen.getByRole("button", { name: /August 14, 2026, nothing/ })).toBeTruthy();
  expect(screen.queryByText("nothing"), "no quiet line over the empty state").toBeNull();
});

/**
 * `YearPicker` pages back to 1900, and the year picked becomes this page's
 * anchor. The strip's run is every day from ten years before the oldest day it
 * has heard of to today — 31 000 cells here — and it was once a `ScrollView`
 * that drew every one of them, each with two `Intl` formats, where the list
 * drew three rows. It is a virtualised list: what is drawn is one window,
 * around the anchor.
 */
it("draws a window of the strip, not the run, after a jump far behind the ledger", () => {
  draw(ledgerWith([], [row("2026-08-14", 2, "-10")]), vi.fn(), {
    anchor: accountingDate("1950-06-01"),
  });
  const cells = Array.from(
    screen.getByRole("list").querySelectorAll("[aria-label]"),
    (cell) => cell.getAttribute("aria-label") ?? "",
  );
  expect(cells.length).toBeLessThanOrEqual(16);
  expect(cells.some((label) => /June 1, 1950/.test(label))).toBe(true);
  // Days nothing has been loaded for say their date and make no claim.
  expect(cells.find((label) => /May 30, 1950/.test(label))).toBe("May 30, 1950");
});

/**
 * **The ribbon runs the way time does.** The list is newest-first because a
 * ledger is read down a page; carried onto the strip unchanged it drew the
 * days backwards, beside a `MonthGrid` one swipe away drawing them forwards.
 */
it("draws the ribbon earliest-first, under a list that runs newest-first", () => {
  draw(ledgerWith([row("2026-08-14", 1, "-96"), row("2026-08-12", 2, "-10")]));
  const strip = screen.getByRole("list");
  const dates = Array.from(
    strip.querySelectorAll("[aria-label]"),
    (cell) => cell.getAttribute("aria-label") ?? "",
  );
  // Every day has a cell, so the run is read for its order, not for its ends:
  // the 12th is drawn before the 14th, and the day between them is between.
  const at = (day: RegExp) => dates.findIndex((label) => day.test(label));
  expect(at(/August 12, 2026, 1 entry/)).toBeGreaterThanOrEqual(0);
  expect(at(/August 13, 2026, nothing/)).toBe(at(/August 12/) + 1);
  expect(at(/August 14, 2026, 1 entry/)).toBe(at(/August 12/) + 2);
  // Before the oldest loaded day the list has read nothing, and says so.
  expect(dates[at(/August 12/) - 1]).toBe("August 11, 2026");
});

/**
 * **The pill floats over the *list*, and the ribbon is not the list** (S04 §4,
 * which names the two separately). Positioned against the whole panel it sat on
 * the ribbon's first cells — covering a weekday letter outright and two 44pt
 * targets. What an absolutely-positioned box can cover is decided by the box it
 * resolves against, so the claim is about which box that is: the pill and the
 * rows it floats over share one, and the strip is outside it.
 */
it("floats over the rows, not over the strip above them", () => {
  draw(ledgerWith([row("2021-03-02", 1, "-96")]), vi.fn(), {
    anchor: accountingDate("2021-03-02"),
  });
  const pill = screen.getByRole("button", { name: /Back to today/ });
  const aRow = screen.getByRole("button", { name: /Payee 1/ });

  let box: HTMLElement | null = pill;
  while (box !== null && !box.contains(aRow)) box = box.parentElement;
  expect(box, "the pill and the rows must share a box at all").not.toBeNull();
  expect(
    box?.contains(screen.getByRole("list")),
    "the strip is chrome above the list, and a floating control must not land on it",
  ).toBe(false);
});

/**
 * **A search that matched nothing is not a ledger with nothing in it** (S04 §6,
 * *Empty · filtered*: "Never the first-run wording: the ledger holds rows, this
 * filter does not"). Nor is it a statement about the anchor: the anchor is
 * fine, the query excluded what is there.
 *
 * The wording says *here*, not *nothing matches*, because the list holds the
 * rows around its anchor while the field above it counts the whole ledger (§7)
 * — a page claiming the ledger for its own window would contradict the number
 * over its head.
 */
it("blames the query, not the ledger and not the anchor, when a search finds nothing", () => {
  draw(ledgerWith([]), vi.fn(), { anchor: accountingDate("2021-03-02"), query: "zzzz" });
  expect(screen.getByText(/Nothing here matches/)).toBeTruthy();
  expect(screen.queryByText("nothing yet"), "the ledger's emptiness, not this one").toBeNull();
  expect(
    screen.queryByText(/Nothing recorded on or before/),
    "the anchor's emptiness, not this one",
  ).toBeNull();
});

/**
 * **The defect this exists for, and the reason it reached a device.**
 *
 * `visibleDay` was written against an assumed item shape and the call site
 * cast `ViewToken.item` to it. The list renders `Entry`, which has *four*
 * kinds, and a row — the commonest thing on screen — carries its day on
 * `row.date` rather than on the entry. The cast silenced the mismatch, the
 * rule returned `undefined`, and `accountingDate` threw a render error over
 * the whole screen on the first scroll.
 *
 * The rule's own tests passed throughout: they exercised the shape it had
 * assumed. This asserts the mapping against the shapes the list actually
 * builds, which is the seam the cast was hiding.
 */
describe("every entry says which day it is on", () => {
  const row: PhoneSearchTransaction = {
    id: id<"transactions">("44444444-4444-4444-8444-444444444444"),
    date: accountingDate("2026-05-25"),
    type: "expense",
    payee: "Corner Cafe",
    amount: toMoney("-20.00"),
    currency: currencyCode("PLN"),
    accountName: "Cash",
    categoryName: null,
  } as PhoneSearchTransaction;

  it("reads a row's day off the row, not off the entry", () => {
    expect(
      dateOfEntry({ key: "r", kind: "row", row, place: "only" as DayRowPlace }),
      "a row is most of the list",
    ).toBe("2026-05-25");
  });

  it("reads the other three kinds off their own fields", () => {
    expect(
      dateOfEntry({
        key: "d",
        kind: "day",
        date: "2026-05-25",
        label: "25 May",
        total: { pivot: toMoney("0"), approximate: false, estimated: false } as never,
        first: true,
      }),
    ).toBe("2026-05-25");
    expect(dateOfEntry({ key: "q", kind: "quiet", date: "2026-05-24", label: "24 May" })).toBe(
      "2026-05-24",
    );
    expect(
      dateOfEntry({ key: "u", kind: "run", label: "3 quiet days", days: 3, from: "2026-05-23" }),
    ).toBe("2026-05-23");
  });

  /** Never `undefined`: that is the value `accountingDate` threw on. */
  it("returns a string or null, never undefined", () => {
    for (const entry of [
      { key: "r", kind: "row", row, place: "only" as DayRowPlace },
      { key: "q", kind: "quiet", date: "2026-05-24", label: "24 May" },
      { key: "u", kind: "run", label: "3 quiet days", days: 3, from: "2026-05-23" },
    ] as const) {
      expect(dateOfEntry(entry), entry.kind).not.toBeUndefined();
    }
  });
});

/**
 * **The path that ships, which the suite did not have.**
 *
 * A tap on a day, and the Today pill, take the cheap road when the day is
 * already rendered: the list scrolls to it and the screen is *told* — never
 * asked to write the route, because a route write re-renders the whole
 * navigation tree and the rows are already there. The first version of that
 * road told the screen nothing at all: the ring and the highlight ended on
 * different cells, and the pill — drawn only while the list is off today —
 * would not dismiss itself.
 *
 * The earlier tests anchored on a date whose day is *not* in the list, so they
 * exercised only the jump. These anchor where the day is loaded.
 */
describe("a day that is already on screen", () => {
  // Anchored on the 14th, so the 13th and the 12th are loaded below it and
  // today is loaded above — both branches' "already on screen" case.
  const loaded = () =>
    ledgerWith(
      [row("2026-08-13", 2, "-20.00"), row("2026-08-12", 3, "-30.00")],
      [row("2026-08-14", 1, "-10.00")],
    );

  it("tells the screen which day it went to, and asks for no jump", () => {
    const onPickDay = vi.fn();
    const onVisibleDay = vi.fn();
    draw(loaded(), onPickDay, { anchor: accountingDate("2026-08-14"), onVisibleDay });
    fireEvent.click(screen.getByRole("button", { name: /August 13, 2026, 1 entry/ }));
    expect(onVisibleDay).toHaveBeenCalledWith("2026-08-13");
    // A jump re-reads the ledger; the rows are already on screen.
    expect(onPickDay).not.toHaveBeenCalled();
  });

  it("dismisses the pill once the list is back on today", () => {
    const onReturnToToday = vi.fn();
    const onVisibleDay = vi.fn();
    draw(loaded(), vi.fn(), {
      anchor: accountingDate("2026-08-12"),
      onReturnToToday,
      onVisibleDay,
    });
    fireEvent.click(screen.getByRole("button", { name: /Back to today/ }));
    expect(onVisibleDay).toHaveBeenCalledWith(TODAY);
    expect(onReturnToToday, "today is loaded, so nothing is re-read").not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Back to today/ })).toBeNull();
  });
});
