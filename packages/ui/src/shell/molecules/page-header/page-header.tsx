/**
 * `<PageHeader>` — a screen's name, on the ground, in the page's own type.
 *
 * **The deck has no navigation band.** Every artboard that is not a tab root
 * — S09, S13, S17, S18, S30's Back up — opens with a 23pt display title and a
 * muted line under it, sitting on the same cream the cards sit on, with the
 * way back as a quiet mark at the right. Twelve shipped screens wore a dark
 * sage band with a small white title instead, because that is what
 * `Stack.Screen` draws when nobody says otherwise: Today looked like the
 * design and everything you navigated *to* looked like a different app.
 *
 * **It is a band, not a row inside the page.** `GroundPanel` is the scroller
 * and clears the sides and the bottom of its own content, deliberately never
 * the top — "the top belongs to the header above it". So a screen composes
 * this **beside** the panel, and the device's top inset is cleared here, once,
 * on a `View` that does not move. Left inside the scroller, the way back
 * slides under the notch the moment the column overflows.
 *
 * **`ComposerHeader` is this component wearing a ✕.** The two were written
 * apart and were already near-twins — same clearance, same two type steps,
 * same one-control-at-the-right shape. A composer's own rule is *which* mark
 * it carries and that its title never names the kind; neither is a reason for
 * a second implementation of the band.
 */

import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { useSafeArea } from "../../../primitives/safe-area";
import { text, textCap } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { gutter, space } from "../../../tokens.ts";

export type PageHeaderProps = {
  /** The screen's name — *Currencies*, *Accounts*. A word, not a sentence. */
  title: string;
  /**
   * The line under it.
   *
   * The deck gives one to every screen that has a header, and they are not
   * decoration: *"Which exist, and where rates come from"* tells you what the
   * screen is for before you have read a row of it.
   */
  subtitle?: string;
  /** One control at the right — the way back, or a composer's ✕. Never two. */
  action?: ReactNode;
  /**
   * The band's fill, when the page below opens with a band of its own that
   * this header continues — S09's category wash. Absent, the ground.
   */
  tint?: string;
  /**
   * Words drawn in the title's place — S09's date, which trades places with
   * the name and amount as the page scrolls. `title` still names the band for
   * assistive technology; this is only what is drawn.
   */
  titleNode?: ReactNode;
};

export function PageHeader({ title, subtitle, action, tint, titleNode }: PageHeaderProps) {
  const styles = useStyles();
  const insets = useSafeArea();

  // Composed beside the JSX rather than in `useStyles`: `makeStyles` caches
  // per theme, and these three vary per device — `shell.tsx`'s own reason, and
  // its own values. The deck's words sit 4 in from the gutter on the ground,
  // the same inset `DayHeader` keeps under a day's card.
  const clearance = {
    paddingTop: gutter + insets.top,
    paddingLeft: gutter + space.xs + insets.left,
    paddingRight: gutter + space.xs + insets.right,
    ...(tint === undefined ? {} : { backgroundColor: tint }),
  };

  return (
    <View style={[styles.band, clearance]}>
      <View style={styles.words}>
        {titleNode !== undefined ? (
          <View accessible accessibilityRole="header" accessibilityLabel={title}>
            {titleNode}
          </View>
        ) : (
          <Text
            style={styles.title}
            numberOfLines={1}
            maxFontSizeMultiplier={textCap("displayTwo")}
          >
            {title}
          </Text>
        )}
        {subtitle === undefined ? null : (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>
      {action}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  band: {
    backgroundColor: theme.ground,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xl,
    /*
      **Room under the words** (`design-system/05` §5.1). The band ended where
      the subtitle's line did, so the line sat on the band's lower edge — the
      edge the page grows a rule along once it scrolls under it. The panel
      below adds its own 14 for its content; this half keeps the words off
      the rule without doubling the seam.
    */
    paddingBottom: space.md,
  },
  words: { flex: 1, gap: space.xs },
  title: { color: theme.text, ...text.ui("displayTwo") },
  /** A step up from `label`: 13pt under a 23pt title read as a footnote to it. */
  subtitle: { color: theme.textMuted, ...text.ui("bodySm") },
}));
