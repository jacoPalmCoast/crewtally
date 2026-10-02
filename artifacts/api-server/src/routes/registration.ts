import type { IRouter, RequestHandler, Request } from "express";
import type { Pool, PoolClient } from "pg";
import * as membership from "../auth/member";
import { requireSession } from "../middlewares/session";

export type Method = "get" | "post" | "patch" | "delete" | "put";
export interface RouteEntry {
  method: Method;
  path: string;
  kind: "public" | "session" | "member";
  action?: string;
}
const tables = new WeakMap<IRouter, RouteEntry[]>();
export function registeredRoutes(router: IRouter): RouteEntry[] {
  const entries = [...(tables.get(router) ?? [])];
  for (const layer of router.stack) {
    const nested = layer.handle as unknown as IRouter;
    if (!layer.route && nested?.stack) entries.push(...registeredRoutes(nested));
  }
  return entries;
}
function record(router: IRouter, entry: RouteEntry) {
  const table = tables.get(router) ?? [];
  table.push(entry);
  tables.set(router, table);
}
export function publicRoute(router: IRouter, method: Method, path: string, ...handlers: RequestHandler[]) {
  record(router, { method, path, kind: "public" });
  router[method](path, ...handlers);
}
export function sessionRoute(router: IRouter, db: Pool, method: Method, path: string, ...handlers: RequestHandler[]) {
  record(router, { method, path, kind: "session" });
  router[method](path, requireSession(db), ...handlers);
}
export function memberRoute(
  router: IRouter, db: Pool, method: Method, path: string, action: string,
  handler: (tx: PoolClient, member: membership.Member, workspaceId: string, req: Request) => Promise<unknown>,
) {
  record(router, { method, path, kind: "member", action });
  router[method](path, requireSession(db), async (req, res, next) => {
    try {
      const result = await membership.withMember(db, req, action, (tx, member, workspaceId) => handler(tx, member, workspaceId, req));
      if (path.startsWith("/invitations") && result && typeof result === "object" && "id" in result) {
        res.locals.invitationId = result.id;
      }
      res.json(result);
    } catch (error) { next(error); }
  });
}