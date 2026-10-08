import type { Request } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import { operation } from "./workspaces";

export const id = z.string().uuid();
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Invalid calendar date");
export const filters = z.object({
  project_id: id.optional(), worker_id: id.optional(),
  from: date.optional(), to: date.optional(),
}).strict().refine(value => !value.from || !value.to || value.from <= value.to, "Invalid date range");

export function parseBody<S extends z.ZodRawShape>(schema: z.ZodObject<S>, req: Request) {
  const body = operation.extend(schema.shape).strict().parse(req.body);
  // Generated patterns constrain syntax; also validate actual calendar dates.
  for (const key of ["date", "effective_date", "effective_from", "start_date", "end_date"]) {
    const value = (body as Record<string, unknown>)[key];
    if (value != null) date.parse(value);
  }
  return body;
}

export function notFound(): never {
  throw Object.assign(new Error("Not found"), { code: "CT404" });
}
export function rule(message: string): never {
  throw Object.assign(new Error(message), { code: "DOMAIN_RULE" });
}
export async function exists(tx: PoolClient, ws: string, table: "projects" | "workers" | "assignments", value: string) {
  const result = await tx.query(`select id from ${table} where workspace_id=$1 and id=$2`, [ws, value]);
  if (!result.rowCount) notFound();
}
export async function checkFilters(tx: PoolClient, ws: string, query: { project_id?: string; worker_id?: string }) {
  if (query.project_id) await exists(tx, ws, "projects", query.project_id);
  if (query.worker_id) await exists(tx, ws, "workers", query.worker_id);
}

// pg returns bigint/numeric columns as strings. Convert only integer contract fields,
// checking the safe-integer bound first; never calculate earnings in TypeScript.
export function numbers<T>(value: T): T {
  if (Array.isArray(value)) return value.map(numbers) as T;
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value).map(([key, field]) => {
    if ((key.endsWith("_minor") || ["signed_delta", "seq", "year"].includes(key)) &&
        (typeof field === "string" || typeof field === "number")) {
      if (typeof field === "string" && !/^-?\d+$/.test(field)) throw new Error("Invalid integer database value");
      const converted = Number(field);
      if (!Number.isSafeInteger(converted)) throw new Error("Database integer exceeds JSON safe range");
      return [key, converted];
    }
    return [key, numbers(field)];
  })) as T;
}

const messages = new Set([
  "project archived", "date outside assignment", "no pay agreement for date",
  "invalid allocation line", "unknown reversal kind", "lines are required for PARTIAL and only for PARTIAL",
  "reason required", "only an issued or cleared check can be returned",
  "reversal exceeds unreversed amount on allocation", "line does not belong to this payment",
  "nothing left to reverse", "only an issued check can be marked cleared",
  "description required", "bad adjustment direction", "bad adjustment category",
  "an agreement already starts on this date", "note too long",
  "standard day minutes required",
]);
function safeMessage(message: string) {
  return messages.has(message) ||
    /^allocations total -?\d+ does not equal payment -?\d+$/.test(message) ||
    /^input mode (DAY_PORTION|DAY_MINUTES|HOUR_MINUTES|NO_WORK|VOID) not valid for pay basis (DAY|HOUR)$/.test(message) ||
    /^A change between daily and hourly must start after the last recorded work day \(\d{4}-\d{2}-\d{2}\)\. Void and re-enter those days instead\.$/.test(message) ||
    /^Day \d{4}-\d{2}-\d{2} was entered as hours; the new agreement needs a standard day length\.$/.test(message);
}

// Static signatures only; request data is always bound, never interpolated as SQL.
export async function sqlResult(tx: PoolClient, sql: string, args: unknown[]) {
  try {
    const result = await tx.query(sql, args);
    return numbers(result.rows[0]!.result);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "22023") {
      rule(safeMessage(error.message) ? error.message : "Invalid domain input");
    }
    throw error;
  }
}

export function validateRate(body: { pay_basis: string; rate_minor: number; standard_day_minutes?: number | null }) {
  if (body.pay_basis === "HOUR" && (body.rate_minor > 100000 || body.standard_day_minutes != null)) {
    rule("Hourly rates must be at most 100000 cents and have no standard day minutes");
  }
}
export function validatePayment(body: {
  method: string; method_note?: string | null; allocations: { assignment_id: string }[];
}) {
  if (body.method === "OTHER" && !body.method_note?.trim()) rule("method_note required for OTHER");
  if (new Set(body.allocations.map(line => line.assignment_id)).size !== body.allocations.length) {
    rule("Each assignment may appear only once in allocations");
  }
}
