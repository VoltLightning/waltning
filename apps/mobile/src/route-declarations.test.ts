/**
 * **Every screen the root stack declares is a route that exists.**
 *
 * `app/_layout.tsx` names its screens by string, and a name with no file
 * behind it is not an error — Expo Router logs `No route named …` on the
 * device and the screen's options silently apply to nothing. Moving Accounts
 * into the tabs left `accounts/index` declared for a file that was gone; the
 * emulator showed the warning and nothing else would have.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "../app");
const layout = readFileSync(resolve(app, "_layout.tsx"), "utf8");

it("declares only screens whose route files exist", () => {
  const names = [...layout.matchAll(/<Stack\.Screen\s+name="([^"]+)"/g)].map((m) => m[1] ?? "");
  expect(names.length).toBeGreaterThan(0);
  const missing = names.filter(
    (name) =>
      !existsSync(resolve(app, `${name}.tsx`)) && !existsSync(resolve(app, name, "_layout.tsx")),
  );
  expect(missing).toEqual([]);
});
