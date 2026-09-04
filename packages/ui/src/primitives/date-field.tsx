/**
 * `<DateField>` — `design-system/03` §3.7: defaults to today, relative
 * shortcuts (yesterday).
 *
 * **Over `TextField`, not beside it.** The bare `YYYY-MM-DD` text field
 * already existed twice (`QuickAddForm`'s date, `CreateAccountForm`'s opening
 * date) with two different validity checks and no shortcuts — this replaces
 * both, keeping `TextField`'s label/value contract so neither caller's tests
 * had to change shape, only the import.
 *
 * **The calendar check core deliberately does not do.** `date.ts#isAccountingDate`
 * is shape-only by design — its own comment says *"a real calendar check
 * happens where a date is chosen, not here"* — and this is where a date is
 * chosen. `2026-02-30` matches the shape and is not a day, so the shape check
 * alone would accept it and pass a wrong date to `create_transaction`.
 * `isRealCalendarDate` below does the same UTC-construct-and-read-back
 * `weekdayOf`/`addDays` already use elsewhere in this codebase — calendar
 * math on the value's own Y/M/D, never a clock read.
 *
 * **The three chips are actions, not the field's value.** None of them is
 * ever `selected` — the field's typed text is the one truth, and a chip that
 * looked "chosen" after a stale tap would say something about the current
 * value that may no longer be so. Each is a plain `Chip` in its empty state,
 * which is also why passing `today` is required: the row cannot draw itself
 * without it.
 */

import {
  type AccountingDate,
  accountingDate,
  addDays,
  isAccountingDate,
} from "@waltning/core/date";
import { useCallback } from "react";
import { View } from "react-native";
import { useLocale, useT } from "../i18n/provider";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";
import { Chip } from "./chip";
import { TextField } from "./text-field";

export type DateFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** The device's local `AccountingDate` (§7.0a) — what the three chips are relative to. */
  today: string;
  /** From the caller — a field-errors refusal, say. Wins over the field's own check. */
  error?: string;
  hint?: string;
};

/**
 * A real Gregorian day, not merely the `YYYY-MM-DD` shape.
 *
 * `Date.UTC` rolls `2026-02-30` forward into March rather than refusing it,
 * so a value that survives the round trip unchanged was a real day; one that
 * does not was never on a calendar. No clock is read — every number here
 * comes from the string itself.
 */
function isRealCalendarDate(value: string): boolean {
  if (!isAccountingDate(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const rolled = new Date(Date.UTC(year, month - 1, day));
  return (
    rolled.getUTCFullYear() === year &&
    rolled.getUTCMonth() === month - 1 &&
    rolled.getUTCDate() === day
  );
}

/** The weekday a date falls on, in the reader's language — a formatting, not an arithmetic. */
function weekdayLabel(date: AccountingDate, locale: string): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const asDate = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(asDate);
}

export function DateField({ label, value, onChange, today, error, hint }: DateFieldProps) {
  const t = useT();
  const locale = useLocale();
  const styles = useStyles();

  const todayDate = accountingDate(today);
  const yesterday = addDays(todayDate, -1);
  const twoDaysAgo = addDays(todayDate, -2);

  const handlePickToday = useCallback(() => onChange(todayDate), [onChange, todayDate]);
  const handlePickYesterday = useCallback(() => onChange(yesterday), [onChange, yesterday]);
  const handlePickTwoDaysAgo = useCallback(() => onChange(twoDaysAgo), [onChange, twoDaysAgo]);

  const computedError =
    value !== "" && !isRealCalendarDate(value) ? t("transactions.invalidDate") : undefined;
  const message = error ?? computedError;

  return (
    <View style={styles.root}>
      <TextField
        label={label}
        value={value}
        onChangeText={onChange}
        {...(hint === undefined ? {} : { hint })}
        {...(message === undefined ? {} : { error: message })}
      />
      <View style={styles.chips}>
        <Chip placeholder={t("shell.today")} onPress={handlePickToday} />
        <Chip placeholder={t("common.yesterday")} onPress={handlePickYesterday} />
        <Chip placeholder={weekdayLabel(twoDaysAgo, locale)} onPress={handlePickTwoDaysAgo} />
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  root: { gap: space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
}));
