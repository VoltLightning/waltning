/**
 * The shared set, named once.
 *
 * `architecture/14` §14.7 fixes which tables exist on both engines. Naming them
 * in a type rather than a comment means `pg.ts` and `sqlite.ts` can be checked
 * against the list instead of against each other's good intentions — a table
 * added to one module and not the other fails here, before the row types are
 * even compared.
 */
export type SharedTable = "currencies" | "transactions";
