import { useSyncExternalStore } from "react";
import type {
  DevicePreferenceController,
  DevicePreferenceSnapshot,
} from "./create-device-preference.ts";

/** The controller's snapshot, as React state. */
export function useDevicePreference<Value>(
  controller: DevicePreferenceController<Value>,
): DevicePreferenceSnapshot<Value> {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}
