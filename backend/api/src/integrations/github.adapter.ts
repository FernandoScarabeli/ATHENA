import { BadGatewayException, HttpException, HttpStatus, NotFoundException, UnauthorizedException } from '@nestjs/common';

export type GithubRepository = { id: number; fullName: string; name: string; owner: string; private: boolean; defaultBranch?: string };
export type GithubSelection = { owner: string; repository: string; path: string };

export class GithubApiError extends Error {
  constructor(readonly code: 'AUTHENTICATION' | 'RATE_LIMIT' | 'NOT_FOUND' | 'UPSTREAM', readonly status: number, message: string) { super(message); }
}

type GithubResponse = { ok: boolean; status: number; headers: Headers; json(): Promise<unknown>; text(): Promise<string> };

/** Small, mockable GitHub REST client. It deliberately never includes the PAT in errors. */
export class GithubAdapter {
  private readonly baseUrl = (process.env.GITHUB_API_URL ?? 'https://api.github.com').replace(/\/$/, '');
  constructor(private readonly request: (input: string, init?: RequestInit) => Promise<GithubResponse> = (input, init) => fetch(input, init) as unknown as Promise<GithubResponse>) {}

  private async get<T>(token: string, path: string): Promise<T> {
    const response = await this.request(`${this.baseUrl}${path}`, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (response.ok) return await response.json() as T;
    if (response.status === 401) throw new GithubApiError('AUTHENTICATION', 401, 'Token do GitHub inválido ou revogado');
    if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') throw new GithubApiError('RATE_LIMIT', 403, 'Limite de requisições do GitHub atingido');
    if (response.status === 404) throw new GithubApiError('NOT_FOUND', 404, 'Fonte do GitHub não encontrada ou sem acesso');
    throw new GithubApiError('UPSTREAM', response.status, 'GitHub não respondeu à solicitação');
  }

  async validateAccount(token: string): Promise<{ login: string; id: number }> { return this.get(token, '/user'); }

  async listRepositories(token: string, startPage = 1, maxPages = 20): Promise<GithubRepository[]> {
    const result: GithubRepository[] = [];
    for (let page = startPage; page < startPage + maxPages; page++) {
      const rows = await this.get<Array<any>>(token, `/user/repos?visibility=all&sort=updated&per_page=100&page=${page}`);
      for (const row of rows) result.push({ id: Number(row.id), fullName: String(row.full_name), name: String(row.name), owner: String(row.owner?.login ?? ''), private: Boolean(row.private), defaultBranch: row.default_branch ? String(row.default_branch) : undefined });
      if (rows.length < 100) break;
    }
    return result;
  }

  async readSource(token: string, selection: GithubSelection): Promise<{ title: string; content: string; sha?: string }> {
    const owner = encodeURIComponent(selection.owner); const repository = encodeURIComponent(selection.repository);
    const path = selection.path.split('/').map(encodeURIComponent).join('/');
    const row = await this.get<any>(token, `/repos/${owner}/${repository}/contents/${path}`);
    if (Array.isArray(row) || row.type !== 'file' || typeof row.content !== 'string') throw new GithubApiError('NOT_FOUND', 404, 'A fonte selecionada não é um arquivo legível');
    let content: string;
    try { content = Buffer.from(row.content.replace(/\s/g, ''), 'base64').toString('utf8'); }
    catch { throw new GithubApiError('UPSTREAM', 502, 'Conteúdo do arquivo do GitHub é inválido'); }
    return { title: String(row.name ?? selection.path.split('/').pop() ?? selection.path), content, sha: row.sha ? String(row.sha) : undefined };
  }
}

export function mapGithubError(error: unknown): never {
  if (!(error instanceof GithubApiError)) throw new BadGatewayException('Falha ao consultar o GitHub');
  if (error.code === 'AUTHENTICATION') throw new UnauthorizedException(error.message);
  if (error.code === 'RATE_LIMIT') throw new HttpException(error.message, HttpStatus.TOO_MANY_REQUESTS);
  if (error.code === 'NOT_FOUND') throw new NotFoundException(error.message);
  throw new BadGatewayException(error.message);
}
