import {
  HttpStatus,
  ValidationPipe,
  VersioningType,
  type INestApplication,
} from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";

import { correlationIdMiddleware } from "./common/http/correlation-id.middleware";
import { ApplicationError } from "./common/errors/application-error";
import { securityHeadersMiddleware } from "./common/http/security-headers.middleware";
import { setupOpenApi } from "./openapi/openapi";
import { PROFILE_PHOTO_MAX_BYTES } from "./profile/profile-photo";

export function configureApplication(app: INestApplication): void {
  app.use(securityHeadersMiddleware);
  app.use(correlationIdMiddleware);
  // Solo la fotografía de perfil viaja como binario; el resto sigue en JSON.
  if ("useBodyParser" in app) {
    (app as NestExpressApplication).useBodyParser("raw", {
      type: "image/jpeg",
      limit: PROFILE_PHOTO_MAX_BYTES,
    });
  }
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
      exceptionFactory: (errors) =>
        new ApplicationError(
          HttpStatus.BAD_REQUEST,
          "VALIDATION_FAILED",
          errors.flatMap((error) => Object.values(error.constraints ?? {})),
        ),
    }),
  );
  app.setGlobalPrefix("api");
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: "1",
  });
  setupOpenApi(app);
}
