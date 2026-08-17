/**
 * Build identity.
 *
 * `/healthz` reports this and the client compares it against its own on
 * foreground; a mismatch prompts a reload (`architecture/05`). Without it a
 * browser holds a bundle whose `opVersion` the server no longer accepts — the
 * version-skew row in the status table.
 *
 * Injected at image build time. The dev fallback is deliberately not a git
 * shell-out: the API must start with no git directory present, which is exactly
 * the case inside the container.
 */
export const BUILD: string = process.env["BUILD_SHA"] ?? "dev";
