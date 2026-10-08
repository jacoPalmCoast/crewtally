import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import request from "supertest";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app";
import { migrate } from "../src/db/migrate";
import { createTenancyHarness } from "./helpers/tenancy";
import { numbers, sqlResult } from "../src/routes/domain-support";
import { mapError } from "../src/lib/errors";

const schema = `domain_${randomUUID().replaceAll("-", "")}`;
const root = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let db: pg.Pool;
const logs: unknown[] = [];
const env = { APP_ENV: "development", BUSINESS_ENABLED: "false" };
const logger = { info: (fields: unknown) => logs.push(fields), error: (fields: unknown) => logs.push(fields) };
const op = () => ({ operation_id: randomUUID() });
const day = "2026-10-01";
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

async function fixture(rate = true, kind: "HOME" | "BUSINESS" = "HOME") {
  const app = createApp({ db, env, logger }), h = createTenancyHarness(db, app);
  const user = await h.createUser("domain-owner");
  const signedIn = (await h.agentFor(user)).agent;
  let workspaceId: string;
  if (kind === "HOME") {
    const workspace = await signedIn.post("/v1/workspaces").send({
      ...op(), kind, name: "Domain workspace", timezone: "America/New_York",
    });
    expect(workspace.status).toBe(200);
    workspaceId = workspace.body.id;
  } else workspaceId = await h.createWorkspace(user, kind);
  const { agent, token } = await h.agentFor(user, workspaceId);
  const project = await agent.post("/v1/projects").send({ ...op(), name: "Project", timezone: "America/New_York" });
  expect(project.status).toBe(200);
  const worker = await agent.post("/v1/workers").send({ ...op(), display_name: "Worker" });
  expect(worker.status).toBe(200);
  const assignment = await agent.post(`/v1/projects/${project.body.id}/assignments`).send({
    ...op(), worker_id: worker.body.id, start_date: day,
  });
  expect(assignment.status).toBe(200);
  const f = { app, h, user, workspaceId, agent, token, project: project.body.id as string,
    worker: worker.body.id as string, assignment: assignment.body.id as string };
  if (rate) {
    const result = await agent.post(`/v1/assignments/${f.assignment}/rates`).send({
      ...op(), effective_from: day, pay_basis: "DAY", rate_minor: 20000,
    });
    expect(result.status).toBe(200);
  }
  return f;
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const workBody = (f: Fixture, extra = {}) => ({
  ...op(), assignment_id: f.assignment, date: day, mode: "DAY_PORTION", portion: "1", expected_version: 0, ...extra,
});
const paymentBody = (f: Fixture, extra = {}) => ({
  ...op(), date: day, method: "CASH", amount_minor: 20000, recipient: "Worker",
  allocations: [{ assignment_id: f.assignment, amount_minor: 20000 }], ...extra,
});
async function balance(f: Fixture) {
  const result = await f.agent.get(`/v1/balances?project_id=${f.project}&worker_id=${f.worker}`);
  expect(result.status).toBe(200);
  return result.body[0].balance_minor as number;
}
async function storedCount(f: Fixture, table: string) {
  // The table name is test-owned, never supplied by an HTTP client.
  return (await db.query(`select count(*)::int as n from ${table} where workspace_id=$1`, [f.workspaceId])).rows[0].n;
}

describe("S1 full reconciliation", () => {
  it("logs a day, pays, replays without double-posting, and reverses exactly to the cent", async () => {
    const f = await fixture(), work = workBody(f);
    const earning = await f.agent.post("/v1/work-entries").send(work);
    expect(earning.status).toBe(200);
    expect(earning.body).toMatchObject({ version: 1, revision: 1, earned_minor: 20000, delta_minor: 20000 });
    expect((await f.agent.post("/v1/work-entries").send(work)).body).toEqual(earning.body);
    expect(await balance(f)).toBe(20000);
    const body = paymentBody(f), paid = await f.agent.post("/v1/payments").send(body);
    expect(paid.status).toBe(200);
    expect((await f.agent.post("/v1/payments").send(body)).body).toEqual(paid.body);
    expect(await balance(f)).toBe(0);
    const history = await f.agent.get(`/v1/history?project_id=${f.project}&worker_id=${f.worker}&from=${day}&to=${day}`);
    expect(history.status).toBe(200);
    expect(history.body.map((e: { event_type: string }) => e.event_type)).toEqual(["EARNING", "PAYMENT"]);
    expect(history.body.map((e: { signed_delta: number }) => e.signed_delta)).toEqual([20000, -20000]);
    expect(history.body.every((e: { seq: number }) => Number.isSafeInteger(e.seq))).toBe(true);
    const reverse = { ...op(), kind: "FULL", reason: "Mistaken payment", expected_version: 1, effective_date: day };
    const reversed = await f.agent.post(`/v1/payments/${paid.body.payment_id}/reverse`).send(reverse);
    expect(reversed.status).toBe(200);
    expect(reversed.body).toMatchObject({ reversed_minor: 20000, unreversed_minor: 0, payment_version: 2 });
    expect((await f.agent.post(`/v1/payments/${paid.body.payment_id}/reverse`).send(reverse)).body).toEqual(reversed.body);
    expect(await balance(f)).toBe(20000);
    const events = (await f.agent.get("/v1/history")).body;
    expect(events.map((e: { event_type: string }) => e.event_type)).toEqual(["EARNING", "PAYMENT", "PAYMENT_REVERSAL"]);
    expect(events.reduce((sum: number, e: { signed_delta: number }) => sum + e.signed_delta, 0)).toBe(await balance(f));
    expect(await storedCount(f, "work_entries")).toBe(1);
    expect(await storedCount(f, "payments")).toBe(1);
    expect((await f.agent.get(`/v1/workers/${f.worker}/year-paid`)).body).toEqual([{ year: 2026, net_paid_minor: 0 }]);
    const payments = await f.agent.get(`/v1/payments?worker_id=${f.worker}&from=${day}&to=${day}`);
    expect(payments.status).toBe(200);
    expect(payments.body[0]).toMatchObject({ amount_minor: 20000, version: 2, payment_date: day,
      allocations: [{ assignment_id: f.assignment, amount_minor: 20000 }] });
    const entries = await f.agent.get(`/v1/work-entries?assignment_id=${f.assignment}&from=${day}&to=${day}`);
    expect(entries.status).toBe(200);
    expect(entries.body).toEqual([{ work_date: day, version: 1, input_mode: "DAY_PORTION", portion: "1.0000", minutes: null, earned_minor: 20000 }]);
    const actor = await db.query("select recorded_by from payments where id=$1", [paid.body.payment_id]);
    expect(actor.rows[0].recorded_by).toBe(f.user.userId);
  });
  it("maps allocation total failures to a safe 422 and rolls back receipt and ledger writes", async () => {
    const f = await fixture(), bad = await f.agent.post("/v1/payments").send(paymentBody(f, { amount_minor: 21000 }));
    expect(bad.status).toBe(422);
    expect(bad.body.error).toMatchObject({ code: "INVALID", message: "allocations total 20000 does not equal payment 21000", correlationId: expect.any(String) });
    expect(await storedCount(f, "payments")).toBe(0);
    expect(await storedCount(f, "ledger_events")).toBe(0);
    expect((await db.query("select receipt_seq from workspaces where id=$1", [f.workspaceId])).rows[0].receipt_seq).toBe(0);
  });
  it("returns conflicts for changed operation payloads and stale work/payment versions", async () => {
    const f = await fixture(), body = workBody(f);
    expect((await f.agent.post("/v1/work-entries").send(body)).status).toBe(200);
    expect((await f.agent.post("/v1/work-entries").send({ ...body, portion: "0.5" })).status).toBe(409);
    expect((await f.agent.post("/v1/work-entries").send(workBody(f))).status).toBe(409);
    const revised = await f.agent.post("/v1/work-entries").send(workBody(f, { expected_version: 1, portion: "0.5", reason: "Half day" }));
    expect(revised.status).toBe(200);
    expect(revised.body).toMatchObject({ version: 2, earned_minor: 10000, delta_minor: -10000 });
    const payment = paymentBody(f), paid = await f.agent.post("/v1/payments").send(payment);
    expect(paid.status).toBe(200);
    expect((await f.agent.post("/v1/payments").send({ ...payment, recipient: "Different recipient" })).status).toBe(409);
    expect((await f.agent.post(`/v1/payments/${paid.body.payment_id}/reverse`).send({
      ...op(), kind: "FULL", reason: "Wrong version", expected_version: 2, effective_date: day,
    })).status).toBe(409);
  });
});

describe("direct-write lifecycle and idempotency", () => {
  it("replays concurrent project/worker inserts, rejects changed body/actor, and leaves versions unchanged", async () => {
    const f = await fixture(false), body = { ...op(), name: "Idempotent project", timezone: "UTC", work_days: [1, 3, 5], address: "Address" };
    const [a, b] = await Promise.all([f.agent.post("/v1/projects").send(body), f.agent.post("/v1/projects").send(body)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.body).toEqual(b.body);
    expect((await f.agent.post("/v1/projects").send({ ...body, name: "Changed" })).body.error.code).toBe("OPERATION_REUSED");
    const partner = await f.h.createUser("partner");
    await f.h.addMember(f.workspaceId, partner, "PARTNER");
    expect((await (await f.h.agentFor(partner, f.workspaceId)).agent.post("/v1/projects").send(body)).status).toBe(409);
    const worker = { ...op(), display_name: "Other", phone: "555", email: "worker@example.com", document_language: "es" };
    const [c, d] = await Promise.all([f.agent.post("/v1/workers").send(worker), f.agent.post("/v1/workers").send(worker)]);
    expect([c.status, d.status]).toEqual([200, 200]);
    expect(c.body).toEqual(d.body);
    const update = { ...op(), name: "Archived", address: null, status: "ARCHIVED" };
    const changed = await f.agent.patch(`/v1/projects/${a.body.id}`).send(update);
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ name: "Archived", address: null, status: "ARCHIVED", version: 2 });
    expect((await f.agent.patch(`/v1/projects/${a.body.id}`).send(update)).body).toEqual(changed.body);
    expect((await f.agent.get("/v1/projects")).body.map((p: { id: string }) => p.id)).not.toContain(a.body.id);
    expect((await f.agent.get(`/v1/projects/${a.body.id}`)).body).toEqual(changed.body);
    const deactivate = { ...op(), phone: null, email: null, status: "INACTIVE" };
    const inactive = await f.agent.patch(`/v1/workers/${c.body.id}`).send(deactivate);
    expect(inactive.status).toBe(200);
    expect(inactive.body).toMatchObject({ phone: null, email: null, status: "INACTIVE", version: 2, document_language: "es" });
    expect((await f.agent.patch(`/v1/workers/${c.body.id}`).send(deactivate)).body).toEqual(inactive.body);
    expect((await f.agent.get("/v1/workers")).body.map((w: { id: string }) => w.id)).not.toContain(c.body.id);
    expect((await f.agent.get(`/v1/workers/${c.body.id}`)).body).toEqual(inactive.body);
  });
  it("creates assignments once, rejects duplicates, deletes unused assignments and soft-ends history", async () => {
    const f = await fixture(false);
    const worker = await f.agent.post("/v1/workers").send({ ...op(), display_name: "Second" });
    const body = { ...op(), worker_id: worker.body.id, start_date: day, end_date: "2026-10-31" };
    const created = await f.agent.post(`/v1/projects/${f.project}/assignments`).send(body);
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ start_date: day, end_date: "2026-10-31", version: 1 });
    expect((await f.agent.post(`/v1/projects/${f.project}/assignments`).send(body)).body).toEqual(created.body);
    expect((await f.agent.post(`/v1/projects/${f.project}/assignments`).send({ ...body, ...op() })).status).toBe(409);
    const list = await f.agent.get(`/v1/projects/${f.project}/assignments`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);
    expect(list.body.find((a: { id: string }) => a.id === created.body.id).display_name).toBe("Second");
    const remove = op();
    expect((await f.agent.delete(`/v1/assignments/${created.body.id}`).send(remove)).status).toBe(200);
    expect((await f.agent.delete(`/v1/assignments/${created.body.id}`).send(remove)).status).toBe(200);
    expect((await db.query("select id from assignments where id=$1", [created.body.id])).rowCount).toBe(0);
    await f.agent.post(`/v1/assignments/${f.assignment}/rates`).send({ ...op(), effective_from: day, pay_basis: "DAY", rate_minor: 20000 });
    await f.agent.post("/v1/work-entries").send(workBody(f));
    const softEnd = op();
    expect((await f.agent.delete(`/v1/assignments/${f.assignment}`).send(softEnd)).status).toBe(200);
    expect((await f.agent.delete(`/v1/assignments/${f.assignment}`).send(softEnd)).status).toBe(200);
    expect((await db.query("select end_date,version from assignments where id=$1", [f.assignment])).rows[0]).toMatchObject({ end_date: expect.any(Date), version: 2 });
    expect(await balance(f)).toBe(20000);
    expect(await storedCount(f, "ledger_events")).toBe(1);
  });
});

