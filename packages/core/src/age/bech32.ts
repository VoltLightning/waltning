/**
 * Bech32, because that is how an age key is written down.
 *
 * `age1qyqszq…` and `AGE-SECRET-KEY-1QYQSZQ…` are BIP-173 bech32 strings, and
 * the reason the format matters here is the reason it was invented: these are
 * strings a person copies out of a password manager, reads off a screen, or
 * retypes. The checksum catches a transposition or a substituted character
 * before the app tries to decrypt five years of ledger with the wrong key and
 * reports only that the tag did not verify.
 *
 * **bech32, not bech32m.** age predates the m variant and did not move; a
 * generator constant of 1 is what its own decoder checks against, so a key
 * this file produced must satisfy the same.
 */

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const VALUES = (() => {
  const values = new Int8Array(128).fill(-1);
  for (let at = 0; at < CHARSET.length; at++) values[CHARSET.charCodeAt(at)] = at;
  return values;
})();

const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values: number[]): number {
  let check = 1;
  for (const value of values) {
    const top = check >>> 25;
    check = ((check & 0x1ffffff) << 5) ^ value;
    for (let bit = 0; bit < 5; bit++) if ((top >>> bit) & 1) check ^= GENERATOR[bit] as number;
  }
  return check;
}

/** The human-readable part, split high bits then low, with the documented zero between. */
function expand(hrp: string): number[] {
  const high: number[] = [];
  const low: number[] = [];
  for (let at = 0; at < hrp.length; at++) {
    const code = hrp.charCodeAt(at);
    high.push(code >>> 5);
    low.push(code & 31);
  }
  return [...high, 0, ...low];
}

/**
 * 8-bit bytes to 5-bit groups and back.
 *
 * `pad` is the direction's whole asymmetry: going out, a trailing partial
 * group is zero-filled; coming back, those zeros must *not* become a byte, and
 * a non-zero remainder means the string was not produced from any byte string.
 */
function regroup(data: ArrayLike<number>, from: number, to: number, pad: boolean): number[] {
  let word = 0;
  let bits = 0;
  const out: number[] = [];
  const max = (1 << to) - 1;
  for (let at = 0; at < data.length; at++) {
    const value = data[at] as number;
    if (value < 0 || value >>> from !== 0) throw new Error("bech32: a value wider than its group");
    word = (word << from) | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push((word >>> bits) & max);
    }
  }
  if (pad) {
    if (bits > 0) out.push((word << (to - bits)) & max);
  } else if (bits >= from || ((word << (to - bits)) & max) !== 0) {
    throw new Error("bech32: a remainder no byte string produces");
  }
  return out;
}

export function encode(rawHrp: string, bytes: Uint8Array): string {
  // The checksum is defined over the *lowercase* human-readable part. An
  // uppercase bech32 string — which is what `AGE-SECRET-KEY-1…` is — is the
  // lowercase one uppercased whole, never a separate encoding; computing the
  // checksum over the uppercase letters produces a string that fails its own
  // decoder.
  const hrp = rawHrp.toLowerCase();
  const data = regroup(bytes, 8, 5, true);
  const check = polymod([...expand(hrp), ...data, 0, 0, 0, 0, 0, 0]) ^ 1;
  let out = `${hrp}1`;
  for (const value of data) out += CHARSET.charAt(value);
  for (let at = 0; at < 6; at++) out += CHARSET.charAt((check >>> (5 * (5 - at))) & 31);
  return out;
}

/** Decodes and verifies, or throws naming which half failed — the checksum is the point. */
export function decode(text: string, expectedHrp: string): Uint8Array {
  const lower = text.toLowerCase();
  if (text !== lower && text !== text.toUpperCase()) {
    throw new Error("bech32: mixed case, which no checksum covers");
  }
  const split = lower.lastIndexOf("1");
  if (split < 1 || split + 7 > lower.length) throw new Error("bech32: no separator");
  const hrp = lower.slice(0, split);
  if (hrp !== expectedHrp.toLowerCase()) {
    throw new Error(`bech32: expected a ${expectedHrp} key, got ${hrp}`);
  }
  const data: number[] = [];
  for (let at = split + 1; at < lower.length; at++) {
    const code = lower.charCodeAt(at);
    const value = code < 128 ? (VALUES[code] as number) : -1;
    if (value < 0) throw new Error("bech32: a character outside the alphabet");
    data.push(value);
  }
  if (polymod([...expand(hrp), ...data]) !== 1) throw new Error("bech32: checksum failed");
  return Uint8Array.from(regroup(data.slice(0, -6), 5, 8, false));
}
