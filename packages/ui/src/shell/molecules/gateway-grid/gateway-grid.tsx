/**
 * `<GatewayGrid>` — Summary's *Go to* (S04 §3).
 *
 * **Only what nothing else carries.** Accounts and the agent are tabs, so a
 * card for either would be a second door into the same room — and a second
 * door is worse than none, because now there are two things to keep current.
 *
 * **Every card carries a figure**, which is the difference between a status
 * board and a menu. *Between us* as a tab was a word and an icon; here it is
 * `+1 480,00 zł · 3 people`, and that is why a low-frequency destination is
 * better off in this grid than in the bar.
 *
 * Two across, because three would put a five-word caption on two lines at
 * 390pt and one across would be a list pretending to be a grid.
 */

import { memo, useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { useInteraction } from "../../../primitives/interaction.ts";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../../../tokens.ts";

export type Gateway = {
  key: string;
  /** The destination's name, localised. */
  label: string;
  /**
   * Its figure or its state — localised and already formatted.
   *
   * `null` where there is genuinely nothing to say yet. A card with an empty
   * line is a card that looks broken; one with no line at all is a card that
   * has not been given a figure, which is a different and honest thing.
   */
  detail: string | null;
  icon: React.ReactNode;
};

export type GatewayGridProps = {
  gateways: readonly Gateway[];
  onSelect: (key: string) => void;
};

function GatewayCard({ gateway, onSelect }: { gateway: Gateway; onSelect: (key: string) => void }) {
  const styles = useStyles();
  const { focused, handlers } = useInteraction();
  const key = gateway.key;
  const press = useCallback(() => onSelect(key), [onSelect, key]);

  return (
    <Pressable
      accessibilityRole="button"
      // Name and figure together: "Between us" alone makes a reader open it to
      // find out whether anything is owed.
      accessibilityLabel={
        gateway.detail === null ? gateway.label : `${gateway.label}, ${gateway.detail}`
      }
      onPress={press}
      {...handlers}
      style={[styles.card, focused ? styles.focused : null]}
    >
      <View style={styles.icon}>{gateway.icon}</View>
      <View style={styles.textBlock}>
        <Text style={styles.label}>{gateway.label}</Text>
        {gateway.detail === null ? null : <Text style={styles.detail}>{gateway.detail}</Text>}
      </View>
    </Pressable>
  );
}

const MemoGatewayCard = memo(GatewayCard);

function GatewayGridView({ gateways, onSelect }: GatewayGridProps) {
  const styles = useStyles();
  return (
    <View style={styles.grid}>
      {gateways.map((gateway) => (
        <MemoGatewayCard key={gateway.key} gateway={gateway} onSelect={onSelect} />
      ))}
    </View>
  );
}

export const GatewayGrid = memo(GatewayGridView);

const useStyles = makeStyles((theme) => ({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  card: {
    // Two across, whatever the row holds: `flexBasis` rather than `flex: 1`,
    // so an odd last card is a half-width card rather than a full-width one.
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: touchTarget.min,
    gap: space.sm,
    padding: space.x3,
    borderRadius: radius.lg,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderInteractive,
  },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.accentFill,
  },
  textBlock: { gap: space.xxs },
  label: { ...text.ui("bodySm", 600), color: theme.text },
  detail: { ...text.ui("caption"), color: theme.textMuted },
}));
