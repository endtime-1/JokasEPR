# Jokas Agribusiness ERP

Scalable monorepo foundation for a multi-farm agribusiness ERP covering poultry farms, feed production, soya processing, inventory, sales, finance, procurement, HR, maintenance, quality control, marketing insights, and AI decision support.

## Structure

```text
apps/
  api/       NestJS backend, API v1 routes, auth, RBAC, audit, logging, errors
  web/       Next.js + Tailwind CSS admin frontend
  mobile/    Expo React Native mobile app
packages/
  db/        Prisma schema, generated client, seed scripts
  shared/    Shared types, constants, validation helpers, utilities
infra/
  docker/    Dockerfiles
docs/        Architecture and module roadmap
```

## Local Ports

- Web: `http://localhost:3000`
- API: `http://localhost:4001/api/v1`
- PostgreSQL: `localhost:15432`

Port `15432` is used for PostgreSQL to avoid conflicts with local PostgreSQL installations on `5432`.

## Setup

```bash
corepack enable
pnpm install
cp .env.example .env
```

Set strong secrets in `.env`. JWT secrets must be at least 32 characters.

## Database

Start PostgreSQL:

```bash
docker compose up -d postgres
```

Generate Prisma client:

```bash
pnpm db:generate
```

Create/apply a migration:

```bash
pnpm db:migrate
```

For quick local schema sync without creating a migration:

```bash
pnpm --filter @jokas/db exec prisma db push
```

Seed initial organization, admin user, roles, permissions, locations, and audit log:

```bash
pnpm db:seed
```

Seed login:

- Email: `admin@jokas.local`
- Password: `Admin@12345`

## Run Apps

Frontend:

```bash
pnpm --filter @jokas/web dev
```

Backend:

```bash
pnpm --filter @jokas/api dev
```

Mobile:

```bash
pnpm --filter @jokas/mobile dev
```

Database only:

```bash
docker compose up -d postgres
```

Full web + API dev:

```bash
pnpm dev
```

## Quality

```bash
pnpm lint
pnpm test
pnpm build
pnpm format
```

## Foundation Features

- API versioning: `/api/v1`
- PostgreSQL + Prisma ORM
- Secure environment validation
- JWT auth with refresh-token persistence
- Role-based and permission-based authorization
- Tenant-scoped organization data model
- Global error response structure
- Request logging interceptor
- Audit log service
- Soft-delete fields on key operational records
- Docker-ready local database
- Future-module folders for large ERP growth
