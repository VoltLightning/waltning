/**
 * `<StartupFailed>` — the layout's own composition when `startPhoneLedger`
 * failed, so `_layout.tsx` shows this instead of crashing on expo-router's
 * own `ErrorBoundary` (`architecture/14` §14.6).
 *
 * **In `packages/ui`, not the app — it composes only already platform-neutral
 * pieces.** `GroundPanel` and `ErrorState` (`design-system/08` §8.2) are both
 * cross-platform on their own; nothing here reads a platform, so nothing
 * about it is `apps/mobile`'s to own. `_layout.tsx` imports it exactly the
 * way it imports every other composed piece of the shell.
 *
 * **Two failures, and they are not the same claim.** A migration that refused
 * a file will refuse it again, so there is nothing to offer but the sentence
 * the migrator wrote: `terminal`, no action, the shape this screen has always
 * had. But the browser's SQLite worker holds its files for one document at a
 * time, so a page loaded seconds after the last one can find the pool still
 * held — a failure about a *moment*, which the very next attempt usually
 * clears. That one is `recoverable`, and it carries `onRetry`.
 *
 * `onRetry` optional rather than a `variant` prop: the caller does not choose
 * a colour, it says whether it has something to run — and having something to
 * run is what "recoverable" means. A caller with no retry cannot accidentally
 * claim one.
 *
 * **Centred, not top-aligned.** A `GroundPanel` page starts its content at
 * the top by default, which is right for a form and wrong for the one thing
 * on this screen — `flexGrow: 1` on the wrapping `View` (never `flex: 1`,
 * which would also set `flexBasis: 0` and reintroduce the bug `card.tsx`'s
 * own H1 fix removed) lets it fill the panel and centre within it when the
 * content is shorter than the device, without breaking the scroll on one
 * that is not.
 */

import { View } from "react-native";
import { useT } from "../i18n/provider";
import { GroundPanel } from "../shell/card";
import { makeStyles } from "../theme/styles.ts";
import { ErrorState } from "./error-state";

export type StartupFailedProps = {
  error: Error;
  /** Present only when another attempt could succeed — see the header. */
  onRetry?: (() => void) | undefined;
};

export function StartupFailed({ error, onRetry }: StartupFailedProps) {
  const t = useT();
  const styles = useStyles();

  // The two claims, built as whole prop sets rather than independent
  // ternaries: `variant` and `action` are one decision, and under
  // `exactOptionalPropertyTypes` an absent prop is absent rather than
  // `undefined` — which is also what the type says.
  //
  // **No `cost` line, on either branch.** `<ErrorState>`'s `cost` is a claim
  // about what this failure took from you, and nothing here knows: a
  // pre-journal rebuild deletes both stores *before* it can fail, so a
  // constant "nothing was lost" would be false on exactly the path most
  // worth being honest about. A sentence that cannot be true on every branch
  // that renders it does not belong in a constant.
  const claim = onRetry
    ? ({
        variant: "recoverable",
        action: { label: t("common.retry"), onPress: onRetry },
      } as const)
    : ({ variant: "terminal" } as const);

  return (
    <GroundPanel>
      <View style={styles.center}>
        {/* The migrator's own sentence is written for a person, so it is shown
            verbatim rather than replaced with a generic one. */}
        <ErrorState
          what={t("startup.ledgerFailedTitle")}
          why={t("startup.ledgerFailedBody", { message: error.message })}
          {...claim}
        />
      </View>
    </GroundPanel>
  );
}

const useStyles = makeStyles(() => ({
  center: { flexGrow: 1, justifyContent: "center" },
}));
