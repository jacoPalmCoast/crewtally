import type { Request } from "express";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";

export interface Member {
  role: string;
  financial_access: boolean | null;
  worker_id: string | null;
  kind: "HOME" | "BUSINESS";
}

export async function inTransaction<T>(db: Pool, fn: (tx: PoolClient) => Promise<T>): Promise<T> {
  const tx = await db.connect();
  try {
    await tx.query("BEGIN");
    const result = await fn(tx);
    await tx.query("COMMIT");
    return result;
  } catch (error) {
    await tx.query("ROLLBACK");
    throw error;
  } finally {
    tx.release();
  }
}

export async function withMember<T>(
  db: Pool, req: Request, action: string,
  fn: (tx: PoolClient, member: Member, workspaceId: string) => Promise<T>,
  authorize?: (member: Member) => void,
): Promise<T> {
  const workspace = z.string().uuid().safeParse(req.get("X-Workspace-Id"));
  if (!workspace.success) throw Object.assign(new Error("Not found"), { code: "CT404" });
  return inTransaction(db, async tx => {
    // Optional scope policy runs before the action gate, so excluded members
    // receive the same 404 on reads and writes, without revealing capabilities.
    if (authorize) {
      const context = await tx.query<{ member: Member }>(
        "select require_member($1, $2, $3) as member", [workspace.data, req.ctx!.userId, "workspace.read"],
      );
      authorize(context.rows[0]!.member);
      if (action === "workspace.read") return fn(tx, context.rows[0]!.member, workspace.data);
    }
    const result = await tx.query<{ member: Member }>(
      "select require_member($1, $2, $3) as member", [workspace.data, req.ctx!.userId, action],
    );
    // Recheck the current membership returned by the action gate as well.
    authorize?.(result.rows[0]!.member);
    return fn(tx, result.rows[0]!.member, workspace.data);
  });
}