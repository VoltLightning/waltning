/** @vitest-environment jsdom */

/**
 * The card's one non-negotiable: **a key on screen is a key the person can
 * still act on, and a card with no backup never shows one.**
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { fingerprintOf, generateKeyPair, recipientOf } from "@waltning/core/age/keys";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BackupCard, type BackupCardProps } from "./backup-card";

/** A throwaway pair from a fixed seed — never a published or live key. */
const EXAMPLE = generateKeyPair((length) =>
  Uint8Array.from({ length }, (_, at) => (at * 37 + 11) & 0xff),
);
const KEY = EXAMPLE.identity;
const FINGERPRINT = fingerprintOf(EXAMPLE.recipient);
const FILE = `waltning-2026-09-15-${FINGERPRINT}.age`;

const KEPT = {
  identity: KEY,
  fingerprint: FINGERPRINT,
  summary: {
    transactions: 1180,
    outboxEntries: 3,
    bytes: 2_412_544,
    filename: FILE,
    where: "Files",
    confirmed: true,
  },
} as const satisfies BackupCardProps;

afterEach(cleanup);

function draw(over: Partial<BackupCardProps> = {}) {
  const props: BackupCardProps = { ...KEPT, ...over };
  render(<BackupCard {...props} />);
  return props;
}

describe("the key's card", () => {
  it("shows the whole key, not a truncation of it", () => {
    draw();
    // A key shown with an ellipsis cannot be typed back in, and this is the
    // string with no second copy anywhere.
    expect(screen.getByText(KEY)).toBeTruthy();
  });

  it("says it will not be shown again", () => {
    draw();
    expect(screen.getByText(/Shown once/)).toBeTruthy();
  });

  /**
   * The pairing, checked against the key rather than against two literals. The
   * literals were wrong — they came from an unrelated key in age's README —
   * and every story, baseline and drawing carried the mistake, because two
   * strings agreeing with each other proves nothing about either.
   */
  it("pairs the file with the key the card is showing", () => {
    draw();
    const shown = screen.getByText(/^AGE-SECRET-KEY-1/).textContent ?? "";
    const derived = fingerprintOf(recipientOf(shown));
    expect(screen.getByText(derived)).toBeTruthy();
    expect(screen.getByText(new RegExp(`${derived}\\.age$`))).toBeTruthy();
  });

  /** A label naming the card's heading replaced the key in the accessibility tree. */
  it("leaves the key readable to a screen reader", () => {
    draw();
    const key = screen.getByText(/^AGE-SECRET-KEY-1/);
    expect(key.getAttribute("aria-label")).toBeNull();
  });

  it("says what a copy did, rather than rendering success and failure alike", () => {
    draw({ onCopyKey: vi.fn(), copied: "copied" });
    expect(screen.getByText("Copied")).toBeTruthy();
    cleanup();

    draw({ onCopyKey: vi.fn(), copied: "refused" });
    expect(screen.getByText(/Could not copy/)).toBeTruthy();
  });

  /** A browser is never told what became of a download, so the row must not claim it. */
  it("says check rather than kept in when the platform could not confirm", () => {
    draw({ summary: { ...KEPT.summary, confirmed: false, where: "your downloads" } });
    expect(screen.getByText("Check")).toBeTruthy();
    expect(screen.queryByText("Kept in")).toBeNull();
  });

  it("names the unsent captures, which nothing else holds", () => {
    draw();
    expect(screen.getByText("3 captures")).toBeTruthy();
  });

  it("leaves the unsent row out when there is nothing waiting", () => {
    draw({ summary: { ...KEPT.summary, outboxEntries: 0 } });
    expect(screen.queryByText("Not yet sent")).toBeNull();
  });

  it("copies on request", () => {
    const onCopyKey = vi.fn();
    draw({ onCopyKey });
    fireEvent.click(screen.getByRole("button", { name: "Copy key" }));
    expect(onCopyKey).toHaveBeenCalledWith(KEY);
  });

  /** A copy button that does nothing is worse than none; `selectable` text is the fallback. */
  it("offers no copy where the platform has no clipboard", () => {
    draw();
    expect(screen.queryByRole("button", { name: "Copy key" })).toBeNull();
    expect(screen.getByText(KEY)).toBeTruthy();
  });
});
