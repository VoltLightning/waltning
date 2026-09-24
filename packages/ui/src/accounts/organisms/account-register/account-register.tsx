/**
 * `<AccountRegister>` — S16 §3, §4, §6: every account, grouped by kind with a
 * subtotal per currency, shared ones apart and at the same weight, archived
 * ones behind a toggle nobody pays for until they ask.
 *
 * **Search, then group, then subtotal — in that order.** A name match can
 * come from any section, so the filter runs first over the whole set and
 * every section below only ever sees what already matched.
 *
 * **Order is `bank · cash · card · clearing · loan_receivable · loan_payable ·
 * investment · deposit · other`.** Nine kinds, nine groups — `loan_receivable`
 * and `loan_payable` are adjacent rather than merged, because they already
 * have two distinct labels (`accounts.kindLoanReceivable` /
 * `kindLoanPayable`) and merging them would be inventing a tenth label this
 * catalogue does not carry, for two kinds that are opposite sides of a debt.
 *
 * **Shared accounts never appear twice.** An account with `ownership:
 * "shared"` is excluded from its kind group and rendered once, in
 * `SharedGroup`, at the register's own foot.
 *
 * **`EmptyState(first-run)` — S16 §6.** `shell/` and `states/` are foundation
 * (`tests/module-boundaries.test.ts` — promoted by D4a's `CategorySheet`, the
 * first module to compose one of these), so this composes it directly rather
 * than asking the screen to branch between two components.
 */

import * as money from "@waltning/core/money";
import type { AccountColor, AccountKind } from "@waltning/core/registry/inputs";
import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { Amount } from "../../../fx/atoms/amount/amount";
import { useT } from "../../../i18n/provider";
import { Button } from "../../../primitives/atoms/button/button";
import { IconButton } from "../../../primitives/atoms/icon-button/icon-button";
import { PressableScaled } from "../../../primitives/atoms/pressable-scaled/pressable-scaled";
import { SearchField } from "../../../primitives/atoms/search-field/search-field";
import {
  SegmentControl,
  type SegmentControlProps,
} from "../../../primitives/atoms/segment-control/segment-control";
import { useInteraction } from "../../../primitives/interaction.ts";
import { usePressScale } from "../../../primitives/press-scale.ts";
import { Card } from "../../../shell/molecules/card/card";
import { ArrowsLeftRightIcon, CaretLeftIcon, SlidersHorizontalIcon } from "../../../shell/phosphor";
import { EmptyState } from "../../../states/organisms/empty-state/empty-state";
import { text } from "../../../theme/fonts.ts";
import { useTheme } from "../../../theme/provider";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, hairline, radius, space, touchTarget } from "../../../tokens.ts";
import { KIND_LABEL_KEY } from "../../kind-label.ts";
import { accountTint, type KindTint, kindTint } from "../../kind-tint.ts";
import { BalanceRow, type BalanceRowProps } from "../../molecules/balance-row/balance-row";
import { SharedGroup, type SharedGroupAccount } from "../../molecules/shared-group/shared-group";
import { type VisibilityAccount, VisibilitySheet } from "../visibility-sheet/visibility-sheet";

export type AccountRegisterAccount = {
  id: string;
  name: string;
  kind: AccountKind;
  ownership: "own" | "shared";
  balance: money.Money;
  currency: string;
  decimals?: number;
  isBusiness: boolean;
  /** The last balance a reconciliation recorded (S16 §5) — `null` before the first one. */
  expectedBalance: money.Money | null;
  /**
   * The balance in the pivot, for an account held in anything else — S16's
   * `62,40 Br · 0,3121 → 19,48 zł`. Absent for the pivot's own accounts, and
   * for a currency with no rate yet: no conversion is drawn rather than a
   * guessed one.
   */
  conversion?: BalanceRowProps["conversion"];
  /**
   * This account's balance in the display currency — what the register adds
   * up. Absent where no rate exists, and then the account is simply not in
   * any total: S16 §3 would rather state a figure over nine of ten accounts
   * and say so than guess the tenth.
   */
  pivotBalance?: money.Money;
  /** S16 §3 — out of the list, though the account is live. Default shown. */
  hidden?: boolean;
  /** S16 §3 — in the total, a separate question from being in the list. Default counted. */
  inTotal?: boolean;
  /** `set_account_visibility`'s compare-and-swap token. */
  version?: number;
  /** A colour picked by hand, or `null`/absent for the kind's own (`02-tokens` §2.1b). */
  color?: AccountColor | null;
};

