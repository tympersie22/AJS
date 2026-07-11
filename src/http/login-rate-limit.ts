import { NextFunction, Request, Response } from "express";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const attempts = new Map<string, { count: number; resetAt: number }>();

export function loginRateLimit(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const current = attempts.get(key);
  const entry = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + WINDOW_MS }
    : current;

  if (entry.count >= MAX_ATTEMPTS) {
    res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
    res.status(429).json({ error: "Too many login attempts. Try again in 15 minutes." });
    return;
  }

  res.on("finish", () => {
    if (res.statusCode === 401) {
      const latest = attempts.get(key);
      const failedEntry = !latest || latest.resetAt <= Date.now()
        ? { count: 0, resetAt: Date.now() + WINDOW_MS }
        : latest;
      failedEntry.count += 1;
      attempts.set(key, failedEntry);
      return;
    }

    if (res.statusCode >= 200 && res.statusCode < 300) {
      attempts.delete(key);
    }
  });

  next();
}
