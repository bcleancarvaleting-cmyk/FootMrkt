import { TEST_DATABASE_URL } from "./env";

if (!/_test\b/.test(new URL(TEST_DATABASE_URL).pathname)) {
  throw new Error("Integration tests must run against a database whose name ends in _test");
}
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.FLAG_DEV_TOOLS = "true";
process.env.FLAG_SIMULATED_DATA = "true";
