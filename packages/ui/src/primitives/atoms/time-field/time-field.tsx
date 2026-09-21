/**
 * `<TimeField>` — §3.7: a clock time, where something has one.
 *
 * **Empty is a value, and the normal one.** A transaction's time is a
 * description of when in the day it happened (`SPEC` §7.0a): it bounds no
 * period, selects no rate and reaches no tax output, and most rows never have
 * one. So the field opens empty, says so, and *No time* takes a time back off
 * — clearing is not setting midnight.
 *
 * **Typed or rolled, the same bare `HH:MM`.** The field accepts what a hand
 * writes — `9:05`, `0930`, `9.30` (`clock.ts`'s `readTyped`) — and the phone
 * gets the drum beside it (§3.7a). On a desk the typed field is already the
 * fastest way in, and a wheel is a thumb control; nothing else is offered
 * there.
 *
 * ***Now* is one tap**, because the commonest time to give a transaction is
 * the one on the clock while it is being written down. The clock is handed in
 * (`now`): this file names no platform.
 */

import type { TimeOfDay } from "@waltning/core/date";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { useT } from "../../../i18n/provider";
import { makeStyles } from "../../../theme/styles.ts";
import { space } from "../../../tokens.ts";
import { readTyped } from "../../molecules/time-picker/clock.ts";
import { TimePicker } from "../../molecules/time-picker/time-picker";
import { useBreakpoint } from "../../use-breakpoint.ts";
import { Chip } from "../chip/chip";
import { FieldButton } from "../field-button/field-button";
import { TextField } from "../text-field/text-field";

export type TimeFieldProps = {
  label: string;
  /** What is typed — `""` for no time. `readTyped` says whether it is one. */
  value: string;
  onChange: (value: string) => void;
  /** The clock, as the caller reads it. */
  now: TimeOfDay;
  error?: string;
  hint?: string;
};

export function TimeField({ label, value, onChange, now, error, hint }: TimeFieldProps) {
  const t = useT();
  const styles = useStyles();
  const breakpoint = useBreakpoint();
  const [rolling, setRolling] = useState(false);

  const openPicker = useCallback(() => setRolling(true), []);
  const closePicker = useCallback(() => setRolling(false), []);
  const handleNow = useCallback(() => onChange(now), [onChange, now]);
  const handleClear = useCallback(() => onChange(""), [onChange]);

  const read = readTyped(value);
  // What the drum opens on: the field's own time when it holds one, and the
  // clock when it is empty or half-typed. A drum has to band *some* row.
  const shown = read ?? now;

  const computedError = value !== "" && read === null ? t("transactions.invalidTime") : undefined;
  const message = error ?? computedError;

  /*
    **On a phone the field is the way in**, as `DateField` is: a tap opens the
    drum, *Now* is a chip on it, and *No time* is an action in it. No typed
    field and no row of chips in between.
  */
  if (breakpoint === "phone") {
    return (
      <View style={styles.root}>
        <FieldButton
          label={label}
          value={read ?? undefined}
          placeholder={t("common.noTime")}
          onPress={openPicker}
          {...(hint === undefined ? {} : { hint })}
          {...(message === undefined ? {} : { error: message })}
        />
        {rolling ? (
          <TimePicker
            prompt={label}
            value={shown}
            onChange={onChange}
            now={now}
            onDismiss={closePicker}
            {...(value === "" ? {} : { onClear: handleClear })}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <TextField
        label={label}
        value={value}
        onChangeText={onChange}
        placeholder={t("common.noTime")}
        {...(hint === undefined ? {} : { hint })}
        {...(message === undefined ? {} : { error: message })}
      />
      <View style={styles.chips}>
        <Chip placeholder={t("common.now")} onPress={handleNow} />
        {value === "" ? null : <Chip placeholder={t("common.noTime")} onPress={handleClear} />}
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  root: { gap: space.sm },
  chips: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
}));
