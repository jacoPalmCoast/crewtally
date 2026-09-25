import pg, { type PoolClient, type QueryResultRow } from "pg";
import { logger } from "../lib/logger";

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", (error) => {
  const code = "code" in error && typeof error.code === "string" && /^[A-Z0-9]{5}$/.test(error.code)
    ? error.code : undefined;
  logger.error({ code }, "idle database client error");
});

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function query<Row extends QueryResultRow>(sql: string, params: readonly unknown[] = []) {
  return pool.query<Row>(sql, [...params]);
}