/**
 * age's own conformance vectors, run against this implementation.
 *
 * **A round trip proves almost nothing here.** An implementation that MACs one
 * byte past the `---`, or numbers its chunk nonces from one, or rebuilds the
 * header it parsed instead of authenticating the bytes that arrived, encrypts
 * and decrypts its own files perfectly — and produces a backup the real `age`
 * refuses, discovered on the one day it mattered. §14.3 makes this file the
 * whole of the phone's durability, so *interoperable* is the property under
 * test, not *self-consistent*.
 *
 * The vectors are C2SP's published set (`CCTV/age/testdata`), vendored under
 * `packages/core/testdata/age`. Each carries `expect:` — `success`, or one of
 * the failure kinds — and a successful one carries the SHA-256 of the
 * plaintext it must produce. Bodies over a few hundred bytes are zlib'd, which
 * is how a three-chunk 128 KiB payload fits in 737 bytes.
 *
 * The 35 failure vectors are the valuable half: truncation, a chunk marked
 * final twice, a header MAC with an extra space, a non-canonical base64 field,
 * a low-order ephemeral share. Every one of them is a file that a lenient
 * reader accepts and returns *something* for.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { sha256 } from "@noble/hashes/sha2.js";
import { describe, expect, it } from "vitest";
import * as base64 from "./base64.ts";
import { decrypt, encrypt } from "./format.ts";
import { generateKeyPair, recipientOf } from "./keys.ts";

const VECTORS = join(dirname(fileURLToPath(import.meta.url)), "../../testdata/age");

type Vector = {
  name: string;
  expect: string;
  /** Absent on the armor vectors, which this reader does not handle. */
  identity: string | undefined;
  /** SHA-256 of the plaintext, hex — present when `expect` is `success`. */
  payload: string | undefined;
  file: Uint8Array;
};

/** `key: value` lines, a blank line, then the file — zlib'd when the header says so. */
function readVector(name: string): Vector {
  const raw = new Uint8Array(readFileSync(join(VECTORS, name)));
  let at = 0;
  const fields: Record<string, string> = {};
  for (;;) {
    let line = "";
    while (raw[at] !== 0x0a) line += String.fromCharCode(raw[at++] as number);
    at++;
    if (line === "") break;
    const colon = line.indexOf(": ");
    fields[line.slice(0, colon)] = line.slice(colon + 2);
  }
  const body = raw.subarray(at);
  return {
    name,
    expect: fields["expect"] ?? "",
    identity: fields["identity"],
    payload: fields["payload"],
    file: fields["compressed"] === "zlib" ? new Uint8Array(inflateSync(body)) : body,
  };
}

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const vectors = readdirSync(VECTORS).sort().map(readVector);

/**
 * An identity from the vendored vectors, rather than a copy of one.
 *
 * The vectors carry the key they are meant to be opened with, so a literal
 * here would be a second copy of a published value that could drift from the
 * file it belongs to — and the repository's pre-commit hook is right to be
 * suspicious of a key-shaped string in a source file.
 */
const A_REAL_IDENTITY = (() => {
  const identity = vectors.find((vector) => vector.identity !== undefined)?.identity;
  if (identity === undefined) throw new Error("no vendored vector carries an identity");
  return identity;
})();

describe("age's published conformance vectors", () => {
  it("runs every vendored vector, and names the ones it does not", () => {
    // A path that silently resolved to nothing would turn every case below
    // into a vacuous pass, which is this project's commonest defect class —
    // and so would a vector quietly skipped for want of a field. Both are
    // counted here rather than left to the absence of a red test.
    expect(vectors.length, "vectors vendored").toBeGreaterThanOrEqual(49);
    expect(vectors.filter((v) => v.expect === "success").length).toBeGreaterThan(5);
    expect(vectors.filter((v) => v.expect !== "success").length).toBeGreaterThan(30);

    // `empty` is a zero-byte file: the testkit gives it no `identity`, because
    // there is no header to address one to. It is the only one, and it is
    // covered by its own case below rather than by the loop.
    expect(vectors.filter((v) => v.identity === undefined).map((v) => v.name)).toEqual(["empty"]);
  });

  it("refuses the empty file, which carries no identity to try", () => {
    const empty = vectors.find((v) => v.name === "empty");
    expect(empty?.file.length, "the vector is genuinely empty").toBe(0);
    expect(() => decrypt(new Uint8Array(0), A_REAL_IDENTITY)).toThrow(/^age:/);
  });

  for (const vector of vectors) {
    const identity = vector.identity;
    if (identity === undefined) continue;

    if (vector.expect === "success") {
      it(`${vector.name} — decrypts to the plaintext it names`, () => {
        expect(hex(sha256(decrypt(vector.file, identity)))).toBe(vector.payload);
      });
    } else {
      it(`${vector.name} — is refused (${vector.expect})`, () => {
        // Every refusal in this reader names itself, so a vector that fails
        // for an unrelated reason — a `TypeError` from a library, say — is not
        // mistaken for the format's check doing its job.
        expect(() => decrypt(vector.file, identity)).toThrow(/^(age|age base64|bech32):/);
      });
    }
  }
});

