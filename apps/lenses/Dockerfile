FROM node:20-slim AS builder

WORKDIR /app

# Copy the full governance repo (we need the engine + worlds)
COPY package.json package-lock.json* ./
COPY apps/lenses/package.json apps/lenses/
COPY src/ src/
COPY apps/lenses/ apps/lenses/

# Install root deps (governance engine)
RUN npm install --production=false

# Build the app
WORKDIR /app/apps/lenses
RUN npx tsc || true
RUN mkdir -p dist/worlds && cp src/worlds/*.nv-world.md dist/worlds/

# ── Production stage ──────────────────────────────────────────────────────────

FROM node:20-slim

WORKDIR /app

# Copy built app + governance engine
COPY --from=builder /app/apps/lenses/dist ./apps/lenses/dist
COPY --from=builder /app/apps/lenses/package.json ./apps/lenses/
COPY --from=builder /app/src ./src
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/lenses/mentra.app.json ./apps/lenses/

WORKDIR /app/apps/lenses

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
