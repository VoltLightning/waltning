/**
 * D5's own harness — the **real** `Today` and `Quick add` screens, swapped by
 * a stub `expo-router` the way navigation actually swaps them, mounted
 * through `TabsShell` so the floating `+` (`FloatingAdd`, `tabs-shell.tsx`'s
 * own `handleAdd`) is the tap target J02 §3 names, not a control either
 * screen renders on its own — over one real `LocalLedgerSession`, built on
 * `scratchStores()`'s two files.
 *
 * **No fake port.** `wave-4-shared.md`'s rule 2 — "an executor is the
 * operation's whole contract on the phone" — means a journey that times or
 * counts the real write path cannot run it through a port double; the write
 * has to be the one `create_transaction` actually does, CHECKs and all.
 * `phone-ledger.web.ts` is the production wiring this mirrors, `better-sqlite3`
 * standing in for `expo-sqlite` the same way `packages/ledger`'s own tests
 * already substitute it (`scratchStores`'s own doc).
 *
 * **Offline by construction.** Nothing here imports a transport or a tRPC
 * client, so there is no outbox drain to wire up — J02 §2's own precondition,
 * "this journey must work offline", is the only mode this harness has.
 */

import { rmSync } from "node:fs";
import {
  createPhoneLedger,
  type PhoneLedgerController,
} from "@waltning/client/ledger/create-phone-ledger";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { currencies as referenceCurrencies } from "@waltning/core/currencies";
import { addDays } from "@waltning/core/date";
import { currencyCode } from "@waltning/core/money";
import { convertLeafGroupExecutor } from "@waltning/ledger/categories/convert-leaf-group.executor";
import type { SqliteOpener } from "@waltning/ledger/open";
import { ledgerRegistry } from "@waltning/ledger/registry";
import { ledgerSchema } from "@waltning/ledger/schema-map";
import { type BootstrapCurrency, createLocalLedgerSession } from "@waltning/ledger/session";
import { nodeFs, type ScratchStores, scratchStores } from "@waltning/ledger/test/stores";
import { writeLocally } from "@waltning/ledger/write";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { useSyncExternalStore } from "react";
import QuickAdd from "../quick-add-screen";
import { TabsShell } from "../tabs-shell";
import Today from "../today-screen";

type Run = Database.RunResult;

const openBetterSqlite: SqliteOpener<Run, typeof ledgerSchema> = (filename) => {
  const sqlite = new Database(filename);
  return { db: drizzle(sqlite, { schema: ledgerSchema }), close: () => sqlite.close() };
};

/** The whole reference set, not the pivot alone — `phone-ledger.web.ts`'s own bootstrap. */
const BOOTSTRAP_CURRENCIES: readonly BootstrapCurrency[] = referenceCurrencies.map(
  ({ rateSource: _rateSource, ...currency }) => currency,
);

export type JourneyLedger = {
  controller: PhoneLedgerController;
  /** The files this session opened — kept for a raw query (`outbox`, `local_meta`) the port never exposes. */
  scratch: ScratchStores;
  close: () => void;
};

/** One real ledger, over `scratchStores()`'s files — `wave-4-shared.md`'s rule, applied to a journey. */
export function createJourneyLedger(): JourneyLedger {
  const scratch = scratchStores();
  const session = createLocalLedgerSession({
    open: openBetterSqlite,
    paths: scratch.paths,
    fs: nodeFs,
    removeDatabase: (path) => rmSync(path, { force: true }),
    bootstrapCurrencies: BOOTSTRAP_CURRENCIES,
  });
  const controller = createPhoneLedger(session, deviceRuntime());
  return { controller, scratch, close: scratch.close };
}

export type JourneyFixture = {
  cashAccountId: string;
  eatingOutCategoryId: string;
  priorTransactionId: string;
};

/**
 * J02 §3's own fixture, built through the controller's real write methods —
 * never a raw table insert, so a refusal here is the same refusal Quick add
 * itself would show. One capturable account, one leaf category under a
 * group, and one prior capture D2's proposal (`payee-memory.ts`) can fire
 * on.
 *
 * **`Eating out` lives under a group, not at the root, and that is load-
 * bearing.** `CategorySheet` finds "the" `Uncategorized` row by a heuristic —
 * `TAXONOMY.md`'s own real seed keeps exactly one root-level leaf, so *the
 * first leaf with no parent* is close enough — and a fixture that left its
 * one leaf at the root would be silently reclassified as `Uncategorized`,
 * with no `Suggested` row and no plain radio either. `convert_leaf_group`
 * is not yet on `PhoneLedgerController` (J12 has not reached the phone this
 * wave), so this reaches `writeLocally` directly against the executor
 * `registry.ts` already carries — the same write the operation makes, one
 * level under the controller it will eventually gain.
 */
