import { describe, expect, it } from "vitest";
import { decideBack, decideReselect } from "./back-decision.ts";

describe("decideBack", () => {
  it("returns to Start from any other tab, whatever page Start was left on", () => {
    for (const tab of ["accounts", "ledger", "counterparties", "settings"] as const) {
      expect(decideBack({ tab, page: "list" })).toEqual({ kind: "tab", tab: "today" });
    }
  });

  it("returns to the overview from Start's Liste, Kalender and Monate", () => {
    for (const page of ["list", "calendar", "months"] as const) {
      expect(decideBack({ tab: "today", page })).toEqual({ kind: "page", page: "summary" });
    }
  });

  it("exits from Start's overview", () => {
    expect(decideBack({ tab: "today", page: "summary" })).toEqual({ kind: "exit" });
  });
});

describe("decideReselect", () => {
  it("returns Start to its overview when it is on another page", () => {
    expect(decideReselect({ tab: "today", page: "calendar" })).toEqual({ kind: "overview" });
  });

  it("scrolls Start's overview to the top", () => {
    expect(decideReselect({ tab: "today", page: "summary" })).toEqual({ kind: "scroll-top" });
  });

  it("scrolls any other tab to the top, whatever Start's page is", () => {
    expect(decideReselect({ tab: "accounts", page: "list" })).toEqual({ kind: "scroll-top" });
  });
});
