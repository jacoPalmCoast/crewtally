import type { RequestHandler } from "express";
import type { ZodType } from "zod";

export function validate<T>(schema: ZodType<T>, source: "body" | "query" | "params" = "body"): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) return next(result.error);
    if (source === "body") req.body = result.data;
    next();
  };
}