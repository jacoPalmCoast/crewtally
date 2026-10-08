import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { memberRoute } from "./registration";
import { checkFilters, filters, id, numbers } from "./domain-support";

export function createLedgerRouter(db: Pool) {
  const router = Router();
  memberRoute(router, db, "get", "/balances", "money.view", async (tx, _m, ws, req) => {
    const query = z.object({ project_id: id.optional(), worker_id: id.optional() }).strict().parse(req.query);
    await checkFilters(tx, ws, query);
    return numbers((await tx.query(`select assignment_id,project_id,worker_id,balance_minor from assignment_balances
      where workspace_id=$1 and ($2::uuid is null or project_id=$2) and ($3::uuid is null or worker_id=$3)
      order by assignment_id`, [ws, query.project_id ?? null, query.worker_id ?? null])).rows);
  });
  memberRoute(router, db, "get", "/history", "money.view", async (tx, _m, ws, req) => {
    const query = filters.parse(req.query);
    await checkFilters(tx, ws, query);
    return numbers((await tx.query(`select e.effective_date::text,e.event_type,e.signed_delta,e.source_type,e.source_id,e.seq
      from ledger_events e join assignments a on a.workspace_id=e.workspace_id and a.id=e.assignment_id
      where e.workspace_id=$1 and ($2::uuid is null or a.project_id=$2) and ($3::uuid is null or a.worker_id=$3)
      and ($4::date is null or e.effective_date >= $4) and ($5::date is null or e.effective_date <= $5) order by e.seq`,
    [ws, query.project_id ?? null, query.worker_id ?? null, query.from ?? null, query.to ?? null])).rows);
  });
  return router;
}
