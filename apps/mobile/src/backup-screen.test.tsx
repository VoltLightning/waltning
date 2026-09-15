/**
 * @vitest-environment jsdom
 *
 * The backup screen end to end, over a real `age` round trip.
 *
 * The port is a stub only where the *device* is: the file it "writes" is kept
 * in memory. Everything else — the key, the encryption, the read-back — is the
 * shipping code, because the property worth testing on this screen is that the
 * key it shows is the key that opens the file it made. A stub encryptor would
 * make that true by construction, which is the shape of test this repository
 * keeps finding on the wrong side of a defect.
 */

import { randomBytes } from "node:crypto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createPhoneLedger,
  type PhoneLedgerPort,
} from "@waltning/client/ledger/create-phone-ledger";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { basePort } from "@waltning/client/ledger/test-port";
import { decrypt, encrypt } from "@waltning/core/age/format";
import { fingerprintOf, recipientOf } from "@waltning/core/age/keys";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { beforeEach, expect, it, vi } from "vitest";

const handed: { name: string; bytes: Uint8Array }[] = [];
const copied: string[] = [];

let clipboardTakesIt = true;

vi.mock("./platform", () => ({
  backupPort: {
    random: (length: number) => new Uint8Array(randomBytes(length)),
    hand: async (name: string, bytes: Uint8Array) => {
      handed.push({ name, bytes });
      return { confirmed: true, where: "Files" };
    },
    clipboard: async (value: string) => {
      copied.push(value);
      return clipboardTakesIt;
    },
  },
}));

import BackupScreen from "./backup-screen";

/** What the ledger's own export would return, minus the SQLite underneath it. */
function port(): PhoneLedgerPort {
  return basePort({
    exportLedger: (options) => {
      // The real `exportLedger` reads both stores and then verifies by
      // decrypting; this stands in for the reading, and leaves the encrypting
      // and the verifying to the shipping code below.
      const plaintext = new TextEncoder().encode(
        JSON.stringify({ kind: "waltning-ledger", format: 1, counts: { transactions: 2 } }),
      );
      const file = encrypt(plaintext, options.recipient, options.random);
      decrypt(file, options.verifyWith);
      return {
        file,
        manifest: {
          createdAt: options.now.toISOString(),
          recipient: options.recipient,
          bytes: file.length,
          counts: { transactions: 2, outbox: 1 },
          transactions: 2,
          outboxEntries: 1,
        },
      };
    },
  });
}

function draw() {
  const ledger = createPhoneLedger(port(), {
    capture: () => ({
      date: accountingDate("2026-09-15"),
      timeZone: "Europe/Warsaw",
      offsetMinutes: 120,
      at: new Date("2026-09-15T10:00:00Z"),
    }),
    id: () => id("33333333-3333-4333-8333-333333333333"),
  });
  render(
    <LedgerProvider controller={ledger}>
      <BackupScreen />
    </LedgerProvider>,
  );
}

beforeEach(() => {
  handed.length = 0;
  copied.length = 0;
  clipboardTakesIt = true;
});

it("offers to take a backup, and shows no key before there is one", () => {
  draw();
  expect(screen.getByRole("button", { name: "Back up" })).toBeTruthy();
  expect(screen.queryByText(/AGE-SECRET-KEY/)).toBeNull();
});

/** §14.3's whole claim, on the screen that makes it: the key shown opens the file written. */
it("shows a key that opens the file it just handed to the platform", async () => {
  draw();
  fireEvent.click(screen.getByRole("button", { name: "Back up" }));

  await waitFor(() => expect(handed).toHaveLength(1));
  const shown = screen.getByText(/^AGE-SECRET-KEY-1/).textContent ?? "";
  const written = handed[0];
  if (written === undefined) throw new Error("nothing was handed over");

  const plaintext = new TextDecoder().decode(decrypt(written.bytes, shown));
  expect(JSON.parse(plaintext)).toMatchObject({ kind: "waltning-ledger" });
});

it("pairs the file's name with the key's fingerprint", async () => {
  draw();
  fireEvent.click(screen.getByRole("button", { name: "Back up" }));

  await waitFor(() => expect(handed).toHaveLength(1));
  const name = handed[0]?.name ?? "";
  expect(name).toMatch(/^waltning-\d{4}-\d{2}-\d{2}-[a-z0-9]{6}\.age$/);
  // Derived from the key the card is showing, not from the filename: two
  // strings agreeing with each other proves nothing about either.
  const shown = screen.getByText(/^AGE-SECRET-KEY-1/).textContent ?? "";
  const fingerprint = fingerprintOf(recipientOf(shown));
  expect(name).toContain(fingerprint);
  expect(screen.getByText(fingerprint)).toBeTruthy();
  expect(screen.getByText(name)).toBeTruthy();
});

it("says the key will not be shown again, and forgets it on Done", async () => {
  draw();
  fireEvent.click(screen.getByRole("button", { name: "Back up" }));
  await waitFor(() => expect(screen.getByText(/Shown once/)).toBeTruthy());

  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(screen.queryByText(/AGE-SECRET-KEY/)).toBeNull();
  expect(screen.getByRole("button", { name: "Back up" })).toBeTruthy();
});

it("copies the key on request, and says so", async () => {
  draw();
  fireEvent.click(screen.getByRole("button", { name: "Back up" }));
  await waitFor(() => expect(handed).toHaveLength(1));

  fireEvent.click(screen.getByRole("button", { name: "Copy key" }));
  const shown = screen.getByText(/^AGE-SECRET-KEY-1/).textContent;
  expect(copied).toEqual([shown]);
  await waitFor(() => expect(screen.getByText("Copied")).toBeTruthy());
});

/** A clipboard that refuses must not look like one that worked. */
it("says a copy was refused", async () => {
  clipboardTakesIt = false;
  draw();
  fireEvent.click(screen.getByRole("button", { name: "Back up" }));
  await waitFor(() => expect(handed).toHaveLength(1));

  fireEvent.click(screen.getByRole("button", { name: "Copy key" }));
  await waitFor(() => expect(screen.getByText(/Could not copy/)).toBeTruthy());
});

it("names the unsent captures, which nothing else holds", async () => {
  draw();
  fireEvent.click(screen.getByRole("button", { name: "Back up" }));
  await waitFor(() => expect(screen.getByText("1 capture")).toBeTruthy());
});