describe("rates, work and domain adjustments", () => {
  it("previews without writes, requires confirmation, and changes an existing day atomically", async () => {
    const f = await fixture();
    await f.agent.post("/v1/work-entries").send(workBody(f, { date: "2026-10-03" }));
    const rate = { effective_from: "2026-10-02", pay_basis: "DAY", rate_minor: 25000 };
    const count = await storedCount(f, "idempotency_keys");
    const preview = await f.agent.post(`/v1/assignments/${f.assignment}/rates/preview`).send(rate);
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ total_delta_minor: 5000, blocked_reason: null,
      affected: [{ work_date: "2026-10-03", old_earned_minor: 20000, new_earned_minor: 25000, delta_minor: 5000 }] });
    expect(await storedCount(f, "idempotency_keys")).toBe(count);
    const change = { ...op(), ...rate };
    const blocked = await f.agent.post(`/v1/assignments/${f.assignment}/rates`).send(change);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("CONFIRMATION_REQUIRED");
    const confirmed = { ...change, confirm: true, reason: "New agreement" };
    const applied = await f.agent.post(`/v1/assignments/${f.assignment}/rates`).send(confirmed);
    expect(applied.status).toBe(200);
    expect(applied.body).toMatchObject({ corrected_days: 1, total_delta_minor: 5000 });
    expect((await f.agent.post(`/v1/assignments/${f.assignment}/rates`).send(confirmed)).body).toEqual(applied.body);
    expect(await balance(f)).toBe(25000);
    const rates = await f.agent.get(`/v1/assignments/${f.assignment}/rates`);
    expect(rates.status).toBe(200);
    expect(rates.body.map((r: { rate_minor: number }) => r.rate_minor)).toEqual([20000, 25000]);
  });
  it("marks no work only once and replays reimbursement and both adjustment directions", async () => {
    const f = await fixture(), noWork = { ...op(), project_id: f.project, date: day };
    const first = await f.agent.post("/v1/work-entries/no-work").send(noWork);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ marked: 1 });
    expect((await f.agent.post("/v1/work-entries/no-work").send(noWork)).body).toEqual(first.body);
    expect((await f.agent.post("/v1/work-entries/no-work").send({ ...noWork, ...op() })).body).toEqual({ marked: 0 });
    const reimbursement = { ...op(), assignment_id: f.assignment, date: day, amount_minor: 1234, description: "Materials" };
    const reimb = await f.agent.post("/v1/reimbursements").send(reimbursement);
    expect(reimb.status).toBe(200);
    expect((await f.agent.post("/v1/reimbursements").send(reimbursement)).body).toEqual(reimb.body);
    expect((await f.agent.post("/v1/reimbursements").send({ ...reimbursement, amount_minor: 1235 })).status).toBe(409);
    for (const direction of ["INCREASE_OWED", "DECREASE_OWED"]) {
      const body = { ...op(), assignment_id: f.assignment, date: day, direction, category: "BONUS", amount_minor: 100, reason: "Adjustment" };
      const result = await f.agent.post("/v1/adjustments").send(body);
      expect(result.status).toBe(200);
      expect((await f.agent.post("/v1/adjustments").send(body)).body).toEqual(result.body);
    }
    expect(await balance(f)).toBe(1234);
    expect(await storedCount(f, "ledger_events")).toBe(3);
  });
  it("surfaces SQL's business messages for no rate, archived project and dates outside assignment", async () => {
    const f = await fixture(false);
    const missing = await f.agent.post("/v1/work-entries").send(workBody(f));
    expect(missing.status).toBe(422);
    expect(missing.body.error.message).toBe("no pay agreement for date");
    const outside = await f.agent.post("/v1/work-entries").send(workBody(f, { date: "2026-09-30" }));
    expect(outside.status).toBe(422);
    expect(outside.body.error.message).toBe("date outside assignment");
    await f.agent.patch(`/v1/projects/${f.project}`).send({ ...op(), status: "ARCHIVED" });
    const archived = await f.agent.post("/v1/work-entries").send(workBody(f));
    expect(archived.status).toBe(422);
    expect(archived.body.error.message).toBe("project archived");
  });
});

