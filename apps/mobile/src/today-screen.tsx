import { useAppearance } from "@waltning/client/appearance/use-appearance";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { isPagerPageKey } from "@waltning/client/ledger/pager-date";
import { useDayFlows } from "@waltning/client/ledger/use-day-flows";
import { useDayRows } from "@waltning/client/ledger/use-day-rows";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { useLedgerYears } from "@waltning/client/ledger/use-ledger-years";
import { useMatchDays } from "@waltning/client/ledger/use-match-days";
import { useNearestActivity } from "@waltning/client/ledger/use-nearest-activity";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import { useRecentDays } from "@waltning/client/ledger/use-recent-days";
import { useSpendByCategory } from "@waltning/client/ledger/use-spend-by-category";
import { useUnsettledBanner } from "@waltning/client/ledger/use-unsettled-banner";
import { useWhereItWent } from "@waltning/client/ledger/use-where-it-went";
import { toLedgerItems } from "@waltning/client/transactions/ledger-days";
import { matchesByDay, matchesByMonth } from "@waltning/client/transactions/match-counts";
import { monthGrid, weekdayHeadings } from "@waltning/client/transactions/month-grid";
import {
  busiestMonth,
  otherCurrenciesInYear,
  yearMonths,
} from "@waltning/client/transactions/year-months";
import { FIRST_YEAR, stepYearPage, yearPage } from "@waltning/client/transactions/year-pages";
import { accountingDate, addDays, monthRange, shiftMonth, yearMonth } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import { CategorySheet } from "@waltning/ui/categories/category-sheet";
import { SpendRows } from "@waltning/ui/dashboard/spend-rows";
import { Amount } from "@waltning/ui/fx/amount";
import {
  dayLabel,
  monthLabel,
  monthShort,
  weekdayInitial,
  weekStart,
} from "@waltning/ui/i18n/locales";
import { useLocale, useT } from "@waltning/ui/i18n/provider";
import { Card, GroundPanel } from "@waltning/ui/shell/card";
import { GatewayGrid } from "@waltning/ui/shell/molecules/gateway-grid/gateway-grid";
import { MonthSummary } from "@waltning/ui/shell/month-summary";
import { NetWorthStrip } from "@waltning/ui/shell/net-worth-strip";
import { PagerFrame } from "@waltning/ui/shell/organisms/pager-frame/pager-frame";
import { PeriodPicker } from "@waltning/ui/shell/period-picker";
import {
  ArrowsLeftRightIcon,
  CircleHalfIcon,
  ListBulletsIcon,
  SlidersHorizontalIcon,
} from "@waltning/ui/shell/phosphor";
import { UnsettledBanner } from "@waltning/ui/shell/unsettled-banner";
import { YearPicker } from "@waltning/ui/shell/year-picker";
import { EmptyState } from "@waltning/ui/states/empty-state";
import { ErrorState } from "@waltning/ui/states/error-state";
import { Toast } from "@waltning/ui/states/toast";
import { text } from "@waltning/ui/theme/fonts";
import { useTheme } from "@waltning/ui/theme/provider";
import { makeStyles } from "@waltning/ui/theme/styles";
import { space } from "@waltning/ui/tokens";
import { DayGroup } from "@waltning/ui/transactions/day-group";
import { DayHeader } from "@waltning/ui/transactions/day-header";
import { LedgerRowItem } from "@waltning/ui/transactions/molecules/ledger-row-item/ledger-row-item";
import { MonthGrid } from "@waltning/ui/transactions/organisms/month-grid/month-grid";
import type { MonthRow } from "@waltning/ui/transactions/organisms/month-list/month-list";
import { MonthList } from "@waltning/ui/transactions/organisms/month-list/month-list";
import { YearChart, type YearColumn } from "@waltning/ui/transactions/year-chart";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, Text as RNText, useColorScheme, View } from "react-native";
import { useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated";
import { HomeListPage } from "./home-list-page";
import { openUnsettled } from "./open-unsettled.ts";
import { appearance, PREVIEW_RESET_ENABLED } from "./platform";
import { PreviewAppearanceControls } from "./preview-appearance-controls";
import { usePagerRoute } from "./use-pager-route.ts";

function handleCreateAccount() {
  router.push({ pathname: "/account/new", params: { returnTo: "today" } });
}

function handlePreference(next: "system" | "light" | "dark") {
  return appearance.setPreference(next);
}

/**
 * §7's count for one month. Two flat keys rather than one with a plural,
 * `resultsOne`'s own reason — the resolver picks, and the catalogue is checked
 * for both.
 */
function monthMatch(t: ReturnType<typeof useT>, count: number): { label: string; found: boolean } {
  return {
    label: t(count === 1 ? "transactions.matchesCountOne" : "transactions.matchesCountMany", {
      count,
    }),
    // Zero is still an answer — *not in this month* — but a quiet one, or
    // twelve rows say nothing twelve times.
    found: count > 0,
  };
}

function handleShowAll() {
  router.push("/ledger");
}

/**
 * Summary's *Go to* — only what neither the tab bar nor the shared bar
 * carries (S04 §3). Debt is here rather than in the bar because it is a figure
 * you check, not a place you live, and here it can carry the figure.
 */
function handleGateway(key: string) {
  // A literal per branch rather than a lookup table: expo-router types its
  // routes, and a `Record<string, string>` throws that away — a typo would
  // become a runtime 404 instead of a compile error.
  if (key === "debt") router.push("/debt");
  else if (key === "categories") router.push("/settings/categories");
  else if (key === "currencies") router.push("/settings/currencies");
  else if (key === "rates") router.push("/settings/rates");
}

/**
 * The empty ledger's one thing to do. The floating `+` reaches the same
 * route, but it is mounted by `(tabs)/_layout.tsx` above the whole slot and
 * an `EmptyState` requires an action of its own — so this is the same
 * destination named in the place the reader is already looking.
 */
function handleAddTransaction() {
  router.push("/quick-add");
}

/** C5: every Recent row opens S09 — the caller it returns to is this screen. */
function handleOpenTransaction(id: string) {
  router.push({ pathname: "/transaction/[id]", params: { id } });
}

/**
 * The replica's row shape onto the list's. Named rather than inline because
 * `architecture/11` bans a function expression inside JSX — and because this is
 * the one place the ledger's field names and the component's meet.
 */

/**
 * One screen for both surfaces. The ledger arrives through context — provided
 * at the app boundary from whichever platform module Metro resolved — so
 * nothing in this file knows whether the rows below it live in an iOS
 * document directory or an OPFS pool.
 *
 * **The floating add button is not wired here.** `(tabs)/_layout.tsx` mounts
 * it once, above the whole tab slot, so it survives a tab switch rather than
 * remounting with this screen — `onAdd`, `addDisabled` and the device's
 * `floatPosition` preference all moved with it.
 *
 * **The figures, and which of them the period moves.** `snapshot.netWorth` is
 * `money.netWorth` (A1) per currency; the lead currency's `mine` goes in
 * `NetWorthStrip` and the rest are a line saying the figure is partial, with
 * S16 a tap away for all of them. `FxStatusChip`/`CurrencyChip` are not
 * rendered: there is no rate and no display currency on the phone (arc-phone
 * excludes FX entirely), and a chip with nothing true to say is worse than an
 * empty slot.
 *
 * The period (which month is shown) is this component's own state, never the
 * store's. Everything in `MonthSummary` moves when it steps, and so does
 * *where it went*; the strip does not, because a balance is as of now.
 */
const GATEWAY_ICON = 16;
/** How many of the latest days Summary draws before the List takes over. */
const RECENT_DAYS = 2;

/**
 * The currency the year is folded in when there is no account to read one from.
 * A ledger with no accounts is twelve empty months either way — the fold has
 * nothing to leave out, and the constant only has to be *a* currency.
 */
const LEAD_FALLBACK = money.currencyCode("PLN");

/** The grid's kicker. `DayHeader`'s step, on the ground rather than in a card. */
function SectionLabel({ children }: { children: string }) {
  const styles = useSectionStyles();
  return <RNText style={styles.label}>{children}</RNText>;
}

const useSectionStyles = makeStyles((theme) => ({
  label: { color: theme.textMuted, ...text.ui("kicker") },
  goToRow: { flexDirection: "row", alignItems: "center" },
  // The day's entries, set off from the grid above them by the ground.
  dayPanel: { gap: space.xs },
  // Its own row so the tap target is the line, not the panel.
  nearestDay: { paddingVertical: space.sm },
  /** The chart and the figures it gives a shape to, as one block. */
  year: { gap: space.x3 },
  nothing: { color: theme.textMuted, ...text.ui("caption") },
  spacer: { flex: 1 },
}));

export default function Today() {
  const t = useT();
  const locale = useLocale();
  const ledger = useLedgerController();
  // A label is a word, so the action cannot be a module constant any more —
  // `useT` is a hook. Memoised on `t` so the empty state is not handed a new
  // object on every render.
  const createAccountAction = useMemo(
    () => ({ label: t("routes.createAccount"), onPress: handleCreateAccount }),
    [t],
  );
  const addTransactionAction = useMemo(
    () => ({ label: t("shell.add"), onPress: handleAddTransaction }),
    [t],
  );
  // The ledger holds rows this screen's five-row window did not return — S10
  // is where they are, and *Show all* is already the Recent card's own way of
  // saying so. Existing copy, existing destination.
  const showAllAction = useMemo(() => ({ label: t("shell.showAll"), onPress: handleShowAll }), [t]);
  const snapshot = usePhoneLedger(ledger);
  const systemScheme = useColorScheme();
  const resolved = useAppearance(
    appearance,
    systemScheme === "light" || systemScheme === "dark" ? systemScheme : null,
  );
  const { message, nonce } = useLocalSearchParams<{ message?: string; nonce?: string }>();
  // A route param, not local state — but the screen can stay mounted across
  // two pushes that both carry the same `message` (delete two transactions
  // in a row from S09), and the router hands back a *new* params object
  // each time without `nonce` changing identity by itself. `nonce` is the
  // pushing screen's own `Date.now()` (`transaction-detail-screen.tsx`), so
  // comparing it to the last-seen value — during render, the endorsed
  // pattern for adjusting state from a changed prop — tells an arrival from
  // a re-render apart from a genuinely new push, even when the message text
  // repeats. `toastToken` re-arms `Toast`'s window (H1); `toastDismissed`
  // resets so the new arrival actually shows instead of staying dismissed
  // from the last one.
  const [lastNonce, setLastNonce] = useState(nonce);
  const [toastToken, setToastToken] = useState(1);
  const [toastDismissed, setToastDismissed] = useState(false);
  if (nonce !== lastNonce) {
    setLastNonce(nonce);
    setToastToken((token) => token + 1);
    setToastDismissed(false);
  }
  const handleDismissToast = useCallback(() => {
    setToastDismissed(true);
    setRefusal(null);
  }, []);
  /**
   * A write this screen made and the ledger refused.
   *
   * **The same slot as the arrival toast, not a second one.** Two toasts fight
   * for one corner; and a refusal is the more recent event, so it wins the slot
   * while it is on screen.
   */
  const [refusal, setRefusal] = useState<string | null>(null);
  /** Its own counter, so a second refusal with the same wording still shows. */
  const [refusalToken, setRefusalToken] = useState(0);
  const hasAccounts = snapshot.accounts.length > 0;
  /**
   * **An empty Recent is not by itself a first run.** `snapshot.recent` is a
   * five-row window (`create-phone-ledger.ts` calls `listRecent(5)`), and a
   * window that came back empty is not the same claim as *this ledger has
   * never held a transaction* — the second is a count over the whole ledger,
   * and only the count may choose the `first-run` wording. S10 decides its own
   * empty the same way, through the same unfiltered `searchTransactions({})`.
   *
   * Asked for only when the empty state needs it — `ledger-screen.tsx`'s own
   * reason: an unfiltered count on every render is a second query nothing
   * else on this screen wants.
   */
  const everCaptured =
    hasAccounts && snapshot.recent.length === 0
      ? ledger.searchTransactions({}).total.count > 0
      : false;
  const handleReset = useCallback(() => ledger.reset(), [ledger]);
  // The error a failed refresh set stays on the snapshot until the next
  // success (`create-phone-ledger.ts`'s `refresh()`) — `ErrorState`'s action
  // asks for exactly that next attempt. Its own throw is for a caller that
  // awaits `refresh()`; Retry does not, and the failure it reports already
  // reached the snapshot before this handler runs again.
  const handleRetry = useCallback(() => {
    try {
      ledger.refresh();
    } catch {
      // See above — the snapshot already carries the new failure.
    }
  }, [ledger]);

  // The device's own calendar (§7.0a), the same call `quick-add-screen.tsx`
  // makes — `deviceRuntime` reads `Intl`/`Date` only, not a platform API.
  const today = deviceRuntime().capture().date;
  /** The band's second line — the weekday and the day, under the word *Today*. */
  // The period, the page and the day all live in the URL (`use-pager-route`),
  // so the agent can link to one — S03's *see them in the ledger* is
  // `/?view=list&date=2026-05-25` rather than a screen's own default.
  const gatewayInk = useTheme().accentText;
  const sectionStyles = useSectionStyles();
  const pager = usePagerRoute(today);
  // `DayRibbon` hands back the date it drew; this is where a bare string
  // becomes an `AccountingDate`, and the only place it needs to.
  const handlePickDay = useCallback(
    (date: string) => pager.showDay(accountingDate(date)),
    [pager.showDay],
  );
  // The frame speaks in page keys as strings; `showPage` takes the four this
  // screen knows. `parsePagerState` is what makes a stray one safe, so this
  // narrows rather than validates.
  const handlePageChange = useCallback(
    (key: string) => {
      if (isPagerPageKey(key)) pager.showPage(key);
    },
    [pager.showPage],
  );
  /**
   * The title is the picker, and it opens one (S04 §3).
   *
   * It routed to the Months page first, and rendered that read as a bug:
   * tapping *September* collapsed the header and left a year on screen, with
   * nothing to choose from and no sign the pager had changed page at all. A
   * control whose affordance says *choose* has to answer with a choice.
   *
   * The sheet's year is its own state, so stepping to 2024 to look does not
   * move the ledger — only picking a month does.
   */
  const [pickerYear, setPickerYear] = useState<number | null>(null);
  /**
   * The short swipe's sheet (S04 §7).
   *
   * **The screen owns it, not the list.** A sheet is a layer over the whole
   * screen, and a page inside a pager cannot open one without it sliding
   * horizontally with the page under it. The list knows which row was swiped;
   * this knows where a sheet goes.
   */
  const [categorize, setCategorize] = useState<{
    transactionId: string;
    kind: "income" | "expense";
  } | null>(null);
  const handleCategorize = useCallback(
    (id: string, kind: "income" | "expense") => setCategorize({ transactionId: id, kind }),
    [],
  );
  const dismissCategorize = useCallback(() => setCategorize(null), []);
  const handlePickCategory = useCallback(
    (categoryId: string) => {
      if (categorize === null) return;
      const result = ledger.categorizeBatch({
        transactionIds: [categorize.transactionId],
        categoryId,
      });
      // **A refusal says so.** Closing on a rejected write is the failure that
      // looks like health — the row unchanged, the sheet gone, and every reason
      // to believe it worked. Keeping the sheet open and saying nothing is the
      // second half of the same failure: taps that do nothing, forever, with no
      // message. So the sheet closes either way and the toast carries the
      // refusal, which is where this screen already puts one.
      if ("fieldErrors" in result) {
        setRefusal(result.fieldErrors[0]?.message ?? t("common.couldNotSave"));
        setRefusalToken((token) => token - 1);
      }
      setCategorize(null);
    },
    [categorize, ledger, t],
  );
  /** §6's *the only way back from a jump* — the pill's whole job. */
  const returnToToday = useCallback(() => pager.showDay(today), [pager.showDay, today]);
  /**
   * The search (§7), which lives in the route beside the date because it
   * behaves like one: it survives a swipe, a step and a jump, so Calendar and
   * Months answer *how often, and when* about the search the reader typed.
   *
   * **Opening it writes an empty string, not `null`.** `null` is *no search*
   * and is what closes the field; `""` is *a search with nothing typed yet*,
   * which is the field open and waiting. The two states have to be different
   * or the field could never be opened before a word arrives.
   */
  const [searchOpen, setSearchOpen] = useState(false);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    pager.setQuery(null);
  }, [pager.setQuery]);
  const changeSearch = useCallback((value: string) => pager.setQuery(value), [pager.setQuery]);
  /**
   * **The field is open whenever there is a search, however it arrived.** The
   * flag above is this session's tap on the icon; a query in the URL is a link
   * someone followed. Both are a screen that is narrowed, and a narrowed screen
   * that did not say so would be a ledger quietly missing rows.
   */
  const searching = searchOpen || pager.state.query !== null;
  const searchText = pager.state.query ?? "";
  /**
   * §7's live count, and the whole ledger's — not the loaded page's. The field
   * says how many rows match, which is a fact about the ledger; the list under
   * it walks them a page at a time.
   *
   * **`countOnly`, because that is the whole question.** Without it this takes
   * `searchTransactions`' full path: five joins over every matching row, a
   * `Decimal` or two constructed per row by `signRow`, and `totalsOf` folding
   * currencies nobody reads — on the JS thread, once per keystroke, over the
   * whole ledger. The option exists for exactly this caller.
   *
   * **`snapshot` is a dependency, and it was missing.** `ledger` is stable for
   * the app's life, so without it the count froze at whatever it was when the
   * search began: capture a matching row and the grid gained a mark while the
   * field went on saying three. Every sibling read on this screen names the
   * snapshot for this reason.
   */
  const matchCount = useMemo(() => {
    void snapshot;
    if (pager.state.query === null) return null;
    return ledger.searchTransactions({ text: pager.state.query }, undefined, { countOnly: true })
      .total.count;
  }, [ledger, pager.state.query, snapshot]);
  const openPicker = useCallback(
    () => setPickerYear(Number(pager.state.date.slice(0, 4))),
    [pager.state.date],
  );
  const closePicker = useCallback(() => setPickerYear(null), []);
  const handlePickMonth = useCallback(
    (month: string) => {
      // `yearMonth` rather than a cast: the picker and the Months page both
      // hand back a plain string, and a `YearMonth` that was never checked is
      // a brand asserting something nobody verified.
      setPickerYear(null);
      pager.showMonth(yearMonth(month));
    },
    [pager.showMonth],
  );

  /**
   * One offset, shared with the header, written by whichever page is scrolling.
   *
   * A shared value rather than state: the header's shape is read on the UI
   * thread every frame, and routing 60 scroll events a second through React
   * would re-render this whole screen for a header that moved 1pt.
   *
   * Only the visible page can scroll, so there is no contention between the
   * two — and switching pages carries the offset the new page is at as soon as
   * it moves.
   */
  const scrollY = useSharedValue(0);
  // **The dependency array is not optional here.** Without it Reanimated
  // rebuilds the handler on every render, and `pages` is built from it — so a
  // stable handler is what lets the four page elements stay the same objects
  // and React skip the pages it did not change.
  const handleScroll = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        scrollY.value = event.contentOffset.y;
      },
    },
    [scrollY],
  );

  const barLabels = useMemo(
    () => ({
      previous: t(pager.stepUnit === "year" ? "shell.previousYear" : "shell.previousMonth"),
      next: t(pager.stepUnit === "year" ? "shell.nextYear" : "shell.nextMonth"),
      search: t("shell.search"),
      pickPeriod: t("shell.pickPeriod"),
    }),
    [pager.stepUnit, t],
  );
  const month = yearMonth(pager.state.date.slice(0, 7));

  // Half-open — `money.Period`'s own shape — so the range needs no notion of
  // how many days the month has, only `shiftMonth`.
  const period = useMemo<money.Period>(
    () => ({
      start: accountingDate(`${month}-01`),
      end: accountingDate(`${shiftMonth(month, 1)}-01`),
    }),
    [month],
  );
  // A plain synchronous read, not an effect — the phone's SQLite has no
  // async boundary to wait on. `snapshot` is in the dependency array so a
  // write elsewhere (a save, a reset) recomputes this too: `refresh()`
  // always hands back a new snapshot object, never mutates the old one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: snapshot re-runs this by identity, not by being read.
  const periodSpendRows = useMemo(() => ledger.readPeriodSpend(period), [ledger, period, snapshot]);

  const leadNetWorth = snapshot.netWorth[0];
  /**
   * **The currency a day total is actually in.**
   *
   * `toLedgerItems` takes every row to the *pivot* at its own row's rate
   * (`ledger-days.ts`), and both pages that draw the result were labelling it
   * with `netWorth[0]` — the **lead** currency, which is the currency of your
   * first account and has nothing to do with the pivot. A ledger whose pivot is
   * USD and whose first account is in PLN drew a day of one 500 PLN expense as
   * *-138.89 PLN* under a row reading *-500.00 PLN*: the figure converted, the
   * label not, and the two disagreeing four pixels apart. They agree in a
   * one-currency ledger, which is why it stood.
   */
  const pivotCurrency = useMemo(
    () => snapshot.currencies.find((currency) => currency.isPivot),
    [snapshot.currencies],
  );
  const leadPeriodSpend = leadNetWorth
    ? periodSpendRows.find((row) => row.currency === leadNetWorth.currency)
    : undefined;

  const unsettledModel = useUnsettledBanner(snapshot.unsettledClearing);
  // S04 §3, Shared: "Tapping the unsettled banner goes straight to the
  // unallocated transaction, not to a list." Which of the two the model's
  // `openTarget` names — and the account fallback for an opening balance
  // that has no transaction to open — is `use-unsettled-banner.ts`'s
  // decision; `open-unsettled.ts` turns it into a route, for all three
  // screens that render this banner.
  const openTarget = unsettledModel?.openTarget ?? null;
  const handleOpenUnsettled = useCallback(() => {
    if (openTarget === null) return;
    openUnsettled(openTarget);
  }, [openTarget]);

  const handleOpenAccounts = useCallback(() => router.push("/accounts"), []);

  /**
   * The total, in a line. It led this screen as a 54pt hero in a band that
   * spent about 350pt of an 844pt phone on it — and a figure that moves slowly
   * is not what the app is opened to find out. The register it summarises is
   * one tap away, where every currency and the shared totals live.
   */
  // Each of the three pieces below is memoised for the same reason `body` is:
  // `pages` is built from them, so a fresh element here is a fresh page node
  // there, and a tab tap re-renders every page in the pager.
  const netWorthStrip = useMemo(
    () =>
      leadNetWorth ? (
        <NetWorthStrip
          mine={leadNetWorth.mine}
          ours={leadNetWorth.hasShared ? leadNetWorth.ours : null}
          currency={leadNetWorth.currency}
          decimals={leadNetWorth.decimals}
          otherCurrencies={snapshot.netWorth.length - 1}
          onPress={handleOpenAccounts}
        />
      ) : null,
    [leadNetWorth, snapshot.netWorth.length, handleOpenAccounts],
  );

  /** The hero, and §5's three figures in the shape `net = inflow − spend`. */
  const monthCard = useMemo(
    () =>
      leadNetWorth ? (
        <MonthSummary
          spend={leadPeriodSpend?.spend ?? money.ZERO}
          inflow={leadPeriodSpend?.inflow ?? money.ZERO}
          net={leadPeriodSpend?.net ?? money.ZERO}
          currency={leadNetWorth.currency}
          decimals={leadNetWorth.decimals}
        />
      ) : null,
    [leadNetWorth, leadPeriodSpend],
  );

  // One object per language rather than per render, so a re-render for an
  // unrelated reason does not re-rank the rows.
  const whereItWentLabels = useMemo(
    () => ({
      uncategorized: t("dashboard.uncategorized"),
      other: t("dashboard.other"),
      removed: t("dashboard.removedCategory"),
    }),
    [t],
  );
  /**
   * §6, ranked and named by `useWhereItWent`.
   *
   * **`"mine"`, because this breaks down the figure directly above it.**
   * `MonthSummary`'s *went out* comes from `periodSpend`, which keeps
   * `ownership === "own"` rows only (§5). `money.inScope`'s `"all"` keeps
   * shared ones too, so the bars summed to more than the total they claim to
   * explain — five times more on a ledger holding one shared expense. `"mine"`
   * is exactly `periodSpend`'s filter, and it excludes nothing else:
   * `ownership` and `isBusiness` are different axes and only `"business"`
   * reads the second, so the business half stays in both figures.
   */
  const spendByCategory = useSpendByCategory(ledger, period, "mine", snapshot.revision);
  const whereItWentRows = useWhereItWent(
    spendByCategory,
    // The archived-inclusive tree. `categoryTree` drops archived rows for the
    // picker that reads it, and archiving a category does not rewrite the
    // transactions filed under it — so resolving names from that tree
    // relabelled last month's spending as the honest blank.
    snapshot.fullCategoryTree,
    leadNetWorth?.currency,
    whereItWentLabels,
  );
  // Memoised for the reason the banner and the month card are: `ledgerBody` is
  // built from it, `body` from that and `pages` from that, so a fresh element
  // here re-renders all four of the pager's pages. Opening the month picker
  // did exactly that — a sheet appearing redrew the calendar behind it.
  /**
   * The latest page of the ledger, folded into days — the same read and the
   * same fold as the List page, so the two never disagree about a day. The
   * deck draws two days; more is the List's job.
   */
  const recentRows = useRecentDays(ledger, today, snapshot);
  const recentDays = useMemo(
    () =>
      pivotCurrency === undefined
        ? []
        : toLedgerItems(recentRows, pivotCurrency.code)
            .filter((item) => item.kind === "day")
            .slice(0, RECENT_DAYS),
    [recentRows, pivotCurrency],
  );

  const whereItWent = useMemo(
    () =>
      whereItWentRows.length === 0 || leadNetWorth === undefined ? null : (
        <Card title={t("shell.whereItWent")}>
          <SpendRows
            rows={whereItWentRows}
            currency={leadNetWorth.currency}
            decimals={leadNetWorth.decimals}
          />
        </Card>
      ),
    [whereItWentRows, leadNetWorth, t],
  );

  // S04 §3 draws exactly one banner row, and `Banner`'s own doc is explicit —
  // "page-level, one tone, one action." A second (or third) unsettled
  // clearing account does not stack a second alert; it folds into this one's
  // text as a count. `Open` still lands on the first (`unsettled` above),
  // the same account the message names.
  //
  // The derivation and the wording moved out at `S01`'s third use — the model
  // is `packages/client`'s, the words are `packages/ui`'s, and this screen
  // keeps only the route `Open` lands on, which is the app's own.
  // The model is memoised; without this the element around it was not, and a
  // fresh element here made `ledgerBody` fresh, which made `body` fresh, which
  // rebuilt all four pages.
  const unsettledBanner = useMemo(
    () => <UnsettledBanner model={unsettledModel} onOpen={handleOpenUnsettled} />,
    [unsettledModel, handleOpenUnsettled],
  );

  // Error > empty > populated. An error keeps the hero (`snapshot`'s other
  // fields are untouched by a failed refresh, S04 §6) and replaces only the
  // ground panel's body — never the account list, which a query failure did
  // not touch.
  // Every card carries a figure, which is what makes the grid a status board
  // rather than a menu. A destination with nothing true to say yet passes
  // `null` and draws no second line — an empty line looks broken.
  /**
   * **Every card carries a figure** (§3), which is what makes the grid a status
   * board rather than a menu: *Between us* as a tab was a word and an icon;
   * here it is a count of the people something is open with.
   *
   * `null` where the ledger genuinely has nothing to say yet — a card with an
   * empty line looks broken, and one with no line has simply not been given a
   * figure, which is a different and honest thing. Rates is always `null` on
   * the phone: it has no rate table of its own to count (`architecture/14`).
   */
  const gateways = useMemo(
    () => [
      {
        key: "debt",
        label: t("routes.debt"),
        detail:
          snapshot.counterparties.length === 0
            ? null
            : t("shell.gatewayPeople", { count: snapshot.counterparties.length }),
        icon: <ArrowsLeftRightIcon size={GATEWAY_ICON} color={gatewayInk} />,
      },
      {
        key: "categories",
        label: t("routes.categories"),
        detail:
          whereItWentRows.length === 0
            ? null
            : t("shell.gatewayCategories", { count: whereItWentRows.length }),
        icon: <ListBulletsIcon size={GATEWAY_ICON} color={gatewayInk} />,
      },
      {
        key: "currencies",
        // The codes the ledger actually holds, in the order net worth reports
        // them — which is the ledger's own, not an alphabet.
        label: t("routes.currencies"),
        detail:
          snapshot.netWorth.length === 0
            ? null
            : snapshot.netWorth.map((row) => row.currency).join(" · "),
        icon: <CircleHalfIcon size={GATEWAY_ICON} color={gatewayInk} />,
      },
      {
        key: "rates",
        label: t("routes.rates"),
        detail: null,
        icon: <SlidersHorizontalIcon size={GATEWAY_ICON} color={gatewayInk} />,
      },
    ],
    [gatewayInk, t, snapshot.counterparties, snapshot.netWorth, whereItWentRows],
  );

  const ledgerBody = useMemo(
    () =>
      snapshot.error ? (
        <ErrorState
          variant="recoverable"
          what={t("shell.balanceQueryFailed")}
          why={t("shell.balanceQueryFailedBody")}
          action={{ label: t("common.retry"), onPress: handleRetry }}
        />
      ) : hasAccounts ? (
        <>
          {unsettledBanner}
          {/*
        S04 §3 — the card *is* the group of Recent rows, so with no rows there
        is no group to draw, and *Show all* has nothing to show. What replaces
        it depends on the count, never on the window: an account exists and the
        ledger has never held a transaction is `first-run` for the ledger, not
        for the account list; a ledger that holds rows the window did not
        return is the ordinary empty. Both render on the ground
        (`design-system/05` §5.1). The first-run pair is S10's own, unchanged —
        the ledger is empty is the same fact on both screens. The ordinary one
        is this screen's own (`transactions.emptyRecent*`, S04 §6): S10's says
        a filter is excluding every row, and Recent has no filter to blame — it
        has a five-row window, and *Show all* goes where the rows are.
      */}
          {whereItWent}
          {recentDays.length === 0 ? (
            everCaptured ? (
              <EmptyState
                variant="filtered"
                title={t("transactions.emptyRecentTitle")}
                body={t("transactions.emptyRecentBody")}
                primaryAction={showAllAction}
              />
            ) : (
              <EmptyState
                variant="first-run"
                title={t("transactions.emptyFirstRunTitle")}
                body={t("transactions.emptyFirstRunBody")}
                primaryAction={addTransactionAction}
              />
            )
          ) : (
            // The last days, drawn as the List draws them: a kicker with the
            // day's own figure over a bordered surface of rows. The deck has no
            // *Recent* card and no *Show all* — the List is one swipe away, and
            // a door into the room you are standing next to is a door too many.
            recentDays.map((day) => (
              <DayGroup
                key={day.date}
                label={dayLabel(day.date, locale)}
                {...(day.total.kind !== "total"
                  ? {}
                  : {
                      total: (
                        <Amount
                          value={day.total.pivot}
                          currency={pivotCurrency?.code ?? ""}
                          decimals={pivotCurrency?.decimals ?? 2}
                          size="compact"
                          kind="net"
                        />
                      ),
                    })}
              >
                {day.rows.map((row) => (
                  <LedgerRowItem
                    key={row.id}
                    row={row}
                    withDate={false}
                    onPress={handleOpenTransaction}
                  />
                ))}
              </DayGroup>
            ))
          )}
          {/*
        The appearance control, which the band used to carry in its action
        slot. `PagerFrame` has no such slot — the bar carries the period,
        search and nothing else (S04 §3) — and S04 §4 puts this in S30 ·
        Settings, which does not have it yet. It rides the *Go to* kicker
        until then: an icon alone on the ground is an unexplained circle, and
        beside the heading for low-frequency destinations it at least has
        company and a reason.
      */}
          <View style={sectionStyles.goToRow}>
            <SectionLabel>{t("shell.goTo")}</SectionLabel>
            <View style={sectionStyles.spacer} />
            <PreviewAppearanceControls
              tone="ground"
              preference={resolved.preference}
              resetEnabled={PREVIEW_RESET_ENABLED}
              onPreference={handlePreference}
              onReset={handleReset}
            />
          </View>
          <GatewayGrid gateways={gateways} onSelect={handleGateway} />
        </>
      ) : (
        <EmptyState
          variant="first-run"
          title={t("shell.noAccounts")}
          body={t("shell.noAccountsBody")}
          primaryAction={createAccountAction}
        />
      ),
    [
      snapshot,
      everCaptured,
      handleRetry,
      hasAccounts,
      unsettledBanner,
      t,
      showAllAction,
      addTransactionAction,
      createAccountAction,
      recentDays,
      locale,
      pivotCurrency,
      whereItWent,
      gateways,
      resolved.preference,
      handleReset,
      sectionStyles,
    ],
  );
  /**
   * **Memoised, because `pages` depends on it.**
   *
   * Built inline it was a new element on every render of this screen, so every
   * tab tap handed all four pages new children and re-rendered the whole of
   * Summary — the net-worth strip, the month card, the register — plus the
   * calendar's thirty cells and the year's twelve rows. Measured at a 60ms
   * task on the main thread per tab change, and the same 60ms whichever page
   * it went to, which is what said it was the chrome rebuilding everything
   * rather than the destination drawing itself.
   */
  /**
   * What the toast is saying, and the token that re-arms its window. A refusal
   * carries its own token so a second refusal with the same wording still shows
   * (`Toast`'s H1).
   */
  const notice = refusal ?? (typeof message === "string" && !toastDismissed ? message : null);
  const noticeToken = refusal === null ? toastToken : refusalToken;

  const body = useMemo(
    () => (
      <>
        {notice === null ? null : (
          <Toast message={notice} onDismiss={handleDismissToast} token={noticeToken} />
        )}
        {/*
        Above the error branch, not inside the populated one. S04 §6: a failed
        refresh leaves `snapshot`'s other fields untouched, so the figures it
        did not touch stay on screen and only the part that failed is replaced.
        They were in the band when the band held a hero, which got this for
        free; on the ground it has to be said. With no accounts both are
        `null`, so the first run is unaffected.
      */}
        {netWorthStrip}
        {monthCard}
        {ledgerBody}
      </>
    ),
    [notice, noticeToken, handleDismissToast, netWorthStrip, monthCard, ledgerBody],
  );

  /**
   * What stands in place of the List page when the ledger is empty (§6).
   *
   * **The first-run pair, not Recent's own.** Recent's ordinary empty says a
   * five-row window returned nothing and offers *Show all*; List is where
   * *Show all* goes, so offering it here would be a door back into the room
   * you are standing in. A ledger that has never held a transaction is the
   * same fact on both screens and gets the same words.
   */
  const listEmpty = useMemo(
    () => (
      <EmptyState
        variant="first-run"
        title={t("transactions.emptyFirstRunTitle")}
        body={t("transactions.emptyFirstRunBody")}
        primaryAction={addTransactionAction}
      />
    ),
    [t, addTransactionAction],
  );

  /* ── Calendar ─────────────────────────────────────────────────────────── */

  // Half-open, `money.Period`'s own shape: `monthRange` gives the inclusive
  // last day and `end` is exclusive.
  const monthPeriod = useMemo<money.Period>(() => {
    const range = monthRange(month);
    return { start: range.from, end: addDays(range.to, 1) };
  }, [month]);
  const monthFlows = useDayFlows(ledger, monthPeriod, snapshot);
  /**
   * §7's counts for the month on screen. `null` while the screen is not
   * searching, and then the grid draws its activity marks as usual — the read
   * is skipped entirely rather than matching the empty needle against the
   * month.
   */
  const monthMatchDays = useMatchDays(ledger, monthPeriod, pager.state.query, snapshot);
  const dayMatches = useMemo(
    () => (pager.state.query === null ? undefined : matchesByDay(monthMatchDays)),
    [monthMatchDays, pager.state.query],
  );
  const weeks = useMemo(
    () => monthGrid(monthFlows, month, today, weekStart(locale)),
    [monthFlows, month, today, locale],
  );
  const headingDates = useMemo(() => weekdayHeadings(weekStart(locale)), [locale]);
  // The date is the column's key: two columns can share a letter — English has
  // two "T"s — so the letter cannot identify one.
  const dayHeadings = useMemo(
    () => headingDates.map((date) => ({ key: date, label: weekdayInitial(date, locale) })),
    [headingDates, locale],
  );
  // The letter in the heading is ambiguous by construction, so every cell says
  // its whole date — and whether anything happened on it, which is what a
  // reader who cannot see the mark would otherwise lose entirely.
  const dayName = useCallback(
    (date: string) => {
      const name = dayLabel(accountingDate(date), locale);
      /*
        **While searching, the name is the count.** The cell draws a number
        instead of its activity mark, and a reader who cannot see the number
        was being told about the mark that is no longer there — or, worse,
        "nothing" over a cell reading `1`, because the mark and the match are
        two different populations (a shared-account row has no mark and does
        match). §7's own accessibility line asks for *the full date and what
        happened*; under a search, what happened is how many matched.
      */
      if (dayMatches !== undefined) {
        const found = dayMatches.get(date) ?? 0;
        // **Never "nothing" here.** That word is the unsearched grid's, and it
        // is about the ledger; a searched cell with no match is a day the
        // *query* did not find, which may hold six rows. The count says which
        // — `0 matches` is an answer, `nothing` is a different claim.
        return `${name}, ${monthMatch(t, found).label}`;
      }
      const cell = weeks.flat().find((day) => !("blank" in day) && day.date === date);
      if (cell === undefined || "blank" in cell || cell.activity === "none") {
        return t("transactions.ribbonDayEmpty", { date: name });
      }
      return name;
    },
    [weeks, locale, dayMatches, t],
  );

  /**
   * The tapped day's entries, open under the grid (§3).
   *
   * **Read for the one day, not filtered out of a page.** `readLedgerPage`
   * stops at thirty rows because a ledger does not end; a day does, and a
   * calendar showing the first thirty rows of one would be a shorter truth
   * than the mark above it, which counted all of them.
   */
  const dayRows = useDayRows(ledger, pager.state.date, snapshot);
  /**
   * The fold takes its **pivot**, which is the currency it sums in — the same
   * mistake as the label three lines below used to be: handed the lead
   * currency, `totalOf` compares every row against it to decide whether the
   * total is an approximation, so a converted figure was being flagged exact
   * and a figure genuinely in the pivot flagged approximate.
   */
  const dayEntries = useMemo(
    () => (pivotCurrency ? toLedgerItems(dayRows, pivotCurrency.code) : []),
    [dayRows, pivotCurrency],
  );
  /**
   * **The blank half of the calendar page, which meant three different things
   * and said none of them** (`design-system/08` §8.1 — the conflation it calls
   * the commonest failure in this system). Under a grid of thirty cells sat the
   * day's entries, and where there were none, nothing: a month the ledger has
   * never reached and a month you have simply not tapped a busy day in looked
   * identical, and both looked like a bug.
   *
   * The month's own rows answer which: `monthFlows` is already read for the
   * grid, so *does this month hold anything* costs nothing to ask.
   */
  const monthHasEntries = monthFlows.length > 0;
  const monthHasMatches = dayMatches === undefined || [...dayMatches.values()].some((n) => n > 0);
  const dayHasEntries = dayRows.length > 0;

  /**
   * **Two questions, each asked from the period it is about.**
   *
   * `readNearestActivity` answers relative to whatever period it is handed, and
   * one read served both states: the month-level empty then measured from
   * whichever *square* the reader last touched, so one empty July said *June —
   * 1 entry* or *August — 50 entries* depending on how you arrived. The month's
   * empty state asks about the month; the quiet line under a day asks about the
   * day. The two gates are exclusive, so only ever one of them runs.
   */
  const dayPeriod = useMemo<money.Period>(
    () => ({ start: pager.state.date, end: addDays(pager.state.date, 1) }),
    [pager.state.date],
  );
  const nearestToMonth = useNearestActivity(ledger, monthPeriod, !monthHasEntries, snapshot);
  const nearestToDay = useNearestActivity(
    ledger,
    dayPeriod,
    monthHasEntries && !dayHasEntries && dayMatches === undefined,
    snapshot,
  );
  const goToNearestMonth = useCallback(() => {
    if (nearestToMonth !== null) pager.showDay(nearestToMonth.date);
  }, [nearestToMonth, pager.showDay]);
  const goToNearestDay = useCallback(() => {
    if (nearestToDay !== null) pager.showDay(nearestToDay.date);
  }, [nearestToDay, pager.showDay]);

  /**
   * **The calendar drawing nothing anywhere is not the same claim as the ledger
   * being empty**, and the page may only make the second when it is true.
   *
   * A ledger held entirely in shared accounts, or entirely in transfers, draws
   * nothing on this page while List shows every row of it — *No transactions
   * yet* there is exactly the false claim §8.1 separates these variants to
   * prevent. `recent` settles it in the safe direction: it cannot be non-empty
   * over an empty ledger, so a row in it is proof there is something, whatever
   * the calendar's own predicate can see.
   *
   * **And nothing is claimed before the first refresh has finished.**
   * `revision > 0` is the snapshot's own way of telling *the replica holds
   * nothing* from *no read has run yet* (`create-phone-ledger.ts`), and a fresh
   * install restoring from the server would otherwise be told to capture its
   * first transaction while its ledger downloads.
   */
  const drawsNothing = nearestToMonth === null && !monthHasEntries;
  const loaded = snapshot.revision > 0;
  const ledgerIsEmpty = drawsNothing && snapshot.recent.length === 0;

  const calendarEmpty = useMemo(() => {
    if (!loaded) return null;
    if (dayMatches !== undefined && !monthHasMatches) {
      return (
        <EmptyState
          variant="filtered"
          title={t("transactions.calendarFilteredTitle", {
            month: monthLabel(month, locale).replace(/\s+\d{4}$/, ""),
          })}
          body={t("transactions.calendarFilteredBody", { query: pager.state.query ?? "" })}
          primaryAction={{ label: t("transactions.calendarClearSearch"), onPress: closeSearch }}
        />
      );
    }
    if (monthHasEntries) return null;
    if (drawsNothing) {
      return (
        <EmptyState
          variant="first-run"
          title={t("transactions.emptyFirstRunTitle")}
          body={
            ledgerIsEmpty
              ? t("transactions.emptyFirstRunBody")
              : t("transactions.calendarDrawsNothing")
          }
          primaryAction={addTransactionAction}
        />
      );
    }
    if (nearestToMonth === null) return null;
    return (
      <EmptyState
        variant="range"
        title={t("transactions.calendarRangeTitle", {
          month: monthLabel(month, locale).replace(/\s+\d{4}$/, ""),
        })}
        body={t("transactions.calendarRangeBody", {
          nearest: monthLabel(nearestToMonth.month, locale),
          count: nearestToMonth.count,
        })}
        primaryAction={{
          label: t("transactions.calendarGoToMonth", {
            month: monthLabel(nearestToMonth.month, locale),
          }),
          onPress: goToNearestMonth,
        }}
      />
    );
  }, [
    dayMatches,
    monthHasMatches,
    monthHasEntries,
    drawsNothing,
    ledgerIsEmpty,
    loaded,
    nearestToMonth,
    goToNearestMonth,
    month,
    locale,
    pager.state.query,
    closeSearch,
    addTransactionAction,
    t,
  ]);

  const dayPanel = useMemo(() => {
    const day = dayEntries.find((item) => item.kind === "day");
    return (
      <View style={sectionStyles.dayPanel}>
        {/*
          One line for the date, never two. A `DayHeader` over a `QuietDay`
          printed it twice — the header's own label and the quiet day's — which
          is what a component composed out of two things that each name the day
          looks like. An empty day says *nothing* where its figure would be.
        */}
        {day === undefined ? (
          <DayHeader
            label={dayLabel(pager.state.date, locale)}
            total={
              <RNText style={sectionStyles.nothing}>{t("transactions.nothingThatDay")}</RNText>
            }
          />
        ) : (
          // The same group the List draws — kicker over a bordered surface —
          // so a day looks like a day on both pages. `net`, as the List states
          // it: one day's net, not a balance (S04 §5).
          <DayGroup
            label={dayLabel(pager.state.date, locale)}
            {...(day.total.kind !== "total"
              ? {}
              : {
                  total: (
                    <Amount
                      value={day.total.pivot}
                      currency={pivotCurrency?.code ?? ""}
                      decimals={pivotCurrency?.decimals ?? 2}
                      size="compact"
                      kind="net"
                    />
                  ),
                })}
          >
            {day.rows.map((row) => (
              <LedgerRowItem
                key={row.id}
                row={row}
                withDate={false}
                onPress={handleOpenTransaction}
              />
            ))}
          </DayGroup>
        )}
        {/*
          **A day with nothing, in a month with something, is not an empty
          state** — the page above is full of marks, so a title and a button
          would be shouting about a day the reader picked themselves. One quiet
          line, and it is the only thing in the region that can say *where* the
          entries are: §8.1's *offer the nearest period that does*, at the
          granularity the reader is standing in.
        */}
        {day === undefined && nearestToDay !== null ? (
          <Pressable
            accessibilityRole="button"
            onPress={goToNearestDay}
            style={sectionStyles.nearestDay}
          >
            <RNText style={sectionStyles.nothing}>
              {t("transactions.calendarNearestDay", {
                date: dayLabel(nearestToDay.date, locale),
              })}
            </RNText>
          </Pressable>
        ) : null}
      </View>
    );
  }, [
    dayEntries,
    pager.state.date,
    locale,
    pivotCurrency,
    nearestToDay,
    goToNearestDay,
    t,
    sectionStyles,
  ]);

  /* ── Months ───────────────────────────────────────────────────────────── */

  const shownYear = Number(pager.state.date.slice(0, 4));
  const yearPeriod = useMemo<money.Period>(
    () => ({
      start: accountingDate(`${shownYear}-01-01`),
      end: accountingDate(`${shownYear + 1}-01-01`),
    }),
    [shownYear],
  );
  const yearFlows = useDayFlows(ledger, yearPeriod, snapshot);
  const yearMatchDays = useMatchDays(ledger, yearPeriod, pager.state.query, snapshot);
  const monthMatches = useMemo(
    () => (pager.state.query === null ? null : matchesByMonth(yearMatchDays)),
    [yearMatchDays, pager.state.query],
  );
  const yearRows = useMemo(
    () =>
      yearMonths(
        yearFlows,
        shownYear,
        // With no account there is no lead currency, and the year is twelve
        // empty rows either way — the fold has nothing to leave out.
        leadNetWorth?.currency ?? LEAD_FALLBACK,
        yearMonth(today.slice(0, 7)),
      ),
    [yearFlows, shownYear, leadNetWorth, today],
  );
  const monthRows = useMemo<readonly MonthRow[]>(() => {
    return yearRows.map((row) => ({
      month: row.month,
      label: monthLabel(row.month, locale).replace(/\s+\d{4}$/, ""),
      inflow: row.inflow,
      spend: row.spend,
      net: row.net,
      currency: leadNetWorth?.currency ?? "",
      decimals: leadNetWorth?.decimals ?? 2,
      note:
        row.otherCurrencies === 0
          ? null
          : t("shell.plusOtherCurrencies", { count: row.otherCurrencies }),
      ahead: row.ahead,
      // Absent from the map is nothing found, which is a fact worth drawing —
      // §7's *how often, and when* includes *not in this month*.
      matches: monthMatches === null ? null : monthMatch(t, monthMatches.get(row.month) ?? 0),
    }));
  }, [yearRows, locale, leadNetWorth, monthMatches, t]);

  /**
   * The chart's columns — the same rows, measured rather than stated.
   *
   * **Against the busiest month of this year, never an absolute figure.**
   * `DayRibbon` gives the reason: a ledger whose largest month is 200 and one
   * whose largest is 20 000 would draw every column the same, and the mark
   * exists to say *this was unusual for you*.
   */
  const yearColumns = useMemo<readonly YearColumn[]>(() => {
    const busiest = busiestMonth(yearRows);
    const share = (value: money.Money) =>
      money.isZero(busiest) ? 0 : Number(money.dec(value).div(money.dec(busiest)).toFixed(4));
    return yearRows.map((row) => ({
      month: row.month,
      // Three characters, not one: Polish has three months whose initial is
      // `l`, and a chart whose axis repeats a name is not an axis.
      label: monthShort(row.month, locale).slice(0, 3),
      inflowShare: share(row.inflow),
      spendShare: share(row.spend),
      // **A month with only foreign rows is not an empty month.** `empty`
      // draws a stub, which `YearChart` documents as *an absence rather than a
      // quantity* — and the row four pixels below it would be saying *+1 other
      // currency* about the same month. What the chart cannot do is draw the
      // figure: arc-phone has no conversion (class S), so the month keeps its
      // slot at zero height without claiming nothing happened.
      empty: money.isZero(row.inflow) && money.isZero(row.spend) && row.otherCurrencies === 0,
    }));
  }, [yearRows, locale]);

  /** What the year kept — the twelve nets, added up. */
  const yearKept = useMemo(
    () => yearRows.reduce((total, row) => money.add(total, row.net), money.ZERO),
    [yearRows],
  );
  /** …and what that figure leaves out, counted over the year rather than summed. */
  const yearKeptNote = useMemo(() => {
    // With no account there is no lead currency and no figures to qualify —
    // the same fallback `yearRows` makes, for the same reason.
    const others = otherCurrenciesInYear(yearFlows, leadNetWorth?.currency ?? LEAD_FALLBACK);
    return others === 0 ? undefined : t("shell.plusOtherCurrencies", { count: others });
  }, [yearFlows, leadNetWorth, t]);

  const thisYear = Number(today.slice(0, 4));
  const [pickerYearPage, setPickerYearPage] = useState<number | null>(null);
  const openYearPicker = useCallback(() => setPickerYearPage(shownYear), [shownYear]);
  const closeYearPicker = useCallback(() => setPickerYearPage(null), []);
  const yearPageShown = useMemo(
    () => yearPage(pickerYearPage ?? shownYear, thisYear),
    [pickerYearPage, shownYear, thisYear],
  );
  const olderYears = useCallback(
    () => setPickerYearPage(stepYearPage(yearPageShown.years[0] ?? thisYear, -1, thisYear)),
    [yearPageShown.years, thisYear],
  );
  const newerYears = useCallback(
    () => setPickerYearPage(stepYearPage(yearPageShown.years[0] ?? thisYear, 1, thisYear)),
    [yearPageShown.years, thisYear],
  );
  /** Which years the ledger holds something in — the dot in the grid. */
  const yearsWithEntries = useLedgerYears(ledger, pickerYearPage !== null, snapshot);
  const pickYear = useCallback(
    (year: number) => {
      setPickerYearPage(null);
      // `enterYear` owns the rule — the year's newest month the ledger has
      // reached, entered the way a month is. Spelling it here would be a
      // second implementation of the horizon, and the one this replaced put
      // the shared date three months into the future.
      pager.showYear(year);
    },
    [pager.showYear],
  );
  /**
   * **The chart's arrows are the header's arrows.** The spec says both move the
   * same date; the way to make that true rather than claimed is for there to be
   * one of them. Written as its own year step it was one: `step` keeps the day
   * of the month and the chart's version landed on the 31st of December, so
   * whichever arrow you pressed decided which month the *other three* pages
   * opened on.
   */
  const previousYear = pager.previous;
  const nextYear = pager.next;
  const chartLabels = useMemo(
    () => ({
      older: t("shell.previousYearStep"),
      newer: t("shell.nextYearStep"),
      pickYear: t("shell.pickYear"),
    }),
    [t],
  );

  const flowLabels = useMemo(() => ({ inflow: t("shell.cameIn"), spend: t("shell.wentOut") }), [t]);

  const pages = useMemo(
    () => [
      {
        // The gutter and the scroll belong to the page, not to the pager: the
        // List page is a full-bleed virtualised list and would be ruined by
        // the same wrapper Summary needs.
        key: "summary",
        label: t("shell.summary"),
        node: <GroundPanel onScroll={handleScroll}>{body}</GroundPanel>,
      },
      {
        key: "list",
        label: t("shell.list"),
        node: leadNetWorth ? (
          <HomeListPage
            ledger={ledger}
            anchor={pager.state.date}
            today={today}
            {...(pivotCurrency === undefined
              ? // Unreachable once `currencies` has loaded: the server holds a
                // partial unique index and a trigger over `is_pivot`, so a
                // ledger has exactly one pivot. Rendering nothing beats
                // rendering a figure under a currency this screen guessed.
                { pivotCurrency: leadNetWorth.currency, pivotDecimals: leadNetWorth.decimals }
              : { pivotCurrency: pivotCurrency.code, pivotDecimals: pivotCurrency.decimals })}
            onPickDay={handlePickDay}
            onOpenTransaction={handleOpenTransaction}
            onCategorize={handleCategorize}
            onReturnToToday={returnToToday}
            query={pager.state.query}
            onScroll={handleScroll}
            empty={listEmpty}
          />
        ) : null,
      },
      {
        key: "calendar",
        label: t("shell.calendar"),
        node: (
          <GroundPanel onScroll={handleScroll}>
            <MonthGrid
              weeks={weeks}
              headings={dayHeadings}
              current={pager.state.date}
              today={today}
              labelFor={dayName}
              onPickDay={handlePickDay}
              {...(dayMatches === undefined ? {} : { matches: dayMatches })}
            />
            {calendarEmpty ?? dayPanel}
          </GroundPanel>
        ),
      },
      {
        key: "months",
        label: t("shell.months"),
        node: (
          <GroundPanel onScroll={handleScroll}>
            <View style={sectionStyles.year}>
              <YearChart
                year={shownYear}
                columns={yearColumns}
                current={month}
                kept={
                  <Amount
                    value={yearKept}
                    currency={leadNetWorth?.currency ?? ""}
                    decimals={leadNetWorth?.decimals ?? 2}
                    size="caption"
                    signed
                  />
                }
                {...(yearKeptNote === undefined ? {} : { keptNote: yearKeptNote })}
                {...(shownYear > FIRST_YEAR ? { onOlder: previousYear } : {})}
                {...(shownYear < thisYear ? { onNewer: nextYear } : {})}
                onPickYear={openYearPicker}
                labels={chartLabels}
              />
              <MonthList
                rows={monthRows}
                current={month}
                labels={flowLabels}
                onPickMonth={handlePickMonth}
              />
            </View>
          </GroundPanel>
        ),
      },
    ],
    [
      body,
      calendarEmpty,
      weeks,
      dayHeadings,
      dayName,
      dayPanel,
      chartLabels,
      dayMatches,
      flowLabels,
      leadNetWorth,
      nextYear,
      openYearPicker,
      previousYear,
      shownYear,
      today,
      yearColumns,
      yearKept,
      yearKeptNote,
      handleCategorize,
      handlePickDay,
      pager.state.query,
      returnToToday,
      handlePickMonth,
      handleScroll,
      ledger,
      listEmpty,
      month,
      monthRows,
      pager.state.date,
      pivotCurrency,
      sectionStyles.year,
      t,
      thisYear,
    ],
  );

  return (
    <>
      <PagerFrame
        /*
          **On Months the title is the year.** Every other page is about a
          month and says so; Months is about twelve of them, and a header
          reading *June* over a page of 2026 was the one label on this screen
          that named something the page was not showing. The arrows already
          step a year here (§4: they step the unit the page is in), so the
          title and the control now agree. What does not change with the page
          is the title's *shape* — it is a large tappable title on all four,
          because a picker's affordance disappearing exactly where a reader
          wants it is the failure this label was first written to avoid.
        */
        periodLabel={
          pager.state.page === "months"
            ? String(shownYear)
            : monthLabel(month, locale).replace(/\s+\d{4}$/, "")
        }
        periodDetail={pager.state.page === "months" ? null : String(pager.label.year)}
        /*
          **The period the page on screen is actually showing**, which is the
          month for three of them and the year for Months.

          Keyed on the month for all four, tapping a row on Months animated the
          whole year sliding — and that page draws the same twelve rows either
          way, with a different one marked. A page that moves when its own
          contents did not reads as a remount, which is what it was mistaken
          for. Sortable in both spellings, which is what tells the pages which
          side to come in from.
        */
        periodKey={pager.state.page === "months" ? String(pager.label.year) : month}
        /*
          **The title opens the picker for the unit it names** — the year on
          Months, the month on the other three. It opened the month grid
          everywhere, so tapping *2026* asked *choose a month*, which is a
          control answering a question nobody asked.
        */
        onPickPeriod={pager.state.page === "months" ? openYearPicker : openPicker}
        scrollY={scrollY}
        onPrevious={pager.previous}
        /*
          **The step forward stops at this year on Months, and nowhere else.**
          A month ahead is a month the ledger has expected entries in (§3 draws
          them dashed, *not money yet*); a *year* ahead is twelve stubs and a
          chart of nothing, and the chart's own arrow already refuses it. Two
          controls over one date that disagree about where it can go is the
          defect this pair was written to avoid.
        */
        {...(pager.state.page === "months" && shownYear >= thisYear ? {} : { onNext: pager.next })}
        onSearch={openSearch}
        searchOpen={searching}
        searchQuery={searchText}
        onSearchChange={changeSearch}
        onSearchClose={closeSearch}
        searchPlaceholder={t("transactions.searchThisLedger")}
        {...(matchCount === null ? {} : { searchCount: matchCount })}
        barLabels={barLabels}
        pages={pages}
        activeKey={pager.state.page}
        onPageChange={handlePageChange}
      />
      {/*
        The horizon is this month: S04 §6 does not go past the end of it, so a
        month that has not happened is offered as disabled rather than hidden.
      */}
      <PeriodPicker
        visible={pickerYear !== null}
        year={pickerYear ?? Number(pager.state.date.slice(0, 4))}
        current={month}
        horizon={yearMonth(today.slice(0, 7))}
        onYearChange={setPickerYear}
        onPick={handlePickMonth}
        onDismiss={closePicker}
      />
      <YearPicker
        visible={pickerYearPage !== null}
        page={yearPageShown}
        current={shownYear}
        withEntries={yearsWithEntries}
        onOlder={olderYears}
        onNewer={newerYears}
        onPick={pickYear}
        onDismiss={closeYearPicker}
      />
      {/*
        The short swipe's destination (§7). Rendered beside the picker rather
        than inside a page: both are layers over the screen, and a layer that
        lived in a pager page would slide sideways with it.
      */}
      <CategorySheet
        visible={categorize !== null}
        kind={categorize?.kind ?? "expense"}
        tree={snapshot.categoryTree}
        onPick={handlePickCategory}
        onDismiss={dismissCategorize}
      />
    </>
  );
}
