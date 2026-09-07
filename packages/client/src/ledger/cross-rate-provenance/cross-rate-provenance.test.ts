import { accountingDate } from "@waltning/core/date";
import { describe, expect, it } from "vitest";
import { crossRateProvenance } from "./cross-rate-provenance.ts";

const OLD = accountingDate("2026-08-05");
const NEW = accountingDate("2026-08-12");

describe("crossRateProvenance", () => {
  /**
   * H2 — the whole point: `source`, `asOf` and `carriedDays` must all three
   * come from the *same* leg. Never `source` borrowed from the manual leg
   * while `asOf`/`carriedDays` describe the other, staler one.
   */
  it("reports the staler leg's own source, asOf and carriedDays together", () => {
    const provenance = crossRateProvenance({
      from: { source: "nbp", asOf: OLD, carriedDays: 7 },
      to: { source: "nbp", asOf: NEW, carriedDays: 0 },
    });
    expect(provenance.source).toBe("nbp");
    expect(provenance.asOf).toBe(OLD);
    expect(provenance.carriedDays).toBe(7);
    expect(provenance.manual).toBe(false);
  });

  it("picks whichever leg is worse regardless of which side it's on", () => {
    const provenance = crossRateProvenance({
      from: { source: "nbp", asOf: NEW, carriedDays: 0 },
      to: { source: "nbp", asOf: OLD, carriedDays: 7 },
    });
    expect(provenance.asOf).toBe(OLD);
    expect(provenance.carriedDays).toBe(7);
  });

  /**
   * H2 — `manual` is true the instant either leg is a person's own
   * correction, independent of which leg is "worse". A manual `from` leg
   * paired with a stale automatic `to` leg must report the *stale* leg's own
   * honest asOf/carriedDays (never the manual leg's, which is fresh) while
   * still marking `manual: true` — "manual · carried 7 d from 2026-08-05",
   * two true facts, not one merged one.
   */
  it("marks manual when either leg is, even when the manual leg is not the one reported", () => {
    const provenance = crossRateProvenance({
      from: { source: "manual", asOf: NEW, carriedDays: 0 },
      to: { source: "nbp", asOf: OLD, carriedDays: 7 },
    });
    expect(provenance.manual).toBe(true);
    // The reported source/date is the stale, automatic leg's own — not
    // "manual" pretending to be dated 2026-08-05.
    expect(provenance.source).toBe("nbp");
    expect(provenance.asOf).toBe(OLD);
    expect(provenance.carriedDays).toBe(7);
  });

  it("is not manual when neither leg is", () => {
    const provenance = crossRateProvenance({
      from: { source: "nbp", asOf: NEW, carriedDays: 0 },
      to: { source: "ecb", asOf: OLD, carriedDays: 7 },
    });
    expect(provenance.manual).toBe(false);
  });

  /**
   * M1 (carried over from `readCrossRate`) — the pivot's own fabricated
   * self-leg is always exactly as-of the query date with zero carry, so a
   * plain "worse of the two" comparison would win it every time it appears.
   * The real leg must be reported instead, on either side of the pair.
   */
  it("never reports the fabricated pivot leg's provenance when the other leg is real", () => {
    const fromPivot = crossRateProvenance({
      from: { source: "pivot", asOf: NEW, carriedDays: 0 },
      to: { source: "nbp", asOf: OLD, carriedDays: 7 },
    });
    expect(fromPivot.source).toBe("nbp");
    expect(fromPivot.asOf).toBe(OLD);

    const toPivot = crossRateProvenance({
      from: { source: "nbp", asOf: OLD, carriedDays: 7 },
      to: { source: "pivot", asOf: NEW, carriedDays: 0 },
    });
    expect(toPivot.source).toBe("nbp");
    expect(toPivot.asOf).toBe(OLD);
  });

  it("falls back to the fabricated pivot leg when both sides are the pivot itself", () => {
    const provenance = crossRateProvenance({
      from: { source: "pivot", asOf: NEW, carriedDays: 0 },
      to: { source: "pivot", asOf: NEW, carriedDays: 0 },
    });
    expect(provenance.source).toBe("pivot");
  });
});
