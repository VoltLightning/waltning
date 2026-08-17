/**
 * The local end-to-end check: is the stack that is *running* actually wired up.
 *
 * **Why this is not in `pnpm verify`.** The gate must be deterministic and
 * offline — the pre-commit hook is the only gate there is, and a check that
 * depends on a process someone remembered to start is a check that eventually
 * gets skipped, or worse, fails for a reason that has nothing to do with the
 * commit. Everything here that *can* be proven without a live server already is,
 * in the unit suite. This proves the one thing that cannot be: that the pieces
 * find each other over a real socket.
 *
 * It talks to the API the way the app does, using `@waltning/core`'s Rule 0
 * check rather than a copy of it — so a rename that breaks the client breaks
 * this too, instead of this quietly continuing to pass.
 *
 *   pnpm e2e            read-only; touches no data
 *   pnpm e2e --write    also creates one placeholder counterparty and shows it
 *
 * Read-only by default because this runs against a development ledger, and a
 * check that leaves rows behind is one people stop running.
 */

import { createTRPCClient, httpLink, TRPCClientError } from "@trpc/client";
import type { AppRouter } from "@waltning/api/router-type";
import { ruleZeroFetch, WALTNING_HEADER } from "@waltning/core";

const API = process.env["E2E_API_URL"] ?? "http://127.0.0.1:3000";
const METRO = process.env["E2E_WEB_URL"] ?? "http://localhost:8081";
const WRITE = process.argv.includes("--write");

/* ── reporting ──────────────────────────────────────────────────────────── */

// Written as escapes rather than literal control bytes: an invisible character
// in source survives a copy-paste badly and reads as a typo in a diff.
const GREEN = "\u001b[32m";
const RED = "\u001b[31m";
const YELLOW = "\u001b[33m";
const RESET = "\u001b[0m";

let failures = 0;

function pass(what: string, detail = ""): void {
  console.log(`  ${GREEN}✓${RESET} ${what}${detail ? `  ${detail}` : ""}`);
}

function fail(what: string, why: string): void {
  failures++;
  console.log(`  ${RED}✗${RESET} ${what}\n      ${why}`);
}

function note(what: string): void {
  console.log(`  ${YELLOW}·${RESET} ${what}`);
}

function section(title: string): void {
  console.log(`\n${title}`);
}

