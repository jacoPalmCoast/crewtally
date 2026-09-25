import { ZodError } from "zod";

const states: Record<string, { status: number; code: string; message: string }> = {
  P0002: { status: 404, code: "NOT_FOUND", message: "Not found" },
  "40001": { status: 409, code: "CONFLICT", message: "Request conflicts with the current record" },
  "55000": { status: 409, code: "CONFIRMATION_REQUIRED", message: "Confirmation required" },
  "22023": { status: 422, code: "INVALID_INPUT", message: "Invalid input" },
  "23505": { status: 409, code: "CONFLICT", message: "Record already exists" },
  "23503": { status: 404, code: "NOT_FOUND", message: "Not found" },
  "23514": { status: 422, code: "INVALID_INPUT", message: "Invalid input" },
};

export function mapError(error: unknown) {
  if (error instanceof ZodError) return { status: 422, code: "INVALID_INPUT", message: "Invalid input" };
  const state = error && typeof error === "object" && "code" in error ? error.code : null;
  return (typeof state === "string" && states[state]) || {
    status: 500, code: "INTERNAL_ERROR", message: "An unexpected error occurred",
  };
}