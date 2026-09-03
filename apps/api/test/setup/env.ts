export const TEST_ACCESS_SECRET = "test-access-secret-padding-to-reach-minimum-32-chars!";
export const TEST_REFRESH_SECRET = "test-refresh-secret-padding-to-reach-minimum-32-chars!";
export const TEST_PASSWORD = "Admin@12345!";

Object.assign(process.env, {
  NODE_ENV: "test",
  // Placeholder only — the test suite uses a Prisma mock (see
  // test/setup/prisma.mock.ts) and never opens a real connection. Kept as
  // mysql:// to match schema.prisma's `provider = "mysql"` so it isn't
  // mistaken for a sign that production runs Postgres (it does not — see
  // infra/README.md; the infra/postgres + infra/docker + docker-compose*.yml
  // files are abandoned scaffolding that nothing runs).
  DATABASE_URL: "mysql://jokas_test:test_pass@localhost:3306/jokas_test",
  JWT_ACCESS_SECRET: TEST_ACCESS_SECRET,
  JWT_REFRESH_SECRET: TEST_REFRESH_SECRET,
  JWT_ACCESS_TTL: "15m",
  JWT_REFRESH_TTL_DAYS: "30",
  API_PORT: "4002",
  API_PREFIX: "api",
  API_VERSION: "1",
  WEB_ORIGIN: "http://localhost:3000",
  UPLOAD_MAX_MB: "10",
});
