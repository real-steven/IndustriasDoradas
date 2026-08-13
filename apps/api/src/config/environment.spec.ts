import { validateEnvironment } from './environment';

describe('validateEnvironment', () => {
  it('normalizes a valid configuration', () => {
    expect(
      validateEnvironment({ NODE_ENV: 'test', PORT: '3100' }),
    ).toMatchObject({
      NODE_ENV: 'test',
      PORT: 3100,
    });
  });

  it('reports every missing mandatory variable', () => {
    expect(() => validateEnvironment({})).toThrow(
      'Invalid environment configuration: NODE_ENV is required; PORT is required',
    );
  });

  it('rejects an invalid port without echoing its value', () => {
    expect(() =>
      validateEnvironment({ NODE_ENV: 'development', PORT: 'secret-value' }),
    ).toThrow('PORT must be an integer between 1 and 65535');
  });
});