export type AccountRegisterProps = {
  /** Active accounts only — archived ones arrive through `archivedAccounts`. */
  accounts: readonly AccountRegisterAccount[];
  /** Empty until the toggle has been opened at least once (lazy load, S16 §6). */
  archivedAccounts: readonly AccountRegisterAccount[];
  /**
   * Whether `onLoadArchived` has delivered — **not** whether it was called.
   *
   * An empty `archivedAccounts` means two different things: nothing has been
   * fetched, and nothing exists. Only the caller can tell them apart, and
   * without the distinction the section says *you have no archived accounts*
   * about a list it has not read. Absent means not loaded, so a caller that
   * says nothing never draws that claim; the section stays collapsed
   * instead, which is the honest picture of "not fetched".
   */
  archivedLoaded?: boolean;
  onSelectAccount: (id: string) => void;
  /** Fired whenever the archived section opens — the screen's `loadArchived()`. */
  onLoadArchived: () => void;
  /** `EmptyState(first-run)`'s primary action — offered only with nothing to hold. */
  onCreateAccount: () => void;
  /**
   * S31's own entry point — S16 §7, an own-account row's "Transfer from
   * here". **Optional**, and offered only on an own account's own row: a
   * shared or archived row has no such action yet.
   *
   * A sibling `IconButton` beside `BalanceRow`, never nested inside it — the
   * whole row is already one target (`onSelectAccount`), and a control
   * inside a control is `nested-interactive`, the same violation
   * `primitives/select.tsx`'s own doc names for `MultiSelect`'s token ×.
   */
  onTransferFrom?: (id: string) => void;
  /**
   * S16 §3's reordering, **behind *Edit***: the handles are not the first
   * thing you see, because a register is read far more often than it is
   * arranged. Absent means no *Edit* at all — a screen that cannot write the
   * order must not offer to change it.
   *
   * The **whole** list, in the order it should now hold: `reorder_accounts`
   * sets `sort` by position, and a partial list leaves the rows it omits
   * claiming positions that have moved under them.
   */
  onReorder?: (ids: readonly string[]) => void;
  /**
   * The editor, which is management and so lives behind *Edit* with the move
   * controls (S16 §7). Outside *Edit* a tap is the filter §2 describes, and
   * the two must not be the same gesture: one browses, one rewrites.
   */
  onEditAccount?: (id: string) => void;
  /**
   * The display currency, and with it the register's own total.
   *
   * **Absent draws no total**, which is the honest state for a caller that
   * cannot convert — a register with no pivot is a list of figures in
   * different units, and a sum over those is not a number.
   */
  pivot?: { currency: string; decimals: number };
  /**
   * `set_account_visibility` — S16 §3's two pills.
   *
   * **Absent offers nothing**, the same rule `onReorder` and `onEditAccount`
   * keep: a screen that cannot write the flags must not draw the control that
   * changes them.
   */
  onSetVisibility?: (id: string, next: { hidden: boolean; inTotal: boolean }) => void;
  /**
   * A lens asked for from outside — S04's breakdown opens the register on the
   * lens its row was on. `nonce` makes a second request for the same lens
   * count: the tab stays mounted, so a lens switched by hand in between would
   * otherwise keep the request from applying again.
   */
  requestedView?: { view: RegisterView; nonce: string } | undefined;
};

/**
 * `bank · cash · card · clearing · investment · deposit · other`, then the two
 * loan kinds.
 *
 * **The places money is held come first; what is owed comes last.** A register
 * read top to bottom answers *what do I have* before it answers *what of this
 * is not really mine*, and a loan section in the middle interrupts the first
 * question to start the second. The two loan kinds stay adjacent and stay in
 * that order — what is owed **to** you before what you owe — so the pair reads
 * as one idea with two directions rather than two unrelated groups.
 *
 * `register-order.test.ts` holds this against `ACCOUNT_KIND`, and the failure
 * it guards is worse than a wrong order: the sections are built by mapping
 * *this* list, not by grouping the rows, so a kind nobody adds here renders
 * **nowhere** — its accounts drop out of the register with no empty section to
 * notice and no error to read, while every total that counts them stays
 * right.
 */
export const KIND_ORDER: readonly AccountKind[] = [
  "bank",
  "cash",
  "card",
  "clearing",
  "investment",
  "deposit",
  "other",
  "loan_receivable",
  "loan_payable",
];

/** The two axes the register groups on — `05-composites`'s `SegmentControl`. */
export type RegisterView = "kind" | "currency";

/**
 * The currencies present, in the order their first account appears.
 *
 * **Not alphabetical, and not by size.** The register's own order is the
 * person's (`reorder_accounts`, §3), and the currency view inherits it rather
 * than inventing a second one: the currency you keep at the top of your
 * accounts is the currency that leads here.
 */
function currencyOrder(rows: readonly AccountRegisterAccount[]): readonly string[] {
  const seen: string[] = [];
  for (const row of rows) if (!seen.includes(row.currency)) seen.push(row.currency);
  return seen;
}

