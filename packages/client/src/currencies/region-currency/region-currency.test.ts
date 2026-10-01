import { currencyCode } from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { currencyOfRegion, currencyOfTags, regionOfTag } from "./region-currency.ts";

describe("regionOfTag", () => {
  it("reads the region of a language tag", () => {
    expect(regionOfTag("de-DE")).toBe("DE");
    expect(regionOfTag("en_GB")).toBe("GB");
    expect(regionOfTag("zh-Hant-TW")).toBe("TW");
    expect(regionOfTag("es-419")).toBe("419");
  });

  it("answers null for a tag that names no region", () => {
    expect(regionOfTag("de")).toBeNull();
    expect(regionOfTag("")).toBeNull();
  });
});

describe("currencyOfRegion", () => {
  it("maps the euro area to EUR and the seeded currencies to their own", () => {
    expect(currencyOfRegion("DE")).toBe(currencyCode("EUR"));
    expect(currencyOfRegion("pl")).toBe(currencyCode("PLN"));
    expect(currencyOfRegion("US")).toBe(currencyCode("USD"));
    expect(currencyOfRegion("GB")).toBe(currencyCode("GBP"));
  });

  it("answers null for a region it does not know, or none", () => {
    expect(currencyOfRegion("JP")).toBeNull();
    expect(currencyOfRegion(null)).toBeNull();
  });
});

describe("currencyOfTags", () => {
  it("takes the first tag that names a region with a known currency", () => {
    expect(currencyOfTags(["de", "pl-PL", "en-US"])).toBe(currencyCode("PLN"));
  });

  it("answers null for no tags", () => {
    expect(currencyOfTags([])).toBeNull();
  });
});
