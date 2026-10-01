import type { RequestHandler } from "express";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;
const MAX_CLIENTS = 10_000;

interface Bucket {
  startedAt: number;
  count: number;
}

export function createAuthRateLimiter(
  now: () => number = Date.now,
  maxClients = MAX_CLIENTS,
): RequestHandler {
  const clients = new Map<string, Bucket>();

  return (req, res, next) => {
    // Do not trust X-Forwarded-For: Express trust proxy remains disabled.
    const ip = req.socket.remoteAddress ?? "unknown";
    const currentTime = now();
    let bucket = clients.get(ip);

    if (bucket && currentTime - bucket.startedAt >= WINDOW_MS) {
      clients.delete(ip);
      bucket = undefined;
    }

    if (!bucket) {
      for (const [address, entry] of clients) {
        if (currentTime - entry.startedAt >= WINDOW_MS) clients.delete(address);
      }
      if (clients.size >= maxClients) {
        res.setHeader("Retry-After", "60");
        res.status(429).json({ error: {
          code: "TOO_MANY_REQUESTS",
          message: "Too many requests",
          correlationId: res.locals.correlationId,
        } });
        return;
      }
      bucket = { startedAt: currentTime, count: 0 };
      clients.set(ip, bucket);
    }

    bucket.count = Math.min(bucket.count + 1, MAX_REQUESTS + 1);
    if (bucket.count > MAX_REQUESTS) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((bucket.startedAt + WINDOW_MS - currentTime) / 1000))));
      res.status(429).json({ error: {
        code: "TOO_MANY_REQUESTS",
        message: "Too many requests",
        correlationId: res.locals.correlationId,
      } });
      return;
    }
    next();
  };
}