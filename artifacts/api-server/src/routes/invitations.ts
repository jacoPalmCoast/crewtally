import { Router, type RequestHandler } from "express";
import type { Pool } from "pg";
import { createHash, createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import { inTransaction } from "../auth/member";
import { withUserIdempotency, withWorkspaceIdempotency } from "../idempotency";
import { mapError } from "../lib/errors";
import { invitationLimiter } from "../middlewares/invite-rate-limit";
import { memberRoute, publicRoute, sessionRoute } from "./registration";
import { operation } from "./workspaces";

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const emailSchema = z.string().trim().toLowerCase().email().max(254);
export function tokenHash(token: string) { return createHash("sha256").update(token).digest(); }
export function invitationCodeHash(pepper: string, email: string, code: string) {
  return createHmac("sha256", pepper).update(`${email}:${code}`).digest();
}
function config(env: NodeJS.ProcessEnv) {
  if (!env.CODE_PEPPER || !env.PUBLIC_BASE_URL) throw Object.assign(new Error("Invitation configuration unavailable"), { code: "INVITATIONS_UNAVAILABLE" });
  const base = new URL(env.PUBLIC_BASE_URL);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) {
    throw Object.assign(new Error("Invitation configuration unavailable"), { code: "INVITATIONS_UNAVAILABLE" });
  }
  return { pepper: env.CODE_PEPPER, base: base.toString().replace(/\/$/, "") };
}
export function createInvitationRouter(db: Pool, env: NodeJS.ProcessEnv) {
  const router = Router();
  memberRoute(router, db, "post", "/invitations", "members.manage", async (tx, _member, ws, req) => {
    const body = operation.extend({ role: z.enum(["PARTNER","ADMIN","LEAD","WORKER"]), email: emailSchema,
      name: z.string().trim().max(60).optional(), financial_access: z.boolean().nullable().optional(),
      worker_id: z.string().uuid().nullable().optional() }).strict().parse(req.body);
    const { pepper, base } = config(env);
    let once: { token: string; code: string; link: string } | undefined;
    const result = await withWorkspaceIdempotency(tx, ws, req.ctx!.userId, body.operation_id,
      { route: "POST /invitations", ...body }, async () => {
        const token = randomBytes(32).toString("base64url");
        const code = randomInt(0, 1000000).toString().padStart(6, "0");
        const result = await tx.query("select create_invitation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as result",
          [ws, req.ctx!.userId, randomUUID(), body.role, body.financial_access ?? null, body.worker_id ?? null,
            body.email, tokenHash(token), invitationCodeHash(pepper, body.email, code), body.name ?? null]);
        once = { token, code, link: `${base}/join/${token}` };
        // Only the safe result is persisted. Raw credentials exist for this response only.
        return result.rows[0].result;
      });
    return { ...result, token: once?.token ?? null, code: once?.code ?? null, link: once?.link ?? null, already_created: !once };
  });
  memberRoute(router, db, "get", "/invitations", "members.manage", async (tx, _member, ws) => {
    const result = await tx.query(
      `select id, invitee_name, email, role, status, expires_at from invitations
       where workspace_id=$1 and (status='PENDING' or created_at > now()-interval '30 days') order by created_at desc`, [ws]);
    return { invitations: result.rows };
  });
  memberRoute(router, db, "delete", "/invitations/:id", "members.manage", async (tx, _member, ws, req) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = operation.strict().parse(req.body);
    return withWorkspaceIdempotency(tx, ws, req.ctx!.userId, body.operation_id,
      { route: "DELETE /invitations", id, ...body }, async () => {
        const result = await tx.query("select revoke_invitation($1,$2,$3) as result", [ws, req.ctx!.userId, id]);
        return result.rows[0].result;
      });
  });
  publicRoute(router, "post", "/invite/peek", invitationLimiter(20), async (req, res, next) => {
    try {
      const { token } = z.object({ token: tokenSchema }).strict().parse(req.body);
      const result = await db.query("select peek_invitation($1) as result", [tokenHash(token)]);
      res.json(result.rows[0].result);
    } catch (error) { next(error); }
  });
  const accept = (byCode: boolean): RequestHandler => async (req, res, next) => {
    try {
      const body = byCode
        ? operation.extend({ email: emailSchema, code: z.string().regex(/^\d{6}$/) }).strict().parse(req.body)
        : operation.extend({ token: tokenSchema }).strict().parse(req.body);
      const result = await inTransaction(db, tx => withUserIdempotency(tx, req.ctx!.userId, body.operation_id,
        { route: byCode ? "POST /invite/accept-code" : "POST /invite/accept", ...body }, async () => {
          const result = "token" in body
            ? await tx.query("select accept_invitation($1,$2) as result", [req.ctx!.userId, tokenHash(body.token)])
            : await tx.query("select accept_invitation_code($1,$2,$3) as result",
              [req.ctx!.userId, body.email, invitationCodeHash(config(env).pepper, body.email, body.code)]);
          return result.rows[0].result;
        }));
      // COMMIT precedes mapping error results: attempts and expiry/revocation changes must survive.
      if (result.error) {
        const mapped = mapError({ code: result.error });
        res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message, correlationId: res.locals.correlationId } });
      } else res.json(result);
    } catch (error) { next(error); }
  };
  sessionRoute(router, db, "post", "/invite/accept", accept(false));
  sessionRoute(router, db, "post", "/invite/accept-code", invitationLimiter(10, true), accept(true));
  publicRoute(router, "post", "/invite/decline", async (req, res, next) => {
    try {
      const { token } = z.object({ token: tokenSchema }).strict().parse(req.body);
      const result = await db.query("select decline_invitation($1) as result", [tokenHash(token)]);
      res.json(result.rows[0].result);
    } catch (error) { next(error); }
  });
  return router;
}

function htmlEscape(value: string) {
  return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
export function joinLanding(db: Pool): RequestHandler {
  const limiter = invitationLimiter(20);
  return (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
    limiter(req, res, async error => {
      if (error) return next(error);
      try {
        const token = tokenSchema.safeParse(req.params.token);
        const data = token.success ? (await db.query("select peek_invitation($1) as result", [tokenHash(token.data)])).rows[0].result : { available: false };
        const message = data.available ? `You've been invited to help with ${data.workspace_name}`
          : "This invitation isn't available. Ask for a new one.";
        res.type("html").send(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>CrewTally invitation</title><style>body{font:18px system-ui;background:#f6f8f5;color:#15362f;max-width:36rem;padding:2rem;margin:auto}a{color:#086b60;display:inline-block;padding:14px 0}@media(prefers-color-scheme:dark){body{background:#11201c;color:#eef7f1}a{color:#8cddc0}}</style></head><body><h1>${htmlEscape(message)}</h1>${data.available ? '<a href="crewtally-mobile://">Open CrewTally on your iPhone</a><p>In Expo Go, open CrewTally and choose Join a team. Enter the email address and code from your invitation.</p>' : ""}</body></html>`);
      } catch (error) { next(error); }
    });
  };
}