# Architecture

## Monorepo Layout

```text
apps/
  api/       NestJS API with clean module boundaries
  web/       Next.js admin web app
  mobile/    Expo mobile app
packages/
  db/        Prisma schema, generated client, seed data
  shared/    Permission constants and shared DTO-like types
infra/
  docker/    Dockerfiles and runtime infrastructure
```

## Module Order

1. Platform foundation and Identity/Access
2. Poultry farm operations
3. Feed production and feed mill
4. Soya processing
5. Inventory and warehouse management
6. Sales and customer management
7. Procurement and supplier management
8. Finance and accounting
9. HR, workers, and tasks
10. Machine and maintenance management
11. Quality control
12. Marketing insights
13. AI alerts, forecasting, and decision support

## Security Model

- Every business record belongs to an `organizationId`.
- Operational records also reference farm, branch, production site, or warehouse when applicable.
- API requests authenticate with short-lived JWT access tokens.
- Refresh tokens are stored hashed, can be revoked, and are rotated on refresh.
- Authorization combines roles with explicit permissions.
- Sensitive changes create audit log events with actor, organization, action, entity, IP, and user agent.
- Soft delete is modeled with `deletedAt` for records that should remain auditable.

## Backup Strategy

- PostgreSQL point-in-time recovery should be enabled in production.
- Nightly compressed logical backups should be stored in a separate encrypted bucket.
- Backup restoration must be tested at least monthly in a non-production environment.
- Uploaded files should use object storage with versioning and lifecycle policies.

## Reporting Strategy

- API report services produce typed datasets first.
- Export adapters produce PDF and Excel formats from the same dataset.
- Long-running exports should move to background jobs once module volume grows.
