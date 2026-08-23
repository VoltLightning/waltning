import { type ClientDiagnostics, clientFailure, emitClientDiagnostic } from "../diagnostics.ts";

export type AppearancePreference = "system" | "light" | "dark";

export type AppearanceStore = {
  get: () => Promise<string | null>;
  set: (preference: AppearancePreference) => Promise<void>;
};

export type AppearanceSnapshot = {
  preference: AppearancePreference;
  hydrated: boolean;
};

export type AppearanceController = {
  getSnapshot: () => AppearanceSnapshot;
  subscribe: (listener: () => void) => () => void;
  hydrate: () => Promise<void>;
  setPreference: (preference: AppearancePreference) => Promise<void>;
};

function preference(value: string | null): AppearancePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function createAppearance(
  store: AppearanceStore,
  diagnostics?: ClientDiagnostics,
): AppearanceController {
  let snapshot: AppearanceSnapshot = { preference: "system", hydrated: false };
  let hydration: Promise<void> | undefined;
  let preferenceGeneration = 0;
  let writeTail: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>();

  const publish = (next: AppearanceSnapshot) => {
    if (next.preference === snapshot.preference && next.hydrated === snapshot.hydrated) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const hydrate = () => {
    if (snapshot.hydrated) return Promise.resolve();
    if (hydration) return hydration;

    const generationAtRead = preferenceGeneration;
    emitClientDiagnostic(diagnostics, {
      scope: "client_state",
      update: "appearance_hydrate",
      phase: "start",
    });
    hydration = store
      .get()
      .then(
        (stored) => {
          if (generationAtRead === preferenceGeneration) {
            publish({ preference: preference(stored), hydrated: true });
          }
          emitClientDiagnostic(diagnostics, {
            scope: "client_state",
            update: "appearance_hydrate",
            phase: "success",
          });
        },
        (error) => {
          if (generationAtRead === preferenceGeneration) {
            publish({ preference: snapshot.preference, hydrated: true });
          }
          emitClientDiagnostic(diagnostics, {
            scope: "client_state",
            update: "appearance_hydrate",
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

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    hydrate,
    setPreference: async (next) => {
      emitClientDiagnostic(diagnostics, {
        scope: "client_action",
        action: "change_appearance",
        phase: "start",
      });
      const generation = ++preferenceGeneration;
      const saved = writeTail.then(() => store.set(next));
      writeTail = saved.catch(() => undefined);
      try {
        await saved;
        if (generation === preferenceGeneration) {
          publish({ preference: next, hydrated: true });
        }
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "change_appearance",
          phase: "success",
        });
      } catch (error) {
        emitClientDiagnostic(diagnostics, {
          scope: "client_action",
          action: "change_appearance",
          phase: "failure",
          error: clientFailure(error),
        });
        throw error;
      }
    },
  };
}
