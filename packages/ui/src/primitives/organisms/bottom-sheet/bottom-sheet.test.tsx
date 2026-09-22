/** @vitest-environment jsdom */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { TextInput } from "react-native";
import { beforeEach, expect, it, vi } from "vitest";
import { expectContainsOverscroll } from "../../../primitives/nested-scroll.test-support.ts";
import type { SafeAreaInsets } from "../../../primitives/safe-area";
import { SafeAreaProvider, WindowInsetsProvider } from "../../../primitives/safe-area";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles.ts";

/**
 * The composition the tab shell actually produces: the device's insets on the
 * window, and a *layer* that has re-provided a different bottom because the
 * tab bar below it already cleared the home indicator. Handing the sheet
 * `NOTCHED` directly — which these tests used to do — is a combination that
 * cannot occur under the shell, and it was passing while the shipped sheet
 * paid the indicator zero times.
 */
function UnderTheTabShell({
  insets,
  children,
}: {
  insets: SafeAreaInsets;
  children: React.ReactNode;
}) {
  return (
    <WindowInsetsProvider insets={insets}>
      <SafeAreaProvider insets={{ ...insets, bottom: 0 }}>{children}</SafeAreaProvider>
    </WindowInsetsProvider>
  );
}

/**
 * The keyboard, injected. `react-native-web`'s `Keyboard` never fires, so
 * there is no other way to render this component in the state H3 is about —
 * and the state is the whole reason the footer is pinned.
 */
let keyboardHeight = 0;
const dismissKeyboard = vi.fn();
vi.mock("../../../primitives/keyboard.ts", () => ({
  useKeyboardHeight: () => keyboardHeight,
  dismissKeyboard: () => dismissKeyboard(),
  // `"padding"` rather than `undefined`: the height and the behaviour are one
  // fact (`keyboard.test.ts` pins that they cannot drift apart), so a mock
  // that reported a keyboard with the lift switched off would be a state the
  // constants forbid. The lift itself is `KeyboardAvoidingView`'s and
  // `react-native-web`'s `Keyboard` never fires, so it is inert here — what
  // these tests own is the half that has to move with it.
  KEYBOARD_AVOIDANCE: "padding",
}));

const { BottomSheet } = await import("./bottom-sheet");
// The ceiling is read at the seam rather than off the DOM: the box it lands on
// belongs to `@gorhom/bottom-sheet`, which the jsdom stub stands in for.
const { lastMaxDynamicContentSize } = await import("../../../../.vitest/gorhom-bottom-sheet");

/**
 * `react-native-web`'s `Dimensions` reads `document.documentElement`, which
 * jsdom reports as zero until something says otherwise. `configurable` because
 * more than one test sets it and the second `defineProperty` would throw on a
 * non-configurable property.
 */
function resizeTo(width: number, height: number) {
  Object.defineProperty(document.documentElement, "clientWidth", {
    value: width,
    configurable: true,
  });
  Object.defineProperty(document.documentElement, "clientHeight", {
    value: height,
    configurable: true,
  });
  window.dispatchEvent(new Event("resize"));
}

beforeEach(() => {
  keyboardHeight = 0;
  dismissKeyboard.mockClear();
  act(() => resizeTo(390, 793));
});

it("keeps hidden sheet content absent", () => {
  render(
    <BottomSheet visible={false} title="Appearance" onDismiss={vi.fn()}>
      choices
    </BottomSheet>,
  );
  expect(screen.queryByText("choices")).toBeNull();
});

it("labels visible content and dismisses from backdrop and Close", () => {
  const onDismiss = vi.fn();
  render(
    <BottomSheet visible title="Appearance" onDismiss={onDismiss}>
      <span>choices</span>
    </BottomSheet>,
  );
  // The name is on the `Modal`, which is the element carrying `role="dialog"`.
  expect(screen.getByLabelText("Appearance").getAttribute("role")).toBe("dialog");
  screen.getByRole("button", { name: "Dismiss Appearance" }).click();
  screen.getByRole("button", { name: "Close" }).click();
  expect(onDismiss).toHaveBeenCalledTimes(2);
});

/**
 * The defect this component was rebuilt for: a form-shaped sheet grew to the
 * height of its content, off the top of the window, and nothing in it
 * scrolled. Both halves are asserted — a cap without a scroller clips, and a
 * scroller without a cap never scrolls. The body's own `overflow-y` is what
 * separates a real `ScrollView` from a `View` with a test id.
 */
