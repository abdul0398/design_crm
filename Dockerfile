FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS tooling
COPY tsconfig.json ./
COPY scripts ./scripts
COPY migrations ./migrations
COPY src/lib ./src/lib
CMD ["npm", "run", "db:migrate"]

FROM dependencies AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 STORAGE_ROOT=/data/websites
RUN groupadd --gid 1001 launch && useradd --uid 1001 --gid launch --no-create-home launch && mkdir -p /data/websites && chown launch:launch /data/websites
COPY --from=builder --chown=launch:launch /app/.next/standalone ./
COPY --from=builder --chown=launch:launch /app/.next/static ./.next/static
COPY --from=builder --chown=launch:launch /app/public ./public
USER launch
EXPOSE 3000
CMD ["node", "server.js"]
