const ALLOWED_NODE_ENVIRONMENTS = [
  'development',
  'test',
  'production',
] as const;

export type NodeEnvironment = (typeof ALLOWED_NODE_ENVIRONMENTS)[number];

export interface EnvironmentVariables {
  NODE_ENV: NodeEnvironment;
  PORT: number;
}

export function validateEnvironment(
  input: Record<string, unknown>,
): Record<string, unknown> & EnvironmentVariables {
  const errors: string[] = [];
  const nodeEnvironment = parseNodeEnvironment(input.NODE_ENV, errors);
  const port = parsePort(input.PORT, errors);

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration: ${errors.join('; ')}`);
  }

  return {
    ...input,
    NODE_ENV: nodeEnvironment as NodeEnvironment,
    PORT: port as number,
  };
}

function parseNodeEnvironment(
  value: unknown,
  errors: string[],
): NodeEnvironment | undefined {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push('NODE_ENV is required');
    return undefined;
  }

  if (!ALLOWED_NODE_ENVIRONMENTS.includes(value as NodeEnvironment)) {
    errors.push(
      `NODE_ENV must be one of: ${ALLOWED_NODE_ENVIRONMENTS.join(', ')}`,
    );
    return undefined;
  }

  return value as NodeEnvironment;
}

function parsePort(value: unknown, errors: string[]): number | undefined {
  if (value === undefined || value === null || value === '') {
    errors.push('PORT is required');
    return undefined;
  }

  const port = typeof value === 'number' ? value : Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    errors.push('PORT must be an integer between 1 and 65535');
    return undefined;
  }

  return port;
}
