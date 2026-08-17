# The web bundle, built once at image build time.
#
# `architecture/05`: the bundle is built here rather than on the Pi. Metro
# bundling an Expo web app on a 4 GB ARM board is slow enough to matter, and it
# would put a whole toolchain on an appliance that has no other use for one.
#
# The result is static files, baked into the Caddy image that serves them.
#
# One image rather than a bundle volume shared between two services: a volume is
# populated by whichever container ran last, so a failed rebuild leaves the old
# bundle in place and serves it happily. Baking it in means the served bundle
# and the image tag are the same fact.

FROM node:22-alpine AS build

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mobile/package.json   apps/mobile/
COPY apps/api/package.json      apps/api/
COPY packages/core/package.json packages/core/
COPY packages/ui/package.json   packages/ui/
COPY packages/db/package.json   packages/db/

RUN pnpm install --frozen-lockfile --filter @waltning/mobile...

# The root tsconfigs, because `apps/mobile/tsconfig.json` extends
# `../../tsconfig.client.json`. Without them Expo's TypeScript resolver walks
# out of the copied tree and dies on `Invariant Violation: Failed to collapse`,
# which names neither the file nor the reason.
COPY tsconfig.base.json tsconfig.client.json ./

COPY apps/mobile    ./apps/mobile
COPY apps/api       ./apps/api
COPY packages/core  ./packages/core
COPY packages/ui    ./packages/ui
COPY packages/db    ./packages/db

# **Left empty on purpose.** Caddy serves this bundle and proxies `/trpc` on one
# host name, so the browser sees a single origin and every request should be
# relative — which is exactly what `resolveApiBaseUrl` returns for web outside
# dev. Setting it to the tailnet URL here would work and would also be the one
# way to accidentally make production cross-origin.
ENV EXPO_PUBLIC_API_URL=""

# The bundle's own identity, so the client can tell it is older than the server
# (`architecture/05`, version skew). Same value as the API image's `BUILD_SHA`;
# they are compared, so they must come from one place — `docker-compose.yml`
# passes both from the same `git rev-parse`.
ARG BUILD_SHA=unknown
ENV EXPO_PUBLIC_BUILD_SHA=$BUILD_SHA

WORKDIR /app/apps/mobile
RUN pnpm exec expo export --platform web --output-dir /bundle

FROM caddy:2-alpine AS serve
COPY --from=build /bundle /srv
COPY docker/Caddyfile /etc/caddy/Caddyfile
