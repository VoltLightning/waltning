/**
 * `<BottomSheet>` — `design-system/05` §5.1: *170px from top; search, content,
 * pinned footer.*
 *
 * **The sheet owns its height, and that is the whole design.** It used to be
 * a plain `View` at the bottom of the screen whose height was whatever its
 * children summed to — so a form-shaped sheet (filter, reconcile, settle,
 * rename) grew past the top of the window, its bottom edge sat flush with the
 * device edge, and everything below the fold was unreachable because nothing
 * in it scrolled. Pickers looked fine only because each brought its own
 * bounded `ScrollView`; the sheet was never the thing keeping them on screen.
 *
 * So the three parts are named here rather than left to the caller: a header
 * that does not scroll, a body, and a `footer` slot pinned under it.
 *
 * **The body scrolls and the sheet owns its height, and those are not in
 * tension — the scrollable reports its own content.**
 * `BottomSheetScrollView` calls `setContentSize` from `onContentSizeChange`
 * (`createBottomSheetScrollableComponent`), which feeds dynamic sizing the
 * height of what it *holds* rather than the height of the box. So the sheet is
 * as tall as its content up to `maxDynamicContentSize`, and past that the body
 * scrolls inside a sheet that has stopped growing.
 *
 * That only works while the scrollable is the sheet's **direct** child. Wrapped
 * in a `View` with a `maxHeight` of its own it never reports, the sheet is
 * sized from nothing, and the content spills out of the bottom of it — which is
 * the first thing this swap got wrong and what `TallForm`'s `play` function
 * caught in a real browser.
 *
 * **The bound is the window and the keyboard, not a constant.**
 * `sheet-geometry.ts` holds that arithmetic and the argument for it: the cap
 * is the window less §5.1's 170px top offset (or the device's own top inset
 * plus breathing room, whichever leaves less), *and* less whatever the soft
 * keyboard covers.
 *
 * **The sheet moves out from under the keyboard; it does not scroll.** On a
 * phone the keyboard covers the window rather than shrinking it — both
 * phones, and `keyboard.ts` has the argument for why that is as true of
 * Android as of iOS, and why `navigationBarTranslucent` below is part of the
 * reason — so a bottom-anchored sheet is simply behind it: an iOS
 * `decimal-pad` has no return key and covers about 291 of a ~340px sheet,
 * which leaves the header and 49px nobody can scroll their way out of.
 *
 * **The lift is the library's, and it needs to be told which field is
 * focused.** `@gorhom/bottom-sheet` moves the sheet from a registered node:
 * `BottomSheetTextInput` writes the focused input into `animatedKeyboardState`
 * on focus and the sheet reads it. A plain `TextInput` registers nothing, so
 * every sheet here sat still under the keyboard the moment its motion became
 * the library's — the fields were the same fields, and the thing that used to
 * move them was gone. `SheetInputProvider` below is how a field learns where
 * it is; `primitives/sheet-input.tsx` has the rest of that argument.
 *
 * The `KeyboardAvoidingView` that used to do this went with it. This
 * component's own rule has not changed — *one mechanism on both phones is the
 * point; two would be two things to keep true* — only which one it is.
 *
 * **A backdrop press with the keyboard up puts the keyboard away, not the
 * sheet.** The tap was aimed at the keyboard, and dismissing here would throw
 * away what had just been typed. First press outside closes the keyboard,
 * second closes the sheet. `keyboardShouldPersistTaps="handled"` on the body
 * is the other half of the same rule: a tap on *Save* inside the sheet lands
 * rather than being eaten by the dismissal.
 *
 * **Both Android windows are translucent.** Under edge-to-edge — mandatory
 * from Expo SDK 54 — the app window includes the system bars, but a `Modal`
 * defaults to a window *inset* by them. Left alone, this sheet would pay the
 * navigation-bar inset twice: once because the modal window already stops
 * above it, and again in its own `paddingBottom`. `statusBarTranslucent` and
 * `navigationBarTranslucent` make the modal's window the app's window, so the
 * insets this component reads are the ones it is actually sitting in. iOS and
 * the web ignore both props.
 *
 * That is also what makes the lift above Android's only keyboard mechanism:
 * an edge-to-edge dialog window ignores `SOFT_INPUT_ADJUST_RESIZE`, so the
 * resize that used to carry the sheet up for free is gone and this component
 * has to carry it. One mechanism on both phones is the point; two would be
 * two things to keep true.
 *
 * **One scroller per sheet, and it is the body.** The library hands a
 * content drag to the sheet or to *its* scrollable — never to a plain
 * `ScrollView` inside it, which on iOS took no touch at all: the three pickers
 * each nested a list capped at nine rows, and with the keyboard up the sheet
 * was shorter than that and the rest of the list could not be reached. What a
 * picker keeps in view while its list moves — a search — goes in `pinned`,
 * which is drawn with the header and never scrolls. On web the body carries
 * `overscroll-behavior: contain`, so reaching the end of it stops there
 * instead of scrolling the page behind the sheet.
 *
 * **Typed into, a sheet shows what is typed.** The lift puts the sheet above
 * the keys; `useSheetLook` then scrolls the body so the focused field is
 * above the footer, for a sheet taller than the room the keyboard left.
 *
 * **The motion is `@gorhom/bottom-sheet`'s; everything above is still ours.**
 * This used to be `animationType="none"` on the `Modal` and a `View` at the
 * bottom of it: the sheet appeared fully formed, could not be dragged, and had
 * no handle to suggest it could. What the library is here for is exactly that
 * — a spring entrance, pan-to-dismiss, and a grab handle that says the gesture
 * exists — and nothing else. The `Modal` stays, because it is what makes the
 * window translucent on Android and what names the dialog for a screen reader;
 * the backdrop stays, because its two-step keyboard rule is ours; the bounds
 * stay, because `sheetBounds` knows about the keyboard and a snap point does
 * not. `maxDynamicContentSize` is where the two meet: the library sizes the
 * sheet to its content, and our arithmetic is the ceiling it may not pass.
 */

