import { Router } from "express";
import type { Pool } from "pg";
import { RecordReimbursementBody } from "@workspace/api-zod";
import { memberRoute } from "./registration";
import { parseBody, sqlResult } from "./domain-support";

export function createReimbursementsRouter(db: Pool) {
  const router = Router();
  memberRoute(router, db, "post", "/reimbursements", "money.record", async (tx, _m, ws, req) => {
    const body = parseBody(RecordReimbursementBody, req);
    return sqlResult(tx, "select record_reimbursement($1::uuid,$2::uuid,$3::uuid,$4::date,$5::bigint,$6::text) as result",
      [ws, body.operation_id, body.assignment_id, body.date, body.amount_minor, body.description]);
  });
  return router;
}
