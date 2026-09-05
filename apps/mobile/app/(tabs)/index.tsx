import { useBreakpoint } from "@waltning/ui/primitives/use-breakpoint";
import Dashboard from "../../src/dashboard-screen";
import Today from "../../src/today-screen";

/**
 * The landing route — `S01`/`S04`, picked by width, never a toggle either
 * screen owns. `app/` composes by definition (`architecture.test.ts`'s own
 * "apps hold only what names a platform"), so the breakpoint read lives here
 * rather than in a `src/` file with nothing platform-bound in it — that file
 * was itself the thing the architecture suite refuses, "shareable code in an
 * app." `useBreakpoint()` is called, never defined, so the sibling rule
 * ("a route composes and does not define hooks") still holds.
 *
 * `today-screen.tsx` stays byte-for-byte untouched by `DESK4` — the phone
 * renders exactly what it always did, and only the desk gets a new screen
 * underneath the same `DeskBand`.
 */
export default function Index() {
  const breakpoint = useBreakpoint();
  if (breakpoint === "desk") return <Dashboard />;
  return <Today />;
}
