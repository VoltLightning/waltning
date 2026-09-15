import { useSyncExternalStore } from "react";
import type { AppLockController, AppLockSnapshot } from "../app-lock/app-lock.ts";

/** The gate's state, live — `createAppLock`'s own snapshot through `useSyncExternalStore`. */
export function useAppLock(controller: AppLockController): AppLockSnapshot {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}
