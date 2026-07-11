FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json drizzle.config.ts ./
COPY src/ ./src/
RUN npx tsc

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y python3 python3-pip python3-venv && rm -rf /var/lib/apt/lists/*
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY drizzle.config.ts ./
COPY drizzle ./drizzle
COPY src/skills ./src/skills
EXPOSE 3055
CMD ["sh", "-c", "node dist/db/wait-for-db.js && npx drizzle-kit migrate && node dist/db/seed.js && node dist/index.js"]
