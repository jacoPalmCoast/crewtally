import pg, { type PoolClient, type QueryResultRow } from "pg";

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

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