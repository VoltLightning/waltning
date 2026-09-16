/**
 * The key strings, checked against keys that were written by something else.
 *
 * A key this app encodes and decodes consistently is worth nothing on its own:
 * the string's whole job is to survive the trip through a password manager and
 * into `age -i` on a machine this repository has never touched. So the fixtures
 * are real — three recipients from age's own README and two identities from
 * its test data — and the test is that they decode to 32 bytes and re-encode
 * to exactly the string that arrived.
 *
 * The bech32 vectors are BIP-173's own, including the invalid ones. They pin
 * the checksum polynomial, which is the part that cannot be verified by
 * inspection and is also the part that earns its keep: this string is read off
 * a screen and retyped, and a transposition caught here is the difference
 * between *that is not the key* and a tag failure five years of ledger later.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as bech32 from "./bech32.ts";
import {
  decodeIdentity,
  decodeRecipient,
  encodeIdentity,
  encodeRecipient,
  generateKeyPair,
  recipientOf,
} from "./keys.ts";

/** Real recipients, from age's README. */
const RECIPIENTS = [
  "age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p",
  "age1lggyhqrw2nlhcxprm67z43rta597azn8gknawjehu9d9dl0jq3yqqvfafg",
  "age1yhm4gctwfmrpz87tdslm550wrx6m79y9f2hdzt0lndjnehwj0ukqrjpyx5",
];

/**
 * Real identities, read out of C2SP's vendored conformance vectors rather than
 * copied into this file.
 *
 * They were written by another implementation, which is the whole point — a
 * key this app encodes and decodes consistently proves nothing. Reading them
 * from the vectors keeps one copy of each, and keeps a key-shaped literal out
 * of a source file, which the pre-commit hook is right to refuse.
 */
const IDENTITIES = (() => {
  const found = new Set<string>();
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../testdata/age");
  for (const name of readdirSync(root)) {
    const line = readFileSync(join(root, name), "latin1")
      .split("\n")
      .find((text) => text.startsWith("identity: "));
    if (line !== undefined) found.add(line.slice("identity: ".length));
  }
  const identities = [...found].sort();
  if (identities.length === 0) throw new Error("no vendored vector carries an identity");
  return identities;
})();

describe("keys written by other implementations", () => {
  it.each(RECIPIENTS)("reads %s and writes it back unchanged", (recipient) => {
    const bytes = decodeRecipient(recipient);
    expect(bytes).toHaveLength(32);
    expect(encodeRecipient(bytes)).toBe(recipient);
  });

  it.each(IDENTITIES)("reads %s and writes it back unchanged", (identity) => {
    const bytes = decodeIdentity(identity);
    expect(bytes).toHaveLength(32);
    expect(encodeIdentity(bytes)).toBe(identity);
  });

  it("refuses a recipient offered where an identity belongs, and the reverse", () => {
    expect(() => decodeIdentity(RECIPIENTS[0] as string)).toThrow(/expected a AGE-SECRET-KEY-/);
    expect(() => decodeRecipient(IDENTITIES[0] as string)).toThrow(/expected a age key/);
  });

  /**
   * The case a checksum exists for. `qm` → `mq` in the middle of the string is
   * the mistake a person actually makes, and it decodes to 32 perfectly
   * plausible bytes if nothing checks.
   */
  it("refuses a transposition that would otherwise decode to a usable key", () => {
    const good = RECIPIENTS[0] as string;
    const at = good.length - 10;
    const swapped = good.slice(0, at) + good[at + 1] + good[at] + good.slice(at + 2);
    expect(swapped).not.toBe(good);
    expect(() => decodeRecipient(swapped)).toThrow("bech32: checksum failed");
  });

  it("refuses mixed case, which no checksum covers", () => {
    const mixed = `${(IDENTITIES[0] as string).slice(0, 20)}${(IDENTITIES[0] as string).slice(20).toLowerCase()}`;
    expect(() => decodeIdentity(mixed)).toThrow("bech32: mixed case");
  });

  it("tolerates the whitespace a copy out of a password manager brings with it", () => {
    expect(decodeIdentity(`  ${IDENTITIES[0]}\n`)).toEqual(decodeIdentity(IDENTITIES[0] as string));
  });
});

describe("a pair this app generates", () => {
  const random = (length: number) => Uint8Array.from({ length }, (_, at) => (at * 7 + 3) & 0xff);

  it("is an age1 recipient and an uppercase identity that name each other", () => {
    const { identity, recipient } = generateKeyPair(random);
    expect(recipient.startsWith("age1")).toBe(true);
    expect(identity.startsWith("AGE-SECRET-KEY-1")).toBe(true);
    expect(identity).toBe(identity.toUpperCase());
    expect(recipientOf(identity)).toBe(recipient);
  });

  it("refuses a source of randomness that returns the wrong amount", () => {
    expect(() => generateKeyPair(() => new Uint8Array(16))).toThrow(/32 random bytes/);
  });
});

/** BIP-173's published vectors — the checksum polynomial, pinned. */
describe("bech32", () => {
  const VALID: [string, string][] = [
    ["A12UEL5L", "a"],
    [
      "an83characterlonghumanreadablepartthatcontainsthenumber1andtheexcludedcharactersbio1tt5tgs",
      "an83characterlonghumanreadablepartthatcontainsthenumber1andtheexcludedcharactersbio",
    ],
    ["abcdef1qpzry9x8gf2tvdw0s3jn54khce6mua7lmqqqxw", "abcdef"],
    ["split1checkupstagehandshakeupstreamerranterredcaperred2y9e3w", "split"],
  ];

  it.each(VALID)("accepts %s", (text, hrp) => {
    expect(() => bech32.decode(text, hrp)).not.toThrow();
  });

  const INVALID: [string, string, string][] = [
    ["A12UEL5M", "a", "a changed checksum character"],
    ["pzry9x0s0muk", "pzry9x0s0muk", "no separator"],
    ["1pzry9x0s0muk", "", "an empty human-readable part"],
    ["x1b4n0q5v", "x", "a character outside the alphabet"],
    ["li1dgmt3", "li", "a checksum too short to be one"],
  ];

  it.each(INVALID)("refuses %s — %s", (text, hrp) => {
    expect(() => bech32.decode(text, hrp)).toThrow(/^bech32:/);
  });

  it("round-trips every length a key could be", () => {
    for (const length of [1, 20, 32, 64]) {
      const bytes = Uint8Array.from({ length }, (_, at) => (at * 13 + 1) & 0xff);
      expect(bech32.decode(bech32.encode("test", bytes), "test")).toEqual(bytes);
    }
  });
});
