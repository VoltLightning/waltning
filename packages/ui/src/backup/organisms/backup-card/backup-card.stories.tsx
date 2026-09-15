/**
 * `BackupCard` — what `architecture/14` §14.3's export leaves you holding.
 * The key is the hero; the rows under it are what the file contains.
 */

import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { fingerprintOf, generateKeyPair } from "@waltning/core/age/keys";
import { BackupCard } from "./backup-card";

function noop() {}

/**
 * A throwaway pair, derived from a fixed seed rather than written down.
 *
 * Not a published example and not a live key: a key-shaped literal in a source
 * file is exactly what the repository's pre-commit hook exists to refuse, and
 * "this one is only an example" is a claim a scanner cannot check. Deriving it
 * also means the fingerprint below genuinely belongs to the key beside it — a
 * literal here once did not, and every story, baseline and drawing carried the
 * mistake.
 */
const SEED = (length: number) => Uint8Array.from({ length }, (_, at) => (at * 37 + 11) & 0xff);
const EXAMPLE = generateKeyPair(SEED);
const EXAMPLE_KEY = EXAMPLE.identity;
const EXAMPLE_FINGERPRINT = fingerprintOf(EXAMPLE.recipient);
const EXAMPLE_FILE = `waltning-2026-09-15-${EXAMPLE_FINGERPRINT}.age`;

const meta = {
  title: "Backup/BackupCard",
  component: BackupCard,
  args: {
    identity: EXAMPLE_KEY,
    fingerprint: EXAMPLE_FINGERPRINT,
    summary: {
      transactions: 1180,
      outboxEntries: 3,
      bytes: 2_412_544,
      filename: EXAMPLE_FILE,
      where: "Files · On My iPhone",
      confirmed: true,
    },
  },
} satisfies Meta<typeof BackupCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A backup with captures still waiting — the row that names what nothing else holds. */
export const Kept: Story = { args: { onCopyKey: noop } };

/** Nothing unsent: the row is absent rather than showing a zero. */
export const NothingUnsent: Story = {
  args: {
    onCopyKey: noop,
    summary: {
      transactions: 1180,
      outboxEntries: 0,
      bytes: 2_412_544,
      filename: EXAMPLE_FILE,
      where: "Files · On My iPhone",
      confirmed: true,
    },
  },
};

/**
 * No clipboard on this platform. The copy button is gone rather than inert,
 * and the key stays selectable — the fallback the card is built around.
 *
 * The prop is **omitted**, not set to `undefined`: `exactOptionalPropertyTypes`
 * makes those different, and the absent one is what a platform port without a
 * clipboard actually produces.
 */
export const NoClipboard: Story = {};

/** A first backup on a ledger that has barely started. */
export const Small: Story = {
  args: {
    onCopyKey: noop,
    summary: {
      transactions: 4,
      outboxEntries: 0,
      bytes: 3_100,
      filename: EXAMPLE_FILE,
      where: "your downloads",
      confirmed: false,
    },
  },
};
