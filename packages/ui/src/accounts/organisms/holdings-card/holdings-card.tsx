/**
 * `<HoldingsCard>` — S04's hero: what you hold, and what it is made of.
 *
 * **The total leads because it is §1's answer.** *Where do I stand* is what
 * you hold; what the month did is part of that answer and sits in its own card
 * beneath (`MonthSummary`, compact). So this card holds the figure at display
 * size, a line saying how much of it is held and how much owed, and a bar of
 * what it is made of.
 *
 * **Breaking it down opens this card, in place.** Two lenses, the register's
 * own — by kind or by currency — and the bar always draws the lens that is
 * showing, so the closed card already says what the total is made of and the
 * open one names the parts. Every row is a door into S16 on the same lens.
 *
 * **The bar is what is held.** A card in debit is not a negative share of a
 * whole; it is said on the line above, as owed, and the bar only draws parts
 * that are positive.
 *
 * **Loans are listed under their own rule and not added** — `holdings()`
 * keeps them apart (§6.6; S04 §9), and they draw muted rather than in money
 * colours, because they are not part of the figure above them.
 *
 * Renders what it is handed. The fold is `packages/client`'s `holdings()`;
 * a component doing its own arithmetic over accounts would be a second
 * definition of §3 on the screen that states it largest.
 */

import * as money from "@waltning/core/money";
import type { AccountColor, AccountKind } from "@waltning/core/registry/inputs";
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Amount } from "../../../fx/atoms/amount/amount";
import { useT } from "../../../i18n/provider";
import { PressableScaled } from "../../../primitives/atoms/pressable-scaled/pressable-scaled";
import { SegmentControl } from "../../../primitives/atoms/segment-control/segment-control";
import { useInteraction } from "../../../primitives/interaction.ts";
import { Card } from "../../../shell/molecules/card/card";
import { text } from "../../../theme/fonts.ts";
import { useTheme } from "../../../theme/provider";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../../../tokens.ts";
import { KIND_LABEL_KEY } from "../../kind-label.ts";
import { accountTint, kindTint } from "../../kind-tint.ts";
import { KIND_ORDER } from "../account-register/account-register";

/** The register's two lenses — what S16 can be opened on. */
export type HoldingsLens = "kind" | "currency";
/** The card's own three: the register's two, and each account by its own colour. */
export type CardLens = HoldingsLens | "account";

export type HoldingsCardKind = { kind: AccountKind; count: number; value: money.Money };
export type HoldingsCardCurrency = {
  currency: string;
  /** The currency's own name — *US dollar* — since the figure beside it already carries the code. */
  name?: string | undefined;
  decimals: number;
  count: number;
  balance: money.Money;
  value: money.Money;
};

export type HoldingsCardAccount = {
  id: string;
  name: string;
  kind: AccountKind;
  /** Picked by hand, or `null` for the kind's own (`02-tokens` §2.1b). */
  color: AccountColor | null;
  currency: string;
  decimals: number;
  balance: money.Money;
  value: money.Money;
};

export type HoldingsCardProps = {
  /** The display currency every figure but a currency's own balance is in. */
  currency: string;
  decimals: number;
  mine: money.Money;
  /** Drawn under the figure, and the title becomes *Mine* — or `null`, and neither. */
  ours: money.Money | null;
  held: money.Money;
  owed: money.Money;
  counted: number;
  of: number;
  byKind: readonly HoldingsCardKind[];
  byCurrency: readonly HoldingsCardCurrency[];
  loans: readonly HoldingsCardKind[];
  byAccount: readonly HoldingsCardAccount[];
  /** The count in the header, and every kind or currency row — S16, on that row's lens. */
  onOpenAccounts: (lens: HoldingsLens) => void;
  /** An account row — that account's transactions, the register's own row tap (S16 §2). */
  onOpenAccount: (id: string) => void;
  /** Open on arrival, and on which lens — a story's state, never a screen's. */
  initiallyOpen?: boolean;
  initialLens?: CardLens;
};

/** Currencies have no colour of their own; the accent, stepped down, tells them apart by lightness. */
const CURRENCY_STEPS = [1, 0.62, 0.36, 0.2] as const;