describe("payment variants", () => {
  it("records note, partially reverses, clears a check and returns it, with all operations replayable", async () => {
    const f = await fixture(), body = paymentBody(f, { method: "CHECK", note: "Owner-only note" });
    const paid = await f.agent.post("/v1/payments").send(body);
    expect(paid.status).toBe(200);
    expect((await f.agent.post("/v1/payments").send(body)).body).toEqual(paid.body);
    const listed = await f.agent.get("/v1/payments");
    expect(listed.body[0]).toMatchObject({ note: "Owner-only note", clearance: "ISSUED" });
    const allocationId = listed.body[0].allocations[0].id;
    const clear = { ...op(), expected_version: 1 };
    const cleared = await f.agent.patch(`/v1/payments/${paid.body.payment_id}/clearance`).send(clear);
    expect(cleared.status).toBe(200);
    expect(cleared.body).toEqual({ payment_version: 2, clearance: "CLEARED" });
    expect((await f.agent.patch(`/v1/payments/${paid.body.payment_id}/clearance`).send(clear)).body).toEqual(cleared.body);
    expect(await balance(f)).toBe(-20000);
    const partial = { ...op(), kind: "PARTIAL", reason: "Partial return", expected_version: 2, effective_date: day,
      lines: [{ allocation_id: allocationId, amount_minor: 5000 }] };
    const reversed = await f.agent.post(`/v1/payments/${paid.body.payment_id}/reverse`).send(partial);
    expect(reversed.status).toBe(200);
    expect(reversed.body).toMatchObject({ payment_version: 3, reversed_minor: 5000, unreversed_minor: 15000 });
    expect((await f.agent.post(`/v1/payments/${paid.body.payment_id}/reverse`).send(partial)).body).toEqual(reversed.body);
    const returned = await f.agent.post(`/v1/payments/${paid.body.payment_id}/reverse`).send({
      ...op(), kind: "CHECK_RETURNED", reason: "Bank returned", expected_version: 3, effective_date: day,
    });
    expect(returned.status).toBe(200);
    expect(await balance(f)).toBe(0);
    expect((await f.agent.get("/v1/payments")).body[0].clearance).toBe("RETURNED");
    expect(JSON.stringify(logs)).not.toContain("Owner-only note");
  });
  it("corrects atomically and rolls back a bad replacement", async () => {
    const f = await fixture(), paid = await f.agent.post("/v1/payments").send(paymentBody(f));
    const correction = { ...paymentBody(f, { amount_minor: 15000, allocations: [{ assignment_id: f.assignment, amount_minor: 15000 }] }),
      expected_version: 1, effective_date: day, reason: "Amount corrected" };
    const bad = await f.agent.post(`/v1/payments/${paid.body.payment_id}/correct`).send({ ...correction, amount_minor: 16000 });
    expect(bad.status).toBe(422);
    expect(await balance(f)).toBe(-20000);
    expect(await storedCount(f, "reversals")).toBe(0);
    const corrected = await f.agent.post(`/v1/payments/${paid.body.payment_id}/correct`).send(correction);
    expect(corrected.status).toBe(200);
    expect(corrected.body).toMatchObject({ replaced_payment_id: paid.body.payment_id, reversal: { reversed_minor: 20000 }, payment: { version: 1 } });
    expect((await f.agent.post(`/v1/payments/${paid.body.payment_id}/correct`).send(correction)).body).toEqual(corrected.body);
    expect(await balance(f)).toBe(-15000);
    expect(await storedCount(f, "payments")).toBe(2);
    expect((await f.agent.get("/v1/payments")).body.find((p: { id: string }) => p.id === corrected.body.payment.payment_id).replaces_payment_id).toBe(paid.body.payment_id);
  });
});

