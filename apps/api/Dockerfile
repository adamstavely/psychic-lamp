# The Donovan API, and its migration job (same image: `node dist/migrate.js`).
# Build from the repository root: docker build -f apps/api/Dockerfile -t donovan-api .

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY vendor vendor
RUN npm ci --no-audit --no-fund -w @donovan/contracts -w api
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN npm run build -w @donovan/contracts && npm run build -w api

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY vendor vendor
RUN npm ci --no-audit --no-fund --omit=dev -w @donovan/contracts -w api

FROM node:24-alpine
ENV NODE_ENV=production DONOVAN_ENV=production MIGRATE_ON_START=false
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
# Packages npm couldn't hoist (a version differs from the root's) stay under the workspace.
COPY --from=deps /app/apps/api/node_modules apps/api/node_modules
COPY --from=build /app/packages/contracts/package.json packages/contracts/
COPY --from=build /app/packages/contracts/dist packages/contracts/dist
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/drizzle apps/api/drizzle
WORKDIR /app/apps/api
USER node
EXPOSE 3870
CMD ["node", "dist/main.js"]
