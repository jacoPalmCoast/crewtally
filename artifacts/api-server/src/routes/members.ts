import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { withWorkspaceIdempotency } from "../idempotency";
import { memberRoute } from "./registration";
import { operation } from "./workspaces";

export function createMembersRouter(db: Pool) {
  const router = Router();
  memberRoute(router, db, "get", "/members", "workspace.read", async (tx, _member, ws, req) => {
    const permission = await tx.query("select member_can($1,$2,'members.manage') as allowed", [ws, req.ctx!.userId]);
    const manages = permission.rows[0].allowed as boolean;
    const result = await tx.query(
      `select m.user_id, u.display_name, m.role, m.financial_access, m.created_at as joined_at,
        case when $2 then u.email end as email,
        coalesce(u.display_name, case when $2 then label.invitee_name end,
          initcap(m.role)) as name
       from memberships m join users u on u.id=m.user_id
       left join lateral (select i.invitee_name from invitations i where i.workspace_id=m.workspace_id
         and i.decided_by=m.user_id and i.status='ACCEPTED' order by i.decided_at desc limit 1) label on true
       where m.workspace_id=$1 and m.status='ACTIVE' and u.deleted_at is null order by m.created_at`, [ws, manages],
    );
    return { members: result.rows.map(row => {
      if (!manages) delete row.email;
      return row;
    }) };
  });
  memberRoute(router, db, "delete", "/members/:userId", "workspace.read", async (tx, _member, ws, req) => {
    const userId = z.string().uuid().parse(req.params.userId);
    const body = operation.strict().parse(req.body);
    return withWorkspaceIdempotency(tx, ws, req.ctx!.userId, body.operation_id,
      { route: "DELETE /members", userId, ...body }, async () => {
        const result = await tx.query("select remove_member($1,$2,$3) as result", [ws, req.ctx!.userId, userId]);
        return result.rows[0].result;
      });
  });
  memberRoute(router, db, "patch", "/members/:userId", "members.manage", async (tx, _member, ws, req) => {
    const userId = z.string().uuid().parse(req.params.userId);
    const body = operation.extend({ role: z.enum(["ORGANIZER","PARTNER","OWNER","ADMIN","LEAD","WORKER"]),
      financial_access: z.boolean().nullable().optional() }).strict().parse(req.body);
    return withWorkspaceIdempotency(tx, ws, req.ctx!.userId, body.operation_id,
      { route: "PATCH /members", userId, ...body }, async () => {
        const result = await tx.query("select change_member_role($1,$2,$3,$4,$5) as result",
          [ws, req.ctx!.userId, userId, body.role, body.financial_access ?? null]);
        return result.rows[0].result;
      });
  });
  return router;
}