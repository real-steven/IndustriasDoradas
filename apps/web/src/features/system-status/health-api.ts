export interface HealthResponse {
  status: 'ok';
  service: string;
  timestamp: string;
}

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch('/api/v1/health', {
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`La API respondió con el estado HTTP ${response.status}.`);
  }

  const body: unknown = await response.json();

  if (!isHealthResponse(body)) {
    throw new Error('La API respondió con un formato de health inválido.');
  }

  return body;
}

function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return (
    'status' in value &&
    value.status === 'ok' &&
    'service' in value &&
    typeof value.service === 'string' &&
    'timestamp' in value &&
    typeof value.timestamp === 'string' &&
    !Number.isNaN(Date.parse(value.timestamp))
  );
}
