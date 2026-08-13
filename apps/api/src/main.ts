import 'reflect-metadata';

import { ConsoleLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { configureApplication } from './app.setup';
import type { EnvironmentVariables } from './config/environment';

const logger = new ConsoleLogger({
  colors: false,
  json: true,
});

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger });
  configureApplication(app);

  const config = app.get(ConfigService<EnvironmentVariables, true>);
  const port = config.get('PORT', { infer: true });

  await app.listen(port);
}

void bootstrap().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Unknown application startup error';

  logger.error({ event: 'startup_failed', message });
  process.exitCode = 1;
});
