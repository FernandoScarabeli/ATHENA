import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export type OpenProjectCredentials = { instanceUrl: string; apiToken: string };
export type OpenProjectProject = { id: number; name: string; identifier?: string; url: string };
export type OpenProjectType = { id: number; name: string; url: string };
export type OpenProjectArtifact = { id: number; subject: string; status?: string; url: string; updatedAt?: string; projectId?: number; typeId?: number };
export type OpenProjectField = { key: string; name: string; type?: string; required?: boolean; hasDefault?: boolean; allowedValues?: Array<{ id?: string | number; name?: string; href?: string }> };
type JsonResponse = { ok: boolean; status: number; headers: Headers; json(): Promise<any>; text(): Promise<string> };

export class OpenProjectApiError extends Error {
  constructor(readonly code: 'AUTHENTICATION' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION' | 'UNSAFE_HOST' | 'NETWORK' | 'UPSTREAM', readonly status: number, message: string, readonly fields?: Record<string, string>) { super(message); }
}

const privateIpv4 = (value: string) => {
  const octets = value.split('.').map(Number);
  if (octets.length !== 4 || octets.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
};

function normalizedBase(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new OpenProjectApiError('UNSAFE_HOST', 400, 'URL do OpenProject inválida'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new OpenProjectApiError('UNSAFE_HOST', 400, 'Use a URL base HTTPS da instância OpenProject');
  return url;
}

export class OpenProjectAdapter {
  constructor(
    private readonly request: (input: string, init?: RequestInit) => Promise<JsonResponse> = (input, init) => fetch(input, init) as unknown as Promise<JsonResponse>,
    private readonly resolve: (hostname: string) => Promise<Array<{ address: string; family: number }>> = async hostname => lookup(hostname, { all: true, verbatim: true }),
  ) {}

  private async safeUrl(value: string) {
    const url = normalizedBase(value);
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) throw new OpenProjectApiError('UNSAFE_HOST', 400, 'Use uma instância OpenProject pública acessível por HTTPS');
    const ipFamily = isIP(host);
    if (ipFamily === 4 && privateIpv4(host)) throw new OpenProjectApiError('UNSAFE_HOST', 400, 'Use uma instância OpenProject pública acessível por HTTPS');
    if (ipFamily === 6 && (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:'))) throw new OpenProjectApiError('UNSAFE_HOST', 400, 'Use uma instância OpenProject pública acessível por HTTPS');
    if (!ipFamily) {
      let addresses: Array<{ address: string; family: number }>;
      try { addresses = await this.resolve(host); }
      catch { throw new OpenProjectApiError('NETWORK', 502, 'Não foi possível resolver o endereço da instância OpenProject'); }
      if (!addresses.length || addresses.some(row => row.family === 4 ? privateIpv4(row.address) : row.address === '::1' || row.address.toLowerCase().startsWith('fc') || row.address.toLowerCase().startsWith('fd') || row.address.toLowerCase().startsWith('fe80:'))) {
        throw new OpenProjectApiError('UNSAFE_HOST', 400, 'Use uma instância OpenProject pública acessível por HTTPS');
      }
    }
    return url;
  }

  private auth(credentials: OpenProjectCredentials) { return `Basic ${Buffer.from(`apikey:${credentials.apiToken}`).toString('base64')}`; }

  private async json(credentials: OpenProjectCredentials, path: string, method = 'GET', body?: unknown) {
    const base = await this.safeUrl(credentials.instanceUrl);
    const requested = new URL(path, base);
    if (requested.origin !== base.origin || !requested.pathname.startsWith('/api/v3/')) throw new OpenProjectApiError('UNSAFE_HOST', 400, 'Link da API OpenProject inválido');
    let response: JsonResponse;
    try {
      response = await this.request(requested.toString(), { method, redirect: 'manual', headers: { Accept: 'application/hal+json, application/json', Authorization: this.auth(credentials), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch { throw new OpenProjectApiError('NETWORK', 502, 'Não foi possível alcançar a instância OpenProject a partir do ATHENA'); }
    if (response.status >= 300 && response.status < 400) throw new OpenProjectApiError('UNSAFE_HOST', 502, 'A instância redirecionou a solicitação; use a URL HTTPS canônica');
    if (!response.ok) {
      if (response.status === 401) throw new OpenProjectApiError('AUTHENTICATION', 401, 'Token do OpenProject inválido ou revogado');
      if (response.status === 403) throw new OpenProjectApiError('FORBIDDEN', 403, 'O usuário do OpenProject não tem permissão neste projeto');
      if (response.status === 404) throw new OpenProjectApiError('NOT_FOUND', 404, 'Recurso do OpenProject não encontrado ou sem acesso');
      const detail = response.status === 422 ? await response.json().catch(() => null) : null;
      if (response.status === 422) throw new OpenProjectApiError('VALIDATION', 422, 'O OpenProject rejeitou os campos da tarefa', detail?._embedded?.validationErrors ?? undefined);
      throw new OpenProjectApiError('UPSTREAM', response.status, 'OpenProject não respondeu à solicitação');
    }
    return response.json();
  }

  async validateConnection(credentials: OpenProjectCredentials) {
    const user = await this.json(credentials, '/api/v3/users/me');
    return { account: String(user.name ?? user.login ?? user.id ?? 'OpenProject') };
  }

  async projects(credentials: OpenProjectCredentials): Promise<OpenProjectProject[]> {
    const result: OpenProjectProject[] = [];
    let href = '/api/v3/projects?pageSize=100';
    for (let page = 0; href && page < 20; page += 1) {
      const data = await this.json(credentials, href);
      for (const row of data?._embedded?.elements ?? []) result.push({ id: Number(row.id), name: String(row.name ?? row.identifier ?? row.id), identifier: row.identifier ? String(row.identifier) : undefined, url: String(row._links?.self?.href ?? '') });
      href = data?._links?.nextByOffset?.href ?? '';
    }
    return result;
  }

  async types(credentials: OpenProjectCredentials, projectId: number): Promise<OpenProjectType[]> {
    const data = await this.json(credentials, `/api/v3/projects/${projectId}/types`);
    return (data?._embedded?.elements ?? []).map((row: any) => ({ id: Number(row.id), name: String(row.name), url: String(row._links?.self?.href ?? `/api/v3/types/${row.id}`) }));
  }

  async form(credentials: OpenProjectCredentials, payload: Record<string, unknown>) {
    const data = await this.json(credentials, '/api/v3/work_packages/form', 'POST', payload);
    const schema = data?._embedded?.schema ?? {};
    const fields: OpenProjectField[] = Object.entries(schema).map(([key, raw]: [string, any]) => ({
      key,
      name: String(raw.name ?? key),
      type: raw.type ? String(raw.type) : undefined,
      required: Boolean(raw.required),
      hasDefault: Boolean(raw.hasDefault),
      allowedValues: Array.isArray(raw._embedded?.allowedValues) ? raw._embedded.allowedValues.map((value: any) => ({ id: value.id, name: value.name, href: value._links?.self?.href })) : undefined,
    }));
    return { payload: data?._embedded?.payload ?? payload, fields, validationErrors: data?._embedded?.validationErrors ?? {}, commitHref: data?._links?.commit?.href as string | undefined };
  }

  async createWorkPackage(credentials: OpenProjectCredentials, payload: Record<string, unknown>) {
    const form = await this.form(credentials, payload);
    if (Object.keys(form.validationErrors).length || !form.commitHref) {
      const errors = Object.fromEntries(Object.entries(form.validationErrors).map(([key, value]: [string, any]) => [key, String(value?.message ?? value?._embedded?.errors?.[0]?.message ?? 'Campo obrigatório ou inválido')]));
      throw new OpenProjectApiError('VALIDATION', 400, 'Preencha os campos obrigatórios para este tipo de work package', errors);
    }
    const created = await this.json(credentials, form.commitHref, 'POST', form.payload);
    return this.toArtifact(created);
  }

  async searchWorkPackages(credentials: OpenProjectCredentials, projectId: number, search: string) {
    const filters = encodeURIComponent(JSON.stringify([{ project: { operator: '=', values: [String(projectId)] } }, { subject: { operator: '~', values: [search] } }]));
    const data = await this.json(credentials, `/api/v3/work_packages?filters=${filters}&pageSize=50`);
    return (data?._embedded?.elements ?? []).map((row: any) => this.toArtifact(row));
  }

  async getWorkPackage(credentials: OpenProjectCredentials, id: number) { return this.toArtifact(await this.json(credentials, `/api/v3/work_packages/${id}`)); }

  private toArtifact(row: any): OpenProjectArtifact {
    return { id: Number(row.id), subject: String(row.subject ?? 'Work package'), status: row._links?.status?.title ? String(row._links.status.title) : undefined, url: String(row._links?.html?.href ?? row._links?.self?.href ?? ''), updatedAt: row.updatedAt ? String(row.updatedAt) : undefined, projectId: Number(row._links?.project?.href?.split('/').pop()) || undefined, typeId: Number(row._links?.type?.href?.split('/').pop()) || undefined };
  }
}

export function mapOpenProjectError(error: unknown): never {
  if (error instanceof OpenProjectApiError) throw error;
  throw new OpenProjectApiError('UPSTREAM', 502, 'Falha ao consultar OpenProject');
}
