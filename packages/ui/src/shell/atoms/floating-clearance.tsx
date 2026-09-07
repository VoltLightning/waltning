/**
 * How much room a page has to leave under its last row for the floating add
 * button — asked of the shell, never assumed by the page.
 *
 * **The question a page cannot answer.** `GroundPanel`'s `clearBottom` says
 * *"this panel is the screen's own bottom edge"*, and that was read for a
 * while as *"a button floats over it"*. They are different facts: the button
 * is mounted once, inside `TabsShell`, so it exists over the four tab roots
 * and over nothing else. Every route the stack pushes over the tabs — create
 * account, edit account, the transaction detail, the category list, quick add
 * — is a bottom edge with no button anywhere near it, and so is
 * `StartupFailed`, which renders before there is a tab shell at all. Padding
 * those by 72px is 72px of dead ground under a screen that never needed it.
 *
 * So the clearance travels down from the one component that knows: the phone
 * branch of `TabsShell` provides it, and the default outside that provider is
 * **zero**. A page under no button asks and is told nothing, which is the
 * honest answer and also the one that needs no opt-out.
 *
 * **Zero at desk width too**, and for the same reason rather than a second
 * one: `02-tokens` §2.10 says there is no floating add button at desk width,
 * so the desk branch simply never provides.
 *
 * **A number, not a boolean.** A screen that owns its own virtualized list
 * (`GroundPanel scroll="own"`) has to put the clearance on the list's own
 * `contentContainerStyle` — padding the panel would only shorten the list and
 * leave a band of empty ground with the last row still under the circle at the
 * end of the scroll. Handing down the value lets that screen add it where it
 * actually belongs, instead of re-deriving `floating.size + floating.inset`
 * next to a comment hoping the two stay equal.
 */

import { createContext, useContext } from "react";

/** Zero: no provider means no button, which is true everywhere but the tab shell. */
const FloatingClearanceContext = createContext(0);

export type FloatingClearanceProviderProps = {
  /** Usually `floating.clearance`; `0` is legal and means "no button here". */
  value: number;
  children: React.ReactNode;
};

export function FloatingClearanceProvider({ value, children }: FloatingClearanceProviderProps) {
  return (
    <FloatingClearanceContext.Provider value={value}>{children}</FloatingClearanceContext.Provider>
  );
}

/**
 * The room the floating button needs over this page, in points. `0` where no
 * button floats — never `undefined`, so no call site needs a null check and
 * none can forget one (`safe-area.tsx` sets the same precedent).
 */
export function useFloatingClearance(): number {
  return useContext(FloatingClearanceContext);
}
