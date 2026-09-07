/**
 * `<Inset>` — a panel *inside* a card.
 *
 * **The step the system did not have.** `surface` is a card on the page and
 * `subtleFill` is a track or a filled chip; neither is "a box that groups
 * content within a card". Components that needed one reached for `subtleFill`
 * and got a fill tuned for a control, or nested a second `Card` and got a
 * border where there should be none — the paired figures under a heading are
 * one object, not two cards. `insetFill` (`02-tokens` §2.1) is that step, and
 * this is the only thing that draws it.
 *
 * No border: an inset is *inside* something that already has one, and a second
 * outline at 1.19:1 reads as a seam rather than a group.
 */

import type { ReactNode } from "react";
import { View } from "react-native";
import { makeStyles } from "../../../theme/styles.ts";
import { radius, space } from "../../../tokens.ts";

export type InsetProps = {
  children: ReactNode;
  /**
   * Side by side rather than stacked — the shape S04 and S12 both use for a
   * pair of figures. Each child takes an equal share, so two figures of
   * different lengths still line up.
   */
  row?: boolean;
};

export function Inset({ children, row }: InsetProps) {
  const styles = useStyles();
  return <View style={[styles.inset, row === true ? styles.row : null]}>{children}</View>;
}

const useStyles = makeStyles((theme) => ({
  inset: {
    backgroundColor: theme.insetFill,
    borderRadius: radius.sm,
    padding: space.xl,
    gap: space.xxs,
  },
  row: { flexDirection: "row", gap: space.lg },
}));
