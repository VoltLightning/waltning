/**
 * `<DualTotal>` — `design-system/05` §5. **The two headline figures.**
 *
 * *mine* dominant, *ours* secondary beneath (`SPEC.md` §6.7).
 *
 * **Never a toggle.** The spec is explicit and the reason is the whole design:
 * showing one at a time invites reading the wrong number — the two figures
 * answer different questions and look identical, so a control that swaps them
 * guarantees that someone eventually reads *ours* believing it is *mine*.
 * There is no `scope` prop here, and that absence is the feature.
 *
 * Distinct from the scope `SegmentControl`, which **is** a filter. These two
 * show together regardless of what is selected there.
 *
 * **Degrades to a single figure** when no shared account exists. A household
 * total of exactly the same number, printed underneath, teaches the reader that
 * the second line carries no information.
 *
 * **Lives only on the shell**, like `CurrencyTotals` — `emphasis="shell"` on
 * both `<Amount>`s and `shellTextMuted` on the labels, not the `text`/
 * `textMuted` a component sitting on `ground` would reach for. Nothing had
 * ever rendered this component under axe until its own story did, before it
 * had a caller — the light-ground inks measured 1.48:1 and 1.58:1 against the
 * shell's green. `DeskBand` is its first real caller, at `size="band"`, ahead
 * of the display-currency hero this component is written for (E9); until
 * then it renders whatever single-currency figure its caller has.
 */

import type * as money from "@waltning/core/money";
import { Text, View } from "react-native";
import { Amount } from "../fx/amount";
import { useT } from "../i18n/provider";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";

export type DualTotalProps = {
  /** Everything you own, business included (§6.7). */
  mine: money.Money;
  /**
   * The household figure, or `null` when there is no shared account.
   *
   * `null` rather than passing `mine` again: the caller saying "there is no
   * second figure" is different from the caller computing the same number
   * twice, and only one of them should render one line.
   */
  ours: money.Money | null;
  currency: string;
  decimals?: number;
  /**
   * `"shell"` (the default) is the phone's full-width hero — `mine` at
   * `displayHero`. `"band"` is `DeskBand`'s (`02-tokens` §2.10): `mine` at
   * `displayOne`, one step down, because a figure sharing a row with nav and
   * a scope control has no 54px to spend. `ours` stays `displayTwo` either
   * way — it is already the secondary line, and the row that shrank it is
   * the one it was already smaller than.
   */
  size?: "shell" | "band";
};

const MINE_SIZE = { shell: "hero", band: "medium" } as const;

export function DualTotal({ mine, ours, currency, decimals = 2, size = "shell" }: DualTotalProps) {
  const t = useT();
  const styles = useStyles();

  return (
    <View style={styles.block}>
      <View>
        <Text style={styles.label}>{t("shell.mine")}</Text>
        <Amount
          value={mine}
          currency={currency}
          decimals={decimals}
          size={MINE_SIZE[size]}
          emphasis="shell"
        />
      </View>
      {ours === null ? null : (
        <View>
          <Text style={styles.label}>{t("shell.ours")}</Text>
          <Amount
            value={ours}
            currency={currency}
            decimals={decimals}
            size="large"
            emphasis="shell"
          />
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  block: { gap: space.xl },
  label: {
    color: theme.shellTextMuted,
    ...text.ui("kicker"),
    textTransform: "uppercase",
  },
}));
