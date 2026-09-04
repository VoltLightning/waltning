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
import { Pressable, Text, View } from "react-native";
import { Amount } from "../fx/amount";
import { FxAmount, type FxProvenance } from "../fx/fx-amount";
import { useT } from "../i18n/provider";
import { useInteraction } from "../primitives/interaction.ts";
import { Tag } from "../primitives/tag";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, hairline, space, touchTarget } from "../tokens.ts";

export type BalanceRowProps = {
  account: string;
  kind: string;
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
}: BalanceRowProps) {
  const t = useT();
  const styles = useStyles();
  const { focused, handlers } = useInteraction();

  const content = (
    <View style={styles.row}>
      <View style={styles.identity}>
        <View style={styles.nameLine}>
          <Text style={styles.name}>{account}</Text>
          {isBusiness ? <Tag variant="biz">{t("accounts.tagBiz")}</Tag> : null}
          {unsettled ? <Tag variant="warn">{t("accounts.tagUnsettled")}</Tag> : null}
        </View>
        <Text style={styles.meta}>{kind}</Text>
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
        />
      ) : (
        <Amount value={balance} currency={currency} decimals={decimals} />
      )}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={account}
      onPress={onPress}
      {...handlers}
      style={[styles.pressable, focused ? styles.focused : null]}
    >
      {content}
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xl,
    paddingVertical: space.lg,
    borderBottomWidth: hairline.width,
    borderBottomColor: theme.hairline,
  },
  identity: { flex: 1, gap: space.xxs },
  nameLine: { flexDirection: "row", alignItems: "center", gap: space.md },
  name: { color: theme.text, ...text.ui("bodySm") },
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
