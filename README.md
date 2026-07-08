# SavazAI Multi-Agent Operating System & Control Plane
An enterprise-grade, local-first agentic orchestration engine driven by stateful LangGraph loops, deterministic data privacy gateways, and real-time streaming NDJSON infrastructure.

## 🛠️ Project Architecture
- `/savazai-console`: Next.js 15 Frontend Command Center & Chat Workspace.
- `/savazai-backend`: FastAPI backend managing the LangGraph multi-agent loops and provider routing.
- Dockerized microservices stack powered by PostgreSQL 17 with `pgvector`.

## 🔐 Production Environment Variables Guide
### Backend (.env)
- `DATABASE_URL=postgresql://sz_harness_admin:<password>@<db-host>:5432/savazai_harness`
- `BACKEND_PORT=3055`
- `NEXT_PUBLIC_HARNESS_API_URL=http://localhost:3055` (Adjusted proxy boundary)

### Frontend (.env.local / Coolify Build Secrets)
- `NEXT_PUBLIC_APP_URL=http://localhost:3056`
- `BETTER_AUTH_SECRET=<generate_secure_random_key>`

### 🌐 Coolify Production Environment Matrix
Configure these variables as "Application Secrets / Environment Variables" inside Coolify:
- `DB_USER`: Custom production database administrator username.
- `DB_PASSWORD`: Cryptographically secure database password string.
- `DB_NAME`: Dedicated database storage scheme name.
- `NEXT_PUBLIC_APP_URL`: The public user-facing domain or external IP of your console.
- `NEXT_PUBLIC_HARNESS_API_URL`: The production-facing endpoint or domain for backend API calls.
- `BETTER_AUTH_SECRET`: Generate a safe random key for application session validation.

## 🚀 Coolify Cloud VPS Deployment Guidance
1. Create a new application in Coolify and connect your GitHub repository.
2. Use the standard Docker Compose deployment methodology path.
3. Ensure all environment production keys are mapped directly inside the Coolify "Environment Variables" tab.
4. Map your persistent PostgreSQL data volume using paths relative to Coolify's workspace setup.
