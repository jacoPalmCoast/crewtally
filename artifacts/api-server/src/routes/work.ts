import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { RecordWorkBody, MarkRestNoWorkBody } from "@workspace/api-zod";
import { memberRoute } from "./registration";
import { date, exists, id, numbers, parseBody, rule, sqlResult } from "./domain-support";

export function createWorkRouter(db: Pool) {
  const router = Router();
  memberRoute(router, db, "post", "/work-entries", "work.record", async (tx, _m, ws, req) => {
    const body = parseBody(RecordWorkBody, req);
    const portionMode = body.mode === "DAY_PORTION", minutesMode = ["DAY_MINUTES", "HOUR_MINUTES"].includes(body.mode);
    if (portionMode ? body.portion == null || !/[1-9]/.test(body.portion) || body.minutes != null :
      minutesMode ? body.minutes == null || body.portion != null : body.portion != null || body.minutes != null) {
      rule("portion and minutes must match mode");
    }
    if (body.expected_version > 0 && !body.reason?.trim()) rule("reason required");
    return sqlResult(tx, "select record_work($1::uuid,$2::uuid,$3::uuid,$4::date,$5::text,$6::numeric,$7::integer,$8::integer,$9::text,$10::text) as result",
      [ws, body.operation_id, body.assignment_id, body.date, body.mode, body.portion ?? null,
        body.minutes ?? null, body.expected_version, body.reason ?? null, body.note ?? null]);
  });
  memberRoute(router, db, "post", "/work-entries/no-work", "work.record", async (tx, _m, ws, req) => {
    const body = parseBody(MarkRestNoWorkBody, req);
    return sqlResult(tx, "select mark_rest_no_work($1::uuid,$2::uuid,$3::uuid,$4::date) as result",
      [ws, body.operation_id, body.project_id, body.date]);
  });
  memberRoute(router, db, "get", "/work-entries", "workspace.read", async (tx, _m, ws, req) => {
    const query = z.object({ assignment_id: id, from: date, to: date }).strict()
      .refine(value => value.from <= value.to).parse(req.query);
    await exists(tx, ws, "assignments", query.assignment_id);
    return numbers((await tx.query(`select e.work_date::text,e.version,r.input_mode,r.portion::text,r.minutes,r.earned_minor
      from work_entries e join work_revisions r on r.workspace_id=e.workspace_id and r.entry_id=e.id and r.revision=e.active_revision
      where e.workspace_id=$1 and e.assignment_id=$2 and e.work_date between $3::date and $4::date order by e.work_date`,
    [ws, query.assignment_id, query.from, query.to])).rows);
  });
  return router;
}
