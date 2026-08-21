import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type CorrelatedRequest = Request & { correlationId?: string };

export function correlationIdMiddleware(
  request: CorrelatedRequest,
  response: Response,
  next: NextFunction,
): void {
  const incoming = request.header("x-correlation-id");
  const correlationId =
    incoming !== undefined && UUID_PATTERN.test(incoming)
      ? incoming.toLowerCase()
      : randomUUID();

  request.correlationId = correlationId;
  response.setHeader("x-correlation-id", correlationId);
  next();
}
