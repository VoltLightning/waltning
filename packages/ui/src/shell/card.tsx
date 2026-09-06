/**
 * `<Card>` and `<GroundPanel>` — `design-system/05` §5.
 *
 * `Card`: `surface`, `radius-md`, a one-pixel `border` and **no shadow**, with
 * an optional title, an optional tag beside it, and one action.
 *
 * **A card groups related rows or holds one hero figure. Titles, single
 * fields, chip rows, hints and buttons sit on the ground. Never a whole
 * screen, never a single control.** That is `design-system/05` §5.1's rule
 * verbatim, and `tests/architecture.test.ts` enforces it against every screen
 * in the repository.
 *
 * **The header is part of the card**, not something sitting on the ground
 * inside it: `title`, `tag` and `action` are the card's own slots, and the
 * rule's "titles sit on the ground" is about a screen's title, not a card's.
 * `action` takes **one** action or one figure — a card with three affordances
 * in its header is a card whose content has stopped being the point.
 *
 * `edge="accent"` draws a 2 px left edge for a card that has to read as
 * distinct without reading as lesser (`SharedGroup`, S16 §3: *"visually
 * distinct but not diminished"*). Distinction is drawn by adding a mark,
 * never by taking size or weight away — which is why the shared group is a
 * full-weight card with an edge and a tag rather than a quieter one.
 *
 * `GroundPanel`: the `radius-lg` surface that lifts over the shell. It is the
 * page body, and the reason the shell's dark band reads as behind rather than
 * above.
 *
 * **It is also the thing that reaches the screen's edges**, so it is where the
 * device's chrome is cleared — bottom and sides, never the top.
 *
 * The top belongs to the header above it, and the app guarantees there is one:
 * `TodayFrame`'s shell on the ledger, a navigation header on every other route.
 * That is why `edges` came and went in the same change — the prop existed to
 * let a bare panel be a whole screen, and giving the form routes real headers
 * removed the case it was for. A prop whose only value is its default is a
 * decision the structure already made.
 *
 * Bottom, because the last card and the add button sat under the home
 * indicator on every gesture-navigation phone. Sides, because in landscape the
 * notch is on one of them, and a figure running under it is a figure read wrong
 * rather than a cosmetic clip.
 *
 * **It is also the page scroller.** Every screen in `apps/mobile/src` renders
 * through it, and `scroll` (default `"page"`) is what makes that true without
 * every screen wiring its own `ScrollView`: the four that used to have grown a
 * second scroller around a panel that never scrolled, and the rest never
 * scrolled at all, so *More details* on the account-creation form pushed Save
 * off the bottom of the device with no way to reach it. A screen that owns a
 * virtualized list (`FlatList`/`SectionList`) passes `scroll="own"` instead —
 * nesting a list inside a `ScrollView` of the same orientation is the React
 * Native double-scroll warning, not a second kind of page. That includes a
 * list owned one hop removed, through a component the screen renders
 * directly (`RateTable`'s own `FlatList`, reached from
 * `settings-rates-screen.tsx`) — the warning does not care whether the screen
 * wrote the `FlatList` itself or a component it composes did. A list two hops
 * away, behind a second layer of composition, is not detected — the check
 * only follows one. Either way, nothing nests a second scroller of its own;
 * `tests/architecture.test.ts` enforces both halves of that, discovering
 * which components own one from disk rather than a hardcoded list.
 *
 * The clearance lives on the scroll content, not on the panel itself — so the
 * last row clears the home indicator at the end of the scroll, at the bottom
 * of what was typed or read, rather than at the fold where a short screen's
 * content happens to end. `clearBottom` (default `true`) is for a panel that
 * is not actually the screen's own bottom edge — a `Dock` sits below it
 * (`transfer-screen.tsx`, `quick-add-screen.tsx`) and reaches the home
 * indicator itself, so the panel above it was never the thing clearing that
 * inset and `clearBottom={false}` says so; the design padding (`space.x5`)
 * stays regardless, since that is breathing room, not a device read.
 *
 * **A page under the floating button leaves room for it, and the shell is
 * what says which pages those are.** The button is mounted once inside the
 * tab shell, so it floats over the four tab roots and over nothing else — not
 * over the routes the stack pushes on top of them, and not over
 * `StartupFailed`, which renders before a tab shell exists. So the clearance
 * arrives through `useFloatingClearance()` and is zero wherever no provider
 * sits above (`shell/floating-clearance.tsx` has the argument in full). It is
 * added to the panel's own padding rather than replacing it: breathing room
 * and a circle overhead are two different measurements.
 *
 * **`scroll="own"` takes none of it**, because the clearance has to land on
 * the *content that scrolls* and in that mode this component is not holding
 * it. Padding the panel would only shorten the screen's own list and leave a
 * band of empty ground with the last row still under the button at the end of
 * the scroll. A screen that owns its list reads the same hook and puts the
 * value in the list's own `contentContainerStyle`.
 */

import { ScrollView, Text, View } from "react-native";
import { useSafeArea } from "../primitives/safe-area";
import { Tag } from "../primitives/tag";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { hairline, radius, space } from "../tokens.ts";
import { useFloatingClearance } from "./floating-clearance";