describe("tenant context and input boundaries", () => {
  it("hides foreign entities in every path read/write, filters and assignment relationships", async () => {
    const a = await fixture(), b = await fixture();
    const payment = await b.agent.post("/v1/payments").send(paymentBody(b));
    for (const url of [
      `/v1/projects/${b.project}`, `/v1/workers/${b.worker}`, `/v1/workers/${b.worker}/year-paid`,
      `/v1/projects/${b.project}/assignments`, `/v1/assignments/${b.assignment}/rates`,
      `/v1/work-entries?assignment_id=${b.assignment}&from=${day}&to=${day}`,
      `/v1/balances?project_id=${b.project}`, `/v1/history?worker_id=${b.worker}`, `/v1/payments?worker_id=${b.worker}`,
    ]) expect((await a.agent.get(url)).status, url).toBe(404);
    expect((await a.agent.patch(`/v1/projects/${b.project}`).send({ ...op(), name: "Forged" })).status).toBe(404);
    expect((await a.agent.patch(`/v1/workers/${b.worker}`).send({ ...op(), display_name: "Forged" })).status).toBe(404);
    expect((await a.agent.delete(`/v1/assignments/${b.assignment}`).send(op())).status).toBe(404);
    for (const [project, worker] of [[a.project, b.worker], [b.project, a.worker]]) {
      expect((await a.agent.post(`/v1/projects/${project}/assignments`).send({ ...op(), worker_id: worker, start_date: day })).status).toBe(404);
    }
    const rate = { effective_from: day, pay_basis: "DAY", rate_minor: 20000 };
    expect((await a.agent.post(`/v1/assignments/${b.assignment}/rates/preview`).send(rate)).status).toBe(404);
    expect((await a.agent.post(`/v1/assignments/${b.assignment}/rates`).send({ ...op(), ...rate })).status).toBe(404);
    expect((await a.agent.post("/v1/work-entries").send(workBody(b))).status).toBe(404);
    expect((await a.agent.post("/v1/work-entries/no-work").send({ ...op(), project_id: b.project, date: day })).status).toBe(404);
    expect((await a.agent.post("/v1/reimbursements").send({ ...op(), assignment_id: b.assignment, date: day, amount_minor: 1, description: "Other" })).status).toBe(404);
    expect((await a.agent.post("/v1/adjustments").send({ ...op(), assignment_id: b.assignment, date: day, amount_minor: 1, direction: "INCREASE_OWED", category: "OTHER", reason: "Other" })).status).toBe(404);
    expect((await a.agent.post("/v1/payments").send(paymentBody(b))).status).toBe(422);
    expect((await a.agent.post(`/v1/payments/${payment.body.payment_id}/reverse`).send({
      ...op(), kind: "FULL", reason: "Other", expected_version: 1, effective_date: day,
    })).status).toBe(404);
    expect((await a.agent.patch(`/v1/payments/${payment.body.payment_id}/clearance`).send({ ...op(), expected_version: 1 })).status).toBe(404);
    expect((await a.agent.post(`/v1/payments/${payment.body.payment_id}/correct`).send({
      ...paymentBody(a), expected_version: 1, effective_date: day, reason: "Other",
    })).status).toBe(404);
    expect(await balance(a)).toBe(0);
    expect(await balance(b)).toBe(-20000);
    for (const url of ["/v1/projects", "/v1/workers", "/v1/payments", "/v1/balances", "/v1/history"]) {
      const data = (await a.agent.get(url)).body;
      expect(JSON.stringify(data)).not.toContain(b.assignment);
      expect(JSON.stringify(data)).not.toContain(b.project);
      expect(JSON.stringify(data)).not.toContain(b.worker);
    }
  });
  it("requires sessions and identical valid workspace context at both base mounts", async () => {
    const f = await fixture();
    for (const prefix of ["/v1", "/api/v1"]) {
      expect((await request(f.app).get(`${prefix}/balances`)).status).toBe(401);
      for (const header of [undefined, "bad", randomUUID()]) {
        const call = request(f.app).get(`${prefix}/balances`).set("Authorization", `Bearer ${f.token}`);
        const response = await (header ? call.set("X-Workspace-Id", header) : call);
        expect(response.status).toBe(404);
        expect(response.body.error).toMatchObject({ code: "NOT_FOUND", message: "Not found" });
      }
      const response = await request(f.app).get(`${prefix}/projects`).set("Authorization", `Bearer ${f.token}`).set("X-Workspace-Id", f.workspaceId);
      expect(response.status).toBe(200);
      expect(response.body[0].id).toBe(f.project);
      expect(response.headers["cache-control"]).toBe("no-store");
    }
  });
  it("enforces actual lead and worker work gates and denies their money writes", async () => {
    const f = await fixture(true, "BUSINESS");
    for (const role of ["LEAD", "WORKER"]) {
      const user = await f.h.createUser(role);
      await f.h.addMember(f.workspaceId, user, role, role === "WORKER" ? { workerId: f.worker } : {});
      const agent = (await f.h.agentFor(user, f.workspaceId)).agent;
      expect((await agent.post("/v1/work-entries").send(workBody(f, { date: role === "LEAD" ? "2026-10-02" : "2026-10-03" }))).status).toBe(200);
      expect((await agent.post("/v1/payments").send(paymentBody(f))).status).toBe(403);
      expect((await agent.get("/v1/balances")).status).toBe(403);
    }
  });
  it("rejects unknown fields, malformed dates, fractional/unsafe/over-limit cents and invalid rate/day inputs", async () => {
    const f = await fixture();
    for (const extra of [{ workspace_id: f.workspaceId }, { date: "2026-02-30" }, { expected_version: 1.5 }]) {
      expect((await f.agent.post("/v1/work-entries").send(workBody(f, extra))).status).toBe(400);
    }
    for (const amount_minor of [1.5, "20000", 0, -1, 10000001, Number.MAX_SAFE_INTEGER + 1]) {
      expect((await f.agent.post("/v1/payments").send(paymentBody(f, { amount_minor }))).status).toBe(400);
    }
    expect((await f.agent.post("/v1/payments").send(paymentBody(f, { method: "OTHER" }))).status).toBe(422);
    expect((await f.agent.post("/v1/payments").send(paymentBody(f, {
      allocations: [{ assignment_id: f.assignment, amount_minor: 20000, forged: true }],
    }))).status).toBe(400);
    expect((await f.agent.post("/v1/projects").send({ ...op(), name: "P", timezone: "Invalid/Zone" })).status).toBe(422);
    expect((await f.agent.post("/v1/projects").send({ ...op(), name: "P", timezone: "UTC", work_days: [0] })).status).toBe(400);
    expect((await f.agent.post("/v1/projects").send({ ...op(), name: "P", timezone: "UTC", work_days: [1, 1] })).status).toBe(422);
    expect((await f.agent.post(`/v1/assignments/${f.assignment}/rates/preview`).send({
      effective_from: day, pay_basis: "HOUR", rate_minor: 100001,
    })).status).toBe(422);
    expect((await f.agent.get(`/v1/history?from=2026-10-02&to=${day}`)).status).toBe(400);
    expect((await f.agent.get("/v1/payments?worker_id=invalid")).status).toBe(400);
    expect((await f.agent.post("/v1/reimbursements").send({ ...op(), assignment_id: f.assignment, date: day, amount_minor: 5000001, description: "Bad" })).status).toBe(400);
    expect(await storedCount(f, "payments")).toBe(0);
  });
  it("returns generic internal failures, not raw SQL messages, and refuses unsafe read integers", async () => {
    const client = await db.connect();
    const spy = vi.spyOn(client, "query").mockRejectedValueOnce(Object.assign(new Error("raw SQL SELECT private_data"), { code: "22023" }));
    try {
      let caught: unknown;
      try { await sqlResult(client, "select 1 as result", []); } catch (error) { caught = error; }
      expect(mapError(caught)).toEqual({ status: 422, code: "INVALID", message: "Invalid domain input" });
    } finally { spy.mockRestore(); client.release(); }
    expect(() => numbers({ balance_minor: "9007199254740993" })).toThrow("safe range");
  });
});

