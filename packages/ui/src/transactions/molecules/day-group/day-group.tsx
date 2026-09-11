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

import { Children, memo } from "react";
import { View } from "react-native";
import { makeStyles } from "../../../theme/styles.ts";
import { hairline, radius, space } from "../../../tokens.ts";
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
      <View style={styles.rows}>
        {/*
          `toArray`, not `map`: `Children.map` counts `null` and `false`, so a
          row behind a condition that failed took index 0 and put a hairline
          above the first row the reader could see, and a `null` in the middle
          drew a divider over nothing. `toArray` drops them, and flattens a
          nested array; a fragment stays one child, so pass rows, not a
          fragment of rows.
        */}
        {Children.toArray(children).map((child, index) =>
          index === 0 ? (
            child
          ) : (
            <View key={keyOf(child, index)} style={styles.separated}>
              {child}
            </View>
          ),
        )}
      </View>
    </View>
  );
}

export const DayGroup = memo(DayGroupView);

/** `toArray` keys every element it returns; the fallback is for a bare string or number. */
function keyOf(child: ReturnType<typeof Children.toArray>[number], index: number) {
  return typeof child === "object" && child !== null && "key" in child && child.key !== null
    ? child.key
    : index;
}

/** Where a row sits in its day, which is what decides its corners. */
export type DayRowPlace = "only" | "first" | "middle" | "last";

export type DayRowSurfaceProps = { place: DayRowPlace; children: React.ReactNode };

/**
 * One row of a day, wearing the day's surface — for a list that cannot use
 * `<DayGroup>`, and **never inside one**: both carry the row inset and both
 * draw the divider, so a surface nested in a group is two hairlines and twice
 * the inset at every seam.
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
        place === "middle" || place === "last" ? styles.rowSeparated : null,
      ]}
    >
      {children}
    </View>
  );
}

export const DayRowSurface = memo(DayRowSurfaceView);

const useStyles = makeStyles((theme) => ({
  group: { gap: space.sm },
  rows: {
    backgroundColor: theme.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: space.x2,
    overflow: "hidden",
  },
  // A hairline between rows, never above the first: the deck's row divider.
  separated: { borderTopWidth: hairline.width, borderTopColor: theme.hairline },
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
    paddingHorizontal: space.x2,
    overflow: "hidden",
  },
  rowSeparated: { borderTopWidth: hairline.width, borderTopColor: theme.hairline },
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
