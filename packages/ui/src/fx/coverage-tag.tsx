/**
 * `<CoverageTag>` — `screens/S17` §6/§8: *"Coverage is stated per currency,
 * with its source and last quote date. Reporting a currency as present when
 * it holds 0.5% of its range is how GEL stayed broken."*
 *
 * A thin `Tag` composition, not a new primitive: `04` §4.6 already gives
 * `RateTable`'s `manual` marker the rule this reuses — **amber below 100%**,
 * because a currency resting on a coverage gap is exactly the same claim as a
 * row resting on an override (P4), and every other amber in this system
 * already carries that meaning.
 *
 * **Stated, never nudged (S17 §8's own open question, closed).** This
 * component draws the number and, below 100%, the date of the last quote it
 * actually holds — nothing that reads as a recommendation to archive or
 * reconnect. GEL at 0.5% is a fact worth seeing, not a nag.
 *
 * **0% is not "0%".** A currency with nothing held yet is not a currency
 * 0% of the way through a range — it is a currency S18 has never been asked
 * about, and `noRatesYet` says that in words instead of a number a reader
 * has to interpret. `onPress`, when the caller wires it (S17's own row, to
 * `/settings/rates?quote=<code>`), makes that state the exact place to fix
 * it — this component knows nothing about routes; that stays with the
 * caller, the same boundary `RateTable`'s own `onSelectRow` draws.
 */

import { useCallback } from "react";
import { Pressable } from "react-native";
import { useT } from "../i18n/provider";
import { useInteraction } from "../primitives/interaction.ts";
import { Tag } from "../primitives/tag";
import { makeStyles } from "../theme/styles.ts";
import { focus, touchTarget } from "../tokens.ts";

export type CoverageTagProps = {
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
  /** Wired by the caller at 0% — opens S18 with the pair preselected. */
  onPress?: () => void;
};

export function CoverageTag({
  days,
  realDays,
  calendarDays,
  pct,
  lastDate,
  onPress,
}: CoverageTagProps) {
  const t = useT();
  const styles = useStyles();
  const { focused, handlers } = useInteraction();
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

  const label = nothingHeld
    ? t("fx.noRatesYet")
    : noRealQuote
      ? t("fx.noQuoteYet")
      : complete || lastDate === undefined
        ? t("fx.coveragePct", { pct: String(pct) })
        : t("fx.coverageBelow", { pct: String(pct), date: lastDate });

  const tag = <Tag variant={complete ? "neutral" : "warn"}>{label}</Tag>;

  const handlePress = useCallback(() => onPress?.(), [onPress]);

  if (!onPress) return tag;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={handlePress}
      {...handlers}
      style={[styles.pressable, focused ? styles.focused : null]}
    >
      {tag}
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  // A `Tag` is normally sized to its text alone — the 44px floor belongs to
  // whatever makes it *pressable*, so it lives here, not on `Tag` itself.
  pressable: { minHeight: touchTarget.min, justifyContent: "center", alignSelf: "flex-start" },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
}));
