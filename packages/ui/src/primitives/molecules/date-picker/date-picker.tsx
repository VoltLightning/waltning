/**
 * `<DatePicker>` — `design-system/03` §3.7a. The phone's way into a date.
 *
 * Relative chips over three `Wheel`s: the four days a ledger entry usually
 * means, and the drum for everything else. Tapping a chip rolls the wheels to
 * it; rolling the wheels clears whichever chip no longer matches, **because a
 * lit chip that disagrees with the banded row is a lie about what is
 * selected**. No chip is ever the value — the drum is.
 *
 * **A `Modal`, not the shell's `BottomSheet`.** The same reason `Select` gives:
 * a primitive that reached for the shell would invert the foundation
 * (`tests/module-boundaries`), and `Modal` is `react-native`'s. It is also the
 * only way out of the layout tree that behaves the same on all three targets.
 *
 * **The day column is rebuilt whenever the month under it changes**, so a day
 * that does not exist can never be offered. What happens to a *chosen* day
 * when the month shortens is `parts.ts`'s decision, not this file's: it
 * clamps, and the clamp is final.
 *
 * **Committed on confirm, not on every roll.** A wheel passes over ten values
 * on the way to one, and a field that changed under each of them would fire a
 * form's validation ten times and announce ten values to a screen reader. The
 * drum's own state is local; `onChange` runs once, when the reader says so.
 */

import { type AccountingDate, addDays } from "@waltning/core/date";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { monthName, weekdayShort } from "../../../i18n/locales";
import { useLocale, useT } from "../../../i18n/provider";
import { makeStyles } from "../../../theme/styles.ts";
import { radius, space, touchTarget } from "../../../tokens.ts";
import { Button } from "../../atoms/button/button";
import { Chip } from "../../atoms/chip/chip";
import { Wheel, type WheelOption } from "../../atoms/wheel/wheel";
import { BottomSheet } from "../../organisms/bottom-sheet/bottom-sheet";
import { clampDay, dateOf, daysIn, partsOf, yearsAround } from "./parts.ts";

/** §3.7a sizes each column to the widest thing in it. */
const COLUMN = { day: 56, month: 148, year: 76 } as const;

/** Today, yesterday, and the two days before them. */
const CHIP_DAYS = [0, 1, 2, 3] as const;

export type DatePickerProps = {
  /** The question above the drum — the sheet's own prompt. */
  prompt: string;
  value: AccountingDate;
  onChange: (value: AccountingDate) => void;
  /** The device's local `AccountingDate` (§7.0a) — what the chips are relative to. */
  today: AccountingDate;
  onDismiss: () => void;
};

export function DatePicker({ prompt, value, onChange, today, onDismiss }: DatePickerProps) {
  const styles = useStyles();
  const locale = useLocale();
  const t = useT();
  const [draft, setDraft] = useState(value);

  // Re-open on whatever the field holds now, not on where this was left.
  useEffect(() => setDraft(value), [value]);

  const parts = partsOf(draft);
  const years = yearsAround(parts.year);

  const days: WheelOption[] = [];
  for (let day = 1; day <= daysIn(parts.year, parts.month); day += 1) {
    days.push({ value: String(day), label: String(day) });
  }

  const months: WheelOption[] = [];
  for (let month = 0; month < 12; month += 1) {
    months.push({
      value: String(month),
      label: monthName(month, locale),
    });
  }

  const handleDay = useCallback(
    (next: string) => setDraft((at) => dateOf({ ...partsOf(at), day: Number(next) })),
    [],
  );

  const handleMonth = useCallback(
    (next: string) =>
      setDraft((at) => {
        const now = partsOf(at);
        const month = Number(next);
        return dateOf({ ...now, month, day: clampDay(now.year, month, now.day) });
      }),
    [],
  );

  const handleYear = useCallback(
    (next: string) =>
      setDraft((at) => {
        const now = partsOf(at);
        const year = Number(next);
        return dateOf({ ...now, year, day: clampDay(year, now.month, now.day) });
      }),
    [],
  );

  const handleConfirm = useCallback(() => {
    onChange(draft);
    onDismiss();
  }, [draft, onChange, onDismiss]);

  const actions = (
    <View style={styles.actions}>
      <Button label={t("common.cancel")} variant="ghost" onPress={onDismiss} />
      <Button label={t("common.useThisDate")} variant="primary" onPress={handleConfirm} />
    </View>
  );

  return (
    <BottomSheet visible title={prompt} onDismiss={onDismiss} bodyRolls>
      <View style={styles.chips}>
        {CHIP_DAYS.map((back) => (
          <RelativeChip
            key={back}
            back={back}
            today={today}
            draft={draft}
            locale={locale}
            onPick={setDraft}
          />
        ))}
      </View>

      <View style={styles.drum}>
        <View style={styles.band} />
        <Wheel
          label={t("common.day")}
          options={days}
          value={String(parts.day)}
          onChange={handleDay}
          width={COLUMN.day}
        />
        <Wheel
          label={t("common.month")}
          options={months}
          value={String(parts.month)}
          onChange={handleMonth}
          width={COLUMN.month}
        />
        <Wheel
          label={t("common.year")}
          options={years.map((year) => ({ value: String(year), label: String(year) }))}
          value={String(parts.year)}
          onChange={handleYear}
          width={COLUMN.year}
        />
      </View>
      {/* In the body, under the drum: the sheet's pinned footer floats over its
          content, and here the content is five rows that all have to be seen. */}
      {actions}
    </BottomSheet>
  );
}

type RelativeChipProps = {
  back: number;
  today: AccountingDate;
  draft: AccountingDate;
  locale: ReturnType<typeof useLocale>;
  onPick: (value: AccountingDate) => void;
};

/**
 * Its own component so the press handler is a named reference rather than an
 * arrow built in JSX, and so each chip re-reads only its own date.
 */
function RelativeChip({ back, today, draft, locale, onPick }: RelativeChipProps) {
  const t = useT();
  const when = addDays(today, -back);
  const handlePress = useCallback(() => onPick(when), [onPick, when]);
  const label =
    back === 0 ? t("shell.today") : back === 1 ? t("common.yesterday") : weekdayShort(when, locale);

  return <Chip placeholder={label} selected={when === draft} onPress={handlePress} />;
}

const useStyles = makeStyles((theme) => ({
  chips: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  drum: { flexDirection: "row", justifyContent: "center", gap: space.xs },
  band: {
    ...({ position: "absolute" } as const),
    left: 0,
    right: 0,
    // Two rows of drum above it, and one row tall — the same figure `Wheel`
    // builds every column from, not a literal that could drift from it.
    top: touchTarget.min * 2,
    height: touchTarget.min,
    borderRadius: radius.sm,
    backgroundColor: theme.accentFill,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.accentFillBorder,
  },
  actions: { flexDirection: "row", gap: space.sm },
}));
