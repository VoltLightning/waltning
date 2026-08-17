# The API image.
#
# `BUILD_SHA` is the reason this file has to exist before the version-skew story
# in `architecture/05` can be true at all. `/healthz` reports the build and the
# client compares it against its own; with no image there was no injection
# point, so it read `dev` forever and a mismatch could never be detected.
#
# Deliberately runs TypeScript through `tsx` rather than compiling. There is no
# build step anywhere in this repository — the packages are source-only and
# import each other by real path (§4.2) — and adding one here would make the
# thing that runs on the Pi a different artefact from the thing that is tested.

FROM node:22-alpine AS deps

# corepack ships with the image and pins pnpm from package.json's
# `packageManager` field, so the container installs with the same pnpm the
# workspace declares rather than whatever is newest.
RUN corepack enable

WORKDIR /app

# The manifests first, so a source edit does not invalidate the install layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json         apps/api/
COPY packages/core/package.json    packages/core/
COPY packages/db/package.json      packages/db/

# `--filter ... --prod=false` because `tsx` is a dev dependency and is what
# runs the process. `--frozen-lockfile` so an image can never be built from a
# lockfile that drifted from the manifests.
RUN pnpm install --frozen-lockfile --filter @waltning/api...

FROM node:22-alpine AS runtime

RUN corepack enable
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules

COPY package.json pnpm-workspace.yaml ./
# Each package's tsconfig extends this one. `tsx` strips types rather than
# typechecking, so it is not needed to run — but its absence is the kind of
# thing that surfaces the first time anything reads a config, in production.
COPY tsconfig.base.json ./
COPY apps/api      ./apps/api
COPY packages/core ./packages/core
COPY packages/db   ./packages/db

# Passed at build time and frozen into the image. A value that arrived at *run*
# time could be changed without rebuilding, which would make it a label rather
# than an identity — and the client compares it precisely to detect that the
# code changed.
ARG BUILD_SHA=unknown
ENV BUILD_SHA=$BUILD_SHA

# Never root, and never the default `node` home either: this process needs no
# write access anywhere on its own filesystem.
USER node

# Loopback would make the container unreachable from Caddy, which is a separate
# container. The perimeter here is the compose network plus §5.1's tailnet-only
# ingress — not this bind address.
ENV BIND_ADDRESS=0.0.0.0
ENV API_PORT=3000
EXPOSE 3000

WORKDIR /app/apps/api
CMD ["node", "--import", "tsx", "src/index.ts"]
