/**
 * `<Card>` and `<GroundPanel>` — `design-system/05` §5.
 *
 * `Card`: `surface`, `radius-md`, a one-pixel `border` and **no shadow**, with
 * an optional title and one action. **One** action, not a row of them — a card
 * with three affordances in its header is a card whose content has stopped
 * being the point. A card groups related rows or holds a figure; it never
 * wraps a whole screen or a single field — which screens need one is decided
 * per screen, elsewhere in the design system.
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
 * Native double-scroll warning, not a second kind of page. Either way, nothing
 * nests a second scroller of its own; `tests/architecture.test.ts` enforces
 * both halves of that.
 *
 * The clearance lives on the scroll content, not on the panel itself — so the
 * last row clears the home indicator at the end of the scroll, at the bottom
 * of what was typed or read, rather than at the fold where a short screen's
 * content happens to end.
 */

import { ScrollView, Text, View } from "react-native";
import { useSafeArea } from "../primitives/safe-area";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { hairline, radius, space } from "../tokens.ts";

export type CardProps = {
  title?: string;
  /** One action, in the header. Rendered as given — usually a `Button`. */
  action?: React.ReactNode;
  children: React.ReactNode;
};

export function Card({ title, action, children }: CardProps) {
  const styles = useStyles();

  return (
    <View style={styles.card}>
      {title || action ? (
        <View style={styles.header}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
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
   * already owns a virtualized list (`FlatList`/`SectionList`): nesting one
   * of those inside a `ScrollView` of the same orientation is the React
   * Native double-scroll warning, not a second kind of page.
   */
  scroll?: "page" | "own";
};

export function GroundPanel({ children, scroll = "page" }: GroundPanelProps) {
  const styles = useStyles();
  const insets = useSafeArea();

  // Not in `useStyles`: that cache is keyed on the theme, and these are keyed
  // on the device. The clearance lives on whichever style ends up carrying
  // the panel's padding — the scroll content in `"page"` mode, the panel
  // itself in `"own"` — so the last row clears the home indicator at the end
  // of the scroll, not at the fold.
  const clearance = {
    paddingBottom: space.x5 + insets.bottom,
    paddingLeft: space.x5 + insets.left,
    paddingRight: space.x5 + insets.right,
  };

  if (scroll === "own") {
    return <View style={[styles.panel, styles.panelPadding, clearance]}>{children}</View>;
  }

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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.x3,
    borderBottomWidth: hairline.width,
    borderBottomColor: theme.hairline,
    paddingBottom: space.xl,
  },
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
