/**
 * `<StatTile>` — `design-system/05` §5.1: figure + label, on the shell.
 *
 * **No `delta` prop yet.** §5.1 describes one ("delta takes `negative` ink
 * when spend rose"), but it needs a prior period's figure to compare against,
 * and C2 — this component's first and only caller — has no prior-period read
 * to hand it (`periodSpend` answers one period at a time). Adding the prop
 * now would be a parameter nothing can fill; a caller that computes a
 * comparison extends this rather than the other way round.
 *
 * **`emphasis="shell"`, matching `DualTotal` above it.** `<Amount>`'s own
 * comment says why: on the dark shell, emphasis wins over sign, because a red
 * figure on dark green is neither legible nor what the shell is for. Sign is
 * still visible in the digits themselves (*spent* prints with its `−`,
 * `periodSpend` returns it already negative) — only the *ink* is fixed.
 */

import type * as money from "@waltning/core/money";
import { Text, View } from "react-native";
import { Amount } from "../fx/amount";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";

export type StatTileProps = {
  label: string;
  value: money.Money;
  currency: string;
  decimals?: number;
};

export function StatTile({ label, value, currency, decimals = 2 }: StatTileProps) {
  const styles = useStyles();

  return (
    <View style={styles.root}>
      <Text style={styles.label}>{label}</Text>
      <Amount value={value} currency={currency} decimals={decimals} size="body" emphasis="shell" />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { flexDirection: "row", alignItems: "baseline", gap: space.x2 },
  label: {
    color: theme.shellTextMuted,
    ...text.ui("kicker"),
    textTransform: "uppercase",
  },
}));
