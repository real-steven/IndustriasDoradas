import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  Req,
} from "@nestjs/common";

import {
  EmailChangeDto,
  StationPhoneDto,
  UpdateOwnProfileDto,
} from "./profile.dto";
import { ProfileService, type RequestMeta } from "./profile.service";
import { RequireOrganizationParam, RequireRoles } from "../auth/auth.metadata";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import type { AuthenticatedContext } from "../auth/auth.contracts";
import { ApplicationError } from "../common/errors/application-error";

function context(request: AuthenticatedRequest): {
  auth: AuthenticatedContext;
  meta: RequestMeta;
} {
  if (request.auth === undefined || request.correlationId === undefined)
    throw new Error("Authenticated request context is missing");
  return {
    auth: request.auth,
    meta: {
      correlationId: request.correlationId,
      method: request.method,
      path: request.path,
    },
  };
}

@Controller({ path: "me/profile", version: "1" })
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Get()
  @RequireRoles("JEFE_EMPRESA", "JEFE_PLANTA")
  get(@Req() request: AuthenticatedRequest) {
    const { auth, meta } = context(request);
    return this.profiles.view(auth, meta);
  }

  @Patch()
  @RequireRoles("JEFE_EMPRESA")
  update(
    @Body() body: UpdateOwnProfileDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const { auth, meta } = context(request);
    return this.profiles.updateOwn(
      auth,
      {
        ...(body.displayName === undefined
          ? {}
          : { displayName: body.displayName }),
        ...(body.phone === undefined ? {} : { phone: body.phone }),
      },
      meta,
    );
  }

  @Put("email")
  @RequireRoles("JEFE_EMPRESA")
  requestEmailChange(
    @Body() body: EmailChangeDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const { auth, meta } = context(request);
    const header = request.headers.authorization ?? "";
    const accessToken = header.startsWith("Bearer ") ? header.slice(7) : "";
    return this.profiles.requestEmailChange(
      auth,
      accessToken,
      {
        email: body.email,
        ...(body.redirectTo === undefined
          ? {}
          : { redirectTo: body.redirectTo }),
      },
      meta,
    );
  }

  /** Cuerpo binario `image/jpeg` ya redimensionado por el navegador. */
  @Put("photo")
  @RequireRoles("JEFE_EMPRESA")
  replacePhoto(@Req() request: AuthenticatedRequest) {
    const { auth, meta } = context(request);
    const body: unknown = request.body;
    if (!request.is("image/jpeg") || !Buffer.isBuffer(body)) {
      throw new ApplicationError(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        "PHOTO_NOT_JPEG",
        "The photo must be sent as image/jpeg",
      );
    }
    return this.profiles.replacePhoto(auth, body, meta);
  }

  @Delete("photo")
  @RequireRoles("JEFE_EMPRESA")
  removePhoto(@Req() request: AuthenticatedRequest) {
    const { auth, meta } = context(request);
    return this.profiles.removePhoto(auth, meta);
  }
}

@Controller({
  path: "organizations/:organizationId/stations/:stationId/profile",
  version: "1",
})
@RequireOrganizationParam()
@RequireRoles("JEFE_PLANTA")
export class StationProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Put("phone")
  updatePhone(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("stationId", ParseUUIDPipe) stationId: string,
    @Body() body: StationPhoneDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const { auth, meta } = context(request);
    return this.profiles.updatePhoneFromStation(
      auth,
      organizationId,
      stationId,
      { phone: body.phone, pin: body.pin },
      meta,
    );
  }
}