export type CardProps = {
  title?: string;
  /**
   * A `Tag` beside the title — the mark that makes one card distinct from its
   * siblings without making it smaller. Text, never tint alone (P5).
   */
  tag?: string;
  /**
   * **One** action or one figure, in the header. Rendered as given — usually a
   * `Button`, or the per-currency subtotals a grouped-rows card is totalling.
   */
  action?: React.ReactNode;
  /** `"accent"` — a 2 px left edge. `SharedGroup`'s "distinct, not diminished". */
  edge?: "accent";
  children: React.ReactNode;
};

export function Card({ title, tag, action, edge, children }: CardProps) {
  const styles = useStyles();

  return (
    <View style={edge === "accent" ? [styles.card, styles.accentEdge] : styles.card}>
      {title || tag || action ? (
        <View style={styles.header}>
          <View style={styles.heading}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {tag ? <Tag>{tag}</Tag> : null}
          </View>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export type GroundPanelProps = {
  children: React.ReactNode;
  /**
   * `"page"` (default) — the panel is the page scroller. `"own"` — the plain
   * `View` this component was before scrolling existed, for a screen that
   * already owns a virtualized list, directly or through a component it
   * renders (`FlatList`/`SectionList`): nesting one of those inside a
   * `ScrollView` of the same orientation is the React Native double-scroll
   * warning, not a second kind of page.
   */
  scroll?: "page" | "own";
  /**
   * `true` (default) — the panel is the screen's own bottom edge, so it
   * clears the home-indicator inset and whatever clearance the shell says a
   * floating button needs over it (`useFloatingClearance()`, zero outside the
   * tab shell). `false` — for a panel that is not that edge (`Dock` sits
   * below it and clears the inset itself): the design padding (`space.x5`) is
   * all it adds.
   */
  clearBottom?: boolean;
};

export function GroundPanel({ children, scroll = "page", clearBottom = true }: GroundPanelProps) {
  const styles = useStyles();
  const insets = useSafeArea();
  const floatClearance = useFloatingClearance();

  // Not in `useStyles`: that cache is keyed on the theme, and these are keyed
  // on the device. The clearance lives on whichever style ends up carrying
  // the panel's padding — the scroll content in `"page"` mode, the panel
  // itself in `"own"` — so the last row clears the home indicator at the end
  // of the scroll, not at the fold.
  const deviceBottom = clearBottom ? insets.bottom : 0;
  const sides = {
    paddingLeft: space.x5 + insets.left,
    paddingRight: space.x5 + insets.right,
  };

  if (scroll === "own") {
    // The device only: the button's clearance belongs to the list this
    // screen owns, not to a band of ground under it.
    const clearance = { ...sides, paddingBottom: space.x5 + deviceBottom };
    return <View style={[styles.panel, styles.panelPadding, clearance]}>{children}</View>;
  }

  const clearance = {
    ...sides,
    paddingBottom: space.x5 + deviceBottom + (clearBottom ? floatClearance : 0),
  };

  return (
    <View style={styles.panel}>
      <ScrollView
        testID="ground-panel-scroll"
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, clearance]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // iOS-only; harmless elsewhere (`react-native`'s own contract for a
        // prop a platform does not implement).
        automaticallyAdjustKeyboardInsets
      >
        {children}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  card: {
    backgroundColor: theme.surface,
    borderRadius: radius.md,
    padding: space.x5,
    gap: space.x3,
    shadowColor: theme.elevation.card.shadowColor,
    shadowOpacity: theme.elevation.card.shadowOpacity,
    shadowRadius: theme.elevation.card.shadowRadius,
    shadowOffset: theme.elevation.card.shadowOffset,
    borderWidth: theme.elevation.card.borderWidth,
    borderColor: theme.elevation.card.borderColor,
  },
  /**
   * `accent`, not a heavier border on all four sides: an edge is a mark on one
   * side, and a card whose whole outline changed would read as a different
   * kind of surface rather than as this one, marked.
   */
  accentEdge: { borderLeftWidth: 2, borderLeftColor: theme.accent },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.x3,
    borderBottomWidth: hairline.width,
    borderBottomColor: theme.hairline,
    paddingBottom: space.xl,
  },
  heading: { flexDirection: "row", alignItems: "center", gap: space.x3, flexShrink: 1 },
  title: { color: theme.text, ...text.ui("displayThree") },
  // Background and radius only — the padding and the inter-child gap that
  // used to live here now live on whichever style actually carries the
  // panel's content: `panelPadding` for `scroll="own"`, `scrollContent` for
  // the page-scrolling default. A short screen still looks identical either
  // way, because the values are the same ones, just relocated.
  panel: {
    backgroundColor: theme.ground,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    flex: 1,
  },
  /** `scroll="own"` — today's padding and gap, applied directly since there is no scroll content to carry them. */
  panelPadding: { padding: space.x5, gap: space.x4 },
  scroll: { flex: 1 },
  /**
   * `flexGrow: 1` — a screen shorter than the device still fills it, while a
   * screen taller than the device scrolls instead of clipping. Same padding
   * and gap `panelPadding` carries for `"own"`.
   */
  scrollContent: { padding: space.x5, gap: space.x4, flexGrow: 1 },
}));
