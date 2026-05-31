# Backend image for local/demo use. Multi-stage: compile with the full
# toolchain, then ship only production dependencies + the compiled output.
# Not production-hardened — see docs/local-development.md.

# --- Build stage: install all deps and compile TypeScript -> dist/ ---
FROM node:22-alpine AS builder
WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci

# Build the app.
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# --- Runtime stage: production deps only, run the compiled app ---
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Documentation only; the app binds to PORT from the (validated) config.
EXPOSE 3000

CMD ["node", "dist/main.js"]
