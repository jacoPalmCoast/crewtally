import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app";
import { migrate } from "../src/db/migrate";
import { createRouter } from "../src/routes";
import { registeredRoutes } from "../src/routes/registration";
import { createTenancyHarness, type AuthedRequestAgent } from "./helpers/tenancy";

const schema = `domain_scope_${randomUUID().replaceAll("-", "")}`;
const root = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let db: pg.Pool;
const env = { APP_ENV: "development", BUSINESS_ENABLED: "false" };
const logger = { info() {}, error() {} };
const day = "2026-10-01";
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

async function fixture() {
  const app = createApp({ db, env, logger }), h = createTenancyHarness(db, app);
  const owner = await h.createUser("scope-owner");
  const workspaceId = await h.createWorkspace(owner, "BUSINESS");
  const ownerAgent = (await h.agentFor(owner, workspaceId)).agent;
  const project = await ownerAgent.post("/v1/projects").send({ ...op(), name: "Scoped project", timezone: "UTC" });
  expect(project.status).toBe(200);
  const workers: string[] = [], assignments: string[] = [];
  for (const label of ["Own worker", "Other worker"]) {
    const worker = await ownerAgent.post("/v1/workers").send({
      ...op(), display_name: label, phone: "555-0100", email: "private@example.com",
    });
    expect(worker.status).toBe(200);
    workers.push(worker.body.id);
    const assignment = await ownerAgent.post(`/v1/projects/${project.body.id}/assignments`).send({
      ...op(), worker_id: worker.body.id, start_date: day,
    });
    expect(assignment.status).toBe(200);
    assignments.push(assignment.body.id);
    expect((await ownerAgent.post(`/v1/assignments/${assignment.body.id}/rates`).send({
      ...op(), effective_from: day, pay_basis: "DAY", rate_minor: 20000,
    })).status).toBe(200);
    expect((await ownerAgent.post("/v1/work-entries").send({
      ...op(), assignment_id: assignment.body.id, date: day,
      mode: "DAY_PORTION", portion: "1", expected_version: 0,
    })).status).toBe(200);
  }
  const payment = await ownerAgent.post("/v1/payments").send({
    ...op(), date: day, method: "CASH", amount_minor: 20000, recipient: "Own worker",
    allocations: [{ assignment_id: assignments[0], amount_minor: 20000 }],
  });
  expect(payment.status).toBe(200);
  return { app, h, ownerAgent, workspaceId, project: project.body.id as string,
    workers, assignments, payment: payment.body.payment_id as string };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

async function snapshot(f: Fixture) {
  // Test-owned identifiers only. Compare complete rows, not just counts, to
  // catch edits to existing records as well as any attempted new writes.
  const tables = ["projects", "workers", "assignments", "rate_agreements", "work_entries",
    "work_revisions", "day_reviews", "payments", "allocations", "reversals",
    "reversal_lines", "ledger_events", "reimbursements", "adjustments",
    "idempotency_keys", "audit_events", "workspaces"];
  return Promise.all(tables.map(async table => {
    const scope = table === "workspaces" ? "t.id=$1" :
      table === "reversal_lines" ? "t.reversal_id in (select id from reversals where workspace_id=$1)" :
        "t.workspace_id=$1";
    return (await db.query(`select to_jsonb(t) as row from ${table} t where ${scope} order by to_jsonb(t)::text`,
      [f.workspaceId])).rows;
  }));
}

function readUrls(f: Fixture) {
  return ["/projects", `/projects/${f.project}`, "/workers", `/workers/${f.workers[0]}`,
    `/workers/${f.workers[0]}/year-paid`, `/projects/${f.project}/assignments`,
    `/assignments/${f.assignments[0]}/rates`,
    `/work-entries?assignment_id=${f.assignments[0]}&from=${day}&to=${day}`,
    "/payments", "/balances", "/history"];
}

describe("approved interim S1 Business scope", () => {
  for (const role of ["ADMIN", "LEAD", "WORKER"]) {
    it(`returns 404 on all 27 routes at both mounts for excluded ${role}`, async () => {
      const f = await fixture(), user = await f.h.createUser(`excluded-${role}`);
      await f.h.addMember(f.workspaceId, user, role, {
        financial: false, ...(role === "WORKER" ? { workerId: f.workers[0] } : {}),
      });
      const agent = (await f.h.agentFor(user, f.workspaceId)).agent;
      const before = await snapshot(f);
      const routes = registeredRoutes(createRouter({ db, env, logger })).filter(route =>
        /^\/(projects|workers|assignments|work-entries|payments|balances|history|reimbursements|adjustments)(\/|$)/.test(route.path));
      expect(routes).toHaveLength(27);
      for (const prefix of ["/v1", "/api/v1"]) {
        for (const route of routes) {
          const entity = route.path.startsWith("/projects") ? f.project :
            route.path.startsWith("/workers") ? f.workers[0] :
              route.path.startsWith("/assignments") ? f.assignments[0] : f.payment;
          const url = `${prefix}${route.path.replace(":id", entity)}`;
          const response = await agent[route.method as keyof AuthedRequestAgent](url).send({});
          expect(response.status, `${role} ${route.method} ${url}`).toBe(404);
          expect(response.body).toEqual({ error: {
            code: "NOT_FOUND", message: "Not found", correlationId: expect.any(String),
          } });
        }
        // Explicit own and other-worker attempts with valid write inputs.
        for (const [index, assignment_id] of f.assignments.entries()) {
          expect((await agent.post(`${prefix}/work-entries`).send({
            ...op(), assignment_id, date: "2026-10-02", mode: "DAY_PORTION",
            portion: "1", expected_version: 0,
          })).status).toBe(404);
          expect((await agent.get(`${prefix}/workers/${f.workers[index]}`)).status).toBe(404);
          expect((await agent.get(`${prefix}/work-entries?assignment_id=${assignment_id}&from=${day}&to=${day}`)).status).toBe(404);
        }
        expect((await agent.post(`${prefix}/work-entries/no-work`).send({
          ...op(), project_id: f.project, date: "2026-10-02",
        })).status).toBe(404);
      }
      expect(await snapshot(f)).toEqual(before);
      // The restriction belongs only to S1 domain routes, not identity.
      expect((await agent.get("/v1/workspace")).status).toBe(200);
    });
  }

  it("preserves Business OWNER and money-enabled ADMIN reads, writes and reconciliation", async () => {
    const f = await fixture(), admin = await f.h.createUser("scope-admin");
    await f.h.addMember(f.workspaceId, admin, "ADMIN", { financial: true });
    const agent = (await f.h.agentFor(admin, f.workspaceId)).agent;
    for (const actor of [f.ownerAgent, agent]) for (const prefix of ["/v1", "/api/v1"]) {
      for (const url of readUrls(f)) expect((await actor.get(`${prefix}${url}`)).status, url).toBe(200);
    }
    const assignment_id = f.assignments[0];
    const work = { ...op(), assignment_id, date: "2026-10-02",
      mode: "DAY_PORTION", portion: "1", expected_version: 0 };
    const earned = await agent.post("/api/v1/work-entries").send(work);
    expect(earned.status).toBe(200);
    expect(earned.body.earned_minor).toBe(20000);
    expect((await agent.post("/v1/work-entries").send(work)).body).toEqual(earned.body);
    const payment = { ...op(), date: "2026-10-02", method: "CASH", amount_minor: 20000,
      recipient: "Own worker", allocations: [{ assignment_id, amount_minor: 20000 }] };
    const paid = await agent.post("/v1/payments").send(payment);
    expect(paid.status).toBe(200);
    expect((await agent.post("/api/v1/payments").send(payment)).body).toEqual(paid.body);
    const balances = await agent.get(`/v1/balances?worker_id=${f.workers[0]}`);
    expect(balances.status).toBe(200);
    expect(balances.body[0].balance_minor).toBe(0);
    const reversal = await agent.post(`/v1/payments/${paid.body.payment_id}/reverse`).send({
      ...op(), kind: "FULL", reason: "Correction", expected_version: 1, effective_date: "2026-10-02",
    });
    expect(reversal.status).toBe(200);
    expect(reversal.body.reversed_minor).toBe(20000);
  });

  it("revokes S1 access immediately when an ADMIN loses money access, without changing identity gates", async () => {
    const f = await fixture(), admin = await f.h.createUser("demoted-admin");
    await f.h.addMember(f.workspaceId, admin, "ADMIN", { financial: true });
    const agent = (await f.h.agentFor(admin, f.workspaceId)).agent;
    expect((await agent.get("/v1/projects")).status).toBe(200);
    expect((await f.ownerAgent.patch(`/v1/members/${admin.userId}`).send({
      ...op(), role: "ADMIN", financial_access: false,
    })).status).toBe(200);
    const before = await snapshot(f);
    for (const prefix of ["/v1", "/api/v1"]) {
      for (const url of readUrls(f)) expect((await agent.get(`${prefix}${url}`)).status, url).toBe(404);
      expect((await agent.post(`${prefix}/work-entries`).send({
        ...op(), assignment_id: f.assignments[0], date: "2026-10-02",
        mode: "DAY_PORTION", portion: "1", expected_version: 0,
      })).status).toBe(404);
    }
    expect(await snapshot(f)).toEqual(before);
    expect((await agent.get("/v1/workspace")).status).toBe(200);
  });
});
