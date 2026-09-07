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
 * **`tone` says which ground it is on, because the ink is not the same.**
 * `periodSpend`'s `spend` is a positive magnitude (§12's `spent`, never a
 * signed delta), so nothing here prints a `−` for it — but *what colour* it
 * takes depends on where the tile sits:
 *
 * - `"shell"` (the default) is the sage band. `<Amount>`'s shell emphasis
 *   overrides every `kind` for ink, because `theme.spend` measured 1.68:1 /
 *   3.63:1 against `theme.shell` — both under the 4.5:1 floor. *spent* and
 *   *net* read as the same ink there; only the digits distinguish them.
 * - `"surface"` is a card, where `income` and `spend` are the tokens' own
 *   money colours and clear 4.5:1 on every fill a figure lands on. `kind`
 *   means what it says.
 *
 * **The prop exists because moving this tile onto a card without it printed
 * near-white digits on cream.** Nothing failed: the automated contrast pass
 * did not flag it, and it took a screenshot to see. `PeriodHeader` carries the
 * same prop for the same reason, and `MonthSummary` sets both.
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
  /** The ground it sits on: `"shell"` (default) — the band; `"surface"` — a card. */
  tone?: "shell" | "surface";
};

export function StatTile({
  label,
  value,
  currency,
  decimals = 2,
  kind = "auto",
  tone = "shell",
}: StatTileProps) {
  const styles = useStyles();

  return (
    <View style={tone === "shell" ? styles.root : styles.rootSurface}>
      <Text style={tone === "shell" ? styles.label : styles.labelSurface}>{label}</Text>
      <Amount
        value={value}
        currency={currency}
        decimals={decimals}
        size="body"
        emphasis={tone === "shell" ? "shell" : "default"}
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
  /**
   * Stacked rather than in a row: on a card the tile is one of a pair sharing
   * the width, and a label beside a figure at that width wraps. In the band it
   * has the whole row.
   */
  rootSurface: { gap: space.xxs },
  labelSurface: {
    color: theme.textMuted,
    ...text.ui("kicker"),
    textTransform: "uppercase",
  },
}));