describe("shared preview/server vectors through HTTP", () => {
  it("runs every valid vector through rate and work routes with exact integer cents", async () => {
    const vectors = JSON.parse(await readFile(path.resolve("../../shared/pay_test_vectors.json"), "utf8")).vectors;
    for (const vector of vectors) {
      const f = await fixture(false);
      const rate = await f.agent.post(`/v1/assignments/${f.assignment}/rates`).send({
        ...op(), effective_from: day, pay_basis: vector.basis, rate_minor: vector.rate_minor,
        standard_day_minutes: vector.standard_day_minutes,
      });
      expect(rate.status, vector.id).toBe(200);
      const body = workBody(f, { mode: vector.mode, portion: vector.portion, minutes: vector.minutes });
      const work = await f.agent.post("/v1/work-entries").send(body);
      expect(work.status, vector.id).toBe(200);
      expect(work.body.earned_minor, vector.id).toBe(vector.earned_minor);
      expect(await balance(f), vector.id).toBe(vector.earned_minor);
      expect((await f.agent.post("/v1/work-entries").send(body)).body).toEqual(work.body);
    }
  });
  it("rejects the invalid shared input/pay-basis vectors using SQL business rules", async () => {
    const vectors = JSON.parse(await readFile(path.resolve("../../shared/pay_test_vectors.json"), "utf8")).invalid;
    for (const vector of vectors) {
      const f = await fixture(false);
      const rate = await f.agent.post(`/v1/assignments/${f.assignment}/rates`).send({
        ...op(), effective_from: day, pay_basis: vector.basis, rate_minor: 20000,
        standard_day_minutes: vector.standard_day_minutes ?? null,
      });
      expect(rate.status).toBe(200);
      const invalid = await f.agent.post("/v1/work-entries").send(workBody(f, {
        mode: vector.mode, portion: vector.portion ?? null, minutes: vector.minutes ?? null,
      }));
      expect(invalid.status).toBe(422);
      expect(invalid.body.error.message).toContain("not valid for pay basis");
    }
  });
});
