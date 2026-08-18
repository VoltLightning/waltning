# Waltning — one word per thing you actually want to do.
#
# **Make orchestrates; pnpm implements.** Every target below either drives
# Docker or calls a `pnpm` script — it never reimplements one. That boundary is
# the whole reason this file is safe to have: two places that both know how to
# run the tests is two places that drift, and the one you are not looking at is
# always the stale one. `tests/makefile.test.ts` asserts every pnpm script named
# here exists, so a rename cannot leave a target quietly broken.
#
# What Make earns its place for is the part pnpm scripts are bad at: starting
# several processes together, waiting for a container to become healthy, and
# `make help`.

SHELL := /bin/bash
.DEFAULT_GOAL := help

# Both images compare this, so it comes from one place. `unknown` outside a git
# checkout rather than an error — the build should still work from a tarball.
#
# **Exported per target, never globally.** A plain `export BUILD_SHA` puts it in
# the environment of *everything* Make runs, including the tests — and two of
# them assert `/healthz` reports the `dev` fallback when no image was built. So
# `make verify` failed while `pnpm verify` passed: the orchestrator quietly
# changing the behaviour of the thing it was orchestrating, which is the worst
# property a wrapper can have.
BUILD_SHA := $(shell git rev-parse --short HEAD 2>/dev/null || echo unknown)

API_URL ?= http://127.0.0.1:3000
WEB_URL ?= http://localhost:8081
APPLIANCE_URL ?= http://127.0.0.1:8080

.PHONY: help setup dev dev-api dev-web dev-ios e2e verify test db db-reset psql \
        up down logs ps rebuild appliance-e2e wiki rules clean doctor

help: ## Show this help
	@echo ""
	@echo "  Waltning — make <target>"
	@echo ""
	@# The character class must include digits, or targets like `e2e` and
	@# `appliance-e2e` are silently missing from the list — documented, and
	@# undiscoverable, which is the same as undocumented.
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "  Development runs from source on :3000 and :8081."
	@echo "  The appliance runs the images behind Caddy on :8080."
	@echo ""

# ── First run ────────────────────────────────────────────────────────────────

setup: ## Install, create .env, and build the database from nothing
	pnpm install
	@if [ ! -f .env ]; then \
	  cp .env.example .env; \
	  echo ""; \
	  echo "  Created .env from the example — fill it in before continuing."; \
	  echo "  The three database URLs are deliberate; do not collapse them."; \
	  echo ""; \
	  exit 1; \
	fi
	$(MAKE) db-reset

doctor: ## Check that the things this repo assumes are actually here
	@echo "node        $$(node --version 2>/dev/null || echo 'MISSING')"
	@echo "pnpm        $$(pnpm --version 2>/dev/null || echo 'MISSING')"
	@echo "docker      $$(docker --version 2>/dev/null | cut -d, -f1 || echo 'MISSING')"
	@echo -n ".env       "; [ -f .env ] && echo " present" || echo " MISSING — run make setup"
	@echo -n "postgres   "; docker compose ps --status running --format '{{.Service}}' 2>/dev/null | grep -qx postgres && echo " up" || echo " down — run make db"
	@echo -n "simulator  "; xcrun simctl list runtimes 2>/dev/null | grep -q iOS && echo " ready" \
	  || echo " no iOS runtime — sudo xcode-select -s /Applications/Xcode.app/Contents/Developer && xcodebuild -downloadPlatform iOS"

# ── Development ──────────────────────────────────────────────────────────────

dev: db ## API + web together, from source (Ctrl-C stops both)
	@echo "  api  $(API_URL)"
	@echo "  web  $(WEB_URL)"
	@echo ""
	@# `trap … EXIT` kills the whole process group. Without it, Ctrl-C leaves
	@# Metro holding :8081 and the next `make dev` fails on a port that nothing
	@# visible is using.
	@trap 'kill 0' EXIT INT TERM; \
	  pnpm dev:api & \
	  pnpm dev:web & \
	  wait

dev-api: db ## Just the API, on :3000
	pnpm dev:api

dev-web: db ## Just the web app, on :8081 (interactive — keeps Metro's key commands)
	pnpm dev:web

dev-ios: db ## The app in the iOS simulator
	pnpm dev:ios

# ── Database ─────────────────────────────────────────────────────────────────

db: ## Start Postgres and wait for it to be ready
	@docker compose up -d postgres
	@printf "  waiting for postgres"
	@for i in $$(seq 1 30); do \
	  if docker compose ps --format '{{.Service}} {{.Health}}' | grep -qx 'postgres healthy'; then \
	    echo " ready"; exit 0; \
	  fi; \
	  printf "."; sleep 1; \
	done; \
	echo " TIMED OUT"; docker compose logs --tail 20 postgres; exit 1

db-reset: db ## Drop, migrate, grant, seed — the whole database from nothing
	pnpm db:reset

psql: db ## A psql shell on the development database
	pnpm db:psql

# ── The appliance ────────────────────────────────────────────────────────────

up: export BUILD_SHA := $(BUILD_SHA)
up: ## Build and run the whole stack as it ships, on :8080
	docker compose build
	docker compose up -d
	@printf "  waiting for the api"
	@for i in $$(seq 1 45); do \
	  if curl -sf $(APPLIANCE_URL)/healthz >/dev/null 2>&1; then echo " ready"; break; fi; \
	  printf "."; sleep 1; \
	done
	@echo ""
	@curl -s $(APPLIANCE_URL)/readyz || true
	@echo ""
	@echo "  $(APPLIANCE_URL)"

down: ## Stop the appliance, leaving the development database up
	docker compose stop api caddy minio

rebuild: export BUILD_SHA := $(BUILD_SHA)
rebuild: ## Rebuild the images at the current commit and restart
	docker compose build --no-cache api caddy
	docker compose up -d api caddy

logs: ## Follow the appliance logs
	docker compose logs -f api caddy

ps: ## What is running
	@docker compose ps -a --format 'table {{.Service}}\t{{.Status}}\t{{.Ports}}'

# ── Checks ───────────────────────────────────────────────────────────────────

verify: ## The gate: format, types, tests. What the pre-commit hook runs
	pnpm verify

test: ## Just the tests
	pnpm test

e2e: ## Check the running development stack end to end
	pnpm e2e

appliance-e2e: ## The same check, against the appliance on :8080
	E2E_API_URL=$(APPLIANCE_URL) E2E_WEB_URL=$(APPLIANCE_URL) pnpm e2e

wiki: ## Check the published wiki against docs/wiki
	pnpm wiki:check

rules: ## Regenerate CLAUDE.md and AGENTS.md from .ai-rulez/rules/
	@# Both files are generated and gitignored, and both say "NEVER edit this
	@# file" at the top. The source is .ai-rulez/rules/*.md — edit there, run
	@# this. There is no "is it current" check and there need not be: nothing
	@# tracks the output, so it cannot drift into a commit.
	pnpm rules

# ── Housekeeping ─────────────────────────────────────────────────────────────

clean: ## Stop everything and remove the containers. **Keeps the volumes.**
	@# Deliberately not `-v`. The database volume is the ledger, and a `clean`
	@# target that quietly deletes it is a footgun with a friendly name.
	docker compose down
	@echo ""
	@echo "  Volumes kept. To destroy the database as well:"
	@echo "    docker compose down -v"
