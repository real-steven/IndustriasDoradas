import { HealthService } from './health.service';

describe('HealthService', () => {
  it('returns the API health status', () => {
    const result = new HealthService().getStatus();

    expect(result).toMatchObject({
      status: 'ok',
      service: 'industrias-doradas-api',
    });
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });
});
