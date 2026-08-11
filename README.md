# Jokas Agribusiness ERP

Scalable monorepo foundation for a multi-farm agribusiness ERP covering poultry farms, feed production, soya processing, inventory, sales, finance, procurement, HR, maintenance, quality control, marketing insights, and AI decision support.

## Structure

```text
apps/
  api/         NestJS backend, API v1 routes, auth, RBAC, audit, logging, errors
  web/         Next.js + Tailwind CSS admin frontend
  storefront/  Next.js customer-facing storefront
  mobile/      Expo React Native mobile app
packages/
  db/          Prisma schema (MySQL), generated client, seed scripts
  shared/      Shared types, constants, validation helpers, utilities
docs/          Architecture, module roadmap, deployment guide
start.js       Production process supervisor (see docs/deployment/README.md) — local dev does NOT use this
```

`infra/docker/`, `infra/nginx/`, `infra/postgres/`, and `docker-compose.prod.yml` are an earlier Docker/Postgres deployment path that was **never used in production** and has been superseded by the Hostinger pipeline described below. They're left in place only as a reference; don't follow them for a real deploy — see [docs/deployment/README.md](docs/deployment/README.md) for the actual one.

## Local Ports

- Web: `http://localhost:3000`
- Storefront: `http://localhost:3002` (see `apps/storefront/package.json` for the exact dev port)
- API: `http://localhost:4001/api/v1`
- MySQL: `localhost:13306` (via `docker-compose.yml`, mapped off the default 3306 to avoid conflicts with a local MySQL install)

## Setup

```bash
corepack enable
pnpm install
cp .env.example .env
```

Set strong secrets in `.env`. JWT secrets must be at least 32 characters.

## Database

Jokas runs on **MySQL** (via Prisma), not PostgreSQL — `packages/db/prisma/schema.prisma` is the single schema source for both local dev and the Hostinger production build.

Start MySQL:

```bash
docker compose up -d mysql
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

**Production does not use `prisma migrate deploy`.** Hostinger's shared-hosting MySQL user doesn't reliably support the shadow-database Prisma needs for that command, so the deploy pipeline runs a hand-rolled migration runner instead — see [docs/deployment/README.md](docs/deployment/README.md#database-migrations-in-production) for how that actually works before touching migration-related code.

## Run Apps

Frontend:

```bash
pnpm --filter @jokas/web dev
```

Storefront:

```bash
pnpm --filter @jokas/storefront dev
```

Backend:

```bash
pnpm --filter @jokas/api dev
```

Mobile:

```bash
pnpm --filter @jokas/mobile dev
```

Full web + storefront + API dev (parallel):

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

API end-to-end tests run separately and are part of the CI quality gate before any deploy:

```bash
pnpm --filter @jokas/api test:e2e
```

## Production

Production runs on **Hostinger shared hosting** (Node.js via Passenger), not Docker/AWS/a VPS. Deploys go out via GitHub Actions over SSH. See [docs/deployment/README.md](docs/deployment/README.md) for the full picture — process supervision (`start.js`), the deploy pipeline, migrations, backups, and the `/__status` diagnostic endpoint.

## Foundation Features

- API versioning: `/api/v1`
- MySQL + Prisma ORM
- Secure environment validation
- JWT auth with refresh-token persistence
- Role-based and permission-based authorization
- Tenant-scoped organization data model
- Global error response structure
- Request logging interceptor
- Audit log service
- Soft-delete fields on key operational records
- Future-module folders for large ERP growth
