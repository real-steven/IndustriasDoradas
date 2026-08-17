import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";

import { AuthenticationGuard } from "./auth/authentication.guard";
import { AuthModule } from "./auth/auth.module";
import { AuthorizationGuard } from "./auth/authorization.guard";
import { AllExceptionsFilter } from "./common/http/all-exceptions.filter";
import { validateEnvironment } from "./config/environment";
import { HealthModule } from "./health/health.module";

const nodeEnvironment = process.env.NODE_ENV;
const environmentFiles = nodeEnvironment
  ? [
      `.env.${nodeEnvironment}.local`,
      `.env.${nodeEnvironment}`,
      ".env.local",
      ".env",
    ]
  : [".env.local", ".env"];

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: environmentFiles,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    AuthModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_GUARD,
      useClass: AuthenticationGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AuthorizationGuard,
    },
  ],
})
export class AppModule {}
