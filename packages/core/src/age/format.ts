/**
 * The age v1 file format — the phone's backup, in a format something other
 * than the phone can open.
 *
 * `architecture/14` §14.3 makes an app-owned encrypted export the *whole* of
 * durability until a backend exists, and §5.7 names age specifically. This
 * file is why that name was worth writing down: the output is what `age -r
 * age1…` produces, so the restore path is `age -d -i key.txt backup.age` on
 * any machine, with no part of this repository present. A backup only this app
 * can read has the availability of this app — the thing the backup exists
 * because you cannot rely on.
 *
 * ## The file
 *
 * ```
 * age-encryption.org/v1
 * -> X25519 <ephemeral share>
 * <the file key, wrapped>
 * --- <HMAC over everything above>
 * <16-byte nonce><STREAM chunks>
 * ```
 *
 * A random 16-byte **file key** encrypts nothing directly. It is wrapped once
 * per recipient, and it keys the two things that follow: the header's MAC and,
 * through the payload nonce, the stream. That indirection is what lets one
 * file carry several recipients without re-encrypting the body, and why the
 * stanza list is a list even though this app writes one.
 *
 * ## Four places this is easy to get quietly wrong
 *
 * **The MAC covers the header's own bytes, through `---` and not one further.**
 * Not the space after it, and — the part a reconstruction gets wrong — not a
 * re-rendering of the stanzas this reader understood. A header may carry
 * recipients for other keys and unknown stanza types it must ignore; MAC-ing
 * what was parsed rather than what arrived silently accepts a header with a
 * stanza removed. So the bytes are kept as they were read.
 *
 * **The last chunk is marked, and the mark is authenticated.** STREAM's final
 * nonce byte is `0x01`, and it is part of the AEAD nonce rather than the
 * plaintext, so truncating a file changes which chunk claims to be last and the
 * tag stops verifying. Without it, a file cut at a chunk boundary decrypts
 * cleanly to a shorter ledger — a backup silently missing its most recent
 * months, which is the half you would actually want back.
 *
 * **An empty final chunk is only legal as the only chunk.** Otherwise a file
 * could be extended with a bare tag that decrypts to nothing, giving the same
 * plaintext two encodings and a second valid length.
 *
 * **An all-zero X25519 shared secret is refused.** Curve25519 maps a small
 * subgroup to the identity, so a recipient drawn from that set makes the
 * wrapping key a constant that does not depend on the ephemeral secret at all.
 *
 * None of those four is caught by encrypting and decrypting with this file —
 * all four are caught by `format.test.ts`, which runs age's own published
 * conformance vectors.
 */

import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import * as base64 from "./base64.ts";
import { decodeIdentity, decodeRecipient, type RandomBytes } from "./keys.ts";

const VERSION_LINE = "age-encryption.org/v1";
const STANZA_MARK = "-> ";
const X25519_TYPE = "X25519";
const MAC_MARK = "---";

const FILE_KEY_BYTES = 16;
const KEY_BYTES = 32;
const PAYLOAD_NONCE_BYTES = 16;
const WRAP_NONCE = new Uint8Array(12);

/** 64 KiB of plaintext per chunk, from the format; the tag makes each stored chunk 16 longer. */
const CHUNK_BYTES = 64 * 1024;
const TAG_BYTES = 16;
/** Stanza bodies wrap here. A body's last line is the first one shorter than this. */
const WRAP_COLUMNS = 64;

function ascii(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let at = 0; at < text.length; at++) {
    const code = text.charCodeAt(at);
    if (code > 0x7f) throw new Error("age: the header is ASCII by the format");
    bytes[at] = code;
  }
  return bytes;
}

