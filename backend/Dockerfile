# ========================================
# Этап 1: Development
# ========================================
FROM node:20-alpine AS development

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 3001

CMD ["npm", "run", "dev"]

# ========================================
# Этап 2: Production Dependencies
# ========================================
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && \
    npm cache clean --force

# ========================================
# Этап 3: Production
# ========================================
FROM node:20-alpine AS production

RUN apk add --no-cache curl

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs . .

USER nodejs

EXPOSE 3001


HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -s http://localhost:3001/socket.io/ > /dev/null || exit 1

CMD ["node", "server.js"]
