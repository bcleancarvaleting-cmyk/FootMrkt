# MATCHX — production image.
#   docker build -t matchx .                 → the web app (target "app", default)
#   docker build -t matchx-tools --target tools .  → migrations, the 5-minute job, imports
# See docs/DEPLOY.md.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npx next build

# Tools: full source + dependencies, for `npx prisma migrate deploy` and `npm run jobs -- tick`.
FROM deps AS tools
COPY . .
RUN npx prisma generate
ENV NODE_ENV=production
CMD ["npm", "run", "jobs", "--", "tick"]

# Web app: Next.js standalone server only.
FROM node:22-bookworm-slim AS app
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN useradd --system --uid 1001 matchx
COPY --from=build --chown=matchx /app/.next/standalone ./
COPY --from=build --chown=matchx /app/.next/static ./.next/static
COPY --from=build --chown=matchx /app/public ./public
USER matchx
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
