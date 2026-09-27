# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
WORKDIR /app
COPY . .
ARG NEXT_PUBLIC_AJS_API_URL=/api
ENV NEXT_PUBLIC_AJS_API_URL=${NEXT_PUBLIC_AJS_API_URL}
RUN npx prisma generate
RUN npm run api:build
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS api
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]

FROM node:20-bookworm-slim AS frontend
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js
USER node
EXPOSE 3010
CMD ["npm", "run", "start"]
