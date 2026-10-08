import { Router } from "express";
import type { Pool } from "pg";
import { CreateWorkerBody, UpdateWorkerBody } from "@workspace/api-zod";
import { withWorkspaceIdempotency } from "../idempotency";
import { domainRoute as memberRoute } from "./domain-support";
import { exists, id, notFound, numbers, parseBody, rule } from "./domain-support";

const columns = "id,display_name,phone,email,status,document_language,version";
export function createWorkersRouter(db: Pool) {
  const router = Router();
  memberRoute(router, db, "get", "/workers", "workspace.read", async (tx, _m, ws) =>
    (await tx.query(`select ${columns} from workers where workspace_id=$1 and status='ACTIVE' order by id`, [ws])).rows);
  memberRoute(router, db, "post", "/workers", "people.add", async (tx, _m, ws, req) => {
    const body = parseBody(CreateWorkerBody, req);
    if (!body.display_name.trim()) rule("display_name required");
    return withWorkspaceIdempotency(tx, ws, req.ctx!.userId, body.operation_id, { route: "POST /workers", ...body }, async () =>
      (await tx.query(`insert into workers(workspace_id,display_name,phone,email,document_language)
        values($1,$2,$3,$4,$5) returning ${columns}`,
      [ws, body.display_name, body.phone ?? null, body.email ?? null, body.document_language ?? "en"])).rows[0]);
  });
  memberRoute(router, db, "get", "/workers/:id", "workspace.read", async (tx, _m, ws, req) => {
    const result = await tx.query(`select ${columns} from workers where workspace_id=$1 and id=$2`, [ws, id.parse(req.params.id)]);
    return result.rows[0] ?? notFound();
  });
  memberRoute(router, db, "patch", "/workers/:id", "people.add", async (tx, _m, ws, req) => {
    const workerId = id.parse(req.params.id), body = parseBody(UpdateWorkerBody, req);
    if (body.display_name != null && !body.display_name.trim()) rule("display_name required");
    return withWorkspaceIdempotency(tx, ws, req.ctx!.userId, body.operation_id,
      { route: "PATCH /workers/:id", workerId, ...body }, async () => {
        const result = await tx.query(`update workers set display_name=coalesce($3,display_name),
          phone=case when $4 then $5 else phone end, email=case when $6 then $7 else email end,
          document_language=coalesce($8,document_language),status=coalesce($9,status),version=version+1
          where workspace_id=$1 and id=$2 returning ${columns}`,
        [ws, workerId, body.display_name ?? null, Object.hasOwn(body, "phone"), body.phone ?? null,
          Object.hasOwn(body, "email"), body.email ?? null, body.document_language ?? null, body.status ?? null]);
        return result.rows[0] ?? notFound();
      });
  });
  memberRoute(router, db, "get", "/workers/:id/year-paid", "money.view", async (tx, _m, ws, req) => {
    const workerId = id.parse(req.params.id);
    await exists(tx, ws, "workers", workerId);
    return numbers((await tx.query("select year,net_paid_minor from worker_year_paid where workspace_id=$1 and worker_id=$2 order by year", [ws, workerId])).rows);
  });
  return router;
}
