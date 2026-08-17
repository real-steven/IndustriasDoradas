import type { Request } from "express";

import type { AuthenticatedContext } from "./auth.contracts";

export type AuthenticatedRequest = Request & {
  auth?: AuthenticatedContext;
};
