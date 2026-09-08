import type { RequestHandler } from "express";

export const securityHeadersMiddleware: RequestHandler = (
  request,
  response,
  next,
) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");

  if (request.path.startsWith("/api/v1/")) {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Pragma", "no-cache");
    response.setHeader("Expires", "0");
  }

  next();
};