import GorhomBottomSheet, {
  BottomSheetFooter,
  type BottomSheetFooterProps,
  BottomSheetScrollView,
  type BottomSheetScrollViewMethods,
} from "@gorhom/bottom-sheet";
import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type LayoutChangeEvent,
  Modal,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useT } from "../../../i18n/provider";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../../../tokens.ts";
import { Button } from "../../atoms/button/button";
import { dismissKeyboard, useKeyboardHeight } from "../../keyboard.ts";
import { containOverscroll } from "../../nested-scroll.ts";
import { useWindowInsets } from "../../safe-area";
import { sheetBottomInset, sheetMaxHeight } from "../../sheet-geometry.ts";
import { SheetInputProvider } from "../../sheet-input";
import { useSheetLook } from "./use-sheet-look.ts";

export type BottomSheetProps = {
  visible: boolean;
  title: string;
  onDismiss: () => void;
  /**
   * Pinned under the body — §5.1's own third part. It never scrolls away, so
   * a sheet's one commitment (Save, Settle, Apply) is reachable at any scroll
   * position and at any window height.
   */
  footer?: React.ReactNode;
  /**
   * The body rolls on its own — a drum. **The sheet is then dragged by its
   * handle and header, not by its content**: a pan anywhere on the body is how
   * the library closes a sheet, and over a wheel that gesture is the wheel's.
   * Left on, the first downward roll of a date closed the picker.
   */
  bodyRolls?: boolean;
  /**
   * Drawn under the title and above the body, and never scrolled: a picker's
   * search. The list it filters is the body, and the field stays where the
   * keyboard left it while the list moves under it.
   */
  pinned?: ReactNode;
  /**
   * **The sheet never shrinks while it is open.** For a body that is filtered
   * as it is typed into: sized to its content, a picker lost a row's height
   * per letter and its top edge — search field and all — dropped away from
   * the thumb that was typing. Held at the tallest it has been, the list
   * narrows inside a sheet that stays put.
   */
  steady?: boolean;
  children: React.ReactNode;
};

