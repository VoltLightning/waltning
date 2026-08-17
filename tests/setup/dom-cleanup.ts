/**
 * Unmount rendered components between tests.
 *
 * Without this, every `render()` leaves its output in the document and the next
 * test queries a page containing both. The symptom is "found multiple elements"
 * on an assertion that is correct — and the version of it that does *not* fail
 * is worse: a test passing because an earlier test rendered the text it was
 * looking for.
 *
 * Registered globally rather than per file, because this is exactly the kind of
 * boilerplate that gets left out of the third render test and then debugged as
 * a component bug.
 *
 * The import is dynamic and guarded on `document`, so the node suites — the
 * database tests, the registry, the docs checks — never load a DOM library they
 * have no use for.
 */

import { afterEach } from "vitest";

afterEach(async () => {
  if (typeof document === "undefined") return;
  const { cleanup } = await import("@testing-library/react");
  cleanup();
});
