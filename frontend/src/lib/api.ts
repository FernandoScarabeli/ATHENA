export class ApiError extends Error {
  constructor(message: string, readonly code = 'REQUEST_FAILED', readonly details?: unknown, readonly status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(body?.error?.message ?? 'Não foi possível concluir a operação.', body?.error?.code, body?.error?.details, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
