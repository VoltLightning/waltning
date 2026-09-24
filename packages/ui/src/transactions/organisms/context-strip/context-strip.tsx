/**
 * `<ContextStrip>` — S09's context cards (`screens/S09-transaction-detail.md`
 * §3), the part of the screen that says what a transaction *means*: how often
 * you go there, whether this is a lot for the category, how often you move
 * money between these two accounts.
 *
 * **Swiped on a phone, side by side at desk width.** A phone shows one card
 * and the edge of the next, snapping card by card, with page dots beneath; a
 * desk has the width to show them all at once and draws no dots.
 *
 * **Data in, words here.** The figures arrive already computed
 * (`computations.md` §6a, `useTransactionContext`); this component names
 * months, formats every amount through `<Amount>` and says *one-off* where a
 * share was left out. It fetches nothing.
 */

import type { YearMonth } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import { useCallback, useState } from "react";
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Amount } from "../../../fx/atoms/amount/amount";
import { monthLabel } from "../../../i18n/locales.ts";
import { useLocale, useT } from "../../../i18n/provider";
import { Button } from "../../../primitives/atoms/button/button";
import { categoryTintFor } from "../../../primitives/monogram.ts";
import { horizontalScrollProps } from "../../../primitives/nested-scroll.ts";
import { useBreakpoint } from "../../../primitives/use-breakpoint.ts";
import { Card } from "../../../shell/molecules/card/card";
import { text } from "../../../theme/fonts.ts";
import { useTheme } from "../../../theme/provider";
import { makeStyles } from "../../../theme/styles.ts";
import { radius, space } from "../../../tokens.ts";
import { MonthBars, type MonthBarsMonth } from "../../molecules/month-bars/month-bars";

type Figures = { currency: string; decimals: number; share: money.Money | null };

export type ContextStripCard =
  | (Figures & {
      kind: "who";
      name: string;
      months: readonly MonthBarsMonth[];
      count: number;
      onOpenAll: () => void;
    })
  | (Figures & {
      kind: "pair";
      fromName: string;
      toName: string;
      months: readonly MonthBarsMonth[];
      count: number;
    })
  | (Figures & {
      kind: "category";
      name: string;
      month: YearMonth;
      spent: money.Money;
      usual: money.Money | null;
    })
  | { kind: "link"; onLink: () => void };

export type ContextStripProps = { cards: readonly ContextStripCard[] };

/** How much of the next card a phone shows, so the row reads as swipeable. */
const PEEK = 44;

export function ContextStrip({ cards }: ContextStripProps) {
  const styles = useStyles();
  const t = useT();
  const phone = useBreakpoint() === "phone";
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);
  const cardWidth = Math.max(0, width - PEEK);
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (cardWidth === 0) return;
      const next = Math.round(event.nativeEvent.contentOffset.x / (cardWidth + space.lg));
      // Only a new page sets state — the scroll itself never re-renders the cards.
      setPage((current) => (current === next ? current : next));
    },
    [cardWidth],
  );

  if (cards.length === 0) return null;

  const paged = { width: cardWidth };
  const rendered = cards.map((card) => (
    <View key={card.kind} style={phone && cards.length > 1 ? paged : styles.fill}>
      <ContextCard card={card} />
    </View>
  ));

  if (!phone || cards.length === 1) {
    return (
      <View accessibilityLabel={t("transactions.contextLabel")} style={styles.row}>
        {rendered}
      </View>
    );
  }

  return (
    <View accessibilityLabel={t("transactions.contextLabel")} style={styles.strip}>
      <View onLayout={handleLayout}>
        {width === 0 ? null : (
          <ScrollView
            {...horizontalScrollProps(styles.scroller)}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={cardWidth + space.lg}
            decelerationRate="fast"
            onScroll={handleScroll}
            scrollEventThrottle={32}
            contentContainerStyle={styles.pager}
          >
            {rendered}
          </ScrollView>
        )}
      </View>
      <View style={styles.dots} importantForAccessibility="no-hide-descendants">
        {cards.map((card, index) => (
          <View key={card.kind} style={[styles.dot, index === page ? styles.dotOn : null]} />
        ))}
      </View>
    </View>
  );
}

function ContextCard({ card }: { card: ContextStripCard }) {
  switch (card.kind) {
    case "who":
      return <MonthsCard title={card.name} card={card} onOpenAll={card.onOpenAll} />;
    case "pair":
      return <MonthsCard title={`${card.fromName} → ${card.toName}`} card={card} />;
    case "category":
      return <CategoryCard card={card} />;
    case "link":
      return <LinkCard onLink={card.onLink} />;
  }
}

type MonthsCardProps = {
  title: string;
  card: Figures & { months: readonly MonthBarsMonth[]; count: number };
  onOpenAll?: () => void;
};

