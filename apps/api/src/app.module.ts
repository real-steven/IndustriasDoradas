import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER } from "@nestjs/core";

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
    HealthModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
