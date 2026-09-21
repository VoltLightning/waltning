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
import { Modal, Pressable, Text, View } from "react-native";
import { useT } from "../../../i18n/provider";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { radius, space, touchTarget } from "../../../tokens.ts";
import { Button } from "../../atoms/button/button";
import { Chip } from "../../atoms/chip/chip";
import { Wheel, type WheelOption } from "../../atoms/wheel/wheel";
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
};

export function TimePicker({ prompt, value, onChange, now, onDismiss }: TimePickerProps) {
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

  return (
    <Modal
      accessibilityLabel={prompt}
      transparent
      visible
      onRequestClose={onDismiss}
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.overlay}>
        {/* A backdrop, so a bare `Pressable` — `Select`'s own exception. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.dismissOptions")}
          onPress={onDismiss}
          style={styles.backdrop}
        />
        <View style={styles.panel}>
          <View style={styles.grab} />
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

          <View style={styles.actions}>
            <Button label={t("common.cancel")} variant="ghost" onPress={onDismiss} />
            <Button label={t("common.useThisTime")} variant="primary" onPress={handleConfirm} />
          </View>
        </View>
      </View>
    </Modal>
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
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...({ position: "absolute" } as const), top: 0, right: 0, bottom: 0, left: 0 },
  panel: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.x3,
    gap: space.x2,
  },
  grab: {
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: theme.border,
    alignSelf: "center",
  },
  chips: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  drum: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: space.xs },
  // Between the two columns, on the banded row: the drum reads `14 : 37`.
  colon: { color: theme.text, ...text.ui("displayThree") },
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
