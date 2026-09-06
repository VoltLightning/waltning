/**
 * `<CoverageStatus>` — `screens/S17` §6/§8: *"Coverage is stated per currency,
 * with its source and last quote date. Reporting a currency as present when
 * it holds 0.5% of its range is how GEL stayed broken."*
 *
 * **A caption, not a tag — which is why it is no longer called one.** `Tag`
 * is a filled, upper-cased pill (`03` §3.3's own `textTransform`), and every
 * coverage row wearing one turned a per-currency fact into a row of shouting
 * badges: *NO RATES YET · SET ONE BY HAND*, six times down a settings screen.
 * A `Tag` marks a **state** something is in — `manual`, `estimated`, a
 * business row — and coverage is not a state, it is a measurement. So it
 * renders as a muted caption in sentence case, and the one thing it keeps
 * from `04` §4.7's rule is the **ink**: amber below 100%, because a currency
 * resting on a coverage gap is the same claim as a row resting on an override
 * (P4). Colour is never the message (P5) — the sentence always says it.
 *
 * **Stated, never nudged (S17 §8's own open question, closed).** This
 * component draws the number and, below 100%, the date of the last quote it
 * actually holds — nothing that reads as a recommendation to archive or
 * reconnect. GEL at 0.5% is a fact worth seeing, not a nag.
 *
 * **0% is not "0%".** A currency with nothing held yet is not a currency
 * 0% of the way through a range — it is a currency S18 has never been asked
 * about, and `noRatesYet` says that in words instead of a number a reader
 * has to interpret.
 *
 * **And it is not pressable.** It used to be, at 0%, so that *set one by
 * hand* was a place rather than a sentence — but the row that hosts it is now
 * itself the tap target (S17 §3: a row expands its own detail), and a
 * pressable inside a pressable is one gesture with two meanings. The link
 * into S18 lives in the row's expanded actions instead, where it is available
 * at every coverage rather than only at zero.
 */

import { Text } from "react-native";
import { useT } from "../i18n/provider";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";

export type CoverageStatusProps = {
  /** Rows held, real and carried alike. Display context only — never the decision variable (H3, M3). */
  days: number;
  /** Real (non-`carried_forward`) rows held — the decision variable (M3), with `calendarDays`, never `days` or `pct`. */
  realDays: number;
  /** Calendar days from the first held rate to today, inclusive. */
  calendarDays: number;
  /** 0–100, `readCoverage`'s own figure — display-only, floored while incomplete. */
  pct: number;
  /** The most recent date a *real* quote is held for — `undefined` when none exists yet. */
  lastDate?: string | undefined;
  /**
   * L7 — rows held past today, excluded from `days` and every figure above
   * (M4). A currency with `days === 0` but `futureRows > 0` has rates set,
   * just none due yet — worth saying, not the same claim as *no rates yet*.
   */
  futureRows: number;
};

export function CoverageStatus({
  days,
  realDays,
  calendarDays,
  pct,
  lastDate,
  futureRows,
}: CoverageStatusProps) {
  const t = useT();
  const styles = useStyles();
  // M3 — `complete` decides on real quotes over calendar days, never on
  // `days`, which a dead source carried every day to today fills without a
  // single fresh quote.
  // H — a currency added today, with `calendarDays === 0`, satisfies
  // `realDays === calendarDays` at `0 === 0` without a single quote held —
  // the same false "complete" `nothingHeld` exists to rule out below. Gated
  // on it so *no rates yet* and *set for later* stay amber, never neutral.
  const nothingHeld = days === 0;
  const complete = !nothingHeld && realDays === calendarDays;
  // H2 — rows exist, but none is a real quote: no date to state, and no
  // percentage that would read as a fill nobody can vouch for.
  const noRealQuote = !nothingHeld && realDays === 0;
  // L7 — nothing due yet is not nothing set: a currency whose only rows are
  // future-dated has `days === 0` (M4 excludes them), the same shape as no
  // rows at all, so this reads the count off separately rather than off
  // `nothingHeld` alone.
  const onlyFutureRows = nothingHeld && futureRows > 0;

  const label = onlyFutureRows
    ? t("fx.noRatesYetFuture", { count: futureRows })
    : nothingHeld
      ? t("fx.noRatesYet")
      : noRealQuote
        ? t("fx.noQuoteYet")
        : complete || lastDate === undefined
          ? t("fx.coveragePct", { pct: String(pct) })
          : t("fx.coverageBelow", { pct: String(pct), date: lastDate });

  return <Text style={[styles.status, complete ? null : styles.incomplete]}>{label}</Text>;
}

const useStyles = makeStyles((theme) => ({
  status: { color: theme.textMuted, ...text.ui("caption") },
  /** `04` §4.7's amber, as ink on a caption rather than a fill behind a pill. */
  incomplete: { color: theme.assertedText },
}));
