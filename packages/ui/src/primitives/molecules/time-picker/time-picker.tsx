/**
 * `<TimePicker>` — §3.7a: the date drum's twin, for a clock.
 *
 * **One idea of a picker in this app, not two.** Same sheet, same five-row
 * drum, same banded middle row, same chips above and the same two buttons
 * below as `DatePicker` — so a reader who has set a date already knows how to
 * set a time.
 *
 * **Hours and minutes wrap; the date wheels deliberately do not.** Neither has
 * a first or a last, where a year is not a cycle and a wheel that wraps one
 * lets a reader spin into 1970 by accident.
 *
 * ***Now* is the chip that earns its place.** The board drew *Morning ·
 * Midday · Overnight* — it was drawn for a schedule, where those are the times
 * anyone names. A transaction is set a time either as it happens or off a
 * receipt, and the first of those is one tap: the chip reads the clock it is
 * handed (`now`), so this file names no platform. The three beside it are
 * landmarks to roll from, and say the time they set.
 *
 * **No chip is ever the value — the drum is.** A chip lights only while the
 * banded row agrees with it, and goes out on its own when the wheels move.
 */

import { type TimeOfDay, timeOfDay } from "@waltning/core/date";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useT } from "../../../i18n/provider";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { radius, space, touchTarget } from "../../../tokens.ts";
import { Button } from "../../atoms/button/button";
import { Chip } from "../../atoms/chip/chip";
import { Wheel, type WheelOption } from "../../atoms/wheel/wheel";
import { BottomSheet } from "../../organisms/bottom-sheet/bottom-sheet";
import { HOURS, MINUTES, partsOfTime, timeOfParts } from "./clock.ts";

/** §3.7a — each column as wide as the widest thing in it. */
const COLUMN = 72;

const HOUR_OPTIONS: readonly WheelOption[] = HOURS.map((hour) => ({ value: hour, label: hour }));
const MINUTE_OPTIONS: readonly WheelOption[] = MINUTES.map((minute) => ({
  value: minute,
  label: minute,
}));

/**
 * The landmarks beside *Now* — somewhere to roll from. **Labelled with the time
 * itself**: *Morning* does not say which minute a tap will set, and a chip
 * that is about to write a value should say the value. It is also what fits:
 * four worded chips wrapped onto a second row at phone width.
 */
const LANDMARKS: readonly TimeOfDay[] = [
  timeOfDay("09:00"),
  timeOfDay("12:00"),
  timeOfDay("18:00"),
];

export type TimePickerProps = {
  /** The sheet's accessible name — what is being asked. */
  prompt: string;
  value: TimeOfDay;
  onChange: (value: TimeOfDay) => void;
  /** The clock, as the caller reads it: this file names no platform. */
  now: TimeOfDay;
  onDismiss: () => void;
  /**
   * Take the time back off. **Offered only where there is one to take off** —
   * a time of day is optional (§7.0a), so the picker that sets it is also
   * where it is unset; clearing is not setting midnight.
   */
  onClear?: () => void;
};

export function TimePicker({ prompt, value, onChange, now, onDismiss, onClear }: TimePickerProps) {
  const styles = useStyles();
  const t = useT();
  const [draft, setDraft] = useState(value);

  // Re-open on whatever the field holds now, not on where this was left.
  useEffect(() => setDraft(value), [value]);

  const parts = partsOfTime(draft);

  const handleHour = useCallback(
    (next: string) => setDraft((at) => timeOfParts({ ...partsOfTime(at), hour: Number(next) })),
    [],
  );
  const handleMinute = useCallback(
    (next: string) => setDraft((at) => timeOfParts({ ...partsOfTime(at), minute: Number(next) })),
    [],
  );
  const handleConfirm = useCallback(() => {
    onChange(draft);
    onDismiss();
  }, [draft, onChange, onDismiss]);
  const handleClear = useCallback(() => {
    onClear?.();
    onDismiss();
  }, [onClear, onDismiss]);

  const actions = (
    <View style={styles.actions}>
      <Button label={t("common.cancel")} variant="ghost" onPress={onDismiss} />
      {onClear === undefined ? null : (
        <Button label={t("common.noTime")} variant="ghost" onPress={handleClear} />
      )}
      <Button label={t("common.useThisTime")} variant="primary" onPress={handleConfirm} />
    </View>
  );

  return (
    <BottomSheet visible title={prompt} onDismiss={onDismiss} bodyRolls>
      <View style={styles.chips}>
        <TimeChip label={t("common.now")} at={now} draft={draft} onPick={setDraft} />
        {LANDMARKS.map((at) => (
          <TimeChip key={at} label={at} at={at} draft={draft} onPick={setDraft} />
        ))}
      </View>

      <View style={styles.drum}>
        <View style={styles.band} />
        <Wheel
          label={t("common.hours")}
          options={HOUR_OPTIONS}
          value={HOURS[parts.hour] ?? "00"}
          onChange={handleHour}
          width={COLUMN}
          wraps
        />
        <Text style={styles.colon} aria-hidden>
          :
        </Text>
        <Wheel
          label={t("common.minutes")}
          options={MINUTE_OPTIONS}
          value={MINUTES[parts.minute] ?? "00"}
          onChange={handleMinute}
          width={COLUMN}
          wraps
        />
      </View>
      {/* In the body, under the drum: the sheet's pinned footer floats over its
          content, and here the content is five rows that all have to be seen. */}
      {actions}
    </BottomSheet>
  );
}

type TimeChipProps = {
  label: string;
  at: TimeOfDay;
  draft: TimeOfDay;
  onPick: (value: TimeOfDay) => void;
};

function TimeChip({ label, at, draft, onPick }: TimeChipProps) {
  const handlePress = useCallback(() => onPick(at), [onPick, at]);
  return <Chip placeholder={label} selected={at === draft} onPress={handlePress} />;
}

const useStyles = makeStyles((theme) => ({
  chips: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  drum: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: space.xs },
  // Between the two columns, on the banded row: the drum reads `14 : 37`.
  // **A whole-pixel width, not the glyph's own.** The colon's advance is a
  // fraction of a pixel, and everything to its right inherits the fraction:
  // the minutes landed on a half pixel and rasterised one way or the other
  // from run to run.
  colon: { width: space.x3, textAlign: "center", color: theme.text, ...text.ui("displayThree") },
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
