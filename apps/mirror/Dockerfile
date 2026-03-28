FROM node:20-slim AS build
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --production=false
COPY . .

FROM node:20-slim
WORKDIR /app
RUN addgroup --gid 1001 appuser && adduser --uid 1001 --gid 1001 --disabled-password appuser
COPY --from=build /app/src ./src
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/world.nv-world.md ./world.nv-world.md
COPY package.json tsconfig.json ./
USER appuser
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:3002/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"
CMD ["npx", "tsx", "src/server.ts"]
