/**
 * `@gorhom/bottom-sheet` under jsdom — the layout, without the motion.
 *
 * **The same bargain the reanimated and gesture-handler stubs strike**, and for
 * the same reason `vitest.config.ts` states beside them: *component tests
 * assert what a control is, never how it moved; the motion is looked at in
 * Storybook and on the device.* The library is in `bottom-sheet.tsx` for its
 * spring, its pan-to-dismiss and its handle — none of which a jsdom assertion
 * can see — while thirty-one test files assert the things around it: that the
 * body scrolls, that the footer is pinned, that the height is bounded by the
 * window and the keyboard, that a backdrop press puts the keyboard away first.
 *
 * Standing in for it keeps every one of those assertions meaningful. The
 * alternative was teaching the shared reanimated stub the whole surface gorhom
 * touches — it dies on `makeMutable` and does not stop there — which would
 * grow a mock nothing else needs, to animate something no test can observe.
 *
 * What is *not* covered here is covered elsewhere and deliberately: the sheet's
 * real motion renders in Storybook, where `visual/stories.spec.ts` screenshots
 * it and `visual/press.spec.ts` measures a press in Chrome.
 */

import type { ReactNode } from "react";
import { ScrollView, type ScrollViewProps, View, type ViewProps } from "react-native";

type SheetProps = ViewProps & {
  children?: ReactNode;
  /** Read by the component; irrelevant to a layout assertion. */
  maxDynamicContentSize?: number;
  onClose?: () => void;
  /**
   * The library draws the header and the footer through these slots, outside
   * the scrollable — which is what makes them not scroll. A stub that ignored
   * them would drop both from the tree and every assertion about a title, a
   * Close button or a pinned footer would be asserting against nothing.
   */
  handleComponent?: () => ReactNode;
  footerComponent?: (props: { animatedFooterPosition: number }) => ReactNode;
};

/**
 * The sheet is always open here. The component only renders it when `visible`
 * is true, so an index-driven closed state would make every test assert
 * against an empty tree.
 *
 * **`maxDynamicContentSize` is applied as a real `maxHeight`, and that is the
 * point of the stub rather than a convenience.** The ceiling is the half of
 * the sheet this repository still owns — `sheetMaxHeight` reads the window,
 * the top offset and the keyboard — and three tests assert exactly that
 * arithmetic arrives. Dropping the prop on the floor would leave them
 * asserting nothing while still passing, which is worse than deleting them.
 * What the stub declines to model is the motion, not the contract.
 */
/**
 * The last ceiling handed to the library.
 *
 * **The seam, asserted directly.** `sheetMaxHeight`'s arithmetic — the window,
 * §5.1's offset, the keyboard — is the half of the sizing this repository still
 * owns, and the half worth a test. The other half is the library's, and reading
 * it back off a node the stub made up would be a test asserting its own mock.
 */
let ceilingSeen: number | undefined;

/** A function, not a binding: a destructured `let` is captured once at import. */
export function lastMaxDynamicContentSize(): number | undefined {
  return ceilingSeen;
}

export default function BottomSheet({
  children,
  style,
  maxDynamicContentSize,
  handleComponent,
  footerComponent,
}: SheetProps) {
  ceilingSeen = maxDynamicContentSize;
  const ceiling = maxDynamicContentSize === undefined ? null : { maxHeight: maxDynamicContentSize };
  // `bottom-sheet` is the box the library sizes — the sheet itself. The
  // clearance is no longer on it: it rides the scroll content container and
  // the footer, which is where the home indicator actually has to be cleared.
  return (
    <View testID="bottom-sheet-frame" style={[style, ceiling]}>
      {handleComponent?.()}
      {children}
      {/* The real one is positioned against the sheet; here it is simply last,
          which is the only part of "pinned under the body" a DOM order test
          can see. */}
      {footerComponent?.({ animatedFooterPosition: 0 })}
    </View>
  );
}

/** Props are forwarded, not picked: `testID` and `accessibilityViewIsModal` ride on this. */
export function BottomSheetView({ children, ...rest }: SheetProps) {
  return <View {...rest}>{children}</View>;
}

/** A real `ScrollView`, so `containOverscroll` and the scroll props still land. */
export function BottomSheetScrollView(props: ScrollViewProps) {
  return <ScrollView {...props} />;
}

/** The footer wrapper is pure positioning in the real library; here it is its children. */
export function BottomSheetFooter({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

export type BottomSheetFooterProps = { animatedFooterPosition: number };
