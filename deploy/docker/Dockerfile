# DEAL Control Tower — single multi-role image (ROLE selects api | web | worker | all).
# Distroless-ish slim base; pnpm workspace; runs api/worker via tsx, web via next.
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

# --- dependencies (cached on lockfile) ---
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile

# --- build (web only needs a build; engine/api/worker run via tsx) ---
FROM deps AS build
COPY . .
RUN pnpm --filter @dct/web build

# --- runtime ---
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
COPY deploy/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENV ROLE=all PORT=4400
EXPOSE 4400 4500
# Health: api /health, web /
HEALTHCHECK --interval=30s --timeout=5s --retries=5 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4400)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/entrypoint.sh"]
