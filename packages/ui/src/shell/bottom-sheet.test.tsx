/** @vitest-environment jsdom */
import { act, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SafeAreaProvider } from "../primitives/safe-area";

/**
 * The keyboard, injected. `react-native-web`'s `Keyboard` never fires, so
 * there is no other way to render this component in the state H3 is about —
 * and the state is the whole reason the footer is pinned.
 */
let keyboardHeight = 0;
const dismissKeyboard = vi.fn();
vi.mock("./keyboard.ts", () => ({
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
it("bounds its height against the window and scrolls its body", () => {
  render(
    <BottomSheet visible title="Filter" onDismiss={vi.fn()}>
      <span>rows</span>
    </BottomSheet>,
  );

  // §5.1's 170px top offset, measured against this window rather than guessed.
  expect(screen.getByTestId("bottom-sheet").style.maxHeight).toBe(`${793 - 170}px`);
  expect(getComputedStyle(screen.getByTestId("bottom-sheet-body")).overflowY).toBe("auto");
});

/** A status bar taller than the design's offset pushes the cap down, not up. */
it("yields to a top inset larger than the design offset", () => {
  render(
    <SafeAreaProvider insets={{ top: 200, right: 0, bottom: 34, left: 0 }}>
      <BottomSheet visible title="Filter" onDismiss={vi.fn()}>
        <span>rows</span>
      </BottomSheet>
    </SafeAreaProvider>,
  );

  const sheet = screen.getByTestId("bottom-sheet");
  // 200 + 22 (the design's own breathing room) beats the 170 offset.
  expect(sheet.style.maxHeight).toBe(`${793 - 222}px`);
  // The home indicator is cleared by padding: the sheet still reaches the edge.
  expect(sheet.style.paddingBottom).toBe(`${22 + 34}px`);
  // And exactly once — nothing inside the sheet clears it a second time.
  const content = screen.getByTestId("bottom-sheet-body").firstElementChild as HTMLElement;
  expect(getComputedStyle(content).paddingBottom).toBe("0px");
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
    <SafeAreaProvider insets={{ top: 59, right: 0, bottom: 34, left: 0 }}>
      <BottomSheet visible title="Settle" onDismiss={vi.fn()} footer={<span>Settle now</span>}>
        <span>rows</span>
      </BottomSheet>
    </SafeAreaProvider>,
  );

  const sheet = screen.getByTestId("bottom-sheet");
  // `KeyboardAvoidingView` does the lifting; the cap is what stops the lift
  // pushing the sheet's head off the top of the window.
  expect(sheet.style.maxHeight).toBe(`${793 - 170 - 336}px`);
  // The home indicator is behind the keyboard; clearing it there is twice.
  expect(sheet.style.paddingBottom).toBe("22px");
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
