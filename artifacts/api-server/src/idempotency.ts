import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().filter(key => obj[key] !== undefined)
      .map(key => `${JSON.stringify(key)}:${canonical(obj[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function requestHash(userId: string, body: unknown): string {
  return createHash("sha256").update(canonical({ userId, body })).digest("hex");
}

export async function withUserIdempotency<T>(
  tx: PoolClient, userId: string, operationId: string, body: unknown, fn: () => Promise<T>,
): Promise<T> {
  const hash = requestHash(userId, body);
  await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`user:${userId}:${operationId}`]);
  const prior = await tx.query<{ request_hash: string; response: T }>(
    "select request_hash, response from user_idempotency_keys where user_id = $1 and operation_id = $2",
    [userId, operationId],
  );
  if (prior.rowCount) {
    if (prior.rows[0]!.request_hash !== hash) {
      throw Object.assign(new Error("Operation reused"), { code: "OPERATION_REUSED" });
    }
    return prior.rows[0]!.response;
  }
  const response = await fn();
  await tx.query("insert into user_idempotency_keys(user_id, operation_id, request_hash, response) values ($1,$2,$3,$4)",
    [userId, operationId, hash, JSON.stringify(response)]);
  return response;
}

export async function withWorkspaceIdempotency<T>(
  tx: PoolClient, workspaceId: string, userId: string, operationId: string, body: unknown, fn: () => Promise<T>,
): Promise<T> {
  const hash = requestHash(userId, body);
  await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`workspace:${workspaceId}:${operationId}`]);
  const prior = await tx.query<{ request_hash: string; response: T }>(
    "select request_hash, response from idempotency_keys where workspace_id = $1 and operation_id = $2",
    [workspaceId, operationId],
  );
  if (prior.rowCount) {
    if (prior.rows[0]!.request_hash !== hash) {
      throw Object.assign(new Error("Operation reused"), { code: "OPERATION_REUSED" });
    }
    return prior.rows[0]!.response;
  }
  const response = await fn();
  await tx.query("insert into idempotency_keys(workspace_id, operation_id, request_hash, response) values ($1,$2,$3,$4)",
    [workspaceId, operationId, hash, JSON.stringify(response)]);
  return response;
}