# Multi-stage build using Next.js standalone output.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
# NEXT_PUBLIC_* values are inlined into the client bundle at build time. They come only from these build args
# (set in docker-compose.yml), never from .env files, which .dockerignore keeps out of the build context.
ARG NEXT_PUBLIC_API_BASE_URL=/api
ARG NEXT_PUBLIC_ELEVENLABS_AGENT_ID=
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_ELEVENLABS_AGENT_ID=$NEXT_PUBLIC_ELEVENLABS_AGENT_ID \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN addgroup -S -g 10001 arrive && adduser -S -u 10001 -G arrive arrive
COPY --from=build --chown=arrive:arrive /app/public ./public
COPY --from=build --chown=arrive:arrive /app/.next/standalone ./
COPY --from=build --chown=arrive:arrive /app/.next/static ./.next/static
USER arrive
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/en').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
