# Tax Isolation

Specified in `SPEC.md` §13. The single strongest guarantee in the system, and
the one most easily voided by a well-meaning fix.

## The guarantee

**A personal expense cannot reach a tax report.** Not "is filtered out of" —
cannot reach. Every tax adapter reads a business-only view called `tax_ledger`,
under a database role that can read that view and nothing else. Personal rows
are not excluded by a `WHERE` clause an adapter could forget; they are
unreachable from where the adapter is standing.

The mechanism is three layers that agree:

1. **The view.** `tax_ledger` projects only business rows.
2. **The role.** `waltning_export` is granted that view, with the underlying
   tables explicitly revoked.
3. **The URL.** `EXPORT_DATABASE_URL` connects as that role, and the export
   path uses no other.

## Why it is a role and not a query

A filter in application code holds until someone writes an adapter for a fourth
jurisdiction at 1 a.m. and copies a query from the third. The filter is one line
and its absence looks like nothing.

A revoked grant does not care who wrote the query or how tired they were. The
statement fails, loudly, at the boundary — and the failure names the table it
could not read.

This is the general pattern the whole project follows: **anything that must
never happen gets a service check for the good error message and a database
constraint for when the application code is wrong.** A guarantee that lives only
in prose is a wish.

## The trap

**A privilege error usually means the design is working.**

If an export query fails on permissions, the fix is to change what the query
asks for. Switching it to `APP_DATABASE_URL` will also make it pass — and will
silently void the guarantee, permanently, with every test still green and
nothing in the diff that looks wrong.

The same applies to the app role itself. `waltning_app` is deliberately not a
superuser, because **a superuser bypasses every `GRANT`** — it makes every query
succeed and every boundary decorative. That is the archetypal failure that looks
like health: the system has never been more responsive and none of its
guarantees hold.

## Fields, not operations

The tax boundary is a **field** boundary. The grant system that governs the
agent is an **operation** boundary. They do not line up, and the gap between
them is where a recategorisation could quietly move rows out of tax scope.

That mismatch, and how the gate resolves it, is in
[[The Operation Registry]].

## Multi-jurisdiction by projection

`tax_ledger` is one shape. Each jurisdiction gets an **adapter** that projects
it into that jurisdiction's form — Polish KPiR or ewidencja under ryczałt, US
Schedule C, German EÜR — and a **tax scheme** is a versioned form, e.g.
`PL_KPIR v2026`. Versioned, because a form changes between years and a report
regenerated later must still match what was filed.

Terms are in the [[Glossary]]. §13.4 covers period close, including the report
that catches scope movements the gate deliberately does not block — a category
change can move tax scope indirectly, and the answer is to surface it at close
rather than to gate every recategorisation.
