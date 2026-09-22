/**
 * `<FormAlertHost>` — where a refused submit's `FormAlert` is drawn, and
 * `useFormAlert` to raise it.
 *
 * **One host per window, and a sheet is a window.** `BottomSheet` is a
 * `Modal`, so an alert raised by a form inside one and drawn by the app's
 * host would be behind the very sheet it is about — `design-system/04` §4.8's
 * own reason a refusal inside `RateEditor` is stated in the sheet. So the root
 * layout hosts one and `BottomSheet` hosts its own, and a form reaches
 * whichever is nearest without knowing which.
 *
 * **Outside any host, raising does nothing** — a render test, a story, a diff
 * preview. The field errors still show; only the toast is missing, and a throw
 * there would buy nothing.
 */

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { FormAlert } from "./molecules/form-alert/form-alert";

/** Long enough to read a sentence, short enough to be gone before the next tap matters. */
export const FORM_ALERT_MS = 3_500;

type Raise = (message: string) => void;

function nothing(): void {}

const RaiseContext = createContext<Raise>(nothing);

export function useFormAlert(): Raise {
  return useContext(RaiseContext);
}

export function FormAlertHost({ children }: { children: ReactNode }) {
  const [alert, setAlert] = useState<{ message: string; token: number } | null>(null);
  const raise = useCallback((message: string) => {
    setAlert((previous) => ({ message, token: (previous?.token ?? 0) + 1 }));
  }, []);

  // A fresh raise restarts the window: the timer is keyed on the token.
  useEffect(() => {
    if (alert === null) return;
    const timer = setTimeout(() => setAlert(null), FORM_ALERT_MS);
    return () => clearTimeout(timer);
  }, [alert]);

  return (
    <RaiseContext.Provider value={raise}>
      {children}
      {/* Absolute, so it lands on the window's top edge of whatever holds the host. */}
      {alert === null ? null : <FormAlert message={alert.message} token={alert.token} />}
    </RaiseContext.Provider>
  );
}
