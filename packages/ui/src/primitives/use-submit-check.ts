/**
 * `useSubmitCheck` — a form's submit is always pressable, and a press on a
 * form that is not ready **says why** instead of doing nothing.
 *
 * **Why the button is never disabled for validity.** A greyed Save answers
 * *can I?* and never *why not?*: the reader has to find, unprompted, which of
 * the fields above is the one the form objects to — and on a phone that is
 * often a field scrolled out of view. A pressable Save that refuses turns the
 * same state into three answers at once:
 *
 * 1. **every broken field shows its error**, from this press on — not before,
 *    because a form that opens already shouting *Required* at empty fields is
 *    scolding someone who has not started;
 * 2. **a `FormAlert` drops in at the top** of the window saying the form is
 *    not ready (`form-alert-host.tsx`);
 * 3. **the scroller brings the first broken field into view**
 *    (`field-reveal.tsx`), in the order the form lists its fields, which is
 *    the order they are drawn.
 *
 * Disabling is still right for the two states that are not the reader's to
 * fix: a save already in flight, and an edit with nothing changed.
 *
 * The errors themselves stay the form's: it computes them every render, from
 * its own state, and this hook only decides whether they are shown yet. That
 * is also why they clear as the fields are fixed — nothing here holds a copy.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useT } from "../i18n/provider";
import { useFormAlert } from "./form-alert-host";
import type { KeyboardFrame } from "./keyboard-room.ts";

/** A field's current objection, or nothing. `false` reads as nothing, for `cond && message`. */
export type FieldObjection = string | null | undefined | false;

/**
 * What a `FieldAnchor` hands back from where it is drawn: its node, and the
 * reveal and alert **of that place**. A sheet's form is often a component that
 * renders its own `BottomSheet`, so the hook runs outside the sheet and its own
 * context would name the page behind it; the anchor is inside, and knows.
 */
export type AnchorEntry = {
  node: KeyboardFrame;
  reveal: (node: KeyboardFrame) => void;
  raise: (message: string) => void;
};

export type SubmitCheck<Field extends string> = {
  /** Whether the errors are drawn yet — false until the first refused press. */
  shown: boolean;
  /** The error to hand a field: its objection once `shown`, else `undefined`. */
  errorFor: (field: Field) => string | undefined;
  /** Called by `FieldAnchor`; not for forms to call. */
  register: (field: Field, entry: AnchorEntry | null) => void;
  /** Runs `onValid` when nothing objects; otherwise shows, alerts and scrolls. */
  submit: (onValid: () => void) => void;
  /** Back to unshown — for a form instance reused across openings. */
  reset: () => void;
};

/**
 * @param objections every field's current objection, **in drawn order**, and
 * built each render from the form's own state.
 */
export function useSubmitCheck<Field extends string>(
  objections: Readonly<Record<Field, FieldObjection>>,
): SubmitCheck<Field> {
  const t = useT();
  const raiseHere = useFormAlert();
  const [shown, setShown] = useState(false);
  const anchors = useRef(new Map<Field, AnchorEntry>());
  const latest = useRef(objections);
  latest.current = objections;

  // Stable, so a caller's re-seed effect can list it without re-running.
  const reset = useCallback(() => setShown(false), []);

  const register = useCallback((field: Field, entry: AnchorEntry | null) => {
    if (entry === null) anchors.current.delete(field);
    else anchors.current.set(field, entry);
  }, []);

  const submit = useCallback(
    (onValid: () => void) => {
      const broken = (Object.keys(latest.current) as Field[]).filter((field) =>
        Boolean(latest.current[field]),
      );
      if (broken.length === 0) {
        onValid();
        return;
      }
      setShown(true);
      const first = broken[0];
      const entry = first === undefined ? undefined : anchors.current.get(first);
      // Any drawn anchor names the window the form is in; the hook's own
      // host is the fallback for a form with none drawn.
      const place = entry ?? anchors.current.values().next().value;
      (place?.raise ?? raiseHere)(t("common.formIncomplete"));
      if (entry !== undefined) entry.reveal(entry.node);
    },
    [raiseHere, t],
  );

  return useMemo(
    () => ({
      shown,
      errorFor: (field: Field) => {
        const objection = objections[field];
        return shown && typeof objection === "string" && objection !== "" ? objection : undefined;
      },
      register,
      submit,
      reset,
    }),
    [shown, objections, register, submit, reset],
  );
}
