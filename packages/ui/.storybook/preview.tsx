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
import { type ThemeName, themes } from "../src/theme/roles.ts";
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
function Panel({ name, children }: { name: ThemeName; children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: themes[name].ground, padding: 16 }}>
      <ThemeProvider name={name}>{children}</ThemeProvider>
    </View>
  );
}

const withTheme: Decorator = (Story, context) => {
  // Bracket access: `globals` is an index signature, and
  // `noPropertyAccessFromIndexSignature` makes the dotted form an error on
  // purpose — it types as present when it is not.
  const appearance = (context.globals["appearance"] ?? "light") as Appearance;

  if (appearance === "both") {
    return (
      <View style={{ flexDirection: "row", minHeight: 240 }}>
        <Panel name="light">
          <Story />
        </Panel>
        <Panel name="dark">
          <Story />
        </Panel>
      </View>
    );
  }

  return (
    <Panel name={appearance}>
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

  parameters: {
    /**
     * Storybook's own backgrounds are off: the decorator paints
     * `theme.ground`, and a second background control would let the two
     * disagree with no indication which one is the product's.
     */
    backgrounds: { disable: true },
    a11y: { test: "todo" },
  },
};

export default preview;