function matches(row: AccountRegisterAccount, query: string): boolean {
  return query === "" || row.name.toLowerCase().includes(query);
}

export function AccountRegister({
  accounts,
  archivedAccounts,
  archivedLoaded = false,
  onSelectAccount,
  onLoadArchived,
  onCreateAccount,
  onTransferFrom,
  onReorder,
  onEditAccount,
  pivot,
  onSetVisibility,
  requestedView,
}: AccountRegisterProps) {
  const t = useT();
  const theme = useTheme();
  const styles = useStyles();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<RegisterView>(requestedView?.view ?? "kind");
  // Adjusted during render, the endorsed way to follow a changed prop: the
  // lens is already right on the render that shows it.
  const [appliedNonce, setAppliedNonce] = useState(requestedView?.nonce);
  if (requestedView !== undefined && requestedView.nonce !== appliedNonce) {
    setAppliedNonce(requestedView.nonce);
    setView(requestedView.view);
  }
  /**
   * Which sections are folded away, by section key.
   *
   * **Shut rather than open**, so a section that has never been touched draws
   * expanded: the register's job is to show what exists, and a default that
   * hid nine tenths of it would be a list you have to open to read. It is
   * keyed per view, because *Bank* and *Euro* are not the same section.
   */
  const [shut, setShut] = useState<Record<string, boolean>>({});
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const handleToggleEditing = useCallback(() => setEditing((on) => !on), []);

  const handleClear = useCallback(() => setQuery(""), []);
  const handleToggleArchived = useCallback(() => {
    const next = !archivedOpen;
    setArchivedOpen(next);
    if (next) onLoadArchived();
  }, [archivedOpen, onLoadArchived]);

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(
    () => accounts.filter((row) => matches(row, needle)),
    [accounts, needle],
  );
  /**
   * **Hidden accounts leave the list, and the search still finds them.**
   *
   * A person who hid an account and then typed its name is asking for it, and
   * a register that answered *no matches* about an account it is deliberately
   * holding back would be lying about the ledger. So the flag narrows the
   * resting list and a query overrides it — which is also the only way back to
   * a hidden account without opening the sheet.
   */
  const visible = useMemo(
    () => filtered.filter((row) => needle !== "" || row.hidden !== true),
    [filtered, needle],
  );
  const own = useMemo(() => visible.filter((row) => row.ownership === "own"), [visible]);
  const shared = useMemo(() => visible.filter((row) => row.ownership === "shared"), [visible]);
  const hiddenCount = useMemo(
    () => accounts.filter((row) => row.hidden === true).length,
    [accounts],
  );
  const filteredArchived = useMemo(
    () => archivedAccounts.filter((row) => matches(row, needle)),
    [archivedAccounts, needle],
  );

  /**
   * A move swaps a row with its neighbour **inside its own kind group**,
   * which is the order on screen: the groups themselves are `KIND_ORDER`'s
   * and are not a person's to rearrange. What goes to the executor is every
   * id the register holds, in the order it now draws them — own rows first,
   * then shared, then archived — because `sort` is one sequence over the
   * whole table.
   */
  const handleMove = useCallback(
    (id: string, by: 1 | -1) => {
      if (onReorder === undefined) return;
      const ownIds = own.map((row) => row.id);
      const at = ownIds.indexOf(id);
      const to = at + by;
      // **A move is offered only inside a group**, and that is enforced where
      // it can be seen: the first and last rows of each group have no control
      // to press (`first`/`lastInGroup`). A second check here would be a rule
      // with no way to reach it, which is a rule nothing can test.
      if (at < 0 || to < 0 || to >= ownIds.length) return;
      const next = [...ownIds];
      next[at] = ownIds[to] as string;
      next[to] = ownIds[at] as string;
      onReorder([
        ...next,
        ...shared.map((row) => row.id),
        ...archivedAccounts.map((row) => row.id),
      ]);
    },
    [onReorder, own, shared, archivedAccounts],
  );

  const handleToggleSection = useCallback((key: string) => {
    setShut((current) => ({ ...current, [key]: current[key] !== true }));
  }, []);

  /**
   * The sections, on whichever axis is showing.
   *
   * **The pivot travels with the kind view and not the currency one.** A kind
   * holds accounts in several currencies, so its subtotal exists only once
   * they are converted; a currency group is already one unit, and converting
   * there would print a figure a reader cannot check by adding the rows in
   * front of them.
   */
  const groups = useMemo(() => {
    const sections =
      view === "kind"
        ? KIND_ORDER.map((kind) => ({
            key: kind,
            label: t(`accounts.${KIND_LABEL_KEY[kind]}`),
            tint: kindTint(kind, theme),
            pivot,
            rows: own.filter((row) => row.kind === kind),
          }))
        : currencyOrder(own).map((currency) => ({
            key: currency,
            label: currency,
            tint: undefined,
            pivot: undefined,
            rows: own.filter((row) => row.currency === currency),
          }));
    return sections
      .filter((section) => section.rows.length > 0)
      .map((section) => ({ ...section, toggle: () => handleToggleSection(section.key) }));
  }, [view, own, t, theme, pivot, handleToggleSection]);

  /**
   * What the register adds up to, and what it had to leave out.
   *
   * An account with no rate has no pivot value, so it is not in the total —
   * and the line under the figure says how many were counted rather than
   * letting a sum over nine of ten accounts pass as a sum over ten.
   */
  /**
   * **Three ways out of the total, and they are not the same fact.** No rate
   * (nothing to add), hidden (not on the screen), or left out by hand. Only
   * the first is the register's own doing; the line under the figure counts
   * them all the same way, because a reader adding the rows up wants to know
   * how many of them the number covers, not why each one is missing.
   */
  const counted = useMemo(
    () =>
      accounts.filter(
        (row) => row.pivotBalance !== undefined && row.hidden !== true && row.inTotal !== false,
      ),
    [accounts],
  );
  const total = useMemo(
    () =>
      pivot === undefined || counted.length === 0
        ? undefined
        : counted.reduce(
            (sum, row) => money.add(sum, row.pivotBalance ?? money.ZERO),
            money.ZERO as money.Money,
          ),
    [counted, pivot],
  );
  const viewSegments: SegmentControlProps<RegisterView>["segments"] = useMemo(
    () => [
      { value: "kind", label: t("accounts.byKind") },
      { value: "currency", label: t("accounts.byCurrency") },
    ],
    [t],
  );
  const handleOpenVisibility = useCallback(() => setVisibilityOpen(true), []);
  const handleCloseVisibility = useCallback(() => setVisibilityOpen(false), []);

  /**
   * Every account, archived ones apart — the sheet is where a hidden account
   * is offered back, so it must list the ones the register is not drawing.
   */
  const visibilityRows: readonly VisibilityAccount[] = useMemo(
    () =>
      accounts.map((row) => ({
        id: row.id,
        name: row.name,
        meta: `${t(`accounts.${KIND_LABEL_KEY[row.kind]}`)} · ${row.currency}`,
        hidden: row.hidden === true,
        inTotal: row.inTotal !== false,
      })),
    [accounts, t],
  );
  const heroMark = pivot?.currency ?? "";
  const heroNote = t("accounts.countedOf", {
    counted: String(counted.length),
    total: String(accounts.length),
  });

  const sharedForGroup: readonly SharedGroupAccount[] = useMemo(
    () =>
      shared.map((row) => ({
        id: row.id,
        name: row.name,
        kind: t(`accounts.${KIND_LABEL_KEY[row.kind]}`),
        balance: row.balance,
        currency: row.currency,
        ...(row.decimals === undefined ? {} : { decimals: row.decimals }),
        isBusiness: row.isBusiness,
        unsettled: row.kind === "clearing" && !money.isZero(row.balance),
        expectedBalance: row.expectedBalance,
      })),
    [shared, t],
  );

  const resultCount =
    query === "" ? undefined : own.length + shared.length + filteredArchived.length;
  const nothingMatched = query !== "" && resultCount === 0;

  if (accounts.length === 0 && archivedAccounts.length === 0) {
    return (
      <EmptyState
        variant="first-run"
        title={t("shell.noAccounts")}
        body={t("shell.noAccountsBody")}
        primaryAction={{ label: t("accounts.add"), onPress: onCreateAccount }}
      />
    );
  }

  return (
    <View style={styles.root}>
      {/*
        **What it all comes to, before what it is made of.** S16 §1 says the
        register answers which total these accounts feed, and it never did:
        the screen opened on figures in three currencies with nothing adding
        them up, so the one question you open Accounts to ask had no answer
        anywhere on it.
      */}
      {total === undefined || pivot === undefined ? null : (
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>
            {t("accounts.everythingIn", { currency: heroMark })}
          </Text>
          <Amount value={total} currency={pivot.currency} decimals={pivot.decimals} size="medium" />
          <Text style={styles.heroNote}>{heroNote}</Text>
        </View>
      )}

      {/*
        **Two groupings, because a kind and a currency answer different
        questions.** By kind is *what sort of money is this*; by currency is
        *what do I hold in euro* — and only the second has subtotals a reader
        can check by adding the rows, which is why the pivot travels with the
        first and not the second.
      */}
      <View style={styles.axis}>
        <View style={styles.axisControl}>
          <SegmentControl segments={viewSegments} value={view} onChange={setView} />
        </View>
        {onSetVisibility === undefined ? null : (
          <IconButton label={t("accounts.whatCounts")} onPress={handleOpenVisibility}>
            <SlidersGlyph />
          </IconButton>
        )}
      </View>

      <SearchField
        value={query}
        onChangeText={setQuery}
        // `accounts.search` — *"Search 11 accounts"*, the same placeholder
        // `AccountPicker` already uses. The generic `common.search` was left
        // here when the register was rebuilt, so the one screen that is
        // entirely about accounts said less than the sheet that lists them.
        placeholder={t("accounts.search", { count: accounts.length })}
        onClear={handleClear}
        {...(resultCount === undefined ? {} : { resultCount })}
      />

      {nothingMatched ? <Text style={styles.noMatches}>{t("common.noMatches")}</Text> : null}

      {/*
        **One surface, sections inside it.** Every kind used to be its own
        `Card`, so a register of five kinds drew five bordered boxes each
        carrying a filled header — ten stacked bands for eleven accounts, and
        the pile is what read as noise rather than any one of them. A kind is
        a *label* here, with a rule above it; the card is the list.
      */}
      <Card>
        <View style={styles.sections}>
          {groups.map((group, index) => (
            <RegisterSection
              key={group.key}
              label={group.label}
              {...(group.tint === undefined ? {} : { tint: group.tint })}
              rows={group.rows}
              first={index === 0}
              open={shut[group.key] !== true}
              onToggle={group.toggle}
              {...(group.pivot === undefined ? {} : { pivot: group.pivot })}
              onSelectAccount={onSelectAccount}
              {...(onTransferFrom ? { onTransferFrom } : {})}
              {...(editing && onReorder ? { onMove: handleMove } : {})}
              {...(editing && onEditAccount ? { onEditAccount } : {})}
            />
          ))}
        </View>
      </Card>

      <SharedGroup accounts={sharedForGroup} onSelectAccount={onSelectAccount} />

      {/*
        On the ground, below the last group and **above** the archived
        section — S16 §3 keeps the search field on the ground and this is the
        same rule: a card holds rows, and the one action that creates a new
        row is not a row of the register. Above, because a primary sitting
        under an opened archived list reads as belonging to it. It was
        offered only by the empty state before, so a ledger with one account
        had no way to open its second.
      */}
      <View style={styles.actions}>
        <Button label={t("accounts.add")} onPress={onCreateAccount} variant="primary" />
        {/*
          Offered only where the order can be written, and never while a
          search is narrowing the list: a filtered register cannot state a
          whole order, and the operation takes nothing less.
        */}
        {onReorder === undefined || query !== "" ? null : (
          <Button
            label={t(editing ? "common.save" : "common.edit")}
            onPress={handleToggleEditing}
            variant="ghost"
          />
        )}
      </View>

      {onSetVisibility === undefined ? null : (
        <VisibilitySheet
          visible={visibilityOpen}
          accounts={visibilityRows}
          onChange={onSetVisibility}
          onDismiss={handleCloseVisibility}
        />
      )}

      {/*
        **A hidden account is never only hidden**, or the register would be a
        screen with no way back from a decision made on it. The count is the
        door, and it says how many are behind it.
      */}
      {onSetVisibility === undefined || hiddenCount === 0 ? null : (
        <Button
          label={t("common.fieldValue", {
            field: t("accounts.hiddenAccounts"),
            value: String(hiddenCount),
          })}
          onPress={handleOpenVisibility}
          variant="ghost"
        />
      )}

      <ArchivedToggle
        open={archivedOpen && archivedLoaded}
        accounts={filteredArchived}
        total={archivedAccounts.length}
        onToggle={handleToggleArchived}
      />
    </View>
  );
}

