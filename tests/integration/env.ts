export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://collectr:collectr@localhost:5432/collectr_test?schema=public";
