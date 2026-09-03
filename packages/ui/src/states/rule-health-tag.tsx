/**
 * `<RuleHealthTag>` — `design-system/08` §8.6 row 13. A `Tag` variant over the
 * five states a recurring rule can be in, so J13's silent failure — "a rule
 * that never posted" — has somewhere to surface rather than looking like a
 * healthy screen with one fewer row than expected.
 *
 * `healthy` is the only state with nothing to say, and gets the neutral tag
 * for exactly that reason. The other four are two different claims, not four
 * shades of the same one: `overdue` and `neverPosted` are failures — the rule
 * should have acted and did not — while `endingSoon` and `amountDrifted` are
 * aged facts worth a look, P4's "asserted or aged rather than observed".
 */

import { useT } from "../i18n/provider";
import { Tag, type TagVariant } from "../primitives/tag";

export type RuleHealthState =
  | "healthy"
  | "endingSoon"
  | "amountDrifted"
  | "overdue"
  | "neverPosted";

const VARIANT: Record<RuleHealthState, TagVariant> = {
  healthy: "neutral",
  endingSoon: "warn",
  amountDrifted: "warn",
  overdue: "negative",
  neverPosted: "negative",
};

const KEY = {
  healthy: "states.rule.healthy",
  endingSoon: "states.rule.endingSoon",
  amountDrifted: "states.rule.amountDrifted",
  overdue: "states.rule.overdue",
  neverPosted: "states.rule.neverPosted",
} as const satisfies Record<RuleHealthState, string>;

export type RuleHealthTagProps = { state: RuleHealthState };

export function RuleHealthTag({ state }: RuleHealthTagProps) {
  const t = useT();
  return <Tag variant={VARIANT[state]}>{t(KEY[state])}</Tag>;
}
