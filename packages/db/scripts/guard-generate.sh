#!/bin/sh
#
# `drizzle-kit generate` is a trap in this repository's current state, and a
# note in a document is not a control — the script was still one keystroke from
# doing damage.
#
# drizzle/meta holds snapshots for 0000 and 0001 only, while the migrations run
# to 0009 and 0002-0009 are hand-written. `generate` diffs the schema against
# the newest snapshot, so it would emit a migration re-creating everything the
# hand-written files already built. The journal is the source of truth here.
#
# Kept rather than deleted, because the day the snapshots are rebuilt this
# becomes the right command again — and then this guard is what gets removed,
# deliberately, by someone who has read why it existed.
set -eu

printf '\033[31m✗ pnpm db:generate is disabled in this repository.\033[0m\n' >&2
cat >&2 <<'WHY'

  drizzle/meta has snapshots for 0000 and 0001; migrations run to 0009, and
  0002-0009 are hand-written. `generate` diffs against the newest snapshot, so
  it would emit a migration re-creating tables, views, triggers and grants
  that already exist.

  Apply migrations:   pnpm db:migrate
  Add one:            write the SQL by hand, then register it in
                      drizzle/meta/_journal.json

  See docs/specification/architecture/05-deployment.md
      § The `db:push` prohibition

WHY
exit 1
