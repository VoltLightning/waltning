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
 *
 * **`size="compact"` is a different shape, not a smaller `"band"`.** It is
 * `DeskBand`'s *collapsed* row — one line tall, no room for two stacked
 * kickers-plus-figures — so *mine* and *ours* sit side by side with no
 * label at all: `displayThree` beside a smaller, `shellMuted` figure. That
 * is the same move §2.9 already makes for the phone header's own collapse
 * (title and tag left, the total right, one row), applied to the pair this
 * component draws instead of a single total.
 *
 * **`caption` is for a figure that is not the one the reader asked for.**
 * `DeskBand`'s hero is §7.0's display currency; a ledger holding nothing in
 * that currency has no such subtotal, and the band used to render *nothing* —
 * the whole hero row vanished, which reads as "you have no money" rather than
 * "not in this currency". So the band falls back to a currency the ledger
 * actually holds, and `caption` is the line that says the figure above it is
 * not the currency you picked. It sits beneath both shapes, in
 * `shellTextMuted`, because a fallback nobody is told about is a wrong number.
 *
 * **`lead` steps both figures down one size**, for the same reason
 * `CurrencyTotals` steps its own rest down: C2's hero is `money.netWorth`
 * *per currency* (mine/ours needs no FX — it is an ownership split within one
 * currency, not a conversion), so a ledger holding two currencies stacks two
 * `DualTotal`s rather than inventing a converted sum, at `size="shell"`.
 * `Today` renders the "held separately" note beneath the stack, the same
 * line and the same reason `CurrencyTotals` prints it. `lead` only has an
 * effect at `size="shell"` — `DeskBand`'s `"band"` never stacks by currency,
 * so `mine` there stays `medium` regardless.
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
   * `displayHero`. `"band"` is `DeskBand`'s expanded row (`02-tokens` §2.10):
   * `mine` at `displayOne`, one step down, because a figure sharing a row
   * with nav and a scope control has no 54px to spend. `ours` stays
   * `displayTwo` in both — it is already the secondary line, and the row
   * that shrank *mine* is the one it was already smaller than. `"compact"`
   * is `DeskBand`'s *collapsed* row — a different shape, not a smaller
   * `"band"`; see the file doc.
   */
  size?: "shell" | "band" | "compact";
  /**
   * The hero currency's figure — `hero`/`large` at `size="shell"`. `false`
   * steps to `large`/`body`, for a second currency stacked beneath the lead.
   * No effect at `size="band"` — see the file doc.
   */
  lead?: boolean;
  /**
   * A line beneath the figures naming what they are *not* — set only when the
   * currency shown is a fallback for one the ledger does not hold. Absent
   * whenever the figure is the one that was asked for; see the file doc.
   */
  caption?: string | undefined;
};

const MINE_SIZE = { lead: "hero", rest: "large" } as const;
const OURS_SIZE = { lead: "large", rest: "body" } as const;

export function DualTotal({
  mine,
  ours,
  currency,
  decimals = 2,
  size = "shell",
  lead = true,
  caption,
}: DualTotalProps) {
  const t = useT();
  const styles = useStyles();
  const rank = lead ? "lead" : "rest";

  if (size === "compact") {
    return (
      <View>
        <View style={styles.compactBlock}>
          <Amount
            value={mine}
            currency={currency}
            decimals={decimals}
            size="compact"
            emphasis="shell"
          />
          {ours === null ? null : (
            <Amount
              value={ours}
              currency={currency}
              decimals={decimals}
              size="small"
              emphasis="shellMuted"
            />
          )}
        </View>
        {caption === undefined ? null : <Text style={styles.caption}>{caption}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <View>
        <Text style={styles.label}>{t("shell.mine")}</Text>
        <Amount
          value={mine}
          currency={currency}
          decimals={decimals}
          size={size === "band" ? "medium" : MINE_SIZE[rank]}
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
            size={OURS_SIZE[rank]}
            emphasis="shell"
          />
        </View>
      )}
      {caption === undefined ? null : <Text style={styles.caption}>{caption}</Text>}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  block: { gap: space.xl },
  compactBlock: { flexDirection: "row", alignItems: "baseline", gap: space.lg },
  label: {
    color: theme.shellTextMuted,
    ...text.ui("kicker"),
    textTransform: "uppercase",
  },
  caption: { color: theme.shellTextMuted, ...text.ui("caption") },
}));
