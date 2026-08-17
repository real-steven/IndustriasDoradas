import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import {
  ACCESS_TOKEN_VERIFIER,
  PROFILE_REPOSITORY,
  type AccessTokenVerifier,
  type ProfileRepository,
} from "./auth.contracts";
import { IS_PUBLIC_KEY } from "./auth.metadata";
import type { AuthenticatedRequest } from "./authenticated-request";

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ACCESS_TOKEN_VERIFIER)
    private readonly tokenVerifier: AccessTokenVerifier,
    @Inject(PROFILE_REPOSITORY)
    private readonly profiles: ProfileRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = await this.tokenVerifier.verify(
      this.extractBearerToken(request.headers.authorization),
    );
    const profile = await this.profiles.findByAuthUserId(token.subject);

    if (profile === null) {
      throw new ForbiddenException("Authenticated account has no profile");
    }

    if (
      profile.accountStatus !== "ACTIVE" ||
      !profile.isActive ||
      !profile.role.isActive
    ) {
      throw new ForbiddenException("Account is not active");
    }

    request.auth = { token, profile };
    return true;
  }

  private extractBearerToken(authorization: string | undefined): string {
    if (authorization === undefined) {
      throw new UnauthorizedException("Authentication required");
    }

    const parts = authorization.trim().split(/\s+/u);
    if (
      parts.length !== 2 ||
      parts[0]?.toLowerCase() !== "bearer" ||
      parts[1] === undefined ||
      parts[1] === ""
    ) {
      throw new UnauthorizedException("Invalid authorization header");
    }

    return parts[1];
  }
}
