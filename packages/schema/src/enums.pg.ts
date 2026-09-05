/**
 * The Postgres `ENUM` types, built from the shared value sets.
 *
 * A `pgEnum` is two things at once: a column type *and* a `CREATE TYPE`
 * statement drizzle-kit emits into a migration. That second half is why these
 * are declared exactly once and imported everywhere — a second `pgEnum` with
 * the same name would emit a second `CREATE TYPE`, and the failure surfaces at
 * migration time rather than at compile time.
 *
 * `packages/db` re-exports these so nothing there has to know they moved, and
 * so a query builder keeps importing enums from the same place as its tables.
 */

import { pgEnum } from "drizzle-orm/pg-core";
import {
  ACCOUNT_KIND,
  ACTOR,
  BRAND_SOURCE,
  CATEGORY_KIND,
  COUNTERPARTY_KIND,
  COUNTERPARTY_ROLE,
  FX_SOURCE,
  IMPORT_ROW_STATUS,
  OWNERSHIP,
  TAX_LINE_KIND,
  TXN_SOURCE,
  TXN_TYPE,
  WIDGET_SIZE,
} from "./enums.ts";

export const accountKind = pgEnum("account_kind", ACCOUNT_KIND);
export const ownership = pgEnum("ownership", OWNERSHIP);
export const categoryKind = pgEnum("category_kind", CATEGORY_KIND);
export const txnType = pgEnum("txn_type", TXN_TYPE);
export const txnSource = pgEnum("txn_source", TXN_SOURCE);
export const actor = pgEnum("actor", ACTOR);
export const counterpartyKind = pgEnum("counterparty_kind", COUNTERPARTY_KIND);
export const counterpartyRole = pgEnum("counterparty_role", COUNTERPARTY_ROLE);
export const fxSource = pgEnum("fx_source", FX_SOURCE);
export const importRowStatus = pgEnum("import_row_status", IMPORT_ROW_STATUS);
export const taxLineKind = pgEnum("tax_line_kind", TAX_LINE_KIND);
export const widgetSize = pgEnum("widget_size", WIDGET_SIZE);
export const brandSource = pgEnum("brand_source", BRAND_SOURCE);
