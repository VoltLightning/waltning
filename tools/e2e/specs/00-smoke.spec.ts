/**
 * `src/smoke.ts`'s own probes, one `test()` each — the first spec tier 2
 * runs, alphabetically and in intent: nothing downstream is worth trying
 * against a stack that cannot answer these.
 *
 * **Wrapped, not imported.** `smoke.ts` is a script — it runs its checks and
 * calls `process.exit()` at module scope, which is exactly wrong inside a
 * test runner. This restates its four checks (probes, Rule 0, a read, a
 * refusal) as `test()`s over the same `@trpc/client` wired through the same
 * `ruleZeroFetch` wrapper, so a rename that breaks the client breaks this
 * too — `smoke.ts`'s own header explains why that matters. `write()` and
 * `web()` stay out: `write()`'s whole reason to exist, `--write` gating a
 * placeholder row, does not apply to a database that exists only for this
 * run (see `smoke.ts`'s own updated header), and `web()` is redundant with
 * every spec after this one already loading the bundle to drive it.
 */

import { expect, test } from "@playwright/test";
import { createTRPCClient, httpLink, TRPCClientError } from "@trpc/client";
import type { ErrorCode } from "@waltning/api/errors";
import type { AppRouter } from "@waltning/api/router";
import { WALTNING_HEADER } from "@waltning/core/protocol";
import { ruleZeroFetch } from "@waltning/core/rule-zero-fetch";

/** `smoke.ts`'s own default — deliberately not `use.baseURL`, which names the *web* bundle, not the API. */
const API = process.env["E2E_API_URL"] ?? "http://127.0.0.1:3000";

/** Set by the Rule 0 wrapper so a failure can say *why*, not just "it threw". */
let lastRuleZeroFailure: string | null = null;

const client = createTRPCClient<AppRouter>({
  links: [
    httpLink({
      url: `${API}/trpc`,
      fetch: ruleZeroFetch({
        nonce: () => null,
        onCaptive: (error) => {
          lastRuleZeroFailure = error.reason;
        },
      }),
    }),
  ],
});

function reasonOf(error: unknown): string {
  if (error instanceof TRPCClientError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

test.describe(`Probes  ${API}`, () => {
  test("/healthz answers with the Waltning header", async () => {
    const res = await fetch(`${API}/healthz`);
    expect(res.ok, `status ${res.status} — is the API running? (pnpm dev:api)`).toBe(true);
    // Rule 0's first condition, missing at the source would reject every
    // client's response — see `smoke.ts`'s own comment.
    expect(
      res.headers.get(WALTNING_HEADER),
      `answered without an ${WALTNING_HEADER} header`,
    ).not.toBeNull();
  });

  test("/readyz reports the database up", async () => {
    const res = await fetch(`${API}/readyz`);
    const body = (await res.json()) as { db?: string; blobs?: string; reason?: string };
    expect(
      body.db,
      `database ${body.db ?? "?"} — ${body.reason ?? "no reason given"} (pnpm db:up)`,
    ).toBe("up");
  });
});

test.describe("Rule 0", () => {
  test("a response authenticates as ours", async () => {
    lastRuleZeroFailure = null;
    try {
      const result = await client.ping.query();
      expect(typeof result.build).toBe("string");
    } catch (error) {
      throw new Error(
        lastRuleZeroFailure
          ? `rejected as ${lastRuleZeroFailure} — something answered, and it was not the API`
          : reasonOf(error),
      );
    }
  });
});

test.describe("Read — op.get_currencies", () => {
  test("returns rows, the pivot is set, and every declared field arrives", async () => {
    const currencies = await client.op.get_currencies.query({ includeArchived: false });

    // An empty answer is a successful call and a broken stack — the seed did
    // not run, and every screen downstream would render a legitimate-looking
    // empty state.
    expect(
      currencies.length,
      "no currencies — has the database been seeded? (pnpm db:reset)",
    ).toBeGreaterThan(0);
    expect(
      currencies.some((c) => c.isPivot),
      "no currency is marked as the pivot",
    ).toBe(true);

    // The declared output actually arriving, field by field — a client that
    // received `[{code}]` and nothing else would pass a length check alone.
    const [first] = currencies;
    expect(first).toBeDefined();
    expect(typeof first?.code).toBe("string");
    expect(typeof first?.name).toBe("string");
    expect(typeof first?.decimals).toBe("number");
  });
});

test.describe("Rule 1 — a refusal is a domain error, not a transport event", () => {
  test("an empty name is refused with our envelope", async () => {
    // Deliberately invalid, and deliberately a write: it exercises the
    // mutation path, the declared schema and the error formatter without
    // creating anything.
    let caught: unknown;
    try {
      await client.op.create_counterparty.mutate({ name: "" });
    } catch (error) {
      caught = error;
    }

    if (!(caught instanceof TRPCClientError)) {
      throw new Error(`the call succeeded, or threw ${reasonOf(caught)} rather than a tRPC error`);
    }
    // The envelope's interior, which is what `architecture/09` Rule 1 reads.
    const data = caught.data as { code?: ErrorCode; httpStatus?: number } | undefined;
    const expected: ErrorCode = "validation";
    expect(data?.code, `code was ${String(data?.code)}, expected '${expected}'`).toBe(expected);
  });
});
