/**
 * `<PeriodField>` — S10 §4's date range, as the periods a person filters by.
 *
 * **Two date fields were the wrong shape for a range.** Each asked for one
 * endpoint and carried three *capture* shortcuts under it — Today, Yesterday,
 * and the day before — which are the right shortcuts for S05, where you are
 * recording something that just happened. Filtering is not that: "from
 * Saturday to Saturday" is not a range anyone sets, and six buttons doing a
 * job four names do is what pushed the sheet under the keyboard.
 *
 * So the common cases are named and cost one tap, and the two fields stay for
 * the range none of them covers — behind a disclosure, because a filter that
 * opens a keyboard by default is a filter you close.
 *
 * **The pick is derived, never stored.** `presetOf` reads a range back into
 * the period it names, so "This month" lights up because the filter *is* that
 * month — including when it got that way from the desk rail's stepper or
 * from a deep link. A second piece of state would drift from the query, which
 * is the defect `ledger-screen.tsx` already records for the rail's own label.
 */

import type { AccountingDate } from "@waltning/core/date";
import { addDays, monthRange, shiftMonth, yearMonth } from "@waltning/core/date";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { useT } from "../i18n/provider";
import { Chip } from "../primitives/chip";
import { DateField } from "../primitives/date-field";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";

export type PeriodFieldProps = {
  from: string;
  to: string;
  today: AccountingDate;
  /** Both ends together — a half-set range is never a period anyone chose. */
  onChange: (from: string, to: string) => void;
};

/** The named periods, as the ranges they resolve to on a given day. */
export type PeriodPreset = "thisMonth" | "lastMonth" | "last30" | "anyTime";

export function rangeFor(
  preset: PeriodPreset,
  today: AccountingDate,
): { from: string; to: string } {
  if (preset === "anyTime") return { from: "", to: "" };
  if (preset === "last30") return { from: addDays(today, -29), to: today };
  const month = yearMonth(today.slice(0, 7));
  return monthRange(preset === "thisMonth" ? month : shiftMonth(month, -1));
}

/**
 * Which preset a range *is*, or `null` for one no preset names. Read from the
 * range itself, so it cannot disagree with what the list is showing.
 */
export function presetOf(from: string, to: string, today: AccountingDate): PeriodPreset | null {
  if (from === "" && to === "") return "anyTime";
  for (const preset of ["thisMonth", "lastMonth", "last30"] as const) {
    const range = rangeFor(preset, today);
    if (range.from === from && range.to === to) return preset;
  }
  return null;
}

export function PeriodField({ from, to, today, onChange }: PeriodFieldProps) {
  const t = useT();
  const styles = useStyles();
  const current = presetOf(from, to, today);
  // Open when the range is one no preset names — that range came from
  // somewhere, and hiding the two fields would hide what the filter is doing.
  const [exact, setExact] = useState(current === null && (from !== "" || to !== ""));

  const pick = useCallback(
    (preset: PeriodPreset) => {
      const range = rangeFor(preset, today);
      setExact(false);
      onChange(range.from, range.to);
    },
    [onChange, today],
  );

  const handleThisMonth = useCallback(() => pick("thisMonth"), [pick]);
  const handleLastMonth = useCallback(() => pick("lastMonth"), [pick]);
  const handleLast30 = useCallback(() => pick("last30"), [pick]);
  const handleAnyTime = useCallback(() => pick("anyTime"), [pick]);
  const handleExact = useCallback(() => setExact((open) => !open), []);
  const handleFrom = useCallback((value: string) => onChange(value, to), [onChange, to]);
  const handleTo = useCallback((value: string) => onChange(from, value), [from, onChange]);

  return (
    <View style={styles.root}>
      <View style={styles.presets}>
        <Chip
          placeholder={t("transactions.periodThisMonth")}
          selected={current === "thisMonth"}
          onPress={handleThisMonth}
        />
        <Chip
          placeholder={t("transactions.periodLastMonth")}
          selected={current === "lastMonth"}
          onPress={handleLastMonth}
        />
        <Chip
          placeholder={t("transactions.periodLast30")}
          selected={current === "last30"}
          onPress={handleLast30}
        />
        <Chip
          placeholder={t("transactions.periodAnyTime")}
          selected={current === "anyTime"}
          onPress={handleAnyTime}
        />
        <Chip
          placeholder={t("transactions.periodCustom")}
          selected={exact || current === null}
          onPress={handleExact}
        />
      </View>
      {exact || current === null ? (
        <View style={styles.exact}>
          <DateField
            label={t("transactions.filterFrom")}
            value={from}
            onChange={handleFrom}
            today={today}
          />
          <DateField
            label={t("transactions.filterTo")}
            value={to}
            onChange={handleTo}
            today={today}
          />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  root: { gap: space.x3 },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  exact: { gap: space.x3 },
}));