/**
 * A fixed source, so the ephemeral secret and the file key are the same on
 * every run. Real callers pass the platform's CSPRNG; the point here is that
 * a failure is a failure rather than a flake.
 */
function fixedRandom(seed: number) {
  let state = seed;
  return (length: number) => {
    const bytes = new Uint8Array(length);
    for (let at = 0; at < length; at++) {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      bytes[at] = (state >>> 16) & 0xff;
    }
    return bytes;
  };
}

describe("what this implementation writes", () => {
  const random = fixedRandom(7);
  const { identity, recipient } = generateKeyPair(random);

  it("comes back as it went in, across the chunk boundary", () => {
    // 64 KiB exactly, then one byte over, then nothing: the three lengths
    // where the STREAM chunking decides something.
    for (const length of [0, 1, 64 * 1024 - 1, 64 * 1024, 64 * 1024 + 1]) {
      const plaintext = new Uint8Array(length);
      for (let at = 0; at < length; at++) plaintext[at] = (at * 31) & 0xff;
      const file = encrypt(plaintext, recipient, random);
      expect(Array.from(decrypt(file, identity)), `${length} bytes`).toEqual(Array.from(plaintext));
    }
  });

  it("is an age v1 file with one X25519 stanza", () => {
    const file = encrypt(new Uint8Array([1, 2, 3]), recipient, random);
    const header = headerOf(file);
    expect(header.startsWith("age-encryption.org/v1\n-> X25519 ")).toBe(true);
    expect(header.split("\n")).toHaveLength(4);
    expect(header.split("\n")[3]?.startsWith("--- ")).toBe(true);
  });

  it("refuses the key that is not the one", () => {
    const other = generateKeyPair(fixedRandom(99));
    const file = encrypt(new Uint8Array([1, 2, 3]), recipient, random);
    expect(() => decrypt(file, other.identity)).toThrow("does not open this file");
  });

  /**
   * The loss this guards is silent: a file cut at a chunk boundary would, with
   * no final-chunk flag, decrypt cleanly to a ledger missing its most recent
   * months — the half you would actually want back.
   */
  it("refuses a file that stops early, byte for byte", () => {
    const plaintext = new Uint8Array(70 * 1024).fill(9);
    const file = encrypt(plaintext, recipient, random);
    for (const cut of [file.length - 1, file.length - 17, CHUNK_END(file)]) {
      expect(() => decrypt(file.subarray(0, cut), identity), `cut at ${cut}`).toThrow(/^age:/);
    }
  });

  it("refuses a file with a byte changed anywhere in it", () => {
    const file = encrypt(new Uint8Array(200).fill(4), recipient, random);
    // The header's MAC field, the wrapped file key, and the payload — three
    // regions with three different checks behind them.
    for (const at of [30, 70, file.length - 20]) {
      const tampered = Uint8Array.from(file);
      tampered[at] = ((tampered[at] as number) ^ 0x01) & 0xff;
      expect(() => decrypt(tampered, identity), `byte ${at}`).toThrow(/^age:/);
    }
  });

  it("recovers the recipient an identity opens, so a restore can say whose file it is", () => {
    expect(recipientOf(identity)).toBe(recipient);
  });

  /**
   * Canonical encoding is what stops one ciphertext carrying two valid
   * headers, which is the malleability the header MAC exists to prevent.
   */
  it("writes canonical base64 in the header — no padding, nothing to re-encode", () => {
    const fields = headerOf(encrypt(new Uint8Array([7]), recipient, random))
      .split("\n")
      .slice(1)
      // The last token of each line is its base64 field: the ephemeral share
      // after `-> X25519`, the wrapped file key alone, the MAC after `---`.
      .map((line) => line.slice(line.lastIndexOf(" ") + 1));
    expect(fields).toHaveLength(3);
    for (const field of fields) {
      expect(field).not.toContain("=");
      expect(base64.encode(base64.decode(field))).toBe(field);
    }
  });
});

/** The header as text — the four lines before the binary payload begins. */
function headerOf(file: Uint8Array): string {
  const end = findPayloadStart(file) - 1;
  let text = "";
  for (let at = 0; at < end; at++) text += String.fromCharCode(file[at] as number);
  return text;
}

/** Where the first stored chunk ends — the boundary a naive reader would accept a cut at. */
function CHUNK_END(file: Uint8Array): number {
  const headerEnd = findPayloadStart(file);
  return headerEnd + 16 + (64 * 1024 + 16);
}

function findPayloadStart(file: Uint8Array): number {
  let newlines = 0;
  for (let at = 0; at < file.length; at++) {
    if (file[at] === 0x0a && ++newlines === 4) return at + 1;
  }
  throw new Error("no header");
}
