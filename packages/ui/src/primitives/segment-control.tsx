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

import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { makeStyles } from "../theme/index.ts";
import { focus, radius, space, touchTarget, type } from "../tokens.ts";

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
  const [focusedValue, setFocusedValue] = useState<string | null>(null);

  const styles = useStyles();

  return (
    <View accessibilityRole="tablist" style={styles.track}>
      {segments.map((segment) => {
        const active = segment.value === value;
        return (
          <Pressable
            key={segment.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={
              segment.count === undefined
                ? segment.label
                : `${segment.label}, ${segment.count} items`
            }
            onPress={() => onChange(segment.value)}
            onFocus={() => setFocusedValue(segment.value)}
            onBlur={() => setFocusedValue(null)}
            style={[
              styles.segment,
              active ? styles.active : null,
              focusedValue === segment.value ? styles.focused : null,
            ]}
          >
            <Text style={[styles.label, active ? styles.labelActive : null]}>{segment.label}</Text>
            {segment.count === undefined ? null : (
              <Text style={[styles.count, active ? styles.countActive : null]}>
                {segment.count}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  track: {
    flexDirection: "row",
    backgroundColor: t.subtleFill,
    borderRadius: radius.pill,
    padding: 2,
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
  active: { backgroundColor: t.surface },
  focused: { outlineWidth: focus.width, outlineColor: t.focusRing, outlineOffset: focus.offset },
  label: { color: t.textMuted, fontSize: type.bodySm.fontSize },
  labelActive: { color: t.text, fontWeight: "600" },
  count: { color: t.textMuted, fontSize: type.caption.fontSize },
  countActive: { color: t.accentText },
}));
