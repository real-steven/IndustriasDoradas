import {
  HttpStatus,
  ValidationPipe,
  VersioningType,
  type INestApplication,
} from "@nestjs/common";

import { correlationIdMiddleware } from "./common/http/correlation-id.middleware";
import { ApplicationError } from "./common/errors/application-error";
import { securityHeadersMiddleware } from "./common/http/security-headers.middleware";
import { setupOpenApi } from "./openapi/openapi";

export function configureApplication(app: INestApplication): void {
  app.use(securityHeadersMiddleware);
  app.use(correlationIdMiddleware);
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
