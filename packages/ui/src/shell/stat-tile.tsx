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
 * **`emphasis="shell"`, matching `DualTotal` above it.** `periodSpend`'s
 * `spend` is a positive magnitude (§12's `spent`, never a signed delta), so
 * nothing here prints a `−` for it. The caller still marks *spent* with
 * `kind="spend"` — correct and forward-looking, even though `<Amount>`'s
 * shell emphasis currently overrides every `kind` for ink (`theme.spend`
 * measured 1.68:1 / 3.63:1 against `theme.shell`, both under the 4.5:1 floor
 * `visual/stories.spec.ts` checks — a verified shell-safe tint is its own
 * card, not this one's). *spent* and *net* read as the same ink today; only
 * the digits distinguish them, which the sign fix above already gets right.
 */

import type * as money from "@waltning/core/money";
import { Text, View } from "react-native";
import { Amount, type AmountKind } from "../fx/amount";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";

export type StatTileProps = {
  label: string;
  value: money.Money;
  currency: string;
  decimals?: number;
  kind?: AmountKind;
};

export function StatTile({ label, value, currency, decimals = 2, kind = "auto" }: StatTileProps) {
  const styles = useStyles();

  return (
    <View style={styles.root}>
      <Text style={styles.label}>{label}</Text>
      <Amount
        value={value}
        currency={currency}
        decimals={decimals}
        size="body"
        emphasis="shell"
        kind={kind}
      />
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
