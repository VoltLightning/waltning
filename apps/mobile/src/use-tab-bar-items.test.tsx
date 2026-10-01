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
  accounts: vi.fn(),
  ledger: vi.fn(),
  counterparties: vi.fn(),
  settings: vi.fn(),
};
type Tab = "today" | "accounts" | "ledger" | "counterparties" | "settings";
let focused: Tab = "today";

vi.mock("expo-router/ui", () => ({
  useTabTrigger: ({ name }: { name: Tab }) => ({
    trigger: { isFocused: name === focused },
    switchTab: switchTab[name],
  }),
}));

const setParams = vi.fn();
vi.mock("expo-router", () => ({
  router: { setParams: (params: unknown) => setParams(params) },
}));

const { useTabBarItems } = await import("./use-tab-bar-items");
const { forgetStartPage, publishStartPage } = await import(
  "@waltning/client/ledger/tab-back/start-page-store"
);
const { scrollToTopCount } = await import("@waltning/client/ledger/tab-back/scroll-to-top-request");

describe("useTabBarItems", () => {
  it("marks exactly the focused tab active, in a fixed order", () => {
    focused = "accounts";
    const { result } = renderHook(() => useTabBarItems());

    expect(result.current.items.map((i) => i.name)).toEqual([
      "today",
      "accounts",
      "counterparties",
      "settings",
    ]);
    expect(result.current.items.map((i) => i.active)).toEqual([false, true, false, false]);
  });

  /**
   * **The Ledger is S04 on the phone** (`05-composites`, `TabBar`): a tab for
   * it led to the screen you were already on. The desk's band keeps it, after
   * Accounts, because the desk has a nav bar rather than four thumb targets.
   */
  it("keeps the Ledger off the phone's bar and on the desk's band", () => {
    focused = "ledger";
    const { result } = renderHook(() => useTabBarItems());
    expect(result.current.items.map((i) => i.name)).not.toContain("ledger");
    expect(result.current.deskItems.map((i) => i.name)).toEqual([
      "today",
      "accounts",
      "ledger",
      "counterparties",
      "settings",
    ]);
    expect(result.current.deskItems.find((i) => i.active)?.name).toBe("ledger");
  });

  it("dispatches onSelect to the named tab's own switchTab", () => {
    focused = "today";
    const { result } = renderHook(() => useTabBarItems());

    act(() => result.current.onSelect("settings"));
    expect(switchTab.settings).toHaveBeenCalledWith("settings", {});
    expect(switchTab.today).not.toHaveBeenCalled();
  });

  it("a tap on the selected Start tab returns to the overview from another page", () => {
    focused = "today";
    const show = vi.fn();
    publishStartPage("list", show);
    const { result } = renderHook(() => useTabBarItems());

    act(() => result.current.onSelect("today"));
    expect(show).toHaveBeenCalledWith("summary");
    expect(switchTab.today).not.toHaveBeenCalled();
    forgetStartPage();
  });

  it("a tap on the selected Start tab scrolls the overview to the top", () => {
    focused = "today";
    forgetStartPage();
    setParams.mockClear();
    const before = scrollToTopCount();
    const { result } = renderHook(() => useTabBarItems());

    act(() => result.current.onSelect("today"));
    expect(scrollToTopCount()).toBe(before + 1);
    expect(setParams).not.toHaveBeenCalled();
  });

  it("a tap on the selected Accounts tab leaves Start's scroll alone", () => {
    focused = "accounts";
    const before = scrollToTopCount();
    const { result } = renderHook(() => useTabBarItems());

    act(() => result.current.onSelect("accounts"));
    expect(scrollToTopCount()).toBe(before);
    expect(switchTab.accounts).not.toHaveBeenCalled();
  });

  it("renders a distinct label for every tab", () => {
    focused = "today";
    function Probe() {
      const { items } = useTabBarItems();
      return <>{items.map((item) => item.label).join(" · ")}</>;
    }
    render(<Probe />);
    expect(screen.getByText("Home · Accounts · People · Settings")).toBeDefined();
  });

  /**
   * S11 is not built, and the route that stood in for it answered *"this
   * screen isn't built yet"* — a fifth of the bar leading to a placeholder
   * teaches the other four to be ignored. The screen, the route and the
   * trigger are all gone; S11 adds the three of them and an entry here in
   * one change.
   */
  it("does not list Calendar while S11 is unbuilt", () => {
    focused = "today";
    const { result } = renderHook(() => useTabBarItems());
    expect(result.current.items.map((i) => i.name)).not.toContain("calendar");
  });
});
