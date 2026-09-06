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
import type { AccountKind } from "@waltning/core/registry/inputs";
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Amount } from "../fx/amount";
import type { Messages } from "../i18n/en.ts";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { IconButton } from "../primitives/icon-button";
import { SearchField } from "../primitives/search-field";
import { Card } from "../shell/card";
import { EmptyState } from "../states/empty-state";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { radius, space } from "../tokens.ts";
import { BalanceRow } from "./balance-row";
import { SharedGroup, type SharedGroupAccount } from "./shared-group";
import { subtotalsOf } from "./subtotals.ts";

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
};

export type AccountRegisterProps = {
  /** Active accounts only — archived ones arrive through `archivedAccounts`. */
  accounts: readonly AccountRegisterAccount[];
  /** Empty until the toggle has been opened at least once (lazy load, S16 §6). */
  archivedAccounts: readonly AccountRegisterAccount[];
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
};

/** `bank · cash · card · clearing · loan_receivable · loan_payable · investment · deposit · other`. */
const KIND_ORDER: readonly AccountKind[] = [
  "bank",
  "cash",
  "card",
  "clearing",
  "loan_receivable",
  "loan_payable",
  "investment",
  "deposit",
  "other",
];

const KIND_LABEL_KEY: Record<AccountKind, keyof Messages["accounts"]> = {
  cash: "kindCash",
  bank: "kindBank",
  card: "kindCard",
  loan_receivable: "kindLoanReceivable",
  loan_payable: "kindLoanPayable",
  clearing: "kindClearing",
  investment: "kindInvestment",
  deposit: "kindDeposit",
  other: "kindOther",
};

function matches(row: AccountRegisterAccount, query: string): boolean {
  return query === "" || row.name.toLowerCase().includes(query);
}

export function AccountRegister({
  accounts,
  archivedAccounts,
  onSelectAccount,
  onLoadArchived,
  onCreateAccount,
  onTransferFrom,
}: AccountRegisterProps) {
  const t = useT();
  const styles = useStyles();
  const [query, setQuery] = useState("");
  const [archivedOpen, setArchivedOpen] = useState(false);

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
  const own = useMemo(() => filtered.filter((row) => row.ownership === "own"), [filtered]);
  const shared = useMemo(() => filtered.filter((row) => row.ownership === "shared"), [filtered]);
  const filteredArchived = useMemo(
    () => archivedAccounts.filter((row) => matches(row, needle)),
    [archivedAccounts, needle],
  );

  const groups = useMemo(
    () =>
      KIND_ORDER.map((kind) => ({ kind, rows: own.filter((row) => row.kind === kind) })).filter(
        (group) => group.rows.length > 0,
      ),
    [own],
  );

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
      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder={t("common.search")}
        onClear={handleClear}
        {...(resultCount === undefined ? {} : { resultCount })}
      />

      {nothingMatched ? <Text style={styles.noMatches}>{t("common.noMatches")}</Text> : null}

      {groups.map((group) => (
        <KindGroup
          key={group.kind}
          label={t(`accounts.${KIND_LABEL_KEY[group.kind]}`)}
          rows={group.rows}
          onSelectAccount={onSelectAccount}
          {...(onTransferFrom ? { onTransferFrom } : {})}
        />
      ))}

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
      <View style={styles.inline}>
        <Button label={t("accounts.add")} onPress={onCreateAccount} variant="primary" />
      </View>

      <ArchivedToggle
        open={archivedOpen}
        accounts={filteredArchived}
        total={archivedAccounts.length}
        onToggle={handleToggleArchived}
      />
    </View>
  );
}

type KindGroupProps = {
  label: string;
  rows: readonly AccountRegisterAccount[];
  onSelectAccount: (id: string) => void;
  onTransferFrom?: (id: string) => void;
};

function KindGroup({ label, rows, onSelectAccount, onTransferFrom }: KindGroupProps) {
  const styles = useStyles();
  const subtotals = subtotalsOf(rows);

  const action = (
    <View style={styles.subtotals}>
      {subtotals.map((subtotal) => (
        <Amount
          key={subtotal.currency}
          value={subtotal.balance}
          currency={subtotal.currency}
          decimals={subtotal.decimals}
          size="small"
        />
      ))}
    </View>
  );

  return (
    <Card title={label} action={action}>
      {rows.map((row) => (
        <AccountRegisterRow
          key={row.id}
          account={row}
          onSelect={onSelectAccount}
          {...(onTransferFrom ? { onTransferFrom } : {})}
        />
      ))}
    </Card>
  );
}

