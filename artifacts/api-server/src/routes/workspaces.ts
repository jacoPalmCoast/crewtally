import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { inTransaction } from "../auth/member";
import { withUserIdempotency, withWorkspaceIdempotency } from "../idempotency";
import { memberRoute, publicRoute, sessionRoute } from "./registration";

export const operation = z.object({ operation_id: z.string().uuid() });
const name = z.string().trim().min(1).max(80);
export async function readWorkspace(tx: Pick<Pool, "query">, id: string) {
  const result = await tx.query("select id, name, kind, currency_code::text as currency, default_timezone from workspaces where id=$1", [id]);
  return result.rows[0];
}
export function createWorkspaceRouter(db: Pool, env: NodeJS.ProcessEnv) {
  const router = Router();
  publicRoute(router, "get", "/config", (_req, res) => { res.json({ business_enabled: env.BUSINESS_ENABLED === "true" }); });
  sessionRoute(router, db, "post", "/workspaces", async (req, res, next) => {
    try {
      const body = operation.extend({ kind: z.enum(["HOME", "BUSINESS"]), name, timezone: z.string().min(1).max(100) }).strict().parse(req.body);
      if (body.kind === "BUSINESS" && env.BUSINESS_ENABLED !== "true") throw Object.assign(new Error("Not found"), { code: "CT404" });
      const result = await inTransaction(db, tx => withUserIdempotency(tx, req.ctx!.userId, body.operation_id,
        { route: "POST /workspaces", ...body }, async () => {
          const result = await tx.query("select create_workspace($1,$2,$3,'USD',$4) as id",
            [req.ctx!.userId, body.kind, body.name, body.timezone]);
          return readWorkspace(tx, result.rows[0].id);
        }));
      res.json(result);
    } catch (error) { next(error); }
  });
  memberRoute(router, db, "get", "/workspace", "workspace.read", async (tx, _member, ws, req) => {
    const permissions = await tx.query("select member_permissions($1,$2) as result", [ws, req.ctx!.userId]);
    return { ...await readWorkspace(tx, ws), ...permissions.rows[0].result };
  });
  memberRoute(router, db, "patch", "/workspace", "settings.edit", async (tx, _member, ws, req) => {
    const body = operation.extend({ name }).strict().parse(req.body);
    return withWorkspaceIdempotency(tx, ws, req.ctx!.userId, body.operation_id, { route: "PATCH /workspace", ...body }, async () => {
      await tx.query("update workspaces set name=$1 where id=$2", [body.name, ws]);
      return readWorkspace(tx, ws);
    });
  });
  return router;
}