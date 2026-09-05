/**
 * `GroundPanel` — `design-system/05` §5.1. The page scroller for every
 * screen in `apps/mobile/src`.
 *
 * **`TallContent`, over a fixed 390×600 frame.** The story canvas would
 * otherwise be exactly as tall as its own content, which is never taller
 * than the viewport it is measured against — the same reasoning
 * `FloatingAdd`'s own stories state for their fixed frame. Forty rows
 * overflow 600px comfortably; the `play` function scrolls to the end and the
 * baseline is captured there, so a regression that pins the panel to the
 * viewport (H1 — `flex: 1` on the panel's sole child, which gives it a
 * `flexBasis` of `0` and defeats both the scroll and the bottom clearance)
 * shows up as a screenshot that never moved, not only as a property nothing
 * looks at.
 *
 * **The geometry only exists in a real browser, but the throw is not
 * optional there.** jsdom has no layout, so `scrollHeight`/`clientHeight`
 * both read `0` and the play function returns early rather than asserting
 * `0 <= 0` and calling that coverage — the same split `stories.test.tsx`
 * states for colour contrast. In the visual suite's own Chromium, that same
 * `scrollHeight <= clientHeight` reading would mean the panel never scrolled
 * at all, and the function throws instead of returning. `visual/stories.spec.ts`
 * fails the story's own test on any play throw — a baseline alone was never
 * proof this passed, only a picture that happened to be taken after it did.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { Text, View } from "react-native";
import { makeStyles } from "../theme/styles.ts";
import { hairline, space } from "../tokens.ts";
import { GroundPanel } from "./card";

const ROWS = Array.from({ length: 40 }, (_, index) => index);
const LAST_ROW_TEST_ID = "tall-content-last-row";
/** `space.x5` (22), the panel's own clearance with no device inset in a story — a little headroom for sub-pixel rounding. */
const CLEARANCE_FLOOR = 18;

function TallContent() {
  const styles = useStyles();
  return (
    <GroundPanel>
      {ROWS.map((row) => (
        <Text
          key={row}
          {...(row === ROWS.length - 1 ? { testID: LAST_ROW_TEST_ID } : {})}
          style={styles.row}
        >
          Row {row + 1}
        </Text>
      ))}
    </GroundPanel>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <View style={styles.frame}>{children}</View>;
}

const meta = {
  title: "Shell/GroundPanel",
  component: TallContent,
  decorators: [withFrame],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof TallContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TallContentStory: Story = {
  name: "TallContent",
  play: async ({ canvasElement }) => {
    const scroll = canvasElement.querySelector('[data-testid="ground-panel-scroll"]');
    if (!(scroll instanceof HTMLElement)) {
      throw new Error("card.stories.tsx: no GroundPanel scroll container to scroll");
    }

    // jsdom has no layout — `scrollHeight`/`clientHeight` both read `0`
    // there, so there is nothing to scroll and nothing to assert. In a real
    // browser (the visual suite) that same condition is the regression
    // itself and must throw, never quietly return.
    if (scroll.scrollHeight <= scroll.clientHeight) {
      if (navigator.userAgent.includes("jsdom")) return;
      throw new Error(
        "card.stories.tsx: the panel did not scroll — scrollHeight <= clientHeight " +
          "in a real browser",
      );
    }

    scroll.scrollTop = scroll.scrollHeight;

    const lastRow = canvasElement.querySelector(`[data-testid="${LAST_ROW_TEST_ID}"]`);
    if (!(lastRow instanceof HTMLElement)) {
      throw new Error("card.stories.tsx: no last row to assert against");
    }

    const viewport = scroll.getBoundingClientRect();
    const row = lastRow.getBoundingClientRect();

    if (row.bottom > viewport.bottom) {
      throw new Error(
        `card.stories.tsx: the last row's bottom (${row.bottom}) sits below the ` +
          `scrolled viewport's own bottom (${viewport.bottom}) — the panel did not ` +
          "reach the end of its content",
      );
    }
    if (viewport.bottom - row.bottom < CLEARANCE_FLOOR) {
      throw new Error(
        `card.stories.tsx: only ${viewport.bottom - row.bottom}px separates the last ` +
          `row from the viewport's bottom edge — expected at least the panel's own ` +
          `clearance (${CLEARANCE_FLOOR}px)`,
      );
    }
  },
};

function withFrame(Story: React.ComponentType) {
  return (
    <Frame>
      <Story />
    </Frame>
  );
}

const useStyles = makeStyles((theme) => ({
  frame: { width: 390, height: 600, backgroundColor: theme.ground },
  row: {
    paddingVertical: space.md,
    borderBottomWidth: hairline.width,
    borderBottomColor: theme.hairline,
    color: theme.text,
  },
}));
