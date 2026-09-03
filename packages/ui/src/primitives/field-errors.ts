/**
 * `FieldErrorMap` — a form's own copy of the shape `packages/client`'s
 * `mapFieldErrors` produces.
 *
 * **`client` and `ui` are siblings; neither imports the other**
 * (`architecture/11` §2). The screen that owns both — it is the only layer
 * that may — calls the controller, resolves any `messageKey` through
 * `useT()`, and calls `mapFieldErrors` itself; what reaches a form here is
 * always plain text. This type exists so a form can declare that prop
 * without a cross-package import, the same way `quick-add-form.tsx`
 * declares its own `QuickAddAccount` instead of importing the controller's
 * `PhoneCapturableAccount`.
 */
export type FieldErrorMap = {
  byField: Readonly<Record<string, readonly string[]>>;
  formLevel: readonly string[];
};
