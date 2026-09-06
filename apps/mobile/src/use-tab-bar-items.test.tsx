/**
 * @vitest-environment jsdom
 *
 * `useTabBarItems` against a mocked `useTabTrigger` — what these tests assert
 * is the shape the hook hands `<TabBar>`, not `expo-router/ui`'s own
 * behaviour.
 */

import { act, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const switchTab = {
  today: vi.fn(),
  ledger: vi.fn(),
  debt: vi.fn(),
  settings: vi.fn(),
};
let focused: "today" | "ledger" | "debt" | "settings" = "today";

vi.mock("expo-router/ui", () => ({
  useTabTrigger: ({ name }: { name: "today" | "ledger" | "debt" | "settings" }) => ({
    trigger: { isFocused: name === focused },
    switchTab: switchTab[name],
  }),
}));

const { useTabBarItems } = await import("./use-tab-bar-items");

describe("useTabBarItems", () => {
  it("marks exactly the focused tab active, in a fixed order", () => {
    focused = "ledger";
    const { result } = renderHook(() => useTabBarItems());

    expect(result.current.items.map((i) => i.name)).toEqual([
      "today",
      "ledger",
      "debt",
      "settings",
    ]);
    expect(result.current.items.map((i) => i.active)).toEqual([false, true, false, false]);
  });

  it("dispatches onSelect to the named tab's own switchTab", () => {
    focused = "today";
    const { result } = renderHook(() => useTabBarItems());

    act(() => result.current.onSelect("settings"));
    expect(switchTab.settings).toHaveBeenCalledWith("settings", {});
    expect(switchTab.today).not.toHaveBeenCalled();
  });

  it("renders a distinct label for every tab", () => {
    focused = "today";
    function Probe() {
      const { items } = useTabBarItems();
      return <>{items.map((item) => item.label).join(" · ")}</>;
    }
    render(<Probe />);
    expect(screen.getByText("Today · Ledger · Debt · Settings")).toBeDefined();
  });

  /**
   * S11 is not built and its route answers *"this screen isn't built yet"*.
   * The `<TabTrigger>` stays registered in `(tabs)/_layout.tsx` — `/calendar`
   * is still a real URL — but a fifth of the bar leading to a placeholder
   * teaches the other four to be ignored, so it draws no target until the
   * screen exists.
   */
  it("does not list Calendar while S11 is unbuilt", () => {
    focused = "today";
    const { result } = renderHook(() => useTabBarItems());
    expect(result.current.items.map((i) => i.name)).not.toContain("calendar");
  });
});
