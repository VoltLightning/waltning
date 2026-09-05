/**
 * `<DashboardGrid>` — `S01` §3's `WidgetGrid`: "a layout, not a page."
 *
 * Widgets read from `dashboard_layouts` → `dashboard_widgets` (`SPEC.md`
 * §14.5), so this component draws whatever `slots` it is handed, in the order
 * and sizes the table gives — it invents no arrangement of its own. `size`
 * maps to a flex basis; a wrapping row is what lets three `s`/`m` widgets and
 * one `l` one (`S01`'s own mock: category, balances, debt, then a full-width
 * line chart) fall into the layout their own sizes describe without a second,
 * hand-drawn grid template.
 */

import { View } from "react-native";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";

export type DashboardWidgetSize = "s" | "m" | "l";

export type DashboardGridSlot = {
  key: string;
  size: DashboardWidgetSize;
  node: React.ReactNode;
};

export type DashboardGridProps = {
  slots: readonly DashboardGridSlot[];
};

const BASIS: Record<DashboardWidgetSize, `${number}%`> = { s: "31%", m: "48%", l: "100%" };

export function DashboardGrid({ slots }: DashboardGridProps) {
  const styles = useStyles();

  return (
    <View style={styles.grid}>
      {slots.map((slot) => {
        const basis = { flexBasis: BASIS[slot.size] };
        return (
          <View key={slot.key} style={[styles.slot, basis]}>
            {slot.node}
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.x4 },
  slot: { flexGrow: 1, minWidth: 260 },
}));
