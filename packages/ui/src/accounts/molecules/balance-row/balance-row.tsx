/**
 * `<BalanceRow>` — `design-system/05` §5.2: account · kind · `FxAmount` for
 * foreign accounts.
 *
 * **`FxAmount` is selected by the *presence* of a conversion**, not by a flag.
 * A foreign balance therefore cannot be rendered as a bare converted number:
 * building the component at all requires the rate (P1).
 *
 * **`isBusiness` and `unsettled`, added for S16.** §4 lists `Tag` — `BIZ` ·
 * `archived` · clearing's amber marker — as this row's own vocabulary, not a
 * second component's: a business account and a clearing account with an open
 * balance are still one row, identity on the left and a figure on the right.
 * `archived` is not a third flag here — the archived section already says so
 * in its own heading text (P5's "never tint alone" is satisfied by that
 * label), so a row inside it renders with no tag at all.
 *
 * **`onPress`, optional.** Every existing caller renders a static row; S16's
 * register is the first to make one a target, and a row with nowhere to go
 * should not pay for a `Pressable` it does not use.
 *
 * **`expectedBalance`, also S16.** *"Last observed"* — `accounts.
 * expected_balance`, the figure `reconcile_account` last recorded (§5).
 * Shown as the amount alone: the schema carries no column for *when* it was
 * observed, only the value itself, so there is no date to print beside it.
 */

import type * as money from "@waltning/core/money";
import { useMemo } from "react";
import { Text, View } from "react-native";
import { Amount } from "../../../fx/atoms/amount/amount";
import { FxAmount, type FxProvenance } from "../../../fx/atoms/fx-amount/fx-amount";
import { useT } from "../../../i18n/provider";
import { PressableScaled } from "../../../primitives/atoms/pressable-scaled/pressable-scaled";
import { Tag } from "../../../primitives/atoms/tag";
import { useInteraction } from "../../../primitives/interaction.ts";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, hairline, radius, space, touchTarget } from "../../../tokens.ts";

export type BalanceRowProps = {
  account: string;
  /**
   * The line under the name — the account's kind, where that is not already
   * said by whatever holds the row.
   *
   * **Optional, and left out is the common case.** Inside a kind group the
   * card's own title says *Bank*, and the figure on the right already carries
   * the currency, so a second line under the name had nothing left to add:
   * every row of the register was two lines tall to print a code the amount
   * beside it was printing anyway. The shared card is where it earns its
   * place — that one holds accounts of mixed kinds, so the kind is the one
   * thing the card above cannot say.
   */
  kind?: string;
  balance: money.Money;
  currency: string;
  decimals?: number;
  /** Present only when this account is not in the display currency. */
  conversion?: {
    /** Pivot per unit — `<FxAmount>` multiplies by it (§4). */
    rate: money.PivotPerUnit;
    displayCurrency: string;
    displayDecimals?: number;
    provenance?: FxProvenance;
  };
  /** §3.3 — a business row carries the marker in every list it appears in. */
  isBusiness?: boolean;
  /** A clearing account whose balance is not zero (§6.4) — a prompt, not a defect. */
  unsettled?: boolean;
  /** The last balance a reconciliation recorded (S16 §5) — omitted when never reconciled. */
  expectedBalance?: money.Money | null;
  /** Present only where the row is a target — S16's register, tap to edit. */
  onPress?: () => void;
  /**
   * The account's own colour, as a small square before its name — its kind's,
   * or one picked by hand (`02-tokens` §2.1b). The register is where accounts
   * are listed, so it is where a colour chosen in the editor is recognised.
   */
  swatch?: string;
  /**
   * The first row of its section draws no rule above it — the section's own
   * label is already the thing that begins the list, and a hairline between a
   * label and the row it introduces reads as a divider between two unrelated
   * things.
   *
   * **A rule above, not below, and this is why.** Drawn below, the last row of
   * a section lands its hairline directly on top of the heavier rule that
   * begins the next section, and every kind boundary is two lines. Above, the
   * boundary is drawn once by whoever owns it.
   */
  first?: boolean;
};