type RegisterSectionProps = {
  /**
   * The kind's colour, or absent.
   *
   * **Absent in the currency view, and that is the point.** The ramp encodes
   * *what sort of account this is*; grouped by currency a section holds a
   * bank, a card and a wallet at once, so a single hue over them would be
   * saying something untrue. The axis you grouped on is the axis that gets
   * to wear a colour.
   */
  tint?: KindTint | undefined;
  label: string;
  /** The first section draws no rule above it — the surface's own edge begins the list. */
  first: boolean;
  open: boolean;
  onToggle: () => void;
  pivot?: { currency: string; decimals: number } | undefined;
  rows: readonly AccountRegisterAccount[];
  onSelectAccount: (id: string) => void;
  onTransferFrom?: (id: string) => void;
  /**
   * S16 §3's reordering, **behind *Edit***: the handles are not the first
   * thing you see, because a register is read far more often than it is
   * arranged. Absent means no *Edit* at all — a screen that cannot write the
   * order must not offer to change it.
   *
   * The **whole** list, in the order it should now hold: `reorder_accounts`
   * sets `sort` by position, and a partial list leaves the rows it omits
   * claiming positions that have moved under them.
   */
  onReorder?: (ids: readonly string[]) => void;
  /** Present only while *Edit* is on — see `AccountRegisterProps.onReorder`. */
  onMove?: (id: string, by: 1 | -1) => void;
  onEditAccount?: (id: string) => void;
};

