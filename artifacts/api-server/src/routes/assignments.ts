import { Router } from "express";
import type { Pool } from "pg";
import { CreateAssignmentBody, RemoveAssignmentBody } from "@workspace/api-zod";
import { withWorkspaceIdempotency } from "../idempotency";
import { memberRoute } from "./registration";
import { exists, id, notFound, parseBody, rule } from "./domain-support";

export function createAssignmentsRouter(db: Pool) {
  const router = Router();
  memberRoute(router, db, "post", "/projects/:id/assignments", "people.add", async (tx, _m, ws, req) => {
    const projectId = id.parse(req.params.id), body = parseBody(CreateAssignmentBody, req);
    if (body.end_date && body.end_date < body.start_date) rule("end_date precedes start_date");
    return withWorkspaceIdempotency(tx, ws, req.ctx!.userId, body.operation_id,
      { route: "POST /projects/:id/assignments", projectId, ...body }, async () => {
        await exists(tx, ws, "projects", projectId);
        await exists(tx, ws, "workers", body.worker_id);
        return (await tx.query(`insert into assignments(workspace_id,project_id,worker_id,start_date,end_date)
          values($1,$2,$3,$4::date,$5::date) returning id,project_id,worker_id,start_date::text,end_date::text,version`,
        [ws, projectId, body.worker_id, body.start_date, body.end_date ?? null])).rows[0];
      });
  });
  memberRoute(router, db, "get", "/projects/:id/assignments", "workspace.read", async (tx, _m, ws, req) => {
    const projectId = id.parse(req.params.id);
    await exists(tx, ws, "projects", projectId);
    return (await tx.query(`select a.id,a.project_id,a.worker_id,a.start_date::text,a.end_date::text,a.version,w.display_name
      from assignments a join workers w on w.workspace_id=a.workspace_id and w.id=a.worker_id
      where a.workspace_id=$1 and a.project_id=$2 order by a.start_date,a.id`, [ws, projectId])).rows;
  });
  memberRoute(router, db, "delete", "/assignments/:id", "people.remove", async (tx, _m, ws, req) => {
    const assignmentId = id.parse(req.params.id), body = parseBody(RemoveAssignmentBody, req);
    return withWorkspaceIdempotency(tx, ws, req.ctx!.userId, body.operation_id,
      { route: "DELETE /assignments/:id", assignmentId, ...body }, async () => {
        const locked = await tx.query("select id from assignments where workspace_id=$1 and id=$2 for update", [ws, assignmentId]);
        if (!locked.rowCount) notFound();
        // Even NO_WORK and rate-only history has foreign keys; never delete those
        // records or ledger history just to remove an assignment.
        const references = await tx.query(`select
          exists(select 1 from ledger_events where workspace_id=$1 and assignment_id=$2) or
          exists(select 1 from work_entries where workspace_id=$1 and assignment_id=$2) or
          exists(select 1 from rate_agreements where workspace_id=$1 and assignment_id=$2) or
          exists(select 1 from allocations where workspace_id=$1 and assignment_id=$2) or
          exists(select 1 from reimbursements where workspace_id=$1 and assignment_id=$2) or
          exists(select 1 from adjustments where workspace_id=$1 and assignment_id=$2) as has_history`, [ws, assignmentId]);
        if (references.rows[0].has_history) {
          await tx.query(`update assignments set end_date=greatest(start_date,current_date,
            (select max(work_date) from work_entries where workspace_id=$1 and assignment_id=$2)),version=version+1
            where workspace_id=$1 and id=$2`, [ws, assignmentId]);
        } else await tx.query("delete from assignments where workspace_id=$1 and id=$2", [ws, assignmentId]);
        return { ok: true };
      });
  });
  return router;
}
