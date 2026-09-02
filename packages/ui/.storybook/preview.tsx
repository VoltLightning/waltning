/**
 * Every story renders inside a theme, and can render inside both at once.
 *
 * **`both` is the mode this file exists for.** The dark-palette card's own
 * *Done when* is *"the diff between the two palettes is the mapping file
 * alone"*, and that is a claim about two renders side by side — a toggle can
 * only ever show one, so a difference between them is checked against memory.
 * `light` and `dark` are here because a screenshot wants one; `both` is here
 * because review wants two.
 *
 * The wrapper paints `theme.ground` behind the story. Without it a dark story
 * sits on Storybook's own white canvas, every contrast judgement is made
 * against the wrong backdrop, and `design-system/10`'s contrast rules are
 * assessed against a colour the app never shows.
 */

import type { Decorator, Preview } from "@storybook/react-native-web-vite";
import { View } from "react-native";
import { ThemeProvider } from "../src/theme/provider";
import type { ThemeName } from "../src/theme/roles.ts";
import { makeStyles } from "../src/theme/styles.ts";
import { space } from "../src/tokens.ts";
import { FONT_FACE_CSS } from "./fonts.ts";

/**
 * The `@font-face` rules, injected once.
 *
 * A `<style>` rather than a stylesheet import because the rules are *derived*
 * from `RequiredFace` in `fonts.ts` — which is what makes a missing face a
 * compile error instead of a silent fallback. CSS cannot be typechecked; this
 * can.
 */
function installFonts() {
  if (typeof document === "undefined") return;
  if (document.getElementById("waltning-faces")) return;
  const style = document.createElement("style");
  style.id = "waltning-faces";
  style.textContent = FONT_FACE_CSS;
  document.head.appendChild(style);
}

installFonts();

type Appearance = ThemeName | "both";

/**
 * One themed panel: the provider, and the ground it is meant to sit on.
 *
 * `flex: 1` rather than a fixed height so a story that grows — a list, a filled
 * form — is not clipped at an arbitrary line that looks like a layout bug.
 */
/**
 * **A fullscreen story gets no inset.** The 16px was added so a component
 * would not sit against the canvas edge, and it was applied to screens too —
 * so every `TodayFrame` baseline showed a shell floating inside a margin of
 * ground that the app never draws. A screenshot that lies about the edge is
 * the one thing the visual suite must not produce; the frame reads the
 * story's own `layout` parameter, which is the Storybook convention for
 * "this is a screen, not a component".
 */
function Panel({
  name,
  inset,
  children,
}: {
  name: ThemeName;
  inset: boolean;
  children: React.ReactNode;
}) {
  return (
    // The ground comes from the theme in **context**, so the provider is
    // outside the painted surface rather than inside it. It was the other way
    // round — the `View` read `themes[name].ground` by hand into an inline
    // style — which is the one shape in this package where a colour reached JSX
    // directly, in the very file that renders every conformance check.
    <ThemeProvider name={name}>
      <PanelSurface inset={inset}>{children}</PanelSurface>
    </ThemeProvider>
  );
}

function PanelSurface({ inset, children }: { inset: boolean; children: React.ReactNode }) {
  const styles = useStyles();
  return <View style={[styles.panel, inset ? styles.inset : null]}>{children}</View>;
}

/** Both themes at once. No colour of its own — it is the seam between two. */
function SideBySide({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <View style={styles.sideBySide}>{children}</View>;
}

const withTheme: Decorator = (Story, context) => {
  // Bracket access: `globals` is an index signature, and
  // `noPropertyAccessFromIndexSignature` makes the dotted form an error on
  // purpose — it types as present when it is not.
  const appearance = (context.globals["appearance"] ?? "light") as Appearance;
  const inset = context.parameters["layout"] !== "fullscreen";

  if (appearance === "both") {
    return (
      <SideBySide>
        <Panel name="light" inset={inset}>
          <Story />
        </Panel>
        <Panel name="dark" inset={inset}>
          <Story />
        </Panel>
      </SideBySide>
    );
  }

  return (
    <Panel name={appearance} inset={inset}>
      <Story />
    </Panel>
  );
};

const preview: Preview = {
  decorators: [withTheme],

  initialGlobals: { appearance: "light" },

  globalTypes: {
    appearance: {
      description: "Which theme the story renders in",
      toolbar: {
        title: "Appearance",
        icon: "contrast",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
          { value: "both", title: "Side by side" },
        ],
        dynamicTitle: true,
      },
    },
  },

  /**
   * A generated props table per component, from the docgen that already runs.
   *
   * `design-system/03`–`05` say what a component is *for*; the table says what
   * it *takes*, and maintaining the second by hand is how it stops matching the
   * first. This costs one tag because `react-docgen` is already extracting the
   * types — confirmed by finding `__docgenInfo` in a build before switching it
   * on, rather than assuming it.
   */
  tags: ["autodocs"],

  parameters: {
    /**
     * Storybook's own backgrounds are off: the decorator paints
     * `theme.ground`, and a second background control would let the two
     * disagree with no indication which one is the product's.
     */
    backgrounds: { disable: true },

    /**
     * **`error`, not `todo`.** `todo` reports and never fails, which is the
     * setting that lets an accessibility spec coexist with an inaccessible
     * component indefinitely — `design-system/10` exists and `D12` is a card,
     * so a violation should be a red build rather than a badge somebody may
     * notice.
     *
     * A story that genuinely cannot satisfy a rule turns it off *at that
     * story*, in writing, with the reason. That is a decision on the record;
     * a global `todo` is the same exemption granted silently to everything.
     */
    a11y: { test: "error" },
  },
};

export default preview;

const useStyles = makeStyles((theme) => ({
  panel: { flex: 1, backgroundColor: theme.ground },
  inset: { padding: space.x3 },
  // Tall enough that a short component still shows both grounds meeting.
  sideBySide: { flexDirection: "row", minHeight: 240 },
}));
