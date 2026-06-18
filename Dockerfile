# ---- Build Stage ----
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@11.0.9 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src/ ./src/
RUN pnpm build

# ---- Production Stage ----
FROM node:22-alpine AS production
RUN corepack enable && corepack prepare pnpm@11.0.9 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/server.js"]
