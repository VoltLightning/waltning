/**
 * `PagerFrame` — Today's chrome (S04 §3): the period title with its arrows,
 * search, the page tabs, and the pages under them. Each page here is a
 * placeholder, because the frame is what is on show; the pages have their own
 * stories.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { space } from "../../../tokens.ts";
import { PagerFrame } from "./pager-frame";

function noop() {}

const LABELS = {
  previous: "Previous month",
  next: "Next month",
  search: "Search",
  pickPeriod: "Pick a month",
};

type FrameStoryProps = {
  searchOpen?: boolean;
  searchQuery?: string;
  searchCount?: number;
  filter?: string;
  hasPrevious?: boolean;
  hasNext?: boolean;
};

function Page({ name }: { name: string }) {
  const styles = useStyles();
  return (
    <View style={styles.page}>
      <Text style={styles.pageText}>{name}</Text>
    </View>
  );
}

const PAGES = [
  { key: "summary", label: "Summary", node: <Page name="Summary page" /> },
  { key: "list", label: "List", node: <Page name="List page" /> },
  { key: "calendar", label: "Calendar", node: <Page name="Calendar page" /> },
  { key: "months", label: "Months", node: <Page name="Months page" /> },
];

function Frame({
  searchOpen = false,
  searchQuery = "",
  searchCount,
  filter,
  hasPrevious = true,
  hasNext = true,
}: FrameStoryProps) {
  const styles = useStyles();
  const scrollY = useSharedValue(0);
  const [active, setActive] = useState("list");
  const [query, setQuery] = useState(searchQuery);
  const handlePage = useCallback((key: string) => setActive(key), []);
  return (
    <View style={styles.frame}>
      <PagerFrame
        periodLabel="September"
        periodDetail="2026"
        periodKey="2026-09"
        onPickPeriod={noop}
        scrollY={scrollY}
        {...(hasPrevious ? { onPrevious: noop } : {})}
        {...(hasNext ? { onNext: noop } : {})}
        onSearch={noop}
        barLabels={LABELS}
        searchOpen={searchOpen}
        searchQuery={query}
        onSearchChange={setQuery}
        onSearchClose={noop}
        {...(filter === undefined ? {} : { filter: { label: filter, onClear: noop } })}
        searchPlaceholder="Search payee, note, amount"
        {...(searchCount === undefined ? {} : { searchCount })}
        pages={PAGES}
        activeKey={active}
        onPageChange={handlePage}
      />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  frame: { width: 390, maxWidth: "100%", height: 640 },
  page: { padding: space.x4 },
  pageText: { color: theme.textMuted, ...text.ui("body") },
}));

const meta = {
  title: "Shell/PagerFrame",
  component: Frame,
  parameters: { layout: "fullscreen" },
  args: {},
} satisfies Meta<typeof Frame>;

export default meta;
type Story = StoryObj<typeof meta>;

/** At rest on the List page, both arrows live. */
export const AtRest: Story = {};

/** Search open with a query and its match count. */
export const Searching: Story = {
  args: { searchOpen: true, searchQuery: "café", searchCount: 12 },
};

/** Opened from an account: the filter chip says which, and clears in place. */
export const Filtered: Story = { args: { filter: "From Bank A" } };

/** The first month with anything in it: there is no previous to step to. */
export const FirstPeriod: Story = { args: { hasPrevious: false } };