function reasonOf(error: unknown): string {
  if (error instanceof TRPCClientError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

/* ── the client, authenticating exactly as the app does ─────────────────── */

/** Set by the Rule 0 wrapper so a failure can say *why*, not just "it threw". */
let lastRuleZeroFailure: string | null = null;

const client = createTRPCClient<AppRouter>({
  links: [
    httpLink({
      url: `${API}/trpc`,
      // The app's own wrapper, not a re-implementation of it. If Rule 0 breaks
      // in a way this check would tolerate, it is because the check and the app
      // disagree — which is the one thing an end-to-end test must not do.
      fetch: ruleZeroFetch({
        // No session yet (§5.2). Explicit, so "no session" never reads the
        // same as "nobody wired the check".
        nonce: () => null,
        onCaptive: (error) => {
          lastRuleZeroFailure = error.reason;
        },
      }),
    }),
  ],
});

/* ── checks ─────────────────────────────────────────────────────────────── */

async function probes(): Promise<void> {
  section(`Probes  ${API}`);

  try {
    const res = await fetch(`${API}/healthz`);
    const header = res.headers.get(WALTNING_HEADER);
    if (!res.ok) {
      fail("/healthz", `status ${res.status}`);
    } else if (!header) {
      // Rule 0's first condition, missing at the source. Every client would
      // reject every response, and the API would look unreachable.
      fail("/healthz", `answered ${res.status} without an ${WALTNING_HEADER} header`);
    } else {
      pass("/healthz", `build ${header}`);
    }
  } catch (error) {
    fail("/healthz", `${reasonOf(error)} — is the API running? (pnpm dev:api)`);
    return;
  }

  try {
    const res = await fetch(`${API}/readyz`);
    const body = (await res.json()) as { db?: string; blobs?: string; reason?: string };
    if (body.db === "up") {
      pass("/readyz", `db up, blobs ${body.blobs ?? "?"}`);
    } else {
      // Degraded, not down: this is the distinction the whole link state
      // machine rests on, so the message keeps them apart.
      fail(
        "/readyz",
        `database ${body.db ?? "?"} — ${body.reason ?? "no reason given"} (pnpm db:up)`,
      );
    }
  } catch (error) {
    fail("/readyz", reasonOf(error));
  }
}

async function ruleZero(): Promise<void> {
  section("Rule 0");

  try {
    const result = await client.ping.query();
    pass("a response authenticates as ours", `build ${result.build}`);
  } catch (error) {
    fail(
      "a response authenticates as ours",
      lastRuleZeroFailure
        ? `rejected as ${lastRuleZeroFailure} — something answered, and it was not the API`
        : reasonOf(error),
    );
  }
}

async function read(): Promise<void> {
  section("Read — op.get_currencies");

  try {
    const currencies = await client.op.get_currencies.query({ includeArchived: false });

    if (currencies.length === 0) {
      // An empty answer is a successful call and a broken stack: the seed did
      // not run, and every screen downstream would render a legitimate-looking
      // empty state.
      fail("returns rows", "no currencies — has the database been seeded? (pnpm db:reset)");
      return;
    }
    pass("returns rows", `${currencies.length} currencies`);

    const pivot = currencies.find((c) => c.isPivot);
    if (pivot) pass("the pivot currency is set", pivot.code);
    else fail("the pivot currency is set", "no currency is marked as the pivot");

    // The declared output actually arriving, field by field — a client that
    // received `[{code}]` and nothing else would pass a length check.
    const first = currencies[0];
    const complete =
      first !== undefined &&
      typeof first.code === "string" &&
      typeof first.name === "string" &&
      typeof first.decimals === "number";
    if (complete) pass("rows carry the declared fields");
    else fail("rows carry the declared fields", `got ${JSON.stringify(first)}`);
  } catch (error) {
    fail("op.get_currencies", reasonOf(error));
  }
}

async function refusal(): Promise<void> {
  section("Rule 1 — a refusal is a domain error, not a transport event");

  try {
    // Deliberately invalid, and deliberately a *write*: it exercises the
    // mutation path, the declared schema and the error formatter without
    // creating anything.
    await client.op.create_counterparty.mutate({ name: "" });
    fail("an empty name is refused", "the call succeeded");
  } catch (error) {
    if (!(error instanceof TRPCClientError)) {
      fail("an empty name is refused", `threw ${reasonOf(error)} rather than a tRPC error`);
      return;
    }
    // The envelope's interior, which is what `architecture/09` Rule 1 reads.
    const data = error.data as { code?: string; httpStatus?: number } | undefined;
    if (data?.code === "validation") {
      pass("refused with our envelope", `code ${data.code}, status ${data.httpStatus ?? "?"}`);
    } else {
      fail("refused with our envelope", `code was ${String(data?.code)}, expected 'validation'`);
    }
  }
}

async function write(): Promise<void> {
  section("Write — op.create_counterparty");

  if (!WRITE) {
    note("skipped (read-only). Re-run with --write to create one placeholder row.");
    return;
  }

  // A placeholder name, as everything in this repository is: the ledger is
  // private and the repo is public.
  const name = `E2E Check ${new Date().toISOString().slice(0, 19)}`;

  try {
    const created = await client.op.create_counterparty.mutate({ name, kind: "person" });
    pass("created a counterparty", `${created.id}  "${created.name}"`);
    note(`this row is real — remove it when you are done: ${created.id}`);
  } catch (error) {
    fail("created a counterparty", reasonOf(error));
  }
}

async function web(): Promise<void> {
  section(`Web bundle  ${METRO}`);

  try {
    const res = await fetch(METRO, { signal: AbortSignal.timeout(3000) });
    if (res.ok) pass("Metro is serving", `status ${res.status}`);
    else fail("Metro is serving", `status ${res.status}`);
  } catch {
    // Not a failure: the API half is independently useful, and the web leg is
    // often simply not started. Counting it as a failure would train people to
    // ignore a red result.
    note(`not running — start it with pnpm dev:web (checked ${METRO})`);
  }
}

/* ── run ────────────────────────────────────────────────────────────────── */

console.log("waltning · local end-to-end check");

await probes();
await ruleZero();
await read();
await refusal();
await write();
await web();

console.log(
  failures === 0
    ? `\n${GREEN}All checks passed.${RESET}\n`
    : `\n${RED}${failures} check${failures === 1 ? "" : "s"} failed.${RESET}\n`,
);

process.exit(failures === 0 ? 0 : 1);
