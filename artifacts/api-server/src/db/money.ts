import type { Pool } from "pg";
import { pool } from "./pool";

type Id = string;
type DateString = string;
type Json = Record<string, unknown> | unknown[];
type Nullable<T> = T | null;
export type ShareLinkRow = { id: string; expires_at: Date } & Record<string, unknown>;

// Signatures are fixed at compile time; values always travel as bound parameters.
const signatures = {
  record_work: ["uuid", "uuid", "uuid", "date", "text", "numeric", "integer", "integer", "text", "text"],
  mark_rest_no_work: ["uuid", "uuid", "uuid", "date"],
  record_payment: ["uuid", "uuid", "date", "text", "text", "bigint", "text", "text", "jsonb"],
  record_payment_with_note: ["uuid", "uuid", "date", "text", "text", "bigint", "text", "text", "jsonb", "text"],
  record_payout: ["uuid", "uuid", "date", "jsonb"],
  reverse_payment: ["uuid", "uuid", "uuid", "text", "text", "integer", "date", "jsonb"],
  set_check_cleared: ["uuid", "uuid", "uuid", "integer"],
  correct_payment: ["uuid", "uuid", "uuid", "integer", "date", "text", "date", "text", "text", "bigint", "text", "text", "jsonb"],
  record_handover_signature: ["uuid", "uuid", "uuid", "uuid", "text", "uuid", "text", "text"],
  record_reimbursement: ["uuid", "uuid", "uuid", "date", "bigint", "text"],
  record_adjustment: ["uuid", "uuid", "uuid", "date", "text", "text", "bigint", "text"],
  apply_rate_change: ["uuid", "uuid", "uuid", "date", "text", "bigint", "integer", "text", "boolean"],
  preview_rate_change: ["uuid", "uuid", "date", "text", "bigint", "integer"],
  delete_workspace_data: ["uuid"],
  open_share_link: ["bytea"],
  acknowledge_share_link: ["bytea", "text", "text", "text"],
} as const;

async function call<T>(name: keyof typeof signatures, args: unknown[]): Promise<T> {
  const types = signatures[name];
  if (args.length !== types.length) throw new Error("Invalid function argument count");
  const placeholders = types.map((type, i) => `$${i + 1}::${type}`).join(", ");
  const values = args.map((value, i) => types[i] === "jsonb" && value != null ? JSON.stringify(value) : value);
  const result = await pool.query<{ result: T }>(`select ${name}(${placeholders}) as result`, values);
  return result.rows[0]!.result;
}

export const money = {
  recordWork: (workspaceId: Id, operationId: Id, assignmentId: Id, date: DateString, mode: string,
    portion: Nullable<string>, minutes: Nullable<number>, expectedVersion: number, reason: Nullable<string>, note: Nullable<string>) =>
    call<Json>("record_work", [workspaceId, operationId, assignmentId, date, mode, portion, minutes, expectedVersion, reason, note]),
  markRestNoWork: (workspaceId: Id, operationId: Id, projectId: Id, date: DateString) =>
    call<Json>("mark_rest_no_work", [workspaceId, operationId, projectId, date]),
  recordPayment: (workspaceId: Id, operationId: Id, date: DateString, method: string, methodNote: Nullable<string>,
    amountMinor: number, recipient: string, reference: Nullable<string>, allocations: Json) =>
    call<Json>("record_payment", [workspaceId, operationId, date, method, methodNote, amountMinor, recipient, reference, allocations]),
  recordPaymentWithNote: (workspaceId: Id, operationId: Id, date: DateString, method: string, methodNote: Nullable<string>,
    amountMinor: number, recipient: string, reference: Nullable<string>, allocations: Json, note: Nullable<string>) =>
    call<Json>("record_payment_with_note", [workspaceId, operationId, date, method, methodNote, amountMinor, recipient, reference, allocations, note]),
  recordPayout: (workspaceId: Id, operationId: Id, date: DateString, lines: Json) =>
    call<Json>("record_payout", [workspaceId, operationId, date, lines]),
  reversePayment: (workspaceId: Id, operationId: Id, paymentId: Id, kind: string, reason: string,
    expectedVersion: number, effectiveDate: DateString, lines: Nullable<Json> = null) =>
    call<Json>("reverse_payment", [workspaceId, operationId, paymentId, kind, reason, expectedVersion, effectiveDate, lines]),
  setCheckCleared: (workspaceId: Id, operationId: Id, paymentId: Id, expectedVersion: number) =>
    call<Json>("set_check_cleared", [workspaceId, operationId, paymentId, expectedVersion]),
  correctPayment: (workspaceId: Id, operationId: Id, paymentId: Id, expectedVersion: number,
    effectiveDate: DateString, reason: string, date: DateString, method: string, methodNote: Nullable<string>,
    amountMinor: number, recipient: string, reference: Nullable<string>, allocations: Json) =>
    call<Json>("correct_payment", [workspaceId, operationId, paymentId, expectedVersion, effectiveDate, reason,
      date, method, methodNote, amountMinor, recipient, reference, allocations]),
  recordHandoverSignature: (workspaceId: Id, operationId: Id, paymentId: Id, workerId: Id,
    typedName: string, evidenceId: Id, language: string, statement: string) =>
    call<Json>("record_handover_signature", [workspaceId, operationId, paymentId, workerId, typedName, evidenceId, language, statement]),
  recordReimbursement: (workspaceId: Id, operationId: Id, assignmentId: Id, date: DateString, amountMinor: number, description: string) =>
    call<Json>("record_reimbursement", [workspaceId, operationId, assignmentId, date, amountMinor, description]),
  recordAdjustment: (workspaceId: Id, operationId: Id, assignmentId: Id, date: DateString,
    direction: string, category: string, amountMinor: number, reason: string) =>
    call<Json>("record_adjustment", [workspaceId, operationId, assignmentId, date, direction, category, amountMinor, reason]),
  applyRateChange: (workspaceId: Id, operationId: Id, assignmentId: Id, from: DateString,
    basis: string, rateMinor: number, standardDayMinutes: Nullable<number>, reason: string, confirm: boolean) =>
    call<Json>("apply_rate_change", [workspaceId, operationId, assignmentId, from, basis, rateMinor, standardDayMinutes, reason, confirm]),
  previewRateChange: (workspaceId: Id, assignmentId: Id, from: DateString, basis: string,
    rateMinor: number, standardDayMinutes: Nullable<number>) =>
    call<Json>("preview_rate_change", [workspaceId, assignmentId, from, basis, rateMinor, standardDayMinutes]),
  // Only an explicit account-deletion job may invoke this; never expose it as an API route.
  deleteWorkspaceData: (workspaceId: Id) => call<Json>("delete_workspace_data", [workspaceId]),
};

// Only the public receipt flow may call these with a SHA-256 token digest.
export const shareLinks = {
  open: async (tokenSha256: Buffer, db: Pool = pool): Promise<ShareLinkRow | null> => {
    const result = await db.query<ShareLinkRow>("select * from open_share_link($1::bytea)", [tokenSha256]);
    return result.rows[0] ?? null;
  },
  acknowledge: (tokenSha256: Buffer, kind: string, typedName: Nullable<string>, note: Nullable<string>) =>
    call<Json>("acknowledge_share_link", [tokenSha256, kind, typedName, note]),
};