function RegisterSection({
  tint,
  label,
  rows,
  first,
  open,
  onToggle,
  pivot,
  onSelectAccount,
  onTransferFrom,
  onMove,
  onEditAccount,
}: RegisterSectionProps) {
  const t = useT();
  const styles = useStyles();
  const theme = useTheme();
  const { focused, handlers } = useInteraction();
  // Built above the JSX, never inside it — `tests/architecture.test.ts`.
  const markFill = { backgroundColor: tint?.tint ?? theme.subtleFill };
  const markDot = { backgroundColor: tint?.ink ?? theme.textMuted };
  const labelInk = { color: tint?.ink ?? theme.textMuted };

  /*
    **The subtotal is what this section holds, in the display currency.**

    In the pivot rather than per currency, because a kind is the one grouping
    whose members need not share a unit: three banks in złoty, euro and
    dollars have a sum only once they are converted, and printing three
    figures side by side was the register saying *here are the parts* where a
    reader asked *how much*. Grouped by currency the question does not arise,
    and the caller passes no pivot there.

    A section of one still states it. With a rule under every row and a label
    over every section the header is read as the section's own line rather
    than as another balance, so a lone account no longer prints its figure
    twice in two different voices — and a sum that disappears at one member
    and returns at two is a table with a hole in it.
  */
  const subtotal = useMemo(
    () =>
      pivot === undefined
        ? undefined
        : rows.reduce<money.Money | undefined>(
            (total, row) =>
              row.pivotBalance === undefined
                ? total
                : money.add(total ?? money.ZERO, row.pivotBalance),
            undefined,
          ),
    [rows, pivot],
  );

  return (
    <View style={first ? null : styles.sectionRule}>
      <PressableScaled
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={onToggle}
        {...handlers}
        style={[styles.sectionHead, focused ? styles.focused : null]}
      >
        {tint === undefined ? null : (
          <View style={[styles.sectionMark, markFill]}>
            <View style={[styles.sectionDot, markDot]} />
          </View>
        )}
        <Text style={[styles.sectionLabel, labelInk]} numberOfLines={1}>
          {label}
        </Text>
        {subtotal === undefined || pivot === undefined ? null : (
          <Amount
            value={subtotal}
            currency={pivot.currency}
            decimals={pivot.decimals}
            size="small"
            emphasis="muted"
          />
        )}
        <View style={open ? CARET_UP : CARET_DOWN}>
          <CaretLeftIcon size={14} color={theme.textMuted} />
        </View>
      </PressableScaled>
      {open
        ? rows.map((row, index) => (
            <AccountRegisterRow
              key={row.id}
              account={row}
              first={index === 0}
              onSelect={onSelectAccount}
              {...(onTransferFrom ? { onTransferFrom } : {})}
              {...(onMove ? { onMove, lastInGroup: index === rows.length - 1 } : {})}
              {...(onEditAccount ? { onEditAccount } : {})}
            />
          ))
        : null}
      {open && rows.length === 0 ? (
        <Text style={styles.noMatches}>{t("common.noMatches")}</Text>
      ) : null}
    </View>
  );
}

