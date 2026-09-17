/**
 * The `TextInput` that knows whether it is inside a sheet.
 *
 * **`@gorhom/bottom-sheet` cannot lift a sheet for an input it has never heard
 * of.** Its keyboard handling works from a registered node:
 * `BottomSheetTextInput` writes the focused input into `animatedKeyboardState`
 * and `textInputNodesRef` on focus, and the sheet reads that to decide how far
 * to move. A plain `TextInput` registers nothing, so the sheet sits still while
 * the keyboard covers the field being typed into — which is what every sheet in
 * this app did the moment its motion became the library's.
 *
 * **A context, not `useBottomSheetInternal`.** The library's own hook throws
 * outside a sheet, so a primitive that called it would work in a sheet and
 * crash everywhere else — and `TextField`, `AmountField` and `SearchField` are
 * all used in both places. `BottomSheet` provides this instead, so the decision
 * is made by where a field is mounted rather than by catching an exception.
 *
 * **One mechanism, which is the rule this component already had.**
 * `bottom-sheet.tsx` used to carry a `KeyboardAvoidingView` and argued for it:
 * *"One mechanism on both phones is the point; two would be two things to keep
 * true."* That argument did not change when the owner did. The lift is the
 * library's now, and the `KeyboardAvoidingView` is gone rather than left to
 * fight it.
 */

import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { createContext, useContext } from "react";
import { TextInput, type TextInputProps } from "react-native";

/** True only under `BottomSheet`. Nothing else provides it. */
const InsideSheet = createContext(false);

export const SheetInputProvider = InsideSheet.Provider;

/**
 * `ref` is forwarded because `Select` measures its trigger and `SearchField`'s
 * desk rail focuses itself through one.
 */
/**
 * **`ref` reaches the plain input only, and that is a real limit rather than an
 * oversight.** The two ref types are incompatible in both directions — React
 * Native's is `Ref<TextInput>`, the library's is `Ref<TextInput | undefined>` —
 * and neither is assignable to the other, so one component cannot forward one
 * ref to both without a cast.
 *
 * Both of this repository's ref users are outside sheets: `Select` measures its
 * own trigger, and `SearchField`'s desk rail focuses itself (`S10` §7's `F`).
 * A field that needs an imperative handle *inside* a sheet would have to widen
 * this deliberately; today none does, and the assertion below is what says so
 * if that changes.
 */
export type SheetAwareTextInputProps = TextInputProps & {
  ref?: React.Ref<TextInput> | undefined;
};

export function SheetAwareTextInput({ ref, ...rest }: SheetAwareTextInputProps) {
  const insideSheet = useContext(InsideSheet);
  // **Branched, not aliased to one variable.** The two components declare
  // different ref types, so a shared `const Input = …` widens to a union
  // neither accepts. Two returns keep each one's own props.
  if (insideSheet) {
    // No `ref`: see the props type. A caller that passes one inside a sheet is
    // asking for something this cannot give, so it says so rather than
    // silently dropping it.
    if (ref !== undefined && __DEV__) {
      console.warn(
        "SheetAwareTextInput: a ref inside a BottomSheet is not forwarded — " +
          "`BottomSheetTextInput`'s ref type is not React Native's. Widen this deliberately.",
      );
    }
    return <BottomSheetTextInput {...rest} />;
  }
  return <TextInput {...rest} {...(ref === undefined ? {} : { ref })} />;
}
