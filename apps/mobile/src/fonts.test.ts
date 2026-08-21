/**
 * @vitest-environment jsdom
 *
 * jsdom for a test that only reads bytes off disk, which looks wrong: it reaches
 * `@waltning/ui` for the face list, and that barrel exports components, so
 * importing it pulls in `react-native-web` — which wants a document before it
 * will finish loading. Reaching past the barrel would avoid it and the boundary
 * tests forbid that, rightly.
 *
 * **It cannot import the app's own `fonts.ts`**, and that is not a limitation
 * worth working around: that file `require()`s `.ttf` assets through
 * `@expo-google-fonts/*` barrels which also export a `useFonts` hook, so the
 * import chain reaches `expo-modules-core` and dies on a native runtime that
 * does not exist under Node. Whether the asset map covers the required faces is
 * a **compile-time** check there (`satisfies Record<RequiredFace, unknown>`),
 * which is the stronger place for it — this file checks the bytes instead.
 *
 * The fonts, checked against the files that ship — not against a renderer.
 *
 * **Why the font file and not a rendered screen.** Every other way of asking
 * *do these digits line up* runs through a renderer, and each renderer answers
 * differently: `fontVariant` is declared on `TextStyleIOS` and appears nowhere
 * in `TextStyleAndroid`, so the same style object switches on tabular figures
 * on one platform and is ignored on another — while typechecking on both,
 * because `TextStyle extends TextStyleIOS`. A test that renders can only ever
 * report the platform it happened to run on.
 *
 * The font file is the same bytes everywhere. If the digits are equal-width in
 * the file, the column aligns with no feature applied, on any renderer, forever.
 * That turns a platform-conditional hope into a property of the bundle.
 *
 * **This is why `<Amount>` renders in the display face.** `design-system/02`
 * §2.2 files money under *Display & money · Source Serif 4* and the component
 * had been using the UI face below `large` — a divergence whose consequence is
 * measured below: Figtree's digits are proportional by default.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { FACES, REQUIRED_FACES } from "@waltning/ui";
import { describe, expect, it } from "vitest";

const require_ = createRequire(import.meta.url);

/** Where a face's `.ttf` actually lives, resolved the way Metro would find it. */
function fontPath(face: string): string {
  const [family] = face.split("_");
  const pkg =
    family === "Figtree" ? "@expo-google-fonts/figtree" : "@expo-google-fonts/source-serif-4";
  const root = require_.resolve(`${pkg}/package.json`).replace(/package\.json$/, "");
  const variant = face.slice(face.indexOf("_") + 1);
  return `${root}${variant}/${face}.ttf`;
}

/* ── a minimal TrueType reader ────────────────────────────────────────────── */

function tableOffsets(b: Buffer): Record<string, number> {
  const out: Record<string, number> = {};
  const n = b.readUInt16BE(4);
  for (let i = 0; i < n; i++) {
    const at = 12 + i * 16;
    out[b.toString("latin1", at, at + 4)] = b.readUInt32BE(at + 8);
  }
  return out;
}

/** Glyph ids for '0'–'9', via the format-4 Unicode subtable. */
function digitGlyphs(b: Buffer, cmap: number): number[] {
  const n = b.readUInt16BE(cmap + 2);
  let sub = -1;
  for (let i = 0; i < n; i++) {
    const at = cmap + 4 + i * 8;
    const pid = b.readUInt16BE(at);
    const eid = b.readUInt16BE(at + 2);
    if ((pid === 3 && eid === 1) || (pid === 0 && (eid === 3 || eid === 4))) {
      sub = cmap + b.readUInt32BE(at + 4);
      break;
    }
  }
  if (sub < 0 || b.readUInt16BE(sub) !== 4) throw new Error("no format-4 unicode cmap");

  const segX2 = b.readUInt16BE(sub + 6);
  const endAt = sub + 14;
  const startAt = endAt + segX2 + 2;
  const deltaAt = startAt + segX2;
  const rangeAt = deltaAt + segX2;

  const glyphs: number[] = [];
  for (let cp = 0x30; cp <= 0x39; cp++) {
    for (let i = 0; i < segX2 / 2; i++) {
      if (cp > b.readUInt16BE(endAt + i * 2)) continue;
      const start = b.readUInt16BE(startAt + i * 2);
      if (cp < start) break;
      const delta = b.readInt16BE(deltaAt + i * 2);
      const rangeOff = b.readUInt16BE(rangeAt + i * 2);
      if (rangeOff === 0) glyphs.push((cp + delta) & 0xffff);
      else {
        const g = b.readUInt16BE(rangeAt + i * 2 + rangeOff + (cp - start) * 2);
        glyphs.push(g === 0 ? 0 : (g + delta) & 0xffff);
      }
      break;
    }
  }
  return glyphs;
}

/** Advance width of each digit, in font units. */
function digitAdvances(path: string): number[] {
  const b = readFileSync(path);
  const t = tableOffsets(b);
  const hhea = t["hhea"];
  const hmtx = t["hmtx"];
  const cmap = t["cmap"];
  if (hhea === undefined || hmtx === undefined || cmap === undefined) {
    throw new Error(`${path}: missing a required table`);
  }
  const longMetrics = b.readUInt16BE(hhea + 34);
  return digitGlyphs(b, cmap).map((g) => b.readUInt16BE(hmtx + Math.min(g, longMetrics - 1) * 4));
}

/* ── the checks ───────────────────────────────────────────────────────────── */

describe("every required face resolves to a real font file", () => {
  it("each one is present, non-empty, and actually TrueType", () => {
    // Whether the *app* supplies these is settled at compile time. What no type
    // can check is whether the bytes behind the name are there and are a font.
    for (const name of REQUIRED_FACES) {
      const bytes = readFileSync(fontPath(name));
      expect(bytes.length, `${name} is empty`).toBeGreaterThan(1000);
      expect(bytes.readUInt32BE(0), `${name} is not a TrueType file`).toBe(0x00010000);
    }
    expect(REQUIRED_FACES.length, "faces required").toBeGreaterThan(3);
  });
});

describe("money aligns because of the font file, not because of the renderer", () => {
  /**
   * `design-system/02` §2.2: tabular figures are **mandatory** — *"what lets
   * columns align without a monospace face"*. `<Amount>` is the single
   * component every figure renders through, and it renders in the display face,
   * so this is the one file that has to hold.
   */
  it("the display face has equal-width digits with no feature applied", () => {
    const advances = digitAdvances(fontPath(FACES.display[600]));

    expect(advances.length, "ten digits found in the cmap").toBe(10);
    expect(new Set(advances).size, `digit advances were ${advances.join(", ")}`).toBe(1);
  });

  /**
   * **The UI face is asserted to be proportional, which looks backwards.**
   *
   * It is the finding written down. Figtree's digits are *not* equal width —
   * `1` measures 413 against `0` at 641 — and a column set in it aligns only
   * where `fontVariant` can reach its `tnum` feature, which is iOS and web but
   * not Android. `SPEC.md` says *"Android free if ever wanted"*; this is the
   * part that is not free, and it is cheap to know now and expensive to
   * discover then.
   *
   * If this ever fails because Figtree shipped tabular defaults, that is good
   * news and the note above should be deleted — but it should be deleted
   * *knowingly*, which is what a failing test buys.
   */
  it("records that the UI face is proportional, so money must not use it", () => {
    const advances = digitAdvances(fontPath(FACES.ui[400]));

    expect(new Set(advances).size, "Figtree's digit widths").toBeGreaterThan(1);
  });
});
