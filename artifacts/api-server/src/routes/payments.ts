import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { RecordPaymentBody, ReversePaymentBody, ClearPaymentBody, CorrectPaymentBody } from "@workspace/api-zod";
import { memberRoute } from "./registration";
import { checkFilters, date, id, numbers, parseBody, sqlResult, validatePayment } from "./domain-support";

export function createPaymentsRouter(db: Pool) {
  const router = Router();
  memberRoute(router, db, "post", "/payments", "money.record", async (tx, _m, ws, req) => {
    const body = parseBody(RecordPaymentBody, req);
    validatePayment(body);
    const args = [ws, body.operation_id, body.date, body.method, body.method_note ?? null,
      body.amount_minor, body.recipient, body.reference ?? null, JSON.stringify(body.allocations)];
    if (Object.hasOwn(body, "note")) {
      return sqlResult(tx, "select record_payment_with_note($1::uuid,$2::uuid,$3::date,$4::text,$5::text,$6::bigint,$7::text,$8::text,$9::jsonb,$10::text) as result",
        [...args, body.note ?? null]);
    }
    return sqlResult(tx, "select record_payment($1::uuid,$2::uuid,$3::date,$4::text,$5::text,$6::bigint,$7::text,$8::text,$9::jsonb) as result", args);
  });
  memberRoute(router, db, "post", "/payments/:id/reverse", "money.record", async (tx, _m, ws, req) => {
    const body = parseBody(ReversePaymentBody, req), paymentId = id.parse(req.params.id);
    return sqlResult(tx, "select reverse_payment($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::integer,$7::date,$8::jsonb) as result",
      [ws, body.operation_id, paymentId, body.kind, body.reason, body.expected_version, body.effective_date,
        body.lines == null ? null : JSON.stringify(body.lines)]);
  });
  memberRoute(router, db, "patch", "/payments/:id/clearance", "money.record", async (tx, _m, ws, req) => {
    const body = parseBody(ClearPaymentBody, req), paymentId = id.parse(req.params.id);
    return sqlResult(tx, "select set_check_cleared($1::uuid,$2::uuid,$3::uuid,$4::integer) as result",
      [ws, body.operation_id, paymentId, body.expected_version]);
  });
  memberRoute(router, db, "post", "/payments/:id/correct", "money.record", async (tx, _m, ws, req) => {
    const body = parseBody(CorrectPaymentBody, req), paymentId = id.parse(req.params.id);
    validatePayment(body);
    return sqlResult(tx, "select correct_payment($1::uuid,$2::uuid,$3::uuid,$4::integer,$5::date,$6::text,$7::date,$8::text,$9::text,$10::bigint,$11::text,$12::text,$13::jsonb) as result",
      [ws, body.operation_id, paymentId, body.expected_version, body.effective_date, body.reason, body.date,
        body.method, body.method_note ?? null, body.amount_minor, body.recipient, body.reference ?? null, JSON.stringify(body.allocations)]);
  });
  memberRoute(router, db, "get", "/payments", "money.view", async (tx, _m, ws, req) => {
    const query = z.object({ from: date.optional(), to: date.optional(), worker_id: id.optional() }).strict()
      .refine(value => !value.from || !value.to || value.from <= value.to).parse(req.query);
    await checkFilters(tx, ws, query);
    return numbers((await tx.query(`select p.id,p.receipt_no,p.payment_date::text,p.method,p.method_note,
      p.amount_minor,p.recipient_label,p.reference,p.note,p.clearance,p.replaces_payment_id,p.version,
      coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'assignment_id',a.assignment_id,'amount_minor',a.amount_minor) order by a.id)
        from allocations a where a.workspace_id=p.workspace_id and a.payment_id=p.id),'[]'::jsonb) as allocations
      from payments p where p.workspace_id=$1 and ($2::date is null or p.payment_date >= $2)
      and ($3::date is null or p.payment_date <= $3) and ($4::uuid is null or exists(
        select 1 from allocations a join assignments s on s.workspace_id=a.workspace_id and s.id=a.assignment_id
        where a.workspace_id=p.workspace_id and a.payment_id=p.id and s.worker_id=$4))
      order by p.payment_date,p.receipt_no`, [ws, query.from ?? null, query.to ?? null, query.worker_id ?? null])).rows);
  });
  return router;
}
