/**
 * @vitest-environment jsdom
 *
 * The restore screen over a **real** age round trip: a file this app exported,
 * opened with the key it was exported to. The port is stubbed only where the
 * device is — the picker — because the property worth testing is that a backup
 * taken by this app can be read back by it, and a stub decryptor would make
 * that true by construction.
 */

import { randomBytes } from "node:crypto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createPhoneLedger,
  type PhoneLedgerPort,
} from "@waltning/client/ledger/create-phone-ledger";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { basePort } from "@waltning/client/ledger/test-port";
import { encrypt } from "@waltning/core/age/format";
import { generateKeyPair } from "@waltning/core/age/keys";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { beforeEach, expect, it, vi } from "vitest";

const random = (length: number) => new Uint8Array(randomBytes(length));
const keys = generateKeyPair(random);

/** A document exactly as `document.ts` writes one. */
const DOCUMENT = {
  kind: "waltning-ledger" as const,
  format: 1,
  createdAt: "2026-09-14T08:00:00.000Z",
  schema: { replica: 16, outbox: 3 },
  recipient: keys.recipient,
  counts: { transactions: 1180, outbox: 3 },
  replica: {},
  outbox: {},
};

let picked: { name: string; bytes: Uint8Array } | null = null;
const restored: unknown[] = [];

vi.mock("expo-router", () => ({
  router: { push: vi.fn(), back: vi.fn(), canGoBack: () => true, dismissTo: vi.fn() },
}));

vi.mock("./platform", () => ({
  backupPort: {
    // Inline rather than the module-scope `random` above: `vi.mock` hoists,
    // so a factory closing over a `const` reads it before initialisation.
    random: (length: number) => new Uint8Array(randomBytes(length)),
    hand: async () => ({ confirmed: true, where: "Files" }),
    pick: async () => picked,
    clipboard: null,
  },
}));

import RestoreScreen from "./restore-screen";

function draw(over: Partial<PhoneLedgerPort> = {}) {
  const port = basePort({
    readBackup: (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes)),
    describeBackup: (backup: { counts: Record<string, number>; createdAt: string }) => ({
      createdAt: backup.createdAt,
      recipient: keys.recipient,
      bytes: 2048,
      counts: backup.counts,
      transactions: backup.counts["transactions"] ?? 0,
      outboxEntries: backup.counts["outbox"] ?? 0,
    }),
    restoreLedger: (backup: unknown) => {
      restored.push(backup);
      return { counts: { transactions: 1180 } };
    },
    ...over,
  });
  render(
    <LedgerProvider
      controller={createPhoneLedger(port, {
        capture: () => ({
          date: accountingDate("2026-09-16"),
          timeZone: "Europe/Warsaw",
          offsetMinutes: 120,
          at: new Date("2026-09-16T10:00:00Z"),
        }),
        id: () => id("33333333-3333-4333-8333-333333333333"),
      })}
    >
      <RestoreScreen />
    </LedgerProvider>,
  );
}

/** A real `.age` file of that document, encrypted to the key below. */
function fileOf(document: unknown, recipient = keys.recipient) {
  return {
    name: "waltning-2026-09-14-abc123.age",
    bytes: encrypt(new TextEncoder().encode(JSON.stringify(document)), recipient, random),
  };
}

beforeEach(() => {
  picked = fileOf(DOCUMENT);
  restored.length = 0;
});

it("asks for a key and a file, and says what a restore does before either", () => {
  draw();
  expect(screen.getByText(/fills an empty ledger/)).toBeDefined();
  expect(screen.getByLabelText("Your key")).toBeDefined();
  expect(screen.getByRole("button", { name: "Choose a file" })).toBeDefined();
});

/** §14.3's other half: a file this app wrote, read back by it. */
it("opens a real backup and shows what is in it, writing nothing yet", async () => {
  draw();
  fireEvent.change(screen.getByLabelText("Your key"), { target: { value: keys.identity } });
  fireEvent.click(screen.getByRole("button", { name: "Choose a file" }));

  await waitFor(() => expect(screen.getByText("In this file")).toBeDefined());
  expect(screen.getByText("waltning-2026-09-14-abc123.age")).toBeDefined();
  expect(screen.getByText("1180 entries")).toBeDefined();
  expect(screen.getByText("3 captures")).toBeDefined();
  // Nothing written until the second step.
  expect(restored).toHaveLength(0);
});

it("writes only when the second step is taken", async () => {
  draw();
  fireEvent.change(screen.getByLabelText("Your key"), { target: { value: keys.identity } });
  fireEvent.click(screen.getByRole("button", { name: "Choose a file" }));
  await waitFor(() => expect(screen.getByText("In this file")).toBeDefined());

  fireEvent.click(screen.getByRole("button", { name: "Restore this" }));
  await waitFor(() => expect(screen.getByText("Restored")).toBeDefined());
  expect(restored).toHaveLength(1);
});

it("lets the reader back out with nothing written", async () => {
  draw();
  fireEvent.change(screen.getByLabelText("Your key"), { target: { value: keys.identity } });
  fireEvent.click(screen.getByRole("button", { name: "Choose a file" }));
  await waitFor(() => expect(screen.getByText("In this file")).toBeDefined());

  fireEvent.click(screen.getByRole("button", { name: "Not this one" }));
  expect(screen.getByRole("button", { name: "Choose a file" })).toBeDefined();
  expect(restored).toHaveLength(0);
});

/**
 * The message on the worst day. A wrong key has to be *a wrong key*, because
 * the alternative conclusion is that the ledger is gone.
 */
it("says the key does not open the file, rather than a code", async () => {
  const stranger = generateKeyPair(random);
  draw();
  fireEvent.change(screen.getByLabelText("Your key"), { target: { value: stranger.identity } });
  fireEvent.click(screen.getByRole("button", { name: "Choose a file" }));

  await waitFor(() => expect(screen.getByText(/does not open this file/)).toBeDefined());
  expect(screen.getByText(/Nothing was written/)).toBeDefined();
  expect(restored).toHaveLength(0);
});

it("refuses a mistyped key on its checksum, before it blames the file", async () => {
  draw();
  fireEvent.change(screen.getByLabelText("Your key"), {
    target: { value: `${keys.identity.slice(0, -2)}ZZ` },
  });
  fireEvent.click(screen.getByRole("button", { name: "Choose a file" }));

  await waitFor(() => expect(screen.getByText(/checksum failed/)).toBeDefined());
});

/** A dismissed picker is the commonest thing a person does with a file dialog. */
it("treats a dismissed picker as nothing happening", async () => {
  picked = null;
  draw();
  fireEvent.change(screen.getByLabelText("Your key"), { target: { value: keys.identity } });
  fireEvent.click(screen.getByRole("button", { name: "Choose a file" }));

  await waitFor(() => expect(screen.getByRole("button", { name: "Choose a file" })).toBeDefined());
  expect(screen.queryByText(/did not restore/)).toBeNull();
});
