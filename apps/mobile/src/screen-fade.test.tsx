/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const seen: { entering: unknown }[] = [];
const reduced = { value: false };

vi.mock("react-native-reanimated", () => ({
  default: {
    View: (props: { entering: unknown; children: unknown }) => {
      seen.push({ entering: props.entering });
      return <>{props.children}</>;
    },
  },
  FadeIn: { duration: (ms: number) => ({ fadeIn: ms }) },
}));
vi.mock("@waltning/ui/primitives/reduced-motion", () => ({
  useReducedMotion: () => reduced.value,
}));

import { ScreenFade } from "./screen-fade";

beforeEach(() => {
  seen.length = 0;
  reduced.value = false;
});

it("fades a screen in over 150 ms on the web, where the navigator draws no transition", () => {
  render(
    <ScreenFade>
      <span>the screen</span>
    </ScreenFade>,
  );
  expect(screen.getByText("the screen")).toBeDefined();
  expect(seen).toEqual([{ entering: { fadeIn: 150 } }]);
});

it("does not animate under the reduced-motion preference", () => {
  reduced.value = true;
  render(
    <ScreenFade>
      <span>the screen</span>
    </ScreenFade>,
  );
  expect(seen).toEqual([{ entering: undefined }]);
});
