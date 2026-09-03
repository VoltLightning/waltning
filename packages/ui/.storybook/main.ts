/**
 * Storybook over `react-native-web`, and why that is the honest projection.
 *
 * `vitest.config.ts` already aliases `react-native` to `react-native-web` and
 * states the reason: *"the same substitution Metro makes for the web bundle,
 * which is what keeps the test honest — it exercises the code the browser
 * actually runs, not a mock of it."* This framework performs the identical
 * substitution through `vite-plugin-rnw`, so what renders here is what the web
 * bundle renders, not a second approximation of it.
 *
 * **`.native.tsx` variants are not covered, and that is inherited rather than
 * new.** `architecture/10` records the projection gap as the accepted cost of
 * platform files, and `vitest.config.ts` names it in the same words. A story
 * for a component with a native variant shows the web half; seeing the native
 * half needs an on-device Storybook, which is a different tool and a different
 * card. Saying so here so the gap is documented at the surface that has it.
 *
 * **Config lives outside `src/`** because `tests/architecture.test.ts` holds an
 * allowlist of top-level folders per `src/`, and a build-tool folder is not a
 * domain. Stories themselves are colocated *inside* `src/`, beside the
 * component and its test, which is what keeps them subject to the conformance
 * checks — a story that hardcodes a colour must fail the same way a component
 * does, or the review surface becomes the one place the design system is not
 * enforced.
 */

import type { StorybookConfig } from "@storybook/react-native-web-vite";

const reanimatedWebUtils = {
  name: "waltning:reanimated-web-utils",
  enforce: "pre" as const,
  transform(_code: string, id: string) {
    if (!id.includes("react-native-reanimated") || !id.includes("js-reanimated/webUtils")) {
      return null;
    }
    return {
      code: [
        'import createReactDOMStyle from "react-native-web/dist/exports/StyleSheet/compiler/createReactDOMStyle";',
        'import { createTextShadowValue, createTransformValue } from "react-native-web/dist/exports/StyleSheet/preprocess";',
        "export { createReactDOMStyle, createTextShadowValue, createTransformValue };",
      ].join("\n"),
      map: null,
    };
  },
};

const config: StorybookConfig = {
  /**
   * Colocated with the components, and `.tsx` only — a story renders something.
   */
  stories: ["../src/**/*.stories.tsx"],

  /**
   * `addon-a11y` rather than a lint rule, because `design-system/10` asks for
   * things static analysis cannot see: contrast against the *rendered*
   * background, and a focus order that depends on layout.
   */
  addons: [
    "@storybook/addon-a11y",
    /**
     * Required for the `autodocs` tag in `preview.tsx` to produce anything.
     * The tag alone builds zero docs pages and reports no error — checked by
     * counting `docs` entries in `index.json` before and after, rather than by
     * reading the config back and believing it.
     */
    "@storybook/addon-docs",
  ],

  /**
   * No framework options. Fonts are the one thing that would want configuring
   * here, and they are solved in `fonts.ts` instead — derived from
   * `RequiredFace` so a missing face is a compile error. Two answers to the
   * same question is how one of them goes stale.
   */
  framework: "@storybook/react-native-web-vite",

  /**
   * **Telemetry off.** Storybook reports anonymous usage — addon list, story
   * count, framework — to its own servers on every run. This repository is
   * explicit that a third-party request is a decision rather than a default:
   * `apps/mobile/src/fonts.ts` refuses a webfont CDN because "it tells whoever
   * hosts it when the owner opened their finance app", and the same sentence
   * applies to a build tool that reports when the owner opened their design
   * system. Nothing here needs the outside world, so nothing here reaches it.
   */
  core: { disableTelemetry: true },

  /**
   * **Reanimated's browser half reaches `react-native-web` through `require`,
   * and Vite leaves a `require` undefined.** `js-reanimated/webUtils.web.js`
   * does `try { createReactDOMStyle = require("react-native-web/…") } catch {}`
   * three times; in a Vite bundle each throws, each is swallowed, and every
   * animated style update then falls into a branch written for a React
   * component rather than a DOM node — `Object.keys(component.props)` on an
   * element — so the first component to move on mount crashed its story.
   * `vite-plugin-rnw` carries a transform for exactly this file and it did
   * not fire here; this one does the same rewrite, as static imports, and is
   * gated on the file's path alone. Excluded from dependency pre-bundling so
   * the dev server sees the same source as the build.
   */
  viteFinal: (config) => ({
    ...config,
    plugins: [reanimatedWebUtils, ...(config.plugins ?? [])],
    optimizeDeps: {
      ...config.optimizeDeps,
      exclude: [...(config.optimizeDeps?.exclude ?? []), "react-native-reanimated"],
    },
  }),
};

export default config;
