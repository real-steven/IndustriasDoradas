import type { Request } from "express";

import type { AuthenticatedContext } from "./auth.contracts";
import type { CorrelatedRequest } from "../common/http/correlation-id.middleware";

export type AuthenticatedRequest = Request &
  CorrelatedRequest & {
    auth?: AuthenticatedContext;
  };
