import { Router } from "express";
import type { Pool } from "pg";
import { RecordAdjustmentBody } from "@workspace/api-zod";
import { domainRoute as memberRoute } from "./domain-support";
import { parseBody, sqlResult } from "./domain-support";

export function createAdjustmentsRouter(db: Pool) {
  const router = Router();
  memberRoute(router, db, "post", "/adjustments", "money.record", async (tx, _m, ws, req) => {
    const body = parseBody(RecordAdjustmentBody, req);
    return sqlResult(tx, "select record_adjustment($1::uuid,$2::uuid,$3::uuid,$4::date,$5::text,$6::text,$7::bigint,$8::text) as result",
      [ws, body.operation_id, body.assignment_id, body.date, body.direction, body.category, body.amount_minor, body.reason]);
  });
  return router;
}
