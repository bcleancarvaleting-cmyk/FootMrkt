import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

export type Db = PrismaClient;
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

function create(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const g = globalThis as unknown as { __collectrDb?: PrismaClient };
export const db: PrismaClient = g.__collectrDb ?? create();
if (process.env.NODE_ENV !== "production") g.__collectrDb = db;

/** Run in a SERIALIZABLE-safe retry loop for ownership-changing transactions. */
export async function withTx<T>(fn: (tx: Tx) => Promise<T>, opts: { retries?: number } = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(fn, { timeout: 20_000, maxWait: 10_000 });
    } catch (e) {
      const code = (e as { code?: string }).code;
      // P2034: write conflict / deadlock — safe to retry the whole transaction.
      if (code === "P2034" && attempt < retries) continue;
      throw e;
    }
  }
}
