import { BadGatewayException, HttpException, HttpStatus, NotFoundException, UnauthorizedException } from '@nestjs/common';

export type GithubRepository = { id: number; fullName: string; name: string; owner: string; private: boolean; defaultBranch?: string };
export type GithubSelection = { owner: string; repository: string; path: string };
export type GithubIssue = { id: number; nodeId: string; number: number; title: string; state: string; url: string; updatedAt?: string };
export type GithubProject = { id: string; title: string; number: number; url: string; fields: Array<{ id: string; name: string; options?: Array<{ id: string; name: string }> }> };

export class GithubApiError extends Error {
  constructor(readonly code: 'AUTHENTICATION' | 'FORBIDDEN' | 'RATE_LIMIT' | 'NOT_FOUND' | 'VALIDATION' | 'UPSTREAM', readonly status: number, message: string) { super(message); }
}

type GithubResponse = { ok: boolean; status: number; headers: Headers; json(): Promise<unknown>; text(): Promise<string> };

/** Small, mockable GitHub REST client. It deliberately never includes the PAT in errors. */
export class GithubAdapter {
  private readonly baseUrl = (process.env.GITHUB_API_URL ?? 'https://api.github.com').replace(/\/$/, '');
  constructor(private readonly request: (input: string, init?: RequestInit) => Promise<GithubResponse> = (input, init) => fetch(input, init) as unknown as Promise<GithubResponse>) {}

  private async send<T>(token: string, path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
    const response = await this.request(`${this.baseUrl}${path}`, {
      method,
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.ok) return await response.json() as T;
    if (response.status === 401) throw new GithubApiError('AUTHENTICATION', 401, 'Token do GitHub inválido ou revogado');
    if (response.status === 403 && response.headers.get('x-ratelimit-remaining') !== '0') throw new GithubApiError('FORBIDDEN', 403, 'O token do GitHub não tem permissão para esta ação');
    if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') throw new GithubApiError('RATE_LIMIT', 403, 'Limite de requisições do GitHub atingido');
    if (response.status === 404) throw new GithubApiError('NOT_FOUND', 404, 'Fonte do GitHub não encontrada ou sem acesso');
    if (response.status === 422) throw new GithubApiError('VALIDATION', 422, 'O GitHub recusou os campos da issue');
    throw new GithubApiError('UPSTREAM', response.status, 'GitHub não respondeu à solicitação');
  }

  private get<T>(token: string, path: string) { return this.send<T>(token, path, 'GET'); }
  private post<T>(token: string, path: string, body: unknown) { return this.send<T>(token, path, 'POST', body); }

  private async graphql<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
    const graphqlUrl = this.baseUrl.endsWith('/api/v3') ? `${this.baseUrl.slice(0, -7)}/api/graphql` : `${this.baseUrl}/graphql`;
    const response = await this.request(graphqlUrl, { method: 'POST', headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
    const data = await response.json();
    if (!response.ok || (data as any)?.errors?.length) {
      const message = String((data as any)?.errors?.[0]?.message ?? 'GitHub Projects não respondeu à solicitação');
      if (response.status === 401 || response.status === 403) throw new GithubApiError('FORBIDDEN', response.status, 'O token do GitHub não tem permissão para acessar Projects');
      throw new GithubApiError('UPSTREAM', response.status || 502, message);
    }
    return (data as any).data as T;
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

  async createIssue(token: string, owner: string, repository: string, title: string, body: string): Promise<GithubIssue> {
    const row = await this.post<any>(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/issues`, { title, body });
    return { id: Number(row.id), nodeId: String(row.node_id), number: Number(row.number), title: String(row.title), state: String(row.state), url: String(row.html_url), updatedAt: String(row.updated_at ?? '') || undefined };
  }

  async findIssue(token: string, owner: string, repository: string, search: string): Promise<GithubIssue[]> {
    const query = `repo:${owner}/${repository} is:issue -is:pr ${search}`.trim();
    const data = await this.get<any>(token, `/search/issues?q=${encodeURIComponent(query)}&per_page=30&sort=updated&order=desc`);
    return (data.items ?? []).map((row: any) => ({ id: Number(row.id), nodeId: String(row.node_id), number: Number(row.number), title: String(row.title), state: String(row.state), url: String(row.html_url), updatedAt: String(row.updated_at ?? '') || undefined }));
  }

  async getIssue(token: string, owner: string, repository: string, number: number): Promise<GithubIssue> {
    const row = await this.get<any>(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/issues/${number}`);
    if (row.pull_request) throw new GithubApiError('NOT_FOUND', 404, 'O item selecionado é um pull request, não uma issue');
    return { id: Number(row.id), nodeId: String(row.node_id), number: Number(row.number), title: String(row.title), state: String(row.state), url: String(row.html_url), updatedAt: String(row.updated_at ?? '') || undefined };
  }

  async projects(token: string, owner: string): Promise<GithubProject[]> {
    const query = `query($owner:String!){user(login:$owner){projectsV2(first:100){nodes{id title number url fields(first:100){nodes{__typename ... on ProjectV2FieldCommon{id name} ... on ProjectV2SingleSelectField{id name options{id name}}}}}}} organization(login:$owner){projectsV2(first:100){nodes{id title number url fields(first:100){nodes{__typename ... on ProjectV2FieldCommon{id name} ... on ProjectV2SingleSelectField{id name options{id name}}}}}}}}`;
    const data = await this.graphql<any>(token, query, { owner });
    const nodes = data?.user?.projectsV2?.nodes ?? data?.organization?.projectsV2?.nodes ?? [];
    return nodes.map((row: any) => ({ id: String(row.id), title: String(row.title), number: Number(row.number), url: String(row.url), fields: (row.fields?.nodes ?? []).map((field: any) => ({ id: String(field.id), name: String(field.name), options: field.__typename === 'ProjectV2SingleSelectField' ? (field.options ?? []).map((option: any) => ({ id: String(option.id), name: String(option.name) })) : undefined })) }));
  }

  async addIssueToProject(token: string, projectId: string, issueNodeId: string, field?: { id: string; optionId: string }) {
    const added = await this.graphql<any>(token, `mutation($project:ID!,$content:ID!){addProjectV2ItemById(input:{projectId:$project,contentId:$content}){item{id}}}`, { project: projectId, content: issueNodeId });
    const itemId = String(added.addProjectV2ItemById.item.id);
    if (field) await this.graphql<any>(token, `mutation($project:ID!,$item:ID!,$field:ID!,$option:String!){updateProjectV2ItemFieldValue(input:{projectId:$project,itemId:$item,fieldId:$field,value:{singleSelectOptionId:$option}}){projectV2Item{id}}}`, { project: projectId, item: itemId, field: field.id, option: field.optionId });
    return { itemId };
  }
}

export function mapGithubError(error: unknown): never {
  if (!(error instanceof GithubApiError)) throw new BadGatewayException('Falha ao consultar o GitHub');
  if (error.code === 'AUTHENTICATION') throw new UnauthorizedException(error.message);
  if (error.code === 'FORBIDDEN') throw new HttpException(error.message, HttpStatus.FORBIDDEN);
  if (error.code === 'RATE_LIMIT') throw new HttpException(error.message, HttpStatus.TOO_MANY_REQUESTS);
  if (error.code === 'NOT_FOUND') throw new NotFoundException(error.message);
  if (error.code === 'VALIDATION') throw new HttpException(error.message, HttpStatus.UNPROCESSABLE_ENTITY);
  throw new BadGatewayException(error.message);
}
