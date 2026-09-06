/**
 * `BottomSheet` — `design-system/05` §5.1. One story per shape the callers
 * actually take, because the shape is what the component's height rule is
 * about: a short sheet must not grow a scrollbar it does not need, a
 * form-shaped one must stop at the window and scroll, a picker that brings
 * its own bounded list must keep working inside the body, and a footer must
 * stay put while the body moves under it.
 *
 * `TallForm`'s `play` function is the one that would have caught the
 * original defect — the sheet used to be as tall as its content, so
 * `scrollHeight <= clientHeight` and nothing below the fold was reachable.
 * It throws in a real browser and returns in jsdom, where there is no
 * layout to read (the split `ground-panel.stories.tsx` states at length).
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { ScrollView, Text } from "react-native";
import { Button } from "../primitives/button";
import { TextField } from "../primitives/text-field";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { hairline, space, touchTarget } from "../tokens.ts";
import { BottomSheet } from "./bottom-sheet";

function noop() {}

const FIELDS = [
  "Payee",
  "Amount, from",
  "Amount, to",
  "Category",
  "Account",
  "Counterparty",
  "Note contains",
  "Tag",
];

const ACCOUNTS = [
  "Bank A · PLN",
  "Bank B · EUR",
  "Card B · EUR",
  "Cash",
  "Savings · CHF",
  "Business · PLN",
  "Joint · PLN",
  "Travel · EUR",
];

/** A form-shaped body: eight fields and a hint, taller than any phone window. */
function TallBody() {
  const styles = useStyles();
  return (
    <>
      {FIELDS.map((field) => (
        <TextField key={field} label={field} value="" onChangeText={noop} placeholder="Any" />
      ))}
      <Text style={styles.hint}>Filters apply to the visible range only.</Text>
    </>
  );
}

/**
 * The picker shape: a caller's own bounded `ScrollView`, laid out inside the
 * sheet's body rather than instead of it — `AccountPicker` and
 * `CategorySheet` are both built this way.
 */
function OwnListBody() {
  const styles = useStyles();
  return (
    <ScrollView style={styles.ownList} nestedScrollEnabled>
      {ACCOUNTS.map((account) => (
        <Text key={account} style={styles.row}>
          {account}
        </Text>
      ))}
    </ScrollView>
  );
}

/** The appearance sheet's own three choices — the shortest shape there is. */
function ShortBody() {
  const styles = useStyles();
  return (
    <>
      {["System", "Light", "Dark"].map((choice) => (
        <Text key={choice} style={styles.row}>
          {choice}
        </Text>
      ))}
    </>
  );
}

function SettleFooter() {
  return <Button label="Settle 240,00 zł" onPress={noop} variant="primary" size="lg" />;
}

const meta = {
  title: "Shell/BottomSheet",
  component: BottomSheet,
  args: { visible: true, title: "Filter", onDismiss: noop },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof BottomSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Three rows: the sheet is as tall as it needs to be, and no taller. */
export const ShortContent: Story = {
  args: { title: "Appearance", children: <ShortBody /> },
};

/** The shape that was unusable: taller than the window, so the body scrolls. */
export const TallForm: Story = {
  args: { children: <TallBody /> },
  play: async ({ canvasElement }) => {
    const body = canvasElement.ownerDocument.body.querySelector(
      '[data-testid="bottom-sheet-body"]',
    );
    if (!(body instanceof HTMLElement)) {
      throw new Error("bottom-sheet.stories.tsx: no sheet body to scroll");
    }
    if (body.scrollHeight <= body.clientHeight) {
      // jsdom lays nothing out; in a browser this is the defect itself.
      if (navigator.userAgent.includes("jsdom")) return;
      throw new Error(
        "bottom-sheet.stories.tsx: the sheet body did not scroll — scrollHeight <= " +
          "clientHeight in a real browser",
      );
    }
    body.scrollTop = body.scrollHeight;
  },
};

/** A caller's own bounded list, still bounded, still scrolling. */
export const PickerWithOwnList: Story = {
  args: { title: "Account", children: <OwnListBody /> },
};

/** §5.1's third part — the commitment stays put while the body moves. */
export const WithPinnedFooter: Story = {
  args: { title: "Settle", children: <TallBody />, footer: <SettleFooter /> },
};

const useStyles = makeStyles((theme) => ({
  hint: { color: theme.textMuted, ...text.ui("caption") },
  ownList: { maxHeight: touchTarget.min * 5 },
  row: {
    minHeight: touchTarget.min,
    paddingVertical: space.md,
    borderBottomWidth: hairline.width,
    borderBottomColor: theme.hairline,
    color: theme.text,
    ...text.ui("body"),
  },
}));
