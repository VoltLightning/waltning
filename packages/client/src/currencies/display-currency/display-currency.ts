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
 * falls back to the *live* pivot (`readPivot`), and only to the build-time
 * `seed` when no live pivot is available yet (H1 — a fresh install whose
 * ledger pivot differs from the seed must render its own pivot, not the
 * seed frozen at build time).
 *
 * **The region comes between the choice and the pivot.** With nothing chosen,
 * the currency of the device's region is the display currency when the ledger
 * holds it (`regionCurrency`, `readHeld`) — derived on every read like the
 * pivot fallback, never stored, and standing in for `initializeFromPinned`'s
 * first-pinned write, which on a seeded ledger was the pivot frozen.
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
} from "../../device/create-device-preference/create-device-preference.ts";
import type { ClientDiagnostics } from "../../diagnostics.ts";

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

export type DisplayCurrencyPreferenceOptions = {
  /**
   * M2 — the ledger's own write notifications (e.g. `phoneLedger.subscribe`),
   * composed into this preference's `subscribe` so `change_pivot` reaches a
   * mounted `useSyncExternalStore` consumer live, with no device-store write
   * to piggyback on. `undefined` before the ledger session exists — the same
   * bootstrap ordering `readPivot` already lives with (H1).
   */
  subscribeToLedger?: (listener: () => void) => () => void;
  diagnostics?: ClientDiagnostics;
  /**
   * The currency of the device's region, when the platform knows one (§7.0).
   * It is the default a ledger opens in — *after* a stored choice and
   * *before* the pivot — and only when the ledger holds it (`readHeld`), so a
   * region whose currency the ledger has never heard of falls on the pivot
   * exactly as an unknown region does.
   */
  regionCurrency?: CurrencyCode | null;
  /** A live read of the codes the ledger holds. `null` before the ledger is ready. */
  readHeld?: () => readonly CurrencyCode[] | null;
};

export function createDisplayCurrencyPreference(
  store: DevicePreferenceStore,
  /** A live read of the ledger's current pivot — `currencies.find(isPivot)` over a session snapshot. `null` before the ledger is ready. */
  readPivot: () => CurrencyCode | null,
  /** The build-time fallback, used only when `readPivot` has nothing yet. */
  seed: CurrencyCode,
  options?: DisplayCurrencyPreferenceOptions,
): DisplayCurrencyController {
  const inner = createDevicePreference<CurrencyCode>(store, codec, options?.diagnostics);

  /** The region's currency, derived live and never stored — a later pivot change or a real choice must not meet a frozen default. */
  const readRegionDefault = (): CurrencyCode | null => {
    const region = options?.regionCurrency ?? null;
    if (region === null) return null;
    return options?.readHeld?.()?.includes(region) === true ? region : null;
  };

  // See the file doc: cached so `useSyncExternalStore` sees the same
  // reference across renders where nothing actually changed. Rebuilt when
  // either the stored snapshot changes, or — while nothing is stored — the
  // live pivot's answer changes (H1: `change_pivot` must be visible on the
  // next read with no store write at all).
  let cachedInner: ReturnType<typeof inner.getSnapshot> | undefined;
  let cached: DisplayCurrencySnapshot | undefined;

  return {
    getSnapshot: () => {
      const snapshot = inner.getSnapshot();
      const currency = snapshot.value ?? readRegionDefault() ?? readPivot() ?? seed;
      if (cached !== undefined && cachedInner === snapshot && cached.currency === currency) {
        return cached;
      }
      cachedInner = snapshot;
      cached = { currency, hydrated: snapshot.hydrated };
      return cached;
    },
    // M2 — composed with the ledger's own notifications, not the device
    // store's alone: `change_pivot` writes no device preference, so a
    // subscriber that only heard the store would keep the old pivot until an
    // unrelated re-render happened to call `getSnapshot()` again.
    subscribe: (listener) => {
      const unsubscribeStore = inner.subscribe(listener);
      const unsubscribeLedger = options?.subscribeToLedger?.(listener);
      return () => {
        unsubscribeStore();
        unsubscribeLedger?.();
      };
    },
    hydrate: inner.hydrate,
    set: inner.set,
    initializeFromPinned: (pinned) => {
      if (inner.getSnapshot().value !== null) return;
      // The region's currency already answers "nothing chosen", derived live;
      // persisting the first pinned one here would freeze the default on it.
      if (readRegionDefault() !== null) return;
      const first = pinned[0];
      if (first !== undefined) void inner.set(first);
    },
  };
}

/** The controller's snapshot, as React state. */
export function useDisplayCurrency(controller: DisplayCurrencyController): DisplayCurrencySnapshot {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}