/**
 * **The body no longer scrolls, and that is a decision.** The sheet is sized by
 * `@gorhom/bottom-sheet`'s dynamic sizing, which measures its content — and a
 * `ScrollView` has no intrinsic height to measure, so it under-reported and the
 * content spilled out of the bottom of the sheet. The height promise won: the
 * sheet is its content's height, capped by the window and the keyboard, and a
 * sheet holding more than fits brings its own bounded list. Every picker in
 * this repository already did (`account-picker`, `category-sheet`,
 * `counterparty-picker`); the form-shaped sheets are short enough not to need
 * one, and this test is what says so if that stops being true.
 */
it("bounds its height against the window", () => {
  render(
    <BottomSheet visible title="Filter" onDismiss={vi.fn()}>
      <span>rows</span>
    </BottomSheet>,
  );

  // §5.1's 170px top offset, measured against this window rather than guessed.
  expect(lastMaxDynamicContentSize()).toBe(793 - 170);
});

/**
 * The body still contains its own overscroll: a caller's bounded list reaching
 * its end must not scroll the page behind the sheet, and the containment is on
 * the box around it rather than on whatever the caller passes.
 */
it("contains its own overscroll", () => {
  render(
    <BottomSheet visible title="Filter" onDismiss={vi.fn()}>
      <span>rows</span>
    </BottomSheet>,
  );
  expectContainsOverscroll("bottom-sheet-body");
});

/** A status bar taller than the design's offset pushes the cap down, not up. */
it("yields to a top inset larger than the design offset", () => {
  render(
    <UnderTheTabShell insets={{ top: 200, right: 0, bottom: 34, left: 0 }}>
      <BottomSheet visible title="Filter" onDismiss={vi.fn()}>
        <span>rows</span>
      </BottomSheet>
    </UnderTheTabShell>,
  );

  // 200 + 22 (the design's own breathing room) beats the 170 offset.
  expect(lastMaxDynamicContentSize()).toBe(793 - 222);
  // The home indicator is cleared by padding — the window's 34, not the
  // layer's 0. A sheet is the window; the box it was opened from is not.
  //
  // **On the scrolling content, not on the sheet.** The clearance has to land
  // on the thing that moves: padding on the sheet itself leaves a gap the body
  // scrolls straight past, with the last row still ending at the device edge.
  const content = screen.getByTestId("bottom-sheet-content");
  expect(getComputedStyle(content).paddingBottom).toBe(`${22 + 34}px`);
});

/** §5.1's third part: the footer is outside the scroller, so it cannot leave. */
it("pins a footer under the scrolling body", () => {
  render(
    <BottomSheet visible title="Settle" onDismiss={vi.fn()} footer={<span>Settle now</span>}>
      <span>rows</span>
    </BottomSheet>,
  );

  const body = screen.getByTestId("bottom-sheet-body");
  expect(body.textContent).toContain("rows");
  expect(body.textContent).not.toContain("Settle now");
  expect(screen.getByText("Settle now")).toBeDefined();
});

/**
 * H3. On iOS the window height does not change when the keyboard opens, so
 * the sheet has to lift itself: its bottom edge — and with it the pinned
 * footer, the sheet's last child — lands on the keyboard's top edge instead
 * of a third of the way behind it.
 */
it("makes room for the lift out from under the keyboard", () => {
  keyboardHeight = 336;
  render(
    <UnderTheTabShell insets={{ top: 59, right: 0, bottom: 34, left: 0 }}>
      <BottomSheet visible title="Settle" onDismiss={vi.fn()} footer={<span>Settle now</span>}>
        <span>rows</span>
      </BottomSheet>
    </UnderTheTabShell>,
  );

  // The library does the lifting; the cap is what stops the lift pushing the
  // sheet's head off the top of the window. **Typed into, the sheet may rise
  // to the status bar** — the 170 is for a sheet being looked at.
  expect(lastMaxDynamicContentSize()).toBe(793 - (59 + 22) - 336);
  // The home indicator is behind the keyboard; clearing it there is twice.
  // With a footer it is the footer that sits at the sheet's end, so the
  // clearance is its; the body only makes room for the footer.
  const footer = screen.getByText("Settle now").parentElement as HTMLElement;
  expect(getComputedStyle(footer).paddingBottom).toBe("22px");
});

