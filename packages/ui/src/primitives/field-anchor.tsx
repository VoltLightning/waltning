/**
 * `<FieldAnchor>` — the box a `useSubmitCheck` scrolls to, drawn around a
 * field.
 *
 * **A component rather than a ref, because it reads where it is.** The scroll
 * and the alert belong to the window the field is drawn in, and a form that
 * renders its own `BottomSheet` calls its hook *outside* that sheet. This sits
 * inside, so its `useFieldReveal` and `useFormAlert` are the sheet's.
 *
 * `collapsable={false}`: a view that only wraps is flattened out of Android's
 * native tree and would measure as its parent.
 */

import { type ReactNode, useCallback } from "react";
import { type StyleProp, View, type ViewStyle } from "react-native";
import { useFieldReveal } from "./field-reveal";
import { useFormAlert } from "./form-alert-host";
import type { SubmitCheck } from "./use-submit-check.ts";

export type FieldAnchorProps<Field extends string> = {
  check: SubmitCheck<Field>;
  field: Field;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

export function FieldAnchor<Field extends string>({
  check,
  field,
  style,
  children,
}: FieldAnchorProps<Field>) {
  const reveal = useFieldReveal();
  const raise = useFormAlert();
  const { register } = check;
  const ref = useCallback(
    (node: View | null) => {
      register(field, node === null ? null : { node, reveal, raise });
    },
    [register, field, reveal, raise],
  );
  return (
    <View ref={ref} collapsable={false} style={style}>
      {children}
    </View>
  );
}
