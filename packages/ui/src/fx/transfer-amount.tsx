/**
 * `<TransferAmount>` — `design-system/04` §4.3.
 *
 * ```
 *   Household · USD  →  Cash · PLN
 *   150,00 $            565,20 zł     realized 3,7680
 *                                     reference 3,8100 · spread 6,30 zł
 * ```
 *
 * **This is the component that makes FX cost visible**, and it does it during
 * entry rather than in a report afterwards. A spread discovered a month later
 * is a fact; a spread shown while the amount is being typed is a decision.
 *
 * One row, two accounts, two amounts — a transfer contributes different figures
 * to each side (`SPEC.md` §7.2), and a component taking one amount cannot
 * express that at all.
 *
 * **On computing the spread here.** `computations.md` classes the FX margin as
 * **S** — server-only, because a stale reference rate makes every margin
 * identically zero. That classification is about the *stored* figure across the
 * ledger. This derives one row's spread from four numbers it was handed, which
 * is what §4.3 requires: at entry time there is no stored row to ask about. It
 * is arithmetic over its own props, not a second source of truth.
 */

import { money } from "@waltning/core";
import { Text, View } from "react-native";
import { face, makeStyles } from "../theme/index.ts";
import { space, tabularNums, type } from "../tokens.ts";
import { Amount } from "./amount";

export type TransferAmountProps = {
  from: { account: string; currency: string; amount: money.Money; decimals?: number };
  to: { account: string; currency: string; amount: money.Money; decimals?: number };
  /**
   * The **reference** rate for the row's date — what the market said.
   *
   * `SPEC.md` §7.5: storing the *realized* rate here makes every margin
   * identically zero, because the realized rate is already implied by the two
   * amounts. The spread is the difference between them, so one of the two has
   * to be independent.
   */
  referenceRate: money.Money;
  rateDecimals?: number;
};

export function TransferAmount({ from, to, referenceRate, rateDecimals = 4 }: TransferAmountProps) {
  const fromDecimals = from.decimals ?? 2;
  const toDecimals = to.decimals ?? 2;

  // Implied by the two amounts, never stored. Zero source amount would divide
  // by zero — a transfer of nothing has no rate, and saying so beats `Infinity`.
  const zeroSource = money.isZero(from.amount);
  const realized = zeroSource
    ? null
    : money.toMoney(money.dec(to.amount).div(money.dec(from.amount)), rateDecimals);

  // What the reference rate would have produced, less what actually arrived.
  const atReference = money.toPivot(from.amount, referenceRate);
  const spread = money.sub(atReference, to.amount);
  const spreadMatters = !money.isZero(spread);

  const styles = useStyles();

  return (
    <View style={styles.block}>
      <Text style={styles.route}>
        {from.account} · {from.currency}
        <Text style={styles.arrow}>{"  →  "}</Text>
        {to.account} · {to.currency}
      </Text>

      <View style={styles.amounts}>
        <Amount value={from.amount} currency={from.currency} decimals={fromDecimals} />
        <Amount value={to.amount} currency={to.currency} decimals={toDecimals} />
      </View>

      <View style={styles.rates}>
        <Text style={styles.rate}>realized {realized ?? "—"}</Text>
        <Text style={styles.rate}>
          reference {money.toMoney(referenceRate, rateDecimals)}
          {/*
            Shown only when it is not zero. A spread of 0,00 on every row trains
            people to stop reading the line, and then the one that is not zero
            reads the same as the ones that were.
          */}
          {spreadMatters ? (
            <Text style={styles.spread}>
              {"  ·  spread "}
              {money.toMoney(spread, toDecimals)} {to.currency}
            </Text>
          ) : null}
        </Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  block: { gap: space.xs },
  route: { color: t.textMuted, fontSize: type.caption.fontSize, ...face.ui(400) },
  arrow: { color: t.accentIcon },
  amounts: { flexDirection: "row", justifyContent: "space-between", gap: space.x3 },
  rates: { gap: 2 },
  rate: {
    color: t.textMuted,
    ...face.mono(),
    fontSize: type.caption.fontSize,
    fontVariant: [...tabularNums],
  },
  /** The figure this component exists for. Not muted into the rate line. */
  spread: { color: t.assertedText },
}));
