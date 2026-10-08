import { Router } from "express";
import type { Pool } from "pg";
import { CreateProjectBody, UpdateProjectBody } from "@workspace/api-zod";
import { withWorkspaceIdempotency } from "../idempotency";
import { domainRoute as memberRoute } from "./domain-support";
import { id, notFound, parseBody, rule } from "./domain-support";

const columns = "id,name,address,timezone,work_days,status,version";
export function createProjectsRouter(db: Pool) {
  const router = Router();
  memberRoute(router, db, "get", "/projects", "workspace.read", async (tx, _m, ws) =>
    (await tx.query(`select ${columns} from projects where workspace_id=$1 and status != 'ARCHIVED' order by created_at`, [ws])).rows);
  memberRoute(router, db, "post", "/projects", "projects.manage", async (tx, _m, ws, req) => {
    const body = parseBody(CreateProjectBody, req);
    if (!body.name.trim()) rule("name required");
    if (body.work_days && new Set(body.work_days).size !== body.work_days.length) rule("work_days must be unique");
    if (!(await tx.query("select 1 from pg_timezone_names where name=$1", [body.timezone])).rowCount) rule("Invalid timezone");
    return withWorkspaceIdempotency(tx, ws, req.ctx!.userId, body.operation_id, { route: "POST /projects", ...body }, async () =>
      (await tx.query(`insert into projects(workspace_id,name,timezone,work_days,address)
        values($1,$2,$3,coalesce($4::smallint[],'{1,2,3,4,5,6}'::smallint[]),$5) returning ${columns}`,
      [ws, body.name, body.timezone, body.work_days ?? null, body.address ?? null])).rows[0]);
  });
  memberRoute(router, db, "get", "/projects/:id", "workspace.read", async (tx, _m, ws, req) => {
    const result = await tx.query(`select ${columns} from projects where workspace_id=$1 and id=$2`, [ws, id.parse(req.params.id)]);
    return result.rows[0] ?? notFound();
  });
  memberRoute(router, db, "patch", "/projects/:id", "projects.manage", async (tx, _m, ws, req) => {
    const projectId = id.parse(req.params.id), body = parseBody(UpdateProjectBody, req);
    if (body.name != null && !body.name.trim()) rule("name required");
    if (body.work_days && new Set(body.work_days).size !== body.work_days.length) rule("work_days must be unique");
    return withWorkspaceIdempotency(tx, ws, req.ctx!.userId, body.operation_id,
      { route: "PATCH /projects/:id", projectId, ...body }, async () => {
        const result = await tx.query(`update projects set name=coalesce($3,name),
          address=case when $4 then $5 else address end, work_days=coalesce($6::smallint[],work_days),
          status=coalesce($7,status), version=version+1 where workspace_id=$1 and id=$2 returning ${columns}`,
        [ws, projectId, body.name ?? null, Object.hasOwn(body, "address"), body.address ?? null, body.work_days ?? null, body.status ?? null]);
        return result.rows[0] ?? notFound();
      });
  });
  return router;
}
