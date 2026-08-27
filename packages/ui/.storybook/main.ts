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

const config: StorybookConfig = {
  /**
   * Colocated with the components, and `.tsx` only — a story renders something.
   */
  stories: ["../src/**/*.stories.tsx"],

  /**
   * `addon-a11y` rather than a lint rule, because `design-system/10` asks for
   * things static analysis cannot see: contrast against the *rendered*
   * background, and a focus order that depends on layout. It reports; it does
   * not gate. The gate is `stories.test.tsx`, which runs every story through
   * the existing Vitest runner.
   */
  addons: ["@storybook/addon-a11y"],

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
};

export default config;