type AccountRegisterRowProps = {
  account: AccountRegisterAccount;
  /**
   * First in its section — no rule above it, and no *move up*. One flag,
   * because both answer the same question about where the row sits.
   */
  first: boolean;
  onSelect: (id: string) => void;
  onTransferFrom?: (id: string) => void;
  /** Present only while *Edit* is on; the ends of a group are refused rather than hidden. */
  onMove?: (id: string, by: 1 | -1) => void;
  lastInGroup?: boolean;
  onEditAccount?: (id: string) => void;
};

function AccountRegisterRow({
  account,
  first,
  onSelect,
  onTransferFrom,
  onMove,
  lastInGroup = false,
  onEditAccount,
}: AccountRegisterRowProps) {
  const t = useT();
  const styles = useStyles();
  const theme = useTheme();
  // In *Edit* the row opens the editor; outside it, the filter (§2).
  const handlePress = useCallback(
    () => (onEditAccount ? onEditAccount(account.id) : onSelect(account.id)),
    [account.id, onEditAccount, onSelect],
  );
  const handleTransferFrom = useCallback(
    () => onTransferFrom?.(account.id),
    [account.id, onTransferFrom],
  );

  const row = (
    <BalanceRow
      account={account.name}
      // **No second line at all.** The card's title names the kind and the
      // figure on the right carries the currency, so the line that used to
      // sit here — the currency code, alone — was the one thing on the row
      // that was already said twice. Every account in the register was two
      // lines tall for it.
      {...(account.conversion === undefined ? {} : { conversion: account.conversion })}
      balance={account.balance}
      currency={account.currency}
      {...(account.decimals === undefined ? {} : { decimals: account.decimals })}
      isBusiness={account.isBusiness}
      unsettled={account.kind === "clearing" && !money.isZero(account.balance)}
      expectedBalance={account.expectedBalance}
      onPress={handlePress}
      swatch={accountTint(account, theme).ink}
      first={first}
    />
  );

  // While *Edit* is on the row's own action gives way to the move controls:
  // three targets on one 390pt row is a row nobody can hit the right part of.
  if (onMove) {
    return (
      <View style={styles.rowWithAction}>
        <View style={styles.rowMain}>{row}</View>
        <View style={styles.moves}>
          <MoveButton
            id={account.id}
            by={-1}
            label={t("accounts.moveUp", { name: account.name })}
            disabled={first}
            onMove={onMove}
          />
          <MoveButton
            id={account.id}
            by={1}
            label={t("accounts.moveDown", { name: account.name })}
            disabled={lastInGroup}
            onMove={onMove}
          />
        </View>
      </View>
    );
  }

  if (!onTransferFrom) return row;

  return (
    <View style={styles.rowWithAction}>
      <View style={styles.rowMain}>{row}</View>
      <IconButton label={t("shell.transferFromHere")} onPress={handleTransferFrom}>
        <TransferGlyph />
      </IconButton>
    </View>
  );
}

