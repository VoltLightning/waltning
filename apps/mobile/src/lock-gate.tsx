/**
 * `<LockGate>` — §5.7's launch gate, composed: the platform's lock controller
 * (`platform.ts`'s `appLock`) read through `useAppLock`, and `LockedScreen`
 * drawn where the state says.
 *
 * **Three things it draws, by state.** While enrolment is being read,
 * nothing but the blank — the same first frame the fonts get. Locked before
 * the first unlock: `LockedScreen` *instead of* the children, so the ledger's
 * tree is not on the page at all. Unlocked, or locked again after the first
 * unlock: the children, with `LockedScreen` over them as an opaque layer
 * while locked or covered — the tree stays mounted so a return from the
 * calculator does not lose the screen the reader was on.
 *
 * **The layer is a `Modal`, not a sibling `View`.** Every sheet in the app
 * (`BottomSheet`, `ConfirmDialog`, `Select`) is a `Modal` too, and a `Modal`
 * is its own window: no `View` in the tree can be drawn over it, and hiding
 * the tree from assistive technology does not reach into it. A filter sheet
 * left open when the phone went into a pocket would have stood over the
 * cover, account names and all. A `Modal` presented later sits over one
 * presented earlier on all three targets, and the lock is always the later
 * one — a sheet cannot open while the tree under the lock takes no touches.
 *
 * **The prompt is raised by the gate, once per lock.** A person opening the
 * app should meet Face ID, not a button asking them to ask for it; the
 * button is for after a cancel. `prompted` remembers which lock the prompt
 * was raised for, so a re-render does not raise a second one.
 *
 * In `apps/mobile/src` because it composes `packages/client` and
 * `packages/ui`, which may not import each other (`architecture/11`).
 */

import type { AppLockController } from "@waltning/client/security/app-lock";
import { useAppLock } from "@waltning/client/security/use-app-lock";
import { useT } from "@waltning/ui/i18n/provider";
import { LockedScreen } from "@waltning/ui/states/locked-screen";
import { makeStyles } from "@waltning/ui/theme/styles";
import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { Modal, View } from "react-native";

export type LockGateProps = { lock: AppLockController; children: ReactNode };

export function LockGate({ lock, children }: LockGateProps) {
  const t = useT();
  const styles = useStyles();
  const state = useAppLock(lock);

  useEffect(() => {
    void lock.start();
    return () => lock.dispose();
  }, [lock]);

  const unlock = useCallback(
    () => void lock.unlock({ message: t("lock.prompt"), cancel: t("common.cancel") }),
    [lock, t],
  );

  // One prompt per lock: a lock is a transition into `locked`, and the flag
  // is cleared on the way out of it.
  const prompted = useRef(false);
  useEffect(() => {
    if (state.status !== "locked") {
      prompted.current = false;
      return;
    }
    if (prompted.current || state.prompting) return;
    prompted.current = true;
    unlock();
  }, [state, unlock]);

  if (state.status === "checking") return <View style={styles.blank} />;
  if (state.status === "open") return <>{children}</>;
  if (state.status === "locked" && !state.opened) {
    return (
      <LockedScreen
        mode="locked"
        onUnlock={unlock}
        prompting={state.prompting}
        failure={state.failure}
      />
    );
  }
  const hidden = state.status === "locked" || state.covered;
  return (
    <View style={styles.root}>
      {/* Under the layer the tree is out of reach as well as out of sight:
          no touches, and nothing for a screen reader to walk — a locked
          ledger read aloud is not locked. All three platforms' spellings,
          `BrandIcon`'s own rule. */}
      <View
        style={styles.root}
        pointerEvents={hidden ? "none" : "auto"}
        accessibilityElementsHidden={hidden}
        importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
        aria-hidden={hidden}
      >
        {children}
      </View>
      <Modal
        visible={hidden}
        animationType="none"
        presentationStyle="fullScreen"
        statusBarTranslucent
        navigationBarTranslucent
        // Android's back button must not dismiss the lock.
        onRequestClose={noop}
      >
        {state.status === "locked" ? (
          <LockedScreen
            mode="locked"
            onUnlock={unlock}
            prompting={state.prompting}
            failure={state.failure}
          />
        ) : (
          <LockedScreen mode="cover" />
        )}
      </Modal>
    </View>
  );
}

function noop() {}

const useStyles = makeStyles((theme) => ({
  blank: { flex: 1, backgroundColor: theme.ground },
  root: { flex: 1 },
}));