export function HoldingsCard({
  currency,
  decimals,
  mine,
  ours,
  held,
  owed,
  counted,
  of,
  byKind,
  byCurrency,
  loans,
  byAccount,
  onOpenAccounts,
  onOpenAccount,
  initiallyOpen = false,
  initialLens = "kind",
}: HoldingsCardProps) {
  const t = useT();
  const styles = useStyles();
  const theme = useTheme();
  const [open, setOpen] = useState(initiallyOpen);
  const [lens, setLens] = useState<CardLens>(initialLens);

  const handleToggle = useCallback(() => setOpen((current) => !current), []);
  const handleOpenKind = useCallback(() => onOpenAccounts("kind"), [onOpenAccounts]);
  const handleOpenLens = useCallback(
    () => onOpenAccounts(lens === "currency" ? "currency" : "kind"),
    [onOpenAccounts, lens],
  );

  /** The register's order, not the fold's — the same kind sits in the same place on both screens. */
  const kinds = useMemo(
    () => [...byKind].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)),
    [byKind],
  );
  /** The register's order: kinds in `KIND_ORDER`, and the person's own order inside each. */
  const accountsInOrder = useMemo(
    () => [...byAccount].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)),
    [byAccount],
  );
  const orderedLoans = useMemo(
    () => [...loans].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)),
    [loans],
  );

  const bar = useMemo(() => {
    const parts =
      lens === "kind"
        ? kinds.map((row) => ({
            key: row.kind,
            value: row.value,
            color: kindTint(row.kind, theme).ink,
            opacity: 1,
          }))
        : lens === "account"
          ? accountsInOrder.map((row) => ({
              key: row.id,
              value: row.value,
              color: accountTint(row, theme).ink,
              opacity: 1,
            }))
          : byCurrency.map((row, index) => ({
              key: row.currency,
              value: row.value,
              color: theme.accent,
              opacity: CURRENCY_STEPS[index % CURRENCY_STEPS.length] ?? 1,
            }));
    // A share is a ratio, not an amount — the one number here, and it is
    // worked out in decimal first, `FlowBar`'s own way.
    const positive = parts.filter((part) => money.isPositive(part.value));
    const whole = money.sum(positive.map((part) => part.value));
    return positive.map((part) => ({
      ...part,
      style: {
        flex: Number(money.dec(part.value).div(money.dec(whole)).toFixed(4)),
        backgroundColor: part.color,
        opacity: part.opacity,
      },
    }));
  }, [lens, kinds, accountsInOrder, byCurrency, theme]);

  const segments = useMemo(
    () =>
      [
        { value: "kind" as const, label: t("accounts.byKind") },
        { value: "currency" as const, label: t("accounts.byCurrency") },
        { value: "account" as const, label: t("accounts.byAccount") },
      ] as const,
    [t],
  );

  const countLabel =
    counted === of
      ? t("accounts.accountCount", { count: counted })
      : t("accounts.accountsOf", { counted, total: of });

  return (
    <Card>
      {/*
        **Its own header, in primary ink.** `Card`'s title is a muted label
        over rows; this one names the screen's hero figure, and `MonthSummary`
        beneath it names its own in ink — two cards on one screen titling their
        figures in two different tones read as two different kinds of card.
      */}
      <View style={styles.header}>
        <Text style={styles.title}>
          {ours === null ? t("accounts.holdingsTitle") : t("accounts.holdingsTitleMine")}
        </Text>
        <CountLink label={countLabel} onPress={handleOpenKind} />
      </View>
      <View style={styles.figures}>
        <Amount value={mine} currency={currency} decimals={decimals} size="medium" />
        {ours === null ? null : (
          <View style={styles.line}>
            <Text style={styles.muted}>{t("shell.ours")}</Text>
            <Amount
              value={ours}
              currency={currency}
              decimals={decimals}
              size="small"
              emphasis="muted"
            />
          </View>
        )}
        <View style={styles.line}>
          <Amount value={held} currency={currency} decimals={decimals} size="small" />
          <Text style={styles.soft}>{t("accounts.held")}</Text>
          {money.isPositive(owed) ? (
            <>
              <Text style={styles.soft}>·</Text>
              <Amount
                value={owed}
                currency={currency}
                decimals={decimals}
                size="small"
                kind="spend"
              />
              <Text style={styles.soft}>{t("accounts.owed")}</Text>
            </>
          ) : null}
        </View>
      </View>

      {bar.length === 0 ? null : (
        <View
          style={styles.bar}
          aria-hidden={true}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {bar.map((part) => (
            <View key={part.key} style={[styles.segment, part.style]} />
          ))}
        </View>
      )}

      {open ? (
        <View style={styles.breakdown}>
          <SegmentControl segments={segments} value={lens} onChange={setLens} />
          <View>
            {lens === "account"
              ? accountsInOrder.map((row, index) => (
                  <AccountRow
                    key={row.id}
                    account={row}
                    meta={t(`accounts.${KIND_LABEL_KEY[row.kind]}`)}
                    displayCurrency={currency}
                    displayDecimals={decimals}
                    last={index === accountsInOrder.length - 1}
                    onOpenAccount={onOpenAccount}
                  />
                ))
              : lens === "kind"
                ? kinds.map((row, index) => (
                    <BreakdownRow
                      key={row.kind}
                      swatch={kindTint(row.kind, theme).ink}
                      opacity={1}
                      name={t(`accounts.${KIND_LABEL_KEY[row.kind]}`)}
                      meta={t("accounts.accountCount", { count: row.count })}
                      value={row.value}
                      currency={currency}
                      decimals={decimals}
                      last={index === kinds.length - 1}
                      onPress={handleOpenLens}
                    />
                  ))
                : byCurrency.map((row, index) => (
                    <BreakdownRow
                      key={row.currency}
                      swatch={theme.accent}
                      opacity={CURRENCY_STEPS[index % CURRENCY_STEPS.length] ?? 1}
                      name={row.name ?? row.currency}
                      meta={`${row.currency} · ${t("accounts.accountCount", { count: row.count })}`}
                      value={row.balance}
                      currency={row.currency}
                      decimals={row.decimals}
                      converted={row.currency === currency ? undefined : row.value}
                      displayCurrency={currency}
                      displayDecimals={decimals}
                      last={index === byCurrency.length - 1}
                      onPress={handleOpenLens}
                    />
                  ))}
          </View>
          {lens === "kind" && orderedLoans.length > 0 ? (
            <View>
              <View style={styles.rule}>
                <Text style={styles.ruleLabel}>{t("accounts.loansOutsideTotal")}</Text>
                <View style={styles.ruleLine} />
              </View>
              {orderedLoans.map((row, index) => (
                <BreakdownRow
                  key={row.kind}
                  swatch={kindTint(row.kind, theme).ink}
                  opacity={1}
                  name={t(`accounts.${KIND_LABEL_KEY[row.kind]}`)}
                  meta={t("accounts.accountCount", { count: row.count })}
                  value={row.value}
                  currency={currency}
                  decimals={decimals}
                  outside
                  last={index === orderedLoans.length - 1}
                  onPress={handleOpenLens}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <PressableScaled
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={handleToggle}
        style={styles.toggle}
      >
        <Text style={styles.toggleLabel}>
          {open ? t("accounts.foldItAway") : t("accounts.breakItDown")}
        </Text>
        <View style={[styles.chevron, open ? styles.chevronUp : styles.chevronDown]} />
      </PressableScaled>
    </Card>
  );
}

/** One account in the third lens — its own colour, its own figure, and its transactions. */
function AccountRow({
  account,
  meta,
  displayCurrency,
  displayDecimals,
  last,
  onOpenAccount,
}: {
  account: HoldingsCardAccount;
  meta: string;
  displayCurrency: string;
  displayDecimals: number;
  last: boolean;
  onOpenAccount: (id: string) => void;
}) {
  const theme = useTheme();
  const { id } = account;
  const handlePress = useCallback(() => onOpenAccount(id), [onOpenAccount, id]);
  return (
    <BreakdownRow
      swatch={accountTint(account, theme).ink}
      opacity={1}
      name={account.name}
      meta={meta}
      value={account.balance}
      currency={account.currency}
      decimals={account.decimals}
      converted={account.currency === displayCurrency ? undefined : account.value}
      displayCurrency={displayCurrency}
      displayDecimals={displayDecimals}
      last={last}
      onPress={handlePress}
    />
  );
}

/** The header's door to S16 — the count is what it opens. */
function CountLink({ label, onPress }: { label: string; onPress: () => void }) {
  const styles = useStyles();
  const { hovered, focused, handlers } = useInteraction();
  return (
    <PressableScaled
      accessibilityRole="link"
      onPress={onPress}
      style={[styles.countLink, hovered ? styles.hovered : null, focused ? styles.focused : null]}
      {...handlers}
    >
      <Text style={styles.muted}>{label}</Text>
      <View style={[styles.chevron, styles.chevronRight]} />
    </PressableScaled>
  );
}

type BreakdownRowProps = {
  swatch: string;
  opacity: number;
  name: string;
  meta: string;
  value: money.Money;
  currency: string;
  decimals: number;
  /** The row's figure in the display currency, under its own — a currency row only. */
  converted?: money.Money | undefined;
  displayCurrency?: string;
  displayDecimals?: number;
  /** A loan: listed, not added, and drawn muted so it does not read as part of the total. */
  outside?: boolean;
  last: boolean;
  onPress: () => void;
};

function BreakdownRow({
  swatch,
  opacity,
  name,
  meta,
  value,
  currency,
  decimals,
  converted,
  displayCurrency,
  displayDecimals,
  outside = false,
  last,
  onPress,
}: BreakdownRowProps) {
  const styles = useStyles();
  const { hovered, focused, handlers } = useInteraction();
  const swatchFill = useMemo(() => ({ backgroundColor: swatch, opacity }), [swatch, opacity]);
  return (
    <PressableScaled
      accessibilityRole="link"
      onPress={onPress}
      style={[
        styles.row,
        last ? null : styles.rowRule,
        hovered ? styles.hovered : null,
        focused ? styles.focused : null,
      ]}
      {...handlers}
    >
      <View style={[styles.swatch, swatchFill]} />
      <View style={styles.rowText}>
        <Text style={styles.rowName}>{name}</Text>
        <Text style={styles.rowMeta}>{meta}</Text>
      </View>
      <View style={styles.rowFigures}>
        <Amount
          value={value}
          currency={currency}
          decimals={decimals}
          size="body"
          {...(outside ? { emphasis: "muted" as const } : {})}
        />
        {converted === undefined || displayCurrency === undefined ? null : (
          <Amount
            value={converted}
            currency={displayCurrency}
            decimals={displayDecimals ?? 2}
            size="small"
            emphasis="muted"
          />
        )}
      </View>
      <View style={[styles.chevron, styles.chevronRight]} />
    </PressableScaled>
  );
}

const useStyles = makeStyles((theme) => ({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: theme.text, ...text.ui("label") },
  figures: { gap: space.xs },
  line: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: space.xs },
  muted: { color: theme.textMuted, ...text.ui("caption") },
  soft: { color: theme.textMuted, ...text.ui("caption") },
  bar: {
    flexDirection: "row",
    gap: space.xxs,
    height: 10,
    borderRadius: radius.xs,
    overflow: "hidden",
  },
  segment: { height: 10 },
  breakdown: { gap: space.md },
  row: {
    minHeight: touchTarget.min + 4,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    borderRadius: radius.xs,
  },
  rowRule: { borderBottomWidth: 1, borderBottomColor: theme.border },
  swatch: { width: 10, height: 10, borderRadius: radius.xs },
  rowText: { flex: 1, minWidth: 0, gap: space.xxs },
  rowName: { color: theme.text, ...text.ui("body", 500) },
  rowMeta: { color: theme.textMuted, ...text.ui("caption") },
  rowFigures: { alignItems: "flex-end", gap: space.xxs },
  rule: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginTop: space.md,
    marginBottom: space.xxs,
  },
  ruleLabel: { color: theme.textMuted, ...text.ui("kicker") },
  ruleLine: { flex: 1, height: 1, backgroundColor: theme.border },
  toggle: {
    minHeight: touchTarget.min,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  toggleLabel: { color: theme.accentText, ...text.ui("label", 600) },
  countLink: {
    minHeight: touchTarget.min,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.xs,
    borderRadius: radius.xs,
  },
  hovered: { backgroundColor: theme.hoverFill },
  focused: {
    outlineWidth: focus.width,
    outlineStyle: "solid",
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  /** Two borders of a square, rotated — `NetWorthStrip`'s drawn disclosure mark. */
  chevron: {
    width: 7,
    height: 7,
    borderRightWidth: 1.5,
    borderTopWidth: 1.5,
    borderColor: theme.textMuted,
  },
  chevronRight: { transform: [{ rotate: "45deg" }] },
  chevronDown: { transform: [{ rotate: "135deg" }], marginTop: -4, borderColor: theme.accentText },
  chevronUp: { transform: [{ rotate: "-45deg" }], marginTop: 4, borderColor: theme.accentText },
}));
