import type { RequestHandler } from "express";

export function invitationLimiter(limit: number, byUser = false): RequestHandler {
  const windows = new Map<string, { start: number; count: number }>();
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, value] of windows) if (now - value.start >= 60000) windows.delete(key);
    const key = byUser ? req.ctx!.userId : req.ip ?? "<unknown>";
    const window = windows.get(key) ?? { start: now, count: 0 };
    window.count++;
    windows.set(key, window);
    if (window.count > limit) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((window.start + 60000 - now) / 1000))));
      res.status(429).json({ error: { code: "TOO_MANY", message: "Too many attempts. Try again later.", correlationId: res.locals.correlationId } });
      return;
    }
    next();
  };
}