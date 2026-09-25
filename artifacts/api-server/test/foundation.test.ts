import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import pg from "pg";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import app, { errorHandler } from "../src/app";
import router from "../src/routes";
import { migrate } from "../src/db/migrate";
import { pool } from "../src/db/pool";
import { shareLinks } from "../src/db/money";

if (process.env.APP_ENV === "production") throw new Error("Refusing database tests in production");

const schema = `test_${randomUUID().replace(/-/g, "")}`;
let isolated: pg.Pool;
beforeAll(async () => {
  await pool.query(`create schema "${schema}"`);
  isolated = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}` });
  const sql = await readFile(path.resolve("../../db/schema.sql"), "utf8");
  await isolated.query(sql);
});
afterAll(async () => {
  if (isolated) await isolated.end();
  await pool.query(`drop schema if exists "${schema}" cascade`);
  await pool.end();
});

describe("Phase 0 API", () => {
  it("responds with the database and migration status", async () => {
    // The development API start applies migration 0001 before exposing health.
    const res = await request(app).get("/v1/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: "ok", migrations: expect.any(Number) });
    expect(res.headers["x-correlation-id"]).toMatch(/^[a-f0-9-]{36}$/);
  });

  it("returns a share-link row from open_share_link in the isolated schema", async () => {
    const workspaceId = randomUUID();
    const tokenHash = createHash("sha256").update(randomUUID()).digest();
    await isolated.query(
      "insert into workspaces (id, owner_id, name) values ($1, $2, $3)",
      [workspaceId, randomUUID(), "Share link test"],
    );
    const inserted = await isolated.query<{ id: string; expires_at: Date }>(
      `insert into share_links (workspace_id, target_type, target_id, view, view_worker_id, token_hash, expires_at)
       values ($1, 'RECEIPT', $2, 'WORKER', $3, $4, now() + interval '30 days')
       returning id, expires_at`,
      [workspaceId, randomUUID(), randomUUID(), tokenHash],
    );
    const opened = await shareLinks.open(tokenHash, isolated);
    expect(opened).toEqual(expect.objectContaining({
      id: inserted.rows[0]!.id,
      expires_at: expect.any(Date),
    }));
    expect(opened?.expires_at).toEqual(inserted.rows[0]!.expires_at);
  });

  it("maps oversized and malformed JSON bodies without exposing parser details", async () => {
    const cases = [
      { body: JSON.stringify({ payload: "x".repeat(1_100_000) }), status: 413, code: "PAYLOAD_TOO_LARGE" },
      { body: '{"broken":', status: 400, code: "INVALID_JSON" },
    ];
    for (const { body, status, code } of cases) {
      const res = await request(app).post("/v1/health").set("Content-Type", "application/json").send(body);
      expect(res.status).toBe(status);
      expect(res.body).toEqual({ error: {
        code, message: expect.any(String), correlationId: expect.any(String),
      } });
      expect(res.headers["x-correlation-id"]).toBe(res.body.error.correlationId);
      expect(JSON.stringify(res.body)).not.toContain(body);
    }
  });

  it("maps each SQLSTATE from real database function failures", async () => {
    const id = randomUUID();
    const cases: { state: string; expected: number; code: string; sql: string; args: unknown[] }[] = [
      { state: "P0002", expected: 404, code: "NOT_FOUND",
        sql: "select set_check_cleared($1,$2,$3,1)", args: [id, randomUUID(), randomUUID()] },
      { state: "22023", expected: 422, code: "INVALID_INPUT",
        sql: "select fn_earned('HOUR',100,'DAY_PORTION',0.5,null,null)", args: [] },
    ];
    for (const test of cases) {
      let error: unknown;
      try { await isolated.query(test.sql, test.args); } catch (caught) { error = caught; }
      expect((error as pg.DatabaseError).code).toBe(test.state);
      const probe = express();
      probe.get("/", (_req, _res, next) => next(error));
      probe.use(errorHandler);
      const res = await request(probe).get("/");
      expect(res.status).toBe(test.expected);
      expect(res.body.error.code).toBe(test.code);
    }
    // Database functions do not expose every SQLSTATE without financial setup.
    // The remaining mappings are checked directly against SQLSTATE-shaped errors.
    for (const [state, status, code] of [
      ["40001", 409, "CONFLICT"], ["55000", 409, "CONFIRMATION_REQUIRED"],
      ["23505", 409, "CONFLICT"], ["23503", 404, "NOT_FOUND"],
      ["23514", 422, "INVALID_INPUT"], ["XXXXX", 500, "INTERNAL_ERROR"],
    ] as const) {
      const probe = express();
      probe.get("/", (_req, _res, next) => next({ code: state }));
      probe.use(errorHandler);
      const res = await request(probe).get("/");
      expect(res.status).toBe(status);
      expect(res.body.error).toEqual({ code, message: expect.any(String) });
      expect(JSON.stringify(res.body)).not.toContain("stack");
    }
  });

  it("smoke checks every registered route method with an empty request", async () => {
    const methods = ["get", "post", "put", "patch", "delete"] as const;
    const routes = router.stack.flatMap(layer =>
      layer.route ? [{ path: layer.route.path as string, methods: layer.route.methods }]
        : (layer.handle?.stack ?? []).flatMap((child: { route?: { path: string; methods: Record<string, boolean> } }) =>
          child.route ? [{ path: child.route.path, methods: child.route.methods }] : []));
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      for (const method of methods) {
        if (!route.methods[method]) continue;
        const res = await request(app)[method](`/v1${route.path}`).send(method === "get" ? undefined : {});
        expect(res.status, `${method.toUpperCase()} ${route.path}`).toBeLessThan(500);
      }
    }
  });

  it("rejects a changed migration checksum", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "crewtally-migrate-"));
    try {
      const filename = "0001_sample.sql";
      await writeFile(path.join(dir, filename), "create table test_checksum (id integer);");
      expect(await migrate(isolated, dir)).toBe(1);
      await writeFile(path.join(dir, filename), "create table test_checksum (id bigint);");
      await expect(migrate(isolated, dir)).rejects.toThrow("Migration checksum mismatch");
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});