export function BalanceRow({
  account,
  kind,
  balance,
  currency,
  decimals = 2,
  conversion,
  isBusiness = false,
  unsettled = false,
  expectedBalance,
  onPress,
  swatch,
  first = false,
}: BalanceRowProps) {
  const t = useT();
  const styles = useStyles();
  const { focused, handlers } = useInteraction();
  const swatchFill = useMemo(
    () => (swatch === undefined ? undefined : { backgroundColor: swatch }),
    [swatch],
  );

  const content = (
    <View style={[styles.row, first ? null : styles.ruled]}>
      <View style={styles.identity}>
        <View style={styles.nameLine}>
          {swatchFill === undefined ? null : <View style={[styles.swatch, swatchFill]} />}
          <Text style={styles.name}>{account}</Text>
          {isBusiness ? <Tag variant="biz">{t("accounts.tagBiz")}</Tag> : null}
          {unsettled ? <Tag variant="warn">{t("accounts.tagUnsettled")}</Tag> : null}
        </View>
        {kind === undefined ? null : <Text style={styles.meta}>{kind}</Text>}
        {expectedBalance === undefined || expectedBalance === null ? null : (
          <View style={styles.lastObservedLine}>
            <Text style={styles.meta}>{t("accounts.lastObserved")}</Text>
            <Amount
              value={expectedBalance}
              currency={currency}
              decimals={decimals}
              size="small"
              emphasis="muted"
            />
          </View>
        )}
      </View>
      {conversion ? (
        <FxAmount
          value={balance}
          currency={currency}
          decimals={decimals}
          rate={conversion.rate}
          displayCurrency={conversion.displayCurrency}
          displayDecimals={conversion.displayDecimals ?? 2}
          provenance={conversion.provenance ?? { kind: "synced" }}
          stacked
        />
      ) : (
        <Amount value={balance} currency={currency} decimals={decimals} />
      )}
    </View>
  );

  if (!onPress) return content;

  return (
    <PressableScaled
      accessibilityRole="button"
      accessibilityLabel={account}
      onPress={onPress}
      {...handlers}
      style={[styles.pressable, focused ? styles.focused : null]}
    >
      {content}
    </PressableScaled>
  );
}

const useStyles = makeStyles((theme) => ({
  swatch: { width: 10, height: 10, borderRadius: radius.xs },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xl,
    paddingVertical: space.lg,
  },
  /**
   * **A rule between every account, which is the thing a run of them needs.**
   * Three banks with nothing between them is one block of text a reader has to
   * parse back into rows; the register had exactly that, and it is what made
   * it hard to read at any length past one account per kind.
   *
   * It is inset by construction: the rule is on the row, and the row already
   * sits inside the card's own padding, so the line starts where the name
   * starts. That is what tells it apart from the section rule, which is drawn
   * full-bleed and heavier — siblings get an inset line, a new kind gets one
   * that crosses the whole surface.
   */
  ruled: { borderTopWidth: hairline.width, borderTopColor: theme.hairline },
  identity: { flex: 1, gap: space.xxs },
  nameLine: { flexDirection: "row", alignItems: "center", gap: space.md },
  /*
    **The name is the thing being scanned, so it is the heaviest thing on the
    row.** It was `bodySm` in the regular weight, which on a register put the
    account — the one word a reader is looking for — a step below the figure
    beside it and level with the muted code under it. A list whose labels are
    quieter than its numbers is read number-first, which is the opposite of
    how a register is used: you find *Everyday*, then you read what is in it.
  */
  /*
    500, not 600. The name is still the heaviest thing on its row, but with a
    rule under every account and a mark on every section the page no longer
    needs weight to do the separating — and at 600 across eleven rows the
    whole register read as emphasised, which is the same as nothing being
    emphasised.
  */
  name: { color: theme.text, ...text.ui("body", 500) },
  meta: { color: theme.textMuted, ...text.ui("caption") },
  lastObservedLine: { flexDirection: "row", alignItems: "center", gap: space.xxs },
  /** §10's floor, on the target `Pressable` adds — the row's own content already runs taller in practice. */
  pressable: { minHeight: touchTarget.min, justifyContent: "center" },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
}));
