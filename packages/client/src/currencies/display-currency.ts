/**
 * The header's display-currency toggle — §7.0: *"A user preference. What
 * totals are rendered in… Freely, instantly, as often as you like. No
 * backfill, no confirmation, no audit entry — nothing in the database
 * moves."* A device preference (`createDevicePreference`), never a registry
 * write: nothing here is an operation, an outbox entry, or a thing the
 * server ever hears about.
 *
 * **Never `null` to a caller.** §7.0 names a default — "the first pinned
 * currency, else the pivot" — precisely so a screen never has to render
 * *no* display currency while deciding. `initializeFromPinned` applies that
 * default exactly once, the first time a screen learns which currencies are
 * pinned; until then, and whenever nothing has been chosen, the snapshot
 * falls back to the pivot outright.
 *
 * **`getSnapshot` returns a cached object, not a fresh one every call.**
 * `useSyncExternalStore` compares what it returns by reference — a snapshot
 * that is a new `{ currency, hydrated }` literal on every call reads as
 * "changed" on every render, which re-renders, which calls `getSnapshot`
 * again, without end. The cache below is keyed on `inner.getSnapshot()`'s own
 * reference — stable except across a real `publish()` — so this only builds
 * a new object when the device preference actually changed.
 */

import { type CurrencyCode, currencyCode } from "@waltning/core/money";
import { useSyncExternalStore } from "react";
import {
  createDevicePreference,
  type DevicePreferenceStore,
} from "../device/create-device-preference.ts";
import type { ClientDiagnostics } from "../diagnostics.ts";

export type DisplayCurrencySnapshot = {
  /** Never `null` — falls back to the pivot until something is chosen. */
  currency: CurrencyCode;
  hydrated: boolean;
};

export type DisplayCurrencyController = {
  getSnapshot: () => DisplayCurrencySnapshot;
  subscribe: (listener: () => void) => () => void;
  hydrate: () => Promise<void>;
  set: (currency: CurrencyCode) => Promise<void>;
  /**
   * §7.0's default, applied once: the first pinned currency, when nothing
   * has been chosen yet. A no-op once a value exists (chosen by a person,
   * or by an earlier call to this) — never overrides a real choice, hydrated
   * or not.
   */
  initializeFromPinned: (pinned: readonly CurrencyCode[]) => void;
};

const ISO_SHAPE = /^[A-Z]{3}$/;

const codec = {
  parse: (raw: string): CurrencyCode | null => (ISO_SHAPE.test(raw) ? currencyCode(raw) : null),
  serialize: (value: CurrencyCode): string => value,
};

export function createDisplayCurrencyPreference(
  store: DevicePreferenceStore,
  pivot: CurrencyCode,
  diagnostics?: ClientDiagnostics,
): DisplayCurrencyController {
  const inner = createDevicePreference<CurrencyCode>(store, codec, diagnostics);

  // See the file doc: cached so `useSyncExternalStore` sees the same
  // reference across renders where nothing actually changed.
  let cachedInner: ReturnType<typeof inner.getSnapshot> | undefined;
  let cached: DisplayCurrencySnapshot | undefined;

  return {
    getSnapshot: () => {
      const snapshot = inner.getSnapshot();
      if (cached !== undefined && cachedInner === snapshot) return cached;
      cachedInner = snapshot;
      cached = { currency: snapshot.value ?? pivot, hydrated: snapshot.hydrated };
      return cached;
    },
    subscribe: inner.subscribe,
    hydrate: inner.hydrate,
    set: inner.set,
    initializeFromPinned: (pinned) => {
      if (inner.getSnapshot().value !== null) return;
      const first = pinned[0];
      if (first !== undefined) void inner.set(first);
    },
  };
}

/** The controller's snapshot, as React state. */
export function useDisplayCurrency(controller: DisplayCurrencyController): DisplayCurrencySnapshot {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}