export function BottomSheet({
  visible,
  title,
  onDismiss,
  footer,
  bodyRolls = false,
  pinned,
  steady = false,
  children,
}: BottomSheetProps) {
  const t = useT();
  const [backdropFocused, setBackdropFocused] = useState(false);
  const styles = useStyles();
  // **The window's insets, not the layer's.** A sheet is a `Modal` — it covers
  // the whole window and the box it was opened from is irrelevant to it. Read
  // through `useSafeArea` it inherited whatever the nearest layer had
  // re-provided: a zeroed bottom under the tab shell (which is right for the
  // page, whose bottom edge is the tab bar) and the tab bar's whole height
  // inside the floating button's own layer.
  const insets = useWindowInsets();
  const frame = useWindowDimensions();
  const keyboard = useKeyboardHeight();
  const handleRef = useRef<View>(null);
  const footerRef = useRef<View>(null);
  const contentRef = useRef<View>(null);
  const scrollerRef = useRef<BottomSheetScrollViewMethods>(null);
  const bodyHeight = useRef(0);
  const viewport = useMemo(
    () => ({
      handle: handleRef,
      footer: footerRef,
      content: contentRef,
      bodyHeight,
      scroller: scrollerRef,
    }),
    [],
  );
  useSheetLook(keyboard, viewport);
  const measureBody = useCallback((event: LayoutChangeEvent) => {
    bodyHeight.current = event.nativeEvent.layout.height;
  }, []);
  // **The footer floats over the body, so the body makes room for it.** The
  // library pins the footer on top of the content rather than under it, and
  // without this the last rows of a list sat behind *Create account* at the
  // end of the scroll.
  const [footerHeight, setFooterHeight] = useState(0);
  const measureFooter = useCallback(
    (event: LayoutChangeEvent) => setFooterHeight(event.nativeEvent.layout.height),
    [],
  );
  /*
    **`steady`'s floor is the whole sheet, not the body.** A picker that hides
    its filter chips while it is searched loses the pinned row's height from
    the handle, and holding only the body let the sheet drop by exactly that.
    So the tallest *handle plus content* is remembered, and the body is given
    whatever of it the handle no longer takes. The content is measured on its
    own box, not the scroller's content size, which already includes the floor.
  */
  const [handleHeight, setHandleHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [tallest, setTallest] = useState(0);
  const measureHandle = useCallback(
    (event: LayoutChangeEvent) => setHandleHeight(event.nativeEvent.layout.height),
    [],
  );
  const measureContent = useCallback(
    (event: LayoutChangeEvent) => setContentHeight(event.nativeEvent.layout.height),
    [],
  );
  useEffect(() => {
    if (!visible) {
      setTallest(0);
      return;
    }
    if (handleHeight <= 0 || contentHeight <= 0) return;
    const whole = handleHeight + contentHeight;
    setTallest((was) => (whole > was ? whole : was));
  }, [visible, handleHeight, contentHeight]);
  const holdHeight = useMemo(
    () => (steady && tallest > handleHeight ? { minHeight: tallest - handleHeight } : null),
    [steady, tallest, handleHeight],
  );
  const handleFocus = useCallback(() => setBackdropFocused(true), []);
  const handleBlur = useCallback(() => setBackdropFocused(false), []);

  // The keyboard first, the sheet second — see the header.
  const handleBackdropPress = useCallback(() => {
    if (keyboard > 0) {
      dismissKeyboard();
      return;
    }
    onDismiss();
  }, [keyboard, onDismiss]);

  // Per-window, per-device and per-keyboard, so not in `useStyles` — that
  // cache is keyed on the theme alone and would hand the second device the
  // first one's window.
  const maxHeight = sheetMaxHeight(frame, insets, keyboard);
  // Memoised because two `useCallback`s depend on it, and a fresh object per
  // render would rebuild the handle and the footer on every one.
  const clearBottom = useMemo(
    () => ({ paddingBottom: sheetBottomInset(insets, keyboard) }),
    [insets, keyboard],
  );

  /**
   * **The header rides the handle, so it does not scroll.** The three parts
   * are still the three parts — what changed is which slot each sits in:
   * `handleComponent` is drawn above the scrollable and outside it, which is
   * exactly "a header that does not scroll", and it is also where the grab
   * indicator belongs, so the two are one element rather than two competing
   * for the same 20 points.
   */
  const underFooter = useMemo(
    () => (footer === undefined ? null : { paddingBottom: footerHeight + space.x4 }),
    [footer, footerHeight],
  );

  const parts = useMemo<SheetParts>(
    () => ({
      title,
      onDismiss,
      pinned,
      footer,
      clearBottom,
      handleRef,
      footerRef,
      measureFooter,
      measureHandle,
    }),
    [title, onDismiss, pinned, footer, clearBottom, measureFooter, measureHandle],
  );

  if (!visible) return null;
  return (
    // **The name goes on the `Modal`, not on the sheet inside it.**
    // `react-native-web` renders a modal as a `dialog` and spreads the props
    // it was given onto that element, so this is the only placement that
    // names the dialog a screen reader announces; on the sheet `View` two
    // levels in, the label named a generic `div` and the dialog stayed
    // anonymous. React Native's own `Modal` enumerates its props and takes no
    // accessible name, so on a phone the sheet's own visible title is what is
    // read — which is why `accessibilityViewIsModal` stays where it is.
    <Modal
      accessibilityLabel={title}
      transparent
      visible
      onRequestClose={onDismiss}
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
    >
      {/*
        **A gesture root of its own, because an Android `Modal` is a separate
        native window.** The app's `GestureHandlerRootView` does not reach into
        it, so every gesture the library registers in here — the pan that drags
        a sheet down to close it — was never delivered: on Android no sheet in
        the app could be swiped away, only closed by its button or its backdrop.
        iOS presents a modal inside the same window and never needed this.
      */}
      <GestureHandlerRootView style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.dismissSheet", { title })}
          onPress={handleBackdropPress}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={[styles.backdrop, backdropFocused ? styles.backdropFocused : null]}
        />
        <View style={styles.lift}>
          {/*
            `enableDynamicSizing` is the library's name for what this component
            already promised — the sheet owns its height — and
            `maxDynamicContentSize` is `sheetBounds`' ceiling handed to it, so
            the keyboard still bounds the sheet rather than a fixed snap point.
            `onClose` fires when the pan gesture finishes the dismissal, which
            is the one thing the caller's `visible` cannot know on its own.
          */}
          <SheetInputProvider value>
            <SheetPartsContext.Provider value={parts}>
              <GorhomBottomSheet
                enableDynamicSizing
                maxDynamicContentSize={maxHeight}
                enablePanDownToClose
                enableContentPanningGesture={!bodyRolls}
                // Said, not defaulted: the sheet rides above the keys at the
                // height it had, and goes back down when they go.
                // **Vertical is the sheet's; sideways is not.** Without these the
                // sheet's pan took any drag, and a chip row inside it — the
                // category groups — could not be scrolled along on iOS.
                activeOffsetY={PAN_ACTIVE_Y}
                failOffsetX={PAN_FAIL_X}
                keyboardBehavior="interactive"
                keyboardBlurBehavior="restore"
                onClose={onDismiss}
                backgroundStyle={styles.sheetBackground}
                style={styles.sheetShadow}
                handleComponent={SheetHandle}
                {...(footer === undefined ? {} : { footerComponent: SheetFooter })}
              >
                {/* A direct child, deliberately — see the header. */}
                <BottomSheetScrollView
                  ref={scrollerRef}
                  testID="bottom-sheet-body"
                  style={containOverscroll}
                  contentContainerStyle={holdHeight}
                  onLayout={measureBody}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {/*
                  One box around the content, so a focused field can be asked
                  whether it is in here and the content's top can be measured —
                  and `collapsable={false}`, because Android flattens a view
                  that only wraps and it would measure as its parent.
                */}
                  <View
                    ref={contentRef}
                    testID="bottom-sheet-content"
                    collapsable={false}
                    onLayout={measureContent}
                    style={[styles.bodyContent, clearBottom, underFooter]}
                  >
                    {children}
                  </View>
                </BottomSheetScrollView>
              </GorhomBottomSheet>
            </SheetPartsContext.Provider>
          </SheetInputProvider>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

/**
 * What the handle and the footer draw, handed down rather than closed over.
 *
 * **The library renders them as components, so they must stay the same
 * components.** Given a function that closed over this render's title and
 * `pinned`, it got a new function per render — a new component type to React
 * — and remounted the handle on every keystroke: a pinned search field lost
 * its focus after the first letter.
 */
type SheetParts = {
  title: string;
  onDismiss: () => void;
  pinned: ReactNode;
  footer: ReactNode;
  clearBottom: { paddingBottom: number };
  handleRef: RefObject<View | null>;
  footerRef: RefObject<View | null>;
  measureFooter: (event: LayoutChangeEvent) => void;
  measureHandle: (event: LayoutChangeEvent) => void;
};

const SheetPartsContext = createContext<SheetParts | null>(null);

/** The grab, the title, *Close*, and whatever is pinned under them. */
function SheetHandle() {
  const parts = useContext(SheetPartsContext);
  const styles = useStyles();
  const t = useT();
  if (parts === null) return null;
  return (
    <View
      ref={parts.handleRef}
      onLayout={parts.measureHandle}
      testID="bottom-sheet"
      accessibilityViewIsModal
      style={styles.handleArea}
    >
      <View style={styles.handleIndicator} />
      <View style={styles.header}>
        <Text style={styles.title}>{parts.title}</Text>
        <Button label={t("common.close")} onPress={parts.onDismiss} variant="ghost" />
      </View>
      {parts.pinned === undefined ? null : <View style={styles.pinned}>{parts.pinned}</View>}
    </View>
  );
}

/**
 * `BottomSheetFooter` is the library's own pinning — it keeps the slot above
 * the keyboard and outside the scroll.
 */
function SheetFooter(props: BottomSheetFooterProps) {
  const parts = useContext(SheetPartsContext);
  const styles = useStyles();
  if (parts === null) return null;
  return (
    <BottomSheetFooter {...props}>
      <View
        ref={parts.footerRef}
        onLayout={parts.measureFooter}
        style={[styles.footer, parts.clearBottom]}
      >
        {parts.footer}
      </View>
    </BottomSheetFooter>
  );
}

/** A drag moves the sheet once it has gone this far up or down… */
const PAN_ACTIVE_Y: [number, number] = [-8, 8];
/** …and never once it has gone this far sideways first. */
const PAN_FAIL_X: [number, number] = [-8, 8];

const useStyles = makeStyles((theme) => ({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    minHeight: touchTarget.min,
    backgroundColor: theme.scrim,
    opacity: 0.5,
  },
  backdropFocused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  /**
   * **The surface is the library's now, and the three parts are still ours.**
   * `backgroundStyle` paints the rounded card and `handleIndicatorStyle` the
   * grab handle, so this component no longer draws its own top radius or the
   * `paddingTop` that used to stand in for a handle. What stays here is the
   * inside: header, body and footer, and the gap between them.
   */
  sheetBackground: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: theme.elevation.raised.borderWidth,
    borderColor: theme.elevation.raised.borderColor,
  },
  /** The shadow rides the outer element, where it is not clipped by the radius. */
  sheetShadow: {
    shadowColor: theme.elevation.raised.shadowColor,
    shadowOpacity: theme.elevation.raised.shadowOpacity,
    shadowRadius: theme.elevation.raised.shadowRadius,
    shadowOffset: theme.elevation.raised.shadowOffset,
  },
  /** The grab indicator, drawn inside the handle area with the header. */
  handleIndicator: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: theme.borderInteractive,
  },
  handleArea: { paddingTop: space.md, gap: space.x4 },
  /**
   * Where the body's first child used to stand: straight under the header,
   * which is a 44pt row — so the handle's gap is taken back above, and the
   * body's own gap is given below, between the search and what it filters.
   */
  pinned: { paddingHorizontal: space.x5, marginTop: -space.x4, paddingBottom: space.x4 },
  /**
   * **The lift fills the overlay, because the library positions inside it.**
   * `@gorhom/bottom-sheet` lays itself out absolutely against its parent —
   * `top: 0; bottom: 0` — so a parent that only shrink-wraps its child gives it
   * a zero box and the sheet renders offscreen. `flex: 1` hands it the window,
   * and the sheet anchors itself to the bottom of that.
   */
  lift: { flex: 1 },
  sheetInner: { flexShrink: 1, gap: space.x4 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: space.x5,
  },
  title: { color: theme.text, ...text.ui("displayThree") },
  /**
   * The one part that gives way — header and footer keep their own height.
   *
   * **The gutter is on the content, not on the sheet.** It used to be
   * `paddingHorizontal` on `sheet`, which put this scroller *inside* the
   * padding: the scroll indicator rode in a channel indented from the sheet's
   * own edge, and a focused field's ring — drawn 4px outside its box — was
   * clipped left and right by the padding it was sitting in. Same defect the
   * screens had, same fix as `shell/ground-inset.ts`: the scroller spans the
   * sheet, the inset rides on what it carries. The indicator is hidden
   * besides; the sheet's own height already says there is more.
   */
  body: { flexShrink: 1 },
  /** The gap the sheet used to apply to every child directly, and the gutter. */
  bodyContent: { gap: space.x4, paddingHorizontal: space.x5 },
  /**
   * **Drawn on the sheet's own surface, with a rule above it.** It floats over
   * the body, so a transparent one laid its button on top of whatever row had
   * scrolled under it.
   */
  footer: {
    gap: space.md,
    paddingHorizontal: space.x5,
    paddingTop: space.x3,
    backgroundColor: theme.surface,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
}));
