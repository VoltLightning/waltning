/**
 * A value that belongs to **this device**, and to nothing else.
 *
 * `design-system/02` §2.9 says of the floating button's position that it is
 * "a device preference — stored like the appearance setting, never a registry
 * operation, never synced". That sentence names a category, and this is the
 * category's one implementation: a small external store with the shape
 * `useSyncExternalStore` wants, hydrated once from a string on disk, written
 * through in order.
 *
 * It knows nothing about what it holds. The codec is the caller's, so a
 * corrupt string on disk becomes `null` — the default — and never a throw at
 * startup; and `set` serialises whatever it is given, so the shape lives in
 * one place (beside the component that draws it) rather than here as well.
 */

import { type ClientDiagnostics, clientFailure, emitClientDiagnostic } from "../diagnostics.ts";

export type DevicePreferenceStore = {
  get: () => Promise<string | null>;
  set: (value: string) => Promise<void>;
};

export type DevicePreferenceCodec<Value> = {
  parse: (raw: string) => Value | null;
  serialize: (value: Value) => string;
};

export type DevicePreferenceSnapshot<Value> = {
  /** `null` until hydrated, and afterwards when nothing valid was stored. */
  value: Value | null;
  hydrated: boolean;
};

export type DevicePreferenceController<Value> = {
  getSnapshot: () => DevicePreferenceSnapshot<Value>;
  subscribe: (listener: () => void) => () => void;
  hydrate: () => Promise<void>;
  set: (value: Value) => Promise<void>;
};

export function createDevicePreference<Value>(
  store: DevicePreferenceStore,
  codec: DevicePreferenceCodec<Value>,
  diagnostics?: ClientDiagnostics,
): DevicePreferenceController<Value> {
  let snapshot: DevicePreferenceSnapshot<Value> = { value: null, hydrated: false };
  let hydration: Promise<void> | undefined;
  // A `set` that lands while the disk is still being read must win over the
  // read: the generation is what tells a late read it is stale.
  let generation = 0;
  let writeTail: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>();

  const publish = (next: DevicePreferenceSnapshot<Value>) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const hydrate = () => {
    if (snapshot.hydrated) return Promise.resolve();
    if (hydration) return hydration;
    const generationAtRead = generation;
    emitClientDiagnostic(diagnostics, {
      scope: "client_state",
      update: "device_preference_hydrate",
      phase: "start",
    });
    hydration = store
      .get()
      .then(
        (stored) => {
          if (generationAtRead === generation) {
            publish({ value: stored === null ? null : codec.parse(stored), hydrated: true });
          }
          emitClientDiagnostic(diagnostics, {
            scope: "client_state",
            update: "device_preference_hydrate",
            phase: "success",
          });
        },
        (error) => {
          if (generationAtRead === generation) publish({ value: snapshot.value, hydrated: true });
          emitClientDiagnostic(diagnostics, {
            scope: "client_state",
            update: "device_preference_hydrate",
            phase: "failure",
            error: clientFailure(error),
          });
        },
      )
      .finally(() => {
        hydration = undefined;
      });
    return hydration;
  };

  const set = (value: Value) => {
    generation += 1;
    publish({ value, hydrated: true });
    // Writes queue behind each other so two quick drags cannot land on disk
    // out of order; a failed write is reported and the in-memory value stands.
    writeTail = writeTail
      .then(() => store.set(codec.serialize(value)))
      .catch((error) => {
        emitClientDiagnostic(diagnostics, {
          scope: "client_state",
          update: "device_preference_write",
          phase: "failure",
          error: clientFailure(error),
        });
      });
    return writeTail;
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    hydrate,
    set,
  };
}
