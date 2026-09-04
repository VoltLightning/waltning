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
 *
 * **`tone="shell"`** is `DeskBand`'s own scope control (`02-tokens` §2.10):
 * a dark inset — `theme.shellInsetTrackFill`, not `theme.subtleFill` — with a
 * `ground`-coloured, pill-free active rectangle rather than `surface`. The
 * default `tone` is what every other caller (scope on `ground`, an import
 * filter) already had; the shell reads as a recess in a band that is
 * otherwise flat colour, where the default tone read as a floating light
 * card laid on top of the green.
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

export type SegmentControlTone = "surface" | "shell";

export type SegmentControlProps = {
  /** Two to four. One option is not a choice; five is a menu. */
  segments: readonly [Segment, Segment, ...Segment[]];
  value: string;
  onChange: (value: string) => void;
  /** `"surface"` (default) sits on `ground`; `"shell"` is `DeskBand`'s own. */
  tone?: SegmentControlTone;
};

export function SegmentControl({
  segments,
  value,
  onChange,
  tone = "surface",
}: SegmentControlProps) {
  const styles = useStyles();

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.track, tone === "shell" ? styles.trackShell : null]}
    >
      {segments.map((segment) => (
        <SegmentOption
          key={segment.value}
          segment={segment}
          active={segment.value === value}
          onChange={onChange}
          tone={tone}
        />
      ))}
    </View>
  );
}

type SegmentOptionProps = {
  segment: Segment;
  active: boolean;
  onChange: (value: string) => void;
  tone: SegmentControlTone;
};

function SegmentOption({ segment, active, onChange, tone }: SegmentOptionProps) {
  const { hovered, focused, handlers } = useInteraction();
  const styles = useStyles();
  const handlePress = useCallback(() => onChange(segment.value), [onChange, segment.value]);
  const shell = tone === "shell";

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
        // The active segment already sits lifted (`surface` or, on the
        // shell, `ground`); hovering it promises nothing, so only a resting
        // segment answers the pointer. The shell tone answers with nothing
        // at all — "inactive items are `shellTextMuted` on nothing".
        hovered && !active && !shell ? styles.hovered : null,
        active ? (shell ? styles.activeShell : styles.active) : null,
        focused ? styles.focused : null,
      ]}
    >
      <Text style={[shell ? styles.labelShell : styles.label, active ? styles.labelActive : null]}>
        {segment.label}
      </Text>
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
    borderRadius: radius.md,
    padding: space.xxs,
  },
  trackShell: {
    backgroundColor: theme.shellInsetTrackFill,
    borderRadius: radius.sm,
  },
  segment: {
    flex: 1,
    minHeight: touchTarget.min,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    borderRadius: radius.sm,
    paddingHorizontal: space.xl,
  },
  hovered: { backgroundColor: theme.hoverFill },
  active: { backgroundColor: theme.surface },
  // `radius.xs` — a pill-free rectangle, tighter than the track's own
  // `radius.sm` — and `ground`, not `surface`: the shell has no `surface`
  // step of its own to lift onto, and `ground` is what the routed screen
  // beneath the band is painted in.
  activeShell: { backgroundColor: theme.ground, borderRadius: radius.xs },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  label: { color: theme.textMuted, ...text.ui("bodySm") },
  labelShell: { color: theme.shellTextMuted, ...text.ui("bodySm") },
  // Ink, both tones: the active fill is light in the `surface` tone (`ground`
  // or `surface`) and light again in the `shell` tone (`ground`) — the same
  // dark-on-light contrast either way.
  labelActive: { color: theme.text, ...text.ui("bodySm", 600) },
  count: { color: theme.textMuted, ...text.ui("caption") },
  countActive: { color: theme.accentText },
}));
