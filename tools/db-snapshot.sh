#!/bin/sh
#
# Snapshot the local development ledger, and put one back.
#
# **`pg_dump`, not a format of our own.** The store is Postgres and the backup
# format the system already names is a Postgres dump (`SPEC.md` — nightly
# encrypted dumps; `.dump` is gitignored). `run_backup` and
# `run_restore_drill` are specified operations and not built yet; inventing a
# second, JSON-shaped "backup" for development would either duplicate whatever
# those become or quietly turn into them without the spec work.
#
# What this is for: `pnpm db:fixture` builds a dataset from code and takes a
# few seconds; a snapshot brings one back instantly, and lets you keep a
# *particular* ledger — one you have edited by hand, one mid-reconcile — and
# return to it after breaking it.
#
#   pnpm db:dump             → backups/dev-<timestamp>.dump
#   pnpm db:dump before-fx   → backups/before-fx.dump
#   pnpm db:load before-fx   replace the ledger with that snapshot
#   pnpm db:load             the newest snapshot
#
# `backups/` is gitignored, and every dump taken here holds placeholder data
# by construction — but it is still a whole ledger, so nothing in this script
# ever writes one anywhere a commit could reach.

set -eu

RED='\033[31m'
DIM='\033[2m'
OFF='\033[0m'

DIR="backups"
SERVICE="postgres"
USER_NAME="waltning"
DB="waltning"

fail() {
  printf "\n${RED}✗ %s${OFF}\n" "$1" >&2
  exit 1
}

running() {
  docker compose ps --status running --services 2>/dev/null | grep -qx "$SERVICE"
}

case "${1:-dump}" in
  dump)
    running || fail "postgres is not running — pnpm db:up"
    mkdir -p "$DIR"
    name="${2:-dev-$(date +%Y%m%d-%H%M%S)}"
    out="$DIR/$name.dump"
    # `-Fc` (custom format) rather than plain SQL: it restores with `--clean`
    # in one pass, and it is a fraction of the size.
    docker compose exec -T "$SERVICE" pg_dump -U "$USER_NAME" -d "$DB" -Fc > "$out"
    printf "wrote %s ${DIM}(%s)${OFF}\n" "$out" "$(du -h "$out" | cut -f1)"
    ;;

  load)
    running || fail "postgres is not running — pnpm db:up"
    if [ $# -ge 2 ]; then
      in="$DIR/$2.dump"
      [ -f "$in" ] || fail "no snapshot at $in"
    else
      # Newest by modification time, so `pnpm db:load` after `pnpm db:dump`
      # means what it looks like it means.
      in=$(ls -t "$DIR"/*.dump 2>/dev/null | head -1) || true
      [ -n "${in:-}" ] || fail "no snapshots in $DIR/ — pnpm db:dump first"
    fi

    printf "${DIM}replacing the %s database with %s${OFF}\n" "$DB" "$in"
    # `--clean --if-exists` drops what it is about to replace, so a restore
    # over a *different* dataset leaves nothing of the old one behind. Errors
    # are not ignored: a partial restore that printed a warning and carried on
    # is the shape where you debug the wrong ledger for an hour.
    docker compose exec -T "$SERVICE" pg_restore -U "$USER_NAME" -d "$DB" \
      --clean --if-exists --no-owner --exit-on-error < "$in"
    printf "restored %s\n" "$in"
    ;;

  list)
    [ -d "$DIR" ] || fail "no $DIR/ yet — pnpm db:dump first"
    ls -lht "$DIR"/*.dump 2>/dev/null | awk '{print $9, "\t", $5, "\t", $6, $7, $8}'
    ;;

  *)
    fail "unknown command: $1 — expected dump, load or list"
    ;;
esac
