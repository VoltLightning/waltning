#!/bin/sh
#
# Start Postgres and wait until Docker reports it healthy.
#
# **Make orchestrates; pnpm implements.** `make db` and `pnpm dev:all` both
# need the same thing — Postgres up and actually answering — and both used to
# spell it out for themselves: the Makefile with its own polling loop, and
# `dev:all` by shelling back into `make db`. That second one points the
# dependency the wrong way round. A pnpm script that cannot run without Make
# is not an implementation, it is a second orchestrator, and it makes `pnpm
# dev:all` fail anywhere Make is missing for a reason nothing about the
# command suggests.
#
# So the procedure lives here, `pnpm db:ready` names it, and `make db` calls
# that — the same direction every other target already runs in.
#
# `pnpm db:up` is not a substitute and never was: `docker compose up -d`
# returns as soon as the container has *started*, several seconds before
# Postgres accepts a connection. Everything immediately downstream — a
# migration, a seed, the API's first query — then fails against a database
# that is about to be fine.

set -eu

docker compose up -d postgres

printf "  waiting for postgres"
attempt=0
while [ "$attempt" -lt 30 ]; do
  if docker compose ps --format '{{.Service}} {{.Health}}' | grep -qx 'postgres healthy'; then
    echo " ready"
    exit 0
  fi
  printf "."
  attempt=$((attempt + 1))
  sleep 1
done

echo " TIMED OUT"
docker compose logs --tail 20 postgres
exit 1
