/**
 * `<DayGroup>` — a day's rows under its date and total. S04 §4, and the list's
 * only grouping.
 *
 * **§4 named it and nothing built it.** The List page drew a `DayHeader` and
 * then loose rows on the ground, so a day was a label with things after it
 * rather than a thing. Every board that draws this list — S10's phone layout,
 * the ledger boards — puts the header *outside* a surface and the day's rows
 * *inside* one, which is what makes a day read as a unit you can take in at a
 * glance instead of a run you have to find the end of.
 *
 * **The header is outside the surface on purpose.** A date is a divider between
 * days, not a title bar belonging to one; putting it inside the card gives the
 * card two kinds of content and makes the gap between two days ambiguous. The
 * total sits with the header because it is a fact *about* the day rather than
 * one of its rows.
 *
 * **It composes and does not fetch, and it does not know what a row is.** The
 * rows arrive as children, so the same grouping serves the ledger, a searched
 * list and a counterparty's history without any of them teaching this component
 * about their row shape.
 */

import { memo } from "react";
import { View } from "react-native";
import { makeStyles } from "../../../theme/styles.ts";
import { radius, space } from "../../../tokens.ts";
import { DayHeader } from "../day-header/day-header";

export type DayGroupProps = {
  /** The date, localised and already formatted. */
  label: string;
  /**
   * The day's own figure, already rendered — `DayHeader`'s own prop, forwarded.
   * Absent where the day has no figure it is entitled to state (S04 §7's
   * filtered list).
   */
  total?: React.ReactNode;
  children: React.ReactNode;
};

function DayGroupView({ label, total, children }: DayGroupProps) {
  const styles = useStyles();
  return (
    <View style={styles.group}>
      <DayHeader label={label} {...(total === undefined ? {} : { total })} />
      {/*
        `overflow: hidden` so a row's own press fill is clipped by the surface
        it sits in: a pressed first row squaring off the card's top corners is
        the detail that says the two were built separately.
      */}
      <View style={styles.rows}>{children}</View>
    </View>
  );
}

export const DayGroup = memo(DayGroupView);

/** Where a row sits in its day, which is what decides its corners. */
export type DayRowPlace = "only" | "first" | "middle" | "last";

export type DayRowSurfaceProps = { place: DayRowPlace; children: React.ReactNode };

/**
 * One row of a day, wearing the day's surface — for a list that cannot use
 * `<DayGroup>`.
 *
 * **An infinite list virtualises rows, not days.** S04's List walks five years
 * in both directions, so its cells are rows; a `<DayGroup>` holding a day's
 * rows would make a day with two hundred entries a single cell and hand the
 * whole thing to the renderer at once. This gives that list the same surface a
 * row at a time, with the corners coming from the same tokens — the alternative
 * is the look existing twice and drifting.
 */
function DayRowSurfaceView({ place, children }: DayRowSurfaceProps) {
  const styles = useStyles();
  return (
    <View
      style={[
        styles.rowSurface,
        place === "only" || place === "first" ? styles.rowTop : null,
        place === "only" || place === "last" ? styles.rowBottom : null,
      ]}
    >
      {children}
    </View>
  );
}

export const DayRowSurface = memo(DayRowSurfaceView);

const useStyles = makeStyles((theme) => ({
  group: { gap: space.xxs },
  rows: {
    backgroundColor: theme.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: "hidden",
  },
  /**
   * The same surface, cut into rows. The side borders are on every row and the
   * end borders only on the ends, so a day's rows join into one edge rather
   * than stacking two hairlines at every seam.
   */
  rowSurface: {
    backgroundColor: theme.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: theme.border,
    overflow: "hidden",
  },
  rowTop: {
    borderTopWidth: 1,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  rowBottom: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
  },
}));
