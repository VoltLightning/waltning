/**
 * An age identity — the key the owner writes down, and the one the export is
 * encrypted to.
 *
 * `age1…` is the recipient, `AGE-SECRET-KEY-1…` the identity, and the pair is
 * X25519. The strings are exactly what the `age` command line reads, which is
 * the property the whole backup rests on: **the restore path must not depend
 * on this app still existing.** A backup only this program can open is a
 * backup whose availability is the availability of this program.
 *
 * **Randomness arrives as an argument.** The phone has no `crypto` global
 * beyond the `randomUUID` that `polyfills.ts` installs, so anything reaching
 * for `crypto.getRandomValues` — this file, or a dependency doing it out of
 * sight — throws on the device and nowhere else, which is the failure mode
 * `random.ts` was written to stop repeating. Taking the source as a parameter
 * also makes the format testable against age's own published vectors, which
 * pin the ephemeral secret and cannot be reproduced by anything that fetches
 * its own entropy.
 */

import { x25519 } from "@noble/curves/ed25519.js";
import * as bech32 from "./bech32.ts";

/** The human-readable parts, from age's own spec. The identity's includes its trailing hyphen. */
const RECIPIENT_HRP = "age";
const IDENTITY_HRP = "AGE-SECRET-KEY-";

/** How a runtime hands over `length` unpredictable bytes. `expo-crypto` on the phone, `node:crypto` in tests. */
export type RandomBytes = (length: number) => Uint8Array;

/** The public half — `age1…`, what a file is encrypted *to*. */
export type AgeRecipient = string & { readonly __brand: "AgeRecipient" };
/** The secret half — `AGE-SECRET-KEY-1…`, what opens it. Uppercase, by the format. */
export type AgeIdentity = string & { readonly __brand: "AgeIdentity" };

export type AgeKeyPair = { identity: AgeIdentity; recipient: AgeRecipient };

const KEY_BYTES = 32;

/** A fresh pair. The identity is the only copy that matters — nothing here escrows it. */
export function generateKeyPair(random: RandomBytes): AgeKeyPair {
  const secret = random(KEY_BYTES);
  if (secret.length !== KEY_BYTES) {
    throw new Error(`age: asked for ${KEY_BYTES} random bytes and got ${secret.length}`);
  }
  return {
    identity: encodeIdentity(secret),
    recipient: encodeRecipient(x25519.getPublicKey(secret)),
  };
}

export function encodeIdentity(secret: Uint8Array): AgeIdentity {
  return bech32.encode(IDENTITY_HRP, secret).toUpperCase() as AgeIdentity;
}

export function encodeRecipient(publicKey: Uint8Array): AgeRecipient {
  return bech32.encode(RECIPIENT_HRP, publicKey) as AgeRecipient;
}

/** The raw scalar behind an `AGE-SECRET-KEY-1…` string, checksum verified. */
export function decodeIdentity(identity: string): Uint8Array {
  const bytes = bech32.decode(identity.trim(), IDENTITY_HRP);
  if (bytes.length !== KEY_BYTES) throw new Error("age: an identity that is not 32 bytes");
  return bytes;
}

/** The raw point behind an `age1…` string, checksum verified. */
export function decodeRecipient(recipient: string): Uint8Array {
  const bytes = bech32.decode(recipient.trim(), RECIPIENT_HRP);
  if (bytes.length !== KEY_BYTES) throw new Error("age: a recipient that is not 32 bytes");
  return bytes;
}

/**
 * Six characters off a recipient's data part — how a file and its key find
 * each other.
 *
 * Not a hash: the recipient is already the output of one, and a prefix of the
 * bech32 body is something a person can check against the key string itself
 * rather than a second value they have to trust. Collisions matter only within
 * one owner's folder of backups, where six base32 characters is a billion
 * to one.
 *
 * **It refuses anything that is not an `age1…` recipient**, because the one
 * mistake available here is passing the identity instead:
 * `AGE-SECRET-KEY-1…` sliced at the same offsets returns `SECRET`, a
 * plausible-looking fingerprint on every backup ever taken.
 */
export function fingerprintOf(recipient: string): string {
  if (!recipient.startsWith(`${RECIPIENT_HRP}1`)) {
    throw new Error("age: a fingerprint is taken from the recipient, not the identity");
  }
  return recipient.slice(RECIPIENT_HRP.length + 1, RECIPIENT_HRP.length + 7);
}

/** The recipient an identity opens — so a restore can say *this file is not yours* before it tries. */
export function recipientOf(identity: string): AgeRecipient {
  return encodeRecipient(x25519.getPublicKey(decodeIdentity(identity)));
}
