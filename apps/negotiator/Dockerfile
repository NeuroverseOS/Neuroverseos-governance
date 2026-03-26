FROM node:20-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install --production=false
COPY . .
RUN npx tsc

FROM node:20-slim
WORKDIR /app
RUN addgroup --gid 1001 negotiator && adduser --uid 1001 --gid 1001 --disabled-password negotiator
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src/worlds ./dist/worlds
COPY package.json ./
USER negotiator
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:3002/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"
CMD ["node", "dist/server.js"]
