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
}

export function createTenancyHarness(db: Pool, app: Express): TenancyHarness {
  async function createOwner(): Promise<TestOwner> {
    const userResult = await db.query<{ id: string }>(
      "INSERT INTO users (apple_sub) VALUES ($1) RETURNING id",
      [`test-owner-${crypto.randomUUID()}`],
    );
    const userId = userResult.rows[0]!.id;
    const workspaceResult = await db.query<{ id: string }>(
      "INSERT INTO workspaces (owner_id, name, currency_code) VALUES ($1, 'My workspace', 'USD') RETURNING id",
      [userId],
    );
    const workspaceId = workspaceResult.rows[0]!.id;
    const token = createSessionToken();
    await db.query(
      `INSERT INTO sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + interval '30 days')`,
      [userId, hashSessionToken(token)],
    );

    const method = (name: Method, path: string) => {
      const test = request(app)[name](path);
      return test.set("Authorization", `Bearer ${token}`);
    };
    const agent: AuthedRequestAgent = {
      get: path => method("get", path),
      post: path => method("post", path),
      put: path => method("put", path),
      patch: path => method("patch", path),
      delete: path => method("delete", path),
    };

    return {
      userId,
      workspaceId,
      token,
      agent,
      expectNotFoundAcrossWorkspaces: async (route, requestMethod, idFromOtherWorkspace) => {
        const path = route.includes(":id")
          ? route.replace(":id", encodeURIComponent(idFromOtherWorkspace))
          : `${route.replace(/\/$/, "")}/${encodeURIComponent(idFromOtherWorkspace)}`;
        const response = await agent[requestMethod](path);
        expect(response.status, `${requestMethod.toUpperCase()} ${route} must hide cross-workspace ids`).toBe(404);
      },
    };
  }
  return { createOwner };
}