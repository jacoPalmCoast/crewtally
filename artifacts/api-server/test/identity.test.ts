import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import request from "supertest";
import path from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { Router } from "express";
import { createApp } from "../src/app";
import { createRouter } from "../src/routes";
import { registeredRoutes, memberRoute, type Method } from "../src/routes/registration";
import * as memberModule from "../src/auth/member";
import { invitationCodeHash, tokenHash } from "../src/routes/invitations";
import { migrate } from "../src/db/migrate";
import { createTenancyHarness } from "./helpers/tenancy";
import { requestHash } from "../src/idempotency";

const schema = `identity_${randomUUID().replaceAll("-", "")}`;
const root = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let db: pg.Pool;
const env = { APP_ENV: "development", BUSINESS_ENABLED: "false",
  CODE_PEPPER: "isolated-test-pepper", PUBLIC_BASE_URL: "https://example.test/api" };
const logs: unknown[] = [];
const logger = { info: (fields: unknown) => logs.push(fields), error: (fields: unknown) => logs.push(fields) };
const appFor = () => createApp({ db, env, logger });
const op = () => ({ operation_id: randomUUID() });
beforeAll(async () => {
  if (process.env.APP_ENV === "production") throw new Error("Tests forbidden in production");
  await root.query(`create schema ${schema}`);
  db = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}` });
  await migrate(db, path.resolve("../../db/migrations"));
});
afterAll(async () => {
  await db?.end();
  await root.query(`drop schema if exists ${schema} cascade`);
  await root.end();
});

function stackRoutes(router: { stack: unknown[] }): { path: string; method: string }[] {
  const result: { path: string; method: string }[] = [];
  for (const raw of router.stack) {
    const layer = raw as { route?: { path: string; methods: Record<string, boolean> }; handle?: { stack?: unknown[] } };
    if (layer.route) for (const method of Object.keys(layer.route.methods)) result.push({ path: layer.route.path, method });
    else if (layer.handle?.stack) result.push(...stackRoutes({ stack: layer.handle.stack }));
  }
  return result;
}

describe("route table", () => {
  it("covers every Express /v1 route exactly once and declares all member actions", () => {
    const router = createRouter({ db, env: { ...env, DEV_SIGNIN_CODE: "fixture" }, logger });
    const table = registeredRoutes(router);
    const stack = stackRoutes(router);
    expect(table.map(r => `${r.method} ${r.path}`).sort()).toEqual(stack.map(r => `${r.method} ${r.path}`).sort());
    for (const route of table) {
      expect(["public", "session", "member"]).toContain(route.kind);
      if (route.kind === "member") expect(route.action).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
    expect(table.filter(r => r.kind === "member")).toHaveLength(8);
  });
});

const roles = ["ORGANIZER", "PARTNER", "OWNER", "ADMIN_MONEY", "ADMIN_NO_MONEY", "LEAD", "WORKER", "REMOVED", "OUTSIDER"] as const;
const table = registeredRoutes(createRouter({ env, logger })).filter(r => r.kind === "member");

describe("fresh-fixture role matrix: declared route gate only", () => {
  for (const route of table) for (const role of roles) {
    it(`${route.method.toUpperCase()} ${route.path} [${route.action}] / ${role}`, async () => {
      const app = appFor();
      const harness = createTenancyHarness(db, app);
      const principal = await harness.createUser("matrix-principal");
      const home = ["ORGANIZER","PARTNER","REMOVED","OUTSIDER"].includes(role);
      const workspace = await harness.createWorkspace(principal, home ? "HOME" : "BUSINESS");
      let user = principal;
      if (!["ORGANIZER","OWNER"].includes(role)) {
        user = await harness.createUser("matrix-member");
        if (role !== "OUTSIDER") {
          let workerId: string | undefined;
          if (role === "WORKER") {
            workerId = (await db.query("insert into workers(workspace_id,display_name) values ($1,'Worker') returning id", [workspace])).rows[0].id;
          }
          await harness.addMember(workspace, user, role.startsWith("ADMIN") ? "ADMIN" : role === "REMOVED" ? "PARTNER" : role,
            { financial: role === "ADMIN_MONEY", workerId });
          if (role === "REMOVED") await db.query("select remove_member($1,$2,$3)", [workspace, principal.userId, user.userId]);
        }
      }
      const { agent } = await harness.agentFor(user, workspace);
      // Keep the real require_member/transaction, replace ONLY the callback after
      // the gate. Function-level refusals are tested separately below.
      const original = memberModule.withMember;
      const spy = vi.spyOn(memberModule, "withMember").mockImplementation((pool, req, action) =>
        original(pool, req, action, async () => ({ gate_passed: true })));
      try {
        const url = `/v1${route.path.replace(/:userId|:id/g, randomUUID())}`;
        const result = await agent[route.method](url).send({});
        const allowed = route.action === "workspace.read" ||
          (route.action === "settings.edit" ? ["ORGANIZER","OWNER"].includes(role) :
            ["ORGANIZER","OWNER","ADMIN_MONEY","ADMIN_NO_MONEY"].includes(role));
        expect(result.status).toBe(["REMOVED","OUTSIDER"].includes(role) ? 404 : allowed ? 200 : 403);
        if (result.status === 200) expect(result.body.gate_passed).toBe(true);
      } finally { spy.mockRestore(); }
    });
  }
});

async function homeFixture() {
  const app = appFor();
  const h = createTenancyHarness(db, app);
  const owner = await h.createOwner();
  const partner = await h.createUser("partner");
  return { app, h, owner, partner };
}
async function invite(owner: Awaited<ReturnType<typeof homeFixture>>["owner"], email = `${randomUUID()}@example.com`) {
  const body = { ...op(), role: "PARTNER", email, name: "Reference label" };
  const response = await owner.agent.post("/v1/invitations").send(body);
  expect(response.status).toBe(200);
  return { body, data: response.body };
}

describe("identity and workspace writes", () => {
  it("creates HOME once, separates users and detects changed-body and concurrent replays", async () => {
    const app = appFor(), h = createTenancyHarness(db, app);
    const first = await h.createUser("create"), second = await h.createUser("second");
    const a = (await h.agentFor(first)).agent, b = (await h.agentFor(second)).agent;
    const body = { ...op(), kind: "HOME", name: "My home", timezone: "America/New_York" };
    const responses = await Promise.all([a.post("/v1/workspaces").send(body), a.post("/v1/workspaces").send(body)]);
    expect(responses.map(r => r.status)).toEqual([200,200]);
    expect(responses[0]!.body).toEqual(responses[1]!.body);
    expect((await db.query("select count(*)::int as n from workspaces where owner_id=$1", [first.userId])).rows[0].n).toBe(1);
    expect((await a.post("/v1/workspaces").send({ ...body, name: "Other" })).body.error.code).toBe("OPERATION_REUSED");
    const separate = await b.post("/v1/workspaces").send(body);
    expect(separate.status).toBe(200);
    expect(separate.body.id === responses[0]!.body.id).toBe(false);
    expect((await a.post("/v1/workspaces").send({ ...body, ...op(), kind: "BUSINESS" })).status).toBe(404);
    const invalid = await a.post("/v1/workspaces").send({ ...body, ...op(), timezone: "Not/AZone" });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("INVALID");
    expect((await request(app).get("/v1/config")).body).toEqual({ business_enabled: false });
  });
  it("lists only caller memberships; saves and clears a display name idempotently", async () => {
    const { owner, h } = await homeFixture();
    await h.createOwner();
    const result = await owner.agent.get("/v1/me");
    expect(result.body.workspaces.map((w: { id: string }) => w.id)).toEqual([owner.workspaceId]);
    const body = { ...op(), display_name: "Casey" };
    const first = await owner.agent.patch("/v1/me").send(body);
    expect(first.status).toBe(200);
    expect((await owner.agent.patch("/v1/me").send(body)).body).toEqual(first.body);
    expect((await owner.agent.get("/v1/me")).body.user.display_name).toBe("Casey");
    expect((await owner.agent.patch("/v1/me").send({ ...op(), display_name: "" })).status).toBe(200);
    expect((await owner.agent.get("/v1/me")).body.user.display_name).toBeNull();
  });
  it("makes all malformed, missing and foreign workspace headers indistinguishable", async () => {
    const { owner, h, app } = await homeFixture();
    const foreign = await h.createOwner();
    const responses = await Promise.all([undefined, "malformed", foreign.workspaceId].map(header => {
      const call = request(app).get("/v1/workspace").set("Authorization", `Bearer ${owner.token}`);
      return header ? call.set("X-Workspace-Id", header) : call;
    }));
    for (const r of responses) {
      expect(r.status).toBe(404);
      expect({ ...r.body.error, correlationId: undefined }).toEqual({ code: "NOT_FOUND", message: "Not found", correlationId: undefined });
    }
  });
  it("renames once and prevents another actor from replaying the organizer's operation", async () => {
    const { owner, h, partner } = await homeFixture();
    await h.addMember(owner.workspaceId, partner, "PARTNER");
    const body = { ...op(), name: "Renamed" };
    const first = await owner.agent.patch("/v1/workspace").send(body);
    expect(first.status).toBe(200);
    expect((await owner.agent.patch("/v1/workspace").send(body)).body).toEqual(first.body);
    const partnerAgent = (await h.agentFor(partner, owner.workspaceId)).agent;
    expect((await partnerAgent.patch("/v1/workspace").send(body)).status).toBe(403);
    expect(requestHash(owner.userId, body) === requestHash(partner.userId, body)).toBe(false);
  });
});

describe("invitation credentials and committed errors", () => {
  it("commits expired-link status even when the HTTP result is 410", async () => {
    const { owner, h, partner, app } = await homeFixture();
    const { data } = await invite(owner);
    await db.query("update invitations set expires_at=now()-interval '1 second' where id=$1", [data.id]);
    const agent = (await h.agentFor(partner)).agent;
    const body = { ...op(), token: data.token };
    const expired = await agent.post("/v1/invite/accept").send(body);
    expect(expired.status).toBe(410);
    expect(expired.body.error.code).toBe("INVITATION_NOT_AVAILABLE");
    expect((await db.query("select status from invitations where id=$1", [data.id])).rows[0].status).toBe("EXPIRED");
    expect((await agent.post("/v1/invite/accept").send(body)).status).toBe(410);
    expect((await request(app).post("/v1/invite/peek").send({ token: data.token })).body).toEqual({ available: false });
  });
  it("enforces 20/min peek per peer and 10/min code accept per signed-in user", async () => {
    const app = appFor(), h = createTenancyHarness(db, app);
    const agent = (await h.agentFor(await h.createUser("limited"))).agent;
    const token = randomBytes(32).toString("base64url");
    for (let n=0;n<20;n++) expect((await request(app).post("/v1/invite/peek").send({ token })).status).toBe(200);
    expect((await request(app).post("/v1/invite/peek").send({ token })).status).toBe(429);
    for (let n=0;n<10;n++) expect((await agent.post("/v1/invite/accept-code").send({ ...op(), email: "unknown@example.com", code: "000000" })).status).toBe(400);
    expect((await agent.post("/v1/invite/accept-code").send({ ...op(), email: "unknown@example.com", code: "000000" })).status).toBe(429);
  });
  it("decline has a uniform answer and makes a pending invitation unavailable", async () => {
    const { owner, app } = await homeFixture();
    const { data } = await invite(owner);
    for (const token of [data.token, data.token, randomBytes(32).toString("base64url")]) {
      const response = await request(app).post("/v1/invite/decline").send({ token });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
    }
    expect((await request(app).post("/v1/invite/peek").send({ token: data.token })).body).toEqual({ available: false });
    expect((await db.query("select status from invitations where id=$1", [data.id])).rows[0].status).toBe("DECLINED");
  });
  it("returns secrets once, stores HMAC/hash only, peeks minimally, joins and replays", async () => {
    const { owner, h, partner, app } = await homeFixture();
    const { body, data } = await invite(owner);
    expect(data.token.length).toBe(43);
    expect(/^\d{6}$/.test(data.code)).toBe(true);
    expect(data.link === `${env.PUBLIC_BASE_URL}/join/${data.token}`).toBe(true);
    const peek = await request(app).post("/v1/invite/peek").send({ token: data.token });
    expect(peek.body).toEqual({ available: true, workspace_name: "My workspace", role: "PARTNER" });
    const retry = await owner.agent.post("/v1/invitations").send(body);
    expect(retry.body).toMatchObject({ id: data.id, token: null, code: null, link: null, already_created: true });
    const row = (await db.query("select * from invitations where id=$1", [data.id])).rows[0];
    expect(row.code_hash.equals(invitationCodeHash(env.CODE_PEPPER, body.email, data.code))).toBe(true);
    expect(row.token_hash.equals(tokenHash(data.token))).toBe(true);
    const stored = JSON.stringify((await db.query("select row_to_json(i)::text from invitations i where id=$1", [data.id])).rows) +
      JSON.stringify((await db.query("select response, request_hash from idempotency_keys where workspace_id=$1", [owner.workspaceId])).rows);
    expect(stored.includes(data.token)).toBe(false);
    expect(stored.includes(data.code)).toBe(false);
    expect(JSON.stringify(logs).includes(data.token)).toBe(false);
    expect(JSON.stringify(logs).includes(data.code)).toBe(false);
    expect(JSON.stringify(logs).includes(body.email)).toBe(false);
    const agent = (await h.agentFor(partner, owner.workspaceId)).agent;
    const acceptBody = { ...op(), token: data.token };
    const accepted = await agent.post("/v1/invite/accept").send(acceptBody);
    expect(accepted.status).toBe(200);
    expect((await agent.post("/v1/invite/accept").send(acceptBody)).body).toEqual(accepted.body);
    expect((await agent.get("/v1/workspace")).body.role).toBe("PARTNER");
    expect((await owner.agent.post("/v1/invitations").send({ ...body, ...op(), email: `${randomUUID()}@example.com` })).status).toBe(409);
    expect((await agent.post("/v1/invitations").send({ ...body, ...op() })).status).toBe(403);
    const members = await agent.get("/v1/members");
    expect(members.body.members.every((m: object) => !("email" in m))).toBe(true);
    const names = (await owner.agent.get("/v1/members")).body.members;
    expect(names.find((m: { user_id: string }) => m.user_id === partner.userId).name).toBe("Reference label");
    expect(members.body.members.find((m: { user_id: string }) => m.user_id === partner.userId).name).toBe("Partner");
    const landing = await request(app).get(`/api/join/${data.token}`);
    expect(landing.headers["cache-control"]).toBe("no-store");
    expect(landing.headers["referrer-policy"]).toBe("no-referrer");
    expect(landing.text.includes("This invitation isn&#39;t available")).toBe(true);
  });
  it("commits five wrong attempts, replays without charging again, and lets another person join", async () => {
    const { owner, h, partner } = await homeFixture();
    const { body, data } = await invite(owner);
    const stranger = (await h.agentFor(await h.createUser("stranger"))).agent;
    const wrong = data.code === "000000" ? "000001" : "000000";
    const firstBody = { ...op(), email: body.email, code: wrong };
    for (let n = 0; n < 5; n++) {
      const response = await stranger.post("/v1/invite/accept-code").send(n === 0 ? firstBody : { ...firstBody, ...op() });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVITATION_CODE_WRONG");
    }
    expect((await stranger.post("/v1/invite/accept-code").send(firstBody)).status).toBe(400);
    expect((await db.query("select attempts from invitation_code_attempts where email=$1", [body.email])).rows[0].attempts).toBe(5);
    const blocked = await stranger.post("/v1/invite/accept-code").send({ ...op(), email: body.email, code: data.code });
    expect(blocked.status).toBe(400);
    expect((await db.query("select status from invitations where id=$1", [data.id])).rows[0].status).toBe("PENDING");
    const agent = (await h.agentFor(partner)).agent;
    expect((await agent.post("/v1/invite/accept-code").send({ ...op(), email: body.email, code: data.code })).status).toBe(200);
    const keys = JSON.stringify((await db.query("select response, request_hash from user_idempotency_keys")).rows);
    expect(keys.includes(data.token)).toBe(false);
    expect(keys.includes(data.code)).toBe(false);
  });
  it("keeps the link usable after the guesser's code limit and maps expired/revoked/unknown uniformly", async () => {
    const { owner, h, partner, app } = await homeFixture();
    const { body, data } = await invite(owner);
    const guesser = (await h.agentFor(await h.createUser("guesser"))).agent;
    for (let n=0;n<5;n++) await guesser.post("/v1/invite/accept-code").send({ ...op(), email: body.email, code: data.code === "999999" ? "999998" : "999999" });
    expect((await (await h.agentFor(partner)).agent.post("/v1/invite/accept").send({ ...op(), token: data.token })).status).toBe(200);
    const fixture = await homeFixture(), pending = await invite(fixture.owner);
    const revokeBody = op();
    expect((await fixture.owner.agent.delete(`/v1/invitations/${pending.data.id}`).send(revokeBody)).status).toBe(200);
    expect((await fixture.owner.agent.delete(`/v1/invitations/${pending.data.id}`).send(revokeBody)).status).toBe(200);
    for (const token of [pending.data.token, randomBytes(32).toString("base64url")]) {
      expect((await request(app).post("/v1/invite/peek").send({ token })).body).toEqual({ available: false });
      const acceptance = await guesser.post("/v1/invite/accept").send({ ...op(), token });
      expect(acceptance.status).toBe(410);
      expect(acceptance.body.error.code).toBe("INVITATION_NOT_AVAILABLE");
    }
  });
  it("escapes workspace names on public HTML and exposes neither contacts nor credentials in HTML", async () => {
    const { owner, app } = await homeFixture();
    await owner.agent.patch("/v1/workspace").send({ ...op(), name: "<script>alert(1)</script>" });
    const { data, body } = await invite(owner);
    const result = await request(app).get(`/api/join/${data.token}`);
    expect(result.text.includes("<script>")).toBe(false);
    expect(result.text.includes("&lt;script&gt;")).toBe(true);
    expect(result.text.includes(data.token)).toBe(false);
    expect(result.text.includes(data.code)).toBe(false);
    expect(result.text.includes(body.email)).toBe(false);
  });
});

describe("function-level refusals, scoping and immediate removal", () => {
  it("forbids partner management/principal leave and clears removed access across every route", async () => {
    const { owner, h, partner } = await homeFixture();
    await h.addMember(owner.workspaceId, partner, "PARTNER");
    const agent = (await h.agentFor(partner, owner.workspaceId)).agent;
    expect((await agent.delete(`/v1/members/${owner.userId}`).send(op())).status).toBe(403);
    expect((await owner.agent.delete(`/v1/members/${owner.userId}`).send(op())).status).toBe(403);
    expect((await owner.agent.post("/v1/invitations").send({ ...op(), role: "ADMIN", email: "admin@example.com" })).status).toBe(403);
    expect((await owner.agent.patch(`/v1/members/${partner.userId}`).send(op())).body.error.code).toBe("INVALID");
    expect((await owner.agent.patch(`/v1/members/${owner.userId}`).send({ ...op(), role: "PARTNER" })).status).toBe(403);
    const removedBody = op();
    expect((await owner.agent.delete(`/v1/members/${partner.userId}`).send(removedBody)).status).toBe(200);
    expect((await owner.agent.delete(`/v1/members/${partner.userId}`).send(removedBody)).status).toBe(200);
    for (const route of table) expect((await agent[route.method](`/v1${route.path.replace(/:userId|:id/g, randomUUID())}`).send(op())).status).toBe(404);
    expect((await agent.get("/v1/me")).status).toBe(200);
    expect((await agent.get("/v1/me")).body.workspaces).toEqual([]);
    await h.addMember(owner.workspaceId, partner, "PARTNER");
    expect((await agent.get("/v1/workspace")).status).toBe(200);
    expect((await agent.delete(`/v1/members/${partner.userId}`).send(op())).status).toBe(200);
    expect((await agent.get("/v1/workspace")).status).toBe(404);
  });
  it("refuses foreign member and invitation ids without touching their workspace", async () => {
    const { owner } = await homeFixture(), second = await homeFixture();
    await second.h.addMember(second.owner.workspaceId, second.partner, "PARTNER");
    expect((await owner.agent.delete(`/v1/members/${second.partner.userId}`).send(op())).status).toBe(404);
    expect((await owner.agent.patch(`/v1/members/${second.partner.userId}`).send({ ...op(), role: "PARTNER" })).status).toBe(404);
    const third = await homeFixture(), pending = await invite(third.owner);
    expect((await owner.agent.delete(`/v1/invitations/${pending.data.id}`).send(op())).status).toBe(404);
  });
  it("enforces admin/worker binding/refusal rules and revokes a removed inviter's link", async () => {
    const app = appFor(), h = createTenancyHarness(db, app);
    const owner = await h.createUser("business-owner"), admin = await h.createUser("admin"), lead = await h.createUser("lead");
    const ws = await h.createWorkspace(owner, "BUSINESS");
    await h.addMember(ws, admin, "ADMIN", { financial: false });
    await h.addMember(ws, lead, "LEAD");
    const a = (await h.agentFor(admin, ws)).agent, o = (await h.agentFor(owner, ws)).agent;
    const worker = (await db.query("insert into workers(workspace_id,display_name) values($1,'W') returning id", [ws])).rows[0].id;
    expect((await a.patch(`/v1/members/${admin.userId}`).send({ ...op(), role: "ADMIN" })).status).toBe(403);
    expect((await o.patch(`/v1/members/${lead.userId}`).send({ ...op(), role: "WORKER" })).body.error.code).toBe("WORKER_RECORD_REQUIRED");
    expect((await a.post("/v1/invitations").send({ ...op(), role: "WORKER", email: "w@example.com", worker_id: worker })).status).toBe(403);
    const moneyInvite = await o.post("/v1/invitations").send({ ...op(), role: "ADMIN", financial_access: true, email: "money@example.com" });
    expect(moneyInvite.status).toBe(200);
    expect((await a.delete(`/v1/invitations/${moneyInvite.body.id}`).send(op())).status).toBe(403);
    const invitation = await a.post("/v1/invitations").send({ ...op(), role: "LEAD", email: `${randomUUID()}@example.com` });
    expect(invitation.status).toBe(200);
    expect((await o.delete(`/v1/members/${admin.userId}`).send(op())).status).toBe(200);
    const outsider = (await h.agentFor(await h.createUser("joiner"))).agent;
    expect((await outsider.post("/v1/invite/accept").send({ ...op(), token: invitation.body.token })).status).toBe(410);
  });
  it("admin cannot manage a different admin; demotion revokes invitations it can no longer send", async () => {
    const app = appFor(), h = createTenancyHarness(db, app);
    const owner = await h.createUser("owner"), admin = await h.createUser("admin"), admin2 = await h.createUser("admin2");
    const ws = await h.createWorkspace(owner, "BUSINESS");
    await h.addMember(ws, admin, "ADMIN", { financial: true });
    await h.addMember(ws, admin2, "ADMIN");
    const a = (await h.agentFor(admin, ws)).agent, o = (await h.agentFor(owner, ws)).agent;
    expect((await a.patch(`/v1/members/${admin2.userId}`).send({ ...op(), role: "LEAD" })).status).toBe(403);
    const invitation = await a.post("/v1/invitations").send({ ...op(), role: "LEAD", email: `${randomUUID()}@example.com` });
    expect(invitation.status).toBe(200);
    expect((await o.patch(`/v1/members/${admin.userId}`).send({ ...op(), role: "LEAD" })).status).toBe(200);
    expect((await db.query("select status from invitations where id=$1", [invitation.body.id])).rows[0].status).toBe("REVOKED");
  });
});

describe("actor is transaction scoped", () => {
  it("record_payment through a test-only withMember route records the caller and refuses a forged actor", async () => {
    const app = appFor(), h = createTenancyHarness(db, app);
    const owner = await h.createOwner();
    const worker = (await db.query("insert into workers(workspace_id,display_name) values($1,'W') returning id", [owner.workspaceId])).rows[0].id;
    const project = (await db.query("insert into projects(workspace_id,name,timezone) values($1,'P','UTC') returning id", [owner.workspaceId])).rows[0].id;
    const assignment = (await db.query("insert into assignments(workspace_id,project_id,worker_id,start_date) values($1,$2,$3,'2026-10-01') returning id",
      [owner.workspaceId, project, worker])).rows[0].id;
    const router = Router();
    memberRoute(router, db, "post", "/test/payment", "money.record", async (tx, _member, ws, req) => {
      if (req.body.recorded_by && req.body.recorded_by !== req.ctx!.userId) {
        throw Object.assign(new Error("Actor mismatch"), { code: "CT403" });
      }
      const result = await tx.query("select record_payment($1,$2,'2026-10-02','CASH',null,100,'W',null,$3) as result",
        [ws, req.body.operation_id, JSON.stringify([{ assignment_id: assignment, amount_minor: 100 }])]);
      return result.rows[0].result;
    });
    const moneyApp = createApp({ db, env, logger, testOnlyProtectedRouter: router });
    const moneyAgent = (await createTenancyHarness(db, moneyApp).agentFor({ userId: owner.userId }, owner.workspaceId)).agent;
    expect((await moneyAgent.post("/v1/test/payment").send(op())).status).toBe(200);
    expect((await db.query("select recorded_by from payments where workspace_id=$1", [owner.workspaceId])).rows[0].recorded_by).toBe(owner.userId);
    expect((await moneyAgent.post("/v1/test/payment").send({ ...op(), recorded_by: randomUUID() })).status).toBe(403);
    const clean = await db.query("select nullif(current_setting('crewtally.actor',true),'') as actor");
    expect(clean.rows[0].actor).toBeNull();
  });
});