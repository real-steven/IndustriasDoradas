import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/app.setup';

describe('API smoke (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = testingModule.createNestApplication();
    configureApplication(app);
    await app.init();
    httpServer = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health reports a healthy API', async () => {
    const response = await request(httpServer)
      .get('/api/v1/health')
      .expect(200);
    const body = response.body as Record<string, unknown>;

    expect(body).toMatchObject({
      status: 'ok',
      service: 'industrias-doradas-api',
    });
    expect(Number.isNaN(Date.parse(body.timestamp as string))).toBe(false);
  });

  it('uses the uniform error contract', async () => {
    const response = await request(httpServer)
      .get('/api/v1/does-not-exist')
      .expect(404);
    const body = response.body as Record<string, unknown>;

    expect(body).toMatchObject({
      statusCode: 404,
      code: 'HTTP_404',
      message: 'Cannot GET /api/v1/does-not-exist',
      path: '/api/v1/does-not-exist',
    });
    expect(Number.isNaN(Date.parse(body.timestamp as string))).toBe(false);
  });
});
