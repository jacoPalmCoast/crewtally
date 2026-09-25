import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Pool } from "pg";
import { pool } from "./pool";

// The server package remains the process cwd both under tsx and the bundled build.
const migrationsDir = path.resolve(process.cwd(), "../../db/migrations");

export async function migrate(db: Pool = pool, directory = migrationsDir): Promise<number> {
  const files = (await readdir(directory)).filter(name => /^[0-9]{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
  const client = await db.connect();
  try {
    // Serialize concurrent starters before reading the ledger.
    await client.query("SELECT pg_advisory_lock(hashtext('crewtally_schema_migrations'))");
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text primary key, sha256 text not null, applied_at timestamptz not null default now()
    )`);
    let applied = 0;
    for (const filename of files) {
      const sql = await readFile(path.join(directory, filename));
      const sha256 = createHash("sha256").update(sql).digest("hex");
      const prior = await client.query<{ sha256: string }>(
        "SELECT sha256 FROM schema_migrations WHERE filename = $1", [filename]);
      if (prior.rowCount) {
        if (prior.rows[0]?.sha256 !== sha256) throw new Error(`Migration checksum mismatch: ${filename}`);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sql.toString("utf8"));
        await client.query("INSERT INTO schema_migrations(filename, sha256) VALUES ($1, $2)", [filename, sha256]);
        await client.query("COMMIT");
        applied++;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    return applied;
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('crewtally_schema_migrations'))");
    client.release();
  }
}

if (process.env.CREWTALLY_RUN_MIGRATIONS === "1") {
  migrate().then(count => {
    process.stdout.write(`Migrations applied: ${count}\n`);
    return pool.end();
  }).catch((error: unknown) => {
    const firstLine = error instanceof Error ? error.message.split(/\r?\n/, 1)[0] : "Unknown error";
    // Never echo a connection string, credential, or SQL fragment from an arbitrary error message.
    const unsafe = /(?:postgres(?:ql)?:\/\/|password|DATABASE_URL|connection\s*string|\b(?:select|insert|update|delete|create|alter|drop|truncate)\b)/i;
    const message = firstLine && !unsafe.test(firstLine)
      ? firstLine.slice(0, 240)
      : "Error message redacted";
    const rawCode = error && typeof error === "object" && "code" in error ? error.code : undefined;
    const code = typeof rawCode === "string" && /^[A-Z0-9]{5}$/.test(rawCode) ? ` (SQLSTATE ${rawCode})` : "";
    process.stderr.write(`Migration failed: ${message}${code}\n`);
    process.exitCode = 1;
    void pool.end();
  });
}