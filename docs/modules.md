# Module Build Plan

## Completed Foundation Slice

- Database models for organizations, branches, farms, production sites, warehouses, users, roles, permissions, refresh tokens, and audit logs
- Auth endpoints: login, refresh, logout, current user
- RBAC and permission guards
- Platform endpoints for locations
- Identity endpoints for users, roles, and permissions
- Audit log reads
- CSV export for platform locations
- Web screens for dashboard, locations, users, roles, reports, and audit logs
- Expo shell for sign-in and dashboard summary

## Next Module: Poultry Operations

Core records:

- Flock batches
- Houses and pens
- Daily mortality
- Feed consumption
- Egg production
- Vaccination and medication
- Bird transfers
- Poultry performance reports

Security:

- `poultry.read`
- `poultry.manage`
- `poultry.approve`
- `poultry.reports`

Audit events:

- Flock batch created
- Daily production recorded
- Mortality recorded
- Vaccination recorded
- Poultry report exported
