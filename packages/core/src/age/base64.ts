/**
 * age's base64 — standard alphabet, **no padding**, and strict about it.
 *
 * Written out rather than reached for, because every runtime spelling is
 * either absent on the phone or wrong for this format. `Buffer` is Node only
 * and the architecture test refuses it in `packages/core`; `atob`/`btoa` are
 * browser globals Hermes does not promise and they speak in code units rather
 * than bytes; both emit padding this format forbids.
 *
 * **Strictness is not pedantry here.** age's own specification requires
 * canonical encoding: a stanza body whose final character has non-zero
 * trailing bits is a *different* encoding of the same bytes, and accepting it
 * would let the same ciphertext carry two valid headers — which is exactly the
 * malleability the header MAC exists to prevent. So `decode` refuses padding,
 * refuses a length that cannot arise from any input, and refuses a final
 * character carrying bits that re-encoding would drop.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Reverse map, built once: character code → 6-bit value, `-1` for anything else. */
const VALUES = (() => {
  const values = new Int8Array(128).fill(-1);
  for (let at = 0; at < ALPHABET.length; at++) values[ALPHABET.charCodeAt(at)] = at;
  return values;
})();

export function encode(bytes: Uint8Array): string {
  let out = "";
  let at = 0;
  for (; at + 3 <= bytes.length; at += 3) {
    // `!` is a lint error in this repository, so the bytes are read through
    // locals the compiler can see are in range.
    const a = bytes[at] as number;
    const b = bytes[at + 1] as number;
    const c = bytes[at + 2] as number;
    const word = (a << 16) | (b << 8) | c;
    out +=
      ALPHABET.charAt((word >>> 18) & 63) +
      ALPHABET.charAt((word >>> 12) & 63) +
      ALPHABET.charAt((word >>> 6) & 63) +
      ALPHABET.charAt(word & 63);
  }
  const left = bytes.length - at;
  if (left === 1) {
    const a = bytes[at] as number;
    out += ALPHABET.charAt(a >>> 2) + ALPHABET.charAt((a << 4) & 63);
  } else if (left === 2) {
    const a = bytes[at] as number;
    const b = bytes[at + 1] as number;
    out +=
      ALPHABET.charAt(a >>> 2) +
      ALPHABET.charAt(((a << 4) | (b >>> 4)) & 63) +
      ALPHABET.charAt((b << 2) & 63);
  }
  return out;
}

/** Decodes, or throws — there is no "didn't work" return for a format this is authenticating. */
export function decode(text: string): Uint8Array {
  if (text.includes("=")) throw new Error("age base64: padded, and this format is not");
  const left = text.length % 4;
  // A 4-character group carries 3 bytes, 3 carries 2, 2 carries 1. One
  // character left over encodes nothing at all.
  if (left === 1) throw new Error("age base64: a length no input produces");

  const bytes = new Uint8Array(Math.floor((text.length * 3) / 4));
  let word = 0;
  let bits = 0;
  let out = 0;
  for (let at = 0; at < text.length; at++) {
    const code = text.charCodeAt(at);
    const value = code < 128 ? (VALUES[code] as number) : -1;
    if (value < 0) throw new Error("age base64: a character outside the alphabet");
    word = (word << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[out++] = (word >>> bits) & 0xff;
    }
  }
  // Whatever is left is the tail of the final character. Canonical encoding
  // leaves it zero; anything else re-encodes to a different string.
  if (word & ((1 << bits) - 1)) throw new Error("age base64: non-canonical trailing bits");
  return bytes;
}