/**
 * A tap outside with the keyboard up was aimed at the keyboard, and this
 * sheet may be holding a rate someone has just typed. First press outside
 * puts the keyboard away; the second closes the sheet.
 */
it("puts the keyboard away before it puts the sheet away", () => {
  const onDismiss = vi.fn();
  keyboardHeight = 336;
  const { rerender } = render(
    <BottomSheet visible title="Settle" onDismiss={onDismiss}>
      <span>rows</span>
    </BottomSheet>,
  );

  screen.getByRole("button", { name: "Dismiss Settle" }).click();
  expect(dismissKeyboard).toHaveBeenCalledOnce();
  expect(onDismiss).not.toHaveBeenCalled();

  keyboardHeight = 0;
  rerender(
    <BottomSheet visible title="Settle" onDismiss={onDismiss}>
      <span>rows</span>
    </BottomSheet>,
  );
  screen.getByRole("button", { name: "Dismiss Settle" }).click();
  expect(onDismiss).toHaveBeenCalledOnce();
});

/**
 * The other layer that lies to an overlay, and the one that made the type
 * picker pay 112. `FloatingAddLayer` re-provides `bottom: barHeight` so the
 * circle parks on the tab bar rather than on the device; a sheet opened from
 * inside it is still the window, and still clears the device.
 */
it("ignores a layer that has re-provided the tab bar's height", () => {
  render(
    <WindowInsetsProvider insets={{ top: 59, right: 0, bottom: 34, left: 0 }}>
      <SafeAreaProvider insets={{ top: 59, right: 0, bottom: 90, left: 0 }}>
        <BottomSheet visible title="Add" onDismiss={vi.fn()}>
          <span>rows</span>
        </BottomSheet>
      </SafeAreaProvider>
    </WindowInsetsProvider>,
  );

  // 22 + the device's 34 — not 22 + the bar's 90. On the scrolling content,
  // where the clearance now rides.
  const content = screen.getByTestId("bottom-sheet-content");
  expect(getComputedStyle(content).paddingBottom).toBe("56px");
});

/**
 * **The scroller spans the sheet; the gutter rides on what it carries.**
 *
 * `paddingHorizontal` on the sheet put the body *inside* it: the scroll
 * indicator ran in a channel indented from the sheet's edge, and a focused
 * field's ring — drawn outside its own box — was clipped left and right by the
 * padding it sat in. Asserted here rather than left to a screenshot, because
 * the wrong version looks almost right until something is focused.
 */
it("puts no horizontal padding on the sheet itself", () => {
  const view = render(
    <ThemeProvider theme={light}>
      <BottomSheet visible title="Filter" onDismiss={vi.fn()} footer={<span>Apply</span>}>
        <span>Body</span>
      </BottomSheet>
    </ThemeProvider>,
  );
  const sheet = view.getByTestId("bottom-sheet");
  const body = view.getByTestId("bottom-sheet-body");
  for (const side of ["paddingLeft", "paddingRight"] as const) {
    expect(getComputedStyle(sheet)[side], `sheet ${side}`).toBe("0px");
    // The scroller itself is unpadded too — the inset is on its content.
    expect(getComputedStyle(body)[side], `body ${side}`).toBe("0px");
  }
  view.unmount();
});

/**
 * **A pinned field keeps its focus while it is typed into.** The library
 * renders the handle as a component, and a handle that was a new function per
 * render was a new component per keystroke: the search remounted and lost
 * focus after the first letter.
 */
it("keeps a pinned field mounted across the renders its typing causes", () => {
  function Typed() {
    const [query, setQuery] = useState("");
    return (
      <BottomSheet
        visible
        title="Category"
        onDismiss={vi.fn()}
        pinned={<TextInput accessibilityLabel="Search" value={query} onChangeText={setQuery} />}
      >
        <span>rows</span>
      </BottomSheet>
    );
  }
  render(<Typed />);
  const first = screen.getByLabelText("Search");
  fireEvent.change(first, { target: { value: "S" } });
  fireEvent.change(screen.getByLabelText("Search"), { target: { value: "Sn" } });
  expect(screen.getByLabelText("Search")).toBe(first);
  expect((first as HTMLInputElement).value).toBe("Sn");
});
