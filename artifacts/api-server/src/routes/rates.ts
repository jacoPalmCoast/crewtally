import { Router } from "express";
import type { Pool } from "pg";
import { ApplyRateChangeBody, PreviewRateChangeBody } from "@workspace/api-zod";
import { domainRoute as memberRoute } from "./domain-support";
import { date, exists, id, numbers, parseBody, sqlResult, validateRate } from "./domain-support";

export function createRatesRouter(db: Pool) {
  const router = Router();
  memberRoute(router, db, "get", "/assignments/:id/rates", "workspace.read", async (tx, _m, ws, req) => {
    const assignmentId = id.parse(req.params.id);
    await exists(tx, ws, "assignments", assignmentId);
    return numbers((await tx.query(`select id,effective_from::text,pay_basis,rate_minor,standard_day_minutes
      from rate_agreements where workspace_id=$1 and assignment_id=$2 order by effective_from`, [ws, assignmentId])).rows);
  });
  memberRoute(router, db, "post", "/assignments/:id/rates/preview", "rates.set", async (tx, _m, ws, req) => {
    const body = PreviewRateChangeBody.strict().parse(req.body), assignmentId = id.parse(req.params.id);
    date.parse(body.effective_from);
    validateRate(body);
    return sqlResult(tx, "select preview_rate_change($1::uuid,$2::uuid,$3::date,$4::text,$5::bigint,$6::integer) as result",
      [ws, assignmentId, body.effective_from, body.pay_basis, body.rate_minor, body.standard_day_minutes ?? null]);
  });
  memberRoute(router, db, "post", "/assignments/:id/rates", "rates.set", async (tx, _m, ws, req) => {
    const body = parseBody(ApplyRateChangeBody, req), assignmentId = id.parse(req.params.id);
    validateRate(body);
    return sqlResult(tx, "select apply_rate_change($1::uuid,$2::uuid,$3::uuid,$4::date,$5::text,$6::bigint,$7::integer,$8::text,$9::boolean) as result",
      [ws, body.operation_id, assignmentId, body.effective_from, body.pay_basis, body.rate_minor,
        body.standard_day_minutes ?? null, body.reason ?? null, body.confirm ?? false]);
  });
  return router;
}
