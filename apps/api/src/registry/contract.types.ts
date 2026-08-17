/**
 * Type-level contract tests.
 *
 * These are **compile-time** assertions, not runtime ones. They run in
 * `pnpm -r typecheck`, which the pre-commit hook gates on, so code that
 * weakens the registry's contract cannot be committed — the failure is a `tsc`
 * error, deterministic and offline, not a test that might be skipped.
 *
 * Every assertion here exists because the property it pins was **once
 * broken**:
 *
 *  - `routerFromRegistry` returned `AnyRouter`, tRPC's erased type. The router
 *    worked and the client saw nothing: an output typed `CurrencySummary[]`
 *    accepted `[{ code: "USD" }]`, and an input requiring a boolean accepted a
 *    string. §11.0 promises types reach the client; they did not.
 *  - `AnyOperation` exposed `handler`, whose widened input is `unknown`, so
 *    `widened.handler("garbage", ctx)` compiled and validation could be
 *    skipped by a caller who simply did not think about it.
 *
 * The file exports nothing at run time. If it compiles, the contract holds.
 */

import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AnyOperation } from "@waltning/core";
import type { CurrencySummary } from "../modules/currencies/index.ts";
import type { AppRouter } from "../trpc/router.ts";
import type { OperationContext } from "./context.ts";

/* ── assertion helpers ──────────────────────────────────────────────────── */

type Expect<T extends true> = T;

/** Invariant equality — `Equals<any, X>` is false, which is the point. */
type Equals<A, B> =
  (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;

type IsAny<T> = 0 extends 1 & T ? true : false;
type Not<T extends boolean> = T extends true ? false : true;
type Has<T, K extends PropertyKey> = K extends keyof T ? true : false;

type Out = inferRouterOutputs<AppRouter>;
type In = inferRouterInputs<AppRouter>;

/* ── 1 · the client sees real types, not erased ones ────────────────────── */

export type ClientOutputIsTyped = Expect<Equals<Out["op"]["get_currencies"], CurrencySummary[]>>;

export type ClientOutputIsNotAny = Expect<Not<IsAny<Out["op"]["get_currencies"]>>>;

export type ClientInputIsTyped = Expect<
  Equals<In["op"]["get_currencies"], { includeArchived?: boolean | undefined }>
>;

export type ClientInputIsNotAny = Expect<Not<IsAny<In["op"]["create_counterparty"]>>>;

/** A write's output is the row the service returns, not `unknown`. */
export type WriteOutputIsTyped = Expect<
  Equals<Out["op"]["create_counterparty"], { id: string; name: string; kind: "person" | "company" }>
>;

/**
 * A balance is a **string**, and this is the assertion that keeps it one.
 *
 * `numeric(20,8)` through a driver that returned numbers would type as `number`
 * here, and the failure is silent: 0,1 + 0,2 renders as 0,30 at two decimal
 * places and is wrong at the eighth. Money in this system is decimal strings end
 * to end, and this is where that stops being a convention and becomes checked.
 */
export type BalanceIsAString = Expect<Equals<Out["op"]["get_accounts"][number]["balance"], string>>;

export type TransactionAmountIsAString = Expect<
  Equals<Out["op"]["list_transactions"]["rows"][number]["amount"], string>
>;

/** The cursor survives to the client as a shape it can feed back, not `unknown`. */
export type CursorIsTyped = Expect<
  Equals<Out["op"]["list_transactions"]["nextCursor"], { date: string; id: string } | null>
>;

/* ── 2 · every operation reaches the client ─────────────────────────────── */

export type EveryOperationIsExposed = Expect<
  Equals<
    keyof Out["op"],
    "get_currencies" | "get_accounts" | "list_transactions" | "create_counterparty"
  >
>;

/* ── 3 · the widened form cannot skip validation ────────────────────────── */

export type WidenedHidesHandler = Expect<Not<Has<AnyOperation<OperationContext>, "handler">>>;

export type WidenedExposesInvoke = Expect<Has<AnyOperation<OperationContext>, "invoke">>;

/* ── 4 · nothing in the client surface is `any` ─────────────────────────── */

type AnyValueIn<T> = { [K in keyof T]: IsAny<T[K]> }[keyof T];

export type NoAnyInClientOutputs = Expect<Not<AnyValueIn<Out["op"]> extends true ? true : false>>;
export type NoAnyInClientInputs = Expect<Not<AnyValueIn<In["op"]> extends true ? true : false>>;
