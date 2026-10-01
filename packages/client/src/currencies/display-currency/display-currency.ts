/**
 * The header's display-currency toggle — §7.0: *"A user preference. What
 * totals are rendered in… Freely, instantly, as often as you like. No
 * backfill, no confirmation, no audit entry — nothing in the database
 * moves."* A device preference (`createDevicePreference`), never a registry
 * write: nothing here is an operation, an outbox entry, or a thing the
 * server ever hears about.
 *
 * **Never `null` to a caller, and only a person's choice is ever stored.**
 * With nothing chosen the display currency is derived, live, on every read:
 * the currency of the device's region when the ledger holds it (`regionCurrency`,
 * `readHeld`), else the live pivot (`readPivot`), and only to the build-time
 * `seed` when no live pivot is available yet (H1 — a fresh install whose
 * ledger pivot differs from the seed must render its own pivot, not the
 * seed frozen at build time). Nothing here ever writes a default: a stored
 * copy would freeze on whatever the region or the pivot was at first launch.
 *
 * **A stored value carries its origin** (`choice:EUR`). An older build wrote
 * the pivot, unmarked, on its own at first start; an unmarked value equal to
 * the live pivot is that write, not a choice, and reads as nothing chosen.
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
};

const ISO_SHAPE = /^[A-Z]{3}$/;

/**
 * A stored value carries its **origin**: `choice:EUR` is a person's pick. A bare
 * `EUR` is what an older build wrote on its own at first start (the first
 * pinned currency — the pivot, on a seeded ledger), indistinguishable from a
 * choice except by this marker. `parse` reads both; `serialize` always writes
 * the marked form.
 */
const CHOICE = "choice:";
const codec = {
  parse: (raw: string): CurrencyCode | null => {
    const code = raw.startsWith(CHOICE) ? raw.slice(CHOICE.length) : raw;
    return ISO_SHAPE.test(code) ? currencyCode(code) : null;
  },
  serialize: (value: CurrencyCode): string => `${CHOICE}${value}`,
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
  /**
   * Whether what was read off the disk is an unmarked value — written by an
   * older build, not chosen. Cleared by the first real `set`.
   */
  let unmarked = false;
  const inner = createDevicePreference<CurrencyCode>(
    {
      get: async () => {
        const raw = await store.get();
        unmarked = raw !== null && !raw.startsWith(CHOICE);
        return raw;
      },
      set: store.set,
    },
    codec,
    options?.diagnostics,
  );
  /**
   * The stored choice — except an **unmarked value equal to the live pivot or
   * to the build's seed**, which is the old build's own auto-write of the pivot
   * (the seed, on an install since anchored to its region) and so no choice at
   * all. An unmarked value that is *not* the pivot was picked in the toggle
   * and stands.
   */
  const readChoice = (): CurrencyCode | null => {
    const value = inner.getSnapshot().value;
    if (value === null) return null;
    return unmarked && (value === readPivot() || value === seed) ? null : value;
  };

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
      const currency = readChoice() ?? readRegionDefault() ?? readPivot() ?? seed;
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
    set: (currency) => {
      unmarked = false;
      return inner.set(currency);
    },
  };
}

/** The controller's snapshot, as React state. */
export function useDisplayCurrency(controller: DisplayCurrencyController): DisplayCurrencySnapshot {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}
