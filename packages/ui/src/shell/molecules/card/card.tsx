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
 * The top belongs to whatever sits above it, and the app guarantees something
 * always does — in one of three shapes, all of which clear the status bar
 * themselves:
 *
 * - the shell's own band on a tab root: `TodayFrame`'s hero on Today,
 *   `TabHeader` on the other three (`05-composites` §5.1);
 * - the stack's navigation header on a route pushed over the tabs;
 * - a composer's own band — a title and a × — on a screen that draws its
 *   chrome instead of taking the navigator's, which is then the thing that
 *   applies the top inset.
 *
 * Any of the three, never none. That is why `edges` came and went in the same
 * change — the prop existed to let a bare panel be a whole screen, and giving
 * every route one of these three removed the case it was for. A prop whose
 * only value is its default is a decision the structure already made.
 *
 * **The guarantee is on the screen, not on this component**, and it cannot be
 * otherwise: a panel cannot see what is above it. What this file promises is
 * only that it will not clear the top itself, so nothing is cleared twice.
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
 * inset and `clearBottom={false}` says so; the design padding (`space.x4`)
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
 * **`scroll="own"` takes none of it — nor the side gutter**, because both have
 * to land on the *content that scrolls* and in that mode this component is not
 * holding it. Padding the panel would clip the screen's own list at the
 * gutter: the scroll bar rides inside the page, a focused field's ring is cut
 * off left and right, and the bottom padding shortens the list rather than
 * clearing the fold. A screen that owns its list calls `useGroundInset()` and
 * spreads the values onto the list's own `contentContainerStyle`.
 */

import { Text, View } from "react-native";
import Animated, { type useAnimatedScrollHandler } from "react-native-reanimated";
import { Tag } from "../../../primitives/atoms/tag";
import { pageScrollProps } from "../../../primitives/nested-scroll.ts";
import { useSafeArea } from "../../../primitives/safe-area";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { radius, space } from "../../../tokens.ts";
import { useFloatingClearance } from "../../atoms/floating-clearance";

/**
 * A Reanimated scroll handler, named once so the two components that forward
 * one agree on it.
 *
 * Reanimated's, not React Native's: the header this feeds interpolates its
 * shape on the UI thread, and a plain `onScroll` would put a JS round-trip
 * between the finger and the header on every frame.
 */
export type ScrollHandler = ReturnType<typeof useAnimatedScrollHandler>;

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
   * below it and clears the inset itself): the design padding (`space.x4`) is
   * all it adds.
   *
   * **Read in `scroll="page"` only.** In `scroll="own"` this panel carries no
   * bottom at all, so there is nothing here for the flag to change; the screen
   * passes the same choice to `useGroundInset({ clearBottom: false })`, which
   * is where its own scroller's bottom is decided.
   */
  clearBottom?: boolean;
  /**
   * Forwarded to the panel's scroller, for chrome that has to move with the
   * page — S04's header collapses from it.
   *
   * **Read in `scroll="page"` only**: in `scroll="own"` this component is a
   * `View` and there is no scroller here to listen to. The screen that owns
   * the list is the one that can report it, and does.
   */
  onScroll?: ScrollHandler | undefined;
};

export function GroundPanel({
  children,
  scroll = "page",
  clearBottom = true,
  onScroll,
}: GroundPanelProps) {
  const styles = useStyles();
  const insets = useSafeArea();
  const floatClearance = useFloatingClearance();

  if (scroll === "own") {
    // **No gutter and no bottom clearance here.** Both belong to the scroller
    // this screen owns — a `View` around it clips the bar inside the page and
    // slices a focused field's ring (`shell/ground-inset.ts` has it in full).
    // The panel keeps only what a wrapper can honestly carry: the top padding
    // and the gap between its children.
    return <View style={[styles.panel, styles.panelTop]}>{children}</View>;
  }

  // Not in `useStyles`: that cache is keyed on the theme, and these are keyed
  // on the device. The clearance goes on the scroll *content*, so the last row
  // clears the home indicator at the end of the travel rather than at the fold.
  const deviceBottom = clearBottom ? insets.bottom : 0;
  const clearance = {
    paddingLeft: space.x4 + insets.left,
    paddingRight: space.x4 + insets.right,
    paddingBottom: space.x4 + deviceBottom + (clearBottom ? floatClearance : 0),
  };

  return (
    <View style={styles.panel}>
      <Animated.ScrollView
        testID="ground-panel-scroll"
        onScroll={onScroll}
        // 16ms: the header derives its shape from this, and a default of 0
        // reports once per gesture — a header that jumps when the finger lifts.
        scrollEventThrottle={16}
        {...pageScrollProps(styles.scroll)}
        contentContainerStyle={[styles.scrollContent, clearance]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // iOS-only; harmless elsewhere (`react-native`'s own contract for a
        // prop a platform does not implement).
        automaticallyAdjustKeyboardInsets
      >
        {children}
      </Animated.ScrollView>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  card: {
    backgroundColor: theme.surface,
    borderRadius: radius.md,
    padding: space.x3b,
    gap: space.xl,
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
  /**
   * No rule under it. The deck draws a card's label as its first line and
   * nothing else — a hairline here was one more edge on a surface that
   * already has one, and it is what made every card read as a form section.
   */
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.x3,
  },
  heading: { flexDirection: "row", alignItems: "center", gap: space.x3, flexShrink: 1 },
  /**
   * **A label, not a heading.** This was `displayThree` in full ink — 17/600,
   * the step §2.2 used to hand to *card titles* — and every board draws a
   * card's own line at 13/500 muted. One component, fourteen callers, and a
   * section label shouting on every screen it appeared on.
   */
  title: { color: theme.textMuted, ...text.ui("label") },
  // Background and radius only. The padding lives on whichever style can
  // carry it without clipping something: `scrollContent` in the page-scrolling
  // default, and in `scroll="own"` only `panelTop` — the sides and the bottom
  // go to the screen's own scroller through `useGroundInset()`, so the two
  // modes are deliberately *not* the same values relocated.
  panel: {
    backgroundColor: theme.ground,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    flex: 1,
  },
  /**
   * `scroll="own"` — the top padding and the inter-child gap, the two values a
   * wrapper can apply without clipping the scroller inside it. The sides and
   * the bottom travel down through `useGroundInset()` instead.
   */
  panelTop: { paddingTop: space.x2, gap: space.x2 },
  scroll: { flex: 1 },
  /**
   * `flexGrow: 1` — a screen shorter than the device still fills it, while a
   * screen taller than the device scrolls instead of clipping. The gap is the
   * one `panelTop` also carries; the padding is this mode's alone, since in
   * `"own"` it belongs to the screen's own scroller.
   */
  // The deck's gutter is 20 on the sides, and 14 between cards and above the
  // first — the same 14 the cards keep between themselves.
  scrollContent: {
    paddingTop: space.x2,
    paddingHorizontal: space.x4,
    paddingBottom: space.x4,
    gap: space.x2,
    flexGrow: 1,
  },
}));
