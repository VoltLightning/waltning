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

export function createAppearance(store: AppearanceStore): AppearanceController {
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
    hydration = store
      .get()
      .then(
        (stored) => {
          if (generationAtRead === preferenceGeneration) {
            publish({ preference: preference(stored), hydrated: true });
          }
        },
        () => {
          if (generationAtRead === preferenceGeneration) {
            publish({ preference: snapshot.preference, hydrated: true });
          }
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
      const generation = ++preferenceGeneration;
      const saved = writeTail.then(() => store.set(next));
      writeTail = saved.catch(() => undefined);
      await saved;
      if (generation === preferenceGeneration) {
        publish({ preference: next, hydrated: true });
      }
    },
  };
}