function concat(parts: Uint8Array[]): Uint8Array {
  let length = 0;
  for (const part of parts) length += part.length;
  const out = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/**
 * The X25519 shared secret, with the two ways it can be worthless refused in
 * one place and in this format's own words.
 *
 * Curve25519 maps a small subgroup to the identity, so a share drawn from that
 * set makes the wrapping key a constant that does not depend on the ephemeral
 * secret at all. noble refuses most of them itself — and says *invalid private
 * or public key received*, which tells the owner of a backup nothing. The
 * all-zero check is age's own, and stands whether or not the library got there
 * first.
 */
function sharedSecret(secret: Uint8Array, share: Uint8Array): Uint8Array {
  let shared: Uint8Array;
  try {
    shared = x25519.getSharedSecret(secret, share);
  } catch {
    throw new Error("age: a share that is not a usable X25519 point");
  }
  if (shared.every((byte) => byte === 0)) {
    throw new Error("age: an all-zero shared secret — a small-order point");
  }
  return shared;
}

/** Constant-time, because this compares a MAC against one an attacker supplied. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let differences = 0;
  for (let at = 0; at < a.length; at++) differences |= (a[at] as number) ^ (b[at] as number);
  return differences === 0;
}

/** HKDF-SHA256 as age spells it: the file key or shared secret is the IKM, never the salt. */
const derive = (ikm: Uint8Array, salt: Uint8Array, info: string) =>
  hkdf(sha256, ikm, salt, ascii(info), 32);

const headerMacKey = (fileKey: Uint8Array) => derive(fileKey, new Uint8Array(0), "header");

/** The nonce for chunk `index`, with the final-chunk flag in its last byte. */
function chunkNonce(index: number, final: boolean): Uint8Array {
  const nonce = new Uint8Array(12);
  // Eleven big-endian bytes, written from the low end. `Number` is exact to
  // 2^53 and 2^53 chunks is 576 exabytes, so the top three stay zero; the
  // throw is there so that stays a fact rather than an assumption.
  let left = index;
  for (let at = 10; at >= 0 && left > 0; at--) {
    nonce[at] = left % 256;
    left = Math.floor(left / 256);
  }
  if (left > 0) throw new Error("age: more chunks than the nonce can count");
  nonce[11] = final ? 1 : 0;
  return nonce;
}

/**
 * Encrypts `plaintext` to one `age1…` recipient.
 *
 * `random` supplies the file key, the ephemeral secret and the payload nonce.
 * It is a parameter because the phone's `crypto` global carries only the
 * `randomUUID` that `polyfills.ts` installs — anything reaching for
 * `getRandomValues`, here or inside a dependency, throws on the device and
 * nowhere else.
 */
export function encrypt(plaintext: Uint8Array, recipient: string, random: RandomBytes): Uint8Array {
  const recipientKey = decodeRecipient(recipient);
  const fileKey = randomOf(random, FILE_KEY_BYTES, "file key");
  const ephemeralSecret = randomOf(random, KEY_BYTES, "ephemeral secret");

  const ephemeralShare = x25519.getPublicKey(ephemeralSecret);
  const wrapKey = derive(
    sharedSecret(ephemeralSecret, recipientKey),
    concat([ephemeralShare, recipientKey]),
    "age-encryption.org/v1/X25519",
  );
  const wrappedFileKey = chacha20poly1305(wrapKey, WRAP_NONCE).encrypt(fileKey);

  const header =
    `${VERSION_LINE}\n` +
    `${STANZA_MARK}${X25519_TYPE} ${base64.encode(ephemeralShare)}\n` +
    `${base64.encode(wrappedFileKey)}\n` +
    MAC_MARK;
  const mac = hmac(sha256, headerMacKey(fileKey), ascii(header));

  const payloadNonce = randomOf(random, PAYLOAD_NONCE_BYTES, "payload nonce");
  return concat([
    ascii(`${header} ${base64.encode(mac)}\n`),
    payloadNonce,
    streamEncrypt(plaintext, derive(fileKey, payloadNonce, "payload")),
  ]);
}

function randomOf(random: RandomBytes, length: number, what: string): Uint8Array {
  const bytes = random(length);
  if (bytes.length !== length) {
    throw new Error(
      `age: asked for ${length} random bytes for the ${what} and got ${bytes.length}`,
    );
  }
  return bytes;
}

/** Decrypts a file written to `identity`, or throws saying which check failed. */
export function decrypt(file: Uint8Array, identity: string): Uint8Array {
  const secret = decodeIdentity(identity);
  const publicKey = x25519.getPublicKey(secret);
  const header = parseHeader(file);

  const fileKey = unwrap(header.shares, secret, publicKey);
  if (fileKey === null) throw new Error("age: this key does not open this file");

  if (!sameBytes(hmac(sha256, headerMacKey(fileKey), header.macCovers), header.mac)) {
    throw new Error("age: the header has been altered");
  }

  const payload = file.subarray(header.payloadAt);
  if (payload.length < PAYLOAD_NONCE_BYTES) throw new Error("age: the payload has no nonce");
  return streamDecrypt(
    payload.subarray(PAYLOAD_NONCE_BYTES),
    derive(fileKey, payload.subarray(0, PAYLOAD_NONCE_BYTES), "payload"),
  );
}

/**
 * The file key, from whichever X25519 stanza this identity opens — `null` when
 * none does, which is a legitimate outcome (a file for somebody else) rather
 * than a malformed one.
 */
function unwrap(
  shares: { share: Uint8Array; body: Uint8Array }[],
  secret: Uint8Array,
  publicKey: Uint8Array,
): Uint8Array | null {
  for (const { share, body } of shares) {
    const wrapKey = derive(
      sharedSecret(secret, share),
      concat([share, publicKey]),
      "age-encryption.org/v1/X25519",
    );
    let fileKey: Uint8Array;
    try {
      fileKey = chacha20poly1305(wrapKey, WRAP_NONCE).decrypt(body);
    } catch {
      continue;
    }
    // No length check here: `parseHeader` already refuses a body that is not
    // 16 bytes plus a tag, so by this point the plaintext cannot be another
    // size. A second check would read as defence and be unreachable, which is
    // the kind of claim this repository treats as a defect rather than
    // belt-and-braces.
    return fileKey;
  }
  return null;
}

type ParsedHeader = {
  /** Every X25519 stanza, in file order. Other types are skipped, by the format's own rule. */
  shares: { share: Uint8Array; body: Uint8Array }[];
  mac: Uint8Array;
  /** The header's own bytes, through `---` — what the MAC is taken over. */
  macCovers: Uint8Array;
  payloadAt: number;
};

function parseHeader(file: Uint8Array): ParsedHeader {
  const lines = readAsciiLines(file);
  if (lines.next() !== VERSION_LINE) throw new Error("age: not an age v1 file");

  const shares: ParsedHeader["shares"] = [];
  for (;;) {
    const line = lines.next();
    if (line.startsWith(`${MAC_MARK} `)) {
      const mac = base64.decode(line.slice(MAC_MARK.length + 1));
      if (mac.length !== 32) throw new Error("age: a header MAC that is not 32 bytes");
      return { shares, mac, macCovers: lines.covered(), payloadAt: lines.at() };
    }
    if (!line.startsWith(STANZA_MARK)) throw new Error("age: a header line that is not a stanza");

    const arguments_ = line.slice(STANZA_MARK.length).split(" ");
    const [type, ...rest] = arguments_;
    const body = base64.decode(readStanzaBody(lines));
    // A stanza type this reader does not handle is ignorable by the format's
    // own rule, and GREASE relies on it.
    if (type !== X25519_TYPE) continue;

    // For a type this reader *does* handle, a wrong shape is a broken header
    // rather than something to skip past.
    if (rest.length !== 1) throw new Error("age: an X25519 stanza with the wrong argument count");
    const share = base64.decode(rest[0] as string);
    if (share.length !== KEY_BYTES) throw new Error("age: an ephemeral share that is not 32 bytes");
    if (body.length !== FILE_KEY_BYTES + TAG_BYTES) {
      throw new Error("age: an X25519 body of the wrong length");
    }
    shares.push({ share, body });
  }
}

/** Body lines wrap at 64; the first line shorter than that ends the body, and a full one cannot. */
function readStanzaBody(lines: AsciiLines): string {
  let body = "";
  for (;;) {
    const line = lines.next();
    if (line.length > WRAP_COLUMNS) throw new Error("age: a stanza body line over 64 columns");
    body += line;
    if (line.length < WRAP_COLUMNS) return body;
  }
}

type AsciiLines = {
  /** The next line, without its newline. Throws rather than running into the payload. */
  next: () => string;
  /** How far into the file the reader is — where the payload begins, once the MAC line is read. */
  at: () => number;
  /** Everything read so far minus the MAC line's ` <mac>\n`: the bytes the MAC covers. */
  covered: () => Uint8Array;
};

/**
 * The header is ASCII and the payload is arbitrary bytes, so the split is a
 * scan for newlines rather than decoding the file as text. `covered` hands back
 * the original bytes rather than anything re-rendered, which is the point.
 */
function readAsciiLines(file: Uint8Array): AsciiLines {
  let at = 0;
  let lineStart = 0;
  return {
    at: () => at,
    covered: () => file.subarray(0, lineStart + MAC_MARK.length),
    next: () => {
      lineStart = at;
      let text = "";
      for (;;) {
        if (at >= file.length) throw new Error("age: the header ends before it is complete");
        const byte = file[at++] as number;
        if (byte === 0x0a) return text;
        // A stray CR would otherwise ride along inside a base64 field and be
        // reported as an alphabet error two layers down.
        if (byte < 0x20 || byte > 0x7e) throw new Error("age: a non-printable byte in the header");
        text += String.fromCharCode(byte);
      }
    },
  };
}

function streamEncrypt(plaintext: Uint8Array, key: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  // An empty plaintext is still one chunk: a zero-length final chunk with its
  // tag. A file of no bytes and a file that stops after the nonce are
  // different things, and only one of them is valid.
  const count = Math.max(1, Math.ceil(plaintext.length / CHUNK_BYTES));
  for (let index = 0; index < count; index++) {
    const from = index * CHUNK_BYTES;
    const slice = plaintext.subarray(from, Math.min(from + CHUNK_BYTES, plaintext.length));
    chunks.push(chacha20poly1305(key, chunkNonce(index, index === count - 1)).encrypt(slice));
  }
  return concat(chunks);
}

function streamDecrypt(payload: Uint8Array, key: Uint8Array): Uint8Array {
  if (payload.length === 0) throw new Error("age: the payload has no chunks");
  const stored = CHUNK_BYTES + TAG_BYTES;
  const count = Math.ceil(payload.length / stored);
  const chunks: Uint8Array[] = [];
  for (let index = 0; index < count; index++) {
    const from = index * stored;
    const slice = payload.subarray(from, Math.min(from + stored, payload.length));
    if (slice.length < TAG_BYTES) throw new Error("age: a chunk shorter than its own tag");
    const final = index === count - 1;
    // An empty chunk is the encoding of an empty file and nothing else. Allowed
    // anywhere else, a file could be extended with a bare tag and the same
    // ledger would have two valid lengths.
    if (final && index > 0 && slice.length === TAG_BYTES) {
      throw new Error("age: an empty final chunk after a full one");
    }
    // A full-length last chunk is legitimate — a plaintext that divided evenly
    // — so which chunk is final comes from position, never from length.
    try {
      chunks.push(chacha20poly1305(key, chunkNonce(index, final)).decrypt(slice));
    } catch {
      throw new Error(
        final
          ? "age: the file is truncated or altered — its last chunk does not verify"
          : `age: chunk ${index} does not verify`,
      );
    }
  }
  return concat(chunks);
}
