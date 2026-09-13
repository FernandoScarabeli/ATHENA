import { GithubAdapter, GithubApiError } from '../src/integrations/github.adapter';

function response(status: number, body: unknown, headers: Record<string, string> = {}): any { return { ok: status >= 200 && status < 300, status, headers: new Headers(headers), json: jest.fn().mockResolvedValue(body), text: jest.fn().mockResolvedValue(JSON.stringify(body)) }; }

describe('GithubAdapter', () => {
  it('validates account, follows repository pagination and decodes selected file', async () => {
    const request = jest.fn()
      .mockResolvedValueOnce(response(200, { login: 'athena', id: 7 }))
      .mockResolvedValueOnce(response(200, Array.from({ length: 100 }, (_, i) => ({ id: i, full_name: `acme/r${i}`, name: `r${i}`, owner: { login: 'acme' }, private: false }))))
      .mockResolvedValueOnce(response(200, [{ id: 101, full_name: 'acme/last', name: 'last', owner: { login: 'acme' }, private: true }]))
      .mockResolvedValueOnce(response(200, { type: 'file', name: 'README.md', sha: 'abc', content: Buffer.from('# hello').toString('base64') }));
    const adapter = new GithubAdapter(request);
    await expect(adapter.validateAccount('pat-never-logged')).resolves.toEqual({ login: 'athena', id: 7 });
    await expect(adapter.listRepositories('pat-never-logged')).resolves.toHaveLength(101);
    await expect(adapter.readSource('pat-never-logged', { owner: 'acme', repository: 'last', path: 'README.md' })).resolves.toMatchObject({ content: '# hello', sha: 'abc' });
    expect(request.mock.calls[3][0]).toContain('/repos/acme/last/contents/README.md');
    expect(request.mock.calls[0][1].headers.Authorization).toBe('Bearer pat-never-logged');
  });

  it.each([[401, 'AUTHENTICATION'], [404, 'NOT_FOUND'], [403, 'RATE_LIMIT']] as const)('maps GitHub status %s without secret', async (status, code) => {
    const headers: Record<string, string> = code === 'RATE_LIMIT' ? { 'x-ratelimit-remaining': '0' } : {};
    const adapter = new GithubAdapter(jest.fn().mockResolvedValue(response(status, {}, headers)));
    const error: any = await adapter.validateAccount('super-secret-pat').catch((e: unknown) => e as Error & { code: string });
    expect(error).toMatchObject({ code });
    expect(error.message).not.toContain('super-secret-pat');
  });
});
