/**
 * `pnpm --filter @waltning/ledger fixture:dump` — the head pair, written to
 * `fixtures/upgrade/`.
 *
 * Three lines in their own file so that `dump-fixture.ts` stays importable
 * without side effects: a caller that wants the pair for an older version
 * (`dumpFixture({ replicaThrough: … })`) must not rewrite the head pair
 * merely by importing the module. The usual guard — compare `import.meta.url`
 * against the entry path — is not available here, because `packages/ledger`
 * may not name `process` (`tests/architecture.test.ts`: Metro defines nothing
 * but `process.env`).
 */

import { dumpFixture } from "./dump-fixture.ts";

dumpFixture();
