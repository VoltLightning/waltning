/** @vitest-environment jsdom */

import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createAppearance } from "./create-appearance.ts";
import { useAppearance } from "./use-appearance.ts";

const store = {
  get: async () => null,
  set: async () => undefined,
};

describe("useAppearance", () => {
  it.each([
    ["dark", "dark"],
    ["light", "light"],
    [null, "light"],
    [undefined, "light"],
  ] as const)("resolves System with a %s device scheme to %s", (scheme, expected) => {
    const controller = createAppearance(store);

    function Probe() {
      const appearance = useAppearance(controller, scheme);
      return <span>{appearance.theme}</span>;
    }

    render(<Probe />);
    expect(screen.getByText(expected)).toBeDefined();
  });

  it("lets an explicit preference override the device scheme", async () => {
    const controller = createAppearance(store);

    function Probe() {
      const appearance = useAppearance(controller, "dark");
      return <span>{`${appearance.preference}:${appearance.theme}`}</span>;
    }

    render(<Probe />);
    await act(async () => controller.setPreference("light"));

    expect(screen.getByText("light:light")).toBeDefined();
  });
});
