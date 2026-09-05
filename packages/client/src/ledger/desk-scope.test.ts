/**
 * `desk-scope.ts` — the codec and the preference the desk band writes and the
 * dashboard reads.
 *
 * The band and the widgets are siblings with a router between them, so this
 * value is the whole channel connecting them: if `parse` widens, a corrupt
 * string on disk becomes a scope no fold understands; if it narrows, a scope
 * someone selected stops surviving a relaunch. Both failures are silent on
 * screen — the band renders *something* either way — which is why they are
 * asserted here rather than through a screen.
 */

import { describe, expect, it, vi } from "vitest";
import type { DevicePreferenceStore } from "../device/create-device-preference.ts";
import {
  createDeskScopePreference,
  DEFAULT_DESK_SCOPE,
  parseDeskScope,
  serializeDeskScope,
} from "./desk-scope.ts";

function fakeStore(initial: string | null): DevicePreferenceStore & { written: string[] } {
  const written: string[] = [];
  return {
    written,
    get: vi.fn(async () => initial),
    set: vi.fn(async (value: string) => {
      written.push(value);
    }),
  };
}

describe("parseDeskScope", () => {
  it("accepts every scope the fold understands, and nothing else", () => {
    expect(parseDeskScope("all")).toBe("all");
    expect(parseDeskScope("mine")).toBe("mine");
    expect(parseDeskScope("shared")).toBe("shared");
    expect(parseDeskScope("business")).toBe("business");
  });

  it("returns null for anything else — a corrupt string falls back, never throws", () => {
    expect(parseDeskScope("own")).toBeNull();
    expect(parseDeskScope("ALL")).toBeNull();
    expect(parseDeskScope("")).toBeNull();
    expect(parseDeskScope("all,mine")).toBeNull();
  });

  it("round-trips every scope through serialize", () => {
    for (const scope of ["all", "mine", "shared", "business"] as const) {
      expect(parseDeskScope(serializeDeskScope(scope))).toBe(scope);
    }
  });
});

describe("createDeskScopePreference", () => {
  it("hydrates a stored scope", async () => {
    const preference = createDeskScopePreference(fakeStore("business"));
    await preference.hydrate();
    expect(preference.getSnapshot()).toEqual({ value: "business", hydrated: true });
  });

  it("hydrates a corrupt string to null, which the screens read as the default", async () => {
    const preference = createDeskScopePreference(fakeStore("everything"));
    await preference.hydrate();
    // `null`, not a throw and not a fabricated scope: the store says "nothing
    // valid here" and `dashboard-screen.tsx` supplies `DEFAULT_DESK_SCOPE`.
    expect(preference.getSnapshot()).toEqual({ value: null, hydrated: true });
    expect(DEFAULT_DESK_SCOPE).toBe("all");
  });

  it("writes the serialized scope through", async () => {
    const store = fakeStore(null);
    const preference = createDeskScopePreference(store);
    await preference.hydrate();
    await preference.set("shared");
    expect(store.written).toEqual(["shared"]);
    expect(preference.getSnapshot().value).toBe("shared");
  });
});
