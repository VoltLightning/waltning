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
 */

import { useT } from "../i18n/provider";
import { Tag } from "../primitives/tag";

export type CoverageTagProps = {
  /** 0–100, `readCoverage`'s own figure. */
  pct: number;
  /** The most recent date a rate is actually held for — required below 100%. */
  lastDate?: string | undefined;
};

export function CoverageTag({ pct, lastDate }: CoverageTagProps) {
  const t = useT();
  const complete = pct >= 100;

  const label =
    complete || lastDate === undefined
      ? t("fx.coveragePct", { pct: String(pct) })
      : t("fx.coverageBelow", { pct: String(pct), date: lastDate });

  return <Tag variant={complete ? "neutral" : "warn"}>{label}</Tag>;
}
