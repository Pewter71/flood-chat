# ========================================
# Этап 1: Dependencies
# ========================================
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production=false

# ========================================
# Этап 2: Builder
# ========================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG VITE_SOCKET_URL=""
ENV VITE_SOCKET_URL=${VITE_SOCKET_URL}

RUN npm run build && find dist -name "*.map" -type f -delete

# ========================================
# Этап 3: Development
# ========================================
FROM node:20-alpine AS development

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ========================================
# Этап 4: Production
# ========================================
FROM nginx:alpine AS production

RUN rm -rf /etc/nginx/conf.d/default.conf /etc/nginx/conf.d/*.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

RUN cd /usr/share/nginx/html && \
    find . -name "*.map" -delete && \
    rm -rf .vite && \
    chown -R nginx:nginx . && \
    chmod -R 755 .

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