/** One move, as a named component: `IconButton` takes no argument on press. */
function MoveButton({
  id,
  by,
  label,
  disabled,
  onMove,
}: {
  id: string;
  by: 1 | -1;
  label: string;
  disabled: boolean;
  onMove: (id: string, by: 1 | -1) => void;
}) {
  const theme = useTheme();
  const handlePress = useCallback(() => onMove(id, by), [id, by, onMove]);
  return (
    <IconButton label={label} onPress={handlePress} disabled={disabled}>
      <CaretIcon up={by === -1} color={disabled ? theme.textFaint : theme.textMuted} />
    </IconButton>
  );
}

/** The register's own caret — `CaretLeftIcon` rotated, so one shape serves both. */
function CaretIcon({ up, color }: { up: boolean; color: string }) {
  return (
    <View style={up ? CARET_UP : CARET_DOWN}>
      <CaretLeftIcon size={16} color={color} />
    </View>
  );
}

const CARET_UP = { transform: [{ rotate: "90deg" }] } as const;
const CARET_DOWN = { transform: [{ rotate: "-90deg" }] } as const;

/** The way into the visibility sheet — what the register shows and counts. */
function SlidersGlyph() {
  const theme = useTheme();
  return <SlidersHorizontalIcon size={18} color={theme.textMuted} />;
}

/**
 * The transfer glyph — two arrows, opposed, the one S31 and a transfer row draw.
 * It was two bars drawn from views, which at 20pt read as a drag handle: the
 * register looked reorderable and was not.
 */
function TransferGlyph() {
  const theme = useTheme();
  return <ArrowsLeftRightIcon size={18} color={theme.textMuted} />;
}

type ArchivedToggleProps = {
  open: boolean;
  /** What the search left — the rows this section actually draws. */
  accounts: readonly AccountRegisterAccount[];
  /**
   * How many archived accounts the ledger holds, before the search. The
   * *empty* message is a claim about the ledger and the *no matches* one is
   * a claim about the query, and only this figure tells them apart: filtering
   * every archived row out of view is not the same fact as having none.
   */
  total: number;
  onToggle: () => void;
};

