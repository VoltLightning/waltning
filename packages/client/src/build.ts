/**
 * Version skew — `architecture/05`.
 *
 * The client compares its own build against the one `/healthz` reports and says
 * so when they differ. Both values are injected from the same `git rev-parse`
 * (`docker-compose.yml`), because two sources would produce a permanent false
 * mismatch.
 *
 * **Takes the client's build as an argument** rather than reading it from the
 * environment. Reading `EXPO_PUBLIC_BUILD_SHA` here would name a platform —
 * Vite exposes `import.meta.env.VITE_*` and Expo exposes `process.env.EXPO_*` —
 * and this file would stop being shareable for the sake of one string. Each app
 * reads its own; the comparison is the same everywhere.
 */

/** The value both sides use when no image was involved. */
export const DEV_BUILD = "dev";

/**
 * Whether the server is running different code from this bundle.
 *
 * Either side reading `dev` means no image was built, so there is nothing to
 * compare: in development the bundle and the server change independently by
 * design, and a warning that fires constantly is one people learn to ignore.
 */
export function isStaleBundle(clientBuild: string, serverBuild: string): boolean {
  if (clientBuild === DEV_BUILD || serverBuild === DEV_BUILD) return false;
  return clientBuild !== serverBuild;
}