type AccountRegisterRowProps = {
  account: AccountRegisterAccount;
  onSelect: (id: string) => void;
  onTransferFrom?: (id: string) => void;
};

function AccountRegisterRow({ account, onSelect, onTransferFrom }: AccountRegisterRowProps) {
  const t = useT();
  const styles = useStyles();
  const handlePress = useCallback(() => onSelect(account.id), [account.id, onSelect]);
  const handleTransferFrom = useCallback(
    () => onTransferFrom?.(account.id),
    [account.id, onTransferFrom],
  );

  const row = (
    <BalanceRow
      account={account.name}
      kind={t(`accounts.${KIND_LABEL_KEY[account.kind]}`)}
      balance={account.balance}
      currency={account.currency}
      {...(account.decimals === undefined ? {} : { decimals: account.decimals })}
      isBusiness={account.isBusiness}
      unsettled={account.kind === "clearing" && !money.isZero(account.balance)}
      expectedBalance={account.expectedBalance}
      onPress={handlePress}
    />
  );

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

/** The drawn transfer glyph — two arrows, opposed (`TransferComposer`'s own `SwapArrow`, matched rather than shared: one more use, still under the third). */
function TransferGlyph() {
  const styles = useStyles();
  return (
    <View style={styles.transferGlyph}>
      <View style={[styles.transferGlyphBar, styles.transferGlyphBarTop]} />
      <View style={[styles.transferGlyphBar, styles.transferGlyphBarBottom]} />
    </View>
  );
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
  // A count of nothing is not information, and the line below already states
  // the fact — "Archived (0)" beside "No archived accounts." is one thing
  // said twice.
  const label =
    open && accounts.length > 0
      ? t("accounts.archivedCount", { count: accounts.length })
      : t("accounts.archivedShow");

  return (
    <View style={styles.archived}>
      {/*
        Sized to its own label. A `Button` fills the column it sits in, so
        the section heading painted a full-width filled band the moment it
        was hovered or focused — a bar across the register for a control
        that opens one section.
      */}
      <View style={styles.inline}>
        <Button label={label} onPress={onToggle} variant="ghost" />
      </View>
      {/*
        Distinguished by sitting under the "Archived (n)" heading — text, not
        tint (P5). `opacity` was tried here and failed `axe`'s own
        `color-contrast` check on both themes: a whole-row fade is legal for a
        disabled *control* (`CLAUDE.md`), and a row of figures someone might
        still want to read is not one.
      */}
      {/*
        Opened onto nothing says so, and says *which* nothing. The rows load
        lazily (S16 §6), so whether any exist is not known until the toggle
        has run once — the heading cannot be hidden in advance, and a heading
        over blank space is what these two lines replace. Which of them draws
        is the whole point: "you have no archived accounts" is a categorical
        claim about the ledger, and making it while three sit behind a search
        query is a lie the reader has no way to check.
      */}
      {open && accounts.length === 0 ? (
        <Text style={styles.noMatches}>
          {t(total === 0 ? "accounts.archivedNone" : "accounts.archivedNoMatches")}
        </Text>
      ) : null}
      {open
        ? accounts.map((account) => (
            <BalanceRow
              key={account.id}
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
  noMatches: { color: theme.textMuted, ...text.ui("body") },
  subtotals: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  archived: { gap: space.md, marginTop: space.xl },
  /** A control that must not stretch to the ground's own width. */
  inline: { alignSelf: "flex-start" },
  rowWithAction: { flexDirection: "row", alignItems: "center", gap: space.sm },
  rowMain: { flex: 1 },
  transferGlyph: { width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  transferGlyphBar: { position: "absolute", width: 14, height: 2, backgroundColor: theme.text },
  transferGlyphBarTop: { top: 5, borderRadius: radius.xs },
  transferGlyphBarBottom: { bottom: 5, borderRadius: radius.xs },
}));