export function seedJourneyFixture(ledger: JourneyLedger): JourneyFixture {
  const { controller } = ledger;
  const account = controller.createAccount({
    name: "Cash · PLN",
    currency: currencyCode("PLN"),
    kind: "cash",
    ownership: "own",
    isBusiness: false,
    openingBalance: "0",
    openingDate: null,
    memo: "",
    groupId: null,
  });
  if (!("id" in account)) {
    throw new Error(`journey fixture: account refused — ${JSON.stringify(account.fieldErrors)}`);
  }

  // §14.6: capturing in a non-pivot currency needs a rate the replica holds —
  // seeded through `set_manual_rate`, the same op S18 exposes, not a raw row.
  const today = deviceRuntime().capture().date;
  const rate = controller.setManualRate({
    base: "USD",
    quote: "PLN",
    from: today,
    to: today,
    rate: "4.00",
    overwriteManual: true,
  });
  if ("fieldErrors" in rate) {
    throw new Error(`journey fixture: rate refused — ${JSON.stringify(rate.fieldErrors)}`);
  }

  const group = controller.createCategory({ name: "Food", kind: "expense", parentId: null });
  if (!("id" in group)) {
    throw new Error(`journey fixture: group refused — ${JSON.stringify(group.fieldErrors)}`);
  }
  writeLocally(ledger.scratch.ledger, {
    executor: convertLeafGroupExecutor,
    registry: ledgerRegistry,
    input: { id: group.id, version: 1, to: "group" },
    capture: deviceRuntime().capture(),
  });
  controller.refresh();

  const category = controller.createCategory({
    name: "Eating out",
    kind: "expense",
    parentId: group.id,
  });
  if (!("id" in category)) {
    throw new Error(`journey fixture: category refused — ${JSON.stringify(category.fieldErrors)}`);
  }

  // Yesterday, so `readPayeeHistory`'s own "newest first" ordering has no say
  // in which row wins — the exact fold match D2 needs is the only reason this
  // proposal fires at confidence 1.
  const prior = controller.createTransaction({
    type: "expense",
    amount: "12.50",
    accountId: account.id,
    categoryId: category.id,
    payee: "Costa",
    date: addDays(today, -1),
    note: "",
    isBusiness: false,
    counterpartyId: null,
    counterpartyRole: null,
  });
  if (!("id" in prior)) {
    throw new Error(
      `journey fixture: prior capture refused — ${JSON.stringify(prior.fieldErrors)}`,
    );
  }

  return {
    cashAccountId: account.id,
    eatingOutCategoryId: category.id,
    priorTransactionId: prior.id,
  };
}

export type JourneyRoute = "today" | "quick-add";

/**
 * The two shapes `router.push`/`dismissTo` are ever called with across this
 * journey's own screens — a bare path (`tabs-shell.tsx`'s `"/quick-add"`,
 * `quick-add-screen.tsx`'s `"/"`) or `{ pathname, params }` (the account
 * escape hatch, never scripted here — see the stub's own doc below).
 */
type RouteTarget = string | { readonly pathname: string };

export type JourneyRouterStub = {
  /** `expo-router`'s own shape — mocked, and swapping `getRoute()` is the whole point. */
  router: {
    push: (target: RouteTarget) => void;
    back: () => void;
    dismissTo: (target: RouteTarget) => void;
  };
  /** `useLocalSearchParams`'s own mock — always empty; this journey never opens Quick add prefilled. */
  useLocalSearchParams: () => Record<string, never>;
  subscribe: (listener: () => void) => () => void;
  getRoute: () => JourneyRoute;
};

/**
 * `push("/quick-add")` and `dismissTo("/")` are the only two calls this
 * journey's own screens make — `tabs-shell.tsx`'s `handleAdd` and
 * `quick-add-screen.tsx`'s own Save. `back()` is J02's `✕` discard, wired the
 * same way rather than left a no-op. Anything else throws loudly: a route
 * this journey never scripted is a bug in the script, not a screen to render.
 */
export function createJourneyRouterStub(): JourneyRouterStub {
  let route: JourneyRoute = "today";
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const go = (next: JourneyRoute) => {
    route = next;
    notify();
  };

  return {
    router: {
      push: (target) => {
        if (target === "/quick-add") {
          go("quick-add");
          return;
        }
        throw new Error(`journey harness: unscripted router.push(${JSON.stringify(target)})`);
      },
      back: () => go("today"),
      dismissTo: (target) => {
        if (target === "/") {
          go("today");
          return;
        }
        throw new Error(`journey harness: unscripted router.dismissTo(${JSON.stringify(target)})`);
      },
    },
    useLocalSearchParams: () => ({}),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getRoute: () => route,
  };
}

export type JourneyHarnessProps = {
  controller: PhoneLedgerController;
  stub: JourneyRouterStub;
};

/** `TabsShell`, not the bare screens — the `+` this journey taps is its furniture, not either screen's own. */
export function JourneyHarness({ controller, stub }: JourneyHarnessProps) {
  const route = useSyncExternalStore(stub.subscribe, stub.getRoute, stub.getRoute);
  const slot = route === "today" ? <Today /> : <QuickAdd />;
  return (
    <LedgerProvider controller={controller}>
      <TabsShell slot={slot} />
    </LedgerProvider>
  );
}