function MonthsCard({ title, card, onOpenAll }: MonthsCardProps) {
  const styles = useStyles();
  const t = useT();
  const locale = useLocale();
  const last = card.months.at(-1);
  if (last === undefined) return null;

  return (
    <Card>
      <View style={styles.head}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.caption}>
          {t("transactions.contextInMonth", {
            month: monthLabel(last.month, locale),
            times: String(card.count),
          })}
        </Text>
      </View>
      <Amount value={last.total} currency={card.currency} decimals={card.decimals} size="large" />
      <MonthBars months={card.months} share={card.share} />
      <View style={styles.foot}>
        <ShareNote share={card.share} />
        {onOpenAll === undefined ? null : (
          <Button label={t("transactions.contextSeeAll")} variant="ghost" onPress={onOpenAll} />
        )}
      </View>
    </Card>
  );
}

function CategoryCard({ card }: { card: Extract<ContextStripCard, { kind: "category" }> }) {
  const styles = useStyles();
  const theme = useTheme();
  const t = useT();
  const locale = useLocale();
  const tint = categoryTintFor(card.name, theme);
  const swatch = { backgroundColor: tint.solid };

  // One scale for all three marks: the longer of the month and the usual.
  const scale =
    card.usual !== null && money.dec(card.usual).greaterThan(card.spent) ? card.usual : card.spent;
  const part = (value: money.Money) =>
    money.isPositive(scale) ? Math.min(1, money.dec(value).div(scale).toNumber()) : 0;
  const shareWidth = card.share === null ? 0 : part(card.share);
  const restWidth = Math.max(0, part(card.spent) - shareWidth);
  const rest = { flex: restWidth };
  const mine = { flex: shareWidth };
  const room = { flex: Math.max(0, 1 - restWidth - shareWidth) };
  const usualAt = card.usual === null ? null : { left: `${part(card.usual) * 100}%` as const };

  return (
    <Card>
      <View style={styles.head}>
        <View style={styles.titleRow}>
          <View style={[styles.swatch, swatch]} />
          <Text style={styles.title} numberOfLines={1}>
            {card.name}
          </Text>
        </View>
        <Text style={styles.caption}>{monthLabel(card.month, locale)}</Text>
      </View>
      <Amount value={card.spent} currency={card.currency} decimals={card.decimals} size="large" />
      <View style={styles.meter}>
        <View style={[styles.meterRest, rest]} />
        <View style={[styles.meterShare, mine]} />
        <View style={room} />
        {usualAt === null ? null : <View style={[styles.usualMark, usualAt]} />}
      </View>
      <View style={styles.foot}>
        <ShareNote share={card.share} />
        {card.usual === null ? null : (
          <View style={styles.usual}>
            <Text style={styles.caption}>{t("transactions.contextUsual")}</Text>
            <Amount
              value={card.usual}
              currency={card.currency}
              decimals={card.decimals}
              size="caption"
              emphasis="muted"
            />
          </View>
        )}
      </View>
    </Card>
  );
}

function LinkCard({ onLink }: { onLink: () => void }) {
  const styles = useStyles();
  const t = useT();
  return (
    <Card>
      <Text style={styles.title}>{t("transactions.contextLinkTitle")}</Text>
      <Text style={styles.body}>{t("transactions.contextLinkBody")}</Text>
      <View style={styles.linkAction}>
        <Button label={t("transactions.contextLinkAction")} variant="secondary" onPress={onLink} />
      </View>
    </Card>
  );
}

/** *This one*, or why there is no *this one* — a one-off counts nowhere here. */
function ShareNote({ share }: { share: money.Money | null }) {
  const styles = useStyles();
  const t = useT();
  if (share === null) {
    return <Text style={styles.caption}>{t("transactions.contextOneOff")}</Text>;
  }
  return (
    <View style={styles.titleRow}>
      <View style={styles.key} />
      <Text style={styles.caption}>{t("transactions.contextThisOne")}</Text>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  strip: { gap: space.lg },
  row: { flexDirection: "row", gap: space.lg },
  fill: { flex: 1 },
  pager: { gap: space.lg },
  scroller: { flexGrow: 0 },
  dots: { flexDirection: "row", justifyContent: "center", gap: space.sm },
  dot: { width: 6, height: 6, borderRadius: radius.xs, backgroundColor: theme.hairline },
  dotOn: { width: 16, backgroundColor: theme.accent },
  head: { gap: space.xxs },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  title: { color: theme.text, ...text.ui("body", 600), flexShrink: 1 },
  caption: { color: theme.textMuted, ...text.ui("caption") },
  body: { color: theme.textMuted, ...text.ui("bodySm") },
  swatch: { width: 10, height: 10, borderRadius: radius.xs },
  key: { width: 10, height: 10, borderRadius: radius.xs, backgroundColor: theme.chartRamp[0] },
  foot: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    minHeight: 32,
  },
  meter: {
    flexDirection: "row",
    height: 10,
    borderRadius: radius.xs,
    overflow: "hidden",
    backgroundColor: theme.subtleFill,
  },
  meterRest: { backgroundColor: theme.chartRamp[3] },
  meterShare: { backgroundColor: theme.chartRamp[0] },
  usualMark: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    backgroundColor: theme.text,
  },
  usual: { flexDirection: "row", alignItems: "baseline", gap: space.xs },
  linkAction: { flexDirection: "row" },
}));