function ArchivedToggle({ open, accounts, total, onToggle }: ArchivedToggleProps) {
  const t = useT();
  const styles = useStyles();
  const { focused, handlers } = useInteraction();
  const press = usePressScale();
  /**
   * **The label follows the control's state.** `archivedShow` is the
   * collapsed string and `archivedCount` the expanded one — `en.ts` says so
   * — and falling back to the collapsed one while open had the control read
   * *Archived* at the moment tapping it would close the section. The count
   * is the state; the line below is the content, so `Archived (0)` above
   * *No archived accounts* is not one fact twice.
   */
  const label = open
    ? t("accounts.archivedCount", { count: accounts.length })
    : t("accounts.archivedShow");

  return (
    <View style={styles.archived}>
      {/*
        A disclosure heading, not a `Button` — the same `Pressable` shape
        `LinesCard`'s own rows use, and for the same reason: it carries
        `accessibilityState={{ expanded }}`, without which a reader is told
        nothing about whether the section under it is open. It is also what
        stops a full-width filled band appearing under the pointer for a
        control that opens one section.
      */}
      <Animated.View style={[press.style, styles.inline]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ expanded: open }}
          // The ARIA prop too: react-native-web drops `expanded` from a
          // `Pressable`'s `accessibilityState`, the same gap `chip.tsx` and
          // `radio.tsx` record for `checked`. Without it the state exists on
          // the phone and vanishes on the web, which is the surface a
          // screen-reader user is most likely to meet this section on.
          aria-expanded={open}
          onPress={onToggle}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          {...handlers}
          style={[styles.archivedHeading, focused ? styles.focused : null]}
        >
          <Text style={styles.archivedLabel}>{label}</Text>
        </Pressable>
      </Animated.View>
      {/*
        Distinguished by sitting under the "Archived (n)" heading — text, not
        tint (P5). `opacity` was tried here and failed `axe`'s own
        `color-contrast` check on both themes: a whole-row fade is legal for a
        disabled *control* (`CLAUDE.md`), and a row of figures someone might
        still want to read is not one.
      */}
      {/*
        Opened onto nothing says so, and says *which* nothing. This renders
        only once the rows have actually been loaded (`archivedLoaded`), so
        neither sentence is ever a claim about a list nobody has read. Which
        of the two draws is the rest of it: "you have no archived accounts"
        is categorical, and making it while three sit behind a search query
        is a lie the reader has no way to check.
      */}
      {open && accounts.length === 0 ? (
        <Text style={styles.noMatches}>
          {t(total === 0 ? "accounts.archivedNone" : "accounts.archivedNoMatches")}
        </Text>
      ) : null}
      {open
        ? accounts.map((account, index) => (
            <BalanceRow
              key={account.id}
              first={index === 0}
              account={account.name}
              kind={t(`accounts.${KIND_LABEL_KEY[account.kind]}`)}
              balance={account.balance}
              currency={account.currency}
              {...(account.decimals === undefined ? {} : { decimals: account.decimals })}
            />
          ))
        : null}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.xl },
  /** The one figure the screen exists to state — on the ground, not in a card. */
  hero: { gap: space.xxs },
  /** The grouping control, and the way into what it shows — one row. */
  axis: { flexDirection: "row", alignItems: "center", gap: space.md },
  axisControl: { flex: 1 },
  heroKicker: {
    color: theme.textMuted,
    ...text.ui("kicker"),
    textTransform: "uppercase",
  },
  heroNote: { color: theme.textMuted, ...text.ui("caption") },
  /**
   * The sections, flush inside one surface. The wrapper exists for exactly one
   * reason: `Card` puts `space.xl` between its own children, and these must
   * touch so that the rule between two kinds is the only thing separating
   * them. One child, no gap of its own.
   */
  sections: { flexDirection: "column" },
  /**
   * **Full-bleed and heavier than a row's.** A row's rule is inset to where
   * its name starts, which is what says *the next account*; a kind boundary
   * crosses the whole surface, which is what says *a different sort of thing*.
   * The negative margin is the card's own padding, given back.
   */
  sectionRule: {
    borderTopWidth: hairline.width,
    borderTopColor: theme.border,
    marginHorizontal: -space.x3b,
    paddingHorizontal: space.x3b,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: touchTarget.min,
    paddingTop: space.x3,
    paddingBottom: space.xs,
  },
  sectionMark: {
    width: 19,
    height: 19,
    borderRadius: radius.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionDot: { width: 7, height: 7, borderRadius: radius.xs },
  sectionLabel: {
    flex: 1,
    ...text.ui("kicker"),
    textTransform: "uppercase",
  },
  noMatches: { color: theme.textMuted, ...text.ui("body") },
  subtotals: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  archived: { gap: space.md, marginTop: space.xl },
  archivedHeading: { minHeight: touchTarget.min, justifyContent: "center" },
  archivedLabel: { color: theme.text, ...text.ui("body", 600) },
  focused: {
    outlineWidth: focus.width,
    outlineStyle: "solid",
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  /** A control that must not stretch to the ground's own width. */
  inline: { alignSelf: "flex-start" },
  actions: { flexDirection: "row", alignItems: "center", gap: space.x3 },
  /** The two move controls, beside the row rather than inside it (nested-interactive). */
  moves: { flexDirection: "row", alignItems: "center", gap: space.xs },
  rowWithAction: { flexDirection: "row", alignItems: "center", gap: space.sm },
  rowMain: { flex: 1 },
}));
