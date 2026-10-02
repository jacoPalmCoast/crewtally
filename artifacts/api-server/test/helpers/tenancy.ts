import type { Express } from "express";
import type { Pool } from "pg";
import request, { type Test } from "supertest";
import { expect } from "vitest";
import { createSessionToken, hashSessionToken } from "../../src/auth/apple";

type Method = "get" | "post" | "put" | "patch" | "delete";

export interface AuthedRequestAgent {
  get: (path: string) => Test;
  post: (path: string) => Test;
  put: (path: string) => Test;
  patch: (path: string) => Test;
  delete: (path: string) => Test;
}

export interface TestOwner {
  userId: string;
  workspaceId: string;
  token: string;
  agent: AuthedRequestAgent;
  expectNotFoundAcrossWorkspaces: (route: string, method: Method, idFromOtherWorkspace: string) => Promise<void>;
}

export interface TenancyHarness {
  createOwner(): Promise<TestOwner>;
  createUser(label: string): Promise<{ userId: string }>;
  createWorkspace(user: { userId: string }, kind?: "HOME" | "BUSINESS"): Promise<string>;
  addMember(workspace: string, user: { userId: string }, role: string, options?: { financial?: boolean; workerId?: string }): Promise<void>;
  agentFor(user: { userId: string }, workspaceId?: string): Promise<{ token: string; agent: AuthedRequestAgent }>;
}

export function createTenancyHarness(db: Pool, app: Express): TenancyHarness {
  async function createUser(label: string) {
    const userResult = await db.query<{ id: string }>(
      "INSERT INTO users (apple_sub) VALUES ($1) RETURNING id",
      [`test-${label}-${crypto.randomUUID()}`],
    );
    return { userId: userResult.rows[0]!.id };
  }
  async function createWorkspace(user: { userId: string }, kind: "HOME" | "BUSINESS" = "HOME") {
    const workspaceResult = await db.query<{ id: string }>(
      "select create_workspace($1,$2,'My workspace','USD','America/New_York') as id",
      [user.userId, kind],
    );
    return workspaceResult.rows[0]!.id;
  }
  async function addMember(workspace: string, user: { userId: string }, role: string, options: { financial?: boolean; workerId?: string } = {}) {
    const owner = (await db.query("select owner_id from workspaces where id=$1", [workspace])).rows[0].owner_id;
    const hash = hashSessionToken(createSessionToken());
    await db.query("select create_invitation($1,$2,$3,$4,$5,$6,$7,$8,$8)",
      [workspace, owner, crypto.randomUUID(), role, role === "ADMIN" ? options.financial ?? false : null,
        options.workerId ?? null, `${crypto.randomUUID()}@example.com`, hash]);
    await db.query("select accept_invitation($1,$2)", [user.userId, hash]);
  }
  async function agentFor(user: { userId: string }, workspaceId?: string) {
    const token = createSessionToken();
    await db.query(
      `INSERT INTO sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + interval '30 days')`,
      [user.userId, hashSessionToken(token)],
    );

    const method = (name: Method, path: string) => {
      const test = request(app)[name](path);
      test.set("Authorization", `Bearer ${token}`);
      if (workspaceId) test.set("X-Workspace-Id", workspaceId);
      return test;
    };
    const agent: AuthedRequestAgent = {
      get: path => method("get", path),
      post: path => method("post", path),
      put: path => method("put", path),
      patch: path => method("patch", path),
      delete: path => method("delete", path),
    };

    return { token, agent };
  }
  async function createOwner(): Promise<TestOwner> {
    const { userId } = await createUser("owner");
    const workspaceId = await createWorkspace({ userId });
    const { token, agent } = await agentFor({ userId }, workspaceId);
    return {
      userId,
      workspaceId,
      token,
      agent,
      expectNotFoundAcrossWorkspaces: async (route, requestMethod, idFromOtherWorkspace) => {
        const path = route.includes(":id")
          ? route.replace(":id", encodeURIComponent(idFromOtherWorkspace))
          : `${route.replace(/\/$/, "")}/${encodeURIComponent(idFromOtherWorkspace)}`;
        const call = agent[requestMethod](path);
        const response = await (requestMethod === "get" ? call : call.send({
          operation_id: crypto.randomUUID(), ...(requestMethod === "patch" ? { role: "LEAD" } : {}),
        }));
        expect(response.status, `${requestMethod.toUpperCase()} ${route} must hide cross-workspace ids`).toBe(404);
      },
    };
  }
  return { createOwner, createUser, createWorkspace, addMember, agentFor };
}