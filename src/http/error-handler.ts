import { NextFunction, Request, Response } from "express";

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof SyntaxError && "status" in error && error.status === 400) {
    res.status(400).json({ error: "Malformed JSON request body" });
    return;
  }

  console.error("Request failed", error);
  res.status(500).json({ error: "Internal server error" });
}
