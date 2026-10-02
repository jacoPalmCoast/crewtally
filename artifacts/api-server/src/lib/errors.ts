import { ZodError } from "zod";

const states: Record<string, { status: number; code: string; message: string }> = {
  AUTH_INVALID_INPUT: { status: 422, code: "INVALID_INPUT", message: "Invalid input" },
  INVITATIONS_UNAVAILABLE: { status: 503, code: "INVITATIONS_UNAVAILABLE", message: "Invitations are temporarily unavailable" },
  CT404: { status: 404, code: "NOT_FOUND", message: "Not found" },
  CT403: { status: 403, code: "FORBIDDEN", message: "Not allowed" },
  CT409: { status: 409, code: "CONFLICT", message: "Request conflicts with the current record" },
  CT410: { status: 410, code: "INVITATION_NOT_AVAILABLE", message: "This invitation isn't available. Ask for a new one." },
  CT429: { status: 429, code: "TOO_MANY", message: "Too many attempts. Try again later." },
  OPERATION_REUSED: { status: 409, code: "OPERATION_REUSED", message: "Operation already used for a different request" },
  INVITATION_NOT_AVAILABLE: { status: 410, code: "INVITATION_NOT_AVAILABLE", message: "This invitation isn't available. Ask for a new one." },
  INVITATION_CODE_WRONG: { status: 400, code: "INVITATION_CODE_WRONG", message: "That code didn't work. Check the email address and the code, or ask for a new invitation." },
  P0002: { status: 404, code: "NOT_FOUND", message: "Not found" },
  "40001": { status: 409, code: "CONFLICT", message: "Request conflicts with the current record" },
  "55000": { status: 409, code: "CONFIRMATION_REQUIRED", message: "Confirmation required" },
  "22023": { status: 400, code: "INVALID", message: "Invalid input" },
  "23505": { status: 409, code: "CONFLICT", message: "Record already exists" },
  "23503": { status: 404, code: "NOT_FOUND", message: "Not found" },
  "23514": { status: 422, code: "ROLE_DOES_NOT_FIT", message: "Role does not fit this workspace" },
};

export function mapError(error: unknown) {
  if (error instanceof ZodError) return { status: 400, code: "INVALID", message: "Invalid input" };
  const type = error && typeof error === "object" && "type" in error ? error.type : null;
  if (type === "entity.too.large") return { status: 413, code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" };
  if (type === "entity.parse.failed") return { status: 400, code: "INVALID_JSON", message: "Invalid JSON body" };
  const state = error && typeof error === "object" && "code" in error ? error.code : null;
  if (state === "22023" && error instanceof Error && error.message === "WORKER_RECORD_REQUIRED") {
    return { status: 400, code: "WORKER_RECORD_REQUIRED", message: "Worker record required" };
  }
  return (typeof state === "string" && states[state]) || {
    status: 500, code: "INTERNAL_ERROR", message: "An unexpected error occurred",
  };
}