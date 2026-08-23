import { describe, expect, it, vi } from "vitest";
import { type AppearancePreference, createAppearance } from "./create-appearance.ts";

function deferred() {
  let resolve: (value?: void | PromiseLike<void>) => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("appearance persistence", () => {
  it("starts at System and unhydrated", () => {
    const controller = createAppearance({
      get: async () => null,
      set: async () => undefined,
    });

    expect(controller.getSnapshot()).toEqual({ preference: "system", hydrated: false });
  });

  it.each<AppearancePreference>(["system", "light", "dark"])(
    "hydrates the stored %s preference",
    async (stored) => {
      const controller = createAppearance({
        get: async () => stored,
        set: async () => undefined,
      });

      await controller.hydrate();

      expect(controller.getSnapshot()).toEqual({ preference: stored, hydrated: true });
    },
  );

  it("falls back to System for an invalid stored value", async () => {
    const controller = createAppearance({
      get: async () => "sepia",
      set: async () => undefined,
    });

    await controller.hydrate();

    expect(controller.getSnapshot()).toEqual({ preference: "system", hydrated: true });
  });

  it("shares one store read across concurrent hydration", async () => {
    const gate = deferred();
    const get = vi.fn(async () => {
      await gate.promise;
      return "dark";
    });
    const controller = createAppearance({ get, set: async () => undefined });

    const first = controller.hydrate();
    const second = controller.hydrate();
    expect(get).toHaveBeenCalledTimes(1);
    gate.resolve();
    await Promise.all([first, second]);
    expect(controller.getSnapshot().preference).toBe("dark");
  });

  it("persists before publishing a new preference", async () => {
    const gate = deferred();
    const listener = vi.fn();
    const controller = createAppearance({
      get: async () => null,
      set: async () => gate.promise,
    });
    controller.subscribe(listener);

    const saving = controller.setPreference("dark");
    expect(controller.getSnapshot().preference).toBe("system");
    expect(listener).not.toHaveBeenCalled();

    gate.resolve();
    await saving;
    expect(controller.getSnapshot().preference).toBe("dark");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not let a slow hydration overwrite a saved preference", async () => {
    let resolveRead: (value: string | null) => void = () => undefined;
    const read = new Promise<string | null>((resolve) => {
      resolveRead = resolve;
    });
    const controller = createAppearance({
      get: () => read,
      set: async () => undefined,
    });

    const hydration = controller.hydrate();
    await controller.setPreference("light");
    resolveRead("dark");
    await hydration;

    expect(controller.getSnapshot()).toEqual({ preference: "light", hydrated: true });
  });

  it("does not notify an unsubscribed listener", async () => {
    const listener = vi.fn();
    const controller = createAppearance({
      get: async () => null,
      set: async () => undefined,
    });
    const unsubscribe = controller.subscribe(listener);
    unsubscribe();

    await controller.setPreference("light");

    expect(listener).not.toHaveBeenCalled();
  });
});
