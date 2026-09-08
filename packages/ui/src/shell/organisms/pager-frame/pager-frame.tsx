/**
 * `<PagerFrame>` — S04's whole shell: the period, the four names, and the
 * pages beneath them (S04 §3).
 *
 * **This exists so the chrome is assembled once.** `PeriodBar` and `PageTabs`
 * are shared by all four pages and never scroll away; a screen that composed
 * them itself would be free to draw them per page, and the first time one page
 * drew a slightly different bar the pager would stop reading as one screen.
 *
 * **It owns nothing.** The date, the page and the figures all arrive as props
 * — `usePagerDate` holds them and `today-screen` wires them — because the
 * rules that could be wrong belong somewhere a test reaches without
 * rendering, and this component is the part that only draws.
 *
 * **Tapping a name and swiping to a page are the same event.** Both call
 * `onPageChange`; neither is the primary, and neither knows about the other.
 */

import { memo } from "react";
import { View } from "react-native";
import { makeStyles } from "../../../theme/styles.ts";
import { space } from "../../../tokens.ts";
import { type PageTab, PageTabs } from "../../molecules/page-tabs/page-tabs";
import { PeriodBar } from "../../molecules/period-bar/period-bar";
import { Pager, type PagerPage } from "../pager/pager";

export type PagerFrameProps = {
  /** Already formatted and localised — `September`, `2026`, `March 2024`. */
  periodLabel: string;
  /** The visible period's figure, already through `<Amount>`'s formatter. */
  periodFigure: string;
  /** Absent where the ledger cannot go further. */
  onPrevious?: (() => void) | undefined;
  onNext?: (() => void) | undefined;
  onSearch: () => void;
  /** Accessible names for the bar's three controls, localised by the caller. */
  barLabels: { previous: string; next: string; search: string };

  /** The four pages, in the order they are swiped through. */
  pages: readonly PagerPage[];
  activeKey: string;
  onPageChange: (key: string) => void;
};

function PagerFrameView({
  periodLabel,
  periodFigure,
  onPrevious,
  onNext,
  onSearch,
  barLabels,
  pages,
  activeKey,
  onPageChange,
}: PagerFrameProps) {
  const styles = useStyles();
  // `PageTabs` wants the labels only; the pages carry the same strings for
  // their panels, so one list is the source and neither can drift from it.
  const tabs: readonly PageTab[] = pages.map((page) => ({ key: page.key, label: page.label }));

  return (
    <View style={styles.root}>
      <View style={styles.chrome}>
        <PeriodBar
          label={periodLabel}
          figure={periodFigure}
          onPrevious={onPrevious}
          onNext={onNext}
          onSearch={onSearch}
          labels={barLabels}
        />
        <PageTabs tabs={tabs} activeKey={activeKey} onSelect={onPageChange} />
      </View>
      <Pager pages={pages} activeKey={activeKey} onActiveKeyChange={onPageChange} />
    </View>
  );
}

export const PagerFrame = memo(PagerFrameView);

const useStyles = makeStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.ground },
  // The chrome sits on the surface, not the ground: it is the thing the pages
  // move under, and a band the same colour as what scrolls past it stops
  // reading as fixed.
  chrome: {
    backgroundColor: theme.surface,
    paddingHorizontal: space.x3,
    paddingTop: space.xs,
    gap: space.sm,
  },
}));
