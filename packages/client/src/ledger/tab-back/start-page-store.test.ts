import { afterEach, describe, expect, it, vi } from "vitest";
import { forgetStartPage, publishStartPage, showStartPage, startPage } from "./start-page-store.ts";

afterEach(forgetStartPage);

describe("start page store", () => {
  it("holds the page the pager published, and moves the pager through it", () => {
    const show = vi.fn();
    publishStartPage("calendar", show);

    expect(startPage()).toBe("calendar");
    expect(showStartPage("summary")).toBe(true);
    expect(show).toHaveBeenCalledWith("summary");
  });

  it("reads the overview and moves nothing once the pager is gone", () => {
    publishStartPage("list", vi.fn());
    forgetStartPage();

    expect(startPage()).toBe("summary");
    expect(showStartPage("summary")).toBe(false);
  });
});
