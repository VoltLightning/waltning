/**
 * `<SegmentControl>` — `design-system/03` §3.6. Two to four options, one active.
 *
 * Used for scope (**All · Mine · Shared · Business**) and import filters, with
 * live counts per segment.
 *
 * **The scope options are a partition** (`SPEC.md` §6.7): every transaction is
 * in exactly one, so the three subtotals always sum to All and switching can
 * never double-count. That is a property of the data, not of this component —
 * but it is why a segment control is the right control and a set of checkboxes
 * is not.
 *
 * Distinct from `DualTotal`, which is **not** a filter: *mine* and *ours* show
 * together regardless of what is selected here.
 */

import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../tokens.ts";
import { useInteraction } from "./interaction.ts";

export type Segment = {
  value: string;
  label: string;
  /** Shown beside the label. Live — a stale count is worse than none. */
  count?: number;
};

export type SegmentControlProps = {
  /** Two to four. One option is not a choice; five is a menu. */
  segments: readonly [Segment, Segment, ...Segment[]];
  value: string;
  onChange: (value: string) => void;
};

export function SegmentControl({ segments, value, onChange }: SegmentControlProps) {
  const styles = useStyles();

  return (
    <View accessibilityRole="tablist" style={styles.track}>
      {segments.map((segment) => (
        <SegmentOption
          key={segment.value}
          segment={segment}
          active={segment.value === value}
          onChange={onChange}
        />
      ))}
    </View>
  );
}

type SegmentOptionProps = {
  segment: Segment;
  active: boolean;
  onChange: (value: string) => void;
};

function SegmentOption({ segment, active, onChange }: SegmentOptionProps) {
  const { hovered, focused, handlers } = useInteraction();
  const styles = useStyles();
  const handlePress = useCallback(() => onChange(segment.value), [onChange, segment.value]);

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={
        segment.count === undefined ? segment.label : `${segment.label}, ${segment.count} items`
      }
      onPress={handlePress}
      {...handlers}
      style={[
        styles.segment,
        // The active segment already sits lifted on `surface`; hovering it
        // promises nothing, so only a resting segment answers the pointer.
        hovered && !active ? styles.hovered : null,
        active ? styles.active : null,
        focused ? styles.focused : null,
      ]}
    >
      <Text style={[styles.label, active ? styles.labelActive : null]}>{segment.label}</Text>
      {segment.count === undefined ? null : (
        <Text style={[styles.count, active ? styles.countActive : null]}>{segment.count}</Text>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  track: {
    flexDirection: "row",
    backgroundColor: theme.subtleFill,
    borderRadius: radius.pill,
    padding: space.xxs,
  },
  segment: {
    flex: 1,
    minHeight: touchTarget.min,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    borderRadius: radius.pill,
    paddingHorizontal: space.xl,
  },
  hovered: { backgroundColor: theme.hoverFill },
  active: { backgroundColor: theme.surface },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  label: { color: theme.textMuted, ...text.ui("bodySm") },
  labelActive: { color: theme.text, ...text.ui("bodySm", 600) },
  count: { color: theme.textMuted, ...text.ui("caption") },
  countActive: { color: theme.accentText },
}));
