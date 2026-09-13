import { GithubService } from '../src/integrations/github.service';
import { GithubApiError } from '../src/integrations/github.adapter';

describe('GithubService', () => {
  function setup() {
    const prisma: any = {
      workspaceMember: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      integrationConnection: { findUnique: jest.fn().mockResolvedValue({ id: 'conn' }), findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'conn' }) },
      integrationSource: { upsert: jest.fn().mockResolvedValue({ id: 'source' }) },
      integrationCandidate: { upsert: jest.fn().mockResolvedValue({ id: 'candidate', externalId: 'github:acme/repo:docs/a.md', title: 'a.md', status: 'PENDING' }) },
    };
    const integrations: any = { activeCredentials: jest.fn().mockResolvedValue({ token: 'secret-token' }) };
    const github: any = { validateAccount: jest.fn().mockResolvedValue({ login: 'acme', id: 1 }), listRepositories: jest.fn().mockResolvedValue([]), readSource: jest.fn().mockResolvedValue({ title: 'a.md', content: 'content' }) };
    return { service: new GithubService(prisma, integrations, github), prisma, integrations, github };
  }
  it('imports explicit files as revisable, idempotent candidates', async () => {
    const { service, prisma, github } = setup();
    const selection = { owner: 'acme', repository: 'repo', path: 'docs/a.md' };
    await expect(service.importSources('u', 'w', [selection])).resolves.toMatchObject({ imported: [{ status: 'PENDING' }], failed: [] });
    await service.importSources('u', 'w', [selection]);
    expect(github.readSource).toHaveBeenCalledTimes(2);
    expect(prisma.integrationCandidate.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.integrationCandidate.upsert.mock.calls[0][0].create.content).not.toHaveProperty('token');
  });
  it('reports removed files without creating a canonical requirement', async () => {
    const { service, prisma, github } = setup(); github.readSource.mockRejectedValue(new GithubApiError('NOT_FOUND', 404, 'gone'));
    await expect(service.importSources('u', 'w', [{ owner: 'acme', repository: 'repo', path: 'gone.md' }])).resolves.toMatchObject({ imported: [], failed: [{ reason: 'SOURCE_REMOVED_OR_INACCESSIBLE' }] });
    expect(prisma.integrationCandidate.upsert).not.toHaveBeenCalled();
  });
});
