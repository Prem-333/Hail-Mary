# ── Dashboard (Next.js + Turborepo) ────────────────────────────────────
FROM node:20-alpine AS dashboard

WORKDIR /app

# Install deps (cached layer)
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json

RUN npm ci

# Copy source
COPY . .

# Set API URL to point at the docker-compose service name
ENV NEXT_PUBLIC_API_URL=http://api:8000
ENV NEXT_PUBLIC_WS_URL=ws://api:8000

EXPOSE 3000

CMD ["npm", "run", "dev"]
