import { describe, expect, it, vi } from "vitest";
import { createDevicePreference } from "./create-device-preference.ts";

type Point = { x: number; y: number };

const codec = {
  parse: (raw: string): Point | null => {
    const v = JSON.parse(raw);
    return typeof v?.x === "number" && typeof v?.y === "number" ? { x: v.x, y: v.y } : null;
  },
  serialize: (p: Point) => JSON.stringify(p),
};

function memoryStore(initial: string | null) {
  let stored = initial;
  return {
    stored: () => stored,
    get: vi.fn(async () => stored),
    set: vi.fn(async (value: string) => {
      stored = value;
    }),
  };
}

describe("a device preference", () => {
  it("is null until hydrated, then whatever the disk held", async () => {
    const store = memoryStore('{"x":10,"y":20}');
    const pref = createDevicePreference(store, codec);
    expect(pref.getSnapshot()).toEqual({ value: null, hydrated: false });
    await pref.hydrate();
    expect(pref.getSnapshot()).toEqual({ value: { x: 10, y: 20 }, hydrated: true });
  });

  it("treats a corrupt value as nothing stored, and does not throw", async () => {
    const pref = createDevicePreference(memoryStore('{"x":"ten"}'), codec);
    await pref.hydrate();
    expect(pref.getSnapshot()).toEqual({ value: null, hydrated: true });
  });

  it("publishes a set at once, persists it, and tells subscribers", async () => {
    const store = memoryStore(null);
    const pref = createDevicePreference(store, codec);
    const listener = vi.fn();
    pref.subscribe(listener);
    const write = pref.set({ x: 1, y: 2 });
    expect(pref.getSnapshot()).toEqual({ value: { x: 1, y: 2 }, hydrated: true });
    expect(listener).toHaveBeenCalledOnce();
    await write;
    expect(store.stored()).toBe('{"x":1,"y":2}');
  });

  it("lets a set that lands during hydration win over the stale read", async () => {
    let release: (value: string | null) => void = () => undefined;
    const pref = createDevicePreference(
      {
        get: () =>
          new Promise<string | null>((resolve) => {
            release = resolve;
          }),
        set: async () => undefined,
      },
      codec,
    );
    const hydrating = pref.hydrate();
    void pref.set({ x: 5, y: 5 });
    release('{"x":0,"y":0}');
    await hydrating;
    expect(pref.getSnapshot().value).toEqual({ x: 5, y: 5 });
  });

  it("keeps the in-memory value when the disk refuses the write", async () => {
    const pref = createDevicePreference(
      { get: async () => null, set: async () => Promise.reject(new Error("disk full")) },
      codec,
    );
    await pref.set({ x: 3, y: 4 });
    expect(pref.getSnapshot().value).toEqual({ x: 3, y: 4 });
  });
});
