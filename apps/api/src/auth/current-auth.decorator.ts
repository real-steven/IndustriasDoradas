import {
  createParamDecorator,
  type ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";

import type { AuthenticatedContext } from "./auth.contracts";
import type { AuthenticatedRequest } from "./authenticated-request";

export const CurrentAuth = createParamDecorator<never, AuthenticatedContext>(
  (_data, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (request.auth === undefined) {
      throw new UnauthorizedException("Authentication required");
    }

    return request.auth;
  },
);
