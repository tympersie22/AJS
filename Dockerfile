# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS dependencies
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/ajs/package.json ./apps/ajs/package.json
RUN npm ci --workspace=@ajs/system --include-workspace-root

FROM dependencies AS builder
WORKDIR /workspace
COPY apps/ajs ./apps/ajs
ARG NEXT_PUBLIC_AJS_API_URL=/api
ENV NEXT_PUBLIC_AJS_API_URL=${NEXT_PUBLIC_AJS_API_URL}
RUN npm run api:build --workspace=@ajs/system
RUN npm run build --workspace=@ajs/system
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS api
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000
WORKDIR /workspace/apps/ajs
COPY --from=builder /workspace/node_modules /workspace/node_modules
COPY --from=builder /workspace/apps/ajs/dist ./dist
COPY --from=builder /workspace/apps/ajs/prisma ./prisma
COPY --from=builder /workspace/apps/ajs/package.json ./package.json
USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]

FROM node:20-bookworm-slim AS frontend
ENV NODE_ENV=production
WORKDIR /workspace/apps/ajs
COPY --from=builder /workspace/node_modules /workspace/node_modules
COPY --from=builder /workspace/apps/ajs/.next ./.next
COPY --from=builder /workspace/apps/ajs/package.json ./package.json
COPY --from=builder /workspace/apps/ajs/next.config.js ./next.config.js
USER node
EXPOSE 3010
CMD ["npm", "run", "start"]
