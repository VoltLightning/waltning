import { useSyncExternalStore } from "react";
import type { AppearanceController, AppearanceSnapshot } from "./create-appearance.ts";

export type ResolvedAppearance = AppearanceSnapshot & {
  theme: "light" | "dark";
};

export function useAppearance(
  controller: AppearanceController,
  systemScheme: "light" | "dark" | null | undefined,
): ResolvedAppearance {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const theme =
    snapshot.preference === "system"
      ? systemScheme === "dark"
        ? "dark"
        : "light"
      : snapshot.preference;

  return { ...snapshot, theme };
}
